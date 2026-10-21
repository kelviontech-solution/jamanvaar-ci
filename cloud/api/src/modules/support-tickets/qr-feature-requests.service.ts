import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { permissionsForRole, PlatformRoleName } from '../../common/rbac/access';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { QR_CAPABILITIES, QrCapability } from '../application-entitlements/qr-capabilities';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A support request identifies the feature; entitlement rows remain the source of access. */
@Injectable()
export class QrFeatureRequestsService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: ApplicationEntitlementsService, private readonly audit: AuditService) {}

  private async inspect(tx: Prisma.TransactionClient, ticketId: string) {
    const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId }, include: { events: true, restaurant: { select: { name: true } } } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.restaurantId || ticket.source !== 'RESTAURANT' || ticket.category !== 'FEATURE_REQUEST') return null;
    let code: unknown = ticket.events.find(e => e.type === 'QR_FEATURE_REQUESTED')?.toValue;
    // Older QR requests recorded their code in the server audit, not a structured ticket event.
    // Never infer a grant from a subject, owner-supplied note or other editable ticket text.
    if (!code) {
      const audit = await tx.auditLog.findFirst({ where: { restaurantId: ticket.restaurantId, action: 'SUPPORT_TICKET_CREATED', details: { path: ['ticketId'], equals: ticketId } }, orderBy: { createdAt: 'asc' } });
      code = record(audit?.details).featureCode;
    }
    if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(QR_CAPABILITIES, code)) return null;
    const featureCode = code as QrCapability;
    const feature = await tx.feature.findUnique({ where: { code }, select: { name: true } });
    const restaurantId = ticket.restaurantId;
    const capability = await this.entitlements.resolveQrCapability(tx, restaurantId, featureCode);
    const base = await this.entitlements.resolve(tx, restaurantId, 'QR_ORDERING');
    const branches = await tx.branch.findMany({ where: { restaurantId, status: 'ACTIVE' }, select: { id: true, name: true } });
    // Inspect explicit restrictions before granting, without resolving every subscription once per branch.
    const licenses = await tx.branchProductLicense.findMany({ where: { restaurantId, appCode: 'QR_ORDERING', cancelledAt: null, effectiveAt: { lte: new Date() } }, orderBy: [{ effectiveAt: 'desc' }, { revision: 'desc' }] });
    const branchStatus = branches.map(branch => {
      const license = licenses.find(row => row.branchId === branch.id);
      const productRestricted = !!license && (!license.enabled || !!license.expiresAt && license.expiresAt <= new Date());
      const featureRestricted = license?.disabledFeatures.includes(capability.entitlementKey) ?? false;
      return { ...branch, restricted: !base.enabled || productRestricted || featureRestricted, reason: !base.enabled ? base.reason : productRestricted ? 'BRANCH_PRODUCT_DISABLED' : featureRestricted ? 'NOT_INCLUDED' : 'OK' };
    });
    const closed = ['RESOLVED', 'CLOSED'].includes(ticket.status);
    const requestedBranch = branchStatus.find(b => b.id === ticket.branchId);
    const branchBlocked = !!ticket.branchId && (!requestedBranch || requestedBranch.restricted);
    const blockedReason = !base.enabled ? 'QR Ordering must be active for this restaurant before this feature can be granted.' : branchBlocked ? 'The requesting branch restricts this feature or QR Ordering. Review Branch access first.' : capability.enabled ? null : capability.reason !== 'NOT_INCLUDED'
      ? capability.reason === 'PRODUCT_UNAVAILABLE' ? 'This feature is disabled or outside its platform rollout. Review the feature catalog first.' : 'QR Ordering must be active for this restaurant before this feature can be granted.'
      : closed ? 'Reopen this ticket before enabling the requested feature.'
      : null;
    return { ticket, featureCode, restaurantId, capability, preview: { featureCode, featureName: feature?.name ?? code, restaurantName: ticket.restaurant?.name ?? 'Restaurant', restaurantId, branchId: ticket.branchId, enabled: capability.enabled && (!ticket.branchId || !!requestedBranch && !requestedBranch.restricted), canGrant: !capability.enabled && !blockedReason, blockedReason, planName: capability.planName, validUntil: base.validUntil, branches: branchStatus } };
  }

  preview(ticketId: string) { return this.prisma.runAsPlatform(async tx => (await this.inspect(tx, ticketId))?.preview ?? null); }

  async grant(ticketId: string, expectedFeatureCode: string, actor: PlatformUser) {
    const permissions = permissionsForRole(actor.role as PlatformRoleName);
    if (permissions.support !== 'write' || permissions.subscriptions !== 'write') throw new ForbiddenException('Support and subscription management permission are required to grant a feature.');
    return this.prisma.runAsPlatform(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ticket-feature:' + ticketId}))`;
      const initial = await this.inspect(tx, ticketId);
      if (!initial || initial.featureCode !== expectedFeatureCode) throw new BadRequestException('This ticket does not contain that verified QR feature request.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-grants:' + initial.restaurantId}))`;
      const request = (await this.inspect(tx, ticketId))!;
      if (request.preview.enabled) return { ...request.preview, alreadyEnabled: true };
      if (!request.preview.canGrant) throw new ConflictException(request.preview.blockedReason ?? 'This feature is not available for the requesting branch.');
      const rows = await tx.applicationEntitlement.findMany({ where: { restaurantId: request.restaurantId, appCode: 'QR_ORDERING', enabled: true, subscription: { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] }, expiresAt: { gt: new Date() } } } });
      if (!rows.length) throw new ConflictException('No active QR subscription is available.');
      for (const row of rows) await this.entitlements.update(row.subscriptionId, 'QR_ORDERING', { config: { ...record(row.config), [request.capability.entitlementKey]: true } }, actor, tx);
      const after = (await this.inspect(tx, ticketId))!;
      if (!after.preview.enabled) throw new ConflictException('Access changed while granting this feature. Review the restaurant and branch access again.');
      await tx.ticketEvent.createMany({ data: [
        { ticketId, type: 'QR_FEATURE_GRANTED', actorName: actor.fullName, toValue: request.featureCode },
        { ticketId, type: 'STATUS', actorName: actor.fullName, fromValue: request.ticket.status, toValue: 'RESOLVED' }
      ] });
      await tx.ticketComment.create({ data: { ticketId, authorId: actor.id, authorName: actor.fullName, body: `${after.preview.featureName} access has been enabled for this restaurant on its current QR subscription. Branch restrictions remain in effect. In QR Admin, check access again or reopen the feature, then configure it before use.` } });
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, restaurantId: request.restaurantId, action: 'QR_FEATURE_REQUEST_GRANTED', category: 'SAAS', details: { ticketId, featureCode: request.featureCode, subscriptionIds: rows.map(r => r.subscriptionId) } }, tx);
      return { ...after.preview, alreadyEnabled: false };
    });
  }
}

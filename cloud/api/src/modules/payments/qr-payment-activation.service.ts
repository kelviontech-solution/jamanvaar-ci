import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, PlatformUser, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { permissionsForRole, PlatformRoleName } from '../../common/rbac/access';
import { requireStepUpPassword } from '../../common/security/step-up.util';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { PlatformNotificationsService } from '../platform-notifications/platform-notifications.service';
import { lockSettlement } from './settlement-lock.util';
import { QR_COMMISSION_BPS } from './commission.util';

@Injectable()
export class QrPaymentActivationService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly audit: AuditService, private readonly access: ApplicationEntitlementsService, private readonly notifications: PlatformNotificationsService) {}

  gatewayReady() { return ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'].every(key => !!this.config.get<string>(key)?.trim()); }

  pending(restaurantId: string) {
    return this.prisma.runAsPlatform(tx => tx.supportTicket.findFirst({ where: { restaurantId, category: 'PAYMENTS', source: 'RESTAURANT', status: { in: ['OPEN', 'IN_PROGRESS'] }, events: { some: { type: 'QR_PAYMENT_ACTIVATION_REQUEST' } } }, select: { id: true, number: true, status: true }, orderBy: { createdAt: 'desc' } }));
  }

  async request(device: Device) {
    const actorId = (device as Device & { adminActorId?: string }).adminActorId;
    const result = await this.prisma.runAsPlatform(async tx => {
      const owner = actorId ? await tx.user.findFirst({ where: { id: actorId, restaurantId: device.restaurantId, role: 'OWNER', status: 'ACTIVE' } }) : null;
      if (device.type !== 'POS_ADMIN' || !owner) throw new ForbiddenException('The restaurant owner must sign in to request online payment activation and accept the 2% commission.');
      const entitlement = await this.access.resolve(tx, device.restaurantId, 'QR_ORDERING', device.branchId);
      if (!entitlement.enabled) throw new ForbiddenException('QR Ordering must be active before requesting online payments.');
      await lockSettlement(tx, device.restaurantId);
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId: device.restaurantId } });
      const existing = await tx.supportTicket.findFirst({ where: { restaurantId: device.restaurantId, category: 'PAYMENTS', source: 'RESTAURANT', events: { some: { type: 'QR_PAYMENT_ACTIVATION_REQUEST' } }, OR: [{ status: { in: ['OPEN', 'IN_PROGRESS'] } }, ...(connection?.status === 'ACTIVE' && this.gatewayReady() && entitlement.limits.qrOnlinePayments !== false ? [{ events: { some: { type: 'QR_PAYMENTS_ACTIVATED' } } }] : [])] }, orderBy: { createdAt: 'desc' } });
      if (existing) return { ticket: existing, created: false };
      const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: device.restaurantId }, select: { name: true } });
      if (!connection || ['NOT_CONNECTED', 'DISCONNECTED'].includes(connection.status)) await tx.restaurantPaymentConnection.upsert({ where: { restaurantId: device.restaurantId }, create: { restaurantId: device.restaurantId, status: 'PENDING_VERIFICATION' }, update: { status: 'PENDING_VERIFICATION' } });
      const ticket = await tx.supportTicket.create({ data: { restaurantId: device.restaurantId, branchId: device.branchId, source: 'RESTAURANT', category: 'PAYMENTS', priority: 'MEDIUM', slaDueAt: new Date(Date.now() + 72 * 3600000), subject: `Enable QR online payments for ${restaurant.name}`, description: 'The owner requests QR online payment collection through Jamanvaar and accepts a 2% commission deducted from new QR online collections. Review QR payment access and collection approval. Restaurant payouts continue through the verified-bank payout process.', raisedByUserId: owner.id, raisedByName: owner.fullName, raisedByEmail: owner.email } });
      await tx.ticketEvent.createMany({ data: [{ ticketId: ticket.id, type: 'CREATED', actorType: 'RESTAURANT', actorName: owner.fullName, toValue: 'OPEN' }, { ticketId: ticket.id, type: 'QR_PAYMENT_ACTIVATION_REQUEST', actorType: 'RESTAURANT', actorName: owner.fullName, toValue: String(QR_COMMISSION_BPS) }] });
      await this.audit.log({ actorType: 'TENANT', actorId: owner.id, restaurantId: device.restaurantId, action: 'QR_PAYMENT_ACTIVATION_REQUESTED', category: 'PAYMENTS', details: { ticketId: ticket.id, commissionBps: QR_COMMISSION_BPS, branchId: device.branchId } }, tx);
      return { ticket, created: true };
    });
    if (result.created) await this.notifications.notify({ type: 'TICKET_CREATED', severity: 'INFO', title: result.ticket.subject, body: 'QR online payment activation requested · 2% commission acknowledged by the owner', restaurantId: device.restaurantId, targetType: 'ticket', targetId: result.ticket.id, link: `/tickets?open=${result.ticket.id}`, dedupeKey: `ticket-created:${result.ticket.id}` });
    return { ticketId: result.ticket.id, ticketNumber: result.ticket.number, commissionBps: QR_COMMISSION_BPS };
  }

  private async inspect(tx: Prisma.TransactionClient, ticketId: string) {
    const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId }, include: { restaurant: { select: { name: true } }, events: true } });
    if (!ticket?.restaurantId || ticket.category !== 'PAYMENTS' || ticket.source !== 'RESTAURANT' || !ticket.events.some(e => e.type === 'QR_PAYMENT_ACTIVATION_REQUEST' && e.toValue === String(QR_COMMISSION_BPS))) return null;
    const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId: ticket.restaurantId } });
    const entitlement = await this.access.resolve(tx, ticket.restaurantId, 'QR_ORDERING', ticket.branchId);
    const approved = ticket.events.some(e => e.type === 'QR_PAYMENTS_ACTIVATED');
    const blockedReason = !entitlement.enabled || entitlement.limits.qrOnlinePayments === false ? 'QR online payment is not included for the requesting branch. Review Products & access first.' : !this.gatewayReady() ? 'Secure payment collection is not configured on the platform server. Complete gateway setup first.' : !connection || !['PENDING_VERIFICATION', 'ACTIVE'].includes(connection.status) ? 'Review the suspended or disconnected payment connection before approving this request.' : ['RESOLVED', 'CLOSED'].includes(ticket.status) && !approved ? 'Reopen this request before approving it.' : null;
    return { ticket, connection, preview: { restaurantId: ticket.restaurantId, restaurantName: ticket.restaurant?.name, commissionBps: QR_COMMISSION_BPS, collectionStatus: connection?.status ?? 'NOT_CONNECTED', bankVerificationStatus: connection?.bankVerificationStatus ?? 'PENDING', gatewayReady: this.gatewayReady(), approved, canApprove: !approved && !blockedReason, blockedReason, payoutMode: 'MANUAL' } };
  }

  preview(ticketId: string) { return this.prisma.runAsPlatform(async tx => (await this.inspect(tx, ticketId))?.preview ?? null); }

  async approve(ticketId: string, actor: PlatformUser, password?: string) {
    const permissions = permissionsForRole(actor.role as PlatformRoleName);
    if (permissions.support !== 'write' || permissions.billing !== 'write') throw new ForbiddenException('Support and payment-management permission are required.');
    await requireStepUpPassword(actor, password);
    return this.prisma.runAsPlatform(async tx => {
      const first = await this.inspect(tx, ticketId);
      if (!first) throw new BadRequestException('This is not a verified QR payment activation request.');
      await lockSettlement(tx, first.ticket.restaurantId!);
      const request = (await this.inspect(tx, ticketId))!;
      if (request.preview.approved) return request.preview;
      if (!request.preview.canApprove) throw new ConflictException(request.preview.blockedReason!);
      await tx.restaurantPaymentConnection.update({ where: { restaurantId: request.ticket.restaurantId! }, data: { status: 'ACTIVE', verifiedAt: new Date() } });
      await tx.ticketEvent.createMany({ data: [{ ticketId, type: 'QR_PAYMENTS_ACTIVATED', actorName: actor.fullName, toValue: 'ACTIVE' }, { ticketId, type: 'STATUS', actorName: actor.fullName, fromValue: request.ticket.status, toValue: 'RESOLVED' }] });
      await tx.ticketComment.create({ data: { ticketId, authorId: actor.id, authorName: actor.fullName, body: 'QR payment collection is approved. New QR online payments carry a 2% Jamanvaar commission. In QR Admin, check payment status and turn Online payment on. Restaurant bank verification and payouts remain separate.' } });
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, restaurantId: request.ticket.restaurantId!, action: 'QR_PAYMENT_ACTIVATION_APPROVED', category: 'PAYMENTS', details: { ticketId, commissionBps: QR_COMMISSION_BPS } }, tx);
      return (await this.inspect(tx, ticketId))!.preview;
    });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppCode, PlatformUser, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService, ALL_APP_CODES } from './application-entitlements.service';
import { stableJson } from '../operations/operations-records';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
export interface BranchLicenseInput {
  appCode: AppCode;
  enabled: boolean;
  deviceQuota: number | null;
  disabledFeatures: string[];
  effectiveAt: string;
  expiresAt: string | null;
  expectedRevision: number;
  acknowledgeImpact?: boolean;
  previewHash?: string;
}
@Injectable()
export class BranchLicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly audit: AuditService,
    private readonly bus: RealtimeBus
  ) {}
  private writeActor(actor: PlatformUser) {
    if (!['PLATFORM_OWNER', 'SUPER_ADMIN'].includes(actor.role))
      throw new ForbiddenException('Only platform owners and super administrators allocate branch products');
  }
  private async inspect(tx: Prisma.TransactionClient, branchId: string, input?: BranchLicenseInput) {
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    const rows = await tx.branchProductLicense.findMany({ where: { restaurantId: branch.restaurantId, branchId }, orderBy: { revision: 'desc' } });
    const apps = await Promise.all(
      ALL_APP_CODES.map(async (appCode) => ({
        ...(await this.entitlements.resolve(tx, branch.restaurantId, appCode, branchId)),
        revision: rows.filter((r) => r.appCode === appCode)[0]?.revision ?? 0
      }))
    );
    const devices = await tx.device.findMany({
      where: { restaurantId: branch.restaurantId, branchId, status: 'ACTIVE' },
      select: { id: true, type: true, name: true, lastSeenAt: true, pendingSyncCount: true }
    });
    const features = await tx.feature.findMany({
      where: { isActive: true, legacyEntitlementKey: { not: null } },
      select: { code: true, name: true, appCode: true, legacyEntitlementKey: true }
    });
    if (!input) return { branch, apps, history: rows, devices, features };
    const purchased = await this.entitlements.resolve(tx, branch.restaurantId, input.appCode);
    if (input.enabled && !purchased.enabled) throw new BadRequestException('This product must first be included in an active restaurant subscription');
    if (input.disabledFeatures.some((key) => !features.some((f) => f.legacyEntitlementKey === key && f.appCode === input.appCode)))
      throw new BadRequestException('Choose feature flags belonging to this product');
    const revision = rows.find((r) => r.appCode === input.appCode)?.revision ?? 0;
    if (revision !== input.expectedRevision) throw new ConflictException('Branch licensing changed; refresh and preview again');
    const when = Date.parse(input.effectiveAt);
    if (!Number.isFinite(when) || when < Date.now() - 60000 || when > Date.now() + 366 * 86400000)
      throw new BadRequestException('Choose an effective time from now to one year ahead');
    if (input.expiresAt && Date.parse(input.expiresAt) <= when) throw new BadRequestException('Expiry must follow the effective time');
    const matching = devices.filter((d) => d.type === input.appCode || (d.type === 'POS_ADMIN' && ['KIOSK_ADMIN', 'QR_ORDERING'].includes(input.appCode)));
    const open = await tx.syncedOrder.count({
      where: { restaurantId: branch.restaurantId, branchId, status: { notIn: ['COMPLETED', 'SERVED', 'CANCELLED', 'VOID', 'VOIDED', 'REFUNDED'] } }
    });
    const affected = !input.enabled ? matching : input.deviceQuota !== null && matching.length > input.deviceQuota ? matching : [];
    const impact = {
      activeDevices: matching.length,
      affectedDevices: affected,
      pendingOrders: open,
      quotaWarning:
        input.deviceQuota !== null && matching.length > input.deviceQuota
          ? 'Existing devices remain registered; additional activation is blocked until usage falls below quota.'
          : null
    };
    const canonical = {
      ...input,
      previewHash: undefined,
      acknowledgeImpact: undefined,
      impact: { ...impact, affectedDevices: affected.map(({ lastSeenAt, ...d }) => d) }
    };
    return { branch, revision, impact, previewHash: createHash('sha256').update(stableJson(canonical)!).digest('hex') };
  }
  list(branchId: string) {
    return this.prisma.runAsPlatform((tx) => this.inspect(tx, branchId));
  }
  preview(branchId: string, input: BranchLicenseInput, actor: PlatformUser) {
    this.writeActor(actor);
    return this.prisma.runAsPlatform((tx) => this.inspect(tx, branchId, input));
  }
  async save(branchId: string, input: BranchLicenseInput, actor: PlatformUser) {
    this.writeActor(actor);
    const saved = await this.prisma.runAsPlatform(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'branch-license:' + branchId + ':' + input.appCode}))`;
      const preview = await this.inspect(tx, branchId, input);
      if (!('impact' in preview) || !preview.impact) throw new BadRequestException('Preview first');
      if (!input.acknowledgeImpact || input.previewHash !== preview.previewHash)
        throw new ConflictException('Review the current affected devices and orders before applying');
      const row = await tx.branchProductLicense.create({
        data: {
          restaurantId: preview.branch.restaurantId,
          branchId,
          appCode: input.appCode,
          enabled: input.enabled,
          deviceQuota: input.deviceQuota,
          disabledFeatures: input.disabledFeatures,
          effectiveAt: new Date(input.effectiveAt),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          revision: preview.revision! + 1,
          createdBy: actor.id
        }
      });
      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: row.restaurantId,
          category: 'LICENSING',
          action: 'BRANCH_PRODUCT_ALLOCATED',
          details: {
            branchId,
            appCode: input.appCode,
            enabled: input.enabled,
            deviceQuota: input.deviceQuota,
            effectiveAt: input.effectiveAt,
            revision: row.revision
          }
        },
        tx
      );
      return row;
    });
    this.bus.publishInvalidation(saved.restaurantId);
    return saved;
  }
  async cancel(branchId: string, id: string, actor: PlatformUser) {
    this.writeActor(actor);
    const row = await this.prisma.runAsPlatform(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'branch-license-cancel:' + branchId + ':' + id}))`;
      const row = await tx.branchProductLicense.findFirst({ where: { id, branchId, cancelledAt: null } });
      if (!row) throw new NotFoundException('Allocation not found');
      if (row.effectiveAt <= new Date())
        throw new ConflictException('A live allocation needs a reviewed replacement; only future allocations can be cancelled');
      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: row.restaurantId,
          category: 'LICENSING',
          action: 'BRANCH_PRODUCT_SCHEDULE_CANCELLED',
          details: { branchId, id }
        },
        tx
      );
      return tx.branchProductLicense.update({ where: { id }, data: { cancelledAt: new Date() } });
    });
    this.bus.publishInvalidation(row.restaurantId);
    return { cancelled: true };
  }
}

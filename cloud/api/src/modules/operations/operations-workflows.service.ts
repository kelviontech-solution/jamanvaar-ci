import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Device } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OperationsService, type OpsScope } from './operations.service';
import { StaffSessionService, type RefundApprovalScope } from '../entity-sync/staff-session.service';
import { AuditService } from '../audit/audit.service';
import { ActivationKeysService } from '../activation-keys/activation-keys.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { DEFAULT_SERVICE_POLICY } from './operations-policy';

@Injectable()
export class OperationsWorkflows {
  constructor(
    private readonly ops: OperationsService,
    private readonly sessions: StaffSessionService,
    private readonly keys: ActivationKeysService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeBus,
  ) {}
  private async activeStaff(device: Device, token: string) {
    const staff = this.sessions.verify(token, device.restaurantId, device.id, 'session');
    if (!staff || staff.exp < Date.now() || !device.branchId)
      throw new ForbiddenException('Sign in online before requesting remote approval');
    const row = await this.ops.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.syncedEntity.findUnique({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: device.restaurantId,
            entityType: 'STAFF_USER',
            externalId: staff.sid,
          },
        },
      }),
    );
    const p = row?.payload as any;
    if (
      !p ||
      p.deleted ||
      p.isActive === false ||
      p.branchId !== device.branchId ||
      p.roleId !== staff.role ||
      (p.sessionsRevokedAt && Date.parse(p.sessionsRevokedAt) > staff.iat)
    )
      throw new ForbiddenException('This staff session is no longer valid in this branch');
    return staff;
  }
  async compare(s: OpsScope, sourceBranchId: string) {
    if (s.role !== 'OWNER') throw new ForbiddenException('Only owners compare branches');
    const source = await this.ops.prisma.runAsTenant(s.restaurantId, (tx) =>
      tx.branch.findFirst({
        where: { restaurantId: s.restaurantId, id: sourceBranchId, status: 'ACTIVE' },
        select: { id: true, name: true },
      }),
    );
    if (!source) throw new NotFoundException('Source branch unavailable');
    const a = await this.ops.service({ ...s, branchId: sourceBranchId }),
      b = await this.ops.service(s);
    const fields = ['hours', 'maxPendingOrders', 'preparationMinutes', 'channels'] as const;
    return {
      source,
      target: { id: s.branchId },
      sourceVersion: a.version,
      targetVersion: b.version,
      fields: fields.map((field) => ({
        field,
        source: a.data[field],
        target: b.data[field],
        changed: JSON.stringify(a.data[field]) !== JSON.stringify(b.data[field]),
      })),
    };
  }
  async copy(
    s: OpsScope,
    input: { sourceBranchId: string; fields: string[]; sourceVersion: number; targetVersion: number },
  ) {
    const comparison = await this.compare(s, input.sourceBranchId);
    if (comparison.sourceVersion !== input.sourceVersion || comparison.targetVersion !== input.targetVersion)
      throw new ConflictException('A branch changed since preview. Compare again.');
    const patch = Object.fromEntries(
      comparison.fields.filter((f) => input.fields.includes(f.field)).map((f) => [f.field, f.source]),
    );
    if (!Object.keys(patch).length || Object.keys(patch).length !== new Set(input.fields).size)
      throw new BadRequestException('Select supported fields from the comparison');
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + s.restaurantId}))`;
      const find = (branch: string) =>
        tx.syncedEntity.findUnique({
          where: {
            restaurantId_entityType_externalId: {
              restaurantId: s.restaurantId,
              entityType: 'OPS_SERVICE',
              externalId: branch,
            },
          },
        });
      const [source, target] = await Promise.all([find(input.sourceBranchId), find(s.branchId)]);
      if (
        (source?.syncVersion ?? 0) !== input.sourceVersion ||
        (target?.syncVersion ?? 0) !== input.targetVersion
      )
        throw new ConflictException('A branch changed since preview. Compare again.');
      const payload = {
        ...DEFAULT_SERVICE_POLICY,
        ...((target?.payload as object) ?? {}),
        ...patch,
        branchId: s.branchId,
        updatedAt: new Date().toISOString(),
        updatedBy: s.userId,
      };
      const saved = await tx.syncedEntity.upsert({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: s.restaurantId,
            entityType: 'OPS_SERVICE',
            externalId: s.branchId,
          },
        },
        create: { restaurantId: s.restaurantId, entityType: 'OPS_SERVICE', externalId: s.branchId, payload },
        update: { payload, syncVersion: { increment: 1 } },
      });
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: s.userId,
          restaurantId: s.restaurantId,
          category: 'OPERATIONS',
          action: 'BRANCH_SERVICE_COPIED',
          details: {
            sourceBranchId: input.sourceBranchId,
            branchId: s.branchId,
            fields: input.fields,
            version: saved.syncVersion,
          },
        },
        tx,
      );
      return { version: saved.syncVersion, data: saved.payload };
    });
  }
  async requestApproval(
    device: Device,
    input: {
      action: 'REFUND' | 'HIGH_DISCOUNT';
      details: string;
      fingerprint: string;
      staffToken: string;
      scope?: RefundApprovalScope;
    },
  ) {
    if (device.type !== 'POS' || !device.branchId)
      throw new ForbiddenException('A branch POS terminal is required');
    const staff = await this.activeStaff(device, input.staffToken);
    if (input.action === 'REFUND' && !input.scope)
      throw new BadRequestException('Refund approval requires an exact payment, amount and retry key');
    if (input.action !== 'REFUND' && input.scope)
      throw new BadRequestException('Only a refund request may carry a refund scope');
    if (input.scope) {
      const payment = await this.ops.prisma.runAsTenant(device.restaurantId, (tx) =>
        tx.paymentTransaction.findFirst({
          where: { id: input.scope!.paymentId, restaurantId: device.restaurantId },
          include: { order: true },
        }),
      );
      if (!payment || payment.order.branchId !== device.branchId || input.scope.amountPaise > payment.amount)
        throw new BadRequestException('Refund scope is not valid for this branch');
    }
    const s: OpsScope = {
        restaurantId: device.restaurantId,
        branchId: device.branchId,
        userId: staff.sid,
        role: 'MANAGER',
        apps: [],
        timezone: 'UTC',
      },
      id = randomUUID();
    return this.ops.write(
      s,
      'OPS_APPROVAL',
      id,
      {
        id,
        deviceId: device.id,
        staffId: staff.sid,
        requestedBy: staff.name,
        action: input.action,
        details: input.details,
        fingerprint: input.fingerprint,
        scope: input.scope ?? null,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
      },
      0,
      'REMOTE_APPROVAL_REQUESTED',
    );
  }
  async decide(
    s: OpsScope,
    id: string,
    input: { expectedVersion: number; approved: boolean; reason: string },
  ) {
    const row = await this.ops.read(s, 'OPS_APPROVAL', id);
    if (!row.data || row.data.branchId !== s.branchId)
      throw new NotFoundException('Approval request not found');
    if (row.data.status !== 'PENDING' || Date.parse(row.data.expiresAt) < Date.now())
      throw new ConflictException('This request is no longer pending');
    if (row.data.staffId === s.userId)
      throw new ForbiddenException('Another authorized manager must approve this request');
    return this.ops.write(
      s,
      'OPS_APPROVAL',
      id,
      {
        ...row.data,
        status: input.approved ? 'APPROVED' : 'REJECTED',
        reason: input.reason,
        approvedBy: s.userId,
        decisionAt: new Date().toISOString(),
      },
      input.expectedVersion,
      'REMOTE_APPROVAL_DECIDED',
    );
  }
  async claim(device: Device, id: string, input: { staffToken: string; fingerprint: string }) {
    const staff = await this.activeStaff(device, input.staffToken);
    return this.ops.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ops-approval:' + id}))`;
      const liveStaff=await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId:device.restaurantId,entityType:'STAFF_USER',externalId:staff.sid}}});
      const currentStaff=liveStaff?.payload as any;
      if(!currentStaff||currentStaff.deleted||currentStaff.isActive===false||currentStaff.branchId!==device.branchId||currentStaff.roleId!==staff.role||(currentStaff.sessionsRevokedAt&&Date.parse(currentStaff.sessionsRevokedAt)>staff.iat))throw new ForbiddenException('Staff access changed while waiting for approval. Sign in again.');
      const row = await tx.syncedEntity.findUnique({
          where: {
            restaurantId_entityType_externalId: {
              restaurantId: device.restaurantId,
              entityType: 'OPS_APPROVAL',
              externalId: id,
            },
          },
        }),
        p = row?.payload as any;
      if (
        !p ||
        p.deviceId !== device.id ||
        p.staffId !== staff.sid ||
        p.branchId !== device.branchId ||
        p.fingerprint !== input.fingerprint
      )
        throw new NotFoundException('Approval request not found');
      if (Date.parse(p.expiresAt) < Date.now()) return { status: 'EXPIRED' };
      if (p.status !== 'APPROVED') return { status: p.status };
      const manager = await tx.user.findFirst({
        where: {
          id: p.approvedBy,
          restaurantId: device.restaurantId,
          status: 'ACTIVE',
          OR: [{ role: 'OWNER' }, { role: 'MANAGER', branchId: device.branchId }],
        },
      });
      if (!manager) throw new ForbiddenException('The approving manager no longer has access');
      await tx.syncedEntity.update({
        where: { id: row!.id },
        data: {
          payload: { ...p, status: 'CLAIMED', claimedAt: new Date().toISOString() },
          syncVersion: { increment: 1 },
        },
      });
      // Only exact refund scopes produce a privileged server token. A discount decision
      // authorizes its waiting local action; it cannot be reused as general manager proof.
      const approval = p.scope
        ? this.sessions.issue('approval', {
            restaurantId: device.restaurantId,
            deviceId: device.id,
            staffId: manager.id,
            role: 'role-manager',
            name: manager.fullName,
            scope: p.scope,
          })
        : null;
      return {
        status: 'APPROVED',
        managerName: manager.fullName,
        ...(approval
          ? { approvalToken: approval.token, approvalExpiresAt: approval.expiresAt, scope: p.scope }
          : {}),
      };
    });
  }
  async transferPreview(
    s: OpsScope,
    input: { kind: 'STAFF' | 'DEVICE'; id: string; targetBranchId: string },
  ) {
    if (s.role !== 'OWNER') throw new ForbiddenException('Only owners transfer staff or replace devices');
    const target = await this.ops.prisma.runAsTenant(s.restaurantId, (tx) =>
      tx.branch.findFirst({
        where: { id: input.targetBranchId, restaurantId: s.restaurantId, status: 'ACTIVE' },
        select: { id: true, name: true },
      }),
    );
    if (!target || target.id === s.branchId)
      throw new BadRequestException('Choose a different active branch');
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      if (input.kind === 'DEVICE') {
        const device = await tx.device.findFirst({
          where: { id: input.id, restaurantId: s.restaurantId, branchId: s.branchId, status: 'ACTIVE' },
        });
        if (!device || !['POS', 'CAPTAIN', 'KDS', 'KIOSK'].includes(device.type))
          throw new NotFoundException('Operational device not found');
        const open = await tx.syncedOrder.count({
          where: {
            restaurantId: s.restaurantId,
            deviceId: device.id,
            status: { notIn: ['COMPLETED', 'SERVED', 'CANCELLED', 'VOID', 'REFUNDED'] },
          },
        });
        return {
          kind: input.kind,
          id: device.id,
          name: device.name ?? device.type,
          target,
          blocking: open > 0 || device.pendingSyncCount > 0 || deviceHealthSafe(device.lastSeenAt),
          openOrders: open,
          pendingSync: device.pendingSyncCount,
          explanation:
            'Finish open orders and sync the old terminal. Replacement uses a new branch-bound activation and revokes the old identity when redeemed.',
        };
      }
      const staff = await tx.syncedEntity.findUnique({
          where: {
            restaurantId_entityType_externalId: {
              restaurantId: s.restaurantId,
              entityType: 'STAFF_USER',
              externalId: input.id,
            },
          },
        }),
        p = staff?.payload as any;
      if (!staff || p?.branchId !== s.branchId || p.deleted || p.isActive === false)
        throw new NotFoundException('Staff member not found');
      const tableRows = await tx.syncedEntity.findMany({
        where: {
          restaurantId: s.restaurantId,
          entityType: 'DINING_TABLE',
          AND: [
            { payload: { path: ['branchId'], equals: s.branchId } },
            { payload: { path: ['openedById'], equals: input.id } },
          ],
        },
        select: { payload: true },
      });
      const tables = tableRows.filter((r) => {
        const t = r.payload as any;
        return !t.deleted && t.isActive !== false && (t.currentOrderId || t.status !== 'AVAILABLE');
      }).length;
      return {
        kind: input.kind,
        id: input.id,
        name: p.fullName,
        target,
        blocking: tables > 0,
        openTables: tables,
        version: staff.syncVersion,
        explanation:
          'Hand over active tables first. The staff record is reassigned to the target branch and existing staff sessions must be renewed.',
      };
    });
  }
  async transfer(
    s: OpsScope,
    input: {
      kind: 'STAFF' | 'DEVICE';
      id: string;
      targetBranchId: string;
      expectedVersion?: number;
      acknowledge: boolean;
    },
  ) {
    const preview = await this.transferPreview(s, input);
    if (!input.acknowledge || preview.blocking)
      throw new ConflictException('Finish the blocking work and acknowledge the transfer');
    if (input.kind === 'DEVICE') {
      // Reuse the existing audited, quota-checked replacement-key flow. The tenant
      // scope above supplies identity; no client-provided platform role is accepted.
      const key = await this.keys.generateForOwner(
        {
          restaurantId: s.restaurantId,
          branchId: input.targetBranchId,
          replacesDeviceId: input.id,
          allowedDeviceType: 'ANY',
          expiresAt: new Date(Date.now() + 3600000),
        },
        s.userId,
      );
      return {
        kind: 'DEVICE',
        activationKey: key.code,
        expiresAt: key.expiresAt,
        message:
          'Enter this one-time key on the replacement terminal. The old identity is revoked on redemption.',
      };
    }
    await this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + s.restaurantId}))`;
      const tables = await tx.syncedEntity.findMany({
        where: {
          restaurantId: s.restaurantId,
          entityType: 'DINING_TABLE',
          AND: [
            { payload: { path: ['branchId'], equals: s.branchId } },
            { payload: { path: ['openedById'], equals: input.id } },
          ],
        },
        select: { payload: true },
      });
      if (
        tables.some((r) => {
          const t = r.payload as any;
          return !t.deleted && t.isActive !== false && (t.currentOrderId || t.status !== 'AVAILABLE');
        })
      )
        throw new ConflictException('A table needs handover. Review again.');
      const row = await tx.syncedEntity.findUniqueOrThrow({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: s.restaurantId,
            entityType: 'STAFF_USER',
            externalId: input.id,
          },
        },
      });
      if (row.syncVersion !== input.expectedVersion)
        throw new ConflictException('Staff record changed. Preview again.');
      const p = row.payload as any;
      if (p.branchId !== s.branchId) throw new ConflictException('Staff member moved already');
      const transferWhere={restaurantId_entityType_externalId:{restaurantId:s.restaurantId,entityType:'OPS_STAFF_TRANSFER',externalId:input.id}};
      const previous=await tx.syncedEntity.findUnique({where:transferWhere});
      const receipt={previousBranches:[...new Set([s.branchId,...((previous?.payload as any)?.previousBranches??[])])],branchId:input.targetBranchId,at:new Date().toISOString()};
      await tx.syncedEntity.upsert({where:transferWhere,create:{restaurantId:s.restaurantId,entityType:'OPS_STAFF_TRANSFER',externalId:input.id,payload:receipt},update:{payload:receipt,syncVersion:{increment:1}}});
      await tx.syncedEntity.update({
        where: { id: row.id },
        data: {
          payload: {
            ...p,
            branchId: input.targetBranchId,
            updatedAt: new Date().toISOString(),
            sessionsRevokedAt: new Date().toISOString(),
          },
          syncVersion: { increment: 1 },
        },
      });
    });
    this.realtime.publish({ restaurantId: s.restaurantId, branchId: null, kind: 'entity:STAFF_USER' });
    await this.audit.log({
      actorType: 'TENANT',
      actorId: s.userId,
      restaurantId: s.restaurantId,
      category: 'OPERATIONS',
      action: 'STAFF_BRANCH_TRANSFERRED',
      details: { staffId: input.id, fromBranchId: s.branchId, toBranchId: input.targetBranchId },
    });
    return { kind: 'STAFF', message: 'Staff moved. Sign in again at the target branch.' };
  }
}
// An offline machine cannot attest that its local queue is empty.
function deviceHealthSafe(lastSeenAt: Date | null) {
  return !lastSeenAt || Date.now() - lastSeenAt.getTime() > 120000;
}

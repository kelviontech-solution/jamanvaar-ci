import { BadRequestException, ConflictException, ForbiddenException, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OperationsService, OpsScope } from './operations.service';
import { MenuPublicationsService } from '../menu-publications/menu-publications.service';
import { buildContent } from '../menu-publications/menu-snapshot';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { enabledConsoleApps } from '../../common/security/admin-product-access';
import { recurringActive, recurringOverlap, RecurringWindow } from './recurring-menu';
export interface RecurringInput extends RecurringWindow {
  title: string;
  changes: { itemId: string; price?: number; isAvailable?: boolean }[];
  reviewedChecksum: string;
}
const types = ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'];
@Injectable()
export class RecurringMenuService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  constructor(
    private readonly ops: OperationsService,
    private readonly menus: MenuPublicationsService,
    private readonly bus: RealtimeBus,
    private readonly config: ConfigService
  ) {}
  onApplicationBootstrap() {
    if (this.config.get('NODE_ENV') !== 'test' && this.config.get('JOBS_DISABLED') !== 'true') {
      this.timer = setInterval(() => void this.runDue().catch(() => undefined), 30000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async create(s: OpsScope, input: RecurringInput) {
    if (s.role !== 'OWNER') throw new ForbiddenException('Owner access is required to publish scheduled menu changes');
    if (input.open >= input.close) throw new BadRequestException('End must follow start on the same day. Split overnight service into two windows.');
    if (new Set(input.changes.map((c) => c.itemId)).size !== input.changes.length) throw new BadRequestException('Choose each dish once');
    const review = await this.ops.menuReview(s);
    if (review.checksum !== input.reviewedChecksum || review.errors.length)
      throw new ConflictException('Refresh and review a valid current menu before scheduling');
    const id = randomUUID();
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + s.restaurantId}))`;
      const reviewed = await tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: { in: types } },
        select: { entityType: true, payload: true }
      });
      if (buildContent(reviewed).checksum !== input.reviewedChecksum)
        throw new ConflictException('The menu changed while the schedule was being reviewed. Review it again.');
      const other = await tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: 'OPS_RECURRING_MENU', payload: { path: ['branchId'], equals: s.branchId } }
      });
      if (
        other.some((r) => {
          const p = r.payload as any;
          return (
            p.status !== 'CANCELLED' &&
            (p.status !== 'FAILED' || p.active) &&
            recurringOverlap(p, input) &&
            p.changes.some((c: any) => input.changes.some((v) => v.itemId === c.itemId))
          );
        })
      )
        throw new ConflictException('Another recurring window changes a selected dish during these hours');
      const rows = await tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: 'MENU_ITEM', externalId: { in: input.changes.map((c) => c.itemId) } }
      });
      if (rows.length !== input.changes.length || rows.some((r) => (r.payload as any).deleted)) throw new BadRequestException('Choose existing dishes');
      const payload = {
        ...input,
        id,
        branchId: s.branchId,
        timezone: s.timezone,
        createdBy: s.userId,
        status: 'SCHEDULED',
        active: false,
        history: [],
        applied: []
      };
      const saved = await tx.syncedEntity.create({
        data: { restaurantId: s.restaurantId, entityType: 'OPS_RECURRING_MENU', externalId: id, payload: payload as any }
      });
      await this.ops.auditAction(
        s,
        'RECURRING_MENU_CREATED',
        { branchId: s.branchId, scheduleId: id, days: input.days, open: input.open, close: input.close, reviewedChecksum: input.reviewedChecksum },
        tx
      );
      return { version: saved.syncVersion, ...payload };
    });
  }
  async cancel(s: OpsScope, id: string, expectedVersion: number) {
    if (s.role !== 'OWNER') throw new ForbiddenException('Owner access required');
    const row = await this.ops.read(s, 'OPS_RECURRING_MENU', id);
    if (!row.data || row.data.branchId !== s.branchId) throw new BadRequestException('Schedule not found');
    return this.ops.write(
      s,
      'OPS_RECURRING_MENU',
      id,
      { ...row.data, status: row.data.active ? 'STOPPING' : 'CANCELLED' },
      expectedVersion,
      'RECURRING_MENU_STOP_REQUESTED'
    );
  }
  async runDue(now = new Date()) {
    if (this.running) return { processed: 0 };
    this.running = true;
    let processed = 0;
    try {
      const rows = await this.ops.prisma.runAsPlatform((tx) =>
        tx.syncedEntity.findMany({
          where: {
            entityType: 'OPS_RECURRING_MENU',
            OR: [{ payload: { path: ['status'], equals: 'SCHEDULED' } }, { payload: { path: ['status'], equals: 'STOPPING' } }]
          },
          take: 500
        })
      );
      for (const row of rows) {
        let publication = 0;
        try {
          publication = await this.ops.prisma.runAsTenant(row.restaurantId, async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + row.restaurantId}))`;
            const current = await tx.syncedEntity.findUniqueOrThrow({ where: { id: row.id } }),
              p = current.payload as any;
            if (['CANCELLED', 'FAILED'].includes(p.status)) return 0;
            const desired = p.status !== 'STOPPING' && recurringActive(p, p.timezone, now);
            if (desired === p.active) return 0;
            const owner = await tx.user.findFirst({ where: { id: p.createdBy, restaurantId: row.restaurantId, role: 'OWNER', status: 'ACTIVE' } });
            if (!owner || !(await enabledConsoleApps(tx, row.restaurantId, p.branchId)).length)
              throw new Error('The owner or branch console license is no longer active');
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + row.restaurantId}))`;
            const draft = await tx.syncedEntity.findMany({
              where: { restaurantId: row.restaurantId, entityType: { in: types } },
              select: { entityType: true, payload: true }
            });
            const built = buildContent(draft),
              checkpoint = await tx.syncedEntity.findUnique({
                where: {
                  restaurantId_entityType_externalId: { restaurantId: row.restaurantId, entityType: 'OPS_MENU_SCHEDULE_BASE', externalId: row.restaurantId }
                }
              });
            if (built.errors.length || (built.checksum !== p.reviewedChecksum && built.checksum !== (checkpoint?.payload as any)?.checksum))
              throw new Error('Menu changed outside reviewed schedules. Review the menu before resuming automatic publication.');
            const applied = [];
            for (const change of p.changes) {
              const externalId = `${p.branchId}:${change.itemId}`,
                where = { restaurantId_entityType_externalId: { restaurantId: row.restaurantId, entityType: 'BRANCH_MENU_OVERRIDE', externalId } },
                old = await tx.syncedEntity.findUnique({ where }),
                before = (old?.payload as any) ?? {};
              const receipt = p.applied.find((a: any) => a.itemId === change.itemId);
              if (!desired && (!receipt || old?.syncVersion !== receipt.version))
                throw new Error('A branch override changed during this window. Review it before restoring normal prices.');
              const payload = desired
                ? {
                    ...before,
                    id: externalId,
                    branchId: p.branchId,
                    itemId: change.itemId,
                    ...(change.price === undefined ? {} : { price: change.price }),
                    ...(change.isAvailable === undefined ? {} : { isAvailable: change.isAvailable })
                  }
                : { ...before };
              if (!desired) {
                for (const field of ['price', 'isAvailable']) {
                  if (receipt.before[field] === undefined || receipt.before[field] === null) delete payload[field];
                  else payload[field] = receipt.before[field];
                }
              }
              const saved = await tx.syncedEntity.upsert({
                where,
                create: { restaurantId: row.restaurantId, entityType: 'BRANCH_MENU_OVERRIDE', externalId, payload },
                update: { payload, syncVersion: { increment: 1 } }
              });
              await tx.syncedEntity.updateMany({
                where: { restaurantId: row.restaurantId, entityType: 'MENU_ITEM', externalId: change.itemId },
                data: { syncVersion: { increment: 1 } }
              });
              if (desired)
                applied.push({
                  itemId: change.itemId,
                  version: saved.syncVersion,
                  before: { price: before.price ?? null, isAvailable: before.isAvailable ?? null }
                });
            }
            const published = await this.menus.publishTx(tx, row.restaurantId, null, `${desired ? 'Start' : 'Restore'} recurring menu: ${p.title}`);
            const after = await tx.syncedEntity.findMany({
                where: { restaurantId: row.restaurantId, entityType: { in: types } },
                select: { entityType: true, payload: true }
              }),
              base = { checksum: buildContent(after).checksum, scheduleId: current.externalId };
            await tx.syncedEntity.upsert({
              where: {
                restaurantId_entityType_externalId: { restaurantId: row.restaurantId, entityType: 'OPS_MENU_SCHEDULE_BASE', externalId: row.restaurantId }
              },
              create: { restaurantId: row.restaurantId, entityType: 'OPS_MENU_SCHEDULE_BASE', externalId: row.restaurantId, payload: base },
              update: { payload: base, syncVersion: { increment: 1 } }
            });
            await tx.syncedEntity.update({
              where: { id: row.id },
              data: {
                payload: {
                  ...p,
                  active: desired,
                  applied,
                  status: p.status === 'STOPPING' ? 'CANCELLED' : 'SCHEDULED',
                  history: [
                    ...(p.history ?? []),
                    { at: now.toISOString(), action: desired ? 'ACTIVATED' : 'RESTORED', menuVersion: published.created.version }
                  ].slice(-100)
                },
                syncVersion: { increment: 1 }
              }
            });
            return published.created.version;
          });
        } catch (e) {
          await this.ops.prisma.runAsTenant(row.restaurantId, async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + row.restaurantId}))`;
            const latest = await tx.syncedEntity.findUniqueOrThrow({ where: { id: row.id } });
            const p = latest.payload as any;
            if (!['CANCELLED', 'FAILED'].includes(p.status))
              await tx.syncedEntity.update({
                where: { id: row.id },
                data: {
                  payload: { ...p, status: 'FAILED', failureReason: e instanceof Error ? e.message : 'Automatic publication stopped for review' },
                  syncVersion: { increment: 1 }
                }
              });
          });
        }
        if (publication) {
          processed++;
          this.bus.publish({ restaurantId: row.restaurantId, branchId: null, kind: 'menu', seq: publication });
          this.bus.publish({ restaurantId: row.restaurantId, branchId: null, kind: 'entity:MENU_ITEM' });
        }
      }
      return { processed };
    } finally {
      this.running = false;
    }
  }
}

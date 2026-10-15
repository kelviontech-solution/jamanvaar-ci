import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { OperationsService, type OpsScope } from './operations.service';
import { MenuPublicationsService } from '../menu-publications/menu-publications.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { enabledConsoleApps } from '../../common/security/admin-product-access';
import { buildContent } from '../menu-publications/menu-snapshot';
import { AuditService } from '../audit/audit.service';

export interface ScheduledMenuInput {
  reviewedChecksum?:string;
  title: string;
  activateAt: string;
  changes: { itemId: string; price?: number; isAvailable?: boolean }[];
}
@Injectable()
export class OperationsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  constructor(
    private readonly ops: OperationsService,
    private readonly menus: MenuPublicationsService,
    private readonly realtime: RealtimeBus,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
  async publishReviewed(s: OpsScope, checksum: string) {
    if (s.role !== 'OWNER')
      throw new ForbiddenException('Only an owner can publish this restaurant-wide review');
    const result = await this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + s.restaurantId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + s.restaurantId}))`;
      const rows = await tx.syncedEntity.findMany({
        where: {
          restaurantId: s.restaurantId,
          entityType: {
            in: ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'],
          },
        },
        select: { entityType: true, payload: true },
      });
      if (buildContent(rows).checksum !== checksum)
        throw new ConflictException('The draft changed after this review. Refresh and review again.');
      const publication = await this.menus.publishTx(tx, s.restaurantId, null, 'Owner reviewed menu changes');
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: s.userId,
          restaurantId: s.restaurantId,
          category: 'OPERATIONS',
          action: 'MENU_REVIEW_PUBLISHED',
          details: { version: publication.created.version, checksum },
        },
        tx,
      );
      return { version: publication.created.version };
    });
    this.realtime.publish({
      restaurantId: s.restaurantId,
      branchId: null,
      kind: 'menu',
      seq: result.version,
    });
    return result;
  }
  onApplicationBootstrap() {
    if (this.config.get('NODE_ENV') !== 'test' && this.config.get('JOBS_DISABLED') !== 'true') {
      this.timer = setInterval(() => void this.runDue().catch(() => undefined), 30000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async create(s: OpsScope, input: ScheduledMenuInput) {
    if (s.role !== 'OWNER')
      throw new ForbiddenException('Only an owner can schedule restaurant-wide menu changes');
    const when = Date.parse(input.activateAt);
    if (when < Date.now() + 60000 || when > Date.now() + 366 * 86400000)
      throw new BadRequestException('Choose an activation time from one minute to one year ahead');
    if (new Set(input.changes.map((c) => c.itemId)).size !== input.changes.length)
      throw new BadRequestException('Select each dish once');
    const snapshots = await this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const rows = await tx.syncedEntity.findMany({
        where: {
          restaurantId: s.restaurantId,
          entityType: 'MENU_ITEM',
          externalId: { in: input.changes.map((c) => c.itemId) },
        },
      });
      if (
        rows.length !== input.changes.length ||
        rows.some((r) => (r.payload as any)?.deleted || (r.payload as any)?.archivedAt)
      )
        throw new BadRequestException('One of the selected dishes is no longer available');
      return rows.map((r) => ({
        itemId: r.externalId,
        version: r.syncVersion,
        before: { price: (r.payload as any).price, isAvailable: (r.payload as any).isAvailable },
        after: input.changes.find((c) => c.itemId === r.externalId),
      }));
    });
    const review=await this.ops.menuReview(s);
    if(input.reviewedChecksum&&input.reviewedChecksum!==review.checksum)throw new ConflictException('The menu changed after this preview. Refresh and review again.');
    if(review.errors.length)throw new BadRequestException('Fix the menu validation errors before scheduling');
    const id = randomUUID();
    return this.ops.write(
      s,
      'OPS_MENU_SCHEDULE',
      id,
      {
        id,
        title: input.title,
        activateAt: input.activateAt,
        changes: snapshots,
        status: 'PENDING',
        createdBy: s.userId,
        reviewedChecksum:review.checksum,
      },
      0,
      'MENU_SCHEDULE_CREATED',
    );
  }
  async cancel(s: OpsScope, id: string, version: number) {
    if (s.role !== 'OWNER') throw new ForbiddenException('Owner access required');
    const record = await this.ops.read(s, 'OPS_MENU_SCHEDULE', id);
    if (!record.data || record.data.branchId !== s.branchId || record.data.status !== 'PENDING')
      throw new BadRequestException('Schedule cannot be cancelled');
    return this.ops.write(
      s,
      'OPS_MENU_SCHEDULE',
      id,
      { ...record.data, status: 'CANCELLED' },
      version,
      'MENU_SCHEDULE_CANCELLED',
    );
  }
  async runDue() {
    if (this.running) return { processed: 0 };
    this.running = true;
    let processed = 0;
    try {
      const rows = await this.ops.prisma.runAsPlatform((tx) =>
        tx.syncedEntity.findMany({
          where: {
            entityType: 'OPS_MENU_SCHEDULE',
            AND: [
              { payload: { path: ['status'], equals: 'PENDING' } },
              { payload: { path: ['activateAt'], lte: new Date().toISOString() } },
            ],
          },
          select: { id: true, restaurantId: true, payload: true },
          take: 50,
        }),
      );
      rows.sort(
        (a, b) => Date.parse((a.payload as any).activateAt) - Date.parse((b.payload as any).activateAt),
      );
      for (const row of rows) {
        let version = 0;
        try {
          version = await this.ops.prisma.runAsTenant(row.restaurantId, async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + row.restaurantId}))`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ops-menu-schedule:' + row.id}))`;
            const current = await tx.syncedEntity.findUniqueOrThrow({ where: { id: row.id } }),
              p = current.payload as any;
            if (p.status !== 'PENDING' || Date.parse(p.activateAt) > Date.now()) return 0;
            const restaurant = await tx.restaurant.findFirst({
              where: { id: row.restaurantId, status: 'ACTIVE', deletedAt: null },
            });
            if (!restaurant || !(await enabledConsoleApps(tx, row.restaurantId)).length)
              throw new Error('An active restaurant and console license are required');
            const owner = await tx.user.findFirst({
              where: { id: p.createdBy, restaurantId: row.restaurantId, role: 'OWNER', status: 'ACTIVE' },
            });
            if (!owner) throw new Error('The scheduling owner is no longer authorized');
            // Lock publication before touching the draft; the complete update and snapshot commit together.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + row.restaurantId}))`;
            const draft=await tx.syncedEntity.findMany({where:{restaurantId:row.restaurantId,entityType:{in:['MENU_ITEM','MENU_CATEGORY','MODIFIER_GROUP','TAX_GROUP','BRANCH_MENU_OVERRIDE']}},select:{entityType:true,payload:true}});
            const currentChecksum=buildContent(draft).checksum;
            const lastApplication=await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId:row.restaurantId,entityType:'OPS_MENU_SCHEDULE_BASE',externalId:row.restaurantId}}});
            if(currentChecksum!==p.reviewedChecksum&&currentChecksum!==(lastApplication?.payload as any)?.checksum)throw new Error('The shared menu changed after scheduling. Review and schedule it again.');
            for (const change of p.changes) {
              const item = await tx.syncedEntity.findUnique({
                where: {
                  restaurantId_entityType_externalId: {
                    restaurantId: row.restaurantId,
                    entityType: 'MENU_ITEM',
                    externalId: change.itemId,
                  },
                },
              });
              const receipt = await tx.syncedEntity.findUnique({
                where: {
                  restaurantId_entityType_externalId: {
                    restaurantId: row.restaurantId,
                    entityType: 'OPS_MENU_ITEM_APPLIED',
                    externalId: change.itemId,
                  },
                },
              });
              if (
                !item ||
                (item.syncVersion !== change.version &&
                  (receipt?.payload as any)?.itemVersion !== item.syncVersion)
              )
                throw new Error('A selected dish changed after scheduling. Review and schedule it again.');
              const patch = {
                ...(item.payload as object),
                ...(change.after.price !== undefined ? { price: change.after.price } : {}),
                ...(change.after.isAvailable !== undefined ? { isAvailable: change.after.isAvailable } : {}),
                updatedAt: new Date().toISOString(),
              };
              await tx.syncedEntity.update({
                where: { id: item.id },
                data: { payload: patch, syncVersion: { increment: 1 } },
              });
              const applied = {
                itemVersion: item.syncVersion + 1,
                scheduleId: current.externalId,
                at: new Date().toISOString(),
              };
              await tx.syncedEntity.upsert({
                where: {
                  restaurantId_entityType_externalId: {
                    restaurantId: row.restaurantId,
                    entityType: 'OPS_MENU_ITEM_APPLIED',
                    externalId: change.itemId,
                  },
                },
                create: {
                  restaurantId: row.restaurantId,
                  entityType: 'OPS_MENU_ITEM_APPLIED',
                  externalId: change.itemId,
                  payload: applied,
                },
                update: { payload: applied, syncVersion: { increment: 1 } },
              });
            }
            const published = await this.menus.publishTx(tx, row.restaurantId, null, 'Scheduled: ' + p.title);
            const after=await tx.syncedEntity.findMany({where:{restaurantId:row.restaurantId,entityType:{in:['MENU_ITEM','MENU_CATEGORY','MODIFIER_GROUP','TAX_GROUP','BRANCH_MENU_OVERRIDE']}},select:{entityType:true,payload:true}});
            const checkpoint={checksum:buildContent(after).checksum,scheduleId:current.externalId};
            await tx.syncedEntity.upsert({where:{restaurantId_entityType_externalId:{restaurantId:row.restaurantId,entityType:'OPS_MENU_SCHEDULE_BASE',externalId:row.restaurantId}},create:{restaurantId:row.restaurantId,entityType:'OPS_MENU_SCHEDULE_BASE',externalId:row.restaurantId,payload:checkpoint},update:{payload:checkpoint,syncVersion:{increment:1}}});
            await tx.syncedEntity.update({
              where: { id: row.id },
              data: {
                payload: {
                  ...p,
                  status: 'APPLIED',
                  appliedAt: new Date().toISOString(),
                  publishedVersion: published.created.version,
                },
                syncVersion: { increment: 1 },
              },
            });
            await this.audit.log(
              {
                actorType: 'TENANT',
                actorId: owner.id,
                restaurantId: row.restaurantId,
                action: 'MENU_SCHEDULE_APPLIED',
                category: 'OPERATIONS',
                details: { scheduleId: current.externalId, version: published.created.version },
              },
              tx,
            );
            return published.created.version;
          });
        } catch (e) {
          await this.ops.prisma.runAsTenant(row.restaurantId, async (tx) => {
            const r = await tx.syncedEntity.findUnique({ where: { id: row.id } });
            if ((r?.payload as any)?.status === 'PENDING')
              await tx.syncedEntity.update({
                where: { id: row.id },
                data: {
                  payload: {
                    ...(r!.payload as object),
                    status: 'FAILED',
                    failureReason: e instanceof Error ? e.message : 'Scheduled change failed',
                  },
                  syncVersion: { increment: 1 },
                },
              });
          });
        }
        if (version) {
          processed++;
          this.realtime.publish({
            restaurantId: row.restaurantId,
            branchId: null,
            kind: 'menu',
            seq: version,
          });
          this.realtime.publish({ restaurantId: row.restaurantId, branchId: null, kind: 'entity:MENU_ITEM' });
        }
      }
      return { processed };
    } finally {
      this.running = false;
    }
  }
}

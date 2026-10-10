import { mergeCustomerLoyalty, CustomerAccount } from './customer-loyalty-merge';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { Device, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitySyncEventDto, SyncableEntityType } from './dto/push-entity-sync.dto';
import { PUBLISHED_DEMO_QR_TOKENS } from './published-demo-qr-tokens';
import { menuEntityProblem } from './menu-entity-schemas';
import { staffVisibleTo } from './entity-authority';
import { WelcomeDesignsService } from '../platform-settings/welcome-designs.service';
import { BRANCH_ENTITY_TYPES, BRANCH_FILTER_TYPES } from './branch-entity-scope';

/** What is worth an audit line when a synced record changes: money, tax, staff access and coupon value. Never the PIN hash itself. */
export function sensitiveChange(entityType: string, before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, unknown> | null {
  const gone = after.deleted === true;
  const was = before && before.deleted !== true ? before : null;
  const diff = (keys: string[]) => Object.fromEntries(keys.filter((k) => JSON.stringify(was?.[k]) !== JSON.stringify(after[k])).map((k) => [k, { from: was?.[k] ?? null, to: after[k] ?? null }]));
  if (entityType === 'MENU_ITEM') {
    const d = diff(['price', 'taxGroupId']);
    return !gone && Object.keys(d).length > 0 && was ? { name: after.name, changes: d } : gone && was ? { name: was.name, removed: true } : null;
  }
  if (entityType === 'TAX_GROUP') {
    const d = diff(['cgstPercent', 'sgstPercent', 'igstPercent', 'isInclusive', 'isActive', 'isDefault']);
    return gone ? { name: was?.name ?? null, removed: true } : !was ? { name: after.name, created: true } : Object.keys(d).length > 0 ? { name: after.name, changes: d } : null;
  }
  if (entityType === 'COUPON') {
    const d = diff(['discountType', 'discountValue', 'maxDiscountAmount', 'isActive']);
    return gone ? { code: was?.code ?? null, removed: true } : !was ? { code: after.code, created: true } : Object.keys(d).length > 0 ? { code: after.code, changes: d } : null;
  }
  if (entityType === 'STAFF_USER') {
    if (gone) return was ? { staff: was.fullName ?? null, removed: true } : null;
    if (!was) return { staff: after.fullName ?? null, roleId: after.roleId ?? null, created: true };
    const d = diff(['roleId', 'isActive']);
    const pinChanged = was.pinHash !== after.pinHash;
    return Object.keys(d).length > 0 || pinChanged ? { staff: after.fullName ?? null, changes: d, pinChanged } : null;
  }
  return null;
}

const CATCH_UP_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_MAX_ROWS = 500;

/**
 * Entity types edited from several devices at once: a push older than what is stored is ignored. The menu is
 * in here too (BUG-149): a device holding an old copy of a dish, or a dish someone deleted, must not overwrite
 * the newer edit or bring the deleted record back.
 */
const LAST_CHANGE_WINS_TYPES: ReadonlySet<string> = new Set(['LOYALTY_TIER', 'LOYALTY_REWARD', 'LOYALTY_PROGRAM_SETTINGS', 'STAFF_USER', 'TAX_GROUP', 'DINING_TABLE', 'MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'COMBO', 'COUPON', 'CUSTOMER', 'SHIFT', 'CASH_MOVEMENT', 'RESERVATION', 'INVENTORY_ITEM', 'RECIPE', 'SUPPLIER', 'KIOSK_CONFIGURATION']);

function changedAt(payload: unknown): number {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).updatedAt : undefined;
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

function isDeleted(payload: unknown): boolean {
  return !!(payload && typeof payload === 'object' && (payload as Record<string, unknown>).deleted === true);
}

export interface EntitySyncPushResult {
  externalId: string;
  status: 'ok' | 'error';
  syncVersion?: number;
  error?: string;
}

@Injectable()
export class EntitySyncService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly realtime: RealtimeBus, private readonly welcomeDesigns: WelcomeDesignsService) {}

  async pushEvents(
    device: Device,
    entityType: SyncableEntityType,
    events: EntitySyncEventDto[]
  ): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> {
    return this.pushEventsForRestaurant(device.restaurantId, entityType, events, device.id, device.branchId, device.type);
  }

  /**
   * The same upsert `pushEvents` does, without requiring a real Device row — used by Super
   * Admin (BUG-015) to push a restaurant's menu on its behalf. Lands in the identical
   * SyncedEntity store a device's own push/pull already reads, so nothing about delivery to
   * terminals has to change: the next entity-sync pull picks it up exactly like a
   * Restaurant-Admin-pushed menu.
   */
  async pushEventsForRestaurant(
    restaurantId: string,
    entityType: SyncableEntityType,
    events: EntitySyncEventDto[],
    deviceId?: string,
    deviceBranchId?: string | null,
    deviceType?: string
  ): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> {
    const results: EntitySyncPushResult[] = [];
    let changed = false;
    const welcomeCatalog = entityType === 'KIOSK_CONFIGURATION' ? await this.welcomeDesigns.forRestaurant(restaurantId) : undefined;

    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      // Acquire the entity counter before record locks so every entity writer uses the same lock order.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + restaurantId}))`;
      if (entityType === 'COUPON') await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-promotions:' + restaurantId}))`;
      for (let evt of events) {
        await tx.$executeRaw`SAVEPOINT entity_event`;
        try {
          if ((BRANCH_ENTITY_TYPES.has(entityType) || entityType === 'STAFF_USER') && deviceBranchId && typeof evt.payload.branchId === 'string' && evt.payload.branchId !== deviceBranchId) {
            throw new Error('BRANCH_FORBIDDEN: This table belongs to another branch');
          }
          // A branch-owned record pushed by a branch-bound terminal is stamped with that branch, so other branches never receive it.
          if (BRANCH_ENTITY_TYPES.has(entityType) && deviceBranchId && evt.payload.deleted !== true && typeof evt.payload.branchId !== 'string') {
            evt = { ...evt, payload: { ...evt.payload, branchId: deviceBranchId } };
          }
          if (entityType === 'MENU_ITEM' && deviceBranchId && evt.payload.deleted !== true && typeof evt.payload.price === 'number') {
            // A branch terminal that received this branch's price and pushes the dish back must not turn it into the base price.
            const ov = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'BRANCH_MENU_OVERRIDE', externalId: `${deviceBranchId}:${evt.externalId}` } } });
            const ovPayload = ov?.payload as { price?: number } | undefined;
            if (ovPayload && typeof ovPayload.price === 'number' && ovPayload.price === evt.payload.price) {
              const base = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'MENU_ITEM', externalId: evt.externalId } } });
              const basePrice = (base?.payload as { price?: number } | undefined)?.price;
              if (typeof basePrice === 'number') evt = { ...evt, payload: { ...evt.payload, price: basePrice } };
            }
          }
          if (entityType === 'MENU_ITEM' && deviceBranchId && evt.payload.deleted !== true) {
            // Counted branch portions are changed through their scoped stock API. A pulled branch view cannot overwrite restaurant defaults.
            const ov = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'BRANCH_MENU_OVERRIDE', externalId: `${deviceBranchId}:${evt.externalId}` } } });
            if (typeof (ov?.payload as any)?.stockQuantity === 'number') {
              const base = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'MENU_ITEM', externalId: evt.externalId } } });
              const payload = { ...evt.payload };
              const stock = (base?.payload as any)?.stockQuantity;
              if (stock === undefined) delete payload.stockQuantity; else payload.stockQuantity = stock;
              if ((base?.payload as any)?.isAvailable !== undefined) payload.isAvailable = (base!.payload as any).isAvailable;
              evt = { ...evt, payload };
            }
          }
          if (entityType === 'COUPON' && deviceType === 'KIOSK' && evt.payload.deleted !== true) {
            // A kiosk reports redemptions; it cannot create a coupon or change what one is worth.
            const base = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'COUPON', externalId: evt.externalId } } });
            const cur = base?.payload as Record<string, unknown> | undefined;
            if (!cur || cur.deleted === true) throw new Error('A kiosk cannot create a coupon');
            const seen = typeof evt.payload.usageCount === 'number' ? evt.payload.usageCount : 0;
            const prior = typeof cur.usageCount === 'number' ? cur.usageCount : 0;
            evt = { ...evt, payload: { ...cur, usageCount: Math.max(prior, seen), updatedAt: evt.payload.updatedAt ?? cur.updatedAt } };
          }
          const problem = menuEntityProblem(entityType, evt.payload);
          if (problem) {
            results.push({ externalId: evt.externalId, status: 'error', error: problem });
            continue;
          }
          if (entityType === 'KIOSK_CONFIGURATION') {
            if (evt.externalId !== `kiosk-config-${evt.payload.branchId || 'restaurant'}`) throw new Error('Invalid kiosk configuration scope');
            const overrides = (evt.payload.welcome as { deviceOverrides?: Record<string, unknown> })?.deviceOverrides;
            const ids = Object.keys(overrides || {});
            if (ids.length) {
              const devices = await tx.device.findMany({ where: { id: { in: ids }, restaurantId, type: 'KIOSK', branchId: typeof evt.payload.branchId === 'string' ? evt.payload.branchId : null }, select: { id: true } });
              if (devices.length !== ids.length) throw new Error('Kiosk overrides must belong to this restaurant and branch');
            }
          }
          const existing = await tx.syncedEntity.findUnique({
            where: {
              restaurantId_entityType_externalId: {
                restaurantId,
                entityType,
                externalId: evt.externalId
              }
            }
          });
          const existingBranch = (existing?.payload as { branchId?: string } | null)?.branchId;
          if (entityType === 'STAFF_USER' && typeof evt.payload.branchId !== 'string' && (existingBranch || (!existing && deviceBranchId))) {
            evt = { ...evt, payload: { ...evt.payload, branchId: existingBranch ?? deviceBranchId } };
          }
          const targetBranch = typeof evt.payload.branchId === 'string' ? evt.payload.branchId : existingBranch;
          if ((BRANCH_ENTITY_TYPES.has(entityType) || entityType === 'STAFF_USER') && targetBranch) {
            const branch = await tx.branch.findFirst({ where: { id: targetBranch, restaurantId }, select: { id: true } });
            if (!branch) throw new Error('BRANCH_FORBIDDEN: Branch does not belong to this restaurant');
          }
          if (welcomeCatalog && evt.payload.deleted !== true) this.welcomeDesigns.validateSelection(evt.payload.welcome, (existing?.payload as any)?.welcome, welcomeCatalog.designs);
          if ((BRANCH_ENTITY_TYPES.has(entityType) || entityType === 'STAFF_USER') && deviceBranchId && existingBranch && existingBranch !== deviceBranchId) {
            throw new Error('BRANCH_FORBIDDEN: This table is outside this device branch');
          }
          // Minimal deletion payloads must retain ownership, including when an unbound owner removes a branch record.
          const deletionBranch = existingBranch ?? deviceBranchId;
          if ((BRANCH_ENTITY_TYPES.has(entityType) || entityType === 'STAFF_USER') && evt.payload.deleted === true && deletionBranch && typeof evt.payload.branchId !== 'string') {
            evt = { ...evt, payload: { ...evt.payload, branchId: deletionBranch } };
          }
          if (entityType === 'CUSTOMER' && existing && !isDeleted(existing.payload) && !isDeleted(evt.payload)) {
            evt = { ...evt, payload: mergeCustomerLoyalty(existing.payload as unknown as CustomerAccount, evt.payload as unknown as CustomerAccount) as unknown as Record<string, unknown> };
          }
          if (existing && entityType === 'COUPON') evt = { ...evt, payload: { ...evt.payload, usageCount: Math.max(Number((existing.payload as any).usageCount) || 0, Number(evt.payload.usageCount) || 0) } };
          if (existing && JSON.stringify(existing.payload) === JSON.stringify(evt.payload)) {
            results.push({ externalId: evt.externalId, status: 'ok', syncVersion: existing.syncVersion });
            continue;
          }

          if (existing && LAST_CHANGE_WINS_TYPES.has(entityType)) {
            const existingDeleted = isDeleted(existing.payload);
            const incomingDeleted = isDeleted(evt.payload);
            // B2-038: a tombstone is sticky. Comparing `payload.updatedAt` alone let a device that
            // hadn't yet learned of a deletion re-push its still-live copy with a timestamp that,
            // under ordinary sync-tick/network timing, can land newer than the tombstone's own
            // (each device stamps `updatedAt` with its own local clock at its own tick cadence) -
            // overwriting the deletion in the DB, which then fanned the "revived" dish back out to
            // every other device on their next pull. Once an entity is tombstoned here, no incoming
            // live payload can ever undo that through this generic last-write-wins path, no matter
            // its timestamp - only another deletion event (idempotent) is accepted. Bringing a dish
            // back is a new create (a new externalId) through the normal Add Dish flow, never an
            // implicit resurrection of an old one.
            if (existingDeleted && !incomingDeleted) {
              results.push({ externalId: evt.externalId, status: 'ok', syncVersion: existing.syncVersion });
              continue;
            }
            if (changedAt(evt.payload) < changedAt(existing.payload)) {
              results.push({ externalId: evt.externalId, status: 'ok', syncVersion: existing.syncVersion });
              continue;
            }
          }

          const saved = existing
            ? await tx.syncedEntity.update({
                where: { id: existing.id },
                data: { deviceId: deviceId ?? existing.deviceId, payload: evt.payload as any, syncVersion: existing.syncVersion + 1 }
              })
            : await tx.syncedEntity.create({
                data: {
                  restaurantId,
                  deviceId: deviceId ?? null,
                  entityType,
                  externalId: evt.externalId,
                  payload: evt.payload as any,
                  syncVersion: 1
                }
              });

          const change = sensitiveChange(entityType, (existing?.payload as Record<string, unknown> | null) ?? null, evt.payload);
          if (change) {
            await this.audit.log({ actorType: deviceId ? 'TENANT' : 'SYSTEM', actorId: deviceId, restaurantId, action: `SYNC_${entityType}_CHANGED`, category: 'SYNC', details: { entityId: evt.externalId, deviceType: deviceType ?? null, ...change } as never }, tx);
          }
          if (entityType === 'DINING_TABLE') await this.syncQrTableLink(tx, restaurantId, evt, deviceBranchId ?? null);
          results.push({ externalId: evt.externalId, status: 'ok', syncVersion: saved.syncVersion });
          changed = true;
        } catch (err: any) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT entity_event`;
          results.push({ externalId: evt.externalId, status: 'error', error: err?.message ?? 'Unknown error' });
        }
      }
    });

    if (changed) {
      this.realtime.publish({ restaurantId, branchId: BRANCH_ENTITY_TYPES.has(entityType) ? deviceBranchId ?? null : null,
        kind: `entity:${entityType}`, originDeviceId: deviceId });
    }
    return { results, serverTime: new Date().toISOString() };
  }

  /**
   * QR codes are cloud-authoritative: the server mints, versions, disables and revokes them (see the qr module), and a
   * terminal can no longer create or change one. The single thing kept here is a compatibility mirror for codes
   * printed before that change: an older Restaurant Admin still pushes the token it minted in the browser
   * (`jv_qr_tbl_...`) with its table, and that token is recorded as an ACTIVE legacy code for THAT restaurant only.
   * INSERT .. ON CONFLICT DO NOTHING means it can never overwrite or re-point an existing token, whichever
   * restaurant owns it. Whether a table is still active is answered at scan time from the table's own record, so
   * nothing here mirrors table state. Removed with the old clients (plan P12).
   */
  private async syncQrTableLink(tx: Prisma.TransactionClient, restaurantId: string, evt: EntitySyncEventDto, branchId: string | null): Promise<void> {
    const payload = evt.payload as Record<string, unknown>;
    if (payload?.deleted === true) return;
    const qrToken = typeof payload.qrToken === 'string' ? payload.qrToken : null;
    // Only tokens the old client generated randomly (144 bits of hex after the table number) are ever mirrored. The old
    // client also derived tokens from the table number and id for tables that had none; those are guessable, so they are
    // refused and that table simply has no working legacy code until a real one is generated.
    if (!qrToken || !/^jv_qr_tbl_[A-Za-z0-9]{1,10}_[a-f0-9]{32,64}$/.test(qrToken)) return;
    if (PUBLISHED_DEMO_QR_TOKENS.has(qrToken)) return;
    if (payload.qrStatus === 'DISABLED' || payload.isActive === false) return;

    const tableNumber = typeof payload.tableNumber === 'string' ? payload.tableNumber : evt.externalId;
    let branch = typeof payload.branchId === 'string' ? (payload.branchId as string) : branchId;
    if (!branch) {
      const branches = await tx.branch.findMany({ where: { restaurantId }, select: { id: true }, take: 2 });
      branch = branches.length === 1 ? branches[0].id : null;
    }
    await tx.$executeRaw`
      INSERT INTO "QrCode" ("id", "publicToken", "restaurantId", "branchId", "tableId", "tableNumber", "status", "mode", "version", "metadata", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${qrToken}, ${restaurantId}, ${branch}, ${evt.externalId}, ${tableNumber}, 'ACTIVE', 'TABLE_ORDER', 1, '{"legacy": true}'::jsonb, NOW(), NOW())
      ON CONFLICT DO NOTHING`;
  }

  async catchUp(device: Device, entityType: SyncableEntityType, since?: string, afterSeq?: number) {
    return this.catchUpForRestaurant(device.restaurantId, entityType, since, BRANCH_FILTER_TYPES.has(entityType) ? device.branchId : null, device.type, afterSeq);
  }

  /**
   * `branchId` scopes branch-owned records (the floor plan): a branch terminal receives its own branch's tables and any table
   * that names no branch, never another branch's. Restaurant-wide types (menu, staff, customers) are not filtered.
   */
  async catchUpForRestaurant(restaurantId: string, entityType: SyncableEntityType, since?: string, branchId: string | null = null, deviceType?: string, afterSeq?: number) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - CATCH_UP_DEFAULT_LOOKBACK_MS);
    if (Number.isNaN(sinceDate.getTime())) throw new BadRequestException('Invalid sync timestamp');
    const readStartedAt = new Date().toISOString();

    // B2-029: same missing-filter bug as order-sync.service.ts — this returned every
    // restaurant's entities (menu items, customers, staff PIN hashes) to any device.
    // Explicit filter here is defense in depth on top of RLS.
    const entities = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.findMany({
        where: { restaurantId, entityType, ...(afterSeq !== undefined ? { seq: { gt: afterSeq } } : { updatedAt: { gt: sinceDate } }) },
        orderBy: afterSeq !== undefined ? { seq: 'asc' } : [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: CATCH_UP_MAX_ROWS + 1
      })
    );
    const hasMore = entities.length > CATCH_UP_MAX_ROWS;
    const page = entities.slice(0, CATCH_UP_MAX_ROWS);
    const latestSeq = page.length ? page[page.length - 1].seq : afterSeq ?? 0;
    // Advance over the scanned page, not the filtered response. An invisible page must not skip the following visible page.
    const metadata = { latestSeq, hasMore, serverTime: readStartedAt };

    if (entityType === 'STAFF_USER' && deviceType) {
      const staff = page.filter((e) => {
        const payload = e.payload as Record<string, unknown> | null;
        return (!branchId || !payload?.branchId || payload.branchId === branchId) && staffVisibleTo(deviceType as never, payload);
      });
      return { entities: staff, ...metadata };
    }
    if (entityType === 'MENU_ITEM' && branchId) {
      // This branch's own price and availability, applied on the way out: POS, Kiosk and Captain of the branch receive the dish
      // as the branch sells it, with no change to any device. The restaurant-wide record itself is never modified.
      const overrides = await this.prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.findMany({ where: { restaurantId, entityType: 'BRANCH_MENU_OVERRIDE' }, select: { payload: true } }));
      const mine = new Map<string, { price?: number; isAvailable?: boolean;stockQuantity?:number }>();
      for (const o of overrides) {
        const p = o.payload as { branchId?: string; itemId?: string; price?: number; isAvailable?: boolean;stockQuantity?:number } | null;
        if (p && p.branchId === branchId && typeof p.itemId === 'string') mine.set(p.itemId, { price: p.price, isAvailable: p.isAvailable,stockQuantity:p.stockQuantity });
      }
      const applied = page.map((e) => {
        const o = mine.get(e.externalId);
        const p = e.payload as Record<string, unknown> | null;
        if (!p || p.deleted === true) return e;
        const hidden = Array.isArray(p.branchIds) && p.branchIds.length > 0 && !p.branchIds.includes(branchId);
        return { ...e, payload: { ...p, ...(hidden ? { deleted: true } : {}), ...(typeof o?.price === 'number' ? { price: o.price } : {}), ...(typeof o?.isAvailable === 'boolean' ? { isAvailable: o.isAvailable } : {}),...(typeof o?.stockQuantity==='number'?{stockQuantity:o.stockQuantity}:{}),...(typeof (o?.stockQuantity??p.stockQuantity)==='number'&&(o?.stockQuantity??Number(p.stockQuantity))<=0?{isAvailable:false}:{}) } };
      });
      return { entities: applied, ...metadata };
    }
    const allowLegacy = !branchId || !BRANCH_ENTITY_TYPES.has(entityType) || (await this.prisma.runAsTenant(restaurantId, tx => tx.branch.count({ where: { restaurantId } }))) === 1;
    const visible = branchId
      ? page.filter((e) => {
          const b = (e.payload as { branchId?: unknown } | null)?.branchId;
          return b === branchId || (typeof b !== 'string' && allowLegacy);
        })
      : page;
    return { entities: visible, ...metadata };
  }
}

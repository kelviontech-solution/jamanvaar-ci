import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitySyncEventDto, SyncableEntityType } from './dto/push-entity-sync.dto';

const CATCH_UP_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_MAX_ROWS = 500;

/**
 * Entity types edited from several devices at once: a push older than what is stored is ignored. The menu is
 * in here too (BUG-149): a device holding an old copy of a dish, or a dish someone deleted, must not overwrite
 * the newer edit or bring the deleted record back.
 */
const LAST_CHANGE_WINS_TYPES: ReadonlySet<string> = new Set(['DINING_TABLE', 'MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'COMBO', 'COUPON', 'CUSTOMER', 'SHIFT', 'CASH_MOVEMENT']);

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
  constructor(private readonly prisma: PrismaService) {}

  async pushEvents(
    device: Device,
    entityType: SyncableEntityType,
    events: EntitySyncEventDto[]
  ): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> {
    return this.pushEventsForRestaurant(device.restaurantId, entityType, events, device.id, device.branchId);
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
    deviceBranchId?: string | null
  ): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> {
    const results: EntitySyncPushResult[] = [];

    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      for (const evt of events) {
        try {
          const existing = await tx.syncedEntity.findUnique({
            where: {
              restaurantId_entityType_externalId: {
                restaurantId,
                entityType,
                externalId: evt.externalId
              }
            }
          });

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

          results.push({ externalId: evt.externalId, status: 'ok', syncVersion: saved.syncVersion });
          if (entityType === 'DINING_TABLE') await this.syncQrTableLink(tx, restaurantId, evt, deviceBranchId ?? null);
        } catch (err: any) {
          results.push({ externalId: evt.externalId, status: 'error', error: err?.message ?? 'Unknown error' });
        }
      }
    });

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

  async catchUp(device: Device, entityType: SyncableEntityType, since?: string) {
    return this.catchUpForRestaurant(device.restaurantId, entityType, since);
  }

  async catchUpForRestaurant(restaurantId: string, entityType: SyncableEntityType, since?: string) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - CATCH_UP_DEFAULT_LOOKBACK_MS);

    // B2-029: same missing-filter bug as order-sync.service.ts — this returned every
    // restaurant's entities (menu items, customers, staff PIN hashes) to any device.
    // Explicit filter here is defense in depth on top of RLS.
    const entities = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.findMany({
        where: { restaurantId, entityType, updatedAt: { gt: sinceDate } },
        orderBy: { updatedAt: 'asc' },
        take: CATCH_UP_MAX_ROWS
      })
    );

    return { entities, serverTime: new Date().toISOString() };
  }
}

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
const LAST_CHANGE_WINS_TYPES: ReadonlySet<string> = new Set(['DINING_TABLE', 'MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'COMBO', 'COUPON', 'CUSTOMER']);

function changedAt(payload: unknown): number {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).updatedAt : undefined;
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
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
    return this.pushEventsForRestaurant(device.restaurantId, entityType, events, device.id);
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
    deviceId?: string
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

          if (existing && LAST_CHANGE_WINS_TYPES.has(entityType) && changedAt(evt.payload) < changedAt(existing.payload)) {
            results.push({ externalId: evt.externalId, status: 'ok', syncVersion: existing.syncVersion });
            continue;
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
          if (entityType === 'DINING_TABLE') await this.syncQrTableLink(tx, restaurantId, evt);
        } catch (err: any) {
          results.push({ externalId: evt.externalId, status: 'error', error: err?.message ?? 'Unknown error' });
        }
      }
    });

    return { results, serverTime: new Date().toISOString() };
  }

  /**
   * BUG-119: keeps QrTableLink's own indexed row (`qrToken` -> restaurant + table) in step with whatever a
   * device just pushed for this table, so a guest scanning the printed QR code always resolves to the current
   * state without a public request ever scanning tenant-scoped SyncedEntity data. A regenerated token
   * (`regenerateTableQr`) leaves a NEW row here; the table's earlier token(s) are deactivated so an old,
   * still-printed sticker gives an honest "no longer valid" instead of quietly still working.
   */
  private async syncQrTableLink(tx: Prisma.TransactionClient, restaurantId: string, evt: EntitySyncEventDto): Promise<void> {
    const payload = evt.payload as Record<string, unknown>;
    const tableId = evt.externalId;

    if (payload?.deleted === true) {
      await tx.qrTableLink.updateMany({ where: { restaurantId, tableId }, data: { isActive: false } });
      return;
    }

    const qrToken = typeof payload.qrToken === 'string' ? payload.qrToken : null;
    const tableNumber = typeof payload.tableNumber === 'string' ? payload.tableNumber : tableId;
    const isActive = payload.isActive !== false && payload.qrStatus !== 'DISABLED';

    if (qrToken) {
      await tx.qrTableLink.upsert({
        where: { qrToken },
        update: { restaurantId, tableId, tableNumber, isActive },
        create: { qrToken, restaurantId, tableId, tableNumber, isActive }
      });
      // A regenerated token supersedes whatever this table's earlier token(s) were.
      await tx.qrTableLink.updateMany({ where: { restaurantId, tableId, qrToken: { not: qrToken } }, data: { isActive: false } });
    } else {
      // The table itself was pushed with no token at all (QR never generated, or explicitly cleared).
      await tx.qrTableLink.updateMany({ where: { restaurantId, tableId }, data: { isActive: false } });
    }
  }

  async catchUp(device: Device, entityType: SyncableEntityType, since?: string) {
    return this.catchUpForRestaurant(device.restaurantId, entityType, since);
  }

  async catchUpForRestaurant(restaurantId: string, entityType: SyncableEntityType, since?: string) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - CATCH_UP_DEFAULT_LOOKBACK_MS);

    const entities = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.findMany({
        where: { entityType, updatedAt: { gt: sinceDate } },
        orderBy: { updatedAt: 'asc' },
        take: CATCH_UP_MAX_ROWS
      })
    );

    return { entities, serverTime: new Date().toISOString() };
  }
}

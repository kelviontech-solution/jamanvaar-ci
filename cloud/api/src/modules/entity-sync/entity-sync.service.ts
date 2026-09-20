import { Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitySyncEventDto, SyncableEntityType } from './dto/push-entity-sync.dto';

const CATCH_UP_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_MAX_ROWS = 500;

/**
 * Entity types edited from several devices at once: a push older than what is stored is ignored. The menu is
 * in here too (BUG-149): a device holding an old copy of a dish, or a dish someone deleted, must not overwrite
 * the newer edit or bring the deleted record back.
 */
const LAST_CHANGE_WINS_TYPES: ReadonlySet<string> = new Set(['DINING_TABLE', 'MENU_ITEM', 'MENU_CATEGORY', 'COMBO', 'COUPON', 'CUSTOMER']);

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
        } catch (err: any) {
          results.push({ externalId: evt.externalId, status: 'error', error: err?.message ?? 'Unknown error' });
        }
      }
    });

    return { results, serverTime: new Date().toISOString() };
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

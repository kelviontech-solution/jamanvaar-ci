import { Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitySyncEventDto, SyncableEntityType } from './dto/push-entity-sync.dto';

const CATCH_UP_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_MAX_ROWS = 500;

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
    const results: EntitySyncPushResult[] = [];

    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      for (const evt of events) {
        try {
          const existing = await tx.syncedEntity.findUnique({
            where: {
              restaurantId_entityType_externalId: {
                restaurantId: device.restaurantId,
                entityType,
                externalId: evt.externalId
              }
            }
          });

          const saved = existing
            ? await tx.syncedEntity.update({
                where: { id: existing.id },
                data: { deviceId: device.id, payload: evt.payload as any, syncVersion: existing.syncVersion + 1 }
              })
            : await tx.syncedEntity.create({
                data: {
                  restaurantId: device.restaurantId,
                  deviceId: device.id,
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
    const sinceDate = since ? new Date(since) : new Date(Date.now() - CATCH_UP_DEFAULT_LOOKBACK_MS);

    const entities = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.syncedEntity.findMany({
        where: { entityType, updatedAt: { gt: sinceDate } },
        orderBy: { updatedAt: 'asc' },
        take: CATCH_UP_MAX_ROWS
      })
    );

    return { entities, serverTime: new Date().toISOString() };
  }
}

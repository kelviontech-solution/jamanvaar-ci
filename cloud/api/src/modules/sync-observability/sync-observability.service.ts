import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';

const RESOLUTION_STRATEGIES = ['CLOUD_WINS', 'LOCAL_WINS', 'MANUAL_MERGE'] as const;
type ResolutionStrategy = (typeof RESOLUTION_STRATEGIES)[number];

/**
 * security-audit MED-14: `restaurantId`/`deviceId` are no longer taken from the
 * request body — the caller must authenticate as a real device (`DeviceAuthGuard`),
 * and both values come from that device's own row instead (see `recordSyncLog`).
 */
export interface RecordSyncLogDto {
  branchId?: string;
  entityType: 'ORDER' | 'MENU' | 'INVENTORY' | 'CUSTOMER';
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  latencyMs?: number;
  payloadSize?: number;
  errorMessage?: string;
}

export interface RecordConflictDto {
  restaurantId: string;
  branchId?: string;
  deviceId?: string;
  entityType: string;
  entityId: string;
  localVersion: Record<string, unknown>;
  cloudVersion: Record<string, unknown>;
  reason: string;
}

@Injectable()
export class SyncObservabilityService {
  private readonly processStartTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeBus
  ) {}

  /**
   * Safe operational metrics: Database pool latency, connection count, memory, uptime.
   */
  async getPlatformTelemetry() {
    let dbStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    let dbLatencyMs = 0;
    let poolConnections = 1;
    let databaseSizeMb = 0;

    try {
      const start = Date.now();
      const res: any = await this.prisma.$queryRaw`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int as active_conns,
          (SELECT pg_database_size(current_database()))::bigint as db_bytes
      `;
      dbLatencyMs = Date.now() - start;
      if (res && res[0]) {
        poolConnections = Number(res[0].active_conns) || 1;
        databaseSizeMb = Math.round((Number(res[0].db_bytes) || 0) / (1024 * 1024));
      }
    } catch {
      dbStatus = 'DOWN';
    }

    const mem = process.memoryUsage();

    return {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        activeConnections: poolConnections,
        sizeMb: databaseSizeMb
      },
      process: {
        uptimeSeconds: Math.round((Date.now() - this.processStartTime) / 1000),
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
        nodeVersion: process.version
      },
      timestamp: new Date().toISOString()
    };
  }

  async getSyncMetrics() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalEvents, failedEvents, pendingConflicts, devicesReporting] = await Promise.all([
      this.prisma.platformDb.syncEventLog.count({ where: { timestamp: { gte: oneDayAgo } } }),
      this.prisma.platformDb.syncEventLog.count({ where: { status: 'FAILED', timestamp: { gte: oneDayAgo } } }),
      this.prisma.platformDb.syncConflict.count({ where: { resolution: 'PENDING' } }),
      // A terminal is "reporting" if it has told the platform anything in the last day: a sync, or just its
      // heartbeat. Counting only `lastSyncAt` (which the heartbeat rarely carries) showed 0 while Device Fleet
      // listed the same terminals as online (BUG-155).
      this.prisma.platformDb.device.count({ where: { status: { not: 'REVOKED' }, OR: [{ lastSyncAt: { gte: oneDayAgo } }, { lastSeenAt: { gte: oneDayAgo } }] } })
    ]);

    const successRate = totalEvents > 0 ? Math.round(((totalEvents - failedEvents) / totalEvents) * 100) : 100;

    return {
      events24h: totalEvents,
      failures24h: failedEvents,
      successRatePercent: successRate,
      activeSyncingDevices: devicesReporting,
      pendingConflicts
    };
  }

  async listSyncLogs(filter?: { restaurantId?: string; status?: string; limit?: number }) {
    return this.prisma.runAsPlatform(async (tx) => {
      return tx.syncEventLog.findMany({
        where: {
          restaurantId: filter?.restaurantId,
          status: filter?.status
        },
        include: {
          restaurant: { select: { id: true, name: true } },
          device: { select: { id: true, type: true, name: true } }
        },
        orderBy: { timestamp: 'desc' },
        take: filter?.limit || 50
      });
    });
  }

  async recordSyncLog(device: Device, dto: RecordSyncLogDto) {
    // security-audit MED-14: restaurantId/deviceId come from the authenticated device,
    // never the request body — this endpoint used to have no guard at all, so anyone
    // could write an unbounded, unauthenticated stream of fabricated telemetry rows
    // tagged with an arbitrary restaurantId (including another tenant's).
    return this.prisma.platformDb.syncEventLog.create({
      data: {
        restaurantId: device.restaurantId,
        branchId: dto.branchId,
        deviceId: device.id,
        entityType: dto.entityType,
        action: dto.action,
        status: dto.status,
        latencyMs: dto.latencyMs ?? 0,
        payloadSize: dto.payloadSize ?? 0,
        errorMessage: dto.errorMessage
      }
    });
  }

  async listConflicts(restaurantId?: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      return tx.syncConflict.findMany({
        where: restaurantId ? { restaurantId } : undefined,
        include: {
          restaurant: { select: { id: true, name: true } },
          device: { select: { id: true, type: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    });
  }

  async recordConflict(dto: RecordConflictDto) {
    return this.prisma.platformDb.syncConflict.create({
      data: {
        restaurantId: dto.restaurantId,
        branchId: dto.branchId,
        deviceId: dto.deviceId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        localVersion: dto.localVersion as any,
        cloudVersion: dto.cloudVersion as any,
        reason: dto.reason,
        resolution: 'PENDING'
      }
    });
  }

  /**
   * Resolving a conflict must actually change the canonical record (`SyncedEntity`, the same
   * store `EntitySyncService.pushEvents` writes and every device's catch-up reads from) —
   * not just relabel the conflict row. Previously this only updated `SyncConflict.resolution`,
   * so LOCAL_WINS reported success while the stored entity kept its old (cloud) value forever,
   * and a resolved conflict could be "resolved" again with any string, including an invalid one.
   */
  async resolveConflict(
    conflictId: string,
    strategy: string,
    actor: PlatformUser,
    mergedVersion?: Record<string, unknown>
  ) {
    if (!RESOLUTION_STRATEGIES.includes(strategy as ResolutionStrategy)) {
      throw new BadRequestException(`strategy must be one of ${RESOLUTION_STRATEGIES.join(', ')}`);
    }
    const resolvedStrategy = strategy as ResolutionStrategy;

    const conflict = await this.prisma.platformDb.syncConflict.findUnique({ where: { id: conflictId } });
    if (!conflict) throw new NotFoundException('Sync conflict not found');
    if (conflict.resolution !== 'PENDING') {
      throw new BadRequestException(`This conflict was already resolved (${conflict.resolution}); it cannot be resolved again`);
    }

    if (resolvedStrategy === 'MANUAL_MERGE') {
      if (!mergedVersion || typeof mergedVersion !== 'object' || Array.isArray(mergedVersion) || Object.keys(mergedVersion).length === 0) {
        throw new BadRequestException('MANUAL_MERGE requires a non-empty mergedVersion payload');
      }
    }

    const appliedPayload =
      resolvedStrategy === 'CLOUD_WINS' ? (conflict.cloudVersion as Record<string, unknown>)
      : resolvedStrategy === 'LOCAL_WINS' ? (conflict.localVersion as Record<string, unknown>)
      : (mergedVersion as Record<string, unknown>);

    const updated = await this.prisma.runAsPlatform(async (tx) => {
      // Guards the same race the old code missed: two operators resolving the same conflict at
      // once, or a resolve racing the already-resolved check above. Only the first succeeds.
      const claimed = await tx.syncConflict.updateMany({
        where: { id: conflictId, resolution: 'PENDING' },
        data: { resolution: resolvedStrategy, resolvedAt: new Date(), resolvedById: actor.id }
      });
      if (claimed.count === 0) {
        throw new BadRequestException('This conflict was already resolved; it cannot be resolved again');
      }

      await tx.syncedEntity.upsert({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: conflict.restaurantId,
            entityType: conflict.entityType,
            externalId: conflict.entityId
          }
        },
        create: {
          restaurantId: conflict.restaurantId,
          deviceId: conflict.deviceId,
          entityType: conflict.entityType,
          externalId: conflict.entityId,
          payload: appliedPayload as any,
          syncVersion: 1
        },
        update: {
          payload: appliedPayload as any,
          syncVersion: { increment: 1 }
        }
      });

      return tx.syncConflict.findUniqueOrThrow({ where: { id: conflictId } });
    });

    // Mirrors EntitySyncService.pushEvents: devices holding this entity refresh on their next pull.
    this.realtime.publish({ restaurantId: conflict.restaurantId, branchId: conflict.branchId ?? null, kind: `entity:${conflict.entityType}` });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: conflict.restaurantId,
      action: `SYNC_CONFLICT_RESOLVED_${resolvedStrategy}`,
      category: 'SYNC',
      details: { conflictId, entityType: conflict.entityType, entityId: conflict.entityId, strategy: resolvedStrategy }
    });

    return updated;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface RecordSyncLogDto {
  restaurantId: string;
  branchId?: string;
  deviceId?: string;
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
    private readonly audit: AuditService
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
      this.prisma.syncEventLog.count({ where: { timestamp: { gte: oneDayAgo } } }),
      this.prisma.syncEventLog.count({ where: { status: 'FAILED', timestamp: { gte: oneDayAgo } } }),
      this.prisma.syncConflict.count({ where: { resolution: 'PENDING' } }),
      this.prisma.device.count({ where: { lastSyncAt: { gte: oneDayAgo } } })
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

  async recordSyncLog(dto: RecordSyncLogDto) {
    return this.prisma.syncEventLog.create({
      data: {
        restaurantId: dto.restaurantId,
        branchId: dto.branchId,
        deviceId: dto.deviceId,
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
    return this.prisma.syncConflict.create({
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

  async resolveConflict(
    conflictId: string,
    strategy: 'CLOUD_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE',
    actor: PlatformUser
  ) {
    const conflict = await this.prisma.syncConflict.findUnique({ where: { id: conflictId } });
    if (!conflict) throw new NotFoundException('Sync conflict not found');

    const updated = await this.prisma.syncConflict.update({
      where: { id: conflictId },
      data: {
        resolution: strategy,
        resolvedAt: new Date(),
        resolvedById: actor.id
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: conflict.restaurantId,
      action: `SYNC_CONFLICT_RESOLVED_${strategy}`,
      category: 'SYNC',
      details: { conflictId, entityType: conflict.entityType, entityId: conflict.entityId, strategy }
    });

    return updated;
  }
}

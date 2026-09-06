import { Injectable, NotFoundException } from '@nestjs/common';
import { Device, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BackupStorageService } from './backup-storage.service';

@Injectable()
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BackupStorageService,
    private readonly audit: AuditService
  ) {}

  get storageConfigured(): boolean {
    return this.storage.configured;
  }

  /**
   * The one place a Backup row is created. Uploads first, records second —
   * a storage failure throws before anything is written, so a Backup row
   * existing always means the object genuinely landed in the bucket.
   */
  async createBackup(
    restaurantId: string,
    payload: unknown,
    opts: { method: 'MANUAL' | 'AUTOMATIC'; deviceId?: string; actorUserId?: string }
  ) {
    const jsonPayload = JSON.stringify(payload);
    const uploaded = await this.storage.upload(restaurantId, jsonPayload);

    const backup = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.backup.create({
        data: {
          restaurantId,
          deviceId: opts.deviceId,
          method: opts.method,
          status: 'COMPLETED',
          sizeBytes: uploaded.sizeBytes,
          storageKey: uploaded.storageKey,
          checksumSha256: uploaded.checksumSha256
        }
      })
    );

    await this.audit.log({
      actorType: opts.deviceId ? 'SYSTEM' : 'TENANT',
      actorId: opts.actorUserId ?? opts.deviceId,
      restaurantId,
      action: 'BACKUP_CREATED',
      category: 'BACKUP',
      details: { backupId: backup.id, sizeBytes: backup.sizeBytes, method: backup.method }
    });

    if (opts.deviceId) {
      await this.prisma.runAsTenant(restaurantId, (tx) =>
        tx.device.update({ where: { id: opts.deviceId }, data: { lastBackupAt: new Date() } })
      );
    }

    // Never return storageKey/checksum to the client — those are internal
    // bucket details, not something a restaurant or device needs to see.
    return { id: backup.id, createdAt: backup.createdAt, sizeBytes: backup.sizeBytes, method: backup.method };
  }

  async listForRestaurant(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.backup.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          method: true,
          status: true,
          sizeBytes: true,
          createdAt: true,
          errorMessage: true,
          device: { select: { id: true, type: true } }
        }
      })
    );
  }

  async getDownloadUrl(restaurantId: string, backupId: string): Promise<string> {
    const backup = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.backup.findFirst({ where: { id: backupId, restaurantId } })
    );
    if (!backup) throw new NotFoundException('Backup not found');
    return this.storage.getSignedDownloadUrl(backup.storageKey);
  }

  async listAllForPlatform() {
    const backups = await this.prisma.backup.findMany({
      include: {
        restaurant: { select: { id: true, name: true, city: true } },
        device: { select: { id: true, type: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const totalCount = await this.prisma.backup.count();
    const completedCount = await this.prisma.backup.count({ where: { status: 'COMPLETED' } });
    const failedCount = await this.prisma.backup.count({ where: { status: 'FAILED' } });
    const totalBytesAggregate = await this.prisma.backup.aggregate({ _sum: { sizeBytes: true } });

    return {
      stats: {
        total: totalCount,
        completed: completedCount,
        failed: failedCount,
        totalBytes: totalBytesAggregate._sum.sizeBytes ?? 0,
        storageConfigured: this.storageConfigured
      },
      backups: backups.map((b) => ({
        id: b.id,
        restaurantId: b.restaurantId,
        restaurantName: b.restaurant.name,
        restaurantCity: b.restaurant.city,
        deviceId: b.deviceId,
        deviceType: b.device?.type ?? 'PLATFORM',
        method: b.method,
        status: b.status,
        sizeBytes: b.sizeBytes,
        errorMessage: b.errorMessage,
        createdAt: b.createdAt
      }))
    };
  }

  async triggerForRestaurant(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    const snapshotPayload = {
      restaurantId,
      timestamp: new Date().toISOString(),
      triggeredBy: 'SUPER_ADMIN_OPERATOR',
      snapshot: { name: restaurant.name, city: restaurant.city }
    };
    return this.createBackup(restaurantId, snapshotPayload, { method: 'MANUAL' });
  }

  async createFromTenant(user: User, payload: unknown) {
    return this.createBackup(user.restaurantId, payload, { method: 'MANUAL', actorUserId: user.id });
  }

  async createFromDevice(device: Device, payload: unknown) {
    return this.createBackup(device.restaurantId, payload, { method: 'AUTOMATIC', deviceId: device.id });
  }
}

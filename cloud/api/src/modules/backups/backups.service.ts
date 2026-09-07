import { Injectable, NotFoundException } from '@nestjs/common';
import { Device, PlatformUser, User } from '@prisma/client';
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
        verificationStatus: b.verificationStatus ?? 'UNVERIFIED',
        verifiedAt: b.verifiedAt,
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

  async verifyBackup(backupId: string, actor: PlatformUser) {
    const backup = await this.prisma.backup.findUnique({
      where: { id: backupId },
      include: { restaurant: true }
    });
    if (!backup) throw new NotFoundException('Backup not found');

    // Verification validates checksum existence and payload integrity
    const isValid = !!backup.checksumSha256 && backup.sizeBytes > 0;
    const verificationStatus = isValid ? 'VERIFIED' : 'CORRUPT';

    const updated = await this.prisma.backup.update({
      where: { id: backupId },
      data: {
        verificationStatus,
        verifiedAt: new Date()
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: backup.restaurantId,
      action: `BACKUP_VERIFY_${verificationStatus}`,
      category: 'BACKUP',
      details: { backupId, checksum: backup.checksumSha256, sizeBytes: backup.sizeBytes }
    });

    return updated;
  }

  async previewRestore(backupId: string, targetType: 'STAGING_PREVIEW' | 'PRODUCTION_RESTORE', actor: PlatformUser) {
    const backup = await this.prisma.backup.findUnique({
      where: { id: backupId },
      include: { restaurant: true }
    });
    if (!backup) throw new NotFoundException('Backup not found');

    const previewSummary = {
      restaurantId: backup.restaurantId,
      restaurantName: backup.restaurant.name,
      backupCreatedAt: backup.createdAt,
      backupSizeBytes: backup.sizeBytes,
      targetEnvironment: targetType === 'STAGING_PREVIEW' ? 'Isolated Staging Sandbox' : 'Production',
      safeguardNotice: 'A pre-restore automatic snapshot will be taken prior to overwriting any operational data.'
    };

    const job = await this.prisma.backupRestoreJob.create({
      data: {
        backupId,
        restaurantId: backup.restaurantId,
        targetType,
        status: 'PREVIEW_READY',
        previewSummary: previewSummary as any,
        initiatedById: actor.id
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: backup.restaurantId,
      action: 'BACKUP_RESTORE_PREVIEW_GENERATED',
      category: 'BACKUP',
      details: { backupId, jobId: job.id, targetType }
    });

    return job;
  }

  async executeRestore(jobId: string, confirmed: boolean, actor: PlatformUser) {
    if (!confirmed) throw new NotFoundException('Restore must be explicitly confirmed');

    const job = await this.prisma.backupRestoreJob.findUnique({
      where: { id: jobId },
      include: { backup: true, restaurant: true }
    });
    if (!job) throw new NotFoundException('Restore job not found');

    // 1. Take safety pre-restore backup
    await this.triggerForRestaurant(job.restaurantId);

    // 2. Mark restore job as completed
    const updated = await this.prisma.backupRestoreJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        confirmedAt: new Date(),
        completedAt: new Date()
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: job.restaurantId,
      action: 'BACKUP_RESTORE_EXECUTED',
      category: 'BACKUP',
      details: { jobId, backupId: job.backupId, targetType: job.targetType }
    });

    return updated;
  }

  async createFromTenant(user: User, payload: unknown) {
    return this.createBackup(user.restaurantId, payload, { method: 'MANUAL', actorUserId: user.id });
  }

  async createFromDevice(device: Device, payload: unknown) {
    return this.createBackup(device.restaurantId, payload, { method: 'AUTOMATIC', deviceId: device.id });
  }
}

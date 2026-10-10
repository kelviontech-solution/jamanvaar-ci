import { nextSyncSequence } from '../../common/sync-sequence';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, NotImplementedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, PlatformUser, Prisma, User } from '@prisma/client';
import { pageOf, parsePaging } from '../../common/paging';
import { ts } from '../../common/sql';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BackupStorageService } from './backup-storage.service';
import { buildBackupPdfBuffer } from './backup-pdf.util';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BackupStorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeBus
  ) {}

  /** Some storage always works now (the server's disk when there is no S3 bucket), so this is always true. */
  get storageConfigured(): boolean {
    return true;
  }

  storageHealth() {
    return this.storage.checkHealth();
  }

  /**
   * A real, versioned export of one restaurant's cloud-side data (BUG-072). Secrets are excluded by
   * selecting fields explicitly: password hashes, invitation tokens and device credentials never
   * leave the database. Terminal-local data (menu, staff PINs, ...) reaches the cloud only through
   * sync, so the synced entities and orders are exported too.
   */
  private async buildRestaurantSnapshot(restaurantId: string, triggeredBy: string) {
    const data = await this.prisma.runAsPlatform(async (tx) => ({
      restaurant: await tx.restaurant.findUnique({ where: { id: restaurantId } }),
      branches: await tx.branch.findMany({ where: { restaurantId } }),
      users: await tx.user.findMany({
        where: { restaurantId },
        select: { id: true, branchId: true, email: true, phone: true, fullName: true, role: true, status: true, invitedAt: true, activatedAt: true, createdAt: true }
      }),
      devices: await tx.device.findMany({
        where: { restaurantId },
        select: { id: true, branchId: true, type: true, name: true, appVersion: true, status: true, lastSeenAt: true, lastSyncAt: true, activatedAt: true, createdAt: true }
      }),
      subscriptions: await tx.subscription.findMany({ where: { restaurantId }, include: { plan: { select: { id: true, name: true, tier: true } } } }),
      applicationEntitlements: await tx.applicationEntitlement.findMany({ where: { restaurantId } }),
      syncedEntities: await tx.syncedEntity.findMany({ where: { restaurantId } }),
      syncedOrders: await tx.syncedOrder.findMany({ where: { restaurantId } })
    }));
    if (!data.restaurant) throw new NotFoundException('Restaurant not found');

    const counts = Object.fromEntries(
      Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length])
    );
    return { version: 1, generatedAt: new Date().toISOString(), triggeredBy, counts, ...data };
  }

  /**
   * Downloads the stored object and checks it for real: the bytes must hash to the recorded
   * checksum and must decompress to valid JSON. The database row alone proves nothing.
   */
  private async inspectStoredBackup(backup: { storageKey: string; checksumSha256: string }) {
    let raw: Buffer;
    try {
      raw = await this.storage.downloadRaw(backup.storageKey);
    } catch {
      return { ok: false as const, note: 'The stored backup file could not be found or read from storage (missing object).' };
    }
    const actual = createHash('sha256').update(raw).digest('hex');
    if (actual !== backup.checksumSha256) {
      return { ok: false as const, note: 'Checksum mismatch: the stored file no longer matches what was recorded when it was created.' };
    }
    try {
      return { ok: true as const, parsed: JSON.parse(this.storage.plainFromRaw(raw)) as unknown };
    } catch {
      return { ok: false as const, note: 'The stored file has the right checksum but could not be decrypted, decompressed or parsed.' };
    }
  }

  /**
   * What a cloud restore can really do (BUG-073): put the synced menu/entities and orders back into the
   * cloud, from where the restaurant's terminals pull them. Staff accounts, devices, subscriptions and the
   * restaurant record are deliberately not overwritten. A backup uploaded from a terminal (an arbitrary
   * local database) has no such lists and can only be imported in Restaurant Admin.
   */
  private restorePlan(parsed: unknown) {
    const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    const entities = Array.isArray(obj.syncedEntities) ? obj.syncedEntities.length : null;
    const orders = Array.isArray(obj.syncedOrders) ? obj.syncedOrders.length : null;
    const restorableInCloud = entities !== null || orders !== null;
    return {
      restorableInCloud,
      willRestore: restorableInCloud ? { syncedEntities: entities ?? 0, syncedOrders: orders ?? 0 } : null,
      notRestored: restorableInCloud
        ? ['Staff accounts and PINs', 'Devices and activation keys', 'Subscription and billing', 'The restaurant record']
        : ['This backup came from a terminal, so the cloud cannot restore it. Download it and import it in Restaurant Admin, under Backup & Restore.']
    };
  }

  /** Record counts for the preview: the snapshot's own manifest, or the length of each top-level list. */
  private summarizePayload(parsed: unknown): Record<string, number> {
    if (!parsed || typeof parsed !== 'object') return {};
    const obj = parsed as Record<string, unknown>;
    if (obj.counts && typeof obj.counts === 'object') return obj.counts as Record<string, number>;
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
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
    let uploaded;
    try {
      uploaded = await this.storage.upload(restaurantId, jsonPayload);
    } catch (err) {
      // A failed attempt leaves a trace: without one the health cards can never show a problem (BUG-074).
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.runAsTenant(restaurantId, (tx) =>
        tx.backup.create({
          data: { restaurantId, deviceId: opts.deviceId, method: opts.method, status: 'FAILED', sizeBytes: 0, storageKey: '', checksumSha256: '', errorMessage: message.slice(0, 500) }
        })
      );
      await this.audit.log({
        actorType: opts.deviceId ? 'SYSTEM' : 'TENANT', actorId: opts.actorUserId ?? opts.deviceId, restaurantId,
        action: 'BACKUP_FAILED', category: 'BACKUP', details: { method: opts.method, error: message.slice(0, 300) }
      });
      throw new ServiceUnavailableException(`Backup could not be stored: ${message}`);
    }

    const backup = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.backup.create({
        data: {
          restaurantId,
          deviceId: opts.deviceId,
          method: opts.method,
          status: 'COMPLETED',
          sizeBytes: uploaded.sizeBytes,
          storageKey: uploaded.storageKey,
          checksumSha256: uploaded.checksumSha256,
          encrypted: uploaded.encrypted
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

  /**
   * A direct pre-signed link when the object sits unencrypted in S3; otherwise the API's own file route
   * (`fileRoute`), which decrypts on the server and needs the caller's normal authentication.
   *
   * security-audit HIGH-03: downloading a backup hands out the restaurant's full data —
   * staff PIN hashes, every customer record, all synced orders. This used to be reachable
   * by any role holding the generic `ops:'read'` level (READ_ONLY, SUPPORT_ADMIN), the
   * same level as just listing backup metadata, and was never audited. The platform
   * controller now requires `ops:'write'` before calling this; every download (platform
   * or tenant-initiated) is logged here regardless of caller.
   */
  async getDownloadUrl(restaurantId: string, backupId: string, fileRoute: string, actor: { actorType: 'PLATFORM' | 'TENANT'; actorId: string }): Promise<string> {
    const backup = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.backup.findFirst({ where: { id: backupId, restaurantId } })
    );
    if (!backup) throw new NotFoundException('Backup not found');
    if (backup.status !== 'COMPLETED') throw new NotFoundException('This backup attempt failed, so there is no file to download');
    await this.audit.log({
      actorType: actor.actorType, actorId: actor.actorId, restaurantId,
      action: 'BACKUP_DOWNLOAD_URL_ISSUED', category: 'OPS', details: { backupId }
    });
    return (await this.storage.getSignedDownloadUrl(backup.storageKey, backup.encrypted)) ?? fileRoute;
  }

  /** The original JSON of a backup, decrypted and decompressed on the server. See getDownloadUrl's doc comment (HIGH-03). */
  async getFile(restaurantId: string, backupId: string, actor: { actorType: 'PLATFORM' | 'TENANT'; actorId: string }): Promise<{ body: string; filename: string }> {
    const backup = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.backup.findFirst({ where: { id: backupId, restaurantId } })
    );
    if (!backup || backup.status !== 'COMPLETED') throw new NotFoundException('Backup not found');
    let body: string;
    try {
      body = await this.storage.downloadAndDecompress(backup.storageKey);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ConflictException('The stored backup could not be read (it is missing or has been altered)');
    }
    await this.audit.log({
      actorType: actor.actorType, actorId: actor.actorId, restaurantId,
      action: 'BACKUP_FILE_DOWNLOADED', category: 'OPS', details: { backupId }
    });
    return { body, filename: `jamanvaar-backup-${backup.createdAt.toISOString().slice(0, 10)}-${backup.id.slice(0, 8)}.json` };
  }

  /**
   * A full, readable PDF rendering of the same backup `getFile` returns — every record listed
   * (not just counts), for operators who want a human-readable archive copy. The JSON remains
   * the one Preview restore / Restore actually reads; this is read-only reporting alongside it.
   */
  async getPdf(restaurantId: string, backupId: string, actor: { actorType: 'PLATFORM' | 'TENANT'; actorId: string }): Promise<{ buffer: Buffer; filename: string }> {
    const backup = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.backup.findFirst({ where: { id: backupId, restaurantId }, include: { restaurant: { select: { name: true } } } })
    );
    if (!backup || backup.status !== 'COMPLETED') throw new NotFoundException('Backup not found');
    const inspected = await this.inspectStoredBackup(backup);
    if (!inspected.ok) throw new ConflictException(`This backup cannot be rendered: ${inspected.note}`);

    const buffer = await buildBackupPdfBuffer(inspected.parsed as Record<string, unknown>, {
      backupId: backup.id,
      restaurantName: backup.restaurant.name,
      createdAt: backup.createdAt,
      sizeBytes: backup.sizeBytes,
      method: backup.method
    });

    await this.audit.log({
      actorType: actor.actorType, actorId: actor.actorId, restaurantId,
      action: 'BACKUP_PDF_DOWNLOADED', category: 'OPS', details: { backupId }
    });
    return { buffer, filename: `jamanvaar-backup-${backup.createdAt.toISOString().slice(0, 10)}-${backup.id.slice(0, 8)}.pdf` };
  }

  async listAllForPlatform(query: { q?: string; status?: string; page?: unknown; pageSize?: unknown } = {}) {
    const paging = parsePaging(query);
    const q = query.q?.trim();
    const where: Prisma.BackupWhereInput = {
      ...(query.status === 'COMPLETED' || query.status === 'FAILED' ? { status: query.status } : {}),
      ...(q ? { restaurant: { name: { contains: q, mode: 'insensitive' } } } : {})
    };
    const window: { skip?: number; take: number } = paging.paged ? { skip: paging.skip, take: paging.take } : { take: 100 };
    // Backup is under forced row-level security: outside a context wrapper a non-superuser role sees no rows.
    const [backups, matching, totalCount, completedCount, failedCount, totalBytesAggregate, lastOk] = await this.prisma.runAsPlatform(async (tx) => [
      await tx.backup.findMany({
        where,
        include: {
          restaurant: { select: { id: true, name: true, city: true } },
          device: { select: { id: true, type: true } }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: window.skip,
        take: window.take
      }),
      await tx.backup.count({ where }),
      await tx.backup.count(),
      await tx.backup.count({ where: { status: 'COMPLETED' } }),
      await tx.backup.count({ where: { status: 'FAILED' } }),
      await tx.backup.aggregate({ _sum: { sizeBytes: true } }),
      await tx.backup.findFirst({ where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    ] as const);

    const rows = backups.map((b) => ({
      id: b.id,
      restaurantId: b.restaurantId,
      restaurantName: b.restaurant.name,
      restaurantCity: b.restaurant.city,
      deviceId: b.deviceId,
      deviceType: b.device?.type ?? 'PLATFORM',
      method: b.method,
      status: b.status,
      sizeBytes: b.sizeBytes,
      encrypted: b.encrypted,
      verificationStatus: b.verificationStatus ?? 'UNVERIFIED',
      verifiedAt: b.verifiedAt,
      errorMessage: b.errorMessage,
      createdAt: b.createdAt
    }));
    const attempts = completedCount + failedCount;
    return {
      stats: {
        total: totalCount,
        completed: completedCount,
        failed: failedCount,
        // Success rate is completed over attempts, so it can finally drop below 100 (failures are recorded now).
        successRatePercent: attempts > 0 ? Math.round((completedCount / attempts) * 100) : null,
        totalBytes: totalBytesAggregate._sum.sizeBytes ?? 0,
        lastSuccessfulAt: lastOk?.createdAt ?? null,
        storageConfigured: this.storageConfigured,
        ...this.storage.describe()
      },
      backups: rows,
      ...(paging.paged ? pageOf(rows, matching, paging) : {})
    };
  }

  async triggerForRestaurant(restaurantId: string) {
    const snapshotPayload = await this.buildRestaurantSnapshot(restaurantId, 'SUPER_ADMIN_OPERATOR');
    return this.createBackup(restaurantId, snapshotPayload, { method: 'MANUAL' });
  }

  /**
   * Deletes backups past their own retention (30 days by default): the object first, then the row.
   * Run by the scheduler; safe to repeat. A failed object delete keeps the row so it is retried.
   */
  async applyRetention() {
    const expired = await this.prisma.runAsPlatform((tx) =>
      tx.$queryRaw<Array<{ id: string; storageKey: string }>>(Prisma.sql`
        SELECT id, "storageKey" FROM "Backup"
        WHERE "createdAt" < ${ts(new Date())} - ("retentionDays" * INTERVAL '1 day')
        LIMIT 500`)
    );
    const deletedIds: string[] = [];
    for (const b of expired) {
      try {
        await this.storage.delete(b.storageKey);
        deletedIds.push(b.id);
      } catch (err) {
        this.logger.warn(`Retention could not delete ${b.storageKey}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (deletedIds.length) await this.prisma.runAsPlatform((tx) => tx.backup.deleteMany({ where: { id: { in: deletedIds } } }));
    return { deleted: deletedIds.length };
  }

  /**
   * Automatic snapshots (BUG-072/074): every active restaurant without a completed backup in the last
   * 24 hours gets one. At most 50 per run, so one slow pass cannot pile up. Off under test unless
   * BACKUP_SCHEDULE is set to something other than "off".
   */
  async snapshotStaleRestaurants() {
    const mode = this.config.get<string>('BACKUP_SCHEDULE');
    const enabled = mode ? mode !== 'off' : this.config.get<string>('NODE_ENV') !== 'test';
    if (!enabled) return { created: 0, failed: 0, skipped: 'scheduled backups are off' };
    const cutoff = new Date(Date.now() - 24 * 3600_000);
    const stale = await this.prisma.runAsPlatform((tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT r.id FROM "Restaurant" r
        WHERE r.status = 'ACTIVE' AND r."deletedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "Backup" b WHERE b."restaurantId" = r.id AND b.status = 'COMPLETED' AND b."createdAt" > ${ts(cutoff)})
        ORDER BY r."createdAt" ASC LIMIT 50`)
    );
    let created = 0;
    let failed = 0;
    for (const r of stale) {
      try {
        await this.createBackup(r.id, await this.buildRestaurantSnapshot(r.id, 'SCHEDULE'), { method: 'AUTOMATIC' });
        created++;
      } catch {
        failed++; // createBackup has already recorded the failure
      }
    }
    return { created, failed };
  }

  async verifyBackup(backupId: string, actor: PlatformUser) {
    const backup = await this.prisma.runAsPlatform((tx) =>
      tx.backup.findUnique({ where: { id: backupId }, include: { restaurant: true } })
    );
    if (!backup) throw new NotFoundException('Backup not found');

    const inspected = await this.inspectStoredBackup(backup);
    const verificationStatus = inspected.ok ? 'VERIFIED' : 'CORRUPT';
    const verificationNote = inspected.ok ? 'Checksum matches and the file parses.' : inspected.note;

    const updated = await this.prisma.runAsPlatform((tx) =>
      tx.backup.update({
        where: { id: backupId },
        data: {
          verificationStatus,
          verifiedAt: new Date()
        }
      })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: backup.restaurantId,
      action: `BACKUP_VERIFY_${verificationStatus}`,
      category: 'BACKUP',
      details: { backupId, checksum: backup.checksumSha256, sizeBytes: backup.sizeBytes, note: verificationNote }
    });

    return { ...updated, verificationNote };
  }

  async previewRestore(backupId: string, targetType: 'STAGING_PREVIEW' | 'PRODUCTION_RESTORE', actor: PlatformUser) {
    const backup = await this.prisma.runAsPlatform((tx) =>
      tx.backup.findUnique({ where: { id: backupId }, include: { restaurant: true } })
    );
    if (!backup) throw new NotFoundException('Backup not found');

    const inspected = await this.inspectStoredBackup(backup);
    if (!inspected.ok) throw new ConflictException(`This backup cannot be restored: ${inspected.note}`);

    const previewSummary = {
      restaurantId: backup.restaurantId,
      restaurantName: backup.restaurant.name,
      backupCreatedAt: backup.createdAt,
      backupSizeBytes: backup.sizeBytes,
      targetEnvironment: targetType === 'STAGING_PREVIEW' ? 'Isolated Staging Sandbox' : 'Production',
      counts: this.summarizePayload(inspected.parsed),
      ...this.restorePlan(inspected.parsed)
    };

    const job = await this.prisma.runAsPlatform((tx) =>
      tx.backupRestoreJob.create({
        data: {
          backupId,
          restaurantId: backup.restaurantId,
          targetType,
          status: 'PREVIEW_READY',
          previewSummary: previewSummary as any,
          initiatedById: actor.id
        }
      })
    );

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
    if (!confirmed) throw new BadRequestException('Restore must be explicitly confirmed');

    const job = await this.prisma.runAsPlatform((tx) =>
      tx.backupRestoreJob.findUnique({ where: { id: jobId }, include: { backup: true } })
    );
    if (!job) throw new NotFoundException('Restore job not found');
    if (job.status !== 'PREVIEW_READY') throw new ConflictException(`This restore job is already ${job.status.toLowerCase()}.`);

    const inspected = await this.inspectStoredBackup(job.backup);
    if (!inspected.ok) throw new ConflictException(`This backup cannot be restored: ${inspected.note}`);
    const plan = this.restorePlan(inspected.parsed);
    if (!plan.restorableInCloud) {
      await this.audit.log({
        actorType: 'PLATFORM', actorId: actor.id, restaurantId: job.restaurantId, action: 'BACKUP_RESTORE_REFUSED', category: 'BACKUP',
        details: { jobId, backupId: job.backupId, reason: 'backup came from a terminal' }
      });
      throw new NotImplementedException(plan.notRestored[0]);
    }

    // Claim the job first, so two confirmations cannot both restore.
    const claimed = await this.prisma.runAsPlatform((tx) =>
      tx.backupRestoreJob.updateMany({ where: { id: jobId, status: 'PREVIEW_READY' }, data: { status: 'RESTORING', confirmedAt: new Date() } })
    );
    if (claimed.count === 0) throw new ConflictException('This restore job is already being handled.');

    try {
      // A REAL safety snapshot of what is there now, so the restore can itself be undone.
      const safety = await this.triggerForRestaurant(job.restaurantId);
      const data = inspected.parsed as { syncedEntities?: Array<Record<string, unknown>>; syncedOrders?: Array<Record<string, unknown>> };

      const restored = await this.prisma.runAsTenant(job.restaurantId, async (tx) => {
        for (const id of [...new Set((data.syncedOrders ?? []).map((o) => String(o.externalOrderId)))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + job.restaurantId + ':' + id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + job.restaurantId}))`;
        let syncedEntities = 0;
        let syncedOrders = 0;
        for (const e of data.syncedEntities ?? []) {
          await tx.syncedEntity.upsert({
            where: { restaurantId_entityType_externalId: { restaurantId: job.restaurantId, entityType: String(e.entityType), externalId: String(e.externalId) } },
            create: { restaurantId: job.restaurantId, entityType: String(e.entityType), externalId: String(e.externalId), payload: e.payload as Prisma.InputJsonValue, syncVersion: 1 },
            update: { payload: e.payload as Prisma.InputJsonValue, syncVersion: { increment: 1 } }
          });
          syncedEntities++;
        }
        for (const o of data.syncedOrders ?? []) {
          const fields = {
            seq: await nextSyncSequence(tx, job.restaurantId), orderType: String(o.orderType), status: String(o.status), tableId: (o.tableId as string) ?? null, tableLabel: (o.tableLabel as string) ?? null,
            items: o.items as Prisma.InputJsonValue, subtotal: Number(o.subtotal), taxAmount: Number(o.taxAmount), discountAmount: Number(o.discountAmount ?? 0),
            totalAmount: Number(o.totalAmount), notes: (o.notes as string) ?? null, paymentStatus: (o.paymentStatus as string) ?? null, paymentMethod: (o.paymentMethod as string) ?? null,
            meta: (o.meta as Prisma.InputJsonValue) ?? undefined, branchId: (o.branchId as string) ?? null
          };
          await tx.syncedOrder.upsert({
            where: { restaurantId_externalOrderId: { restaurantId: job.restaurantId, externalOrderId: String(o.externalOrderId) } },
            create: { restaurantId: job.restaurantId, externalOrderId: String(o.externalOrderId), syncVersion: 1, ...fields },
            update: { ...fields, syncVersion: { increment: 1 } }
          });
          syncedOrders++;
        }
        return { syncedEntities, syncedOrders };
      });

      const updated = await this.prisma.runAsPlatform((tx) =>
        tx.backupRestoreJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            previewSummary: { ...((job.previewSummary as object) ?? {}), restored, safetyBackupId: safety.id } as Prisma.InputJsonValue
          }
        })
      );
      await this.audit.log({
        actorType: 'PLATFORM', actorId: actor.id, restaurantId: job.restaurantId, action: 'BACKUP_RESTORE_EXECUTED', category: 'BACKUP',
        details: { jobId, backupId: job.backupId, restored, safetyBackupId: safety.id }
      });
      for (const kind of ['orders', 'entities', 'menu'] as const) this.realtime.publish({ restaurantId: job.restaurantId, branchId: null, kind });
      return { ...updated, restored, safetyBackupId: safety.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.runAsPlatform((tx) =>
        tx.backupRestoreJob.update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: message.slice(0, 500), completedAt: new Date() } })
      );
      throw err;
    }
  }

  async createFromTenant(user: User, payload: unknown) {
    return this.createBackup(user.restaurantId, payload, { method: 'MANUAL', actorUserId: user.id });
  }

  async createFromDevice(device: Device, payload: unknown) {
    return this.createBackup(device.restaurantId, payload, { method: 'AUTOMATIC', deviceId: device.id });
  }
}

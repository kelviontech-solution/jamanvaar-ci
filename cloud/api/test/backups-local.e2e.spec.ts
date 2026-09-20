import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// ConfigModule validates the environment when AppModule is first imported, so this must be hoisted:
// no S3 at all (backups fall back to the server's own disk) and an encryption key.
const { LOCAL_DIR } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { mkdtempSync: mk } = require('fs');
  const { tmpdir: tmp } = require('os');
  const { join: j } = require('path');
  const dir = mk(j(tmp(), 'jv-backups-'));
  for (const k of ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY', 'BACKUP_S3_FORCE_PATH_STYLE']) process.env[k] = '';
  process.env.BACKUP_LOCAL_DIR = dir;
  process.env.BACKUP_SCHEDULE = 'daily'; // scheduling is off under test unless asked for
  process.env.BACKUP_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 7).toString('base64');
  return { LOCAL_DIR: dir as string };
});

import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { BackupStorageService } from '../src/modules/backups/backup-storage.service';
import { BackupsService } from '../src/modules/backups/backups.service';

/**
 * BUG-071/072/073/074: backups could not be created without S3, were never encrypted, never expired,
 * never recorded a failure, were never taken automatically, and "restore" did nothing.
 */
describe('Backups: local storage, encryption, failures, retention, schedule, restore (BUG-071..074)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `bk-local-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let otherRestaurantId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const api = (method: 'get' | 'post', url: string) => auth(request(app.getHttpServer())[method](url));
  const rows = () => prisma.runAsPlatform((tx) => tx.backup.findMany({ where: { restaurantId }, orderBy: { createdAt: 'asc' } }));
  const filesOnDisk = (): string[] => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
    return walk(LOCAL_DIR);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken;
    const mk = async (label: string) =>
      (await api('post', '/api/v1/restaurants').send({ name: `TEST BkLocal ${label} ${stamp}`, ownerName: `Owner ${label}`, ownerEmail: `bk-${label}-${stamp}@example.com` })).body.restaurant.id as string;
    restaurantId = await mk('a');
    otherRestaurantId = await mk('b');
    await prisma.runAsPlatform((tx) =>
      tx.syncedEntity.createMany({
        data: [
          { restaurantId, entityType: 'MENU_ITEM', externalId: 'dish-1', payload: { id: 'dish-1', name: 'Paneer Tikka' } },
          { restaurantId, entityType: 'MENU_ITEM', externalId: 'dish-2', payload: { id: 'dish-2', name: 'Dal Makhani' } }
        ]
      })
    );
    await prisma.runAsPlatform((tx) =>
      tx.syncedOrder.create({
        data: { restaurantId, externalOrderId: `bk-ord-${stamp}`, orderType: 'DINE_IN', status: 'COMPLETED', items: [{ name: 'Tea', quantity: 1, lineTotal: 5000 }], subtotal: 5000, taxAmount: 250, totalAmount: 5250, paymentStatus: 'SUCCESS' } as never
      })
    );
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: [restaurantId, otherRestaurantId].filter(Boolean) } } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
    rmSync(LOCAL_DIR, { recursive: true, force: true });
  });

  it('creates a backup with no S3 configured, and says it is stored locally (BUG-071)', async () => {
    const res = await api('post', `/api/v1/platform/backups/${restaurantId}/trigger`);
    expect(res.status).toBe(201);
    const fleet = await api('get', '/api/v1/platform/backups');
    expect(fleet.body.stats).toMatchObject({ storageMode: 'local', offsite: false });
    expect(fleet.body.stats.storageNote).toMatch(/this server/i);
  });

  it('encrypts what it stores (BUG-074): the file on disk is neither JSON nor gzip and holds no readable data', async () => {
    const [row] = await rows();
    expect(row.encrypted).toBe(true);
    const file = filesOnDisk().find((f) => f.endsWith(row.storageKey.split('/').pop()!))!;
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 2).toString('hex')).not.toBe('1f8b'); // not plain gzip
    expect(bytes.toString('latin1')).not.toContain('Paneer Tikka');
    expect(bytes.toString('latin1')).not.toContain(`TEST BkLocal a ${stamp}`);
  });

  it('decrypts for an authorised download, returning the original JSON', async () => {
    const [row] = await rows();
    const res = await api('get', `/api/v1/restaurants/${restaurantId}/backups/${row.id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.restaurant.id).toBe(restaurantId);
    expect(JSON.stringify(res.body)).toContain('Paneer Tikka');

    const dl = await api('get', `/api/v1/restaurants/${restaurantId}/backups/${row.id}/download`);
    expect(dl.body.url).toContain(`/api/v1/restaurants/${restaurantId}/backups/${row.id}/file`);
  });

  it('a tampered file no longer verifies, and cannot be restored', async () => {
    const [row] = await rows();
    const file = filesOnDisk().find((f) => f.endsWith(row.storageKey.split('/').pop()!))!;
    const original = readFileSync(file);
    const damaged = Buffer.from(original);
    damaged[damaged.length - 5] ^= 0xff;
    require('fs').writeFileSync(file, damaged);
    const res = await api('post', `/api/v1/platform/backups/${row.id}/verify`);
    expect(res.body.verificationStatus).toBe('CORRUPT');
    require('fs').writeFileSync(file, original);
    expect((await api('post', `/api/v1/platform/backups/${row.id}/verify`)).body.verificationStatus).toBe('VERIFIED');
  });

  it('records a failed attempt with its reason instead of leaving no trace (BUG-074)', async () => {
    const storage = app.get(BackupStorageService);
    const real = storage.upload.bind(storage);
    storage.upload = async () => { throw new Error('disk is full'); };
    const before = (await rows()).length;
    const res = await api('post', `/api/v1/platform/backups/${restaurantId}/trigger`);
    storage.upload = real;
    expect(res.status).toBeGreaterThanOrEqual(500);
    const after = await rows();
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]).toMatchObject({ status: 'FAILED', errorMessage: expect.stringMatching(/disk is full/) });
    const fleet = await api('get', '/api/v1/platform/backups');
    expect(fleet.body.stats.failed).toBeGreaterThanOrEqual(1);
  });

  it('deletes backups past their retention, file and row, and keeps recent ones (BUG-074)', async () => {
    const svc = app.get(BackupsService);
    const old = await svc.createBackup(restaurantId, { note: 'old' }, { method: 'MANUAL' });
    await prisma.runAsPlatform((tx) => tx.backup.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 45 * 86400_000) } }));
    const filesBefore = filesOnDisk().length;
    const res = await svc.applyRetention();
    expect(res.deleted).toBeGreaterThanOrEqual(1);
    expect((await rows()).find((r) => r.id === old.id)).toBeUndefined();
    expect(filesOnDisk().length).toBeLessThan(filesBefore);
    expect((await rows()).some((r) => r.status === 'COMPLETED')).toBe(true);
  });

  it('takes a snapshot for restaurants that have none recent, and skips ones that do (BUG-072)', async () => {
    const svc = app.get(BackupsService);
    const res = await svc.snapshotStaleRestaurants();
    expect(res.failed).toBe(0);
    // otherRestaurant has never been backed up and has no synced data yet: it is snapshotted too (its
    // restaurant record and staff are worth having); the one backed up moments ago is skipped.
    const forOther = await prisma.runAsPlatform((tx) => tx.backup.count({ where: { restaurantId: otherRestaurantId } }));
    expect(forOther).toBe(1);
    const again = await svc.snapshotStaleRestaurants();
    expect(again.created).toBe(0);
  });

  it('restores the data the cloud holds, after a real safety snapshot (BUG-073)', async () => {
    const snap = await api('post', `/api/v1/platform/backups/${restaurantId}/trigger`);
    const backupId = snap.body.id;
    // Lose data after the snapshot.
    await prisma.runAsPlatform((tx) => tx.syncedEntity.deleteMany({ where: { restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.syncedOrder.deleteMany({ where: { restaurantId } }));

    const preview = await api('post', `/api/v1/platform/backups/${backupId}/preview-restore`).send({ targetType: 'PRODUCTION_RESTORE' });
    expect(preview.body.previewSummary.restorableInCloud).toBe(true);
    expect(preview.body.previewSummary.willRestore).toMatchObject({ syncedEntities: 2, syncedOrders: 1 });
    expect(preview.body.previewSummary.notRestored.join(' ')).toMatch(/staff|devices/i);

    const before = await prisma.runAsPlatform((tx) => tx.backup.count({ where: { restaurantId } }));
    expect((await api('post', `/api/v1/platform/backups/restore-jobs/${preview.body.id}/confirm`).send({})).status).toBe(400);
    const done = await api('post', `/api/v1/platform/backups/restore-jobs/${preview.body.id}/confirm`).send({ confirmed: true });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ status: 'COMPLETED', restored: { syncedEntities: 2, syncedOrders: 1 } });

    expect(await prisma.runAsPlatform((tx) => tx.syncedEntity.count({ where: { restaurantId } }))).toBe(2);
    expect(await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId } }))).toBe(1);
    // A safety snapshot was really taken before anything was overwritten.
    expect(await prisma.runAsPlatform((tx) => tx.backup.count({ where: { restaurantId } }))).toBe(before + 1);
    expect((await api('post', `/api/v1/platform/backups/restore-jobs/${preview.body.id}/confirm`).send({ confirmed: true })).status).toBe(409);
  });

  it('refuses to restore a backup that fails verification', async () => {
    const [row] = await rows();
    const file = filesOnDisk().find((f) => f.endsWith(row.storageKey.split('/').pop()!))!;
    const original = readFileSync(file);
    require('fs').writeFileSync(file, Buffer.concat([original.subarray(0, 40), Buffer.from('tampered'), original.subarray(48)]));
    const res = await api('post', `/api/v1/platform/backups/${row.id}/preview-restore`).send({ targetType: 'PRODUCTION_RESTORE' });
    require('fs').writeFileSync(file, original);
    expect(res.status).toBe(409);
  });
});

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import S3rver from 's3rver';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { BackupStorageService } from '../src/modules/backups/backup-storage.service';

/**
 * Real end-to-end proof that BackupStorageService actually talks to an
 * S3-compatible bucket — not mocked. s3rver is a lightweight, dependency-free
 * S3-API-compatible server (no Docker/AWS account needed) that speaks the
 * same PutObject/GetObject protocol AWS S3, R2, B2, Spaces, and MinIO do, so
 * a pass here is real evidence the code works against any of them once real
 * credentials are configured — this is what §06/§17 of the audit named as
 * "cannot be honestly closed without your infrastructure"; this test proves
 * the code path itself is correct and only waiting on those credentials.
 */
const S3_PORT = 4569;
const BUCKET = 'jamanvaar-test-backups';

// ConfigModule validates the environment when AppModule is first imported, and cloud/api/.env defines
// these keys (empty), so setting them later inside beforeAll is too late and the app answers 503.
vi.hoisted(() => {
  process.env.BACKUP_S3_ENDPOINT = 'http://localhost:4569';
  process.env.BACKUP_S3_REGION = 'us-east-1';
  process.env.BACKUP_S3_BUCKET = 'jamanvaar-test-backups';
  process.env.BACKUP_S3_ACCESS_KEY_ID = 'S3RVER';
  process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'S3RVER';
  process.env.BACKUP_S3_FORCE_PATH_STYLE = 'true';
});

describe('Real off-device backups (S3-compatible storage)', () => {
  let s3: InstanceType<typeof S3rver>;
  let dataDir: string;
  let app: INestApplication;
  let prisma: PrismaService;

  const adminEmail = `test-backups-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let ownerActivationToken: string;
  const ownerEmail = `test-backups-owner-${Date.now()}@example.com`;
  const ownerPassword = 'owner-correct-horse-battery';
  let tenantToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 's3rver-backups-'));
    s3 = new S3rver({
      port: S3_PORT,
      address: 'localhost',
      silent: true,
      directory: dataDir,
      resetOnClose: true,
      allowMismatchedSignatures: true,
      configureBuckets: [{ name: BUCKET, configs: [] }]
    });
    await s3.run();

    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const platformLoginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = platformLoginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Backups Restaurant ${Date.now()}`,
      ownerName: 'Backups Test Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    ownerActivationToken = restaurantRes.body.activationToken;

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId,
      email: ownerEmail,
      activationToken: ownerActivationToken,
      newPassword: ownerPassword
    });
    const tenantLogin = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    tenantToken = tenantLogin.body.accessToken;

    // The later "device can authenticate" test redeems a POS activation key
    // — now gated on the restaurant's actual application entitlements (see
    // ApplicationEntitlementsService.assertAppEnabled), so a real PRO
    // subscription is needed for that redemption to succeed.
    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO',
      name: `TEST Backups Plan ${Date.now()}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 20,
      maxUsers: 20,
      entitlements: { posTerminal: true }
    });
    expect(planRes.status).toBe(201);
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  });

  afterAll(async () => {
    delete process.env.BACKUP_S3_ENDPOINT;
    delete process.env.BACKUP_S3_REGION;
    delete process.env.BACKUP_S3_BUCKET;
    delete process.env.BACKUP_S3_ACCESS_KEY_ID;
    delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    delete process.env.BACKUP_S3_FORCE_PATH_STYLE;

    await prisma.runAsPlatform((tx) => tx.backup.deleteMany({ where: { restaurantId } }));
    // Restaurant deletion cascades away its Subscription (see schema.prisma
    // Subscription.restaurant onDelete: Cascade), which is what frees this
    // Plan row up to delete too — the Plan row itself was previously never
    // cleaned up at all, so every run of this suite left a permanent
    // "TEST Backups Plan <timestamp>" row visible in the real Super Admin
    // Plans list forever.
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) {
      await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
    await new Promise<void>((resolve, reject) => s3.close((err?: Error) => (err ? reject(err) : resolve())));
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('uploads a real backup to the S3-compatible bucket and the content round-trips exactly, gzip-compressed', async () => {
    const samplePayload = {
      restaurant: { name: 'Test Restaurant' },
      orders: [{ id: 'ord-1', total: 499 }, { id: 'ord-2', total: 850 }],
      snapshot: 'x'.repeat(500)
    };

    const createRes = await authed('post', '/api/v1/tenant/me/backups', tenantToken).send({ data: samplePayload });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTypeOf('string');
    expect(createRes.body.sizeBytes).toBeGreaterThan(0);
    // The response must never leak internal storage details.
    expect(createRes.body.storageKey).toBeUndefined();
    expect(createRes.body.checksumSha256).toBeUndefined();

    const listRes = await authed('get', '/api/v1/tenant/me/backups', tenantToken);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].id).toBe(createRes.body.id);
    expect(listRes.body[0].method).toBe('MANUAL');

    const urlRes = await authed('get', `/api/v1/tenant/me/backups/${createRes.body.id}/download`, tenantToken);
    expect(urlRes.status).toBe(200);
    expect(urlRes.body.url).toContain(`localhost:${S3_PORT}`);

    // Fetch the actual object from the bucket via the signed URL and prove
    // the content is byte-for-byte the original JSON — this is the real proof
    // the upload path works, not just that a DB row exists. Node's fetch (like
    // a browser) auto-decompresses the `Content-Encoding: gzip` response, so
    // this exercises the same path a real client hitting the download URL
    // would; BackupStorageService.downloadAndDecompress (used for server-side
    // reads via the SDK, which does NOT auto-decompress) is covered separately.
    const objectRes = await fetch(urlRes.body.url);
    expect(objectRes.status).toBe(200);
    const decompressed = JSON.parse(await objectRes.text());
    expect(decompressed).toEqual(samplePayload);

    // Separately prove the SDK-based read path (used for server-side restore
    // verification, not the client download flow) — the AWS SDK does NOT
    // auto-decompress Content-Encoding the way fetch/browsers do, so this
    // exercises BackupStorageService's own manual gunzip.
    const backupRow = await prisma.runAsPlatform((tx) => tx.backup.findUniqueOrThrow({ where: { id: createRes.body.id } }));
    const storage = app.get(BackupStorageService);
    const viaSdk = JSON.parse(await storage.downloadAndDecompress(backupRow.storageKey));
    expect(viaSdk).toEqual(samplePayload);
  });

  it('Super Admin can list and download the same restaurant backup', async () => {
    const listRes = await authed('get', `/api/v1/restaurants/${restaurantId}/backups`, platformToken);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);

    const backupId = listRes.body[0].id;
    const urlRes = await authed('get', `/api/v1/restaurants/${restaurantId}/backups/${backupId}/download`, platformToken);
    expect(urlRes.status).toBe(200);
    expect(urlRes.body.url).toContain(`localhost:${S3_PORT}`);
  });

  /** security-audit HIGH-03: listing metadata stays open to read-only roles; the actual download does not. */
  it('a READ_ONLY platform role can list backups but cannot download one', async () => {
    const readOnlyEmail = `test-backups-readonly-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email: readOnlyEmail, password: adminPassword, role: 'READ_ONLY' });
    const roLogin = await platformLogin(app, readOnlyEmail, adminPassword);
    const readOnlyToken: string = roLogin.body.accessToken;

    const listRes = await authed('get', `/api/v1/restaurants/${restaurantId}/backups`, readOnlyToken);
    expect(listRes.status).toBe(200);
    const backupId = listRes.body[0].id;

    const downloadRes = await authed('get', `/api/v1/restaurants/${restaurantId}/backups/${backupId}/download`, readOnlyToken);
    expect(downloadRes.status).toBe(403);
    const fileRes = await authed('get', `/api/v1/restaurants/${restaurantId}/backups/${backupId}/file`, readOnlyToken);
    expect(fileRes.status).toBe(403);

    await prisma.platformUser.deleteMany({ where: { email: readOnlyEmail } });
  });

  /** security-audit MED-10: only POS/POS_ADMIN — the terminals that actually run the local database — may upload an automatic backup. */
  it('a KDS device (not revoked) is refused when it tries to push a backup', async () => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId, allowedDeviceType: 'KDS', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'KDS' });
    const deviceToken: string = redeemRes.body.deviceToken;

    const res = await authed('post', '/api/v1/devices/me/backups', deviceToken).send({ data: { deviceGenerated: true } });
    expect(res.status).toBe(403);
  });

  /** security-audit MED-10: only the OWNER may create, list, or download the restaurant's own cloud backups. */
  it('a STAFF tenant login cannot create, list, or download this restaurant\'s cloud backups', async () => {
    const staffRes = await authed('post', '/api/v1/tenant/me/users', tenantToken).send({
      email: `backups-staff-${Date.now()}@test.example.com`, fullName: 'Backups Staff', role: 'STAFF', password: 'staff-correct-horse-battery'
    });
    expect(staffRes.status, JSON.stringify(staffRes.body)).toBe(201);
    const staffLogin = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({
      restaurantId, email: staffRes.body.email, password: 'staff-correct-horse-battery'
    });
    const staffToken: string = staffLogin.body.accessToken;

    expect((await authed('post', '/api/v1/tenant/me/backups', staffToken).send({ data: { x: 1 } })).status).toBe(403);
    expect((await authed('get', '/api/v1/tenant/me/backups', staffToken)).status).toBe(403);
    const listRes = await authed('get', '/api/v1/tenant/me/backups', tenantToken);
    const backupId = listRes.body[0].id;
    expect((await authed('get', `/api/v1/tenant/me/backups/${backupId}/download`, staffToken)).status).toBe(403);
  });

  it('a device can authenticate and push its own automatic backup, and its lastBackupAt updates', async () => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'POS',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({
      code: keyRes.body.code,
      deviceType: 'POS',
      appVersion: '1.0.0'
    });
    expect(redeemRes.status).toBe(201);
    const deviceToken: string = redeemRes.body.deviceToken;
    const deviceId: string = redeemRes.body.device.id;
    expect(deviceToken).toBeTypeOf('string');

    const backupRes = await authed('post', '/api/v1/devices/me/backups', deviceToken).send({
      data: { deviceGenerated: true }
    });
    expect(backupRes.status).toBe(201);
    expect(backupRes.body.method).toBe('AUTOMATIC');

    const deviceRow = await prisma.runAsPlatform((tx) => tx.device.findUniqueOrThrow({ where: { id: deviceId } }));
    expect(deviceRow.lastBackupAt).not.toBeNull();
  });

  it('a revoked device can no longer push a backup', async () => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'KDS',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({
      code: keyRes.body.code,
      deviceType: 'KDS'
    });
    const deviceToken: string = redeemRes.body.deviceToken;
    const deviceId: string = redeemRes.body.device.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/devices/${deviceId}/revoke`)
      .set('Authorization', `Bearer ${platformToken}`);

    const res = await authed('post', '/api/v1/devices/me/backups', deviceToken).send({ data: {} });
    expect(res.status).toBe(401);
  });

  it('a device heartbeat updates lastSyncAt, syncStatus, and lastSeenAt', async () => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'CAPTAIN',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({
      code: keyRes.body.code,
      deviceType: 'CAPTAIN'
    });
    const deviceToken: string = redeemRes.body.deviceToken;
    const deviceId: string = redeemRes.body.device.id;

    const hbRes = await request(app.getHttpServer())
      .patch('/api/v1/devices/me/heartbeat')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ syncStatus: 'ok', lastSyncAt: new Date().toISOString() });
    expect(hbRes.status).toBe(200);

    const deviceRow = await prisma.runAsPlatform((tx) => tx.device.findUniqueOrThrow({ where: { id: deviceId } }));
    expect(deviceRow.syncStatus).toBe('ok');
    expect(deviceRow.lastSyncAt).not.toBeNull();
    expect(deviceRow.lastSeenAt).not.toBeNull();
  });

  it('one restaurant cannot download another restaurant\'s backup', async () => {
    const otherOwnerEmail = `test-backups-other-owner-${Date.now()}@example.com`;
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Backups Restaurant ${Date.now()}`,
      ownerName: 'Other Owner',
      ownerEmail: otherOwnerEmail
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
    const otherToken = otherRes.body.activationToken;
    const otherPassword = 'other-correct-horse-battery';
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId: otherRestaurantId,
      email: otherOwnerEmail,
      activationToken: otherToken,
      newPassword: otherPassword
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: otherRestaurantId, email: otherOwnerEmail, password: otherPassword });
    const otherTenantToken = otherLogin.body.accessToken;

    const myBackups = await authed('get', '/api/v1/tenant/me/backups', tenantToken);
    const myBackupId = myBackups.body[0].id;

    const res = await authed('get', `/api/v1/tenant/me/backups/${myBackupId}/download`, otherTenantToken);
    expect(res.status).toBe(404);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });

  describe('platform snapshot, verify and restore (BUG-072/073)', () => {
    const post = (url: string, body: Record<string, unknown> = {}) => authed('post', url, platformToken).send(body);
    const backupRow = (id: string) => prisma.runAsPlatform((tx) => tx.backup.findUniqueOrThrow({ where: { id } }));
    let snapshotBackupId: string;

    it('a Super Admin snapshot is a real export of the restaurant, without secrets', async () => {
      await prisma.runAsPlatform((tx) => tx.branch.create({ data: { restaurantId, name: 'Snapshot Branch', code: `SNAP${Date.now() % 100000}` } }));

      const res = await post(`/api/v1/platform/backups/${restaurantId}/trigger`);
      expect(res.status).toBe(201);
      snapshotBackupId = res.body.id;

      const storage = app.get(BackupStorageService);
      const stored = JSON.parse(await storage.downloadAndDecompress((await backupRow(snapshotBackupId)).storageKey));

      expect(stored.version).toBe(1);
      expect(stored.restaurant.id).toBe(restaurantId);
      expect(stored.branches.map((b: { name: string }) => b.name)).toContain('Snapshot Branch');
      expect(stored.users.length).toBeGreaterThanOrEqual(1);
      expect(stored.subscriptions.length).toBeGreaterThanOrEqual(1);
      expect(stored.counts).toMatchObject({ branches: stored.branches.length, users: stored.users.length });

      const text = JSON.stringify(stored);
      expect(text).not.toMatch(/passwordHash|activationTokenHash|deviceTokenHash|refreshToken|tokenHash/i);
    });

    it('verify downloads the object and recomputes the checksum', async () => {
      const ok = await post(`/api/v1/platform/backups/${snapshotBackupId}/verify`);
      expect(ok.status).toBe(201);
      expect(ok.body.verificationStatus).toBe('VERIFIED');

      const original = (await backupRow(snapshotBackupId)).checksumSha256;
      await prisma.runAsPlatform((tx) => tx.backup.update({ where: { id: snapshotBackupId }, data: { checksumSha256: 'f'.repeat(64) } }));
      const bad = await post(`/api/v1/platform/backups/${snapshotBackupId}/verify`);
      expect(bad.body.verificationStatus).toBe('CORRUPT');
      expect(bad.body.verificationNote).toMatch(/checksum/i);
      await prisma.runAsPlatform((tx) => tx.backup.update({ where: { id: snapshotBackupId }, data: { checksumSha256: original } }));
    });

    it('verify reports CORRUPT when the stored object is missing, instead of trusting the database row', async () => {
      const row = await backupRow(snapshotBackupId);
      const ghost = await prisma.runAsPlatform((tx) =>
        tx.backup.create({
          data: { restaurantId, method: 'MANUAL', status: 'COMPLETED', sizeBytes: 123, storageKey: `restaurants/${restaurantId}/does-not-exist.json.gz`, checksumSha256: row.checksumSha256 }
        })
      );
      const res = await post(`/api/v1/platform/backups/${ghost.id}/verify`);
      expect(res.body.verificationStatus).toBe('CORRUPT');
      expect(res.body.verificationNote).toMatch(/missing|not found|could not/i);
    });

    it('the restore preview reports what is actually inside the backup', async () => {
      const res = await post(`/api/v1/platform/backups/${snapshotBackupId}/preview-restore`, { targetType: 'STAGING_PREVIEW' });
      expect(res.status).toBe(201);
      expect(res.body.previewSummary.counts.branches).toBeGreaterThanOrEqual(1);
      expect(res.body.previewSummary.counts.users).toBeGreaterThanOrEqual(1);
      expect(res.body.previewSummary.restorableInCloud).toBe(true);
      expect(res.body.previewSummary.willRestore).toEqual({ syncedEntities: 0, syncedOrders: 0 });
    });

    it('a backup uploaded from a terminal cannot be restored by the cloud, and says so instead of claiming success', async () => {
      const upload = await authed('post', '/api/v1/tenant/me/backups', tenantToken).send({ data: { orders: [{ id: 'local-1' }], customers: [] } });
      expect(upload.status).toBe(201);
      const preview = await post(`/api/v1/platform/backups/${upload.body.id}/preview-restore`, { targetType: 'PRODUCTION_RESTORE' });
      expect(preview.body.previewSummary.restorableInCloud).toBe(false);
      expect(preview.body.previewSummary.counts).toMatchObject({ orders: 1 });
      const jobId = preview.body.id;
      const before = await prisma.runAsPlatform((tx) => tx.backup.count({ where: { restaurantId } }));

      expect((await post(`/api/v1/platform/backups/restore-jobs/${jobId}/confirm`, {})).status).toBe(400);

      const res = await post(`/api/v1/platform/backups/restore-jobs/${jobId}/confirm`, { confirmed: true });
      expect(res.status).toBe(501);
      expect(res.body.message).toMatch(/Restaurant Admin/);

      const job = await prisma.runAsPlatform((tx) => tx.backupRestoreJob.findUniqueOrThrow({ where: { id: jobId } }));
      expect(job.status).not.toBe('COMPLETED');
      // Refusing takes no safety snapshot: nothing was going to be overwritten.
      expect(await prisma.runAsPlatform((tx) => tx.backup.count({ where: { restaurantId } }))).toBe(before);
    });
  });
});

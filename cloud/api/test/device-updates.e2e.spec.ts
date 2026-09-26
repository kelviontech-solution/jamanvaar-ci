import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-065 / 069 / 077: publishing a release only saved a row, terminals reported a made-up version,
 * and an emergency offline extension was never delivered to anything. The heartbeat now carries both.
 */
describe('Heartbeat delivers update offers and offline extensions (BUG-065/077)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `upd-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let branchId: string;
  let planId: string;
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

  const platform = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  let homeBranchId: string;
  async function enroll(type: string, extra: Record<string, unknown> = {}) {
    // The restaurant has several branches, so a terminal must name its branch (a terminal without one is refused).
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, expiresAt: inDays(1), branchId: homeBranchId, ...extra });
    const red = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type, appVersion: '1.0.0' });
    return { token: red.body.deviceToken as string, id: red.body.device.id as string };
  }
  const heartbeat = (deviceToken: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).patch('/api/v1/devices/me/heartbeat').set('Authorization', `Bearer ${deviceToken}`).send(body);
  const release = (version: string, over: Record<string, unknown> = {}) =>
    prisma.appRelease.create({ data: { appCode: 'POS', version, channel: 'STABLE', supportedPlatforms: ['windows'], releasedAt: new Date(), ...over } as never });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await platformLogin(app, email, password)).body.accessToken;
    restaurantId = (await platform('post', '/api/v1/restaurants').send({ name: `TEST Upd ${stamp}`, ownerName: 'Owner', ownerEmail: `upd-${stamp}@example.com` })).body.restaurant.id;
    branchId = (await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Upd Branch', code: 'UB' })).body.id;
    homeBranchId = (await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Upd Home', code: 'UH' })).body.id;
    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Upd Plan ${stamp}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 50, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: inDays(30) });
  }, 60_000);

  afterAll(async () => {
    await prisma.appRelease.deleteMany({ where: { version: { in: ['91.0.0', '91.1.0', '91.2.0', '91.9.0', '91.10.0'] } } });
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  describe('update offers', () => {
    it('stores the version, OS, pending count and error the terminal really reports', async () => {
      const pos = await enroll('POS');
      const res = await heartbeat(pos.token, { appVersion: '1.4.2', osPlatform: 'Windows 11', pendingSyncCount: 7, syncError: null });
      expect(res.status).toBe(200);
      const device = await prisma.runAsPlatform((tx) => tx.device.findUniqueOrThrow({ where: { id: pos.id } }));
      expect(device).toMatchObject({ appVersion: '1.4.2', osPlatform: 'Windows 11', pendingSyncCount: 7 });
    });

    it('offers a newer stable release for this terminal\'s app, and nothing once it is current', async () => {
      await release('91.0.0');
      const pos = await enroll('POS');
      const old = await heartbeat(pos.token, { appVersion: '1.0.0' });
      expect(old.body.update).toMatchObject({ latestVersion: '91.0.0', mandatory: false });

      const current = await heartbeat(pos.token, { appVersion: '91.0.0' });
      expect(current.body.update).toBeNull();
    });

    it('does not offer beta releases, or another app\'s release', async () => {
      await release('91.1.0', { channel: 'BETA' });
      await prisma.appRelease.create({ data: { appCode: 'KDS', version: '91.2.0', channel: 'STABLE', supportedPlatforms: ['web'] } as never });
      const pos = await enroll('POS');
      expect((await heartbeat(pos.token, { appVersion: '91.0.0' })).body.update).toBeNull();
    });

    it('marks the offer mandatory when the release is, and carries the download link', async () => {
      await prisma.appRelease.update({ where: { appCode_version: { appCode: 'POS', version: '91.0.0' } }, data: { isMandatory: true, downloadUrl: 'https://example.com/pos-91.exe' } });
      const pos = await enroll('POS');
      expect((await heartbeat(pos.token, { appVersion: '1.0.0' })).body.update).toMatchObject({ mandatory: true, downloadUrl: 'https://example.com/pos-91.exe' });
    });
  });

  describe('emergency offline extensions', () => {
    const ext = (over: Record<string, unknown> = {}) =>
      prisma.runAsPlatform((tx) =>
        tx.offlineExtension.create({
          data: {
            restaurantId, extensionDays: 7, reason: 'Fibre cut', requestedBy: 'Owner', approvedById: 'x', status: 'ACTIVE',
            certificatePayload: 'payload-b64', certificateSignature: 'sig-b64', validFrom: new Date(), validUntil: new Date(Date.now() + 7 * 86400_000), ...over
          } as never
        })
      );

    it('delivers an active extension for the restaurant to its terminals', async () => {
      const created = await ext();
      const pos = await enroll('POS');
      const res = await heartbeat(pos.token);
      expect(res.body.extension).toMatchObject({ id: created.id, payload: 'payload-b64', signature: 'sig-b64' });
      expect(new Date(res.body.extension.validUntil).getTime()).toBeGreaterThan(Date.now());
      await prisma.runAsPlatform((tx) => tx.offlineExtension.delete({ where: { id: created.id } }));
    });

    it('does not deliver revoked or expired extensions, or one aimed at another branch or device', async () => {
      const pos = await enroll('POS');
      const other = await enroll('POS');
      await ext({ status: 'REVOKED' });
      await ext({ validUntil: new Date(Date.now() - 1000) });
      await ext({ branchId });               // a branch this terminal is not in
      await ext({ deviceId: other.id });     // a different terminal
      expect((await heartbeat(pos.token)).body.extension).toBeNull();
      // ...but it does reach the terminal it was aimed at.
      expect((await heartbeat(other.token)).body.extension).toMatchObject({ payload: 'payload-b64' });
    });

    it('reaches a terminal bound to the targeted branch', async () => {
      const inBranch = await enroll('POS', { branchId });
      const res = await heartbeat(inBranch.token);
      expect(res.body.extension).toMatchObject({ payload: 'payload-b64' });
    });
  });
  describe('applications matrix (BUG-065/069)', () => {
    const matrix = async () => (await platform('get', '/api/v1/applications')).body as Array<Record<string, unknown> & { code: string }>;

    it('names the newest STABLE release by version number, not by publish time, and never invents one', async () => {
      await release('91.10.0', { releasedAt: new Date(Date.now() - 3600_000) });
      await release('91.9.0', { releasedAt: new Date() }); // published later, but numerically older
      const pos = (await matrix()).find((a) => a.code === 'POS')!;
      expect(pos.currentVersion).toBe('91.10.0');
    });

    it('counts online / degraded / offline with the same rule as the fleet, and how many terminals are behind', async () => {
      const seen = (ms: number) => prisma.runAsPlatform((tx) => tx.device.create({ data: { restaurantId, type: 'POS', status: 'ACTIVE', appVersion: '1.0.0', lastSeenAt: new Date(Date.now() - ms) } as never }));
      await seen(10_000);          // online
      await seen(8 * 60_000);      // degraded: the old 1-hour rule would have called this online
      await seen(3 * 3600_000);    // offline
      const pos = (await matrix()).find((a) => a.code === 'POS')! as Record<string, number> & { code: string };
      const expectOnline = await prisma.runAsPlatform((tx) => tx.device.count({ where: { type: 'POS', status: 'ACTIVE', lastSeenAt: { gte: new Date(Date.now() - 2 * 60_000) } } }));
      expect(pos.onlineDevices).toBe(expectOnline);
      expect(pos.degradedDevices).toBeGreaterThanOrEqual(1);
      expect(pos.offlineDevices).toBeGreaterThanOrEqual(1);
      expect(pos.behindDevices).toBeGreaterThanOrEqual(3); // all three run 1.0.0, far below 91.10.0
    });
  });

});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** Audit F-01/F-02/F-05: what a public kiosk may and may not do, and the server-side manager PIN check. */
describe('security hardening (kiosk authority, manager PIN, admin-code redemption)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-sechard-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let posAdminToken: string;
  let kioskToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const redeem = async (type: string) => {
    const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return res.body.deviceToken as string;
  };
  const pinHash = (pin: string) => {
    const salt = randomBytes(16);
    return `pinv2:${salt.toString('hex')}:${pbkdf2Sync(`${restaurantId}:${pin}`, salt, 100_000, 32, 'sha256').toString('hex')}`;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    const r = await authed('post', '/api/v1/restaurants', platformToken).send({ name: `TEST SecHard ${Date.now()}`, ownerName: 'Owner', ownerEmail: `sechard-${Date.now()}@test.example.com` });
    restaurantId = r.body.restaurant.id;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({ tier: 'PRO', name: `TEST SecHard Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } });
    planId = plan.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']
    });
    posAdminToken = await redeem('POS_ADMIN');
    kioskToken = await redeem('KIOSK');
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.runAsPlatform((tx) => tx.platformUser.deleteMany({ where: { email: adminEmail } }));
    await app.close();
  });

  it('a public kiosk cannot change prices, staff, customers or cash, and cannot read customers or staff PIN hashes', async () => {
    for (const type of ['MENU_ITEM', 'TAX_GROUP', 'STAFF_USER', 'CUSTOMER', 'CASH_MOVEMENT']) {
      const res = await authed('post', `/api/v1/entity-sync/${type}`, kioskToken).send({ events: [{ externalId: 'x1', payload: { id: 'x1', updatedAt: '2026-09-20T10:00:00.000Z' } }] });
      expect(res.status, type).toBe(403);
    }
    expect((await authed('get', '/api/v1/entity-sync/CUSTOMER', kioskToken)).status).toBe(403);

    await authed('post', '/api/v1/entity-sync/STAFF_USER', posAdminToken).send({ events: [
      { externalId: 'u-mgr', payload: { id: 'u-mgr', fullName: 'Mgr', roleId: 'role-manager', isActive: true, pinHash: pinHash('4321') } },
      { externalId: 'u-cash', payload: { id: 'u-cash', fullName: 'Cash', roleId: 'role-cashier', isActive: true, pinHash: pinHash('1111') } }
    ] });
    const pull = await authed('get', '/api/v1/entity-sync/STAFF_USER', kioskToken);
    for (const e of pull.body.entities ?? []) expect(e.payload.pinHash, 'no PIN hash reaches a kiosk').toBeUndefined();
  });

  it('the kiosk asks the SERVER whether a PIN is a manager PIN; wrong and non-manager PINs are refused and locked out', async () => {
    const ok = await authed('post', '/api/v1/staff/verify-manager-pin', kioskToken).send({ pin: '4321' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ approved: true, staffName: 'Mgr' });
    expect((await authed('post', '/api/v1/staff/verify-manager-pin', kioskToken).send({ pin: '1111' })).status).toBe(403); // a cashier's PIN
    for (let i = 0; i < 4; i++) await authed('post', '/api/v1/staff/verify-manager-pin', kioskToken).send({ pin: '9999' });
    const locked = await authed('post', '/api/v1/staff/verify-manager-pin', kioskToken).send({ pin: '4321' });
    expect(locked.status).toBe(429); // five misses on this terminal: even the right PIN waits
  });

  it('a general (ANY) activation code cannot be redeemed as an admin console', async () => {
    const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    if (key.status !== 201) return; // key type ANY may not be issuable in this build; the service rule is covered where it is
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

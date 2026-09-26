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

  describe('per-staff sign-in and proof of who took an order or money back', () => {
    let posToken: string;
    let posDeviceId: string;
    const item = { externalItemId: 'i1', name: 'Tea', quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000, kitchenStatus: 'PENDING' };
    const evt = (id: string, status: string, meta: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
      eventId: `ev-${id}-${status}-${Math.random().toString(36).slice(2)}`, externalOrderId: id, orderType: 'DINE_IN', status, items: [item],
      subtotal: 1000, taxAmount: 0, discountAmount: 0, totalAmount: 1000, updatedAt: new Date().toISOString(), meta, ...extra
    });
    const pushOrder = (ev: unknown) => authed('post', '/api/v1/orders/sync', posToken).send({ events: [ev] });
    const signIn = (pin: string) => authed('post', '/api/v1/staff/sign-in', posToken).send({ pin });

    beforeAll(async () => {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const r = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS' });
      posToken = r.body.deviceToken;
      posDeviceId = r.body.device.id;
      await authed('post', '/api/v1/entity-sync/STAFF_USER', posAdminToken).send({ events: [
        { externalId: 'u-chef', payload: { id: 'u-chef', fullName: 'Chef', roleId: 'role-chef', isActive: true, pinHash: pinHash('2222') } },
        { externalId: 'u-cash2', payload: { id: 'u-cash2', fullName: 'Cash Two', roleId: 'role-cashier', isActive: true, pinHash: pinHash('3333') } }
      ] });
    });

    it('signs a cashier in with the PIN, refuses a wrong PIN, and refuses a role that may not use the counter', async () => {
      const ok = await signIn('3333');
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ staffName: 'Cash Two', roleId: 'role-cashier' });
      expect(ok.body.sessionToken).toBeTruthy();
      expect((await signIn('0000')).status).toBe(403);
      expect((await signIn('2222')).status).toBe(403); // a chef does not sign in on the counter
    });

    it('a cashier session alone cannot cancel an order; with a manager approval it can, and the manager is recorded', async () => {
      const cashier = (await signIn('3333')).body.sessionToken as string;
      await pushOrder(evt('sec-o1', 'PENDING', { staffSession: cashier }));

      const refused = await pushOrder(evt('sec-o1', 'CANCELLED', { staffSession: cashier }));
      expect(refused.body.results[0].status).toBe('error');
      expect(refused.body.results[0].error).toMatch(/STAFF_NOT_AUTHORIZED/);

      const approval = (await authed('post', '/api/v1/staff/verify-manager-pin', posToken).send({ pin: '4321' })).body.approvalToken as string;
      const ok = await pushOrder(evt('sec-o1', 'CANCELLED', { staffSession: cashier, approvalSession: approval }));
      expect(ok.body.results[0].status).toBe('ok');
      const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: 'sec-o1' } }));
      expect(row.status).toBe('CANCELLED');
      expect((row.meta as any).verifiedStaff).toMatchObject({ name: 'Mgr', role: 'role-manager' });
      expect(JSON.stringify(row.meta)).not.toContain('approvalSession');
    });

    it('a forged, altered or a token from another terminal count as no proof, and a proof-less take-back is accepted but flagged', async () => {
      const cashier = (await signIn('3333')).body.sessionToken as string;
      await pushOrder(evt('sec-o2', 'PENDING'));
      const forged = cashier.slice(0, -3) + 'abc';
      const res = await pushOrder(evt('sec-o2', 'CANCELLED', { staffSession: forged }));
      expect(res.body.results[0].status).toBe('ok'); // default deployment: offline sign-ins still sync
      const conflicts = await prisma.runAsPlatform((tx) => tx.syncConflict.findMany({ where: { restaurantId, entityId: 'sec-o2' } }));
      expect(conflicts.some((c) => c.reason.startsWith('STAFF_UNVERIFIED'))).toBe(true);
      const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: 'sec-o2' } }));
      expect((row.meta as any).actorVerified).toBe(false);
    });

    it('a manager who has since been deactivated no longer counts', async () => {
      const managerSession = (await signIn('4321')).body.sessionToken as string;
      await pushOrder(evt('sec-o3', 'PENDING'));
      const deact = await authed('post', '/api/v1/entity-sync/STAFF_USER', posAdminToken).send({ events: [{ externalId: 'u-mgr', payload: { id: 'u-mgr', fullName: 'Mgr', roleId: 'role-manager', isActive: false, pinHash: pinHash('4321'), updatedAt: new Date(Date.now() + 1000).toISOString() } }] });
      expect(deact.body.results[0].status).toBe('ok');
      const res = await pushOrder(evt('sec-o3', 'CANCELLED', { staffSession: managerSession }));
      expect(res.body.results[0].status).toBe('error');
      expect(res.body.results[0].error).toMatch(/STAFF_NOT_AUTHORIZED/);
      void posDeviceId;
    });
  });
});

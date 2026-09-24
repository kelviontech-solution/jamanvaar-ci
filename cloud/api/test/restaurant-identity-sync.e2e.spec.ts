import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * B2-054: the restaurant's own legal/registration details (name, GSTIN, FSSAI, address, city,
 * state) never reached any device except the one Restaurant Admin happened to log into — no
 * periodic pull existed at all, and an edit made in Restaurant Admin's own Settings, or by Super
 * Admin, never left that one device. Every activated terminal (POS, Captain, KDS, both kiosk
 * apps, Restaurant Admin) now pulls this on the same device-token credential used for its
 * heartbeat, and Restaurant Admin's Settings save pushes its own edit back.
 */
describe('Restaurant identity sync across devices (B2-054)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `ri-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let planId: string;
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

  const platform = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  async function enroll(type: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, expiresAt: inDays(1) });
    const red = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type, appVersion: '1.0.0' });
    return red.body.deviceToken as string;
  }
  const getIdentity = (deviceToken: string) => request(app.getHttpServer()).get('/api/v1/devices/me/restaurant').set('Authorization', `Bearer ${deviceToken}`);
  const patchIdentity = (deviceToken: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch('/api/v1/devices/me/restaurant').set('Authorization', `Bearer ${deviceToken}`).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken;
    restaurantId = (
      await platform('post', '/api/v1/restaurants').send({ name: `TEST RI ${stamp}`, ownerName: 'Owner', ownerEmail: `ri-${stamp}@example.com` })
    ).body.restaurant.id;
    planId = (
      await platform('post', '/api/v1/plans').send({
        tier: 'PRO',
        name: `TEST RI Plan ${stamp}`,
        priceMonthly: 700000,
        maxBranches: 5,
        maxDevices: 50,
        maxUsers: 20,
        entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true }
      })
    ).body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: inDays(30) });
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  it('a second terminal (e.g. KDS) can read what a fresh POS activation set up, with no auth beyond its own device token', async () => {
    const pos = await enroll('POS');
    const kds = await enroll('KDS');

    const seen = await getIdentity(kds);
    expect(seen.status).toBe(200);
    expect(seen.body.name).toBe(`TEST RI ${stamp}`);
    // Sanity: it really is this restaurant's own device credential doing the reading, not a shared or guessable id.
    expect((await getIdentity(pos)).status).toBe(200);
  });

  it("an edit pushed from one device (Restaurant Admin's Settings) is visible to a GET from any other device", async () => {
    const admin = await enroll('POS_ADMIN');
    const pos = await enroll('POS');

    const patched = await patchIdentity(admin, {
      legalName: 'Spice Route Hospitality LLP',
      gstin: '24AAACR5055K1Z1',
      fssaiNumber: '12345678901234',
      address: '221B Baker Street',
      city: 'Ahmedabad',
      state: 'Gujarat'
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ legalName: 'Spice Route Hospitality LLP', gstin: '24AAACR5055K1Z1' });

    const fromPos = await getIdentity(pos);
    expect(fromPos.body).toMatchObject({
      legalName: 'Spice Route Hospitality LLP',
      gstin: '24AAACR5055K1Z1',
      fssaiNumber: '12345678901234',
      address: '221B Baker Street',
      city: 'Ahmedabad',
      state: 'Gujarat'
    });

    // The real Restaurant row changed, not a side record only this endpoint knows about —
    // Super Admin's own restaurant detail screen must see the same edit.
    const admin2 = await platform('get', `/api/v1/restaurants/${restaurantId}`);
    expect(admin2.body.gstin ?? admin2.body.restaurant?.gstin).toBe('24AAACR5055K1Z1');
  });

  it('rejects a malformed GSTIN/FSSAI the same way the platform API already does, rather than saving garbage to a real tax field', async () => {
    const admin = await enroll('POS_ADMIN');
    // The DTO caps length; a wildly oversized value should never pass through to a bill.
    const res = await patchIdentity(admin, { gstin: 'x'.repeat(50) });
    expect(res.status).toBe(400);
  });

  it("one device's PATCH cannot reach a different restaurant's row — the device token, not a body field, decides which restaurant is edited", async () => {
    const other = (
      await platform('post', '/api/v1/restaurants').send({ name: `TEST RI Other ${stamp}`, ownerName: 'Other Owner', ownerEmail: `ri-other-${stamp}@example.com` })
    ).body.restaurant.id;
    const admin = await enroll('POS_ADMIN');
    await patchIdentity(admin, { name: 'Renamed By First Restaurant Device' });

    const otherRes = await platform('get', `/api/v1/restaurants/${other}`);
    expect(otherRes.body.name ?? otherRes.body.restaurant?.name).toBe(`TEST RI Other ${stamp}`);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: other } }));
  });
});

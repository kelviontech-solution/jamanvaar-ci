import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * One Kiosk Admin manages every kiosk of its restaurant: it sees the whole fleet and sends commands,
 * which are authenticated, authorized, audited, idempotent and retried until acknowledged.
 */
describe('Device fleet and commands issued by Kiosk Admin', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-fleet-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];

  let kioskAdmin: string;
  let kiosk1: string;
  let kiosk2: string;
  let kiosk1Id: string;
  let kiosk2Id: string;
  let posToken: string;
  let posId: string;
  let otherKioskId: string;

  const platform = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  async function restaurant(name: string, family: 'KIOSK' | 'RESTAURANT', tier: 'CORE' | 'PRO') {
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase().replace(/\W/g, '')}-${stamp}@test.example.com` });
    const id = rest.body.restaurant.id as string;
    restaurantIds.push(id);
    const plan = await platform('post', '/api/v1/plans').send({ tier, productFamily: family, name: `TEST ${name} Plan ${stamp}`, priceMonthly: 900000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });
    planIds.push(plan.body.id);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    return id;
  }
  async function activate(restaurantId: string, type: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return { token: res.body.deviceToken as string, id: res.body.device.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    const rid = await restaurant('Fleet Pro', 'KIOSK', 'PRO');
    const ka = await activate(rid, 'KIOSK_ADMIN');
    const k1 = await activate(rid, 'KIOSK');
    const k2 = await activate(rid, 'KIOSK');
    kioskAdmin = ka.token; kiosk1 = k1.token; kiosk2 = k2.token; kiosk1Id = k1.id; kiosk2Id = k2.id;

    const other = await restaurant('Fleet Other', 'KIOSK', 'PRO');
    otherKioskId = (await activate(other, 'KIOSK')).id;

    // A separate RESTAURANT-family plan for the same restaurant gives it a POS.
    const posPlan = await platform('post', '/api/v1/plans').send({ tier: 'CORE', productFamily: 'RESTAURANT', name: `TEST Fleet POS Plan ${stamp}`, priceMonthly: 500000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });
    planIds.push(posPlan.body.id);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId: posPlan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const pos = await activate(rid, 'POS');
    posToken = pos.token; posId = pos.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('Kiosk Admin sees the whole kiosk fleet with health, backlog and errors', async () => {
    await as('post', '/api/v1/devices/me/heartbeat', kiosk1).send({});
    await request(app.getHttpServer()).patch('/api/v1/devices/me/heartbeat').set('Authorization', `Bearer ${kiosk1}`).send({ pendingSyncCount: 4, syncError: '1 change(s) could not be synced', appVersion: '1.4.2' });
    const fleet = await as('get', '/api/v1/devices/me/fleet', kioskAdmin);
    expect(fleet.status).toBe(200);
    const kiosks = fleet.body.devices.filter((d: { type: string }) => d.type === 'KIOSK');
    expect(kiosks).toHaveLength(2);
    const k1 = kiosks.find((d: { id: string }) => d.id === kiosk1Id);
    expect(k1).toMatchObject({ health: 'online', pendingSyncCount: 4, syncError: expect.any(String), appVersion: '1.4.2' });
    expect(fleet.body.summary).toMatchObject({ total: expect.any(Number), online: expect.any(Number), needsAttention: expect.any(Number) });
    expect(fleet.body.devices.map((d: { id: string }) => d.id)).not.toContain(otherKioskId);
  });

  it('Kiosk Admin can command a kiosk of its own restaurant; the kiosk receives it', async () => {
    const res = await as('post', `/api/v1/devices/me/fleet/${kiosk2Id}/commands`, kioskAdmin).send({ commandType: 'REQUEST_SYNC', payload: { scope: 'MENU' } });
    expect(res.status).toBe(201);
    const pending = await as('get', '/api/v1/devices/me/commands', kiosk2);
    expect(pending.body.map((c: { id: string }) => c.id)).toContain(res.body.id);
    const audit = await prisma.runAsPlatform((tx) => tx.auditLog.findFirst({ where: { action: 'DEVICE_COMMAND_REQUEST_SYNC', restaurantId: { in: restaurantIds } }, orderBy: { createdAt: 'desc' } }));
    expect(audit?.actorType).toBe('TENANT');
  });

  it('the same idempotency key never creates a second command', async () => {
    const body = { commandType: 'REQUEST_HEALTH', idempotencyKey: `idem-${stamp}` };
    const a = await as('post', `/api/v1/devices/me/fleet/${kiosk1Id}/commands`, kioskAdmin).send(body);
    const b = await as('post', `/api/v1/devices/me/fleet/${kiosk1Id}/commands`, kioskAdmin).send(body);
    expect(b.body.id).toBe(a.body.id);
    const count = await prisma.runAsPlatform((tx) => tx.deviceCommand.count({ where: { deviceId: kiosk1Id, idempotencyKey: `idem-${stamp}` } }));
    expect(count).toBe(1);
  });

  it('Kiosk Admin cannot command a non-kiosk device or another restaurant\'s device, and cannot send destructive commands', async () => {
    expect((await as('post', `/api/v1/devices/me/fleet/${posId}/commands`, kioskAdmin).send({ commandType: 'REQUEST_SYNC' })).status).toBe(403);
    expect((await as('post', `/api/v1/devices/me/fleet/${otherKioskId}/commands`, kioskAdmin).send({ commandType: 'REQUEST_SYNC' })).status).toBe(404);
    expect((await as('post', `/api/v1/devices/me/fleet/${kiosk1Id}/commands`, kioskAdmin).send({ commandType: 'WIPE_LOCAL_DATA' })).status).toBe(400);
  });

  it('only an admin console can issue commands, never a terminal', async () => {
    expect((await as('post', `/api/v1/devices/me/fleet/${kiosk1Id}/commands`, posToken).send({ commandType: 'REQUEST_SYNC' })).status).toBe(403);
    expect((await as('post', `/api/v1/devices/me/fleet/${kiosk1Id}/commands`, kiosk2).send({ commandType: 'REQUEST_SYNC' })).status).toBe(403);
  });

  it('a delivered but unacknowledged command is redelivered, then failed after the last redelivery', async () => {
    const created = await as('post', `/api/v1/devices/me/fleet/${kiosk2Id}/commands`, kioskAdmin).send({ commandType: 'REQUEST_DIAGNOSTICS' });
    const id = created.body.id as string;
    const stale = () => prisma.runAsPlatform((tx) => tx.deviceCommand.update({ where: { id }, data: { acknowledgedAt: new Date(Date.now() - 10 * 60 * 1000) } }));

    const first = await as('get', '/api/v1/devices/me/commands', kiosk2);
    expect(first.body.map((c: { id: string }) => c.id)).toContain(id);
    await stale();
    const second = await as('get', '/api/v1/devices/me/commands', kiosk2);
    expect(second.body.map((c: { id: string }) => c.id)).toContain(id);
    await stale();
    const third = await as('get', '/api/v1/devices/me/commands', kiosk2);
    expect(third.body.map((c: { id: string }) => c.id)).toContain(id);
    await stale();
    const fourth = await as('get', '/api/v1/devices/me/commands', kiosk2);
    expect(fourth.body.map((c: { id: string }) => c.id)).toContain(id);
    await stale();
    const fifth = await as('get', '/api/v1/devices/me/commands', kiosk2);
    expect(fifth.body.map((c: { id: string }) => c.id)).not.toContain(id);
    const row = await prisma.runAsPlatform((tx) => tx.deviceCommand.findUniqueOrThrow({ where: { id } }));
    expect(row.status).toBe('FAILED');
    expect(row.retryCount).toBe(3);
  });

  it('an acknowledged command is not redelivered', async () => {
    const created = await as('post', `/api/v1/devices/me/fleet/${kiosk1Id}/commands`, kioskAdmin).send({ commandType: 'REQUEST_HEALTH', idempotencyKey: `ack-${stamp}` });
    await as('get', '/api/v1/devices/me/commands', kiosk1);
    await as('post', `/api/v1/devices/me/commands/${created.body.id}/ack`, kiosk1).send({ status: 'SUCCEEDED', result: { ok: true } });
    await prisma.runAsPlatform((tx) => tx.deviceCommand.update({ where: { id: created.body.id }, data: { acknowledgedAt: new Date(Date.now() - 10 * 60 * 1000) } }));
    const again = await as('get', '/api/v1/devices/me/commands', kiosk1);
    expect(again.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });
});

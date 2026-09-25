import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Reconciliation never repairs money or stock: it finds inconsistencies and reports them for a person
 * to review. Trace ids tie one order's journey (device -> server -> conflicts) together for support.
 */
describe('Sync reconciliation and tracing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-recon-${stamp}@example.com`;
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let pos: string;
  let pos2: string;
  let posId: string;
  let adminConsole: string;

  const platform = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const order = (id: string, extra: Record<string, unknown> = {}) => ({
    externalOrderId: id, orderType: 'DINE_IN', status: 'COMPLETED',
    items: [{ externalItemId: 'i', name: 'Tea', quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000 }],
    subtotal: 1000, taxAmount: 50, discountAmount: 0, totalAmount: 1050, updatedAt: new Date().toISOString(), ...extra
  });

  async function activate(type: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return { token: res.body.deviceToken as string, id: res.body.device.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST Recon ${stamp}`, ownerName: 'Owner', ownerEmail: `recon-${stamp}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Recon Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });
    planId = plan.body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const p1 = await activate('POS');
    const p2 = await activate('POS');
    pos = p1.token; posId = p1.id; pos2 = p2.token;
    adminConsole = (await activate('POS_ADMIN')).token;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a clean restaurant has no issues', async () => {
    const res = await platform('get', `/api/v1/platform/telemetry/reconciliation?restaurantId=${restaurantId}`);
    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
  });

  it('flags a paid order that carries no payment transaction, without changing it', async () => {
    await as('post', '/api/v1/orders/sync', pos).send({ events: [order('recon-paid', { paymentStatus: 'SUCCESS', paymentMethod: 'CASH' })] });
    const res = await platform('get', `/api/v1/platform/telemetry/reconciliation?restaurantId=${restaurantId}`);
    expect(res.body.issues.some((i: { code: string; entityId?: string }) => i.code === 'PAID_WITHOUT_TRANSACTION' && i.entityId === 'recon-paid')).toBe(true);
    const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: 'recon-paid' } }));
    expect(row.paymentStatus).toBe('SUCCESS');
  });

  it('flags two different orders that carry the same human order number', async () => {
    const meta = { orderNumber: 'AHD-20260925-001' };
    await as('post', '/api/v1/orders/sync', pos).send({ events: [order('recon-dup-1', { meta })] });
    await as('post', '/api/v1/orders/sync', pos2).send({ events: [order('recon-dup-2', { meta })] });
    const res = await platform('get', `/api/v1/platform/telemetry/reconciliation?restaurantId=${restaurantId}`);
    const dup = res.body.issues.find((i: { code: string }) => i.code === 'DUPLICATE_ORDER_NUMBER');
    expect(dup).toBeTruthy();
    expect(dup.severity).toBe('high');
    expect(dup.detail).toContain('AHD-20260925-001');
  });

  it('flags oversold stock (negative net quantity) for review', async () => {
    await as('post', '/api/v1/inventory/movements', adminConsole).send({
      movements: [{ movementId: 'recon-m1', itemId: 'paneer', itemName: 'Paneer', type: 'SALE', quantityDelta: -5, unit: 'kg', reason: 'sale', occurredAt: new Date().toISOString() }]
    });
    const res = await platform('get', `/api/v1/platform/telemetry/reconciliation?restaurantId=${restaurantId}`);
    expect(res.body.issues.some((i: { code: string; entityId?: string }) => i.code === 'NEGATIVE_STOCK' && i.entityId === 'paneer')).toBe(true);
  });

  it('flags unresolved conflicts and devices reporting an error or a stale backlog', async () => {
    await prisma.runAsPlatform((tx) => tx.syncConflict.create({ data: { restaurantId, entityType: 'ORDER', entityId: 'recon-c', localVersion: {}, cloudVersion: {}, reason: 'test' } }));
    await request(app.getHttpServer()).patch('/api/v1/devices/me/heartbeat').set('Authorization', `Bearer ${pos}`).send({ syncError: '2 order(s) could not be synced', pendingSyncCount: 2 });
    await prisma.runAsPlatform((tx) => tx.device.update({ where: { id: posId }, data: { lastSeenAt: new Date(Date.now() - 3 * 3600_000) } }));
    const codes = (await platform('get', `/api/v1/platform/telemetry/reconciliation?restaurantId=${restaurantId}`)).body.issues.map((i: { code: string }) => i.code);
    expect(codes).toContain('UNRESOLVED_CONFLICT');
    expect(codes).toContain('DEVICE_SYNC_ERROR');
    expect(codes).toContain('DEVICE_OFFLINE_WITH_BACKLOG');
  });

  it('the restaurant admin console sees the same issues for its own restaurant only', async () => {
    const res = await as('get', '/api/v1/devices/me/sync-issues', adminConsole);
    expect(res.status).toBe(200);
    expect(res.body.issues.length).toBeGreaterThan(0);
    expect((await as('get', '/api/v1/devices/me/sync-issues', pos)).status).toBe(403);
  });

  it('a trace id ties one order\'s pushes, and any refusal, into a single timeline', async () => {
    await as('post', '/api/v1/orders/sync', pos).send({ events: [order('recon-trace', { traceId: 'TRACE-ABC', eventId: 'POS-EVT-TR1' })] });
    await as('post', '/api/v1/orders/sync', pos).send({ events: [order('recon-trace', { traceId: 'TRACE-ABC', eventId: 'POS-EVT-TR2', status: 'READY' })] });
    const res = await platform('get', '/api/v1/platform/telemetry/trace/TRACE-ABC');
    expect(res.status).toBe(200);
    expect(res.body.events.map((e: { eventId: string }) => e.eventId)).toEqual(['POS-EVT-TR1', 'POS-EVT-TR2']);
    expect(res.body.events[0]).toMatchObject({ entityType: 'ORDER', status: 'SUCCESS', restaurantId });
    expect(res.body.order).toMatchObject({ externalOrderId: 'recon-trace', status: 'READY' });
  });
});

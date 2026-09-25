import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { BranchStore } from '../../../packages/branch-core/src/store';
import { BranchCore } from '../../../packages/branch-core/src/core';
import { CloudUplink } from '../../../packages/branch-core/src/uplink';

/**
 * A real Branch Core talking to the real cloud API: the branch keeps working with the internet down and
 * everything it did reaches the cloud, exactly once, when the internet returns.
 */
describe('Branch Core <-> Cloud', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cloudBase: string;
  const stamp = Date.now();
  const adminEmail = `test-core-${stamp}@example.com`;
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let branchA: string;
  let branchB: string;
  let coreToken: string;
  let posToken: string;
  let posId: string;
  let kdsToken: string;
  let otherBranchPos: string;
  let core: BranchCore;
  let uplink: BranchUplinkHarness;

  const platform = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const cloud = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  async function activate(type: string, branchId?: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return { token: res.body.deviceToken as string, id: res.body.device.id as string };
  }

  /** The uplink with a switch that simulates the internet being down. */
  class BranchUplinkHarness {
    internetUp = true;
    failAfterRequests: number | null = null;
    private served = 0;
    readonly uplink: CloudUplink;
    constructor(c: BranchCore, token: string) {
      const fetchImpl = (async (url: string, init: RequestInit) => {
        if (!this.internetUp) throw new TypeError('fetch failed');
        if (this.failAfterRequests !== null && this.served++ >= this.failAfterRequests) throw new TypeError('connection dropped');
        return fetch(url, init);
      }) as unknown as typeof fetch;
      this.uplink = new CloudUplink(c, { cloudBase, deviceToken: token, fetchImpl, timeoutMs: 5000 });
    }
    sync() { this.served = 0; return this.uplink.syncOnce(); }
  }

  const local = (token: string, method: string, path: string, body?: unknown) => {
    // Call the core's HTTP-free API surface through its own server is covered in unit tests; here we drive the core directly.
    void token; void method; void path; void body;
  };
  void local;

  const orderEvent = (id: string, eventId: string, extra: Record<string, unknown> = {}) => ({
    eventId, externalOrderId: id, orderType: 'DINE_IN', status: 'NEW',
    items: [{ externalItemId: `${id}-i`, name: 'Tea', quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000, kitchenStatus: 'PENDING' }],
    subtotal: 1000, taxAmount: 50, discountAmount: 0, totalAmount: 1050, updatedAt: new Date().toISOString(), ...extra
  });

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    cloudBase = (await app.getUrl()).replace('[::1]', 'localhost');
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST Core ${stamp}`, ownerName: 'Owner', ownerEmail: `core-${stamp}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Core Plan ${stamp}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 30, maxUsers: 20, entitlements: {} });
    planId = plan.body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    branchA = (await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Core Branch A', code: 'CBA' })).body.id;
    branchB = (await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Core Branch B', code: 'CBB' })).body.id;

    coreToken = (await activate('POS_ADMIN', branchA)).token; // the Branch Core's own credential, bound to branch A
    const p = await activate('POS', branchA);
    posToken = p.token; posId = p.id;
    kdsToken = (await activate('KDS', branchA)).token;
    otherBranchPos = (await activate('POS', branchB)).token;

    core = new BranchCore(new BranchStore(':memory:'), { restaurantId, branchId: branchA, branchCode: 'CBA' });
    uplink = new BranchUplinkHarness(core, coreToken);
  }, 60000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    core.store.close();
    await app.close();
  });

  const posDevice = () => ({ id: posId, type: 'POS' });

  it('a fresh core authorizes nobody until it has downloaded the roster; then devices work', async () => {
    expect(() => core.authenticate(posToken)).toThrow(/Invalid device credential/);
    const r = await uplink.sync();
    expect(r.reachable).toBe(true);
    expect(r.error).toBeUndefined();
    expect(core.authenticate(posToken)).toMatchObject({ id: posId, type: 'POS' });
    expect(core.authenticate(kdsToken).type).toBe('KDS');
    expect(() => core.authenticate(otherBranchPos)).toThrow(/Invalid device credential/); // a branch core never even learns other branches' devices
  });

  it('INTERNET DOWN: the branch keeps taking orders, cash bills and KDS updates, all queued for the cloud', async () => {
    uplink.internetUp = false;
    const down = await uplink.sync();
    expect(down.reachable).toBe(false);

    // The POS creates and pays orders through the core; the KDS reads them, all locally.
    core.ingestOrders(posDevice(), [orderEvent('off-1', 'OFF-1'), orderEvent('off-2', 'OFF-2', { status: 'COMPLETED', paymentStatus: 'SUCCESS', paymentMethod: 'CASH', meta: { paymentTransactionId: 'CASH-1' } })]);
    core.pushMovements(posDevice(), [{ movementId: 'OFF-M1', itemId: 'tea', itemName: 'Tea', type: 'SALE', quantityDelta: -2, unit: 'kg', reason: 'sale', occurredAt: new Date().toISOString() }]);
    expect(core.pullOrders(0).orders.map((o) => o.externalOrderId)).toEqual(['off-1', 'off-2']);
    expect(core.status()).toMatchObject({ pendingCloudEvents: 3 });

    // Still authorized while the internet is down.
    expect(core.authenticate(posToken).id).toBe(posId);
    const inCloud = await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId, externalOrderId: { startsWith: 'off-' } } }));
    expect(inCloud).toBe(0);
  });

  it('INTERNET RESTORED: everything uploads automatically, exactly once, and the cloud fleet sees the devices', async () => {
    await cloud('post', '/api/v1/devices/me/heartbeat', posToken); // unused route guard: ignore result
    core.heartbeat(core.authenticate(posToken), { appVersion: '2.0.0', pendingSyncCount: 4 });

    uplink.internetUp = true;
    const up = await uplink.sync();
    expect(up.error).toBeUndefined();
    expect(up.uploaded).toBeGreaterThanOrEqual(3);
    expect(core.status()).toMatchObject({ pendingCloudEvents: 0, failedCloudEvents: 0 });

    const rows = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId, externalOrderId: { startsWith: 'off-' } }, orderBy: { externalOrderId: 'asc' } }));
    expect(rows.map((r) => r.externalOrderId)).toEqual(['off-1', 'off-2']);
    expect(rows[1].paymentStatus).toBe('SUCCESS');
    const movement = await prisma.runAsPlatform((tx) => tx.inventoryMovement.count({ where: { restaurantId, movementId: 'OFF-M1' } }));
    expect(movement).toBe(1);

    const device = await prisma.runAsPlatform((tx) => tx.device.findUniqueOrThrow({ where: { id: posId } }));
    expect(device.appVersion).toBe('2.0.0');
    expect(device.pendingSyncCount).toBe(4);
    expect(device.lastSeenAt).not.toBeNull();
  });

  it('syncing again, or replaying an upload whose acknowledgement was lost, creates no duplicates', async () => {
    const before = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId, externalOrderId: 'off-1' } }));
    // Pretend the cloud's acknowledgement never reached the core: everything is marked pending again.
    core.store.run("UPDATE cloud_outbox SET status = 'PENDING', next_attempt_at = 0");
    const r = await uplink.sync();
    expect(r.error).toBeUndefined();
    const after = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId, externalOrderId: 'off-1' } }));
    expect(after).toHaveLength(1);
    expect(after[0].syncVersion).toBe(before[0].syncVersion); // the duplicate event changed nothing
    const movements = await prisma.runAsPlatform((tx) => tx.inventoryMovement.count({ where: { restaurantId, movementId: 'OFF-M1' } }));
    expect(movements).toBe(1);
    expect(core.status().pendingCloudEvents).toBe(0);
  });

  it('a connection that drops part-way loses nothing: the rest is kept and finishes on the next try', async () => {
    core.ingestOrders(posDevice(), [orderEvent('drop-1', 'DROP-1'), orderEvent('drop-2', 'DROP-2')]);
    core.pushMovements(posDevice(), [{ movementId: 'DROP-M', itemId: 'tea', itemName: 'Tea', type: 'SALE', quantityDelta: -1, unit: 'kg', reason: 'sale', occurredAt: new Date().toISOString() }]);
    uplink.failAfterRequests = 2; // roster + orders succeed, the connection then drops
    const partial = await uplink.sync();
    expect(partial.error).toBeDefined();
    expect(core.pullOrders(0).orders.some((o) => o.externalOrderId === 'drop-1')).toBe(true);
    expect(core.status().pendingCloudEvents).toBeGreaterThanOrEqual(1);

    uplink.failAfterRequests = null;
    expect((await uplink.sync()).error).toBeUndefined();
    expect(core.status().pendingCloudEvents).toBe(0);
    expect(await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId, externalOrderId: { in: ['drop-1', 'drop-2'] } } }))).toBe(2);
  });

  it('changes made elsewhere reach the branch, and the core\'s own uploads are not echoed back as new changes', async () => {
    const seqBefore = core.status().sequence;
    // An order created directly in the cloud (for example from another device) in this branch.
    const created = await cloud('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('from-cloud-1', 'CLOUD-EVT-1')] });
    expect(created.status).toBe(201);
    await uplink.sync();
    const pulled = core.pullOrders(0).orders.map((o) => o.externalOrderId);
    expect(pulled).toContain('from-cloud-1');

    const seqAfterFirst = core.status().sequence;
    expect(seqAfterFirst).toBeGreaterThan(seqBefore);
    await uplink.sync(); // nothing new anywhere
    expect(core.status().sequence).toBe(seqAfterFirst);
  });

  it('another branch\'s orders never enter this branch\'s core', async () => {
    await cloud('post', '/api/v1/orders/sync', otherBranchPos).send({ events: [orderEvent('branch-b-1', 'B-EVT-1')] });
    await uplink.sync();
    expect(core.pullOrders(0).orders.map((o) => o.externalOrderId)).not.toContain('branch-b-1');
  });

  it('menu edits made offline at the branch reach the cloud, and cloud edits reach the branch', async () => {
    core.pushEntities(posDevice(), 'MENU_ITEM', [{ externalId: 'dish-1', payload: { id: 'dish-1', name: 'Paneer Tikka', updatedAt: new Date().toISOString() } }]);
    await uplink.sync();
    const inCloud = await prisma.runAsPlatform((tx) => tx.syncedEntity.findFirst({ where: { restaurantId, entityType: 'MENU_ITEM', externalId: 'dish-1' } }));
    expect(inCloud).toBeTruthy();

    await cloud('post', '/api/v1/entity-sync/MENU_ITEM', posToken).send({ events: [{ externalId: 'dish-2', payload: { id: 'dish-2', name: 'Dal Makhani', updatedAt: new Date().toISOString() } }] });
    await uplink.sync();
    expect(core.pullEntities('MENU_ITEM').entities.map((e) => e.externalId)).toContain('dish-2');
  });

  it('a device revoked in the cloud is refused by the core after the next roster refresh', async () => {
    await platform('post', `/api/v1/devices/${posId}/commands`).send({ commandType: 'DISABLE_DEVICE' });
    expect(core.authenticate(posToken).id).toBe(posId); // not yet known locally
    await uplink.sync();
    expect(() => core.authenticate(posToken)).toThrow(/revoked/);
  });

  it('a freshly activated core, started as a service, syncs by itself: local order in, cloud order out, no button pressed', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { activate, run } = await import('../../../packages/branch-core/src/main');
    const dir = mkdtempSync(join(tmpdir(), 'jv-core-run-'));

    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, branchId: branchA, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    await activate(dir, cloudBase, key.body.code);

    const port = 5300 + Math.floor(Math.random() * 500);
    const running = await run(dir, port, {});
    try {
      // A new POS activated in the cloud while this core is up.
      const newPos = await activate2();
      let ready = false;
      for (let i = 0; i < 40 && !ready; i++) {
        const r = await fetch(`http://127.0.0.1:${port}/api/v1/orders/sync?afterSeq=0`, { headers: { Authorization: `Bearer ${newPos}` } });
        ready = r.status === 200;
        if (!ready) await new Promise((r2) => setTimeout(r2, 250));
      }
      expect(ready).toBe(true);

      const push = await fetch(`http://127.0.0.1:${port}/api/v1/orders/sync`, {
        method: 'POST', headers: { Authorization: `Bearer ${newPos}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [orderEvent('service-1', 'SVC-1')] })
      });
      expect(push.status).toBe(201);

      let inCloud = 0;
      for (let i = 0; i < 60 && inCloud === 0; i++) {
        inCloud = await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId, externalOrderId: 'service-1' } }));
        if (inCloud === 0) await new Promise((r) => setTimeout(r, 250));
      }
      expect(inCloud).toBe(1);
    } finally {
      await running.stop();
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* still closing */ }
    }
  }, 60000);

  async function activate2() {
    return (await activate('POS', branchA)).token;
  }
});

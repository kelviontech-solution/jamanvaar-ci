import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderSyncService } from '../src/modules/order-sync/order-sync.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';
import { QrAdmission, QrBusyException, isTransientDbError, withTransientRetry } from '../src/modules/qr/qr-resilience';
import { withPoolParams, transactionOptions } from '../src/prisma/pool-config';
import { redactUrl, requestIdFrom } from '../src/common/request-context';
import { runLoad } from '../scripts/qr-load';
import { QrResolutionCache } from '../src/modules/qr/qr-resolution-cache';
import { RealtimeBus, RealtimeEvent, pgConnectionString } from '../src/common/realtime/realtime-bus';

const OPEN = { ipRequestsPerMinute: 1e7, ipFailedLookupsPerMinute: 1e7, tokenRequestsPerMinute: 1e7, tokenOrdersPerMinute: 1e7, sessionOrdersPerMinute: 1e7, orderStatusPerMinute: 1e7 };

describe('QR ordering: scale, resilience and shared counters', () => {
  describe('small building blocks', () => {
    it('pool settings come from the environment and never override what the URL already says', () => {
      expect(withPoolParams('postgresql://u@h/db?schema=public', { DB_POOL_SIZE: '20', DB_POOL_TIMEOUT_SECONDS: '5' })).toBe('postgresql://u@h/db?schema=public&connection_limit=20&pool_timeout=5');
      expect(withPoolParams('postgresql://u@h/db?connection_limit=3', { DB_POOL_SIZE: '20' })).toBe('postgresql://u@h/db?connection_limit=3');
      expect(withPoolParams('postgresql://u@h/db', {})).toBe('postgresql://u@h/db');
      expect(transactionOptions({})).toEqual({ maxWait: 5000, timeout: 15000 });
      expect(transactionOptions({ DB_TX_TIMEOUT_MS: '30000' }).timeout).toBe(30000);
    });

    it('request ids are kept only when plain, and logs never carry a QR token or order reference', () => {
      expect(requestIdFrom('abc-12345678')).toBe('abc-12345678');
      expect(requestIdFrom('x y\nz')).not.toBe('x y\nz');
      const token = 'A'.repeat(32);
      expect(redactUrl(`/api/v1/public/qr/${token}/menu?x=1`)).toBe('/api/v1/public/qr/:token/menu?x=1');
      expect(redactUrl('/api/v1/public/qr/orders/JQ-ABCDEFGH')).toBe('/api/v1/public/qr/orders/:orderRef');
      expect(redactUrl(`/q/${token}`)).toBe('/q/:token');
      expect(redactUrl('/api/v1/menu/version')).toBe('/api/v1/menu/version');
    });

    it('only genuinely transient database errors are retried, a bounded number of times', async () => {
      expect(isTransientDbError({ code: 'P2034' })).toBe(true);
      expect(isTransientDbError({ code: 'P2002' })).toBe(false);
      let calls = 0;
      expect(await withTransientRetry(async () => { if (++calls < 3) throw Object.assign(new Error('conflict'), { code: 'P2034' }); return 'ok'; })).toBe('ok');
      expect(calls).toBe(3);
      calls = 0;
      await expect(withTransientRetry(async () => { calls++; throw Object.assign(new Error('conflict'), { code: 'P2034' }); })).rejects.toThrow('conflict');
      expect(calls).toBe(3);
      calls = 0;
      await expect(withTransientRetry(async () => { calls++; throw new Error('bad input'); })).rejects.toThrow('bad input');
      expect(calls).toBe(1);
    });

    it('admission control runs a bounded number at once, queues the rest, and turns a long wait into a 503 with Retry-After', async () => {
      const cfg = (v: Record<string, string>) => ({ get: (k: string) => v[k] }) as never;
      const gate = new QrAdmission(cfg({ QR_MAX_CONCURRENT_ORDERS: '2', QR_ORDER_QUEUE_WAIT_MS: '60' }));
      let running = 0;
      let peak = 0;
      const work = (ms: number) => async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, ms)); running--; return 'done'; };
      const settled = await Promise.allSettled([gate.run(work(150)), gate.run(work(150)), gate.run(work(10)), gate.run(work(10))]);
      expect(peak).toBe(2);
      expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(2);
      const busy = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected').map((s) => s.reason);
      expect(busy).toHaveLength(2);
      expect(busy.every((e) => e instanceof QrBusyException && e.getStatus() === 503 && e.retryAfterSeconds === 2)).toBe(true);
      // and it recovers: once the work is done the gate is open again
      expect(await gate.run(work(1))).toBe('done');
      expect(gate.stats.rejected).toBe(2);
    });
  });

  describe('against the real API and database', () => {
    let app: INestApplication;
    let app2: INestApplication;
    let prisma: PrismaService;
    const stamp = Date.now();
    const adminEmail = `test-qr-scale-${stamp}@example.com`;
    let platformToken: string;
    const restaurantIds: string[] = [];
    const planIds: string[] = [];
    const F: Record<string, any> = {};

    // One real listening server per app: a hundred simultaneous supertest calls must not each open and close their own.
    let base = '';
    let base2 = '';
    const http = () => request(base);
    const platform = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
    const as = (method: 'get' | 'post' | 'put' | 'delete', url: string, token: string) => http()[method](url).set('Authorization', `Bearer ${token}`);
    const now = () => new Date().toISOString();
    const tokenOf = (url: string) => url.split('/q/')[1];
    const order = (items: any[], extra: Record<string, unknown> = {}) => ({ items: items.map((i) => ({ optionIds: [], ...i })), idempotencyKey: `k-${Math.random().toString(36).slice(2)}-${Date.now()}`, ...extra });
    const push = (token: string, type: string, id: string, payload: Record<string, unknown>) =>
      as('post', `/api/v1/entity-sync/${type}`, token).send({ events: [{ externalId: id, payload: { id, ...payload, updatedAt: now() } }] });

    async function restaurant(name: string, planId: string) {
      const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase()}-${stamp}@test.example.com` });
      const id = rest.body.restaurant.id as string;
      restaurantIds.push(id);
      await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
      return id;
    }
    async function activate(rid: string, type: string, branchId?: string) {
      const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId: rid, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      return (await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type })).body.deviceToken as string;
    }
    /** A restaurant with one branch, a POS, a menu, and `tables` QR-coded tables. */
    async function venue(name: string, planId: string, tables: number) {
      const rid = await restaurant(name, planId);
      const b = (await platform('post', '/api/v1/branches').send({ restaurantId: rid, name: `${name} Branch`, code: name.slice(0, 3).toUpperCase() + 'B' })).body.id as string;
      const console = await activate(rid, 'POS_ADMIN');
      const pos = await activate(rid, 'POS', b);
      await push(console, 'TAX_GROUP', 'tax5', { name: 'GST 5%', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: false, isActive: true });
      await push(console, 'MENU_CATEGORY', 'mains', { name: 'Mains', isActive: true, sortOrder: 1 });
      await push(console, 'MENU_ITEM', 'dish', { categoryId: 'mains', name: 'Dish', price: 100, isAvailable: true, taxGroupId: 'tax5', modifierGroupIds: [], sortOrder: 1 });
      const tokens: string[] = [];
      for (let i = 1; i <= tables; i++) {
        await push(console, 'DINING_TABLE', `t${i}`, { tableNumber: String(i), capacity: 4, isActive: true, branchId: b });
        tokens.push(tokenOf((await as('post', `/api/v1/restaurant/qr/tables/t${i}/generate`, console).send({ branchId: b })).body.url));
      }
      await as('post', '/api/v1/menu/publish', console).send({ note: 'go live' });
      return { rid, b, console, pos, tokens };
    }

    beforeAll(async () => {
      app = await createTestApp();
      app2 = await createTestApp();
      await app.listen(0);
      await app2.listen(0);
      base = await app.getUrl();
      base2 = await app2.getUrl();
      prisma = app.get(PrismaService);
      app.get(QrRateLimiter).configure(OPEN);
      app2.get(QrRateLimiter).configure(OPEN);
      await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
      platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
      const plan = await platform('post', '/api/v1/plans').send({ tier: 'QR', name: `TEST QrScale Plan ${stamp}`, priceMonthly: 900000, maxBranches: 5, maxDevices: 60, maxUsers: 60, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, qrTableOrdering: true } });
      planIds.push(plan.body.id);
      F.plan = plan.body.id;
      F.a = await venue('ScaleA', F.plan, 20);
      F.b = await venue('ScaleB', F.plan, 2);
    }, 300_000);

    afterAll(async () => {
      await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
      await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
      await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
      await app.close();
      await app2.close();
    });

    it('two API instances share one set of counters through the database (no Redis)', async () => {
      const a = app.get(QrRateLimiter);
      const b = app2.get(QrRateLimiter);
      a.configure({ ...OPEN, tokenOrdersPerMinute: 4 }, `shared-${stamp}`);
      b.configure({ ...OPEN, tokenOrdersPerMinute: 4 }, `shared-${stamp}`);
      const token = F.b.tokens[0];
      const hit = (server: INestApplication) => request(server === app ? base : base2).post(`/api/v1/public/qr/${token}/orders`).send(order([{ itemId: 'dish', quantity: 1 }]));
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await hit(i % 2 ? app2 : app)).status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(4); // 4 allowed across BOTH instances, not 4 each
      expect(statuses.filter((s) => s === 429)).toHaveLength(2);
      a.configure(OPEN);
      b.configure(OPEN);
    });

    it('a wake-up raised on one API instance reaches devices connected to the other (PostgreSQL LISTEN/NOTIFY, no Redis)', async () => {
      expect(pgConnectionString('postgresql://u:p@h:5432/db?schema=public&connection_limit=5')).toBe('postgresql://u:p@h:5432/db');
      await new Promise((r) => setTimeout(r, 300)); // both listeners are connected
      const got: RealtimeEvent[] = [];
      const own: RealtimeEvent[] = [];
      const sub = app2.get(RealtimeBus).events$.subscribe((e) => { if (e.seq === 4242) got.push(e); });
      const sub1 = app.get(RealtimeBus).events$.subscribe((e) => { if (e.seq === 4242) own.push(e); });
      app.get(RealtimeBus).publish({ restaurantId: F.b.rid, branchId: null, kind: 'menu', seq: 4242 });
      for (let i = 0; i < 40 && got.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
      sub.unsubscribe();
      sub1.unsubscribe();
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({ restaurantId: F.b.rid, kind: 'menu' });
      expect(own).toHaveLength(1); // the origin instance is not woken twice
    });

    it('resolution is cached briefly, yet a revoke or a settings change on ANY instance takes effect at once on every instance', async () => {
      const previous = process.env.QR_RESOLVE_CACHE_MS;
      process.env.QR_RESOLVE_CACHE_MS = '60000'; // long enough that only invalidation can explain a change
      const cached = await createTestApp();
      process.env.QR_RESOLVE_CACHE_MS = previous;
      try {
        await cached.listen(0);
        const c = request(await cached.getUrl());
        cached.get(QrRateLimiter).configure(OPEN);
        await new Promise((r) => setTimeout(r, 300));
        const token = F.a.tokens[19];
        expect((await c.get(`/api/v1/public/qr/${token}/menu`)).status).toBe(200);
        expect((await c.get(`/api/v1/public/qr/${token}/menu`)).status).toBe(200);
        const cache = cached.get(QrResolutionCache) as QrResolutionCache<any>;
        expect(cache.stats.hits).toBeGreaterThanOrEqual(1);

        // Ordering switched off through a DIFFERENT instance: the cached instance stops serving immediately.
        await as('put', '/api/v1/restaurant/qr/settings', F.a.console).send({ orderingEnabled: false });
        for (let i = 0; i < 40 && (await c.get(`/api/v1/public/qr/${token}/menu`)).status === 200; i++) await new Promise((r) => setTimeout(r, 50));
        expect((await c.get(`/api/v1/public/qr/${token}/menu`)).status).toBe(410);
        await as('put', '/api/v1/restaurant/qr/settings', F.a.console).send({ orderingEnabled: true });
        for (let i = 0; i < 40 && (await c.get(`/api/v1/public/qr/${token}/menu`)).status !== 200; i++) await new Promise((r) => setTimeout(r, 50));
        expect((await c.get(`/api/v1/public/qr/${token}/menu`)).status).toBe(200);

        // A revoke on another instance is honoured at once too.
        const codes = (await as('get', '/api/v1/restaurant/qr/tables', F.a.console)).body;
        const code = codes.find((t: any) => t.qr?.url?.endsWith(token))?.qr;
        expect(code).toBeTruthy();
        await as('post', `/api/v1/restaurant/qr/codes/${code.id}/revoke`, F.a.console).send({});
        for (let i = 0; i < 40 && (await c.get(`/api/v1/public/qr/${token}/menu`)).status === 200; i++) await new Promise((r) => setTimeout(r, 50));
        expect((await c.get(`/api/v1/public/qr/${token}/menu`)).status).toBe(410);
      } finally {
        await cached.close();
      }
    });

    it('a counter store that cannot be read lets the guest through rather than failing the request', async () => {
      const limiter = app.get(QrRateLimiter) as any;
      const original = limiter.bump;
      limiter.bump = async () => { throw new Error('counter store down'); };
      try {
        const res = await http().get(`/api/v1/public/qr/${F.b.tokens[1]}/menu`);
        expect(res.status).toBe(200);
      } finally {
        limiter.bump = original;
      }
    });

    it('100 guests at one table place 100 different orders at once: every one is stored once, numbers and cursor positions are unique', async () => {
      const token = F.a.tokens[0];
      const sessions = await Promise.all(Array.from({ length: 100 }, () => http().post('/api/v1/public/qr/session')));
      const t0 = Date.now();
      const results = await Promise.all(sessions.map((s, i) => http().post(`/api/v1/public/qr/${token}/orders`).set('x-qr-session', s.body.session).send(order([{ itemId: 'dish', quantity: 1 + (i % 3) }]))));
      const ms = Date.now() - t0;
      const codes = results.map((r) => r.status);
      expect(codes.filter((c) => c === 201), JSON.stringify(results.find((r) => r.status !== 201)?.body)).toHaveLength(100);
      const numbers = results.map((r) => r.body.orderNumber);
      expect(new Set(numbers).size).toBe(100);
      expect(new Set(results.map((r) => r.body.publicOrderId)).size).toBe(100);
      const pulled = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.a.pos)).body.orders.filter((o: any) => o.tableLabel === '1');
      expect(pulled).toHaveLength(100);
      expect(new Set(pulled.map((o: any) => o.seq)).size).toBe(100);
      // 100 concurrent order writes finishing well inside the guest's patience on a laptop-class test database
      expect(ms).toBeLessThan(20_000);
      console.log(`[load] 100 concurrent orders on one table: ${ms}ms (${Math.round(ms / 100)}ms/order amortised)`);
    }, 60_000);

    it('the same order sent by 50 retries at once is one order (idempotency under concurrency)', async () => {
      const token = F.a.tokens[1];
      const body = order([{ itemId: 'dish', quantity: 2 }]);
      const results = await Promise.all(Array.from({ length: 50 }, () => http().post(`/api/v1/public/qr/${token}/orders`).send(body)));
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.publicOrderId)).size).toBe(1);
    }, 60_000);

    it('20 tables ordering at the same moment, two restaurants in parallel: no order lands in the wrong restaurant or branch', async () => {
      const jobs: Array<Promise<any>> = [];
      for (const t of F.a.tokens.slice(2, 19)) for (let i = 0; i < 3; i++) jobs.push(http().post(`/api/v1/public/qr/${t}/orders`).send(order([{ itemId: 'dish', quantity: 1 }])));
      for (const t of F.b.tokens) for (let i = 0; i < 3; i++) jobs.push(http().post(`/api/v1/public/qr/${t}/orders`).send(order([{ itemId: 'dish', quantity: 1 }])));
      const res = await Promise.all(jobs);
      expect(res.every((r) => r.status === 201), JSON.stringify(res.find((r) => r.status !== 201)?.body)).toBe(true);
      const rowsB = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId: F.b.rid, source: 'QR' } }));
      const rowsA = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId: F.a.rid, source: 'QR' } }));
      expect(rowsB.every((o) => o.branchId === F.b.b)).toBe(true);
      expect(rowsA.every((o) => o.branchId === F.a.b)).toBe(true);
      expect(rowsB.length).toBeGreaterThanOrEqual(9); // the shared-counter test above also placed 4 here
      const pubB = new Set(rowsB.map((o) => o.publicOrderId));
      expect(rowsA.some((o) => pubB.has(o.publicOrderId))).toBe(false);
    }, 60_000);

    it('500 guests reading the menu (100 at a time, as a test machine connection queue allows) are all served the same published version', async () => {
      const t0 = Date.now();
      const res: any[] = [];
      for (let wave = 0; wave < 5; wave++) res.push(...(await Promise.all(Array.from({ length: 100 }, (_, i) => http().get(`/api/v1/public/qr/${F.a.tokens[(wave * 100 + i) % 19]}/menu`)))));
      const ms = Date.now() - t0;
      expect(res.every((r) => r.status === 200)).toBe(true);
      expect(new Set(res.map((r) => r.body.menuVersion)).size).toBe(1);
      console.log(`[load] 500 concurrent menu reads: ${ms}ms`);
      expect(ms).toBeLessThan(30_000);
    }, 60_000);

    it('platform staff can read operating figures (outcomes, latency, admission, cache); a restaurant device cannot', async () => {
      await http().get(`/api/v1/public/qr/${F.a.tokens[3]}/menu`);
      const res = await platform('get', '/api/v1/qr-ordering/runtime');
      expect(res.status).toBe(200);
      expect(res.body.outcomes['menu:2xx']).toBeGreaterThan(0);
      expect(res.body.outcomes['order:2xx']).toBeGreaterThan(0);
      expect(res.body.latencyMs.samples).toBeGreaterThan(0);
      expect(res.body.admission).toMatchObject({ admitted: expect.any(Number), rejected: expect.any(Number) });
      expect(JSON.stringify(res.body)).not.toContain(F.a.tokens[3]);
      expect((await as('get', '/api/v1/qr-ordering/runtime', F.a.console)).status).toBeGreaterThanOrEqual(401);
      expect((await http().get('/api/v1/qr-ordering/runtime')).status).toBe(401);
    });

    it('the load harness drives a running API and reports latency and outcomes; no order is duplicated or lost', async () => {
      const report = await runLoad({ base, tokens: F.a.tokens.slice(0, 10), guests: 60, ordersPerGuest: 2, itemId: 'dish', wave: 30 });
      expect(report.outcomes['order:201']).toBe(120);
      expect(report.outcomes['menu:200']).toBe(60);
      expect(report.duplicateOrderRefs).toBe(0);
      expect(report.latencyMs.order.p95).toBeGreaterThan(0);
      console.log(`[load] harness: ${JSON.stringify({ orders: report.outcomes['order:201'], perSecond: report.ordersPerSecond, orderP95: report.latencyMs.order.p95, menuP95: report.latencyMs.menu.p95 })}`);
    }, 60_000);

    it('1000 tokens are resolved at once (cache off): every answer is right and none crosses restaurants', async () => {
      const tokens = [...F.a.tokens.slice(0, 19), ...F.b.tokens];
      const res: any[] = [];
      for (let wave = 0; wave < 10; wave++) res.push(...(await Promise.all(Array.from({ length: 100 }, (_, i) => http().get(`/api/v1/public/qr/${tokens[(wave * 100 + i) % tokens.length]}`)))));
      expect(res.every((r) => r.status === 200)).toBe(true);
      const names = new Set(res.map((r) => r.body.restaurant.name));
      expect(names.size).toBe(2);
    }, 90_000);

    it('a transient database failure during an order is retried and the guest still gets exactly one order', async () => {
      const orders = app.get(OrderSyncService) as any;
      const original = orders.ingestServerOrder.bind(orders);
      let failures = 0;
      orders.ingestServerOrder = async (...args: any[]) => {
        if (failures < 2) { failures++; throw Object.assign(new Error('write conflict'), { code: 'P2034' }); }
        return original(...args);
      };
      try {
        const body = order([{ itemId: 'dish', quantity: 1 }]);
        const res = await http().post(`/api/v1/public/qr/${F.b.tokens[1]}/orders`).send(body);
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(failures).toBe(2);
        const again = await http().post(`/api/v1/public/qr/${F.b.tokens[1]}/orders`).send(body);
        expect(again.body.publicOrderId).toBe(res.body.publicOrderId);
      } finally {
        orders.ingestServerOrder = original;
      }
    });

    it('every response carries what a guest needs to recover: a signed session, and no stack traces', async () => {
      const s = await http().post('/api/v1/public/qr/session');
      expect(s.status).toBe(200);
      const bad = await http().post(`/api/v1/public/qr/${F.b.tokens[0]}/orders`).send({ items: [] });
      expect(bad.status).toBe(400);
      expect(JSON.stringify(bad.body)).not.toContain('node_modules');
    });
  });
});

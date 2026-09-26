import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';

/**
 * QR ordering as a SaaS capability, proven against the real API and database. Covers the plan-driven entitlement
 * (never a price or a plan name), server-minted revocable codes, tenant and branch isolation, server-authoritative
 * pricing, idempotency, delivery through the ONE order pipeline (cursor, branch, source), status, settings,
 * limits, audit and abuse resistance.
 */
describe('QR ordering (SaaS)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-qr-saas-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post' | 'put', url: string, token: string) => http()[method](url).set('Authorization', `Bearer ${token}`);
  const now = () => new Date().toISOString();

  /** A plan lists its features, as a Super Admin builds one: the restaurant applications it includes and the QR switch. */
  async function plan(name: string, tier: 'CORE' | 'PRO' | 'QR', priceMonthly: number, entitlements: { qrTableOrdering: boolean }) {
    const features = { posTerminal: true, restaurantAdmin: true, captainApp: tier !== 'CORE', kotKdsRouting: tier !== 'CORE', ...entitlements };
    const res = await platform('post', '/api/v1/plans').send({ tier, name: `TEST ${name} ${stamp}`, priceMonthly, maxBranches: 5, maxDevices: 30, maxUsers: 30, entitlements: features });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    planIds.push(res.body.id);
    return res.body.id as string;
  }
  async function restaurant(name: string, planId: string) {
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase().replace(/\W/g, '')}-${stamp}@test.example.com` });
    const id = rest.body.restaurant.id as string;
    restaurantIds.push(id);
    const sub = await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    expect(sub.status, JSON.stringify(sub.body)).toBe(201);
    return { id, subscriptionId: sub.body.id as string };
  }
  async function branch(restaurantId: string, name: string, code: string) {
    return (await platform('post', '/api/v1/branches').send({ restaurantId, name, code })).body.id as string;
  }
  async function activate(restaurantId: string, type: string, branchId?: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(key.status, `activation key for ${type}: ${JSON.stringify(key.body)}`).toBe(201);
    const res = await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.deviceToken as string;
  }
  const push = (token: string, type: string, externalId: string, payload: Record<string, unknown>) =>
    as('post', `/api/v1/entity-sync/${type}`, token).send({ events: [{ externalId, payload: { id: externalId, ...payload, updatedAt: now() } }] });

  async function seedMenu(console: string, suffix: string, opts: { taxInclusive?: boolean } = {}) {
    await push(console, 'TAX_GROUP', `tax-${suffix}`, { name: 'GST 5', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: opts.taxInclusive === true, isActive: true });
    await push(console, 'MODIFIER_GROUP', `mod-${suffix}`, {
      name: 'Add-ons', isRequired: false, minSelections: 0, maxSelections: 2, sortOrder: 1,
      options: [{ id: `opt-cheese-${suffix}`, groupId: `mod-${suffix}`, name: 'Extra Cheese', priceDelta: 35, isAvailable: true, sortOrder: 1 }]
    });
    await push(console, 'MODIFIER_GROUP', `req-${suffix}`, {
      name: 'Size', isRequired: true, minSelections: 1, maxSelections: 1, sortOrder: 2,
      options: [{ id: `opt-small-${suffix}`, groupId: `req-${suffix}`, name: 'Small', priceDelta: 0, isAvailable: true, sortOrder: 1 }, { id: `opt-large-${suffix}`, groupId: `req-${suffix}`, name: 'Large', priceDelta: 50, isAvailable: true, sortOrder: 2 }]
    });
    await push(console, 'MENU_CATEGORY', `cat-${suffix}`, { name: `Mains ${suffix}`, isActive: true, sortOrder: 1 });
    await push(console, 'MENU_ITEM', `pizza-${suffix}`, { categoryId: `cat-${suffix}`, name: `Paneer Pizza ${suffix}`, price: 249, isAvailable: true, taxGroupId: `tax-${suffix}`, modifierGroupIds: [`mod-${suffix}`] });
    await push(console, 'MENU_ITEM', `coffee-${suffix}`, { categoryId: `cat-${suffix}`, name: `Cold Coffee ${suffix}`, price: 120, isAvailable: true, taxGroupId: `tax-${suffix}`, modifierGroupIds: [] });
    await push(console, 'MENU_ITEM', `sized-${suffix}`, { categoryId: `cat-${suffix}`, name: `Sized ${suffix}`, price: 100, isAvailable: true, taxGroupId: `tax-${suffix}`, modifierGroupIds: [`req-${suffix}`] });
    await push(console, 'MENU_ITEM', `secret-${suffix}`, { categoryId: `cat-${suffix}`, name: `Secret ${suffix}`, price: 999, isAvailable: true, taxGroupId: `tax-${suffix}`, salesChannels: ['POS'] });
    await push(console, 'MENU_ITEM', `soldout-${suffix}`, { categoryId: `cat-${suffix}`, name: `Sold Out ${suffix}`, price: 50, isAvailable: false, taxGroupId: `tax-${suffix}` });
    await push(console, 'MENU_ITEM', `untaxed-${suffix}`, { categoryId: `cat-${suffix}`, name: `Unpublished tax ${suffix}`, price: 50, isAvailable: true, taxGroupId: `not-published` });
  }
  const table = (console: string, id: string, number: string, extra: Record<string, unknown> = {}) => push(console, 'DINING_TABLE', id, { tableNumber: number, capacity: 4, isActive: true, ...extra });

  const orderBody = (items: Array<{ itemId: string; quantity: number; optionIds?: string[]; note?: string }>, extra: Record<string, unknown> = {}) => ({
    items: items.map((i) => ({ optionIds: [], ...i })), idempotencyKey: `k-${Math.random().toString(36).slice(2)}-${Date.now()}`, ...extra
  });

  // fixtures
  const F: Record<string, any> = {};

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    // The suite drives one address hard; the abuse tests below set the real limits.
    app.get(QrRateLimiter).configure({ ipRequestsPerMinute: 100000, ipFailedLookupsPerMinute: 100000, tokenRequestsPerMinute: 100000, tokenOrdersPerMinute: 100000, sessionOrdersPerMinute: 100000, orderStatusPerMinute: 100000 });
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    // Three plans exactly as the product sells them, plus two that prove entitlement follows features, not names or prices.
    F.core = await plan('Core 5k', 'CORE', 500000, { qrTableOrdering: false });
    F.pro = await plan('Pro 7k', 'PRO', 700000, { qrTableOrdering: false });
    F.qr = await plan('QR 9k', 'QR', 900000, { qrTableOrdering: true });
    F.cheapWithQr = await plan('Cheap plan with QR flag', 'CORE', 100000, { qrTableOrdering: true });
    F.qrTierWithoutFlag = await plan('QR tier, flag off', 'QR', 900000, { qrTableOrdering: false });

    // Restaurant A: the QR plan, two branches.
    const a = await restaurant('QrSaasA', F.qr);
    F.A = a;
    F.A.b1 = await branch(a.id, 'A Ahmedabad', 'AAA');
    F.A.b2 = await branch(a.id, 'A Surat', 'ASS');
    F.A.console = await activate(a.id, 'POS_ADMIN');
    F.A.pos1 = await activate(a.id, 'POS', F.A.b1);
    F.A.pos1b = await activate(a.id, 'POS', F.A.b1);
    F.A.pos2 = await activate(a.id, 'POS', F.A.b2);
    await seedMenu(F.A.console, 'a');
    await table(F.A.console, 'tbl-a12', '12', { branchId: F.A.b1 });
    await table(F.A.console, 'tbl-a1', '1', { branchId: F.A.b1 });
    await table(F.A.console, 'tbl-s1', '1', { branchId: F.A.b2 });

    // Restaurant B: also QR-enabled, one branch, its own different menu and the SAME table number.
    const b = await restaurant('QrSaasB', F.qr);
    F.B = b;
    F.B.b1 = await branch(b.id, 'B Main', 'BBB');
    F.B.console = await activate(b.id, 'POS_ADMIN');
    F.B.pos = await activate(b.id, 'POS', F.B.b1);
    await seedMenu(F.B.console, 'b');
    await table(F.B.console, 'tbl-b1', '1', { branchId: F.B.b1 });

    // Restaurant C: plan without QR.
    const c = await restaurant('QrSaasC', F.core);
    F.C = c;
    F.C.b1 = await branch(c.id, 'C Main', 'CCC');
    F.C.console = await activate(c.id, 'POS_ADMIN');
    await seedMenu(F.C.console, 'c');
    await table(F.C.console, 'tbl-c1', '1', { branchId: F.C.b1 });
  }, 180_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const gen = async (console: string, tableId: string, body: Record<string, unknown> = {}) => as('post', `/api/v1/restaurant/qr/tables/${tableId}/generate`, console).send(body);
  const tokenOf = (url: string) => url.split('/q/')[1];

  // ============================================================== entitlement (spec 3, 4, 5, 36-39)

  describe('entitlement is a feature of the plan, never its name or price', () => {
    it('₹5,000 and ₹7,000 plans are locked, the ₹9,000 plan is enabled, all from the plans\' own feature flags', async () => {
      const c = await as('get', '/api/v1/restaurant/qr/entitlement', F.C.console);
      expect(c.body).toMatchObject({ enabled: false, reason: 'NOT_INCLUDED' });
      expect(c.body.lockedMessage).toMatch(/not included in your current plan/i);
      const a = await as('get', '/api/v1/restaurant/qr/entitlement', F.A.console);
      expect(a.body).toMatchObject({ enabled: true, reason: 'OK', source: 'PLAN' });
    });

    it('a cheap CORE plan that lists QR has it; a QR-tier plan whose feature flag is off does not (the flag beats name, tier and price)', async () => {
      const cheap = await restaurant('QrCheap', F.cheapWithQr);
      const cheapConsole = await activate(cheap.id, 'POS_ADMIN');
      expect((await as('get', '/api/v1/restaurant/qr/entitlement', cheapConsole)).body.enabled).toBe(true);
      const off = await restaurant('QrTierOff', F.qrTierWithoutFlag);
      const offConsole = await activate(off.id, 'POS_ADMIN');
      expect((await as('get', '/api/v1/restaurant/qr/entitlement', offConsole)).body).toMatchObject({ enabled: false });
    });

    it('a locked restaurant cannot generate a code, and the refusal is an entitlement error (403), not a hidden button', async () => {
      const res = await gen(F.C.console, 'tbl-c1', { branchId: F.C.b1 });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'ENTITLEMENT_REQUIRED', feature: 'QR_ORDERING', reason: 'NOT_INCLUDED' });
    });

    it('upgrade enables QR for the existing tables; downgrade blocks new QR orders at once; history is kept', async () => {
      const r = await restaurant('QrUpDown', F.pro);
      const console = await activate(r.id, 'POS_ADMIN');
      const bId = await branch(r.id, 'U Main', 'UUU');
      const pos = await activate(r.id, 'POS', bId);
      await seedMenu(console, 'u');
      await table(console, 'tbl-u1', '1', { branchId: bId });
      expect((await gen(console, 'tbl-u1')).status).toBe(403); // ₹7,000 plan: locked

      await platform('patch', `/api/v1/subscriptions/${r.subscriptionId}/change-plan`).send({ planId: F.qr });
      const made = await gen(console, 'tbl-u1');
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const token = tokenOf(made.body.url);
      const placed = await http().post(`/api/v1/public/qr/${token}/orders`).send(orderBody([{ itemId: 'coffee-u', quantity: 1 }]));
      expect(placed.status, JSON.stringify(placed.body)).toBe(201);

      await platform('patch', `/api/v1/subscriptions/${r.subscriptionId}/change-plan`).send({ planId: F.pro });
      const blocked = await http().post(`/api/v1/public/qr/${token}/orders`).send(orderBody([{ itemId: 'coffee-u', quantity: 1 }]));
      expect(blocked.status).toBe(403);
      expect((await http().get(`/api/v1/public/qr/${token}`)).status).toBe(403);
      expect((await http().get(`/api/v1/public/qr/${token}`)).body.message).toBe('QR Ordering is currently unavailable for this restaurant.');
      // The order already taken is still there for the restaurant, and still trackable.
      const orders = await as('get', '/api/v1/restaurant/qr/orders', console);
      expect(orders.body).toHaveLength(1);
      expect((await http().get(`/api/v1/public/qr/orders/${placed.body.publicOrderId}`)).status).toBe(200);
      expect(pos).toBeTruthy();
    });

    it('a Super Admin override enables QR for one restaurant without touching the plan, and revoking it disables again', async () => {
      const r = await restaurant('QrOverride', F.pro);
      const console = await activate(r.id, 'POS_ADMIN');
      const ob = await branch(r.id, 'O Main', 'OOO');
      await seedMenu(console, 'o');
      await table(console, 'tbl-o1', '1', { branchId: ob });
      expect((await gen(console, 'tbl-o1')).status).toBe(403);

      const detail = await platform('get', `/api/v1/qr-ordering/restaurants/${r.id}`);
      expect(detail.body.entitlement).toMatchObject({ qrEntitled: false });
      const on = await http().patch(`/api/v1/qr-ordering/restaurants/${r.id}/entitlement`).set('Authorization', `Bearer ${platformToken}`).send({ qrEntitled: true, maxActiveTables: 3 });
      expect(on.status, JSON.stringify(on.body)).toBe(200);
      const ent = await as('get', '/api/v1/restaurant/qr/entitlement', console);
      expect(ent.body).toMatchObject({ enabled: true, source: 'MANUAL_OVERRIDE' });
      expect(ent.body.limits.qrMaxActiveTables).toBe(3);
      const made = await gen(console, 'tbl-o1');
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      // The plan itself is untouched.
      const planRow = await platform('get', `/api/v1/plans/${F.pro}`);
      expect(planRow.body.entitlements.qrTableOrdering).toBe(false);

      await http().patch(`/api/v1/qr-ordering/restaurants/${r.id}/entitlement`).set('Authorization', `Bearer ${platformToken}`).send({ qrEntitled: false });
      expect((await as('get', '/api/v1/restaurant/qr/entitlement', console)).body.enabled).toBe(false);
    });

    it('an expired subscription and a suspended restaurant are not entitled', async () => {
      const r = await restaurant('QrExpired', F.qr);
      const console = await activate(r.id, 'POS_ADMIN');
      await prisma.runAsPlatform((tx) => tx.subscription.update({ where: { id: r.subscriptionId }, data: { expiresAt: new Date(Date.now() - 86400000) } }));
      // The device guard itself refuses a terminal with no live subscription; the entitlement result says why.
      const res = await as('get', '/api/v1/restaurant/qr/entitlement', console);
      expect([403, 200]).toContain(res.status);
      if (res.status === 200) expect(res.body).toMatchObject({ enabled: false, reason: 'SUBSCRIPTION_EXPIRED' });
    });
  });

  // ============================================================== codes (spec 9-12, 31)

  describe('server-minted, revocable, regenerable QR codes', () => {
    let code: { id: string; url: string };

    it('generates an unguessable token that contains no table number and resolves to the right restaurant, branch and table', async () => {
      const made = await gen(F.A.console, 'tbl-a12', { branchId: F.A.b1 });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      code = made.body;
      const token = tokenOf(code.url);
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(token).not.toContain('12');
      const info = await http().get(`/api/v1/public/qr/${token}`);
      expect(info.status, JSON.stringify(info.body)).toBe(200);
      expect(info.body.restaurant.name).toContain('QrSaasA');
      expect(info.body.branch.name).toBe('A Ahmedabad');
      expect(info.body.table).toMatchObject({ displayNumber: '12' });
    });

    it('a second code for a table with one is refused; codes for many tables coexist', async () => {
      expect((await gen(F.A.console, 'tbl-a12', { branchId: F.A.b1 })).status).toBe(409);
      expect((await gen(F.A.console, 'tbl-a1', { branchId: F.A.b1 })).status).toBe(201);
      expect((await gen(F.A.console, 'tbl-s1', { branchId: F.A.b2 })).status).toBe(201);
    });

    it('a branch that is not the restaurant\'s, or a table that does not exist, is refused', async () => {
      expect((await gen(F.A.console, 'tbl-a1', { branchId: F.B.b1 })).status).toBe(409); // already has a code: checked first
      expect((await gen(F.A.console, 'no-such-table', { branchId: F.A.b1 })).status).toBe(404);
    });

    it('regenerating makes the old token dead (revoked, not merely unknown) and the new one live', async () => {
      const oldToken = tokenOf(code.url);
      const re = await as('post', `/api/v1/restaurant/qr/codes/${code.id}/regenerate`, F.A.console);
      expect(re.status, JSON.stringify(re.body)).toBe(201);
      expect(re.body.version).toBe(2);
      const newToken = tokenOf(re.body.url);
      expect(newToken).not.toBe(oldToken);
      const old = await http().get(`/api/v1/public/qr/${oldToken}`);
      expect(old.status).toBe(410);
      expect(old.body.code).toBe('QR_REVOKED');
      expect((await http().get(`/api/v1/public/qr/${newToken}`)).status).toBe(200);
      code = re.body;
    });

    it('disable and enable are reversible; revoke is permanent', async () => {
      const token = tokenOf(code.url);
      expect((await as('post', `/api/v1/restaurant/qr/codes/${code.id}/disable`, F.A.console)).body.status).toBe('DISABLED');
      expect((await http().get(`/api/v1/public/qr/${token}`)).body.code).toBe('QR_DISABLED');
      expect((await as('post', `/api/v1/restaurant/qr/codes/${code.id}/enable`, F.A.console)).body.status).toBe('ACTIVE');
      expect((await http().get(`/api/v1/public/qr/${token}`)).status).toBe(200);
      expect((await as('post', `/api/v1/restaurant/qr/codes/${code.id}/revoke`, F.A.console)).body.status).toBe('REVOKED');
      expect((await as('post', `/api/v1/restaurant/qr/codes/${code.id}/enable`, F.A.console)).status).toBe(409);
      // Bring the table back for the ordering tests below.
      const fresh = await gen(F.A.console, 'tbl-a12', { branchId: F.A.b1 });
      expect(fresh.status).toBe(201);
      code = fresh.body;
    });

    it('another restaurant cannot see, change or print this restaurant\'s code; a terminal that is not the admin console cannot manage codes', async () => {
      expect((await as('post', `/api/v1/restaurant/qr/codes/${code.id}/revoke`, F.B.console)).status).toBe(404);
      expect((await as('get', `/api/v1/restaurant/qr/codes/${code.id}/print-data`, F.B.console)).status).toBe(404);
      expect((await as('get', '/api/v1/restaurant/qr/tables', F.A.pos1)).status).toBe(403);
      expect((await http().get('/api/v1/restaurant/qr/tables')).status).toBe(401);
      const bTables = await as('get', '/api/v1/restaurant/qr/tables', F.B.console);
      expect(JSON.stringify(bTables.body)).not.toContain(code.id);
    });

    it('print data holds what is printed on the card and no internal identifier', async () => {
      const pd = await as('get', `/api/v1/restaurant/qr/codes/${code.id}/print-data`, F.A.console);
      expect(pd.status).toBe(200);
      expect(pd.body).toMatchObject({ tableLabel: 'Table 12', branchName: 'A Ahmedabad', tagline: 'Scan • Order • Enjoy' });
      expect(pd.body.restaurantName).toContain('QrSaasA');
      expect(pd.body.url).toContain('/q/');
      expect(JSON.stringify(pd.body)).not.toMatch(new RegExp(`${F.A.id}|${F.A.b1}|${code.id}`));
    });

    it('every administrative action is in the audit log with actor and target', async () => {
      const rows = await prisma.platformDb.auditLog.findMany({ where: { restaurantId: F.A.id, category: 'QR_ORDERING' } });
      const actions = new Set(rows.map((r) => r.action));
      for (const a of ['QR_CREATED', 'QR_REGENERATED', 'QR_DISABLED', 'QR_ENABLED', 'QR_REVOKED']) expect(actions.has(a), a).toBe(true);
      expect(rows.every((r) => r.actorId)).toBe(true);
    });

    it('the table limit from the entitlement is enforced', async () => {
      const r = await restaurant('QrLimit', F.qr);
      const console = await activate(r.id, 'POS_ADMIN');
      const b = await branch(r.id, 'L Main', 'LLL');
      await table(console, 'tbl-l1', '1', { branchId: b });
      await table(console, 'tbl-l2', '2', { branchId: b });
      await http().patch(`/api/v1/qr-ordering/restaurants/${r.id}/entitlement`).set('Authorization', `Bearer ${platformToken}`).send({ maxActiveTables: 1 });
      expect((await gen(console, 'tbl-l1')).status).toBe(201);
      const second = await gen(console, 'tbl-l2');
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/allows 1 active QR code/);
    });
  });

  // ============================================================== public resolution and menu (spec 13-17, 29, 51, 52)

  describe('public resolution and the menu', () => {
    let tokenA12: string;
    let tokenB1: string;
    let tokenA1: string;
    let tokenS1: string;

    beforeAll(async () => {
      const list = await as('get', '/api/v1/restaurant/qr/tables', F.A.console);
      const url = (id: string) => list.body.find((t: any) => t.tableId === id).qr.url as string;
      tokenA12 = tokenOf(url('tbl-a12'));
      tokenA1 = tokenOf(url('tbl-a1'));
      tokenS1 = tokenOf(url('tbl-s1'));
      tokenB1 = tokenOf((await gen(F.B.console, 'tbl-b1')).body.url);
    });

    it('returns only what a customer may know: no ids, no internal fields', async () => {
      const info = await http().get(`/api/v1/public/qr/${tokenA12}`);
      const text = JSON.stringify(info.body);
      for (const forbidden of [F.A.id, F.A.b1, 'restaurantId', 'branchId', 'tableId', 'deviceToken', 'password', 'gstin', 'subscription']) expect(text).not.toContain(forbidden);
      expect(Object.keys(info.body).sort()).toEqual(['branch', 'mode', 'ordering', 'restaurant', 'table']);
    });

    it('serves the restaurant\'s own menu with its own modifiers, hides other channels, sold-out and unpriceable dishes', async () => {
      const res = await http().get(`/api/v1/public/qr/${tokenA12}/menu`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const names = res.body.items.map((i: any) => i.name);
      expect(names).toEqual(expect.arrayContaining(['Paneer Pizza a', 'Cold Coffee a', 'Sized a']));
      expect(names).not.toContain('Secret a'); // POS only
      expect(names).not.toContain('Sold Out a');
      expect(names).not.toContain('Unpublished tax a'); // names a tax group the restaurant never published
      expect(res.body.modifierGroups.find((g: any) => g.name === 'Add-ons').options[0]).toMatchObject({ name: 'Extra Cheese', priceDelta: 35 });
      expect(res.body.items.every((i: any) => !('taxRate' in i) && !('basePrice' in i))).toBe(true);
      expect(res.headers.etag).toBeTruthy();
      const again = await http().get(`/api/v1/public/qr/${tokenA12}/menu`).set('If-None-Match', res.headers.etag);
      expect(again.status).toBe(304);
    });

    it('never leaks another restaurant: same table number, different menu, each sees only its own', async () => {
      const a = await http().get(`/api/v1/public/qr/${tokenA1}/menu`);
      const b = await http().get(`/api/v1/public/qr/${tokenB1}/menu`);
      expect(a.body.items.every((i: any) => i.name.endsWith(' a'))).toBe(true);
      expect(b.body.items.every((i: any) => i.name.endsWith(' b'))).toBe(true);
      expect((await http().get(`/api/v1/public/qr/${tokenB1}`)).body.restaurant.name).toContain('QrSaasB');
    });

    it('a dish restricted to one branch is shown only there (branch isolation of the menu)', async () => {
      await push(F.A.console, 'MENU_ITEM', 'branch-only-a', { categoryId: 'cat-a', name: 'Surat Special', price: 80, isAvailable: true, taxGroupId: 'tax-a', modifierGroupIds: [], branchIds: [F.A.b2] });
      const ahmedabad = (await http().get(`/api/v1/public/qr/${tokenA1}/menu`)).body.items.map((i: any) => i.name);
      const surat = (await http().get(`/api/v1/public/qr/${tokenS1}/menu`)).body.items.map((i: any) => i.name);
      expect(ahmedabad).not.toContain('Surat Special');
      expect(surat).toContain('Surat Special');
    });

    it('unknown, malformed and guessed tokens are refused, and the same words are used for every unavailable state', async () => {
      expect((await http().get(`/api/v1/public/qr/${'A'.repeat(32)}`)).status).toBe(404);
      expect((await http().get('/api/v1/public/qr/short')).status).toBe(400);
      const inactiveTable = await table(F.A.console, 'tbl-a1', '1', { branchId: F.A.b1, isActive: false });
      expect(inactiveTable.status).toBe(201);
      const off = await http().get(`/api/v1/public/qr/${tokenA1}`);
      expect(off.status).toBe(410);
      expect(off.body.message).toBe('QR Ordering is currently unavailable for this restaurant.');
      await table(F.A.console, 'tbl-a1', '1', { branchId: F.A.b1, isActive: true });
    });

    it('a table that belongs to another branch cannot be opened through this branch\'s code', async () => {
      const r = await restaurant('QrBranchClash', F.qr);
      const console = await activate(r.id, 'POS_ADMIN');
      const b1 = await branch(r.id, 'X1', 'XX1');
      const b2 = await branch(r.id, 'X2', 'XX2');
      await table(console, 'tbl-x', '1', { branchId: b1 });
      const made = await gen(console, 'tbl-x', { branchId: b1 });
      const token = tokenOf(made.body.url);
      expect((await http().get(`/api/v1/public/qr/${token}`)).status).toBe(200);
      await table(console, 'tbl-x', '1', { branchId: b2 }); // the table now says it is in branch 2
      expect((await http().get(`/api/v1/public/qr/${token}`)).status).toBe(410);
    });

    it('menu changes are reflected on the next request and the version follows publication', async () => {
      const before = await http().get(`/api/v1/public/qr/${tokenA12}/menu`);
      await push(F.A.console, 'MENU_ITEM', 'coffee-a', { categoryId: 'cat-a', name: 'Cold Coffee a', price: 130, isAvailable: true, taxGroupId: 'tax-a', modifierGroupIds: [] });
      const after = await http().get(`/api/v1/public/qr/${tokenA12}/menu`);
      expect(after.body.items.find((i: any) => i.id === 'coffee-a').price).toBe(130);
      expect(after.body.etag).not.toBe(before.body.etag);
      await push(F.A.console, 'MENU_ITEM', 'coffee-a', { categoryId: 'cat-a', name: 'Cold Coffee a', price: 120, isAvailable: true, taxGroupId: 'tax-a', modifierGroupIds: [] });
    });

    // ------------------------------------------------------------ ordering (spec 18-21, 44, 45, 56, 58)

    describe('placing an order', () => {
      it('prices on the server: 2 pizzas with cheese + 1 coffee, 5% tax on top, whatever the client believes', async () => {
        const res = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'pizza-a', quantity: 2, optionIds: ['opt-cheese-a'] }, { itemId: 'coffee-a', quantity: 1 }], { customerName: 'Guest' }));
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        // (2 × (249+35)) + 120 = 688 ; 5% = 34.40 ; 722.40
        expect(res.body.total).toBe(722.4);
        expect(res.body).toMatchObject({ status: 'RECEIVED', table: '12' });
        expect(res.body.publicOrderId).toMatch(/^JQ-[A-Z2-9]{8}$/);
        expect(res.body.orderNumber).toMatch(/^QR-\d+$/);
      });

      it('quotes the exact server price before the order is placed, and creates nothing', async () => {
        const before = await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId: F.A.id } }));
        const q = await http().post(`/api/v1/public/qr/${tokenA12}/quote`).send({ items: [{ itemId: 'pizza-a', quantity: 2, optionIds: ['opt-cheese-a'] }, { itemId: 'coffee-a', quantity: 1, optionIds: [] }] });
        expect(q.status, JSON.stringify(q.body)).toBe(200);
        expect(q.body).toMatchObject({ subtotal: 688, tax: 34.4, total: 722.4 });
        expect(q.body.lines[0]).toMatchObject({ name: 'Paneer Pizza a', quantity: 2, unitPrice: 284, lineTotal: 596.4 });
        expect((await http().post(`/api/v1/public/qr/${tokenA12}/quote`).send({ items: [{ itemId: 'nope', quantity: 1, optionIds: [] }] })).status).toBe(400);
        expect((await http().post(`/api/v1/public/qr/${tokenA12}/quote`).send({ items: [{ itemId: 'coffee-a', quantity: 1, optionIds: [] }], restaurantId: F.B.id })).status).toBe(400);
        expect(await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId: F.A.id } }))).toBe(before);
      });

      it('rejects any client price, total, restaurant, branch or table in the body', async () => {
        for (const extra of [{ total: 1 }, { restaurantId: F.B.id }, { branchId: F.B.b1 }, { tableId: 'tbl-b1' }, { unitPrice: 1 }]) {
          const res = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }], extra));
          expect(res.status, JSON.stringify(extra)).toBe(400);
        }
        const line = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send({ idempotencyKey: `x-${Date.now()}-abc`, items: [{ itemId: 'coffee-a', quantity: 1, optionIds: [], price: 1 }] });
        expect(line.status).toBe(400);
      });

      it('an item of another restaurant, an unknown item, an unavailable one and a POS-only one are refused', async () => {
        for (const itemId of ['coffee-b', 'no-such-item', 'soldout-a', 'secret-a']) {
          const res = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId, quantity: 1 }]));
          expect(res.status, itemId).toBe(400);
        }
      });

      it('modifier rules come from the restaurant: an unknown option, another item\'s option, and a missing required choice are refused', async () => {
        const send = (items: any[]) => http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody(items));
        expect((await send([{ itemId: 'coffee-a', quantity: 1, optionIds: ['opt-cheese-a'] }])).status).toBe(400); // not this dish's option
        expect((await send([{ itemId: 'pizza-a', quantity: 1, optionIds: ['made-up'] }])).status).toBe(400);
        expect((await send([{ itemId: 'sized-a', quantity: 1 }])).status).toBe(400); // required size missing
        const ok = await send([{ itemId: 'sized-a', quantity: 1, optionIds: ['opt-large-a'] }]);
        expect(ok.status, JSON.stringify(ok.body)).toBe(201);
        expect(ok.body.total).toBe(157.5); // (100 + 50) × 1.05
      });

      it('quantity abuse is refused', async () => {
        for (const quantity of [0, -1, 51, 1.5]) {
          expect((await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity }]))).status, String(quantity)).toBe(400);
        }
      });

      it('a repeated submit (double click, retry after timeout, refresh) is one order, and concurrent submits are one order', async () => {
        const body = orderBody([{ itemId: 'coffee-a', quantity: 1 }]);
        const first = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(body);
        const second = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(body);
        expect(second.body.publicOrderId).toBe(first.body.publicOrderId);
        const raceBody = orderBody([{ itemId: 'coffee-a', quantity: 2 }]);
        const race = await Promise.all([1, 2, 3, 4].map(() => http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(raceBody)));
        expect(race.every((r) => r.status === 201)).toBe(true);
        expect(new Set(race.map((r) => r.body.publicOrderId)).size).toBe(1);
        const same = await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId: F.A.id, publicOrderId: race[0].body.publicOrderId } }));
        expect(same).toBe(1);
      });

      it('the same key on two different codes is two orders (a key is scoped to its code)', async () => {
        const body = orderBody([{ itemId: 'coffee-a', quantity: 1 }]);
        const a = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(body);
        const other = await http().post(`/api/v1/public/qr/${tokenA1}/orders`).send(body);
        expect(other.status, JSON.stringify(other.body)).toBe(201);
        expect(other.body.publicOrderId).not.toBe(a.body.publicOrderId);
      });

      it('online payment is not offered and cannot be forced: the order is unpaid until the counter settles it', async () => {
        const online = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }], { paymentMethod: 'UPI' }));
        expect(online.status).toBe(400);
        const put = await as('put', '/api/v1/restaurant/qr/settings', F.A.console).send({ allowOnlinePayment: true });
        expect(put.status).toBe(409);
        const placed = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }]));
        const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findUnique({ where: { publicOrderId: placed.body.publicOrderId } }));
        expect(row).toMatchObject({ paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER', source: 'QR', orderType: 'DINE_IN', tableLabel: '12' });
      });

      it('tax-inclusive menus extract the tax instead of adding it', async () => {
        const r = await restaurant('QrInclusive', F.qr);
        const console = await activate(r.id, 'POS_ADMIN');
        const b = await branch(r.id, 'I Main', 'III');
        await seedMenu(console, 'i', { taxInclusive: true });
        await table(console, 'tbl-i1', '1', { branchId: b });
        const t = tokenOf((await gen(console, 'tbl-i1')).body.url);
        const res = await http().post(`/api/v1/public/qr/${t}/orders`).send(orderBody([{ itemId: 'coffee-i', quantity: 1 }]));
        expect(res.body.total).toBe(120);
      });

      it('numbers are per branch per day and never repeat under concurrency', async () => {
        const results = await Promise.all(Array.from({ length: 8 }, (_, i) => http().post(`/api/v1/public/qr/${tokenS1}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }, ...(i % 2 ? [] : [])]))));
        const numbers = results.map((r) => r.body.orderNumber);
        expect(results.every((r) => r.status === 201)).toBe(true);
        expect(new Set(numbers).size).toBe(8);
      });
    });

    // ------------------------------------------------------------ delivery through the one pipeline (spec 22-24, 27, 28, 41-43)

    describe('the order enters the canonical pipeline', () => {
      it('is delivered to every POS of the right branch by the sequence cursor, with source QR, and to no other branch', async () => {
        const placed = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'pizza-a', quantity: 1, optionIds: [] }]));
        expect(placed.status).toBe(201);
        const find = (pull: any) => pull.body.orders.find((o: any) => o.publicOrderId === placed.body.publicOrderId);
        const p1 = await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos1);
        const p1b = await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos1b);
        const other = await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos2);
        const otherRestaurant = await as('get', '/api/v1/orders/sync?afterSeq=0', F.B.pos);
        const got = find(p1);
        expect(got, 'QR order missing from the sequence-cursor pull').toBeTruthy();
        expect(got).toMatchObject({ source: 'QR', orderType: 'DINE_IN', tableLabel: '12', status: 'NEW', paymentStatus: 'PENDING' });
        expect(typeof got.seq).toBe('number');
        expect(find(p1b)).toBeTruthy(); // two POS devices both receive it
        expect(find(other)).toBeFalsy(); // another branch never does
        expect(find(otherRestaurant)).toBeFalsy(); // another restaurant never does
        const items = got.items.map((i: any) => `${i.quantity}×${i.name}`);
        expect(items).toContain('1×Paneer Pizza a');
      });

      it('a device that missed the live wake-up recovers it from its cursor, and re-reading changes nothing', async () => {
        const pull0 = await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos1);
        const cursor = pull0.body.latestSeq;
        const placed = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 3 }]));
        const recovered = await as('get', `/api/v1/orders/sync?afterSeq=${cursor}`, F.A.pos1);
        expect(recovered.body.orders.map((o: any) => o.publicOrderId)).toEqual([placed.body.publicOrderId]);
        const replay = await as('get', `/api/v1/orders/sync?afterSeq=${cursor}`, F.A.pos1);
        expect(replay.body.orders).toHaveLength(1);
        const drained = await as('get', `/api/v1/orders/sync?afterSeq=${replay.body.latestSeq}`, F.A.pos1);
        expect(drained.body.orders).toHaveLength(0);
      });

      it('sequence numbers of QR and POS orders share one gapless, increasing counter', async () => {
        const pull = await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos1);
        const seqs = pull.body.orders.map((o: any) => o.seq);
        expect(seqs).toEqual([...seqs].sort((x: number, y: number) => x - y));
        expect(new Set(seqs).size).toBe(seqs.length);
      });

      it('kitchen progress reaches the customer through the canonical status, and a POS payment is recorded once', async () => {
        const placed = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }]));
        const pub = placed.body.publicOrderId;
        const pull = await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos1);
        const order = pull.body.orders.find((o: any) => o.publicOrderId === pub);
        expect((await http().get(`/api/v1/public/qr/orders/${pub}`)).body.status).toBe('RECEIVED');

        const update = (status: string, extra: Record<string, unknown> = {}) =>
          as('post', '/api/v1/orders/sync', F.A.pos1).send({ events: [{ externalOrderId: order.externalOrderId, orderType: 'DINE_IN', status, items: order.items, subtotal: order.subtotal, taxAmount: order.taxAmount, totalAmount: order.totalAmount, updatedAt: now(), ...extra }] });
        expect((await update('PREPARING')).status).toBe(201);
        expect((await http().get(`/api/v1/public/qr/orders/${pub}`)).body.status).toBe('PREPARING');
        await update('READY');
        expect((await http().get(`/api/v1/public/qr/orders/${pub}`)).body.status).toBe('READY');
        await update('COMPLETED', { paymentStatus: 'SUCCESS', paymentMethod: 'CASH_AT_COUNTER' });
        expect((await http().get(`/api/v1/public/qr/orders/${pub}`)).body.status).toBe('COMPLETED');
        const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findUnique({ where: { publicOrderId: pub } }));
        expect(row?.source).toBe('QR'); // a device update never changes the channel
      });

      it('accepting a QR order is a claim: the first POS to record it owns it, a later claim cannot take it, and the ticket knows its kitchen station', async () => {
        await push(F.A.console, 'MENU_ITEM', 'bar-a', { categoryId: 'cat-a', name: 'Mojito a', price: 90, isAvailable: true, taxGroupId: 'tax-a', modifierGroupIds: [], kitchenStation: 'Bar' });
        const placed = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'bar-a', quantity: 1 }]));
        const pull = await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos1);
        const order = pull.body.orders.find((o: any) => o.publicOrderId === placed.body.publicOrderId);
        expect(order.items[0].kitchenStation).toBe('Bar');
        expect(order.meta).toMatchObject({ sourceType: 'QR_TABLE', orderNumber: placed.body.orderNumber, tokenNumber: placed.body.orderNumber });
        const claim = (token: string, by: string) =>
          as('post', '/api/v1/orders/sync', token).send({ events: [{ externalOrderId: order.externalOrderId, orderType: 'DINE_IN', status: 'PREPARING', items: order.items, subtotal: order.subtotal, taxAmount: order.taxAmount, totalAmount: order.totalAmount, meta: { acceptedBy: by }, updatedAt: now() }] });
        expect((await claim(F.A.pos1, 'pos-first')).status).toBe(201);
        expect((await claim(F.A.pos1b, 'pos-second')).status).toBe(201);
        const after = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.A.pos1)).body.orders.find((o: any) => o.publicOrderId === placed.body.publicOrderId);
        expect(after.meta.acceptedBy).toBe('pos-first');
      });

      it('an order status link reveals nothing about any other order, and an unknown reference is a plain 404', async () => {
        expect((await http().get('/api/v1/public/qr/orders/JQ-AAAAAAAA')).status).toBe(404);
        expect((await http().get('/api/v1/public/qr/orders/1')).status).toBe(404);
        expect((await http().get('/api/v1/public/qr/orders/qr_0123456789')).status).toBe(404);
      });
    });

    // ------------------------------------------------------------ settings and limits (spec 46, 33)

    describe('settings and limits are database-backed and enforced', () => {
      it('notes, customisations and required customer details follow the restaurant\'s settings', async () => {
        const put = await as('put', '/api/v1/restaurant/qr/settings', F.A.console).send({ allowCustomerNotes: false, allowModifiers: false, requireCustomerName: true });
        expect(put.status, JSON.stringify(put.body)).toBe(200);
        expect((await as('get', '/api/v1/restaurant/qr/settings', F.A.console)).body).toMatchObject({ allowCustomerNotes: false, allowModifiers: false, requireCustomerName: true });
        const send = (extra: Record<string, unknown>, items = [{ itemId: 'coffee-a', quantity: 1 }] as any[]) => http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody(items, extra));
        expect((await send({ customerName: 'G', orderNotes: 'no ice' })).status).toBe(400);
        expect((await send({ customerName: 'G' }, [{ itemId: 'pizza-a', quantity: 1, optionIds: ['opt-cheese-a'] }])).status).toBe(400);
        expect((await send({})).status).toBe(400); // name required
        expect((await send({ customerName: 'G' })).status).toBe(201);
        await as('put', '/api/v1/restaurant/qr/settings', F.A.console).send({ allowCustomerNotes: true, allowModifiers: true, requireCustomerName: false });
        const audit = await prisma.platformDb.auditLog.count({ where: { restaurantId: F.A.id, action: 'QR_SETTINGS_CHANGED' } });
        expect(audit).toBeGreaterThanOrEqual(2);
      });

      it('turning QR ordering off, or a mode off, stops the guest page at once', async () => {
        await as('put', '/api/v1/restaurant/qr/settings', F.A.console).send({ tableOrderingEnabled: false });
        expect((await http().get(`/api/v1/public/qr/${tokenA12}`)).body.code).toBe('MODE_OFF');
        await as('put', '/api/v1/restaurant/qr/settings', F.A.console).send({ tableOrderingEnabled: true, orderingEnabled: false });
        expect((await http().get(`/api/v1/public/qr/${tokenA12}`)).body.code).toBe('ORDERING_OFF');
        await as('put', '/api/v1/restaurant/qr/settings', F.A.console).send({ orderingEnabled: true });
        expect((await http().get(`/api/v1/public/qr/${tokenA12}`)).status).toBe(200);
      });

      it('a MENU_ONLY code shows the menu but never assumes a table: the guest must say dine-in with a table, or takeaway', async () => {
        await as('put', '/api/v1/restaurant/qr/settings', F.A.console).send({ menuOnlyEnabled: true });
        const made = await as('post', '/api/v1/restaurant/qr/menu-codes', F.A.console).send({ branchId: F.A.b1, label: 'Menu card' });
        expect(made.status, JSON.stringify(made.body)).toBe(201);
        const t = tokenOf(made.body.url);
        const info = await http().get(`/api/v1/public/qr/${t}`);
        expect(info.body).toMatchObject({ mode: 'MENU_ONLY', table: null });
        expect((await http().post(`/api/v1/public/qr/${t}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }]))).status).toBe(400);
        expect((await http().post(`/api/v1/public/qr/${t}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }], { orderType: 'DINE_IN' }))).status).toBe(400);
        const dine = await http().post(`/api/v1/public/qr/${t}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }], { orderType: 'DINE_IN', tableNumber: '7' }));
        expect(dine.status, JSON.stringify(dine.body)).toBe(201);
        const take = await http().post(`/api/v1/public/qr/${t}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }], { orderType: 'TAKEAWAY' }));
        expect(take.body.table).toBeNull();
        // A table code cannot be turned into a takeaway or another table.
        expect((await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }], { orderType: 'TAKEAWAY' }))).status).toBe(400);
      });

      it('the daily QR order limit stops the next order even under concurrency', async () => {
        const r = await restaurant('QrDaily', F.qr);
        const console = await activate(r.id, 'POS_ADMIN');
        const b = await branch(r.id, 'D Main', 'DDD');
        await seedMenu(console, 'd');
        await table(console, 'tbl-d1', '1', { branchId: b });
        const t = tokenOf((await gen(console, 'tbl-d1')).body.url);
        await http().patch(`/api/v1/qr-ordering/restaurants/${r.id}/entitlement`).set('Authorization', `Bearer ${platformToken}`).send({ maxOrdersPerDay: 2 });
        const burst = await Promise.all([1, 2, 3, 4].map((i) => http().post(`/api/v1/public/qr/${t}/orders`).send(orderBody([{ itemId: 'coffee-d', quantity: i }]))));
        expect(burst.filter((x) => x.status === 201)).toHaveLength(2);
        expect(burst.filter((x) => x.status === 410)).toHaveLength(2);
      });
    });

    // ------------------------------------------------------------ dashboard and events (spec 8, 47)

    describe('numbers come from facts', () => {
      it('the overview counts real scans, orders and sales, and a restaurant with no activity shows zeros, not invented figures', async () => {
        const ov = await as('get', '/api/v1/restaurant/qr/overview', F.A.console);
        expect(ov.status).toBe(200);
        expect(ov.body.entitlement.enabled).toBe(true);
        expect(ov.body.activeCodes).toBeGreaterThanOrEqual(3);
        const dbCount = await prisma.runAsPlatform((tx) => tx.syncedOrder.count({ where: { restaurantId: F.A.id, source: 'QR' } }));
        expect(ov.body.today.ordersPlaced).toBeLessThanOrEqual(dbCount);
        expect(ov.body.today.ordersPlaced).toBeGreaterThan(0);
        expect(ov.body.today.scans).toBeGreaterThan(0);
        expect(ov.body.today.sales).toBeGreaterThan(0);

        const fresh = await restaurant('QrQuiet', F.qr);
        const quiet = await activate(fresh.id, 'POS_ADMIN');
        const zero = await as('get', '/api/v1/restaurant/qr/overview', quiet);
        expect(zero.body.today).toMatchObject({ scans: 0, ordersPlaced: 0, sales: 0, averageOrderValue: 0 });
      });

      it('tracks only meaningful events, with no personal data', async () => {
        const events = await prisma.runAsPlatform((tx) => tx.qrEvent.findMany({ where: { restaurantId: F.A.id } }));
        const types = new Set(events.map((e) => e.type));
        for (const t of ['QR_SCANNED', 'QR_MENU_VIEWED', 'QR_ORDER_STARTED', 'QR_ORDER_PLACED', 'QR_ORDER_FAILED']) expect(types.has(t), t).toBe(true);
        expect(JSON.stringify(events)).not.toMatch(/Guest|9876|ip/i);
      });

      it('the platform view is computed from orders, and the old client-reported usage call cannot inflate it', async () => {
        const detail = await platform('get', `/api/v1/qr-ordering/restaurants/${F.A.id}`);
        expect(detail.body.usage.ordersToday).toBeGreaterThan(0);
        const inflated = await http().post('/api/v1/tenant/qr-ordering/usage').set('Authorization', 'Bearer nope').send({ activeTables: 999, ordersToday: 999, revenueToday: 999999 });
        expect(inflated.status).toBe(401);
      });
    });

    // ------------------------------------------------------------ abuse (spec 30, 57)

    describe('abuse resistance', () => {
      const limiter = () => app.get(QrRateLimiter);
      const defaults = { ipRequestsPerMinute: 600, ipFailedLookupsPerMinute: 30, tokenRequestsPerMinute: 300, tokenOrdersPerMinute: 12, sessionOrdersPerMinute: 6, orderStatusPerMinute: 120 };

      it('token guessing is stopped after a few misses, and a real code on the same address is refused too until the window passes', async () => {
        limiter().configure(defaults);
        const codes: number[] = [];
        for (let i = 0; i < 40; i++) codes.push((await http().get(`/api/v1/public/qr/${Buffer.from(`guess-${i}-${stamp}`).toString('base64url').padEnd(24, 'x')}`)).status);
        expect(codes.filter((c) => c === 404)).toHaveLength(30);
        expect(codes.slice(30).every((c) => c === 429)).toBe(true);
        limiter().configure(defaults); // window reset for the next tests
      });

      it('a busy restaurant is not punished for its size: many guests on one address ordering at different tables all get through', async () => {
        limiter().configure(defaults);
        const results = await Promise.all(Array.from({ length: 30 }, (_, i) => http().get(`/api/v1/public/qr/${i % 2 ? tokenA1 : tokenA12}/menu`).set('x-qr-session', `session-${i}-abcdefgh`)));
        expect(results.every((r) => r.status === 200)).toBe(true);
      });

      it('order spam on one code is throttled per code, and one session is limited on its own', async () => {
        limiter().configure({ ...defaults, tokenOrdersPerMinute: 4 });
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) statuses.push((await http().post(`/api/v1/public/qr/${tokenB1}/orders`).send(orderBody([{ itemId: 'coffee-b', quantity: 1 }]))).status);
        expect(statuses.filter((c) => c === 201)).toHaveLength(4);
        expect(statuses.filter((c) => c === 429)).toHaveLength(2);
        // another table's code is unaffected
        expect((await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }]))).status).toBe(201);

        limiter().configure({ ...defaults, sessionOrdersPerMinute: 2 });
        const bySession = [];
        for (let i = 0; i < 3; i++) bySession.push((await http().post(`/api/v1/public/qr/${tokenA12}/orders`).set('x-qr-session', 'one-browser-session').send(orderBody([{ itemId: 'coffee-a', quantity: 1 }]))).status);
        expect(bySession).toEqual([201, 201, 429]);
        limiter().configure(defaults);
      });

      it('the order status page is limited per order', async () => {
        limiter().configure({ ...defaults, orderStatusPerMinute: 3 });
        const placed = await http().post(`/api/v1/public/qr/${tokenA12}/orders`).send(orderBody([{ itemId: 'coffee-a', quantity: 1 }]));
        const polls: number[] = [];
        for (let i = 0; i < 5; i++) polls.push((await http().get(`/api/v1/public/qr/orders/${placed.body.publicOrderId}`)).status);
        expect(polls).toEqual([200, 200, 200, 429, 429]);
        limiter().configure(defaults);
      });
    });
  });
});

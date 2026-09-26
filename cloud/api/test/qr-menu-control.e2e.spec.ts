import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';
import { extractImages, buildContent, MAX_MENU_IMAGE_BYTES } from '../src/modules/menu-publications/menu-snapshot';

/**
 * The restaurant controls everything the guest sees and pays (Track R of the QR plan): the menu the guest reads is a
 * PUBLISHED snapshot, orders remember what they were ordered with, ordering rules come from the restaurant's own data.
 */
describe('QR ordering: restaurant-controlled menu', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-qr-menu-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post' | 'put' | 'delete', url: string, token: string) => http()[method](url).set('Authorization', `Bearer ${token}`);
  const now = () => new Date().toISOString();
  const F: Record<string, any> = {};

  async function plan() {
    const res = await platform('post', '/api/v1/plans').send({ tier: 'QR', name: `TEST QrMenu Plan ${stamp}`, priceMonthly: 900000, maxBranches: 5, maxDevices: 30, maxUsers: 30, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, qrTableOrdering: true } });
    planIds.push(res.body.id);
    return res.body.id as string;
  }
  async function restaurant(name: string, planId: string) {
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase()}-${stamp}@test.example.com` });
    const id = rest.body.restaurant.id as string;
    restaurantIds.push(id);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    return id;
  }
  const branch = async (rid: string, name: string, code: string) => (await platform('post', '/api/v1/branches').send({ restaurantId: rid, name, code })).body.id as string;
  async function activate(rid: string, type: string, branchId?: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId: rid, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    return (await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type })).body.deviceToken as string;
  }
  const push = (token: string, type: string, id: string, payload: Record<string, unknown>) =>
    as('post', `/api/v1/entity-sync/${type}`, token).send({ events: [{ externalId: id, payload: { id, ...payload, updatedAt: now() } }] });
  const publish = (console: string, note = 'test') => as('post', '/api/v1/menu/publish', console).send({ note });
  const tokenOf = (url: string) => url.split('/q/')[1];
  const order = (items: any[], extra: Record<string, unknown> = {}) => ({ items: items.map((i) => ({ optionIds: [], ...i })), idempotencyKey: `k-${Math.random().toString(36).slice(2)}-${Date.now()}`, ...extra });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    app.get(QrRateLimiter).configure({ ipRequestsPerMinute: 1e6, ipFailedLookupsPerMinute: 1e6, tokenRequestsPerMinute: 1e6, tokenOrdersPerMinute: 1e6, sessionOrdersPerMinute: 1e6, orderStatusPerMinute: 1e6 } as never);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const planId = await plan();
    F.rid = await restaurant('QrMenuA', planId);
    F.b1 = await branch(F.rid, 'Menu Branch 1', 'MB1');
    F.b2 = await branch(F.rid, 'Menu Branch 2', 'MB2');
    F.console = await activate(F.rid, 'POS_ADMIN');
    F.pos1 = await activate(F.rid, 'POS', F.b1);
    await push(F.console, 'TAX_GROUP', 'tax5', { name: 'GST 5%', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: false, isActive: true });
    await push(F.console, 'MODIFIER_GROUP', 'cheese', { name: 'Cheese', isRequired: true, minSelections: 1, maxSelections: 1, sortOrder: 1, options: [{ id: 'reg', groupId: 'cheese', name: 'Regular Cheese', priceDelta: 0, isAvailable: true, sortOrder: 1 }, { id: 'extra', groupId: 'cheese', name: 'Extra Cheese', priceDelta: 40, isAvailable: true, sortOrder: 2 }] });
    await push(F.console, 'MENU_CATEGORY', 'pizza', { name: 'Pizza', isActive: true, sortOrder: 1 });
    await push(F.console, 'MENU_ITEM', 'marg', { categoryId: 'pizza', name: 'Margherita Pizza', price: 249, isAvailable: true, taxGroupId: 'tax5', modifierGroupIds: ['cheese'], sortOrder: 1 });
    await push(F.console, 'DINING_TABLE', 'tbl12', { tableNumber: '12', capacity: 4, isActive: true, branchId: F.b1 });
    await push(F.console, 'DINING_TABLE', 'tbl21', { tableNumber: '21', capacity: 4, isActive: true, branchId: F.b2 });
    F.published = await publish(F.console, 'first');
    F.token1 = tokenOf((await as('post', '/api/v1/restaurant/qr/tables/tbl12/generate', F.console).send({ branchId: F.b1 })).body.url);
    F.token2 = tokenOf((await as('post', '/api/v1/restaurant/qr/tables/tbl21/generate', F.console).send({ branchId: F.b2 })).body.url);
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  describe('historical orders keep what they were ordered with', () => {
    it('an order remembers each option, its price, the base price, the tax and the menu version; changing prices later changes nothing', async () => {
      const placed = await http().post(`/api/v1/public/qr/${F.token1}/orders`).send(order([{ itemId: 'marg', quantity: 2, optionIds: ['extra'] }]));
      expect(placed.status, JSON.stringify(placed.body)).toBe(201);
      expect(placed.body.total).toBe(606.9); // (249 + 40) × 2 = 578; 5% = 28.90

      // The restaurant raises the pizza to ₹279 and the cheese to ₹50, and republishes.
      await push(F.console, 'MENU_ITEM', 'marg', { categoryId: 'pizza', name: 'Margherita Pizza', price: 279, isAvailable: true, taxGroupId: 'tax5', modifierGroupIds: ['cheese'], sortOrder: 1 });
      await push(F.console, 'MODIFIER_GROUP', 'cheese', { name: 'Cheese', isRequired: true, minSelections: 1, maxSelections: 1, sortOrder: 1, options: [{ id: 'reg', groupId: 'cheese', name: 'Regular Cheese', priceDelta: 0, isAvailable: true, sortOrder: 1 }, { id: 'extra', groupId: 'cheese', name: 'Extra Cheese', priceDelta: 50, isAvailable: true, sortOrder: 2 }] });
      expect((await publish(F.console, 'price rise')).status).toBe(201);

      const pull = await as('get', '/api/v1/orders/sync?afterSeq=0', F.pos1);
      const o = pull.body.orders.find((x: any) => x.publicOrderId === placed.body.publicOrderId);
      const line = o.items[0];
      expect(line.unitPrice).toBe(28900);
      expect(line.modifierDetails).toEqual([{ optionName: 'Extra Cheese', priceDelta: 4000, optionId: 'extra', groupId: 'cheese', groupName: 'Cheese' }]);
      expect(line.snapshot).toMatchObject({ basePrice: 24900, taxGroupId: 'tax5', taxRateBp: 500, taxInclusive: false, lineTax: 2890 });
      expect(typeof line.snapshot.menuVersion).toBe('number');
      expect(o.menuVersion).toBe(line.snapshot.menuVersion);

      // A new order uses the new prices.
      const later = await http().post(`/api/v1/public/qr/${F.token1}/orders`).send(order([{ itemId: 'marg', quantity: 1, optionIds: ['extra'] }]));
      expect(later.body.total).toBe(345.45); // (279 + 50) × 1.05
    });

    it('a later device update (kitchen status, acceptance) cannot erase the snapshot', async () => {
      const placed = await http().post(`/api/v1/public/qr/${F.token1}/orders`).send(order([{ itemId: 'marg', quantity: 1, optionIds: ['reg'] }]));
      const pull = await as('get', '/api/v1/orders/sync?afterSeq=0', F.pos1);
      const o = pull.body.orders.find((x: any) => x.publicOrderId === placed.body.publicOrderId);
      // An older device that knows nothing about snapshots pushes the order back with plain lines.
      const plainItems = o.items.map((i: any) => ({ externalItemId: i.externalItemId, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, modifiers: i.modifiers, lineTotal: i.lineTotal, kitchenStatus: 'PREPARING' }));
      const r = await as('post', '/api/v1/orders/sync', F.pos1).send({ events: [{ externalOrderId: o.externalOrderId, orderType: 'DINE_IN', status: 'PREPARING', items: plainItems, subtotal: o.subtotal, taxAmount: o.taxAmount, totalAmount: o.totalAmount, meta: { acceptedBy: 'old-pos' }, updatedAt: now() }] });
      expect(r.status).toBe(201);
      const after = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.pos1)).body.orders.find((x: any) => x.publicOrderId === placed.body.publicOrderId);
      expect(after.items[0].snapshot).toMatchObject({ basePrice: expect.any(Number), taxRateBp: 500 });
      expect(after.items[0].modifierDetails[0]).toMatchObject({ optionName: 'Regular Cheese', priceDelta: 0, groupName: 'Cheese' });
    });
  });

  describe('publishing controls what guests see', () => {
    it('a draft edit is invisible to guests and reported as unpublished; publishing shows it', async () => {
      const menu0 = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body;
      await push(F.console, 'MENU_ITEM', 'draft-dish', { categoryId: 'pizza', name: 'Draft Dish', price: 99, isAvailable: true, sortOrder: 5 });
      expect((await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body.items.map((i: any) => i.name)).not.toContain('Draft Dish');
      const status = await as('get', '/api/v1/menu/draft-status', F.console);
      expect(status.body).toMatchObject({ hasUnpublishedChanges: true, publishedVersion: menu0.menuVersion });
      await publish(F.console, 'add dish');
      const menu1 = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body;
      expect(menu1.items.map((i: any) => i.name)).toContain('Draft Dish');
      expect(menu1.menuVersion).toBe(menu0.menuVersion + 1);
      expect((await as('get', '/api/v1/menu/draft-status', F.console)).body.hasUnpublishedChanges).toBe(false);
    });

    it('a menu with a blocking problem cannot be published, and the last good menu stays live', async () => {
      const before = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body.menuVersion;
      await push(F.console, 'MENU_ITEM', 'bad-price', { categoryId: 'pizza', name: 'Bad Price', price: -5, isAvailable: true });
      const res = await publish(F.console, 'should fail');
      expect(res.status).toBe(422);
      expect(res.body.errors.join(' ')).toContain('Bad Price');
      expect((await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body.menuVersion).toBe(before);
      await push(F.console, 'MENU_ITEM', 'bad-price', { categoryId: 'pizza', name: 'Bad Price', price: 5, isAvailable: true, deleted: true });
      expect((await publish(F.console, 'fixed')).status).toBe(201);
    });

    it('dishes come in the restaurant own order, not database order', async () => {
      await push(F.console, 'MENU_ITEM', 'z-first', { categoryId: 'pizza', name: 'Zzz First', price: 10, isAvailable: true, sortOrder: -1 });
      await push(F.console, 'MENU_ITEM', 'a-last', { categoryId: 'pizza', name: 'Aaa Last', price: 10, isAvailable: true, sortOrder: 99 });
      await publish(F.console, 'order');
      const names = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body.items.map((i: any) => i.name);
      expect(names[0]).toBe('Zzz First');
      expect(names[names.length - 1]).toBe('Aaa Last');
    });

    it('only Restaurant Admin sees draft status, and quantity limits set by the restaurant are enforced', async () => {
      expect((await as('get', '/api/v1/menu/draft-status', F.pos1)).status).toBe(403);
      await push(F.console, 'MENU_ITEM', 'thali', { categoryId: 'pizza', name: 'Party Thali', price: 100, isAvailable: true, sortOrder: 7, minQuantity: 2, maxQuantity: 4 });
      await publish(F.console, 'thali');
      const post = (quantity: number) => http().post(`/api/v1/public/qr/${F.token1}/orders`).send(order([{ itemId: 'thali', quantity }]));
      expect((await post(1)).status).toBe(400);
      expect((await post(5)).status).toBe(400);
      expect((await post(2)).status).toBe(201);
    });

    it('an order placed against an older menu is refused with MENU_CHANGED only when the price would differ', async () => {
      const seen = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body.menuVersion as number;
      // A change that does not touch the pizza: the guest's total is unchanged, the order goes through.
      await push(F.console, 'MENU_ITEM', 'side', { categoryId: 'pizza', name: 'Side Salad', price: 60, isAvailable: true, sortOrder: 8 });
      await publish(F.console, 'unrelated');
      const ok = await http().post(`/api/v1/public/qr/${F.token1}/orders`).send(order([{ itemId: 'thali', quantity: 2 }], { menuVersion: seen }));
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      // A price change on what they ordered: they must confirm.
      await push(F.console, 'MENU_ITEM', 'thali', { categoryId: 'pizza', name: 'Party Thali', price: 120, isAvailable: true, sortOrder: 7, minQuantity: 2, maxQuantity: 4 });
      await publish(F.console, 'thali price');
      const refused = await http().post(`/api/v1/public/qr/${F.token1}/orders`).send(order([{ itemId: 'thali', quantity: 2 }], { menuVersion: seen }));
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'MENU_CHANGED' });
      const latest = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body.menuVersion;
      expect(refused.body.menuVersion).toBe(latest);
      expect((await http().post(`/api/v1/public/qr/${F.token1}/orders`).send(order([{ itemId: 'thali', quantity: 2 }], { menuVersion: latest }))).status).toBe(201);
    });
  });

  describe('a branch can have its own price and availability', () => {
    it('a branch override changes that branch only, after publish, and orders are priced with it', async () => {
      const put = (body: Record<string, unknown>) => as('put', '/api/v1/menu/branch-overrides', F.console).send(body);
      const price = (t: string) => http().get(`/api/v1/public/qr/${t}/menu`).then((r) => r.body.items.find((i: any) => i.id === 'side')?.price);
      const b1Before = await price(F.token1);
      expect((await put({ branchId: F.b2, itemId: 'side', price: 75 })).status).toBe(200);
      expect(await price(F.token2)).toBe(60); // a draft: not visible yet
      await publish(F.console, 'branch price');
      expect(await price(F.token2)).toBe(75);
      expect(await price(F.token1)).toBe(b1Before);
      const placed = await http().post(`/api/v1/public/qr/${F.token2}/orders`).send(order([{ itemId: 'side', quantity: 1 }]));
      expect(placed.status, JSON.stringify(placed.body)).toBe(201);
      expect(placed.body.total).toBe(75); // no tax group on this dish
      // Unavailable in one branch only.
      await put({ branchId: F.b2, itemId: 'side', isAvailable: false });
      await publish(F.console, 'hide');
      expect(await price(F.token2)).toBeUndefined();
      expect(await price(F.token1)).toBe(b1Before);
      // Clearing the override brings the normal dish back.
      await put({ branchId: F.b2, itemId: 'side', price: null, isAvailable: null });
      await publish(F.console, 'clear');
      expect(await price(F.token2)).toBe(60);
    });

    it('only the console may set overrides, and only for its own branches and dishes', async () => {
      expect((await as('put', '/api/v1/menu/branch-overrides', F.pos1).send({ branchId: F.b1, itemId: 'side', price: 1 })).status).toBe(403);
      expect((await as('put', '/api/v1/menu/branch-overrides', F.console).send({ branchId: '00000000-0000-4000-8000-000000000000', itemId: 'side', price: 1 })).status).toBe(404);
      expect((await as('put', '/api/v1/menu/branch-overrides', F.console).send({ branchId: F.b1, itemId: 'nope', price: 1 })).status).toBe(400);
      expect((await as('put', '/api/v1/menu/branch-overrides', F.console).send({ branchId: F.b1, itemId: 'side', price: -1 })).status).toBe(400);
    });
  });

  describe('pictures', () => {
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    it('a picture typed into the menu is stored once, referenced by its hash, and served cacheable; the menu itself stays small', async () => {
      await push(F.console, 'MENU_ITEM', 'pic', { categoryId: 'pizza', name: 'Picture Dish', price: 50, isAvailable: true, sortOrder: 20, imageUrl: `data:image/png;base64,${PNG}` });
      const res = await publish(F.console, 'picture');
      expect(res.status).toBe(201);
      const menu = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body;
      const dish = menu.items.find((i: any) => i.id === 'pic');
      expect(dish.imageUrl).toMatch(/^\/api\/v1\/public\/qr\/images\/[a-f0-9]{64}$/);
      expect(JSON.stringify(menu)).not.toContain('data:image');
      const img = await http().get(dish.imageUrl);
      expect(img.status).toBe(200);
      expect(img.headers['content-type']).toContain('image/png');
      expect(img.headers['cache-control']).toContain('immutable');
      expect(Buffer.from(img.body).equals(Buffer.from(PNG, 'base64'))).toBe(true);
    });

    it('pictures that are not real, small raster images are refused with a warning instead of being served', async () => {
      const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
      const fake = 'data:image/png;base64,' + Buffer.from('this is not a png at all, just text').toString('base64');
      await push(F.console, 'MENU_ITEM', 'pic-svg', { categoryId: 'pizza', name: 'Svg Dish', price: 50, isAvailable: true, sortOrder: 21, imageUrl: svg });
      await push(F.console, 'MENU_ITEM', 'pic-fake', { categoryId: 'pizza', name: 'Fake Dish', price: 50, isAvailable: true, sortOrder: 22, imageUrl: fake });
      const res = await publish(F.console, 'bad pictures');
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.warnings.join(' ')).toContain('Svg Dish');
      expect(res.body.warnings.join(' ')).toContain('Fake Dish');
      const menu = (await http().get(`/api/v1/public/qr/${F.token1}/menu`)).body;
      for (const id of ['pic-svg', 'pic-fake']) {
        const d = menu.items.find((i: any) => i.id === id);
        expect(d, id).toBeTruthy(); // the dish is still on the menu
        expect(d.imageUrl).toBeUndefined();
      }
      expect((await http().get('/api/v1/public/qr/images/' + 'a'.repeat(64))).status).toBe(404);
      expect((await http().get('/api/v1/public/qr/images/not-a-hash')).status).toBe(404);
    });
  });

  describe('snapshot building (pure)', () => {
    it('an oversized picture is dropped with a warning, and identical drafts have identical checksums', () => {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      const huge = 'data:image/png;base64,' + Buffer.concat([png, Buffer.alloc(MAX_MENU_IMAGE_BYTES)]).toString('base64');
      const rows = [
        { entityType: 'MENU_CATEGORY', payload: { id: 'c', name: 'C', isActive: true } },
        { entityType: 'MENU_ITEM', payload: { id: 'i', categoryId: 'c', name: 'Big', price: 10, isAvailable: true, imageUrl: huge } }
      ];
      const a = buildContent(rows);
      const b = buildContent([...rows].reverse());
      expect(a.checksum).toBe(b.checksum);
      const moved = extractImages(a.content);
      expect(moved.images).toHaveLength(0);
      expect(moved.warnings.join(' ')).toContain('larger than 1 MB');
      expect(moved.content.items[0].imageUrl).toBeUndefined();
    });
  });

  describe('preview before publishing', () => {
    it('shows what a branch guest would see from the draft, says why other dishes are hidden, and changes nothing', async () => {
      await push(F.console, 'MENU_ITEM', 'hidden-qr', { categoryId: 'pizza', name: 'Counter Only', price: 30, isAvailable: true, salesChannels: ['POS'], sortOrder: 30 });
      await push(F.console, 'MENU_ITEM', 'sold-out', { categoryId: 'pizza', name: 'Sold Out', price: 30, isAvailable: false, sortOrder: 31 });
      await push(F.console, 'MENU_ITEM', 'b1-only', { categoryId: 'pizza', name: 'Branch One Only', price: 30, isAvailable: true, branchIds: [F.b1], sortOrder: 32 });
      const before = (await http().get(`/api/v1/public/qr/${F.token2}/menu`)).body.menuVersion;
      const pv = await as('get', `/api/v1/menu/preview?branchId=${F.b2}`, F.console);
      expect(pv.status).toBe(200);
      const hidden = Object.fromEntries(pv.body.hidden.map((h: any) => [h.name, h.reason]));
      expect(hidden['Counter Only']).toBe('Not sold through QR ordering');
      expect(hidden['Sold Out']).toBe('Marked unavailable');
      expect(hidden['Branch One Only']).toBe('Not sold in this branch');
      const pvB1 = await as('get', `/api/v1/menu/preview?branchId=${F.b1}`, F.console);
      expect(pvB1.body.items.map((i: any) => i.name)).toContain('Branch One Only');
      expect((await http().get(`/api/v1/public/qr/${F.token2}/menu`)).body.menuVersion).toBe(before); // nothing was published
      expect((await as('get', `/api/v1/menu/preview?branchId=${F.b1}`, F.pos1)).status).toBe(403);
    });
  });

  describe('open orders at one table', () => {
    it('the console sees the open orders of one table', async () => {
      const a = await http().post(`/api/v1/public/qr/${F.token2}/orders`).send(order([{ itemId: 'side', quantity: 1 }]));
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      const res = await as('get', '/api/v1/restaurant/qr/tables/tbl21/orders', F.console);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((o: any) => o.source === 'QR' && ['NEW', 'PREPARING'].includes(o.status))).toBe(true);
      const other = await as('get', '/api/v1/restaurant/qr/tables/tbl12/orders', F.console);
      expect(other.body.some((o: any) => o.orderNumber === a.body.orderNumber && o.total === a.body.total && res.body.every((r: any) => r.orderNumber !== o.orderNumber))).toBe(false);
      expect((await as('get', '/api/v1/restaurant/qr/tables/tbl21/orders', F.pos1)).status).toBe(403);
    });
  });
});

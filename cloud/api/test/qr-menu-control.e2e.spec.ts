import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';

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
});

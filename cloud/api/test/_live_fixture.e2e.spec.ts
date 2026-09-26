import request from 'supertest';
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';

/**
 * NOT part of the suite (excluded by its name in normal runs via LIVE_FIXTURE). Starts a real HTTP API on :4000 with a
 * QR-enabled restaurant so a real browser can drive the customer page. Writes the QR URL and a POS token to a file.
 */
it.skipIf(!process.env.LIVE_FIXTURE)('live fixture', async () => {
  const app = await createTestApp();
  const prisma = app.get(PrismaService);
  app.get(QrRateLimiter).configure({ ipRequestsPerMinute: 100000 });
  const stamp = Date.now();
  const email = `live-${stamp}@example.com`;
  await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple' });
  const tok = (await platformLogin(app, email, 'correct-horse-battery-staple')).body.accessToken;
  const P = (m: 'get' | 'post', u: string) => request(app.getHttpServer())[m](u).set('Authorization', `Bearer ${tok}`);
  const plan = await P('post', '/api/v1/plans').send({ tier: 'QR', name: `Live QR plan ${stamp}`, priceMonthly: 900000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, qrTableOrdering: true } });
  const rest = await P('post', '/api/v1/restaurants').send({ name: `Spice Route ${stamp}`, ownerName: 'Owner', ownerEmail: `live-owner-${stamp}@test.example.com`, mobile: `9${String(stamp).slice(-9)}` });
  const rid = rest.body.restaurant.id;
  const ownerEmail = `live-owner-${stamp}@test.example.com`;
  await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId: rid, email: ownerEmail, activationToken: rest.body.activationToken, newPassword: 'live-owner-password-123' });
  await P('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
  const branch = (await P('post', '/api/v1/branches').send({ restaurantId: rid, name: 'Ahmedabad Main', code: 'AMD' })).body.id;
  const act = async (type: string, branchId?: string) => {
    const key = await P('post', '/api/v1/activation-keys').send({ restaurantId: rid, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    return (await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type })).body.deviceToken as string;
  };
  const admin = await act('POS_ADMIN');
  const spareKey = (await P('post', '/api/v1/activation-keys').send({ restaurantId: rid, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() })).body.code;
  const pos = await act('POS', branch);
  const push = (type: string, id: string, payload: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/v1/entity-sync/${type}`).set('Authorization', `Bearer ${admin}`).send({ events: [{ externalId: id, payload: { id, ...payload, updatedAt: new Date().toISOString() } }] });
  await push('TAX_GROUP', 'tax5', { name: 'GST 5%', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: false, isActive: true });
  await push('MODIFIER_GROUP', 'size', { name: 'Size', isRequired: true, minSelections: 1, maxSelections: 1, sortOrder: 1, options: [{ id: 'sm', groupId: 'size', name: 'Regular', priceDelta: 0, isAvailable: true, sortOrder: 1 }, { id: 'lg', groupId: 'size', name: 'Large', priceDelta: 60, isAvailable: true, sortOrder: 2 }] });
  await push('MODIFIER_GROUP', 'extras', { name: 'Extras', isRequired: false, minSelections: 0, maxSelections: 2, sortOrder: 2, options: [{ id: 'cheese', groupId: 'extras', name: 'Extra cheese', priceDelta: 35, isAvailable: true, sortOrder: 1 }] });
  await push('MENU_CATEGORY', 'pizza', { name: 'Pizza', isActive: true, sortOrder: 1 });
  await push('MENU_CATEGORY', 'drinks', { name: 'Beverages', isActive: true, sortOrder: 2 });
  await push('MENU_ITEM', 'pp', { categoryId: 'pizza', name: 'Paneer Pizza', description: 'Tandoori paneer, capsicum, mozzarella', price: 249, isAvailable: true, taxGroupId: 'tax5', modifierGroupIds: ['size', 'extras'], kitchenStation: 'Main Kitchen' });
  await push('MENU_ITEM', 'cc', { categoryId: 'drinks', name: 'Cold Coffee', price: 120, isAvailable: true, taxGroupId: 'tax5', modifierGroupIds: [], kitchenStation: 'Bar' });
  await push('DINING_TABLE', 'tbl12', { tableNumber: '12', capacity: 4, isActive: true, branchId: branch });
  const made = await request(app.getHttpServer()).post('/api/v1/restaurant/qr/tables/tbl12/generate').set('Authorization', `Bearer ${admin}`).send({ branchId: branch });
  writeFileSync(process.env.LIVE_FIXTURE as string, JSON.stringify({ url: made.body.url, admin, pos, restaurantId: rid, ownerEmail, ownerPassword: 'live-owner-password-123', restaurantCode: rest.body.restaurant.restaurantCode, spareKey }));
  // Data is left in place for the real server started separately; remove it with LIVE_CLEANUP.
  writeFileSync(`${process.env.LIVE_FIXTURE}.cleanup`, JSON.stringify({ rid, plan: plan.body.id, email }));
  await app.close();
}, 30 * 60 * 1000);

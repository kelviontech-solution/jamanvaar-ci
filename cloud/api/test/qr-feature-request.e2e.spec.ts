import request from 'supertest';
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * QR Admin's "Request this feature" button (next to every "not licensed" message) needs somewhere
 * real to land. Rather than invent a parallel admin screen, it raises an ordinary FEATURE_REQUEST
 * support ticket -- the same inbox and notification path Super Admin already has for every other
 * ticket, so "wiring it into Super Admin" is this ticket showing up there, not a new page.
 */
describe('POST /api/v1/restaurant/qr/feature-request', () => {
  let app: any;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `qr-feature-request-${stamp}@test.example.com`;
  let platform: string;
  let restaurantId: string;
  let deviceToken: string;
  const http = () => request(app.getHttpServer());
  const auth = (method: 'get' | 'post', url: string, token = platform) => http()[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple' });
    platform = (await platformLogin(app, email, 'correct-horse-battery-staple')).body.accessToken;
    const plan = await auth('post', '/api/v1/plans').send({
      tier: 'QR', name: `TEST QR feature request ${stamp}`, priceMonthly: 10000,
      maxBranches: 3, maxDevices: 10, maxUsers: 10,
      entitlements: { restaurantAdmin: true, qrTableOrdering: true }
    });
    const planId = plan.body.id;
    restaurantId = (await auth('post', '/api/v1/restaurants').send({
      name: `TEST QR feature request ${stamp}`, ownerName: 'Owner', ownerEmail: email, ownerPassword: 'Owner-test-password-123!'
    })).body.restaurant.id;
    await auth('post', '/api/v1/subscriptions').send({
      restaurantId, planId, applications: ['POS_ADMIN', 'QR_ORDERING'], status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const branch = await prisma.runAsTenant(restaurantId, async (tx) => (await tx.branch.findFirstOrThrow({ where: { restaurantId } })).id);
    const key = await auth('post', '/api/v1/activation-keys').send({
      restaurantId, branchId: branch, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemed = await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
    deviceToken = redeemed.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  it('creates a FEATURE_REQUEST support ticket visible to Super Admin, attributed to the restaurant\'s owner', async () => {
    const res = await http()
      .post('/api/v1/restaurant/qr/feature-request')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ featureCode: 'QR_SERVICE_REQUESTS', featureLabel: 'Service requests', note: 'Guests keep asking for water at the counter.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.ticketNumber).toBeTypeOf('number');

    const ticket = await prisma.runAsPlatform((tx) => tx.supportTicket.findUniqueOrThrow({ where: { id: res.body.ticketId } }));
    expect(ticket.restaurantId).toBe(restaurantId);
    expect(ticket.category).toBe('FEATURE_REQUEST');
    expect(ticket.source).toBe('RESTAURANT');
    expect(ticket.status).toBe('OPEN');
    expect(ticket.subject).toContain('Service requests');
    expect(ticket.description).toContain('QR_SERVICE_REQUESTS');
    expect(ticket.description).toContain('Guests keep asking for water');
    expect(ticket.raisedByName).toBeTruthy();

    // Visible through the exact endpoint Super Admin's own ticket list already uses -- no new admin screen needed.
    const listed = await auth('get', '/api/v1/support-tickets').send();
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const items = Array.isArray(listed.body) ? listed.body : listed.body.items;
    expect(items.some((t: any) => t.id === res.body.ticketId)).toBe(true);
  });

  it('rejects a request with no feature label', async () => {
    const res = await http()
      .post('/api/v1/restaurant/qr/feature-request')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({ featureCode: 'QR_LOYALTY', featureLabel: '' });
    expect(res.status).toBe(400);
  });
});

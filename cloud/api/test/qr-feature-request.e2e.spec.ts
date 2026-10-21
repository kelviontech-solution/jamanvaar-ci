import request from 'supertest';
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin, ownerDeviceSession } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApplicationEntitlementsService } from '../src/modules/application-entitlements/application-entitlements.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QR Admin's "Request this feature" button (next to every "not licensed" message) needs somewhere
 * real to land. Rather than invent a parallel admin screen, it raises an ordinary FEATURE_REQUEST
 * support ticket -- the same inbox and notification path Super Admin already has for every other
 * ticket, so "wiring it into Super Admin" is this ticket showing up there, not a new page.
 */
describe('POST /api/v1/restaurant/qr/feature-request', () => {
  let app: any;
  let prisma: PrismaService;
  let entitlements: ApplicationEntitlementsService;
  const stamp = Date.now();
  const email = `qr-feature-request-${stamp}@test.example.com`;
  let platform: string;
  let restaurantId: string;
  let deviceToken: string;
  let planId: string, branchId: string, supportToken: string, ownerToken: string, platformId: string;
  const http = () => request(app.getHttpServer());
  const auth = (method: 'get' | 'post', url: string, token = platform) => http()[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    entitlements = app.get(ApplicationEntitlementsService);
    platformId = (await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple' })).id;
    platform = (await platformLogin(app, email, 'correct-horse-battery-staple')).body.accessToken;
    await createTestPlatformUser(prisma, { email: `support-${email}`, password: 'correct-horse-battery-staple', role: 'SUPPORT_ADMIN' });
    supportToken = (await platformLogin(app, `support-${email}`, 'correct-horse-battery-staple')).body.accessToken;
    const plan = await auth('post', '/api/v1/plans').send({
      tier: 'QR', name: `TEST QR feature request ${stamp}`, priceMonthly: 10000,
      maxBranches: 3, maxDevices: 10, maxUsers: 10,
      entitlements: { restaurantAdmin: true, qrTableOrdering: true }
    });
    planId = plan.body.id;
    restaurantId = (await auth('post', '/api/v1/restaurants').send({
      name: `TEST QR feature request ${stamp}`, ownerName: 'Owner', ownerEmail: email, ownerPassword: 'Owner-test-password-123!'
    })).body.restaurant.id;
    await auth('post', '/api/v1/subscriptions').send({
      restaurantId, planId, applications: ['POS_ADMIN', 'QR_ORDERING'], status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const branch = await prisma.runAsTenant(restaurantId, async (tx) => (await tx.branch.findFirstOrThrow({ where: { restaurantId } })).id);
    branchId = branch;
    const key = await auth('post', '/api/v1/activation-keys').send({
      restaurantId, branchId: branch, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemed = await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
    deviceToken = redeemed.body.deviceToken;
    ownerToken = await ownerDeviceSession(prisma, deviceToken);
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform(tx => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: { in: [email, `support-${email}`] } } });
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

  const requestFeature = async (featureCode: string) => {
    const response = await http().post('/api/v1/restaurant/qr/feature-request').set('Authorization', `Bearer ${deviceToken}`).send({ featureCode, featureLabel: 'Requested feature' });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.ticketId as string;
  };
  const preview = async (id: string) => { const result = await auth('get', `/api/v1/support-tickets/${id}/qr-feature`); result.body = result.body.request; return result; };
  const grant = (id: string, code: string, token = platform) => auth('post', `/api/v1/support-tickets/${id}/qr-feature`, token).send({ featureCode: code });

  it('grants the exact requested pickup feature with permissions, one audit trail and actual backend access, without changing the shared plan', async () => {
    const id = await requestFeature('QR_SCHEDULED_PICKUP');
    const before = await preview(id);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ featureCode: 'QR_SCHEDULED_PICKUP', enabled: false, canGrant: true, branchId });
    const endpoint = '/api/v1/restaurant/qr/workflows/pickup-calendar';
    expect((await auth('get', endpoint, deviceToken).set('x-owner-authorization', ownerToken)).status).toBe(403);
    expect((await grant(id, 'QR_SCHEDULED_PICKUP', supportToken)).status).toBe(403);
    expect((await grant(id, 'QR_LOYALTY')).status).toBe(400);
    const responses = await Promise.all([grant(id, 'QR_SCHEDULED_PICKUP'), grant(id, 'QR_SCHEDULED_PICKUP')]);
    for (const response of responses) expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(responses.filter(r => r.body.alreadyEnabled === false)).toHaveLength(1);
    expect((await preview(id)).body).toMatchObject({ enabled: true, canGrant: false });
    const resolved = await prisma.runAsPlatform(tx => entitlements.resolveQrCapability(tx, restaurantId, 'QR_SCHEDULED_PICKUP', branchId));
    expect(resolved.enabled).toBe(true);
    const endpointResult = await auth('get', endpoint, deviceToken).set('x-owner-authorization', ownerToken);
    expect(endpointResult.status, JSON.stringify(endpointResult.body)).toBe(200);
    const detail = (await auth('get', `/api/v1/support-tickets/${id}`)).body;
    expect(detail.status).toBe('RESOLVED');
    expect(detail.events.filter((e: any) => e.type === 'QR_FEATURE_GRANTED')).toHaveLength(1);
    expect(detail.comments.some((c: any) => c.body.includes('access has been enabled'))).toBe(true);
    const plan = await prisma.runAsPlatform(tx => tx.plan.findUniqueOrThrow({ where: { id: planId } }));
    expect((plan.entitlements as any).qrScheduledPickup).not.toBe(true);
    expect((await prisma.runAsPlatform(tx => entitlements.resolveQrCapability(tx, restaurantId, 'QR_LOYALTY'))).enabled).toBe(false);
  });

  it('recognizes older tickets by their trusted audit code, never editable request text', async () => {
    const id = await requestFeature('QR_SERVICE_REQUESTS');
    await prisma.runAsPlatform(tx => tx.ticketEvent.deleteMany({ where: { ticketId: id, type: 'QR_FEATURE_REQUESTED' } }));
    expect((await preview(id)).body.featureCode).toBe('QR_SERVICE_REQUESTS');
    expect((await grant(id, 'QR_SERVICE_REQUESTS')).status).toBe(201);
    const fake = await auth('post', '/api/v1/support-tickets').send({ restaurantId, subject: 'Enable feature', description: 'Requested from QR Admin: please enable "Loyalty" (QR_LOYALTY) for this restaurant.', category: 'FEATURE_REQUEST' });
    expect(fake.status).toBe(201);
    // Even if a ticket has the right prose, only server-recorded feature metadata can authorize the action.
    await prisma.runAsPlatform(tx => tx.supportTicket.update({ where: { id: fake.body.id }, data: { source: 'RESTAURANT' } }));
    expect((await preview(fake.body.id)).body).toBeNull();
    expect((await grant(fake.body.id, 'QR_LOYALTY')).status).toBe(400);
  });

  it('grants Reservations from its ticket and unlocks the real inbox without also granting the page builder', async () => {
    const id = await requestFeature('QR_RESERVATIONS');
    const endpoint = '/api/v1/restaurant/qr/reservations';
    expect((await auth('get', endpoint, deviceToken)).status).toBe(403);
    expect((await preview(id)).body).toMatchObject({ featureCode: 'QR_RESERVATIONS', enabled: false, canGrant: true });
    expect((await grant(id, 'QR_RESERVATIONS', supportToken)).status).toBe(403);
    const result = await grant(id, 'QR_RESERVATIONS');
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body).toMatchObject({ featureCode: 'QR_RESERVATIONS', enabled: true });
    const inbox = await auth('get', endpoint, deviceToken);
    expect(inbox.status, JSON.stringify(inbox.body)).toBe(200);
    expect(inbox.body).toEqual([]);
    expect((await prisma.runAsPlatform(tx => entitlements.resolveQrCapability(tx, restaurantId, 'QR_RESTAURANT_PAGE', branchId))).enabled).toBe(false);
    expect((await auth('get', `/api/v1/support-tickets/${id}`)).body.status).toBe('RESOLVED');
  });

  it('registers a missing Reservations catalog entry idempotently and preserves existing platform restrictions', async () => {
    const original = await prisma.runAsPlatform(tx => tx.feature.findUnique({ where: { code: 'QR_RESERVATIONS' } }));
    const sql = readFileSync(join(__dirname, '../prisma/migrations/20261021090000_qr_reservations_catalog_registration/migration.sql'), 'utf8');
    await expect(prisma.runAsPlatform(async tx => {
      // Changes to the shared test catalog remain uncommitted and are rolled back at the end.
      await tx.feature.deleteMany({ where: { code: 'QR_RESERVATIONS' } });
      const migrate = async () => { for (const statement of sql.split(';').filter(s => s.trim())) await tx.$executeRawUnsafe(statement); };
      await migrate(); await migrate();
      expect(await tx.feature.count({ where: { code: 'QR_RESERVATIONS' } })).toBe(1);
      expect(await tx.feature.findUnique({ where: { code: 'QR_RESERVATIONS' } })).toMatchObject({ legacyEntitlementKey: 'qrReservations', isActive: true });
      await tx.feature.update({ where: { code: 'QR_RESERVATIONS' }, data: { isActive: false, rolloutPercent: 0 } });
      await migrate();
      expect(await tx.feature.findUnique({ where: { code: 'QR_RESERVATIONS' } })).toMatchObject({ isActive: false, rolloutPercent: 0 });
      throw new Error('ROLLBACK_CATALOG_TEST');
    })).rejects.toThrow('ROLLBACK_CATALOG_TEST');
    expect(await prisma.runAsPlatform(tx => tx.feature.findUnique({ where: { code: 'QR_RESERVATIONS' } }))).toEqual(original);
  });

  it('preserves branch restrictions, blocks closed requests, and rejects unknown features', async () => {
    const unknown = await http().post('/api/v1/restaurant/qr/feature-request').set('Authorization', `Bearer ${deviceToken}`).send({ featureCode: 'ALL_PRODUCTS', featureLabel: 'All products' });
    expect(unknown.status).toBe(400);
    const id = await requestFeature('QR_FEEDBACK');
    await prisma.runAsPlatform(tx => tx.supportTicket.update({ where: { id }, data: { status: 'CLOSED' } }));
    expect((await preview(id)).body.blockedReason).toContain('Reopen');
    expect((await grant(id, 'QR_FEEDBACK')).status).toBe(409);
    await prisma.runAsPlatform(async tx => {
      await tx.supportTicket.update({ where: { id }, data: { status: 'OPEN' } });
      await tx.branchProductLicense.create({ data: { restaurantId, branchId, appCode: 'QR_ORDERING', revision: 1, enabled: true, disabledFeatures: ['qrFeedback'], effectiveAt: new Date(Date.now() - 1000), createdBy: platformId } });
    });
    const result = (await preview(id)).body;
    expect(result.canGrant).toBe(false);
    expect(result.blockedReason).toContain('requesting branch');
    expect(result.branches.find((b: any) => b.id === branchId).restricted).toBe(true);
    expect((await grant(id, 'QR_FEEDBACK')).status).toBe(409);
    expect((await prisma.runAsPlatform(tx => entitlements.resolveQrCapability(tx, restaurantId, 'QR_FEEDBACK', branchId))).enabled).toBe(false);
  });

  it('cannot grant QR add-ons to an inactive subscription or through a tenant session', async () => {
    const id = await requestFeature('QR_LOYALTY');
    expect((await grant(id, 'QR_LOYALTY', deviceToken)).status).toBe(401);
    await prisma.runAsPlatform(tx => tx.subscription.updateMany({ where: { restaurantId }, data: { status: 'SUSPENDED' } }));
    const check = (await preview(id)).body;
    expect(check.canGrant).toBe(false);
    expect(check.blockedReason).toContain('QR Ordering must be active');
    expect((await grant(id, 'QR_LOYALTY')).status).toBe(409);
  });
});

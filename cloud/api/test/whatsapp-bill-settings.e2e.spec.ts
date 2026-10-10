import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi, type MockInstance } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Restaurant admin picks the WhatsApp number bills are sent FROM (Receipts tab). The WhatsApp
 * service (faked here via global fetch) decides whether that number is a real sender.
 */
describe('WhatsApp number for bills (tenant settings)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-wa-bill-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const secret = 'dev-only-jamanvaar-whatsapp-shared-secret-change-in-prod';
  let platformToken: string;
  const tenants: { id: string; email: string; token: string }[] = [];
  let fetchSpy: MockInstance<typeof fetch>;

  const http = () => request(app.getHttpServer());
  const as = (i: number, method: 'get' | 'put' | 'post' | 'delete', url: string) =>
    http()[method](url).set('Authorization', `Bearer ${tenants[i].token}`);

  async function makeTenant(label: string) {
    const ownerEmail = `test-wa-bill-${label}-${stamp}@example.com`;
    const res = await http().post('/api/v1/restaurants').set('Authorization', `Bearer ${platformToken}`).send({ name: `TEST WA Bill ${label} ${stamp}`, ownerName: 'Owner', ownerEmail });
    const id = res.body.restaurant.id;
    await http().post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId: id, email: ownerEmail, activationToken: res.body.activationToken, newPassword: 'owner-correct-horse-battery' });
    const login = await http().post('/api/v1/tenant-auth/login').send({ restaurantId: id, email: ownerEmail, password: 'owner-correct-horse-battery' });
    tenants.push({ id, email: ownerEmail, token: login.body.accessToken });
  }

  const serviceSays = (body: Record<string, unknown>) =>
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

  beforeAll(async () => {
    process.env.WHATSAPP_CONNECTOR_BASE_URL = 'http://wa.test';
    process.env.JAMANVAAR_SERVICE_SECRET = secret;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    await makeTenant('a');
    await makeTenant('b');
  }, 90_000);

  beforeEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    serviceSays({ ok: true, status: 'READY', displayNumber: '+91 94285 21735', verifiedName: 'Jamanvaar', quality: 'GREEN', templateStatus: 'APPROVED' });
  });

  afterAll(async () => {
    fetchSpy?.mockRestore();
    for (const t of tenants) {
      await prisma.runAsPlatform((tx) => tx.syncedEntity.deleteMany({ where: { restaurantId: t.id, entityType: 'WHATSAPP_BILL_SETTINGS' } }));
      await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: t.id } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('starts empty', async () => {
    const res = await as(0, 'get', '/api/v1/tenant/whatsapp-bill');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: null, status: 'NOT_SET' });
  });

  it('refuses letters, short and non-mobile numbers without calling the WhatsApp service', async () => {
    for (const number of ['kje5465', '12345', '5876543210', '98765abcde', '']) {
      expect((await as(0, 'put', '/api/v1/tenant/whatsapp-bill').send({ number })).status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('saves a number, verifies it through the signed WhatsApp-service call, and remembers it', async () => {
    const res = await as(0, 'put', '/api/v1/tenant/whatsapp-bill').send({ number: '+91 94285-21735' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: '919428521735'.slice(2), status: 'READY', displayNumber: '+91 94285 21735', verifiedName: 'Jamanvaar', templateStatus: 'APPROVED' });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wa.test/api/v1/webhooks/jamanvaar/bill-number');
    const headers = init.headers as Record<string, string>;
    const expected = createHmac('sha256', secret)
      .update(`POST\n/api/v1/webhooks/jamanvaar/bill-number\n${headers['X-Timestamp']}\n${createHash('sha256').update(init.body as string).digest('hex')}`)
      .digest('hex');
    expect(headers['X-Signature']).toBe(expected);
    expect(JSON.parse(init.body as string)).toEqual({ restaurantId: tenants[0].id, number: '9428521735' });

    const again = await as(0, 'get', '/api/v1/tenant/whatsapp-bill');
    expect(again.body.number).toBe('9428521735');
    expect(again.body.status).toBe('READY');
  });

  it("keeps the typed number and shows WHY when it isn't on the restaurant's Meta account yet", async () => {
    serviceSays({ ok: false, status: 'NOT_FOUND', message: "That number is not on this restaurant's WhatsApp account yet." });
    const res = await as(1, 'put', '/api/v1/tenant/whatsapp-bill').send({ number: '9876543210' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: '9876543210', status: 'NOT_FOUND' });
    expect(res.body.message).toMatch(/not on this restaurant/i);
  });

  it('degrades to UNREACHABLE (not a 500) when the WhatsApp service is down, and recheck recovers', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const down = await as(0, 'put', '/api/v1/tenant/whatsapp-bill').send({ number: '9428521735' });
    expect(down.status).toBe(200);
    expect(down.body.status).toBe('UNREACHABLE');
    expect(down.body.number).toBe('9428521735');

    serviceSays({ ok: true, status: 'READY', displayNumber: '+91 94285 21735', verifiedName: 'Jamanvaar', templateStatus: 'PENDING' });
    const up = await as(0, 'post', '/api/v1/tenant/whatsapp-bill/recheck');
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ status: 'READY', templateStatus: 'PENDING' });
  });

  it('recheck without a saved number is a clear 400', async () => {
    await makeTenant('c');
    const res = await as(tenants.length - 1, 'post', '/api/v1/tenant/whatsapp-bill/recheck');
    expect(res.status).toBe(400);
  });

  it('asks the WhatsApp service to create the bill template and stores the new status', async () => {
    serviceSays({ ok: true, templateStatus: 'PENDING' });
    const res = await as(0, 'post', '/api/v1/tenant/whatsapp-bill/template');
    expect(res.status).toBe(201);
    expect(res.body.templateStatus).toBe('PENDING');
    expect(fetchSpy.mock.calls[0][0]).toBe('http://wa.test/api/v1/webhooks/jamanvaar/bill-template');
  });

  it("one restaurant never sees or changes another's number", async () => {
    await as(0, 'put', '/api/v1/tenant/whatsapp-bill').send({ number: '9428521735' });
    await as(1, 'put', '/api/v1/tenant/whatsapp-bill').send({ number: '9876543210' });
    expect((await as(0, 'get', '/api/v1/tenant/whatsapp-bill')).body.number).toBe('9428521735');
    expect((await as(1, 'get', '/api/v1/tenant/whatsapp-bill')).body.number).toBe('9876543210');
    // The body can't redirect the write to another restaurant.
    await as(0, 'put', '/api/v1/tenant/whatsapp-bill').send({ number: '9428521735', restaurantId: tenants[1].id });
    expect((await as(1, 'get', '/api/v1/tenant/whatsapp-bill')).body.number).toBe('9876543210');
  });

  it('a staff user can read but not change the sender', async () => {
    const owner = tenants[0];
    await prisma.runAsPlatform((tx) => tx.user.updateMany({ where: { restaurantId: owner.id, email: owner.email }, data: { role: 'STAFF' } }));
    try {
      expect((await as(0, 'get', '/api/v1/tenant/whatsapp-bill')).status).toBe(200);
      expect((await as(0, 'put', '/api/v1/tenant/whatsapp-bill').send({ number: '9428521735' })).status).toBe(403);
      expect((await as(0, 'delete', '/api/v1/tenant/whatsapp-bill')).status).toBe(403);
    } finally {
      await prisma.runAsPlatform((tx) => tx.user.updateMany({ where: { restaurantId: owner.id, email: owner.email }, data: { role: 'OWNER' } }));
    }
  });

  it('removing the number returns to NOT_SET', async () => {
    expect((await as(0, 'delete', '/api/v1/tenant/whatsapp-bill')).status).toBe(200);
    expect((await as(0, 'get', '/api/v1/tenant/whatsapp-bill')).body.status).toBe('NOT_SET');
  });

  it('requires a tenant login', async () => {
    expect((await http().get('/api/v1/tenant/whatsapp-bill')).status).toBe(401);
    expect((await http().put('/api/v1/tenant/whatsapp-bill').send({ number: '9428521735' })).status).toBe(401);
  });

  it('the setting is never exposed through device entity sync', async () => {
    const { SYNCABLE_ENTITY_TYPES } = await import('../src/modules/entity-sync/dto/push-entity-sync.dto');
    expect(SYNCABLE_ENTITY_TYPES as readonly string[]).not.toContain('WHATSAPP_BILL_SETTINGS');
  });
});

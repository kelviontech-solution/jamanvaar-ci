import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupportTicketsService } from '../src/modules/support-tickets/support-tickets.service';

/**
 * BUG-088: restaurants could not raise tickets, and tickets had no category, history or attachments.
 * A restaurant now raises and follows its own tickets from Restaurant Admin (restaurant, branch and
 * device filled in from the session, never another restaurant's), and the platform team triages them.
 */
describe('Restaurant-raised support tickets (BUG-088)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'correct-horse-battery-staple';
  const staffEmail = `rt-staff-${stamp}@example.com`;
  const mateEmail = `rt-mate-${stamp}@example.com`;
  const setupEmail = `rt-setup-${stamp}@example.com`;
  let setupToken: string;
  let staffToken: string;
  let mateToken: string;
  let mateId: string;
  let planId: string;

  interface Tenant { restaurantId: string; token: string; branchId: string; deviceId: string; name: string }
  const tenants: Tenant[] = [];
  let A: Tenant;
  let B: Tenant;

  const staff = (method: 'get' | 'post' | 'patch', url: string, token = staffToken) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const tenant = (t: Tenant, method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${t.token}`);

  const setup = (method: 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${setupToken}`);

  async function makeTenant(label: string): Promise<Tenant> {
    const ownerEmail = `rt-${label}-${stamp}@test.example.com`;
    const ownerPassword = 'owner-password-long-enough';
    const name = `TEST Ticket ${label} ${stamp}`;
    const rest = await setup('post', '/api/v1/restaurants').send({ name, ownerName: `${label} Owner`, ownerEmail });
    const restaurantId = rest.body.restaurant.id as string;
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId, email: ownerEmail, activationToken: rest.body.activationToken, newPassword: ownerPassword });
    await setup('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const key = await setup('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
    const session = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({ email: ownerEmail, password: ownerPassword, restaurantId, deviceId: redeem.body.device.id, deviceToken: redeem.body.deviceToken, deviceType: 'POS_ADMIN' });
    const branch = await prisma.runAsPlatform((tx) => tx.branch.findFirstOrThrow({ where: { restaurantId } }));
    const t = { restaurantId, token: session.body.accessToken as string, branchId: branch.id, deviceId: redeem.body.device.id as string, name };
    tenants.push(t);
    return t;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: staffEmail, password, role: 'SUPPORT_ADMIN' });
    mateId = (await createTestPlatformUser(prisma, { email: mateEmail, password, role: 'SUPPORT_ADMIN' })).id;
    const login = async (email: string) => (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken as string;
    await createTestPlatformUser(prisma, { email: setupEmail, password });
    setupToken = await login(setupEmail);
    staffToken = await login(staffEmail);
    mateToken = await login(mateEmail);
    planId = (await setup('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST RT Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true } })).body.id;
    A = await makeTenant('a');
    B = await makeTenant('b');
  }, 120_000);

  afterAll(async () => {
    const ids = tenants.map((t) => t.restaurantId);
    if (ids.length === 0) ids.push('none');
    await prisma.runAsPlatform((tx) => tx.platformNotification.deleteMany({ where: { restaurantId: { in: ids } } }));
    await prisma.runAsPlatform((tx) => tx.supportTicket.deleteMany({ where: { restaurantId: { in: ids } } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: ids } } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: { in: [staffEmail, mateEmail, setupEmail] } } });
    await app.close();
  });

  const raise = (t: Tenant, body: object = {}) =>
    tenant(t, 'post', '/api/v1/tenant/support-tickets').send({ subject: 'Kitchen printer offline', description: 'The KOT printer stopped printing after lunch.', category: 'HARDWARE', priority: 'HIGH', ...body });

  let ticketId: string;

  it('a restaurant raises a ticket; restaurant, contact and SLA are filled in from its session', async () => {
    const res = await raise(A, { branchId: A.branchId, deviceId: A.deviceId });
    expect(res.status).toBe(201);
    ticketId = res.body.id;
    expect(res.body).toMatchObject({ source: 'RESTAURANT', category: 'HARDWARE', status: 'OPEN', priority: 'HIGH', restaurantId: A.restaurantId, branchId: A.branchId, deviceId: A.deviceId });
    expect(res.body.number).toBeGreaterThan(0);
    expect(res.body.raisedByEmail).toBe(`rt-a-${stamp}@test.example.com`);
    expect(new Date(res.body.slaDueAt).getTime()).toBeGreaterThan(Date.now());

    // Triage side sees it, with the channel and category.
    const detail = await staff('get', `/api/v1/support-tickets/${ticketId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ source: 'RESTAURANT', category: 'HARDWARE' });
    expect(detail.body.restaurant.name).toBe(A.name);
    expect(detail.body.events[0]).toMatchObject({ type: 'CREATED', actorType: 'RESTAURANT' });
  });

  it('the platform team is notified, with a link that opens the ticket', async () => {
    const res = await staff('get', '/api/v1/platform/notifications').query({ page: 1, type: 'TICKET_CREATED', restaurantId: A.restaurantId });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ severity: 'WARNING', link: `/tickets?open=${ticketId}` });
    expect(res.body.items[0].title).toContain(A.name);
  });

  it('rejects bad input with readable messages, and other restaurants\' branches or devices', async () => {
    const short = await raise(A, { subject: 'x' });
    expect(short.status).toBe(400);
    expect(JSON.stringify(short.body)).toMatch(/subject/i);
    expect((await raise(A, { category: 'GOSSIP' })).status).toBe(400);
    expect((await raise(A, { branchId: B.branchId })).status).toBe(400);
    expect((await raise(A, { deviceId: B.deviceId })).status).toBe(400);
  });

  it('a restaurant sees only its own tickets', async () => {
    const bTicket = (await raise(B, { subject: 'Question about invoice', category: 'BILLING', priority: 'LOW' })).body.id;

    const mine = await tenant(A, 'get', '/api/v1/tenant/support-tickets');
    expect(mine.status).toBe(200);
    expect(mine.body.map((t: { id: string }) => t.id)).toContain(ticketId);
    expect(mine.body.map((t: { id: string }) => t.id)).not.toContain(bTicket);

    expect((await tenant(A, 'get', `/api/v1/tenant/support-tickets/${bTicket}`)).status).toBe(404);
    expect((await tenant(A, 'post', `/api/v1/tenant/support-tickets/${bTicket}/comments`).send({ body: 'hello' })).status).toBe(404);
  });

  it('replies flow both ways, and internal notes stay internal', async () => {
    expect((await staff('post', `/api/v1/support-tickets/${ticketId}/comments`).send({ body: 'Please restart the printer and tell us the model.' })).status).toBe(201);
    expect((await staff('post', `/api/v1/support-tickets/${ticketId}/comments`).send({ body: 'Likely the Epson driver again.', internal: true })).status).toBe(201);
    expect((await tenant(A, 'post', `/api/v1/tenant/support-tickets/${ticketId}/comments`).send({ body: 'It is an Epson TM-T82.' })).status).toBe(201);

    const seenByRestaurant = (await tenant(A, 'get', `/api/v1/tenant/support-tickets/${ticketId}`)).body;
    const bodies = seenByRestaurant.comments.map((c: { body: string }) => c.body);
    expect(bodies).toEqual(['Please restart the printer and tell us the model.', 'It is an Epson TM-T82.']);
    expect(seenByRestaurant.comments[1]).toMatchObject({ authorType: 'RESTAURANT' });
    expect(JSON.stringify(seenByRestaurant)).not.toContain('Epson driver');

    const seenByStaff = (await staff('get', `/api/v1/support-tickets/${ticketId}`)).body;
    expect(seenByStaff.comments).toHaveLength(3);
    expect(seenByStaff.comments.find((c: { internal: boolean }) => c.internal).body).toContain('Epson driver');
  });

  it('status, priority and assignee changes are recorded; assignee changes are not shown to the restaurant', async () => {
    await staff('patch', `/api/v1/support-tickets/${ticketId}`).send({ status: 'IN_PROGRESS', assignedToId: mateId, priority: 'URGENT' });
    const events = (await staff('get', `/api/v1/support-tickets/${ticketId}`)).body.events as Array<{ type: string; fromValue: string | null; toValue: string | null }>;
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'STATUS', 'PRIORITY', 'ASSIGNEE']));
    expect(events.find((e) => e.type === 'STATUS')).toMatchObject({ fromValue: 'OPEN', toValue: 'IN_PROGRESS' });

    const visible = (await tenant(A, 'get', `/api/v1/tenant/support-tickets/${ticketId}`)).body.events as Array<{ type: string }>;
    expect(visible.map((e) => e.type)).toContain('STATUS');
    expect(visible.map((e) => e.type)).not.toContain('ASSIGNEE');
    expect((await tenant(A, 'get', `/api/v1/tenant/support-tickets/${ticketId}`)).body.status).toBe('IN_PROGRESS');
  });

  it('assigning notifies only the assignee', async () => {
    const forMate = await staff('get', '/api/v1/platform/notifications', mateToken).query({ page: 1, type: 'TICKET_ASSIGNED' });
    expect(forMate.body.items.some((n: { link: string }) => n.link === `/tickets?open=${ticketId}`)).toBe(true);
    const forStaff = await staff('get', '/api/v1/platform/notifications').query({ page: 1, type: 'TICKET_ASSIGNED' });
    expect(forStaff.body.items.some((n: { link: string }) => n.link === `/tickets?open=${ticketId}`)).toBe(false);
  });

  it('a restaurant reply on a resolved ticket reopens it and tells the assignee', async () => {
    await staff('patch', `/api/v1/support-tickets/${ticketId}`).send({ status: 'RESOLVED' });
    expect((await tenant(A, 'get', `/api/v1/tenant/support-tickets/${ticketId}`)).body.status).toBe('RESOLVED');

    expect((await tenant(A, 'post', `/api/v1/tenant/support-tickets/${ticketId}/comments`).send({ body: 'Still not printing.' })).status).toBe(201);
    expect((await tenant(A, 'get', `/api/v1/tenant/support-tickets/${ticketId}`)).body.status).toBe('OPEN');

    const forMate = await staff('get', '/api/v1/platform/notifications', mateToken).query({ page: 1, type: 'TICKET_COMMENT' });
    expect(forMate.body.items.some((n: { link: string }) => n.link === `/tickets?open=${ticketId}`)).toBe(true);
  });

  describe('attachments', () => {
    // 1x1 transparent PNG
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    let attachmentId: string;

    it('a restaurant attaches a screenshot; both sides can see and download it', async () => {
      const up = await tenant(A, 'post', `/api/v1/tenant/support-tickets/${ticketId}/attachments`).send({ fileName: 'printer.png', mimeType: 'image/png', dataBase64: png });
      expect(up.status).toBe(201);
      attachmentId = up.body.id;
      expect(up.body).toMatchObject({ fileName: 'printer.png', mimeType: 'image/png' });
      expect(up.body.data).toBeUndefined();

      const detail = (await tenant(A, 'get', `/api/v1/tenant/support-tickets/${ticketId}`)).body;
      expect(detail.attachments.map((a: { id: string }) => a.id)).toContain(attachmentId);

      const file = await tenant(A, 'get', `/api/v1/tenant/support-tickets/${ticketId}/attachments/${attachmentId}`);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('image/png');
      expect(Buffer.from(file.body).toString('base64')).toBe(png);

      const staffFile = await staff('get', `/api/v1/support-tickets/${ticketId}/attachments/${attachmentId}`);
      expect(staffFile.status).toBe(200);
    });

    it('another restaurant cannot download it', async () => {
      expect((await tenant(B, 'get', `/api/v1/tenant/support-tickets/${ticketId}/attachments/${attachmentId}`)).status).toBe(404);
    });

    it('rejects dangerous file types, oversized files and too many files', async () => {
      const html = await tenant(A, 'post', `/api/v1/tenant/support-tickets/${ticketId}/attachments`).send({ fileName: 'x.html', mimeType: 'text/html', dataBase64: Buffer.from('<script>1</script>').toString('base64') });
      expect(html.status).toBe(400);

      const big = await tenant(A, 'post', `/api/v1/tenant/support-tickets/${ticketId}/attachments`).send({ fileName: 'big.png', mimeType: 'image/png', dataBase64: Buffer.alloc(3 * 1024 * 1024, 1).toString('base64') });
      expect([400, 413]).toContain(big.status);

      // The production server accepts large JSON bodies, so the size rule itself must hold in the service.
      await expect(
        app.get(SupportTicketsService).saveAttachment(ticketId, { fileName: 'big.png', mimeType: 'image/png', dataBase64: Buffer.alloc(3 * 1024 * 1024, 1).toString('base64') }, { type: 'RESTAURANT', name: 'x' })
      ).rejects.toThrow(/at most 2 MB/);

      let last = 201;
      for (let i = 0; i < 5; i += 1) {
        last = (await tenant(A, 'post', `/api/v1/tenant/support-tickets/${ticketId}/attachments`).send({ fileName: `p${i}.png`, mimeType: 'image/png', dataBase64: png })).status;
      }
      expect(last).toBe(400);
    });
  });

  it('needs a restaurant session: no token or a platform token is refused', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/tenant/support-tickets')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/v1/tenant/support-tickets').set('Authorization', `Bearer ${staffToken}`)).status).toBe(401);
  });
});

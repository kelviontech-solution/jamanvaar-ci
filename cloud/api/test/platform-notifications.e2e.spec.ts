import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-064: the bell was two counters computed in the browser (subscriptions expiring, failed backups),
 * linking to whole list pages, with no history, no read state and no severity. It is now a real store:
 * events create notifications once, each names the exact record, and every person has their own read state.
 */
describe('Platform notification centre (BUG-064)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'correct-horse-battery-staple';
  const emailA = `notif-a-${stamp}@example.com`;
  const emailB = `notif-b-${stamp}@example.com`;
  let tokenA: string;
  let tokenB: string;
  let userBId: string;
  let restaurantId: string;
  let planId: string;
  const day = 86400_000;

  const as = (token: string, method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const list = (token: string, q: Record<string, string | number> = {}) => as(token, 'get', '/api/v1/platform/notifications').query({ page: 1, restaurantId, ...q });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: emailA, password });
    userBId = (await createTestPlatformUser(prisma, { email: emailB, password })).id;
    const login = async (email: string) => (await platformLogin(app, email, password)).body.accessToken as string;
    tokenA = await login(emailA);
    tokenB = await login(emailB);

    restaurantId = (await as(tokenA, 'post', '/api/v1/restaurants').send({ name: `TEST Notif ${stamp}`, ownerName: 'Owner', ownerEmail: `notif-${stamp}@example.com` })).body.restaurant.id;
    planId = (await as(tokenA, 'post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Notif Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;
    await as(tokenA, 'post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 3 * day).toISOString() });

    await prisma.runAsPlatform(async (tx) => {
      await tx.backup.create({ data: { restaurantId, method: 'AUTOMATIC', status: 'FAILED', sizeBytes: 0, storageKey: '', checksumSha256: '', errorMessage: 'disk full' } });
      await tx.invoice.create({
        data: { invoiceNumber: `TEST-N-${stamp}`, restaurantId, amount: 1000, taxAmount: 180, totalAmount: 1180, status: 'ISSUED', billingPeriodStart: new Date(), billingPeriodEnd: new Date(Date.now() + 30 * day), dueDate: new Date(Date.now() - 5 * day) } as never
      });
      await tx.device.create({ data: { restaurantId, type: 'POS', status: 'ACTIVE', name: 'Counter 1', lastSeenAt: new Date(Date.now() - 3 * 3600_000) } as never });
      await tx.activationKey.create({ data: { code: `JMV-N-${stamp}`, restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 2 * day) } });
    });
  }, 90_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.platformNotification.deleteMany({ where: { OR: [{ restaurantId }, { dedupeKey: { startsWith: `test-${stamp}` } }] } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  it('a scan turns real conditions into notifications, each with a severity and a link to the exact record', async () => {
    const run = await as(tokenA, 'post', '/api/v1/platform/jobs/run');
    const job = run.body.results.find((r: { name: string }) => r.name === 'notifications');
    expect(job?.ok).toBe(true);

    const res = await list(tokenA);
    expect(res.status).toBe(200);
    const byType = Object.fromEntries(res.body.items.map((n: { type: string }) => [n.type, n]));

    expect(byType.SUBSCRIPTION_EXPIRING).toMatchObject({ severity: expect.stringMatching(/WARNING|CRITICAL/), link: `/restaurants/${restaurantId}?tab=subscription` });
    expect(byType.BACKUP_FAILED).toMatchObject({ severity: 'CRITICAL', link: `/restaurants/${restaurantId}?tab=backups` });
    expect(byType.INVOICE_OVERDUE).toMatchObject({ severity: 'WARNING', link: `/restaurants/${restaurantId}?tab=billing` });
    expect(byType.DEVICES_OFFLINE.link).toBe(`/restaurants/${restaurantId}?tab=devices`);
    expect(byType.KEYS_EXPIRING.link).toBe(`/restaurants/${restaurantId}?tab=devices`);
    expect(byType.BACKUP_FAILED.title).toContain(`TEST Notif ${stamp}`);
    expect(byType.INVOICE_OVERDUE.title).toContain(`TEST-N-${stamp}`);
  });

  it('the same condition never creates a second notification', async () => {
    const before = (await list(tokenA)).body.total;
    await as(tokenA, 'post', '/api/v1/platform/jobs/run');
    await as(tokenA, 'post', '/api/v1/platform/jobs/run');
    expect((await list(tokenA)).body.total).toBe(before);
  });

  it('counts unread per person, and marking one read affects only that person', async () => {
    const all = (await list(tokenA)).body;
    expect(all.unreadCount).toBeGreaterThanOrEqual(5);
    const first = all.items[0];

    expect((await as(tokenA, 'post', `/api/v1/platform/notifications/${first.id}/read`)).status).toBe(201);
    const a = (await list(tokenA)).body;
    const b = (await list(tokenB)).body;
    expect(a.items.find((n: { id: string }) => n.id === first.id).read).toBe(true);
    expect(b.items.find((n: { id: string }) => n.id === first.id).read).toBe(false);
    expect(a.unreadCount).toBe(all.unreadCount - 1);
    expect(b.unreadCount).toBe(all.unreadCount);
  });

  it('filters by unread, severity and type, and reports counts by severity', async () => {
    const unread = (await list(tokenA, { unread: 'true' })).body;
    expect(unread.items.every((n: { read: boolean }) => !n.read)).toBe(true);

    const critical = (await list(tokenA, { severity: 'CRITICAL' })).body;
    expect(critical.items.length).toBeGreaterThanOrEqual(1);
    expect(critical.items.every((n: { severity: string }) => n.severity === 'CRITICAL')).toBe(true);

    expect((await list(tokenA, { type: 'INVOICE_OVERDUE' })).body.items.map((n: { type: string }) => n.type)).toEqual(['INVOICE_OVERDUE']);
    expect((await list(tokenA)).body.severityCounts).toMatchObject({ CRITICAL: expect.any(Number), WARNING: expect.any(Number) });
  });

  it('mark all read empties the unread count for that person only', async () => {
    const res = await as(tokenA, 'post', '/api/v1/platform/notifications/read-all').send({});
    expect(res.status).toBe(201);
    expect((await as(tokenA, 'get', '/api/v1/platform/notifications/unread-count')).body.count).toBe(0);
    expect((await as(tokenB, 'get', '/api/v1/platform/notifications/unread-count')).body.count).toBeGreaterThan(0);
  });

  it('a notification aimed at one person is invisible to everyone else', async () => {
    await prisma.runAsPlatform((tx) =>
      tx.platformNotification.create({ data: { type: 'TICKET_ASSIGNED', severity: 'INFO', title: 'Assigned to you', link: '/tickets', dedupeKey: `test-${stamp}-targeted`, userId: userBId } })
    );
    const seenByB = (await as(tokenB, 'get', '/api/v1/platform/notifications').query({ page: 1, type: 'TICKET_ASSIGNED' })).body.items;
    const seenByA = (await as(tokenA, 'get', '/api/v1/platform/notifications').query({ page: 1, type: 'TICKET_ASSIGNED' })).body.items;
    expect(seenByB.some((n: { title: string }) => n.title === 'Assigned to you')).toBe(true);
    expect(seenByA.some((n: { title: string }) => n.title === 'Assigned to you')).toBe(false);
    // ...and A cannot mark it read either.
    const id = seenByB.find((n: { title: string }) => n.title === 'Assigned to you').id;
    expect((await as(tokenA, 'post', `/api/v1/platform/notifications/${id}/read`)).status).toBe(404);
  });

  it('requires a signed-in platform user', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/platform/notifications')).status).toBe(401);
  });
});

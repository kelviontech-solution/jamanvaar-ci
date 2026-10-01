import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * B2-052 item 5: the notification bell counted every team-wide notification for every
 * platform role, regardless of whether that role can even open the page the notification
 * links to — a Finance Admin (no devices/ops access at all) was counted for backup/device/
 * sync notifications it would get a 403 on if it clicked through. Fixed the same way B2-051/
 * B2-053 fixed the equivalent leak on activation keys: gate by the role's own area
 * permissions (`permissionsForRole`), reusing the one shared table.
 */
describe('Notification bell is scoped to what the role can actually open (B2-052 item 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'correct-horse-battery-staple';
  const day = 86400_000;
  let ownerToken: string;
  let financeToken: string;
  let restaurantId: string;
  let planId: string;

  const as = (token: string, method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const typesFor = async (token: string) => {
    const res = await as(token, 'get', '/api/v1/platform/notifications').query({ page: 1, pageSize: 100, restaurantId });
    return new Set((res.body.items as Array<{ type: string }>).map((n) => n.type));
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const ownerEmail = `notif-scope-owner-${stamp}@example.com`;
    await prisma.platformUser.create({ data: { email: ownerEmail, passwordHash: await bcrypt.hash(password, 4), fullName: 'Owner', role: 'PLATFORM_OWNER', status: 'ACTIVE' } });
    ownerToken = (await platformLogin(app, ownerEmail, password)).body.accessToken;

    const financeEmail = `notif-scope-finance-${stamp}@example.com`;
    await prisma.platformUser.create({ data: { email: financeEmail, passwordHash: await bcrypt.hash(password, 4), fullName: 'Finance', role: 'FINANCE_ADMIN', status: 'ACTIVE' } });
    financeToken = (await platformLogin(app, financeEmail, password)).body.accessToken;

    restaurantId = (await as(ownerToken, 'post', '/api/v1/restaurants').send({ name: `TEST Notif Scope ${stamp}`, ownerName: 'Owner', ownerEmail: `notif-scope-${stamp}@example.com` })).body.restaurant.id;
    planId = (await as(ownerToken, 'post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Notif Scope Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;
    await as(ownerToken, 'post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 3 * day).toISOString() });

    // One notification in an area Finance DOES have (subscriptions) and one it does NOT (ops, via a failed backup).
    await prisma.runAsPlatform(async (tx) => {
      await tx.backup.create({ data: { restaurantId, method: 'AUTOMATIC', status: 'FAILED', sizeBytes: 0, storageKey: '', checksumSha256: '', errorMessage: 'disk full' } });
      await tx.device.create({ data: { restaurantId, type: 'POS', status: 'ACTIVE', name: 'Counter 1', lastSeenAt: new Date(Date.now() - 3 * 3600_000) } as never });
    });

    const run = await as(ownerToken, 'post', '/api/v1/platform/jobs/run');
    expect(run.body.results.find((r: { name: string }) => r.name === 'notifications')?.ok).toBe(true);
  }, 90_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.platformNotification.deleteMany({ where: { restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: { contains: `notif-scope-${stamp}` } } });
    await prisma.platformUser.deleteMany({ where: { email: { contains: `notif-scope-owner-${stamp}` } } });
    await prisma.platformUser.deleteMany({ where: { email: { contains: `notif-scope-finance-${stamp}` } } });
    await app.close();
  });

  it("a role with full access (Platform Owner) sees both the subscriptions-area and the ops-area notification", async () => {
    const types = await typesFor(ownerToken);
    expect(types.has('SUBSCRIPTION_EXPIRING')).toBe(true);
    expect(types.has('BACKUP_FAILED')).toBe(true);
    expect(types.has('DEVICES_OFFLINE')).toBe(true);
  });

  it('Finance Admin (no devices/ops access) sees the subscriptions notification but not the backup/device ones', async () => {
    const types = await typesFor(financeToken);
    expect(types.has('SUBSCRIPTION_EXPIRING')).toBe(true);
    expect(types.has('BACKUP_FAILED')).toBe(false);
    expect(types.has('DEVICES_OFFLINE')).toBe(false);
  });

  it("Finance Admin's unread count does not include the ops/devices notifications", async () => {
    const financeCount = (await as(financeToken, 'get', '/api/v1/platform/notifications/unread-count')).body.count;
    const ownerCount = (await as(ownerToken, 'get', '/api/v1/platform/notifications/unread-count')).body.count;
    // Finance is missing at least the BACKUP_FAILED and DEVICES_OFFLINE notifications the owner has.
    expect(financeCount).toBeLessThan(ownerCount);
  });
});

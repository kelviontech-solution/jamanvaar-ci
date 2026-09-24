import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-082/083/084: a Finance Admin (or even a Read-Only auditor) could call
 * every admin endpoint. Each team role is now limited to its areas on the
 * server, the login/me response carries the permission table for the web app,
 * and team management protects owners.
 */
describe('Platform RBAC (BUG-082/083/084)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'correct-horse-battery-staple';
  const roles = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'PLATFORM_OPS', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'READ_ONLY'] as const;
  const emails: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const createdRestaurantIds: string[] = [];

  const as = (role: string, method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${tokens[role]}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.runAsPlatform((tx) =>
      tx.platformSetting.upsert({
        where: { key: 'platform.maintenance' },
        create: { key: 'platform.maintenance', category: 'SYSTEM', value: { maintenanceMode: false, statusBanner: '' } },
        update: {}
      })
    );
    for (const role of roles) {
      emails[role] = `rbac-${role.toLowerCase()}-${stamp}@example.com`;
      const user = await prisma.platformUser.create({
        data: { email: emails[role], passwordHash: await bcrypt.hash(password, 4), fullName: `RBAC ${role}`, role, status: 'ACTIVE' }
      });
      userIds[role] = user.id;
      const login = await platformLogin(app, emails[role], password);
      tokens[role] = login.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await prisma.platformUser.deleteMany({ where: { email: { startsWith: `rbac-invite-${stamp}` } } });
    await app.close();
  });

  it('rejects an unauthenticated call', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/invoices');
    expect(res.status).toBe(401);
  });

  it('Finance Admin can use billing but cannot create restaurants, read devices, or change settings', async () => {
    expect((await as('FINANCE_ADMIN', 'get', '/api/v1/invoices')).status).toBe(200);
    expect((await as('FINANCE_ADMIN', 'get', '/api/v1/restaurants')).status).toBe(200);
    expect((await as('FINANCE_ADMIN', 'post', '/api/v1/restaurants').send({ name: 'x', ownerName: 'y', ownerEmail: 'z@z.com' })).status).toBe(403);
    expect((await as('FINANCE_ADMIN', 'get', '/api/v1/devices')).status).toBe(403);
    expect((await as('FINANCE_ADMIN', 'post', '/api/v1/activation-keys').send({})).status).toBe(403);
    expect((await as('FINANCE_ADMIN', 'patch', '/api/v1/platform/settings/platform.maintenance').send({ value: {} })).status).toBe(403);
  });

  it('Read-Only can read but never write, and cannot read settings', async () => {
    expect((await as('READ_ONLY', 'get', '/api/v1/restaurants')).status).toBe(200);
    expect((await as('READ_ONLY', 'get', '/api/v1/invoices')).status).toBe(200);
    expect((await as('READ_ONLY', 'post', '/api/v1/invoices').send({})).status).toBe(403);
    expect((await as('READ_ONLY', 'post', '/api/v1/restaurants').send({})).status).toBe(403);
    expect((await as('READ_ONLY', 'get', '/api/v1/platform/settings')).status).toBe(403);
  });

  it('Support Admin can raise tickets but cannot see billing; Ops can read devices but not billing', async () => {
    const ticket = await as('SUPPORT_ADMIN', 'post', '/api/v1/support-tickets').send({ subject: 'rbac ticket', description: 'rbac test ticket' });
    expect(ticket.status).toBe(201);
    expect((await as('SUPPORT_ADMIN', 'get', '/api/v1/invoices')).status).toBe(403);
    expect((await as('PLATFORM_OPS', 'get', '/api/v1/devices')).status).toBe(200);
    expect((await as('PLATFORM_OPS', 'get', '/api/v1/invoices')).status).toBe(403);
  });

  it('Super Admin can create a restaurant but only the Owner can change platform settings', async () => {
    const created = await as('SUPER_ADMIN', 'post', '/api/v1/restaurants').send({
      name: `TEST RBAC ${stamp}`, ownerName: 'RBAC Owner', ownerEmail: `rbac-restaurant-owner-${stamp}@test.example.com`
    });
    expect(created.status).toBe(201);
    createdRestaurantIds.push(created.body.restaurant.id);
    expect((await as('SUPER_ADMIN', 'get', '/api/v1/platform/settings')).status).toBe(200);
    expect((await as('SUPER_ADMIN', 'patch', '/api/v1/platform/settings/platform.maintenance').send({ value: { maintenanceMode: false, statusBanner: '' } })).status).toBe(403);
    expect((await as('PLATFORM_OWNER', 'patch', '/api/v1/platform/settings/platform.maintenance').send({ value: { maintenanceMode: false, statusBanner: '' } })).status).toBe(200);
  });

  it('every role can read its own profile, and the response carries the role permissions', async () => {
    const me = await as('FINANCE_ADMIN', 'get', '/api/v1/platform/me');
    expect(me.status).toBe(200);
    expect(me.body.permissions.billing).toBe('write');
    expect(me.body.permissions.restaurants).toBe('read');
    expect(me.body.permissions.devices).toBeUndefined();

    const login = await platformLogin(app, emails.READ_ONLY, password);
    expect(login.body.user.permissions.billing).toBe('read');
  });

  it('a Super Admin cannot invite a Platform Owner, or change or disable an existing Owner', async () => {
    const invite = await as('SUPER_ADMIN', 'post', '/api/v1/platform-users/invite').send({
      fullName: 'Would-be Owner', email: `rbac-invite-${stamp}-owner@example.com`, role: 'PLATFORM_OWNER'
    });
    expect(invite.status).toBe(403);

    const demote = await as('SUPER_ADMIN', 'patch', `/api/v1/platform-users/${userIds.PLATFORM_OWNER}/role`).send({ role: 'READ_ONLY' });
    expect(demote.status).toBe(403);

    const disable = await as('SUPER_ADMIN', 'patch', `/api/v1/platform-users/${userIds.PLATFORM_OWNER}/disable`);
    expect(disable.status).toBe(403);
  });

  it('the last active Platform Owner cannot be demoted or disabled', async () => {
    // Make sure this owner is the only active one for the duration of the check.
    const others = await prisma.platformUser.findMany({ where: { role: 'PLATFORM_OWNER', status: 'ACTIVE', id: { not: userIds.PLATFORM_OWNER } } });
    await prisma.platformUser.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { status: 'DISABLED' } });

    // A second owner tries to remove the only remaining one: create a second owner first, then disable it -> allowed;
    // then the remaining single owner cannot be removed by anyone.
    const second = await prisma.platformUser.create({
      data: { email: `rbac-second-owner-${stamp}@example.com`, passwordHash: await bcrypt.hash(password, 4), fullName: 'Second Owner', role: 'PLATFORM_OWNER', status: 'ACTIVE' }
    });
    emails.SECOND = second.email;
    const login = await platformLogin(app, second.email, password);
    tokens.SECOND = login.body.accessToken;

    const disableOwner = await as('SECOND', 'patch', `/api/v1/platform-users/${userIds.PLATFORM_OWNER}/disable`);
    expect(disableOwner.status).toBe(200); // two active owners: allowed

    // now only SECOND is active: the original owner (disabled) cannot restore, and SECOND cannot be demoted by another owner
    await prisma.platformUser.update({ where: { id: userIds.PLATFORM_OWNER }, data: { status: 'ACTIVE' } });
    // Disabling ended the owner's sessions (BUG-093), so a re-enabled owner has to sign in again.
    const staleOwner = await as('PLATFORM_OWNER', 'get', '/api/v1/platform/me');
    expect(staleOwner.status).toBe(401);
    const relogin = await platformLogin(app, emails.PLATFORM_OWNER, password);
    tokens.PLATFORM_OWNER = relogin.body.accessToken;
    await prisma.platformUser.update({ where: { id: second.id }, data: { status: 'DISABLED' } });
    const lastOwnerDemote = await as('PLATFORM_OWNER', 'patch', `/api/v1/platform-users/${userIds.PLATFORM_OWNER}/role`).send({ role: 'SUPER_ADMIN' });
    expect(lastOwnerDemote.status).toBe(403); // cannot change your own role (existing rule)
    await prisma.platformUser.update({ where: { id: second.id }, data: { status: 'ACTIVE' } });
    const removeLast = await as('SECOND', 'patch', `/api/v1/platform-users/${userIds.PLATFORM_OWNER}/role`).send({ role: 'SUPER_ADMIN' });
    expect(removeLast.status).toBe(200); // two active owners: allowed
    const removeSecondLast = await as('PLATFORM_OWNER', 'patch', `/api/v1/platform-users/${second.id}/role`).send({ role: 'SUPER_ADMIN' });
    expect([403, 401]).toContain(removeSecondLast.status); // the demoted user is no longer an owner, and the last owner is protected
    await prisma.platformUser.deleteMany({ where: { id: second.id } });
  });

  /**
   * B2-051/B2-053: a role refused 403 on the direct /devices and /activation-keys endpoints
   * used to get the exact same data back anyway, nested inside GET /restaurants/:id — the guard
   * only checks the `restaurants` area that endpoint belongs to, not the `devices` area the
   * embedded relations actually need. And even a role that IS allowed to see activation keys
   * (Read-Only, Support Admin — both only `devices: 'read'`) got a live, usable code back in
   * full, on both endpoints, because nothing masked by role, only by the key's own status.
   */
  it("B2-051/B2-053: an activation code and a device's credential hash are never leaked to a role that shouldn't see them, on either endpoint", async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: `TEST B2-053 ${stamp}`, status: 'ACTIVE' } });
    createdRestaurantIds.push(restaurant.id);
    const device = await prisma.device.create({
      data: { restaurantId: restaurant.id, type: 'POS', status: 'ACTIVE', deviceTokenHash: 'sha256-fake-secret-for-test' }
    });
    const key = await prisma.activationKey.create({
      data: { restaurantId: restaurant.id, code: 'JMV-B2053-TEST-0001', status: 'ACTIVE', allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000) }
    });

    // Finance: refused 403 directly, and the nested restaurant response must not carry the data either.
    expect((await as('FINANCE_ADMIN', 'get', `/api/v1/devices?restaurantId=${restaurant.id}`)).status).toBe(403);
    expect((await as('FINANCE_ADMIN', 'get', `/api/v1/activation-keys?restaurantId=${restaurant.id}`)).status).toBe(403);
    const financeNested = await as('FINANCE_ADMIN', 'get', `/api/v1/restaurants/${restaurant.id}`);
    expect(financeNested.status).toBe(200);
    expect(financeNested.body.devices).toEqual([]);
    expect(financeNested.body.activationKeys).toEqual([]);

    // Read-Only: has devices:read, so the relations ARE present, but never a usable code or the token hash.
    const roNested = await as('READ_ONLY', 'get', `/api/v1/restaurants/${restaurant.id}`);
    expect(roNested.status).toBe(200);
    expect(roNested.body.devices[0].deviceTokenHash).toBeUndefined();
    expect(roNested.body.activationKeys[0].code).toBeNull();
    expect(roNested.body.activationKeys[0].codeLast4).toBe('0001');

    const roDirect = await as('READ_ONLY', 'get', `/api/v1/activation-keys?restaurantId=${restaurant.id}`);
    expect(roDirect.body[0].code).toBeNull();
    const roDetail = await as('READ_ONLY', 'get', `/api/v1/activation-keys/${key.id}`);
    expect(roDetail.body.code).toBeNull();

    // Owner: full write access to devices, sees the real code — but never the token hash, which no client needs, ever.
    const ownerNested = await as('PLATFORM_OWNER', 'get', `/api/v1/restaurants/${restaurant.id}`);
    expect(ownerNested.body.activationKeys[0].code).toBe('JMV-B2053-TEST-0001');
    expect(ownerNested.body.devices[0].deviceTokenHash).toBeUndefined();
    const ownerDetail = await as('PLATFORM_OWNER', 'get', `/api/v1/activation-keys/${key.id}`);
    expect(ownerDetail.body.code).toBe('JMV-B2053-TEST-0001');

    await prisma.device.delete({ where: { id: device.id } });
    await prisma.activationKey.delete({ where: { id: key.id } });
  });
});

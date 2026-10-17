import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestPlatformUser, ownerDeviceSession, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { randomUUID } from 'node:crypto';
import { MenuPublicationsService } from '../src/modules/menu-publications/menu-publications.service';
describe('Simplified admin workflows: actual authorization, allocation, menu and handover evidence', () => {
  let app: INestApplication, prisma: PrismaService, platform: string, owner: string, rid: string, bid: string, bid2: string, planId: string;
  const stamp = Date.now(),
    email = `workflow-${stamp}@example.invalid`,
    password = 'QA-workflow-password-1234';
  const req = (method: 'get' | 'post', url: string, token = platform) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', 'Bearer ' + token);
  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    platform = (await platformLogin(app, email, password)).body.accessToken;
    const restaurant = await req('post', '/api/v1/restaurants').send({
      name: 'Workflow QA',
      mobile: '9' + String(stamp).slice(-9),
      ownerName: 'Workflow owner',
      ownerEmail: `owner-${email}`
    });
    expect(restaurant.status).toBe(201);
    rid = restaurant.body.restaurant.id;
    bid = restaurant.body.branch.id;
    const plan = await req('post', '/api/v1/plans').send({
      tier: 'PRO',
      name: 'Workflow QA ' + stamp,
      priceMonthly: 10000,
      maxBranches: 5,
      maxDevices: 8,
      maxUsers: 8,
      entitlements: { posTerminal: true, selfOrderKiosk: true }
    });
    planId = plan.body.id;
    expect(
      (
        await req('post', '/api/v1/subscriptions').send({
          restaurantId: rid,
          planId,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          applications: ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING']
        })
      ).status
    ).toBe(201);
    const second = await req('post', '/api/v1/branches').send({ restaurantId: rid, name: 'Second branch', code: 'SECOND' });
    expect(second.status).toBe(201);
    bid2 = second.body.id;
    const key = await req('post', '/api/v1/activation-keys').send({
      restaurantId: rid,
      allowedDeviceType: 'POS_ADMIN',
      branchId: bid,
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    expect(key.status).toBe(201);
    const activated = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
    expect(activated.status).toBe(201);
    owner = await ownerDeviceSession(prisma, activated.body.deviceToken);
  }, 90000);
  afterAll(async () => {
    if (rid) await prisma.runAsPlatform(async tx=>{await tx.branchProductLicense.deleteMany({where:{restaurantId:rid}});return tx.restaurant.deleteMany({ where: { id: rid } });});
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: { in: [email, 'support-' + email,'finance-'+email] } } });
    await app.close();
  });
  it('requires owner authentication and rejects a foreign branch', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/tenant/operations/launch?branchId=' + bid)).status).toBe(401);
    expect((await req('get', '/api/v1/tenant/operations/launch?branchId=' + randomUUID(), owner)).status).toBe(403);
    expect((await req('get', `/api/v1/restaurants/${rid}/launch?branchId=${randomUUID()}`)).status).toBe(400);
  });
  it('returns separate purchased, enabled, configured and ready states; no false green without menu/tests', async () => {
    const res = await req('get', '/api/v1/tenant/operations/launch?branchId=' + bid, owner);
    expect(res.status).toBe(200);
    expect(res.body.products.find((p: any) => p.appCode === 'KIOSK')).toMatchObject({
      purchased: true,
      enabled: true,
      configured: false,
      ready: false,
      reason: 'SETUP_REQUIRED'
    });
    expect(res.body.checks.find((c: any) => c.id === 'menu').done).toBe(false);
  });
  it('recognizes the shared owner console for licensed kiosk management without leaking another branch device', async () => {
    const main = await req('get', '/api/v1/tenant/operations/launch?branchId=' + bid, owner);
    const second = await req('get', '/api/v1/tenant/operations/launch?branchId=' + bid2, owner);
    expect(main.body.products.find((p: any) => p.appCode === 'KIOSK_ADMIN')).toMatchObject({ purchased: true, enabled: true, configured: true });
    expect(second.body.products.find((p: any) => p.appCode === 'KIOSK_ADMIN').configured).toBe(false);
  });
  it('persists takeaway/paperless choices per branch and rejects stale edits', async () => {
    const path = '/api/v1/tenant/operations/launch/preferences?branchId=' + bid;
    expect((await req('post', path, owner).send({ expectedVersion: 0, tableService: false, printedReceipts: false })).status).toBe(201);
    expect((await req('post', path, owner).send({ expectedVersion: 0, tableService: true, printedReceipts: true })).status).toBe(409);
    const a = (await req('get', '/api/v1/tenant/operations/launch?branchId=' + bid, owner)).body,
      b = (await req('get', '/api/v1/tenant/operations/launch?branchId=' + bid2, owner)).body;
    expect(a.checks.some((c: any) => c.id === 'tables' || c.id === 'printer')).toBe(false);
    expect(b.preferences.tableService).toBe(true);
  });
  it('shares readiness evidence with Super Admin and rejects unknown menu channels', async () => {
    const res = await req('get', `/api/v1/restaurants/${rid}/launch?branchId=${bid}`);
    expect(res.status).toBe(200);
    expect(res.body.preferences.tableService).toBe(false);
    expect((await req('get', `/api/v1/tenant/operations/launch/menu?branchId=${bid}&channel=ADMIN`, owner)).status).toBe(400);
  });
  it('projects device capacity for the selected branch using the current saved limit', async () => {
    await prisma.runAsPlatform(async (tx) => {
      await tx.branchProductLicense.create({
        data: {
          createdBy: 'qa-workflow',
          restaurantId: rid,
          branchId: bid,
          appCode: 'KIOSK',
          enabled: true,
          deviceQuota: 1,
          disabledFeatures: [],
          effectiveAt: new Date(Date.now() - 1000),
          revision: 1
        }
      });
      await tx.device.create({ data: { restaurantId: rid, branchId: bid, type: 'KIOSK', status: 'ACTIVE', name: 'Front kiosk' } });
    });
    const a = await req('get', `/api/v1/activation-keys/quota-preview?restaurantId=${rid}&branchId=${bid}&appCode=KIOSK`);
    const b = await req('get', `/api/v1/activation-keys/quota-preview?restaurantId=${rid}&branchId=${bid2}&appCode=KIOSK`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ current: 1, branchCurrent: 1, branchQuota: 1, available: false });
    expect(b.body).toMatchObject({ current: 1, branchCurrent: 0, branchQuota: null, available: true });
    expect(
      (
        await req('post', '/api/v1/activation-keys').send({
          restaurantId: rid,
          branchId: bid,
          allowedDeviceType: 'KIOSK',
          expiresAt: new Date(Date.now() + 86400000).toISOString()
        })
      ).status
    ).toBe(409);
  });
  it('reports offline devices as waiting and never equates publication with receipt', async () => {
    const res = await req('get', '/api/v1/tenant/operations/launch?branchId=' + bid, owner);
    expect(res.body.delivery[0]).toMatchObject({ online: false, menuReceived: false, configurationReceived: false, configurationStatus: 'WAITING' });
  });
  it('finds a real acknowledgement for the current design even after later unrelated sync requests', async () => {
    const version = new Date().toISOString();
    await prisma.runAsPlatform(async (tx) => {
      const kiosk = await tx.device.findFirstOrThrow({ where: { restaurantId: rid, type: 'KIOSK', branchId: bid } });
      await tx.syncedEntity.create({
        data: { restaurantId: rid, entityType: 'KIOSK_CONFIGURATION', externalId: 'kiosk-config-' + bid, payload: { branchId: bid, updatedAt: version } }
      });
      await tx.deviceCommand.create({
        data: {
          restaurantId: rid,
          deviceId: kiosk.id,
          commandType: 'REQUEST_SYNC',
          status: 'SUCCEEDED',
          payload: { scope: 'WELCOME', configVersion: version },
          result: { configVersion: version },
          expiresAt: new Date(Date.now() + 86400000)
        }
      });
      for (let i = 0; i < 6; i++)
        await tx.deviceCommand.create({
          data: {
            restaurantId: rid,
            deviceId: kiosk.id,
            commandType: 'REQUEST_SYNC',
            status: 'PENDING',
            payload: { scope: 'GENERAL' },
            expiresAt: new Date(Date.now() + 86400000)
          }
        });
    });
    const res = await req('get', '/api/v1/tenant/operations/launch?branchId=' + bid, owner);
    expect(res.status).toBe(200);
    expect(res.body.delivery[0]).toMatchObject({ online: false, configurationReceived: true, configurationStatus: 'RECEIVED', menuReceived: false });
  });
  it('previews published dishes with channel exclusions and live branch stock', async () => {
    await prisma.runAsPlatform(async (tx) => {
      for (const [entityType, payload] of [
        ['MENU_CATEGORY', { id: 'qa-category', name: 'Meals', isActive: true }],
        [
          'MENU_ITEM',
          { id: 'qa-visible', name: 'Paneer bowl', categoryId: 'qa-category', price: 120, isAvailable: true, salesChannels: ['KIOSK', 'QR', 'POS'] }
        ],
        ['MENU_ITEM', { id: 'qa-pos', name: 'Counter dish', categoryId: 'qa-category', price: 100, isAvailable: true, salesChannels: ['POS'] }]
      ] as const)
        await tx.syncedEntity.create({ data: { restaurantId: rid, entityType, externalId: payload.id, payload } });
      await app.get(MenuPublicationsService).publishTx(tx, rid, null, 'Workflow test');
    });
    const first = await req('get', `/api/v1/tenant/operations/launch/menu?branchId=${bid}&channel=KIOSK`, owner);
    expect(first.status).toBe(200);
    expect(first.body.items.map((i: any) => i.id)).toEqual(['qa-visible']);
    expect(first.body.hidden.find((i: any) => i.id === 'qa-pos').reason).toBe('Not sold through KIOSK ordering');
    await prisma.runAsPlatform((tx) =>
      tx.syncedEntity.create({
        data: {
          restaurantId: rid,
          entityType: 'BRANCH_MENU_OVERRIDE',
          externalId: 'qa-override',
          payload: { branchId: bid, itemId: 'qa-visible', stockQuantity: 0 }
        }
      })
    );
    const soldout = await req('get', `/api/v1/tenant/operations/launch/menu?branchId=${bid}&channel=KIOSK`, owner);
    expect(soldout.body.items).toHaveLength(0);
    expect(soldout.body.hidden.find((i: any) => i.id === 'qa-visible').reason).toBe('Out of stock in this branch');
    const other = await req('get', `/api/v1/tenant/operations/launch/menu?branchId=${bid2}&channel=KIOSK`, owner);
    expect(other.body.items).toHaveLength(1);
  });
  let ticketId: string;
  it('issues one key transactionally from the support request and retries without a second key', async () => {
    const ticket = await req('post', '/api/v1/tenant/support-tickets', owner).send({
      subject: 'Kiosk activation key',
      category: 'ONBOARDING',
      description: 'Please connect the upstairs kiosk',
      branchId: bid2,
      activationRequest: { type: 'KIOSK', terminalName: 'Upstairs kiosk' }
    });
    expect(ticket.status).toBe(201);
    ticketId = ticket.body.id;
    const [a, b] = await Promise.all([
      req('post', `/api/v1/support-tickets/${ticketId}/kiosk-key`).send({}),
      req('post', `/api/v1/support-tickets/${ticketId}/kiosk-key`).send({})
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect([a.body, b.body].filter((v) => v.code)).toHaveLength(1);
    expect(a.body.keyId).toBe(b.body.keyId);
    const key = await prisma.runAsPlatform((tx) => tx.activationKey.findUniqueOrThrow({ where: { id: a.body.keyId } }));
    expect(key.branchId).toBe(bid2);
    expect(key.allowedDeviceType).toBe('KIOSK');
    const publicThread = await req('get', '/api/v1/tenant/support-tickets/' + ticketId, owner);
    expect(JSON.stringify(publicThread.body)).not.toContain(key.code);
  });
  it('refuses a support-only administrator permission to issue keys', async () => {
    const supportEmail = 'support-' + email;
    await createTestPlatformUser(prisma, { email: supportEmail, password, role: 'SUPPORT_ADMIN' });
    const support = (await platformLogin(app, supportEmail, password)).body.accessToken;
    expect((await req('post', `/api/v1/support-tickets/${ticketId}/kiosk-key`, support).send({})).status).toBe(403);
  });
  it('limits platform handover summaries and hides devices from finance-only access',async()=>{
    const financeEmail='finance-'+email;await createTestPlatformUser(prisma,{email:financeEmail,password,role:'FINANCE_ADMIN'});
    const token=(await platformLogin(app,financeEmail,password)).body.accessToken;
    const result=await req('get',`/api/v1/restaurants/${rid}/launch?branchId=${bid}`,token);
    expect(result.status).toBe(200);expect(result.body.deliveryRestricted).toBe(true);expect(result.body.delivery).toEqual([]);
  });
  it('enforces branch allocations on channel acceptance as well as previews', async () => {
    await prisma.runAsPlatform((tx) =>
      tx.branchProductLicense.create({
        data: {
          createdBy: 'qa-workflow',
          restaurantId: rid,
          branchId: bid2,
          appCode: 'KIOSK',
          enabled: false,
          deviceQuota: null,
          disabledFeatures: [],
          effectiveAt: new Date(Date.now() - 1000),
          revision: 1
        }
      })
    );
    const res = await req('get', `/api/v1/tenant/operations/acceptance?branchId=${bid2}`, owner);
    expect(res.status).toBe(200);
    expect(res.body.channels).not.toContain('KIOSK');
    const preview = await req('get', `/api/v1/tenant/operations/launch/menu?branchId=${bid2}&channel=KIOSK`, owner);
    expect(preview.body.enabled).toBe(false);
  });
});

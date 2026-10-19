import request from 'supertest';
import { randomUUID, pbkdf2Sync, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperationsScheduler } from '../src/modules/operations/operations-scheduler.service';
import { StaffSessionService } from '../src/modules/entity-sync/staff-session.service';
import { DEFAULT_SERVICE_POLICY } from '../src/modules/operations/operations-policy';
import {OrderSyncService} from '../src/modules/order-sync/order-sync.service';
import {EntitySyncService} from '../src/modules/entity-sync/entity-sync.service';
let app: any,
  prisma: PrismaService,
  platform: string,
  rid: string,
  branch: string,
  branchB: string,
  owner: string,
  ownerId: string,
  manager: string,
  managerId: string,
  planId: string,
  posToken: string,
  posId: string,
  staffToken: string;
const stamp = Date.now(),
  email = `ops-${stamp}@example.com`,
  password = 'Operations9!QAOwner',
  dish = randomUUID(),
  category = randomUUID(),
  staffId = randomUUID();
let complaintId: string,
  complaintVersion: number,
  handoverId: string,
  approvalId: string,
  approvalVersion: number;
const http = () => request(app.getHttpServer());
const admin = (method: 'get' | 'post', path: string, token = owner, b = branch) =>
  http()
    [method](`/api/v1/tenant/operations/${path}${path.includes('?') ? '&' : '?'}branchId=${b}`)
    .set('Authorization', `Bearer ${token}`);
const p = (url: string, body: string | object | undefined) =>
  http().post(url).set('Authorization', `Bearer ${platform}`).send(body);
const device = (url: string, body: string | object | undefined) =>
  http()
    .post('/api/v1/operations/device/' + url)
    .set('Authorization', `Bearer ${posToken}`)
    .send(body);
const due = () => new Date(Date.now() + 3600000).toISOString();
beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await createTestPlatformUser(prisma, { email, password });
  platform = (await platformLogin(app, email, password)).body.accessToken;
  const plan = await p('/api/v1/plans', {
    tier: 'QR',
    name: 'TEST Operations ' + stamp,
    priceMonthly: 10000,
    maxBranches: 3,
    maxDevices: 12,
    maxUsers: 10,
    entitlements: { qrTableOrdering: true, restaurantAdmin: true },
  });
  expect(plan.status).toBe(201);
  planId = plan.body.id;
  const r = await p('/api/v1/restaurants', {
    name: 'TEST Operations ' + stamp,
    ownerName: 'Owner',
    ownerEmail: email,
    ownerPassword: password,
    skipInviteEmail: true,
  });
  expect(r.status).toBe(201);
  rid = r.body.restaurant.id;
  branch = r.body.branch.id;
  expect(
    (
      await p('/api/v1/subscriptions', {
        restaurantId: rid,
        planId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'],
      })
    ).status,
  ).toBe(201);
  branchB = (await p('/api/v1/branches', { restaurantId: rid, name: 'Second branch', code: 'OPS-B' })).body
    .id;
  const key = (
    await p('/api/v1/activation-keys', {
      restaurantId: rid,
      branchId: branch,
      allowedDeviceType: 'POS_ADMIN',
      expiresAt: due(),
    })
  ).body;
  const start = await http()
    .post('/api/v1/tenant-auth/login-owner')
    .send({ restaurantId: rid, password, deviceType: 'POS_ADMIN' });
  const login = await http()
    .post('/api/v1/tenant-auth/activate-device')
    .send({
      activationSessionToken: start.body.activationSessionToken,
      activationKey: key.code,
      deviceType: 'POS_ADMIN',
    });
  expect([200, 201], JSON.stringify(login.body)).toContain(login.status);
  owner = login.body.accessToken;
  const pk = (
    await p('/api/v1/activation-keys', {
      restaurantId: rid,
      branchId: branch,
      allowedDeviceType: 'POS',
      expiresAt: due(),
    })
  ).body;
  const activation = await http()
    .post('/api/v1/activation/redeem')
    .send({ code: pk.code, deviceType: 'POS' });
  expect(activation.status).toBe(201);
  posToken = activation.body.deviceToken;
  posId = activation.body.device.id;
  await prisma.runAsTenant(rid, async (tx) => {
    const u = await tx.user.findFirstOrThrow({ where: { restaurantId: rid, role: 'OWNER' } });
    ownerId = u.id;
    const mgr = await tx.user.create({
      data: {
        restaurantId: rid,
        branchId: branch,
        email: `manager-${email}`,
        fullName: 'Receiving manager',
        passwordHash: u.passwordHash,
        role: 'MANAGER',
        status: 'ACTIVE',
      },
    });
    managerId = mgr.id;
    for (const [entityType, externalId, payload] of [
      ['MENU_CATEGORY', category, { id: category, name: 'Practice category' }],
      [
        'MENU_ITEM',
        dish,
        {
          id: dish,
          name: 'Operations dish',
          price: 100,
          categoryId: category,
          isAvailable: true,
          taxRate: 0,
        },
      ],
      [
        'STAFF_USER',
        staffId,
        { id: staffId, fullName: 'Ops cashier', roleId: 'role-cashier', isActive: true, branchId: branch },
      ],
    ] as const)
      await tx.syncedEntity.create({ data: { restaurantId: rid, entityType, externalId, payload } });
  });
  const ml = await http()
    .post('/api/v1/tenant-auth/login')
    .send({
      restaurantId: rid,
      email: `manager-${email}`,
      password,
      deviceId: login.body.deviceId,
      deviceToken: login.body.deviceToken,
      deviceType: 'POS_ADMIN',
    });
  expect(ml.status, JSON.stringify(ml.body)).toBe(200);
  manager = ml.body.accessToken;
  staffToken = app
    .get(StaffSessionService)
    .issue('session', {
      restaurantId: rid,
      deviceId: posId,
      staffId,
      role: 'role-cashier',
      name: 'Ops cashier',
    }).token;
}, 90000);
afterAll(async () => {
  if (prisma) {
    await prisma.runAsPlatform(async (tx) => {
      if (rid) await tx.restaurant.deleteMany({ where: { id: rid } });
      if (planId) await tx.plan.deleteMany({ where: { id: planId } });
    });
    await prisma.platformUser.deleteMany({ where: { email } });
  }
  await app?.close();
});
it('denies anonymous operations access', async () =>
  expect((await http().get('/api/v1/tenant/operations/context?branchId=' + branch)).status).toBe(401));
it('enforces manager branch assignment and rejects foreign branches', async () => {
  expect((await admin('get', 'context', manager)).status).toBe(200);
  expect((await admin('get', 'context', manager, branchB)).status).toBe(403);
  expect((await admin('get', 'context', owner, randomUUID())).status).toBe(403);
});
it('requires opening evidence and a published menu', async () =>
  expect(
    (
      await admin('post', 'checklist').send({
        day: '2026-10-15',
        phase: 'OPEN',
        expectedVersion: 0,
        checks: { menu: true, devices: true, printers: true, cash: true },
        notes: '',
      })
    ).status,
  ).toBe(409));
it('shows exact draft differences and publishes the reviewed checksum', async () => {
  const review = await admin('get', 'menu-review');
  expect(review.status).toBe(200);
  expect(review.body.changes.some((c: any) => c.id === dish)).toBe(true);
  expect(
    (await admin('post', 'menu-review/publish').send({ checksum: 'stale-review-checksum' })).status,
  ).toBe(409);
  expect((await admin('post', 'menu-review/publish').send({ checksum: review.body.checksum })).status).toBe(
    201,
  );
  expect((await admin('get', 'menu-review')).body.changes).toEqual([]);
});
it('persists opening checks and rejects stale concurrent updates', async () => {
  const body = {
    day: '2026-10-15',
    phase: 'OPEN',
    expectedVersion: 0,
    checks: { menu: true, devices: true, printers: true, cash: true },
    notes: 'Checked test print',
  };
  expect((await admin('post', 'checklist').send(body)).status).toBe(201);
  expect((await admin('post', 'checklist').send(body)).status).toBe(409);
  expect((await admin('get', 'checklist?day=2026-10-15')).body.data.history).toHaveLength(1);
});
it('saves a branch service policy without changing another branch', async () => {
  const r = await admin('post', 'service').send({
    ...DEFAULT_SERVICE_POLICY,
    expectedVersion: 0,
    pausedUntil: due(),
    message: 'Kitchen break',
  });
  expect(r.status).toBe(201);
  expect((await admin('get', 'service', owner, branchB)).body.data.pausedUntil).toBeNull();
  expect(
    (await admin('post', 'service').send({ ...DEFAULT_SERVICE_POLICY, expectedVersion: 0 })).status,
  ).toBe(409);
});
it('previews selective settings copy and keeps target pause intact', async () => {
  const c = (await admin('get', 'comparison?sourceBranchId=' + branch, owner, branchB)).body;
  expect(c.fields.some((f: any) => f.field === 'pausedUntil')).toBe(false);
  const copy = await admin('post', 'comparison/copy', owner, branchB).send({
    sourceBranchId: branch,
    sourceVersion: c.sourceVersion,
    targetVersion: c.targetVersion,
    fields: ['preparationMinutes'],
  });
  expect(copy.status, JSON.stringify(copy.body)).toBe(201);
  expect((await admin('get', 'service', owner, branchB)).body.data.pausedUntil).toBeNull();
});
it('rejects manager restaurant-wide menu scheduling', async () => {
  expect(
    (
      await admin('post', 'menu-schedules', manager).send({
        title: 'Manager schedule',
        activateAt: due(),
        changes: [{ itemId: dish, price: 110 }],
      })
    ).status,
  ).toBe(403);
});
it('applies a due schedule and publishes once despite repeated worker runs', async () => {
  const r = await admin('post', 'menu-schedules').send({
    title: 'Breakfast',
    activateAt: due(),
    changes: [{ itemId: dish, price: 120 }],
  });
  expect(r.status).toBe(201);
  await prisma.runAsTenant(rid, async (tx) => {
    const row = await tx.syncedEntity.findFirstOrThrow({
      where: { restaurantId: rid, entityType: 'OPS_MENU_SCHEDULE', externalId: r.body.data.id },
    });
    await tx.syncedEntity.update({
      where: { id: row.id },
      data: {
        payload: { ...(row.payload as object), activateAt: new Date(Date.now() - 1000).toISOString() },
      },
    });
  });
  await app.get(OperationsScheduler).runDue();
  await app.get(OperationsScheduler).runDue();
  const rows = (await admin('get', 'menu-schedules')).body;
  expect(rows.find((s: any) => s.id === r.body.data.id).status).toBe('APPLIED');
  expect((await admin('get', 'menu-review')).body.version).toBe(2);
});
it('fails a schedule safely if a dish was independently edited', async () => {
  const r = await admin('post', 'menu-schedules').send({
    title: 'Festival',
    activateAt: due(),
    changes: [{ itemId: dish, price: 150 }],
  });
  expect(r.status).toBe(201);
  await prisma.runAsTenant(rid, async (tx) => {
    const item = await tx.syncedEntity.findUniqueOrThrow({
      where: {
        restaurantId_entityType_externalId: { restaurantId: rid, entityType: 'MENU_ITEM', externalId: dish },
      },
    });
    await tx.syncedEntity.update({
      where: { id: item.id },
      data: { payload: { ...(item.payload as object), price: 130 }, syncVersion: { increment: 1 } },
    });
    const row = await tx.syncedEntity.findFirstOrThrow({
      where: { restaurantId: rid, entityType: 'OPS_MENU_SCHEDULE', externalId: r.body.data.id },
    });
    await tx.syncedEntity.update({
      where: { id: row.id },
      data: {
        payload: { ...(row.payload as object), activateAt: new Date(Date.now() - 1000).toISOString() },
      },
    });
  });
  await app.get(OperationsScheduler).runDue();
  expect((await admin('get', 'menu-schedules')).body.find((s: any) => s.id === r.body.data.id).status).toBe(
    'FAILED',
  );
  expect((await admin('get', 'menu-review')).body.items.find((i: any) => i.id === dish).price).toBe(130);
});
it('creates assigned complaints, requires a resolution and denies cross-branch editing', async () => {
  const r = await admin('post', 'complaints').send({
    expectedVersion: 0,
    title: 'Follow up guest concern',
    orderId: '',
    assignedTo: managerId,
    dueAt: due(),
    status: 'OPEN',
    resolution: '',
  });
  expect(r.status).toBe(201);
  complaintId = r.body.data.id;
  complaintVersion = r.body.version;
  expect((await admin('get', 'complaints', owner, branchB)).body).toEqual([]);
  expect(
    (
      await admin('post', 'complaints').send({
        ...r.body.data,
        branchId: undefined,
        updatedAt: undefined,
        updatedBy: undefined,
        expectedVersion: r.body.version,
        status: 'RESOLVED',
        resolution: '',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await admin('post', 'complaints', owner, branchB).send({
        id: complaintId,
        expectedVersion: complaintVersion,
        title: 'Foreign update',
        orderId: '',
        assignedTo: '',
        dueAt: due(),
        status: 'OPEN',
        resolution: '',
      })
    ).status,
  ).toBe(404);
});
it('records handovers and lets only the named recipient acknowledge', async () => {
  const r = await admin('post', 'handovers').send({
    expectedVersion: 0,
    recipientId: managerId,
    notes: 'Review unpaid bills and guest follow-up',
    acknowledge: false,
  });
  expect(r.status).toBe(201);
  handoverId = r.body.data.id;
  const body = {
    id: handoverId,
    expectedVersion: r.body.version,
    recipientId: managerId,
    notes: '',
    acknowledge: true,
  };
  expect((await admin('post', 'handovers').send(body)).status).toBe(403);
  expect((await admin('post', 'handovers', manager).send(body)).status).toBe(201);
  expect(
    (await admin('post', 'handovers', manager).send({ ...body, expectedVersion: r.body.version + 1 })).status,
  ).toBe(409);
});
it('exports whitelisted support diagnostics without PINs, tokens or customer data', async () => {
  const r = await admin('get', 'diagnostics');
  expect(r.status).toBe(200);
  expect(
    r.body.devices.every((d: any) =>
      Object.keys(d).every((k) => ['id', 'type', 'health', 'pendingSyncCount', 'appVersion'].includes(k)),
    ),
  ).toBe(true);
  expect(JSON.stringify(r.body)).not.toContain(staffToken);
  expect(r.body.redaction).toContain('No credentials');
});
it('requires real paid, completed evidence for channel acceptance', async () => {
  expect(
    (
      await admin('post', 'acceptance').send({
        source: 'POS',
        orderId: 'invented',
        expectedVersion: 0,
        counter: true,
        kitchen: true,
        receipt: true,
        onlineReturn: true,
      })
    ).status,
  ).toBe(400);
});
it('shows current recipe gaps explicitly in the food margin report', async () => {
  const r = await admin('get', 'planning?days=7&buffer=10');
  expect(r.status).toBe(200);
  expect(r.body.margins.find((i: any) => i.id === dish).estimatedFoodCost).toBeNull();
});
it('creates a POS remote approval request with current staff proof', async () => {
  const r = await device('approvals', {
    action: 'HIGH_DISCOUNT',
    details: '25 percent for order test',
    fingerprint: 'exact-discount-fingerprint',
    staffToken,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  approvalId = r.body.data.id;
  approvalVersion = r.body.version;
});
it('only claims a remote decision on its original terminal, staff and action fingerprint', async () => {
  expect(
    (
      await admin('post', `approvals/${approvalId}/decision`, manager).send({
        expectedVersion: approvalVersion,
        approved: true,
        reason: 'Verified guest issue',
      })
    ).status,
  ).toBe(201);
  expect(
    (await device(`approvals/${approvalId}/claim`, { staffToken, fingerprint: 'another-fingerprint' }))
      .status,
  ).toBe(404);
  const r = await device(`approvals/${approvalId}/claim`, {
    staffToken,
    fingerprint: 'exact-discount-fingerprint',
  });
  expect(r.body).toMatchObject({ status: 'APPROVED', managerName: 'Receiving manager' });
  expect(r.body.approvalToken).toBeUndefined();
  expect(
    (await device(`approvals/${approvalId}/claim`, { staffToken, fingerprint: 'exact-discount-fingerprint' }))
      .body.status,
  ).toBe('CLAIMED');
});
it('does not turn a discount request into a general refund approval', async () => {
  expect(
    (
      await device('approvals', {
        action: 'HIGH_DISCOUNT',
        details: 'Mismatch',
        fingerprint: 'mismatch-fingerprint',
        staffToken,
        scope: {
          action: 'REFUND',
          paymentId: randomUUID(),
          amountPaise: 100,
          idempotencyKey: 'refund-retry-id',
        },
      })
    ).status,
  ).toBe(400);
});
it('rejects stale staff sessions after reassignment', async () => {
  await prisma.runAsTenant(rid, (tx) =>
    tx.syncedEntity.update({
      where: {
        restaurantId_entityType_externalId: {
          restaurantId: rid,
          entityType: 'STAFF_USER',
          externalId: staffId,
        },
      },
      data: {
        payload: { id: staffId, branchId: branchB, isActive: true, roleId: 'role-cashier' },
        syncVersion: { increment: 1 },
      },
    }),
  );
  expect(
    (
      await device('approvals', {
        action: 'HIGH_DISCOUNT',
        details: 'Stale staff',
        fingerprint: 'old-branch-request',
        staffToken,
      })
    ).status,
  ).toBe(403);
});
it('pickup capability is anonymous, redacted and revoked on rotation', async () => {
  await prisma.runAsTenant(rid, (tx) =>
    tx.syncedOrder.create({
      data: {
        restaurantId: rid,
        branchId: branch,
        externalOrderId: 'pickup-' + stamp,
        source: 'KIOSK',
        orderType: 'TAKEAWAY',
        status: 'READY',
        paymentStatus: 'SUCCESS',
        paymentMethod: 'CASH',
        items: [],
        subtotal: 10000,
        taxAmount: 0,
        totalAmount: 10000,
        meta: { tokenNumber: 'T42', customerName: 'Never expose me' },
      },
    }),
  );
  const link = (await admin('post', 'pickup-link').send({})).body;
  const get = await http().get('/api/v1/pickup-display/' + link.token);
  expect(get.status).toBe(200);
  expect(get.body.orders).toContainEqual(expect.objectContaining({ token: 'T42', status: 'READY' }));
  expect(JSON.stringify(get.body)).not.toContain('Never expose me');
  await admin('post', 'pickup-link').send({});
  expect((await http().get('/api/v1/pickup-display/' + link.token)).status).toBe(404);
});
it('keeps cash and online channel acceptance as separate records',async()=>{
 for(const method of ['CASH','UPI'])await prisma.runAsTenant(rid,tx=>tx.syncedOrder.create({data:{restaurantId:rid,branchId:branch,externalOrderId:'accept-'+method+'-'+stamp,source:'POS',orderType:'TAKEAWAY',status:'COMPLETED',paymentStatus:'SUCCESS',paymentMethod:method,items:[],subtotal:10000,taxAmount:0,totalAmount:10000,createdAt:new Date()}}));
 for(const method of ['CASH','UPI']){const r=await admin('post','acceptance').send({source:'POS',orderId:'accept-'+method+'-'+stamp,expectedVersion:0,counter:true,kitchen:true,receipt:true,onlineReturn:method==='UPI'});expect(r.status,JSON.stringify(r.body)).toBe(201);}
 const records=(await admin('get','acceptance')).body.records;expect(records.filter((r:any)=>r.source==='POS'&&r.current)).toHaveLength(2);expect(records.map((r:any)=>r.onlinePayment).sort()).toEqual([false,true]);
});
it('QR-only licensing retains shared operations and denies POS costing',async()=>{
 const licensed=await prisma.runAsTenant(rid,tx=>tx.applicationEntitlement.findMany({where:{subscription:{restaurantId:rid},enabled:true,appCode:{not:'QR_ORDERING'}},select:{id:true}}));
 try{await prisma.runAsTenant(rid,tx=>tx.applicationEntitlement.updateMany({where:{id:{in:licensed.map(r=>r.id)}},data:{enabled:false}}));expect((await admin('get','context')).status).toBe(200);expect((await admin('get','planning')).status).toBe(403);expect((await admin('get','acceptance')).body.channels).toEqual(['QR']);}
 finally{await prisma.runAsTenant(rid,tx=>tx.applicationEntitlement.updateMany({where:{id:{in:licensed.map(r=>r.id)}},data:{enabled:true}}));}
});
it('blocks new kiosk orders while paused but allows an already admitted order to progress',async()=>{
 const key=await p('/api/v1/activation-keys',{restaurantId:rid,branchId:branch,allowedDeviceType:'KIOSK',expiresAt:due()});const redeemed=await http().post('/api/v1/activation/redeem').send({code:key.body.code,deviceType:'KIOSK'});expect(redeemed.status).toBe(201);
 const kiosk=await prisma.runAsTenant(rid,tx=>tx.device.findUniqueOrThrow({where:{id:redeemed.body.device.id}}));
 const event={updatedAt:new Date().toISOString(),eventId:randomUUID(),externalOrderId:'paused-kiosk-'+stamp,status:'CONFIRMED',orderType:'TAKEAWAY',items:[{externalItemId:'line-1',menuItemId:dish,name:'Test dish',quantity:1,unitPrice:10000,lineTotal:10000,kitchenStatus:'PENDING',modifiers:[]}],subtotal:10000,taxAmount:0,discountAmount:0,totalAmount:10000,paymentStatus:'PENDING',paymentMethod:'CASH_AT_COUNTER',meta:{tokenNumber:'QA-PAUSE'}};
 const refused=await app.get(OrderSyncService).pushEvents(kiosk,[event]);expect(refused.results[0].status).toBe('error');expect(refused.results[0].error).toContain('Kitchen break');
 await prisma.runAsTenant(rid,tx=>tx.syncedOrder.create({data:{restaurantId:rid,branchId:branch,deviceId:kiosk.id,externalOrderId:event.externalOrderId,source:'KIOSK',orderType:'TAKEAWAY',status:'CONFIRMED',paymentStatus:'PENDING',paymentMethod:'CASH_AT_COUNTER',subtotal:10000,taxAmount:0,totalAmount:10000,items:event.items}}));
 const update=await app.get(OrderSyncService).pushEvents(kiosk,[{...event,eventId:randomUUID(),status:'READY',items:event.items.map(i=>({...i,kitchenStatus:'READY'}))}]);expect(update.results[0].status).toBe('ok');
});
it('refuses a scheduled change from a stale menu preview',async()=>{expect((await admin('post','menu-schedules').send({title:'Stale preview',activateAt:due(),reviewedChecksum:'outdated-preview-checksum',changes:[{itemId:dish,price:160}]})).status).toBe(409);});
it('revokes the old branch staff cache without leaking the new branch profile',async()=>{
 const id=randomUUID();await prisma.runAsTenant(rid,tx=>tx.syncedEntity.create({data:{restaurantId:rid,entityType:'STAFF_USER',externalId:id,payload:{id,branchId:branch,fullName:'Moved private profile',pinHash:'pinv2:privatehash',roleId:'role-cashier',isActive:true}}}));
 const input={kind:'STAFF',id,targetBranchId:branchB};const preview=await admin('post','transfers/preview').send(input);expect(preview.status).toBe(201);expect((await admin('post','transfers').send({...input,expectedVersion:preview.body.version,acknowledge:true})).status).toBe(201);
 const old=await http().get('/api/v1/entity-sync/STAFF_USER').set('Authorization','Bearer '+posToken);expect(old.status).toBe(200);const removed=old.body.entities.find((r:any)=>r.externalId===id);expect(removed.payload).toMatchObject({id,branchId:branch,removedFromBranch:true});expect(removed.payload.pinHash).toBeUndefined();expect(removed.payload.fullName).toBeUndefined();
 const target=await app.get(EntitySyncService).catchUpForRestaurant(rid,'STAFF_USER',undefined,branchB,'POS');expect(target.entities.find((r:any)=>r.externalId===id)?.payload).toMatchObject({id,branchId:branchB,fullName:'Moved private profile'});
 const stale=await app.get(EntitySyncService).pushEventsForRestaurant(rid,'STAFF_USER',[{externalId:id,payload:{id,branchId:branch,isActive:true,fullName:'Reverted',roleId:'role-cashier',pinHash:'pinv2:privatehash',updatedAt:new Date(Date.now()+60000).toISOString()}}],posId,branch,'POS_ADMIN');expect(stale.results[0].status).toBe('error');expect(stale.results[0].error).toContain('BRANCH_FORBIDDEN');
});
it('issues only an exact scoped refund token for remote refund approval',async()=>{
 const staff=randomUUID();await prisma.runAsTenant(rid,tx=>tx.syncedEntity.create({data:{restaurantId:rid,entityType:'STAFF_USER',externalId:staff,payload:{id:staff,branchId:branch,roleId:'role-cashier',isActive:true}}}));
 const session=app.get(StaffSessionService).issue('session',{restaurantId:rid,deviceId:posId,staffId:staff,role:'role-cashier',name:'Refund cashier'}).token;
 const payment=await prisma.runAsTenant(rid,async tx=>{const order=await tx.order.create({data:{restaurantId:rid,branchId:branch,kioskId:posId,externalOrderId:'refund-'+stamp,source:'KIOSK',status:'PAID',items:[],subtotal:10000,taxAmount:0,totalAmount:10000}});return tx.paymentTransaction.create({data:{restaurantId:rid,orderId:order.id,providerOrderId:'qa-refund-'+stamp,amount:10000,status:'SUCCESS',method:'UPI'}});});
 const scope={action:'REFUND',paymentId:payment.id,amountPaise:2500,idempotencyKey:'specific-refund-'+stamp};
 const r=await device('approvals',{action:'REFUND',details:'Refund only 25 rupees',fingerprint:'refund-fingerprint',staffToken:session,scope});expect(r.status).toBe(201);
 expect((await admin('post',`approvals/${r.body.data.id}/decision`,manager).send({expectedVersion:r.body.version,approved:true,reason:'Verified refundable amount'})).status).toBe(201);
 const claim=await device(`approvals/${r.body.data.id}/claim`,{staffToken:session,fingerprint:'refund-fingerprint'});expect(claim.status).toBe(201);const claims=app.get(StaffSessionService).verify(claim.body.approvalToken,rid,posId,'approval');expect(claims?.scope).toEqual(scope);expect(Date.parse(claim.body.approvalExpiresAt)-Date.now()).toBeLessThanOrEqual(120000);
});
it('denies manager device transfers and blocks an offline original terminal',async()=>{
 const input={kind:'DEVICE',id:posId,targetBranchId:branchB};expect((await admin('post','transfers/preview',manager).send(input)).status).toBe(403);
 await prisma.runAsTenant(rid,tx=>tx.device.update({where:{id:posId},data:{lastSeenAt:new Date('2020-01-01')}}));expect((await admin('post','transfers/preview').send(input)).body.blocking).toBe(true);expect((await admin('post','transfers').send({...input,acknowledge:true})).status).toBe(409);
});
it('replaces a synced terminal without revoking the old identity before redemption',async()=>{
 await prisma.runAsTenant(rid,tx=>tx.device.update({where:{id:posId},data:{lastSeenAt:new Date(),pendingSyncCount:0}}));const input={kind:'DEVICE',id:posId,targetBranchId:branchB};
 const preview=await admin('post','transfers/preview').send(input);expect(preview.body.blocking).toBe(false);const transfer=await admin('post','transfers').send({...input,acknowledge:true});expect(transfer.status,JSON.stringify(transfer.body)).toBe(201);
 expect((await prisma.runAsTenant(rid,tx=>tx.device.findUniqueOrThrow({where:{id:posId}}))).status).toBe('ACTIVE');
 const redeemed=await http().post('/api/v1/activation/redeem').send({code:transfer.body.activationKey,deviceType:'POS'});expect(redeemed.status,JSON.stringify(redeemed.body)).toBe(201);expect(redeemed.body.device.branchId).toBe(branchB);expect((await prisma.runAsTenant(rid,tx=>tx.device.findUniqueOrThrow({where:{id:posId}}))).status).toBe('REVOKED');
});

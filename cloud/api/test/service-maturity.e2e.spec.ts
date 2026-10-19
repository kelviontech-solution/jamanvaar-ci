import { ApplicationEntitlementsService } from '../src/modules/application-entitlements/application-entitlements.service';
import { RecurringMenuService } from '../src/modules/operations/recurring-menu.service';
import { ThaliRefillsService } from '../src/modules/operations/thali-refills.service';
import {QrSettingsService} from '../src/modules/qr/qr-settings.service';
import {InventoryLedgerService} from '../src/modules/inventory-ledger/inventory-ledger.service';
import {snapshotOrderLines} from '../src/modules/order-sync/order-snapshots';
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
  email = `maturity-${stamp}@example.com`,
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

const branchApi=(method:'get'|'post',path='',b=branch)=>http()[method](`/api/v1/branches/${b}/licenses${path}`).set('Authorization',`Bearer ${platform}`);
let savedMenuVersion=0,recurringId='',policyVersion=0,costOrder='';
const allocation=(revision=0)=>({appCode:'KDS',enabled:false,deviceQuota:null,disabledFeatures:[],effectiveAt:new Date(Date.now()+120000).toISOString(),expiresAt:null,expectedRevision:revision});
it('requires platform authentication for branch allocation',async()=>expect((await http().get(`/api/v1/branches/${branch}/licenses`)).status).toBe(401));
it('lists inherited branch products and refuses allocation without reviewed impact',async()=>{
 const list=await branchApi('get');expect(list.status,JSON.stringify(list.body)).toBe(200);expect(list.body.apps.find((a:any)=>a.appCode==='KDS').enabled).toBe(true);
 const body=allocation();expect((await branchApi('post').send(body)).status).toBe(409);
});
it('rejects unpurchased products and foreign feature flags',async()=>{
 expect((await branchApi('post','/preview').send({...allocation(),appCode:'WHATSAPP_ORDERING',enabled:true})).status).toBe(400);
 expect((await branchApi('post','/preview').send({...allocation(),disabledFeatures:['qrLoyalty']})).status).toBe(400);
});
it('schedules a branch restriction and leaves the other branch inherited',async()=>{
 const body=allocation(),preview=await branchApi('post','/preview').send(body);expect(preview.status,JSON.stringify(preview.body)).toBe(201);
 const saved=await branchApi('post').send({...body,previewHash:preview.body.previewHash,acknowledgeImpact:true});expect(saved.status,JSON.stringify(saved.body)).toBe(201);
 const resolve=(b:string)=>prisma.runAsTenant(rid,tx=>(app.get(ApplicationEntitlementsService) as ApplicationEntitlementsService).resolve(tx,rid,'KDS',b));
 expect((await resolve(branch)).enabled).toBe(true);
 await prisma.runAsPlatform(tx=>tx.branchProductLicense.update({where:{id:saved.body.id},data:{effectiveAt:new Date(Date.now()-1000)}}));
 expect((await resolve(branch)).enabled).toBe(false);expect((await resolve(branchB)).enabled).toBe(true);
 expect((await branchApi('post',`/${saved.body.id}/cancel`).send({})).status).toBe(409);
});
it('preserves optimistic revisions and permits cancelling only future changes',async()=>{
 expect((await branchApi('post','/preview').send(allocation())).status).toBe(409);
 const body={...allocation(1),enabled:true},preview=await branchApi('post','/preview').send(body),saved=await branchApi('post').send({...body,previewHash:preview.body.previewHash,acknowledgeImpact:true});expect(saved.status).toBe(201);
 expect((await branchApi('post',`/${saved.body.id}/cancel`).send({})).status).toBe(201);
});
it('does not let a tenant owner change platform branch products',async()=>expect((await http().post(`/api/v1/branches/${branch}/licenses/preview`).set('Authorization',`Bearer ${owner}`).send(allocation(2))).status).toBe(401));
it('serves scoped recovery, exception and daily brief views',async()=>{
 for(const path of ['recovery','payment-exceptions','daily-brief','wait-estimate']){const result=await admin('get',path);expect(result.status,`${path}: ${JSON.stringify(result.body)}`).toBe(200);}
 expect((await admin('get','daily-brief',manager,branchB)).status).toBe(403);
 expect((await admin('post','payment-exceptions/not-a-payment/check').send({})).status).toBe(404);
});
it('stores cashier settings with a version and does not leak them across branches',async()=>{
 const body={expectedVersion:0,favoriteItemIds:[dish],quickAmounts:[200,500],paymentMethods:['CARD'],barcodeAliases:{'123456':dish}};
 expect((await admin('post','cashier-settings').send(body)).status).toBe(201);
 expect((await admin('post','cashier-settings').send(body)).status).toBe(409);
 expect((await admin('get','cashier-settings',owner,branchB)).body.data).toBeNull();
 const r=await http().get('/api/v1/operations/device/cashier-settings').set('Authorization',`Bearer ${posToken}`);expect(r.status).toBe(200);expect(r.body.data.paymentMethods).toEqual(['CARD']);
 expect((await admin('post','cashier-settings').send({...body,expectedVersion:1,paymentMethods:[]})).status).toBe(400);
});
it('publishes allergens and freezes historical ingredient costs on canonical orders',async()=>{
 await prisma.runAsTenant(rid,async tx=>{
  const where={restaurantId_entityType_externalId:{restaurantId:rid,entityType:'MENU_ITEM',externalId:dish}},old=await tx.syncedEntity.findUniqueOrThrow({where});await tx.syncedEntity.update({where,data:{payload:{...(old.payload as object),allergens:['milk','peanut']},syncVersion:{increment:1}}});
  await tx.syncedEntity.create({data:{restaurantId:rid,entityType:'INVENTORY_ITEM',externalId:'maturity-ingredient',payload:{name:'Milk',costPerUnit:20,unit:'L'}}});
  await tx.syncedEntity.create({data:{restaurantId:rid,entityType:'RECIPE',externalId:'maturity-recipe',payload:{menuItemId:dish,isActive:true,ingredients:[{inventoryItemId:'maturity-ingredient',quantityPerPortion:0.5,unit:'L'}]}}});
 });
 const review=await admin('get','menu-review'),published=await admin('post','menu-review/publish').send({checksum:review.body.checksum});expect(published.status).toBe(201);savedMenuVersion=published.body.version;
 const snap=await prisma.runAsTenant(rid,tx=>tx.menuSnapshot.findFirstOrThrow({where:{restaurantId:rid},orderBy:{version:'desc'}}));expect((snap.content as any).items.find((i:any)=>i.id===dish).allergens).toEqual(['milk','peanut']);
 costOrder=randomUUID();const engine=app.get(OrderSyncService);await engine.ingestServerOrder({restaurantId:rid,branchId:branch,externalOrderId:costOrder,source:'POS',orderType:'DINE_IN',status:'NEW',tableLabel:'T1',items:[{externalItemId:'cost-line',menuItemId:dish,name:'Dish',quantity:2,unitPrice:10000,lineTotal:20000,kitchenStatus:'PENDING',specialInstructions:'Guest allergy: sesame'}],subtotal:20000,taxAmount:0,discountAmount:0,totalAmount:20000,paymentStatus:'SUCCESS',paymentMethod:'CASH',meta:{}});
 const order=await prisma.runAsTenant(rid,tx=>tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId:rid,externalOrderId:costOrder}}}));const line=(order.items as any)[0];expect(line.foodCostSnapshot.unitCostPaise).toBe(1000);expect(line.specialInstructions).toContain('Guest allergy: sesame');expect(line.specialInstructions).toContain('Declared allergens: milk, peanut');
 await prisma.runAsTenant(rid,tx=>tx.syncedEntity.update({where:{restaurantId_entityType_externalId:{restaurantId:rid,entityType:'INVENTORY_ITEM',externalId:'maturity-ingredient'}},data:{payload:{costPerUnit:100,unit:'L'}}}));
 const report=await admin('get','historical-costs');expect(report.status).toBe(200);expect(report.body.days.reduce((n:number,d:any)=>n+d.estimatedFoodCostPaise,0)).toBe(2000);
});
it('requires reviewed current menu and owner access for recurring windows',async()=>{
 const review=(await admin('get','menu-review')).body;
 const body={title:'Lunch',days:[0,1,2,3,4,5,6],open:'10:00',close:'14:00',skipDates:['2026-10-16'],changes:[{itemId:dish,price:75}],reviewedChecksum:review.checksum};
 expect((await admin('post','recurring-menus',manager).send(body)).status).toBe(403);
 expect((await admin('post','recurring-menus').send({...body,reviewedChecksum:'outdated-review-hash'})).status).toBe(409);
 const result=await admin('post','recurring-menus').send(body);expect(result.status,JSON.stringify(result.body)).toBe(201);recurringId=result.body.id;
 expect((await admin('post','recurring-menus').send({...body,title:'Overlapping'})).status).toBe(409);
});
it('activates recurring branch prices, restores normal pricing and honors holidays',async()=>{
 const scheduler=app.get(RecurringMenuService);await scheduler.runDue(new Date('2026-10-15T05:00:00Z'));
 const read=()=>prisma.runAsTenant(rid,tx=>tx.syncedEntity.findUniqueOrThrow({where:{restaurantId_entityType_externalId:{restaurantId:rid,entityType:'BRANCH_MENU_OVERRIDE',externalId:`${branch}:${dish}`}}}));expect((await read()).payload).toMatchObject({price:75});
 await scheduler.runDue(new Date('2026-10-15T10:00:00Z'));expect((await read()).payload).not.toHaveProperty('price');
 await scheduler.runDue(new Date('2026-10-16T05:00:00Z'));expect((await read()).payload).not.toHaveProperty('price');
});
it('requires a preview for rollback and rejects stale or unauthorized restores',async()=>{
 const input={kind:'MENU',version:String(savedMenuVersion),fields:['price']};
 const preview=await admin('post','rollback/preview').send(input);expect(preview.status).toBe(201);expect(preview.body.scope).toContain('historical orders');
 expect((await admin('post','rollback/apply').send({...input,previewHash:'0'.repeat(64),acknowledge:true})).status).toBe(409);
 expect((await admin('post','rollback/preview',manager).send(input)).status).toBe(403);
});
it('validates refill configuration and requires signed Captain access',async()=>{
 const body={expectedVersion:0,mealItemId:dish,includedItemIds:[dish],maxRefillsPerOrder:3};
 expect((await admin('post','refill-policy').send(body)).status).toBe(201);
 expect((await admin('post','refill-policy').send(body)).status).toBe(409);
 expect((await http().post('/api/v1/operations/device/refills').set('Authorization',`Bearer ${posToken}`).send({orderId:costOrder,itemId:dish,quantity:1,idempotencyKey:randomUUID(),staffToken})).status).toBe(403);
});
it('records one included refill under retries, routes the station and preserves bill totals',async()=>{
 const key=(await p('/api/v1/activation-keys',{restaurantId:rid,branchId:branch,allowedDeviceType:'CAPTAIN',expiresAt:due()})).body;
 const activated=await http().post('/api/v1/activation/redeem').send({code:key.code,deviceType:'CAPTAIN'});expect(activated.status).toBe(201);
 const captainStaff=randomUUID();await prisma.runAsTenant(rid,tx=>tx.syncedEntity.create({data:{restaurantId:rid,entityType:'STAFF_USER',externalId:captainStaff,payload:{id:captainStaff,fullName:'Refill captain',branchId:branch,roleId:'role-captain',isActive:true}}}));
 const proof=app.get(StaffSessionService).issue('session',{restaurantId:rid,deviceId:activated.body.device.id,staffId:captainStaff,role:'role-captain',name:'Refill captain'}).token;
 const body={orderId:costOrder,itemId:dish,quantity:1,idempotencyKey:randomUUID(),staffToken:proof},post=()=>http().post('/api/v1/operations/device/refills').set('Authorization',`Bearer ${activated.body.deviceToken}`).send(body);
 const [one,two]=await Promise.all([post(),post()]);expect(one.status,JSON.stringify(one.body)).toBe(201);expect(two.status,JSON.stringify(two.body)).toBe(201);expect([one.body.duplicate,two.body.duplicate].sort()).toEqual([false,true]);
 const order=await prisma.runAsTenant(rid,tx=>tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId:rid,externalOrderId:costOrder}}}));expect(order.totalAmount).toBe(20000);expect(order.items as any[]).toHaveLength(2);expect((order.items as any[])[1]).toMatchObject({unitPrice:0,kitchenStation:'Main Kitchen',kitchenStatus:'PENDING'});
 expect((await http().post('/api/v1/operations/device/refills').set('Authorization',`Bearer ${activated.body.deviceToken}`).send({...body,quantity:4,idempotencyKey:randomUUID()})).status).toBe(409);
});
it('enforces a branch quota without reducing another branch allowance',async()=>{
 const body={...allocation(),appCode:'POS',enabled:true,deviceQuota:1,effectiveAt:new Date().toISOString()},preview=await branchApi('post','/preview').send(body),saved=await branchApi('post').send({...body,previewHash:preview.body.previewHash,acknowledgeImpact:true});expect(saved.status).toBe(201);
 await expect(prisma.runAsTenant(rid,tx=>app.get(ApplicationEntitlementsService).assertDeviceQuotaAvailable(tx,rid,'POS',branch))).rejects.toThrow('branch allows 1');
 await expect(prisma.runAsTenant(rid,tx=>app.get(ApplicationEntitlementsService).assertDeviceQuotaAvailable(tx,rid,'POS',branchB))).resolves.toBeUndefined();
});
let exceptionPayment='',exceptionKey='';
it('shows unresolved attempts, refunds, duplicate warnings and inconsistent ledgers without hiding the inbox',async()=>{
 await prisma.runAsTenant(rid,async tx=>{
  const bookkeeping=await tx.order.create({data:{restaurantId:rid,branchId:branch,externalOrderId:'payment-case-'+stamp,source:'QR',items:[],subtotal:10000,taxAmount:0,totalAmount:10000,status:'PAID'}});
  const one=await tx.paymentTransaction.create({data:{restaurantId:rid,orderId:bookkeeping.id,provider:'RAZORPAY',providerOrderId:'case-a-'+stamp,amount:10000,status:'SUCCESS',createdAt:new Date(Date.now()-180000)}});exceptionPayment=one.id;exceptionKey='fulfil:'+one.id;
  const second=await tx.paymentTransaction.create({data:{restaurantId:rid,orderId:bookkeeping.id,provider:'RAZORPAY',providerOrderId:'case-b-'+stamp,amount:10000,status:'REFUNDED',createdAt:new Date(Date.now()-180000)}});
  await tx.refund.create({data:{restaurantId:rid,paymentId:second.id,amount:10000,status:'SUCCESS'}});
  await tx.paymentTransaction.create({data:{restaurantId:rid,orderId:bookkeeping.id,provider:'RAZORPAY',providerOrderId:'case-pending-'+stamp,amount:10000,status:'PENDING',createdAt:new Date(Date.now()-180000)}});
  const order=await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branch,externalOrderId:bookkeeping.externalOrderId,source:'QR',orderType:'DINE_IN',status:'NEW',items:[],subtotal:10000,taxAmount:0,totalAmount:10000,paymentStatus:'SUCCESS'}});
  await tx.orderPaymentEntry.create({data:{restaurantId:rid,branchId:branch,orderId:order.id,kind:'COLLECTION',amount:11000,method:'CASH',reference:'case-corrupt-'+stamp}});
 });
 const inbox=await admin('get','payment-exceptions');expect(inbox.status,JSON.stringify(inbox.body)).toBe(200);expect(inbox.body.cases.map((i:any)=>i.kind)).toEqual(expect.arrayContaining(['PAID_UNFULFILLED','PAYMENT_PENDING','SETTLEMENT_DIFFERENCE']));expect(inbox.body.cases.map((i:any)=>i.kind)).not.toContain('POSSIBLE_DUPLICATE');
 expect((await admin('get','payment-exceptions',owner,branchB)).body.cases).toEqual([]);
});
it('assigns a real payment exception with stale-write protection and checks its original payment',async()=>{
 const body={id:exceptionKey,assignedTo:managerId,notes:'Review original transaction',expectedVersion:0};
 expect((await admin('post','payment-exceptions/assign').send(body)).status).toBe(201);
 expect((await admin('post','payment-exceptions/assign').send(body)).status).toBe(409);
 expect((await admin('post','payment-exceptions/assign').send({...body,id:'unknown'})).status).toBe(404);
 expect((await admin('post',`payment-exceptions/${exceptionPayment}/check`).send({})).body.status).toBe('SUCCESS');
 expect((await admin('post',`payment-exceptions/${exceptionPayment}/check`,owner,branchB).send({})).status).toBe(404);
});
it('recovers confirmed QR delivery on the original draft without duplicating an order or payment',async()=>{
 const reference='recover-qr-'+stamp;
 const payment=await prisma.runAsTenant(rid,async tx=>{
  const order=await tx.order.create({data:{restaurantId:rid,branchId:branch,externalOrderId:reference,source:'QR',items:[],subtotal:10000,taxAmount:0,totalAmount:10000,status:'PAID'}});
  await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branch,externalOrderId:reference,source:'QR',orderType:'DINE_IN',status:'DRAFT',items:[],subtotal:10000,taxAmount:0,totalAmount:10000,paymentStatus:'PENDING',meta:{qrAutoAccept:true}}});
  return tx.paymentTransaction.create({data:{restaurantId:rid,orderId:order.id,provider:'RAZORPAY',providerOrderId:'recover-'+stamp,amount:10000,status:'SUCCESS'}});
 });
 expect((await admin('post',`payment-exceptions/${payment.id}/recover`,owner,branchB).send({})).status).toBe(404);
 for(let n=0;n<2;n++)expect((await admin('post',`payment-exceptions/${payment.id}/recover`).send({})).status).toBe(201);
 await prisma.runAsTenant(rid,async tx=>{
  expect(await tx.syncedOrder.count({where:{restaurantId:rid,externalOrderId:reference}})).toBe(1);
  const order=await tx.syncedOrder.findFirstOrThrow({where:{restaurantId:rid,externalOrderId:reference}});expect(order.status).toBe('PREPARING');expect(order.paymentStatus).toBe('SUCCESS');
  expect((await tx.paymentTransaction.findUniqueOrThrow({where:{id:payment.id}})).fulfilledAt).not.toBeNull();
  expect(await tx.paymentTransaction.count({where:{orderId:payment.orderId}})).toBe(1);
 });
});
it('restores selected menu fields with an audit without rewriting historical orders',async()=>{
 await prisma.runAsTenant(rid,async tx=>{const where={restaurantId_entityType_externalId:{restaurantId:rid,entityType:'MENU_ITEM',externalId:dish}},old=await tx.syncedEntity.findUniqueOrThrow({where});await tx.syncedEntity.update({where,data:{payload:{...(old.payload as object),price:130},syncVersion:{increment:1}}});});
 const input={kind:'MENU',version:String(savedMenuVersion),fields:['price']},preview=await admin('post','rollback/preview').send(input);expect(preview.body.changes[0].fields).toContainEqual({field:'price',from:130,to:100});
 const applied=await admin('post','rollback/apply').send({...input,previewHash:preview.body.previewHash,acknowledge:true});expect(applied.status,JSON.stringify(applied.body)).toBe(201);
 const stored=await prisma.runAsTenant(rid,tx=>tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId:rid,externalOrderId:costOrder}}}));expect(stored.totalAmount).toBe(20000);expect((stored.items as any[])[0].unitPrice).toBe(10000);
 expect(await prisma.runAsPlatform(tx=>tx.auditLog.count({where:{restaurantId:rid,action:'CONFIGURATION_ROLLBACK_REVIEWED'}}))).toBeGreaterThan(0);
});
it('versions QR appearance and restores text through the reviewed rollback',async()=>{
 const settings=app.get(QrSettingsService);await settings.updateBranding(rid,{id:ownerId,type:'TENANT'},{welcomeTitle:'Original greeting'});await settings.updateBranding(rid,{id:ownerId,type:'TENANT'},{welcomeTitle:'New greeting'});
 const versions=(await admin('get','rollback/versions')).body,old=versions.appearances.find((r:any)=>r.target==='QR'&&r.presentation.base.welcomeTitle==='Original greeting');expect(old).toBeTruthy();
 const input={kind:'APPEARANCE',version:old.id,fields:['text']},preview=await admin('post','rollback/preview').send(input);expect(preview.status).toBe(201);
 expect((await admin('post','rollback/apply').send({...input,previewHash:preview.body.previewHash,acknowledge:true})).status).toBe(201);
 expect((await settings.branding(rid)).welcomeTitle).toBe('Original greeting');
});
it('freezes waste cost and prevents a duplicate movement from changing its historical valuation',async()=>{
 const device=await prisma.runAsTenant(rid,tx=>tx.device.findUniqueOrThrow({where:{id:posId}})),movementId=randomUUID(),service=app.get(InventoryLedgerService),input={movementId,itemId:'maturity-ingredient',itemName:'Milk',type:'WASTE',quantityDelta:-2,unit:'L',reason:'Recorded spoilage',occurredAt:new Date().toISOString()};
 const first=await service.push(device,[input]);expect(first.results[0].status).toBe('ok');
 await prisma.runAsTenant(rid,tx=>tx.syncedEntity.update({where:{restaurantId_entityType_externalId:{restaurantId:rid,entityType:'INVENTORY_ITEM',externalId:'maturity-ingredient'}},data:{payload:{costPerUnit:150,unit:'L'}}}));
 expect((await service.push(device,[input])).results[0].duplicate).toBe(true);
 const stored=await prisma.runAsTenant(rid,tx=>tx.inventoryMovement.findFirstOrThrow({where:{restaurantId:rid,movementId}}));expect(stored.unitCostPaise).toBe(10000);
 const costs=await admin('get','historical-costs');expect(costs.status).toBe(200);expect(costs.body.days.reduce((n:number,r:any)=>n+r.wasteCostPaise,0)).toBe(20000);
});
it('does not let a resync replace frozen costs or use unpublished allergen changes for a QR menu version',async()=>{
 await prisma.runAsTenant(rid,async tx=>{
  const order=await tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId:rid,externalOrderId:costOrder}}}),line=(order.items as any[])[0];
  const resynced=await snapshotOrderLines(tx,rid,[{...line,foodCostSnapshot:{unitCostPaise:1},declaredAllergens:[]}],order.items);
  expect(resynced[0].foodCostSnapshot.unitCostPaise).toBe(1000);expect(resynced[0].declaredAllergens).toEqual(['milk','peanut']);
  const where={restaurantId_entityType_externalId:{restaurantId:rid,entityType:'MENU_ITEM',externalId:dish}},current=await tx.syncedEntity.findUniqueOrThrow({where});await tx.syncedEntity.update({where,data:{payload:{...(current.payload as object),allergens:['egg']},syncVersion:{increment:1}}});
  const fresh=await snapshotOrderLines(tx,rid,[{externalItemId:'new-published-line',menuItemId:dish,quantity:1}],[],savedMenuVersion);expect(fresh[0].declaredAllergens).toEqual(['milk','peanut']);
 });
});
it('expires a branch license without falling back to an older grant and limits feature flags to that branch',async()=>{
 await prisma.runAsTenant(rid,async tx=>{
  const ent=await tx.applicationEntitlement.findFirstOrThrow({where:{restaurantId:rid,appCode:'QR_ORDERING',enabled:true}});await tx.applicationEntitlement.update({where:{id:ent.id},data:{config:{qrLoyalty:true}}});
  await tx.branchProductLicense.create({data:{restaurantId:rid,branchId:branch,appCode:'QR_ORDERING',enabled:true,revision:1,disabledFeatures:['qrLoyalty'],effectiveAt:new Date(Date.now()-2000),createdBy:ownerId}});
 });
 const service=app.get(ApplicationEntitlementsService) as ApplicationEntitlementsService;expect((await prisma.runAsTenant(rid,tx=>service.resolve(tx,rid,'QR_ORDERING',branch))).limits.qrLoyalty).toBe(false);expect((await prisma.runAsTenant(rid,tx=>service.resolve(tx,rid,'QR_ORDERING',branchB))).limits.qrLoyalty).toBe(true);
 await prisma.runAsTenant(rid,tx=>tx.branchProductLicense.create({data:{restaurantId:rid,branchId:branch,appCode:'QR_ORDERING',enabled:true,revision:2,disabledFeatures:[],effectiveAt:new Date(Date.now()-1000),expiresAt:new Date(Date.now()-500),createdBy:ownerId}}));
 expect((await prisma.runAsTenant(rid,tx=>service.resolve(tx,rid,'QR_ORDERING',branch))).enabled).toBe(false);
});

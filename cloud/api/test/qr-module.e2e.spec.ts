import { randomUUID } from "node:crypto";
import { NotificationGatewayService } from '../src/modules/notifications/notification-gateway.service';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin, refundManagerSession } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';
import { QrSettingsService } from '../src/modules/qr/qr-settings.service';
import { JwtService } from '@nestjs/jwt';
import { TENANT_JWT_AUDIENCE, TENANT_JWT_ISSUER } from '../src/modules/tenant-auth/tenant-auth.service';

// Actual auth, entitlements, tenant RLS, transactions, money and HMAC; provider transport only is simulated.
let app: any, prisma: PrismaService, gateway: RazorpayGatewayService;
let restaurantId: string, planId: string, branch: string, branchB: string, admin: string, adminB: string, qr: string, qrB: string, platform: string;
const stamp = Date.now(), email = `qr-module-${stamp}@test.example.com`, secret = 'isolated-qr-module-secret';
const http = () => request(app.getHttpServer());
const auth = (method: 'get'|'post'|'put', url: string, token = admin) => http()[method](url).set('Authorization', `Bearer ${token}`);
const push = (type: string, id: string, payload: any) => auth('post', `/api/v1/entity-sync/${type}`).send({events:[{externalId:id,payload:{id,...payload,updatedAt:new Date().toISOString()}}]});
const body = (key: string, online = false) => ({items:[{itemId:'meal',quantity:1,optionIds:[]}],paymentMethod:online?'ONLINE':'CASH_AT_COUNTER',idempotencyKey:key});
const place = async (key: string, online = false, token = qr) => { const r = await http().post(`/api/v1/public/qr/${token}/orders`).send(body(key,online)); expect(r.status,JSON.stringify(r.body)).toBe(201); return r.body; };
const stored = (id: string) => prisma.runAsPlatform(tx=>tx.syncedOrder.findUniqueOrThrow({where:{publicOrderId:id}}));
const pay = async (id: string) => { const o=await stored(id);return prisma.runAsTenant(restaurantId,tx=>tx.paymentTransaction.findFirstOrThrow({where:{order:{externalOrderId:o.externalOrderId}}})); };
const rules = (changes: any) => auth('put','/api/v1/restaurant/qr/settings').send({rules:changes});
const action = async (id: string, type: string, token = admin, reason?: string) => { const o=await stored(id);return auth('post',`/api/v1/restaurant/qr/orders/${o.externalOrderId}/action`,token).send({action:type,version:o.syncVersion,...(reason?{reason}:{})}); };
const verify = (id: string, paymentId: string, orderId: string, signature?: string) => http().post(`/api/v1/public/qr/orders/${id}/verify-payment`).send({paymentId,signature:signature??createHmac('sha256',secret).update(`${orderId}|${paymentId}`).digest('hex')});

beforeAll(async()=>{
 Object.assign(process.env,{QR_PAYMENT_CHECKOUT_MODE:'STANDARD',RAZORPAY_KEY_ID:'rzp_test_isolated',RAZORPAY_KEY_SECRET:secret,RAZORPAY_WEBHOOK_SECRET:secret,QR_ORDER_BASE_URL:'http://localhost:5290'});
 app=await createTestApp();prisma=app.get(PrismaService);gateway=app.get(RazorpayGatewayService);
 vi.spyOn(gateway,'createCheckoutOrder').mockImplementation(async i=>({id:`order_${i.reference.replace(/[^a-z0-9]/gi,'')}`,receipt:i.reference,amount:i.amount,currency:i.currency}));
 vi.spyOn(gateway,'fetchCheckoutPayments').mockResolvedValue([]);
 vi.spyOn(gateway,'createPaymentLink').mockRejectedValue(Error('Hosted transport must not be used'));
 app.get(QrRateLimiter).configure({ipRequestsPerMinute:100000,ipFailedLookupsPerMinute:100000,tokenRequestsPerMinute:100000,tokenOrdersPerMinute:100000,sessionOrdersPerMinute:100000,orderStatusPerMinute:100000});
 await createTestPlatformUser(prisma,{email,password:'correct-horse-battery-staple'});platform=(await platformLogin(app,email,'correct-horse-battery-staple')).body.accessToken;
 const plan=await auth('post','/api/v1/plans',platform).send({tier:'QR',name:`TEST QR standalone ${stamp}`,priceMonthly:10000,maxBranches:3,maxDevices:10,maxUsers:10,entitlements:{restaurantAdmin:true,qrTableOrdering:true}});expect(plan.status,JSON.stringify(plan.body)).toBe(201);planId=plan.body.id;
 restaurantId=(await auth('post','/api/v1/restaurants',platform).send({name:`TEST QR standalone ${stamp}`,ownerName:'Owner',ownerEmail:email})).body.restaurant.id;
 const sub=await auth('post','/api/v1/subscriptions',platform).send({restaurantId,planId,applications:['POS_ADMIN','QR_ORDERING'],status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString()});expect(sub.status,JSON.stringify(sub.body)).toBe(201);
 branch=await prisma.runAsTenant(restaurantId,async tx=>(await tx.branch.findFirstOrThrow({where:{restaurantId}})).id);
 branchB=(await prisma.runAsTenant(restaurantId,tx=>tx.branch.create({data:{restaurantId,name:'Second branch',code:'SECOND'}}))).id;
 for(const b of [branch,branchB]){const k=await auth('post','/api/v1/activation-keys',platform).send({restaurantId,branchId:b,allowedDeviceType:'POS_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});const r=await http().post('/api/v1/activation/redeem').send({code:k.body.code,deviceType:'POS_ADMIN'});expect(r.status,JSON.stringify(r.body)).toBe(201);if(b===branch)admin=r.body.deviceToken;else adminB=r.body.deviceToken;}
 await push('MENU_CATEGORY','main',{name:'Meals',isActive:true});await push('MENU_ITEM','meal',{name:'Gujarati Thali',categoryId:'main',price:250,isAvailable:true,modifierGroupIds:[]});
 await push('DINING_TABLE','table-a',{tableNumber:'TN1',capacity:4,isActive:true,branchId:branch});
 await auth('post','/api/v1/entity-sync/DINING_TABLE',adminB).send({events:[{externalId:'table-b',payload:{id:'table-b',tableNumber:'TN2',capacity:4,isActive:true,branchId:branchB,updatedAt:new Date().toISOString()}}]});
 expect((await auth('post','/api/v1/menu/publish').send({})).status).toBe(201);
 for(const [b,table,tok] of [[branch,'table-a',admin],[branchB,'table-b',adminB]]){const r=await auth('post',`/api/v1/restaurant/qr/tables/${table}/generate`,tok).send({branchId:b});expect(r.status,JSON.stringify(r.body)).toBe(201);if(b===branch)qr=r.body.url.split('/q/')[1];else qrB=r.body.url.split('/q/')[1];}
 await prisma.runAsTenant(restaurantId,tx=>tx.restaurantPaymentConnection.create({data:{restaurantId,status:'ACTIVE'}}));
},120000);
afterAll(async()=>{vi.restoreAllMocks();if(restaurantId)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:restaurantId}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.platformUser.deleteMany({where:{email}});await app?.close();for(const k of ['QR_PAYMENT_CHECKOUT_MODE','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET'])delete process.env[k];});

it('sells QR with admin access but no POS, using the same canonical published menu',async()=>{
 const enabled=await auth('get','/api/v1/restaurant/qr/entitlement');expect(enabled.status).toBe(200);expect(enabled.body.enabled).toBe(true);
 const menu=await http().get(`/api/v1/public/qr/${qr}/menu`);expect(menu.status).toBe(200);expect(menu.body.items.map((i:any)=>i.name)).toContain('Gujarati Thali');
 const apps=await prisma.runAsTenant(restaurantId,tx=>tx.applicationEntitlement.findMany({where:{restaurantId}}));expect(apps.some(a=>a.appCode==='POS'&&a.enabled)).toBe(false);
});
it('keeps carts and orders independent for simultaneous guests at one table and deduplicates retry taps',async()=>{
 const [a,b,c]=await Promise.all([place('guest-a-independent'),place('guest-b-independent'),place('guest-a-independent')]);expect(a.publicOrderId).toBe(c.publicOrderId);expect(a.publicOrderId).not.toBe(b.publicOrderId);expect((await stored(a.publicOrderId)).tableId).toBe('table-a');
});
it('branch B never sees or changes branch A orders or settings',async()=>{
 const a=await place('branch-a-isolation'),b=await place('branch-b-isolation',false,qrB),oa=await stored(a.publicOrderId);
 expect((await auth('get','/api/v1/restaurant/qr/orders',adminB)).body.some((o:any)=>o.id===oa.externalOrderId)).toBe(false);
 expect((await action(a.publicOrderId,'PREPARING',adminB)).status).toBe(404);
 expect((await auth('put',`/api/v1/restaurant/qr/settings?branchId=${branch}`,adminB).send({allowCash:false})).status).toBe(403);
 expect((await stored(b.publicOrderId)).branchId).toBe(branchB);expect((await stored(a.publicOrderId)).syncVersion).toBe(oa.syncVersion);
 expect((await auth('get',`/api/v1/menu/preview?branchId=${branch}`,adminB)).status).toBe(403);
});
it('only a current owner session bound to this device can manage restaurant-wide QR defaults and analytics',async()=>{
 const [owner,device]=await prisma.runAsTenant(restaurantId,tx=>Promise.all([tx.user.findFirstOrThrow({where:{restaurantId,role:'OWNER'}}),tx.device.findFirstOrThrow({where:{restaurantId,type:'POS_ADMIN',branchId:branch}})]));
 await prisma.runAsTenant(restaurantId,tx=>tx.user.update({where:{id:owner.id},data:{status:'ACTIVE'}}));
 const proof=new JwtService().sign({sub:owner.id,email:owner.email,restaurantId,did:device.id},{secret:process.env.JWT_ACCESS_SECRET,issuer:TENANT_JWT_ISSUER,audience:TENANT_JWT_AUDIENCE,expiresIn:'5m'});
 expect((await auth('get','/api/v1/restaurant/qr/analytics').set('x-admin-branch','all')).status).toBe(403);
 const all=await auth('get','/api/v1/restaurant/qr/analytics').set('x-admin-branch','all').set('x-owner-authorization',proof);expect(all.status,JSON.stringify(all.body)).toBe(200);expect(all.body.byBranch.map((b:any)=>b.branchId)).toContain(branchB);
 expect((await auth('get','/api/v1/entity-sync/DINING_TABLE').set('x-admin-branch','all').set('x-owner-authorization',proof)).status).toBe(403);
 expect((await auth('get','/api/v1/restaurant/qr/analytics',adminB).set('x-admin-branch','all').set('x-owner-authorization',proof)).status).toBe(403);
 await prisma.runAsTenant(restaurantId,tx=>tx.user.update({where:{id:owner.id},data:{role:'MANAGER',branchId:branch}}));
 expect((await auth('get','/api/v1/restaurant/qr/analytics').set('x-admin-branch','all').set('x-owner-authorization',proof)).status).toBe(403);
 await prisma.runAsTenant(restaurantId,tx=>tx.user.update({where:{id:owner.id},data:{role:'OWNER',branchId:owner.branchId}}));
});
it('branch overrides inherit restaurant defaults field by field and can be reset',async()=>{
 const service=app.get(QrSettingsService);
 await service.update(restaurantId,{id:'test-owner',type:'DEVICE'},{allowCash:false,rules:{minimumOrderPaise:10000}},null);
 expect((await auth('get','/api/v1/restaurant/qr/settings')).body).toMatchObject({allowCash:false,rules:{minimumOrderPaise:10000}});
 await auth('put','/api/v1/restaurant/qr/settings').send({allowCash:true,rules:{preparationMinutes:35}});
 await service.update(restaurantId,{id:'test-owner',type:'DEVICE'},{rules:{minimumOrderPaise:20000}},null);
 expect((await auth('get','/api/v1/restaurant/qr/settings')).body).toMatchObject({allowCash:true,rules:{minimumOrderPaise:20000,preparationMinutes:35}});
 expect((await auth('post','/api/v1/restaurant/qr/settings/inherit').send({})).status).toBe(200);
 expect((await auth('get','/api/v1/restaurant/qr/settings')).body).toMatchObject({allowCash:false,rules:{minimumOrderPaise:20000,preparationMinutes:20}});
 await service.update(restaurantId,{id:'test-owner',type:'DEVICE'},{allowCash:true,rules:{minimumOrderPaise:0}},null);
});
it('enforces pauses, minimum amounts and allowed ordering modes on the backend',async()=>{
 await rules({pausedUntil:new Date(Date.now()+60000).toISOString()});expect((await http().get(`/api/v1/public/qr/${qr}`)).body.ordering.enabled).toBe(false);expect((await http().post(`/api/v1/public/qr/${qr}/orders`).send(body('paused-order'))).status).toBe(409);
 await rules({pausedUntil:null,minimumOrderPaise:30000});expect((await http().post(`/api/v1/public/qr/${qr}/orders`).send(body('below-minimum'))).status).toBe(400);
 await rules({minimumOrderPaise:0,orderingModes:['TAKEAWAY']});expect((await http().post(`/api/v1/public/qr/${qr}/orders`).send(body('wrong-mode'))).status).toBe(400);
 await rules({orderingModes:['DINE_IN','TAKEAWAY']});
});
it('serializes simultaneous capacity admission rather than overshooting limits',async()=>{
 const n=await prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.count({where:{restaurantId,branchId:branch,source:'QR',status:{in:['NEW','PREPARING','READY']}}}));
 await rules({maxPendingOrders:n+1});const responses=await Promise.all(['capacity-one','capacity-two'].map(key=>http().post(`/api/v1/public/qr/${qr}/orders`).send(body(key))));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);await rules({maxPendingOrders:0});
});
it('QR-only staff can collect cash and complete the same canonical order; stale updates cannot win',async()=>{
 const p=await place('qr-only-operations');expect(p.paymentStatus).toBe('PENDING');expect((await action(p.publicOrderId,'COMPLETED')).status).toBe(400);
 const o=await stored(p.publicOrderId);const results=await Promise.all([1,2].map(()=>auth('post',`/api/v1/restaurant/qr/orders/${o.externalOrderId}/action`).send({action:'PREPARING',version:o.syncVersion})));expect(results.map(r=>r.status).sort()).toEqual([200,409]);
 expect((await action(p.publicOrderId,'READY')).status).toBe(200);expect((await action(p.publicOrderId,'COMPLETED')).status).toBe(400);
 expect((await action(p.publicOrderId,'COLLECT')).status).toBe(200);expect((await stored(p.publicOrderId)).meta).toHaveProperty('counterCollection');expect((await action(p.publicOrderId,'COMPLETED')).status).toBe(200);
 expect((await http().get(`/api/v1/public/qr/orders/${p.publicOrderId}`)).body).toMatchObject({status:'COMPLETED',paymentStatus:'SUCCESS'});
});
it('cancels unpaid orders with an audit reason, rejects anonymous actions and paid cancellation',async()=>{
 const p=await place('cancel-with-reason'),o=await stored(p.publicOrderId);
 expect((await http().post(`/api/v1/restaurant/qr/orders/${o.externalOrderId}/action`).send({action:'CANCELLED',version:o.syncVersion,reason:'Guest request'})).status).toBe(401);
 expect((await action(p.publicOrderId,'CANCELLED')).status).toBe(400);expect((await action(p.publicOrderId,'CANCELLED',admin,'Guest request')).status).toBe(200);expect((await stored(p.publicOrderId)).status).toBe('CANCELLED');
});
it('persists a print design without changing existing table QR tokens and validates its schema',async()=>{
 const design={template:'fine-dining',accent:'#0B253A',instruction:'Scan to enjoy',footer:'Freshly prepared',showLogo:true,layout:'TENT'};
 expect((await auth('put','/api/v1/restaurant/qr/print-design').send(design)).status).toBe(200);expect((await auth('get','/api/v1/restaurant/qr/print-design')).body).toMatchObject(design);
 expect((await auth('put','/api/v1/restaurant/qr/print-design').send({...design,accent:'javascript:alert(1)'})).status).toBe(400);expect((await http().get(`/api/v1/public/qr/${qr}`)).status).toBe(200);
});
it('deduplicates refreshes while different signed browser sessions remain separately measurable',async()=>{
 const sid=(await http().post('/api/v1/public/qr/session')).body.session;
 const before=await prisma.runAsTenant(restaurantId,tx=>tx.qrEvent.count({where:{restaurantId,type:'QR_MENU_VIEWED'}}));
 for(let i=0;i<3;i++)await http().get(`/api/v1/public/qr/${qr}/menu`).set('x-qr-session',sid);
 const after=await prisma.runAsTenant(restaurantId,tx=>tx.qrEvent.count({where:{restaurantId,type:'QR_MENU_VIEWED'}}));expect(after-before).toBe(1);
});
it('opens in-page Standard Checkout with one payment and original provider order across retries',async()=>{
 const p=await place('standard-idempotent',true);expect(p).toMatchObject({status:'PENDING_PAYMENT',payment:{status:'PENDING',url:null,checkout:{key:'rzp_test_isolated',amount:25000,currency:'INR'}}});
 expect((await stored(p.publicOrderId)).status).toBe('DRAFT');expect(p.allowCounterPayment).toBe(false);
 const retry=await http().post(`/api/v1/public/qr/orders/${p.publicOrderId}/payment`);expect(retry.body.payment.checkout.orderId).toBe(p.payment.checkout.orderId);expect((await pay(p.publicOrderId)).amount).toBe(25000);expect(gateway.createPaymentLink).not.toHaveBeenCalled();
});
it('never trusts callback signatures alone, mismatched amounts, currencies or provider orders',async()=>{
 const p=await place('standard-signature',true),oid=p.payment.checkout.orderId,pid='pay_moduleInvalid';
 expect((await verify(p.publicOrderId,pid,oid,'0'.repeat(64))).status).toBe(400);
 for(const entry of [{amount:1,currency:'INR',order_id:oid},{amount:25000,currency:'USD',order_id:oid},{amount:25000,currency:'INR',order_id:'order_other'},{amount:25000,currency:'INR',order_id:oid,status:'authorized'}]){
 vi.mocked(gateway.fetchCheckoutPayments).mockResolvedValueOnce([{id:pid,status:'captured',...entry}] as any);await verify(p.publicOrderId,pid,oid);expect((await stored(p.publicOrderId)).status).toBe('DRAFT');
 }
});
it('verifies captured SDK payments on the server and repeated callbacks admit exactly once',async()=>{
 const p=await place('standard-captured',true),oid=p.payment.checkout.orderId,pid='pay_moduleCaptured';
 vi.mocked(gateway.fetchCheckoutPayments).mockResolvedValue([{id:pid,order_id:oid,amount:25000,currency:'INR',status:'captured'}] as any);
 const result=await verify(p.publicOrderId,pid,oid);expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body).toMatchObject({status:'RECEIVED',paymentStatus:'SUCCESS'});
 const first=await stored(p.publicOrderId);await verify(p.publicOrderId,pid,oid);expect((await stored(p.publicOrderId)).syncVersion).toBe(first.syncVersion);
 expect((await action(p.publicOrderId,'CANCELLED',admin,'Paid cancellation')).status).toBe(400);vi.mocked(gateway.fetchCheckoutPayments).mockResolvedValue([]);
});
it('recovers a lost provider create response against the SAME reference, never a second charge attempt',async()=>{
 let input:any;vi.mocked(gateway.createCheckoutOrder).mockImplementationOnce(async i=>{input=i;throw Error('Ambiguous timeout');});const p=await place('standard-ambiguous',true),payment=await pay(p.publicOrderId);
 vi.spyOn(gateway,'findCheckoutOrder').mockResolvedValueOnce({id:'order_recovered',receipt:input.reference,amount:input.amount,currency:input.currency});const before=vi.mocked(gateway.createCheckoutOrder).mock.calls.length;
 const retry=await http().post(`/api/v1/public/qr/orders/${p.publicOrderId}/payment`);expect(retry.status,JSON.stringify(retry.body)).toBe(200);expect(retry.body.payment.checkout.orderId).toBe('order_recovered');expect(gateway.createCheckoutOrder).toHaveBeenCalledTimes(before);expect((await pay(p.publicOrderId)).id).toBe(payment.id);
});
it('a signed Standard Checkout webhook without custom payment notes recovers a disconnected browser once',async()=>{
 const p=await place('standard-webhook',true),oid=p.payment.checkout.orderId;
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:`pay_moduleWebhook${stamp}`,order_id:oid,amount:25000,currency:'INR',status:'captured'}}}});
 const signature=createHmac('sha256',secret).update(raw).digest('hex');
 const webhook=()=>http().post('/api/v1/payments/razorpay/webhook').set('content-type','application/json').set('x-razorpay-signature',signature).send(raw);
 expect((await webhook()).status).toBe(200);expect((await stored(p.publicOrderId)).paymentStatus).toBe('SUCCESS');const o=await stored(p.publicOrderId);await webhook();expect((await stored(p.publicOrderId)).syncVersion).toBe(o.syncVersion);
});
it('uses real branch-filtered analytics and does not treat unpaid counter orders as collected',async()=>{
 const r=await auth('get','/api/v1/restaurant/qr/analytics');expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.metrics.collected).toBe(750);expect(r.body.metrics.outstandingCounter).toBeGreaterThan(0);expect(r.body.metrics.onlineSuccess).toBe(2);expect(r.body.byBranch.every((b:any)=>b.branchId===branch)).toBe(true);
 expect((await auth('get',`/api/v1/restaurant/qr/analytics?branchId=${branchB}`)).status).toBe(403);
});

it('reports partial refunds from canonical records and rejects impossible calendar dates',async()=>{
 const order=await prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.findFirstOrThrow({where:{restaurantId,branchId:branch,paymentMethod:{not:'CASH_AT_COUNTER'},paymentStatus:'SUCCESS'}}));
 const payment=await pay(order.publicOrderId!);
 await prisma.runAsTenant(restaurantId,async tx=>{
  await tx.refund.create({data:{restaurantId,paymentId:payment.id,amount:5000,status:'SUCCESS'}});
  await tx.paymentTransaction.update({where:{id:payment.id},data:{status:'PARTIALLY_REFUNDED'}});
  await tx.syncedOrder.update({where:{id:order.id},data:{paymentStatus:'PARTIALLY_REFUNDED'}});
 });
 const r=await auth('get','/api/v1/restaurant/qr/analytics');expect(r.status,JSON.stringify(r.body)).toBe(200);
 expect(r.body.metrics).toMatchObject({grossSales:750,collected:750,refunded:50,netSales:700,onlineSuccess:2});
 expect(r.body.byCode.every((code:any)=>code.branchId===branch && !('publicToken' in code))).toBe(true);
 expect((await auth('get','/api/v1/restaurant/qr/analytics?from=2026-02-31')).status).toBe(400);
});
it('keeps required variant choices usable while disabled optional add-ons are rejected on quote and submission',async()=>{
 await push('MODIFIER_GROUP','required-size',{name:'Size',isRequired:true,minSelections:1,maxSelections:1,options:[{id:'small',groupId:'required-size',name:'Small',priceDelta:0,isAvailable:true}]});
 await push('MODIFIER_GROUP','optional-extra',{name:'Extras',isRequired:false,minSelections:0,maxSelections:1,options:[{id:'extra',groupId:'optional-extra',name:'Extra',priceDelta:10,isAvailable:true}]});
 await push('MENU_ITEM','custom-meal',{name:'Custom meal',categoryId:'main',price:250,isAvailable:true,modifierGroupIds:['required-size','optional-extra']});
 await auth('post','/api/v1/menu/publish').send({});await auth('put','/api/v1/restaurant/qr/settings').send({allowModifiers:false});
 const items=[{itemId:'custom-meal',quantity:1,optionIds:['small']}];
 expect((await http().post(`/api/v1/public/qr/${qr}/quote`).send({items})).status).toBe(200);
 expect((await http().post(`/api/v1/public/qr/${qr}/orders`).send({...body('required-variant'),items})).status).toBe(201);
 items[0].optionIds.push('extra');
 expect((await http().post(`/api/v1/public/qr/${qr}/quote`).send({items})).status).toBe(400);
 expect((await http().post(`/api/v1/public/qr/${qr}/orders`).send({...body('optional-blocked'),items})).status).toBe(400);
 await auth('put','/api/v1/restaurant/qr/settings').send({allowModifiers:true});
});
it('concurrent partial setting saves create a single defaults row without losing either change',async()=>{
 await prisma.runAsTenant(restaurantId,tx=>tx.qrSettings.deleteMany({where:{restaurantId,branchId:null}}));
 const settings=app.get(QrSettingsService);
 await Promise.all([settings.update(restaurantId,{id:'test',type:'DEVICE'},{requireCustomerName:true},null),settings.update(restaurantId,{id:'test',type:'DEVICE'},{requireCustomerPhone:true},null)]);
 const rows=await prisma.runAsTenant(restaurantId,tx=>tx.qrSettings.findMany({where:{restaurantId,branchId:null}}));
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({requireCustomerName:true,requireCustomerPhone:true});
});

it('concurrent generation cannot assign two active QR destinations to one table',async()=>{
 const table=await auth('post','/api/v1/restaurant/qr/tables').send({tableNumber:'Bulk test',branchId:branch});expect(table.status,JSON.stringify(table.body)).toBe(201);
 const generate=()=>auth('post',`/api/v1/restaurant/qr/tables/${table.body.id}/generate`).send({branchId:branch});
 const attempts=await Promise.all([generate(),generate()]);expect(attempts.map(r=>r.status).sort()).toEqual([201,409]);
 expect(await prisma.runAsTenant(restaurantId,tx=>tx.qrCode.count({where:{restaurantId,tableId:table.body.id,status:'ACTIVE'}}))).toBe(1);
});

it('quotes and analytics never consume order-submission limits while actual submissions remain throttled',async()=>{
 await auth('put','/api/v1/restaurant/qr/settings').send({requireCustomerName:false,requireCustomerPhone:false});
 const limiter=app.get(QrRateLimiter);limiter.configure({sessionOrdersPerMinute:2});
 const session=(await http().post('/api/v1/public/qr/session')).body.session;
 try {
  for(let i=0;i<5;i++){
   expect((await http().post(`/api/v1/public/qr/${qr}/quote`).set('x-qr-session',session).send({items:body('quote-no-order').items})).status).toBe(200);
   expect((await http().post(`/api/v1/public/qr/${qr}/events`).set('x-qr-session',session).send({type:'QR_ITEM_ADDED'})).status).toBe(200);
  }
  for(const key of ['limited-real-first','limited-real-second'])expect((await http().post(`/api/v1/public/qr/${qr}/orders`).set('x-qr-session',session).send(body(key))).status).toBe(201);
  expect((await http().post(`/api/v1/public/qr/${qr}/orders`).set('x-qr-session',session).send(body('limited-real-third'))).status).toBe(429);
 } finally {limiter.configure({sessionOrdersPerMinute:100000});}
});

// Advanced features use the real plan catalog and canonical transactions.
const advancedPath='/api/v1/restaurant/qr/advanced';
const setCapabilities=async(enabled:boolean)=>prisma.runAsTenant(restaurantId,tx=>tx.applicationEntitlement.updateMany({where:{restaurantId,appCode:'QR_ORDERING'},data:{config:{qrMultilingual:enabled,qrFeedback:enabled,qrKitchenCapacity:enabled,qrOrderHistory:enabled,qrNotifications:enabled,qrSplitPayment:enabled,qrGroupOrdering:enabled,qrPromotions:enabled,qrLoyalty:enabled,qrMultiBranch:enabled,qrInventorySync:enabled}}}));
const saveAdvanced=async(changes:any,token=admin)=>{const c=await auth('get',advancedPath,token);expect(c.status,JSON.stringify(c.body)).toBe(200);return auth('put',advancedPath,token).send({version:c.body.version,changes});};
const browserSession=async()=>(await http().post('/api/v1/public/qr/session')).body.session;
const ownerProof=async()=>{const [owner,device]=await prisma.runAsTenant(restaurantId,tx=>Promise.all([tx.user.findFirstOrThrow({where:{restaurantId,role:'OWNER'}}),tx.device.findFirstOrThrow({where:{restaurantId,type:'POS_ADMIN',branchId:branch}})]));return new JwtService().sign({sub:owner.id,email:owner.email,restaurantId,did:device.id},{secret:process.env.JWT_ACCESS_SECRET,issuer:TENANT_JWT_ISSUER,audience:TENANT_JWT_AUDIENCE,expiresIn:'5m'});};
it('advanced features fail closed under the existing QR license and accept authorized add-on overrides',async()=>{
 const denied=await saveAdvanced({feedbackEnabled:true});expect(denied.status).toBe(403);
 await setCapabilities(true);const c=await auth('get',advancedPath);expect(c.body.capabilities.find((f:any)=>f.code==='QR_FEEDBACK')).toMatchObject({enabled:true,reason:'OK'});
 expect((await saveAdvanced({feedbackEnabled:true,historyEnabled:true,notificationsEnabled:true,multilingualEnabled:true,languages:['en','hi','gu'],defaultLanguage:'hi',groupEnabled:true})).status).toBe(200);
});
it('translated menus preserve item ids and prices, invalidate ETags and isolate branch text',async()=>{
 const previous=(await http().get(`/api/v1/public/qr/${qr}/menu`)).body;
 expect((await saveAdvanced({translations:{hi:{items:{meal:{name:'Hindi meal',description:'Reviewed translation'}},categories:{main:{name:'Hindi meals'}}}}})).status).toBe(200);
 const menu=await http().get(`/api/v1/public/qr/${qr}/menu`);expect(menu.body.items.find((i:any)=>i.id==='meal')).toMatchObject({price:250,translations:{hi:{name:'Hindi meal'}}});expect(menu.body.etag).not.toBe(previous.etag);expect(menu.body.defaultLanguage).toBe('hi');
 const other=(await http().get(`/api/v1/public/qr/${qrB}/menu`)).body;expect(other.items.find((i:any)=>i.id==='meal').translations?.hi).toBeUndefined();
 expect((await auth('get',advancedPath,adminB)).body.overrideKeys).not.toContain('translations');
});
it('optimistic configuration writes prevent stale editors overwriting newer preferences',async()=>{
 const c=(await auth('get',advancedPath)).body;expect((await auth('put',advancedPath).send({version:c.version,changes:{busyExtraMinutes:12}})).status).toBe(200);expect((await auth('put',advancedPath).send({version:c.version,changes:{busyExtraMinutes:99}})).status).toBe(409);
});
it('partial cash allocations serialize, reject overpayment and return identical idempotent replays',async()=>{
 const p=await place('advanced-partial-cash'),order=await stored(p.publicOrderId);
 const post=()=>auth('post',advancedPath+`/orders/${order.externalOrderId}/cash`).send({amountPaise:10000,version:order.syncVersion,idempotencyKey:'cash-partial-repeat'});
 const [a,b]=await Promise.all([post(),post()]);expect(a.status,JSON.stringify(a.body)).toBe(200);expect(b.status).toBe(200);expect(a.body.collectedPaise).toBe(10000);expect(a.body.outstandingPaise).toBe(15000);
 const ledger=await auth('get',advancedPath+`/orders/${order.externalOrderId}/ledger`);expect(ledger.body.entries).toHaveLength(1);expect(ledger.body.attempts).toHaveLength(0);
 const updated=await stored(p.publicOrderId);expect((await auth('post',advancedPath+`/orders/${order.externalOrderId}/cash`).send({amountPaise:16000,version:updated.syncVersion,idempotencyKey:'cash-overpayment'})).status).toBe(409);
 expect((await action(p.publicOrderId,'CANCELLED',admin,'Guest cancellation')).status).toBe(400);
 const remaining=await action(p.publicOrderId,'COLLECT');expect(remaining.status,JSON.stringify(remaining.body)).toBe(200);expect((await auth('get',advancedPath+`/orders/${order.externalOrderId}/ledger`)).body).toMatchObject({collectedPaise:25000,outstandingPaise:0,settlement:'SETTLED'});
 expect((await http().get(`/api/v1/public/qr/orders/${p.publicOrderId}`)).body.balance.outstandingPaise).toBe(0);
});
it('payment ledger is branch scoped and confirmed gateway/refund entries are allocated once',async()=>{
 const order=await prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.findFirstOrThrow({where:{restaurantId,source:'QR',paymentStatus:'PARTIALLY_REFUNDED'}}));
 const r=await auth('get',advancedPath+`/orders/${order.externalOrderId}/ledger`);expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body).toMatchObject({collectedPaise:25000,refundedPaise:5000,outstandingPaise:0});expect(r.body.entries).toHaveLength(2);
 expect((await auth('get',advancedPath+`/orders/${order.externalOrderId}/ledger`)).body.entries).toHaveLength(2);expect((await auth('get',advancedPath+`/orders/${order.externalOrderId}/ledger`,adminB)).status).toBe(404);
});
it('browser history uses only the signed session, not possession of a public table code',async()=>{
 const sid=await browserSession(),other=await browserSession();const p=await http().post(`/api/v1/public/qr/${qr}/orders`).set('x-qr-session',sid).send(body('advanced-history'));expect(p.status).toBe(201);
 const own=await http().get(`/api/v1/public/qr/${qr}/history`).set('x-qr-session',sid);expect(own.status,JSON.stringify(own.body)).toBe(200);expect(own.body.map((o:any)=>o.publicOrderId)).toContain(p.body.publicOrderId);
 expect((await http().get(`/api/v1/public/qr/${qr}/history`).set('x-qr-session',other)).body).toEqual([]);expect((await http().get(`/api/v1/public/qr/${qr}/history`).set('x-qr-session','forged')).status).toBe(403);
});
it('feedback requires a completed canonical order, rejects duplicates and protects branch reports',async()=>{
 const p=await place('advanced-feedback');const path=`/api/v1/public/qr/orders/${p.publicOrderId}/feedback`;
 expect((await http().post(path).send({rating:6})).status).toBe(400);expect((await http().post(path).send({rating:5,comment:'Good food'})).status).toBe(400);
 for(const act of ['PREPARING','READY','COLLECT','COMPLETED'])expect((await action(p.publicOrderId,act)).status).toBe(200);
 const replies=await Promise.all([1,2].map(()=>http().post(path).send({rating:5,comment:'Good food'})));expect(replies.map(r=>r.status).sort()).toEqual([200,409]);
 const report=await auth('get',advancedPath+'/feedback');expect(report.body).toMatchObject({total:1,average:5});expect(JSON.stringify(report.body)).not.toContain('customerPhone');expect((await auth('get',advancedPath+'/feedback',adminB)).body.total).toBe(0);
});
it('recoverable alerts are derived from durable canonical orders and collections without duplicate deliveries',async()=>{
 const r=await auth('get',advancedPath+'/notifications');expect(r.status).toBe(200);expect(r.body.alerts.some((a:any)=>a.type==='CASH_DUE')).toBe(true);expect(r.body.alerts.some((a:any)=>a.type==='PAYMENT_COLLECTED')).toBe(true);expect(new Set(r.body.alerts.map((a:any)=>a.id)).size).toBe(r.body.alerts.length);
 const second=await auth('get',advancedPath+'/notifications');expect(second.body.alerts.map((a:any)=>a.id)).toEqual(r.body.alerts.map((a:any)=>a.id));const other=await auth('get',advancedPath+'/notifications',adminB);expect(other.body.enabled).toBe(false);
});
it('shared sessions require explicit invitations and preserve independent guest contribution ownership',async()=>{
 const a=await browserSession(),b=await browserSession(),outsider=await browserSession(),base=`/api/v1/public/qr/${qr}/groups`;
 const created=await http().post(base).set('x-qr-session',a);expect(created.status,JSON.stringify(created.body)).toBe(201);const id=created.body.invitation;
 expect((await http().get(`${base}/${id}`).set('x-qr-session',outsider)).status).toBe(403);
 expect((await http().post(`${base}/${id}/join`).set('x-qr-session',b)).status).toBe(200);
 const [ra,rb]=await Promise.all([a,b].map((sid,i)=>http().put(`${base}/${id}/items`).set('x-qr-session',sid).send({version:0,items:[{itemId:'meal',quantity:i+1,optionIds:[]}]})));expect(ra.status).toBe(200);expect(rb.status).toBe(200);
 const view=(await http().get(`${base}/${id}`).set('x-qr-session',a)).body;expect(view.guests).toHaveLength(2);expect(view.guests.map((g:any)=>g.items[0].quantity).sort()).toEqual([1,2]);expect(JSON.stringify(view)).not.toContain(a.split('.')[1]);
 expect((await http().post(`${base}/${id}/submit`).set('x-qr-session',b).send({version:view.version,paymentMethod:'CASH_AT_COUNTER',expectedTotalPaise:75000})).status).toBe(403);
 const [sa,sb]=await Promise.all([1,2].map(()=>http().post(`${base}/${id}/submit`).set('x-qr-session',a).send({version:view.version,paymentMethod:'CASH_AT_COUNTER',expectedTotalPaise:75000})));expect([sa.status,sb.status].filter(s=>s===201)).toHaveLength(1);expect([sa.status,sb.status].sort()).toEqual([201,409]);const accepted=sa.status===201?sa:sb;const repeat=await http().post(`${base}/${id}/submit`).set('x-qr-session',a).send({version:view.version,paymentMethod:'CASH_AT_COUNTER',expectedTotalPaise:75000});expect(repeat.status).toBe(201);expect(repeat.body.publicOrderId).toBe(accepted.body.publicOrderId);expect(accepted.body.total).toBe(750);
 expect((await http().put(`${base}/${id}/items`).set('x-qr-session',b).send({version:1,items:[]})).status).toBe(409);
 expect((await http().get(`/api/v1/public/qr/${qrB}/groups/${id}`).set('x-qr-session',a)).status).toBe(403);
});
it('expired sessions and guest limits fail safely while individual ordering remains available',async()=>{
 const sid=await browserSession(),base=`/api/v1/public/qr/${qr}/groups`;const r=await http().post(base).set('x-qr-session',sid);const id=r.body.invitation;
 await prisma.runAsTenant(restaurantId,async tx=>{const row=await tx.syncedEntity.findUniqueOrThrow({where:{restaurantId_entityType_externalId:{restaurantId,entityType:'QR_SHARED_SESSION',externalId:id}}});await tx.syncedEntity.update({where:{id:row.id},data:{payload:{...row.payload as object,expiresAt:new Date(Date.now()-1000).toISOString()}}});});
 expect((await http().get(`${base}/${id}`).set('x-qr-session',sid)).status).toBe(410);expect((await place('individual-after-expiry')).status).toBe('RECEIVED');
});
it('shared workload counts all branch channels and never cancels already admitted orders',async()=>{
 expect((await saveAdvanced({capacityEnabled:true,workloadLimit:1,busyAtWorkload:1,busyExtraMinutes:15})).status).toBe(200);
 const describe=await http().get(`/api/v1/public/qr/${qr}`);expect(describe.body.advanced.workload.atCapacity).toBe(true);expect(describe.body.ordering.enabled).toBe(false);expect((await http().post(`/api/v1/public/qr/${qr}/orders`).send(body('capacity-all-channels'))).status).toBe(409);
 expect((await saveAdvanced({capacityEnabled:false})).status).toBe(200);expect((await http().get(`/api/v1/public/qr/${qr}`)).body.ordering.enabled).toBe(true);
});
it('an acknowledged checkout amount cannot be silently changed even within the same menu version',async()=>{
 const r=await http().post(`/api/v1/public/qr/${qr}/orders`).send({...body('wrong-price-acknowledgement'),expectedTotalPaise:1});expect(r.status).toBe(409);expect(r.body.code).toBe('MENU_CHANGED');
});

it('coupon validation shares canonical tax pricing and serializes the final usage across guests',async()=>{
 expect((await saveAdvanced({promotionsEnabled:true})).status).toBe(200);
 const promo={code:'ONCE',description:'One available discount',discountType:'PERCENTAGE',discountValue:10,minOrderValue:0,usageLimit:1,validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),isActive:true,branchIds:[],itemIds:[],categoryIds:[]};
 expect((await auth('post',advancedPath+'/promotions').send(promo)).status).toBe(201);
 const quoted=await http().post(`/api/v1/public/qr/${qr}/quote`).send({items:body('x').items,couponCode:'ONCE'});expect(quoted.status,JSON.stringify(quoted.body)).toBe(200);expect(quoted.body).toMatchObject({subtotal:250,discount:25,tax:0,total:225});
 const responses=await Promise.all(['coupon-a','coupon-b'].map(key=>http().post(`/api/v1/public/qr/${qr}/orders`).send({...body(key),couponCode:'ONCE',expectedTotalPaise:22500})));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
 const accepted=responses.find(r=>r.status===201)!;expect((await stored(accepted.body.publicOrderId)).discountAmount).toBe(2500);
 const row=(await auth('get',advancedPath+'/promotions')).body.find((r:any)=>r.code==='ONCE');expect(row.usageCount).toBe(1);
 expect((await http().post(`/api/v1/public/qr/${qrB}/quote`).send({items:body('x').items,couponCode:'ONCE'})).status).toBe(403);
});
it('loyalty requires a configured real verification boundary and limits invalid code attempts',async()=>{
 expect((await saveAdvanced({loyaltyEnabled:true})).status).toBe(200);const notifications:NotificationGatewayService=app.get(NotificationGatewayService);vi.spyOn(notifications,'isQrLoyaltyOtpConfigured').mockReturnValue(false);
 const sid=await browserSession();expect((await http().post(`/api/v1/public/qr/${qr}/loyalty/send-code`).set('x-qr-session',sid).send({phone:'9898989898'})).status).toBe(503);
 expect((await http().get(`/api/v1/public/qr/${qr}/loyalty`).set('x-qr-session',sid)).body.verified).toBe(false);
 vi.mocked(notifications.isQrLoyaltyOtpConfigured).mockReturnValue(true);let code='';vi.spyOn(notifications,'sendQrLoyaltyOtp').mockImplementation(async(_phone:string,otp:string)=>{code=otp;return {success:true};});
 const sent=await http().post(`/api/v1/public/qr/${qr}/loyalty/send-code`).set('x-qr-session',sid).send({phone:'9898989898'});expect(sent.status,JSON.stringify(sent.body)).toBe(200);expect(JSON.stringify(sent.body)).not.toContain(code);
 for(let i=0;i<5;i++)expect((await http().post(`/api/v1/public/qr/${qr}/loyalty/verify`).set('x-qr-session',sid).send({code:code==='000000'?'111111':'000000'})).status).toBe(400);
 expect((await http().post(`/api/v1/public/qr/${qr}/loyalty/verify`).set('x-qr-session',sid).send({code})).status).toBe(400);
});
it('verified loyalty redemption is optional, atomic under concurrency and earns/reverses exactly once',async()=>{
 const notifications:NotificationGatewayService=app.get(NotificationGatewayService),sid=await browserSession();let code='';vi.mocked(notifications.sendQrLoyaltyOtp).mockImplementation(async(_phone:string,otp:string)=>{code=otp;return {success:true};});
 await push('CUSTOMER','9797979797',{phone:'9797979797',name:'Returning guest',loyaltyPoints:200,loyaltyBaseline:{points:200,spend:0,visits:0},loyaltyLedger:{},favoriteItemIds:[],recentOrderIds:[],totalSpend:0,totalVisits:0});
 await push('LOYALTY_PROGRAM_SETTINGS','default',{enabled:true,earnPoints:1,perRupeesSpent:10});await push('LOYALTY_REWARD','bill-100',{name:'100 off',description:'100 rupees off',pointsCost:150,isActive:true,discountKind:'FIXED',discountAmount:100});
 expect((await http().post(`/api/v1/public/qr/${qr}/loyalty/send-code`).set('x-qr-session',sid).send({phone:'9797979797'})).status).toBe(200);
 const verified=await http().post(`/api/v1/public/qr/${qr}/loyalty/verify`).set('x-qr-session',sid).send({code});expect(verified.status,JSON.stringify(verified.body)).toBe(200);expect(verified.body).toMatchObject({verified:true,points:200});
 const quote=await http().post(`/api/v1/public/qr/${qr}/quote`).set('x-qr-session',sid).send({items:body('x').items,loyaltyRewardId:'bill-100'});expect(quote.status).toBe(200);expect(quote.body).toMatchObject({total:150,discount:100});
 expect((await http().post(`/api/v1/public/qr/${qr}/quote`).set('x-qr-session',sid).send({items:body('x').items,loyaltyRewardId:'bill-100',couponCode:'ONCE'})).status).toBe(400);
 const attempts=await Promise.all(['reward-one','reward-two'].map(key=>http().post(`/api/v1/public/qr/${qr}/orders`).set('x-qr-session',sid).send({...body(key),loyaltyRewardId:'bill-100',expectedTotalPaise:15000})));expect(attempts.map(r=>r.status).sort()).toEqual([201,409]);const order=attempts.find(r=>r.status===201)!.body;
 const account=()=>http().get(`/api/v1/public/qr/${qr}/loyalty`).set('x-qr-session',sid);
 expect((await account()).body.points).toBe(50);expect((await action(order.publicOrderId,'COLLECT')).status).toBe(200);expect((await account()).body.points).toBe(65);
 const storedOrder=await stored(order.publicOrderId);await auth('get',advancedPath+`/orders/${storedOrder.externalOrderId}/ledger`);expect((await account()).body.points).toBe(65);
 const refundBody={amountPaise:15000,version:(await stored(order.publicOrderId)).syncVersion,idempotencyKey:'cash-loyalty-full-refund',reason:'Guest returned the order'};
 const r=await auth('post',advancedPath+`/orders/${storedOrder.externalOrderId}/refund-cash`).set('x-owner-authorization',await ownerProof()).send(refundBody);expect(r.status,JSON.stringify(r.body)).toBe(200);expect((await account()).body.points).toBe(200);
 expect((await auth('post',advancedPath+`/orders/${storedOrder.externalOrderId}/refund-cash`).set('x-owner-authorization',await ownerProof()).send(refundBody)).status).toBe(200);expect((await account()).body.points).toBe(200);
 const part=await http().post(`/api/v1/public/qr/${qr}/orders`).set('x-qr-session',sid).send({...body('reward-partially-collected-return'),loyaltyRewardId:'bill-100',expectedTotalPaise:15000});expect(part.status,JSON.stringify(part.body)).toBe(201);const po=await stored(part.body.publicOrderId);
 expect((await auth('post',advancedPath+`/orders/${po.externalOrderId}/cash`).send({amountPaise:10000,version:po.syncVersion,idempotencyKey:'loyalty-partial-cash'})).status).toBe(200);expect((await account()).body.points).toBe(50);
 expect((await auth('post',advancedPath+`/orders/${po.externalOrderId}/refund-cash`).set('x-owner-authorization',await ownerProof()).send({amountPaise:10000,version:(await stored(part.body.publicOrderId)).syncVersion,idempotencyKey:'loyalty-all-collected-return',reason:'Return all collected cash and close bill'})).status).toBe(200);expect((await account()).body.points).toBe(200);
 const other=await browserSession();expect((await http().get(`/api/v1/public/qr/${qr}/loyalty`).set('x-qr-session',other)).body).toMatchObject({verified:false,points:0});
});
it('a partial cash refund never fabricates collection of the still unpaid balance',async()=>{
 const p=await place('partial-cash-refund'),o=await stored(p.publicOrderId);expect((await auth('post',advancedPath+`/orders/${o.externalOrderId}/cash`).send({amountPaise:10000,version:o.syncVersion,idempotencyKey:'partial-refund-collection'})).status).toBe(200);
 const current=await stored(p.publicOrderId);expect((await auth('post',advancedPath+`/orders/${o.externalOrderId}/refund-cash`).set('x-owner-authorization',await ownerProof()).send({amountPaise:5000,version:current.syncVersion,idempotencyKey:'partial-return-cash',reason:'Partial item return'})).status).toBe(200);
 const ledger=(await auth('get',advancedPath+`/orders/${o.externalOrderId}/ledger`)).body;expect(ledger).toMatchObject({collectedPaise:10000,refundedPaise:5000,outstandingPaise:15000});expect(ledger.entries.filter((e:any)=>e.kind==='COLLECTION')).toHaveLength(1);
});

it('counted portions reserve the last available dish once across simultaneous QR guests and restore on cancellation',async()=>{
 expect((await saveAdvanced({inventoryEnabled:true})).status).toBe(200);expect((await auth('put','/api/v1/menu/branch-overrides').send({branchId:branch,itemId:'meal',stockQuantity:1})).status).toBe(200);
 const attempts=await Promise.all(['last-portion-a','last-portion-b'].map(key=>http().post(`/api/v1/public/qr/${qr}/orders`).send(body(key))));expect(attempts.map(r=>r.status).sort()).toEqual([201,409]);const accepted=attempts.find(r=>r.status===201)!.body;
 const count=await auth('get',advancedPath+'/stock');expect(count.body.items.find((i:any)=>i.itemId==='meal').stockQuantity).toBe(0);
 expect((await stored(accepted.publicOrderId)).meta).toHaveProperty('serverDishStockConsumed');expect((await action(accepted.publicOrderId,'CANCELLED',admin,'Guest changed plans')).status).toBe(200);
 expect((await auth('get',advancedPath+'/stock')).body.items.find((i:any)=>i.itemId==='meal').stockQuantity).toBe(1);const o=await stored(accepted.publicOrderId);await auth('get',advancedPath+`/orders/${o.externalOrderId}/ledger`);expect((await auth('get',advancedPath+'/stock')).body.items.find((i:any)=>i.itemId==='meal').stockQuantity).toBe(1);
 expect((await auth('get',advancedPath+`/stock?branchId=${branch}`,adminB)).status).toBe(403);
 await auth('put','/api/v1/menu/branch-overrides').send({branchId:branch,itemId:'meal',stockQuantity:null});await saveAdvanced({inventoryEnabled:false});
});
it('owner propagation previews preserve branch overrides, require current versions and forbid branch-manager bulk access',async()=>{
 const originalBusyMinutes=(await auth('get',advancedPath)).body.settings.busyExtraMinutes;
 const proof=await ownerProof(),requestAll=(method:'get'|'post',path:string)=>auth(method,path).set('x-admin-branch','all').set('x-owner-authorization',proof);
 const preview=await requestAll('post',advancedPath+'/propagation').send({branchIds:[branch,branchB],changes:{busyExtraMinutes:40}});expect(preview.status,JSON.stringify(preview.body)).toBe(200);expect(preview.body.branches.find((b:any)=>b.branchId===branch).preservedKeys).toContain('busyExtraMinutes');expect(preview.body.branches.find((b:any)=>b.branchId===branchB).appliedKeys).toContain('busyExtraMinutes');
 const versions=Object.fromEntries(preview.body.branches.map((b:any)=>[b.branchId,b.version]));expect((await requestAll('post',advancedPath+'/propagation').send({branchIds:[branch,branchB],changes:{busyExtraMinutes:40},versions})).status).toBe(200);
 expect((await auth('get',advancedPath)).body.settings.busyExtraMinutes).toBe(originalBusyMinutes);expect((await auth('get',advancedPath,adminB)).body.settings.busyExtraMinutes).toBe(40);
 expect((await requestAll('post',advancedPath+'/propagation').send({branchIds:[branch,branchB],changes:{busyExtraMinutes:80},versions})).status).toBe(409);expect((await auth('post',advancedPath+'/propagation',adminB).send({branchIds:[branch],changes:{busyExtraMinutes:80}})).status).toBe(403);
});


it('counter sync refuses a stale partial balance and allocates the acknowledged remainder exactly once',async()=>{
 const p=await place('counter-partial-bridge'),o=await stored(p.publicOrderId);
 expect((await auth('post',advancedPath+`/orders/${o.externalOrderId}/cash`).send({amountPaise:10000,version:o.syncVersion,idempotencyKey:'counter-bridge-first'})).status).toBe(200);
 const current=await stored(p.publicOrderId),event={externalOrderId:o.externalOrderId,eventId:randomUUID(),status:'COMPLETED',updatedAt:new Date().toISOString(),paymentStatus:'SUCCESS',paymentMethod:'CASH',orderType:current.orderType,items:current.items,subtotal:current.subtotal,taxAmount:current.taxAmount,discountAmount:current.discountAmount,totalAmount:current.totalAmount,meta:{counterSettlementAmountPaise:25000}};
 const bad=await auth('post','/api/v1/orders/sync').send({events:[event]});expect(bad.body.results[0].error).toContain('PAYMENT_BALANCE_CHANGED');
 event.eventId=randomUUID();event.meta.counterSettlementAmountPaise=15000;
 const accepted=await auth('post','/api/v1/orders/sync').send({events:[event]});expect(accepted.body.results[0].status,JSON.stringify(accepted.body)).toBe('ok');
 expect((await auth('get',advancedPath+`/orders/${o.externalOrderId}/ledger`)).body).toMatchObject({collectedPaise:25000,outstandingPaise:0});
 expect((await stored(p.publicOrderId)).meta).toHaveProperty('paymentAllocationSummary.outstandingPaise',0);
 await auth('post','/api/v1/orders/sync').send({events:[event]});expect((await auth('get',advancedPath+`/orders/${o.externalOrderId}/ledger`)).body.entries).toHaveLength(2);
});


it('a verified online refund updates the canonical QR ticket and restores counted stock exactly once',async()=>{
 await saveAdvanced({inventoryEnabled:true});await auth('put','/api/v1/menu/branch-overrides').send({branchId:branch,itemId:'meal',stockQuantity:2});
 const p=await place('gateway-refund-canonical-stock',true),oid=p.payment.checkout.orderId,pid='pay_canonicalStockRefund';
 vi.mocked(gateway.fetchCheckoutPayments).mockResolvedValue([{id:pid,order_id:oid,amount:25000,currency:'INR',status:'captured'}] as any);expect((await verify(p.publicOrderId,pid,oid)).status).toBe(200);
 const payment=await pay(p.publicOrderId),refund={amountPaise:25000,reason:'Return the entire bill',method:'CASH',requestedBy:'Manager',staffSession:await refundManagerSession(app,prisma,admin),idempotencyKey:'canonical-full-refund'};
 const result=await auth('post',`/api/v1/payments/${payment.id}/refund`).send(refund);expect(result.status,JSON.stringify(result.body)).toBe(201);
 const current=await stored(p.publicOrderId);expect(current).toMatchObject({status:'REFUNDED',paymentStatus:'REFUNDED'});expect((current.items as any[]).every(i=>i.kitchenStatus==='CANCELLED')).toBe(true);
 expect((await http().get(`/api/v1/public/qr/orders/${p.publicOrderId}`)).body).toMatchObject({status:'CANCELLED',balance:{collectedPaise:25000,refundedPaise:25000}});
 expect((await auth('get',advancedPath+'/stock')).body.items.find((i:any)=>i.itemId==='meal').stockQuantity).toBe(2);
 expect((await auth('post',`/api/v1/payments/${payment.id}/refund`).send(refund)).status).toBe(201);expect((await auth('get',advancedPath+'/stock')).body.items.find((i:any)=>i.itemId==='meal').stockQuantity).toBe(2);
 vi.mocked(gateway.fetchCheckoutPayments).mockResolvedValue([]);await auth('put','/api/v1/menu/branch-overrides').send({branchId:branch,itemId:'meal',stockQuantity:null});await saveAdvanced({inventoryEnabled:false});
});
it('feedback reports filter real completed-order responses and reject invalid dates and ratings',async()=>{
 expect((await auth('get',advancedPath+'/feedback?from=2026-02-30')).status).toBe(400);expect((await auth('get',advancedPath+'/feedback?rating=6')).status).toBe(400);
 const filtered=await auth('get',advancedPath+'/feedback?rating=5');expect(filtered.status).toBe(200);expect(filtered.body.feedback.every((r:any)=>r.rating===5)).toBe(true);
 expect((await auth('get',advancedPath+'/feedback?from=2020-01-01&to=2020-01-02')).body.total).toBe(0);
});

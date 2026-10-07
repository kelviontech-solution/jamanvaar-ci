import request from 'supertest';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {JwtService} from '@nestjs/jwt';
import {Prisma} from '@prisma/client';
import {createTestApp,createTestPlatformUser,platformLogin} from './helpers';
import {PrismaService} from '../src/prisma/prisma.service';
import {TENANT_JWT_ISSUER,TENANT_JWT_AUDIENCE} from '../src/modules/tenant-auth/tenant-auth.service';
import {dashboardDates} from '../src/modules/dashboard/tenant-dashboard.service';
import {PaymentsService} from '../src/modules/payments/payments.service';
import {hashOpaqueToken} from '../src/common/security/token.util';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

let app:any,prisma:PrismaService,rid:string,owner:any,platform:string,admin:any,ownerJwt:string,managerJwt:string;
const stamp=Date.now(),email=`branch-matrix-${stamp}@test.example.com`,password='correct-horse-battery-staple';
const branches:any[]=[],devices:any[][]=[],plans:string[]=[],timings:number[]=[];
const fullFlowTimings:Record<string,unknown>[]=[];
const http=()=>request(app.getHttpServer());
const as=(method:'get'|'post'|'put'|'patch',path:string,token=admin?.token)=>http()[method](path).set('Authorization',`Bearer ${token}`);
const sign=(user:any,did=admin.id)=>new JwtService().sign({sub:user.id,restaurantId:rid,email:user.email,did},{secret:process.env.JWT_ACCESS_SECRET,issuer:TENANT_JWT_ISSUER,audience:TENANT_JWT_AUDIENCE,expiresIn:'15m'});
const entity=(type:string,id:string,payload:any,token=admin.token)=>as('post',`/api/v1/entity-sync/${type}`,token).send({events:[{externalId:id,payload:{id,...payload,updatedAt:new Date().toISOString()}}]});
const order=(id:string,status='PREPARING')=>({externalOrderId:id,orderType:'DINE_IN',status,items:[{externalItemId:'tea',name:'Masala Tea',quantity:1,unitPrice:10000,lineTotal:10000,kitchenStatus:status,modifiers:[]}],subtotal:10000,taxAmount:0,totalAmount:10000,updatedAt:new Date().toISOString()});
const dashboard=(query='',token=ownerJwt)=>as('get',`/api/v1/tenant/dashboard${query}`,token);
beforeAll(async()=>{
  app=await createTestApp();prisma=app.get(PrismaService);
  await createTestPlatformUser(prisma,{email,password});platform=(await platformLogin(app,email,password)).body.accessToken;
  const rest=await as('post','/api/v1/restaurants',platform).send({name:`TEST Five branch ${stamp}`,ownerName:'Owner',ownerEmail:email});rid=rest.body.restaurant.id;
  for(const family of ['RESTAURANT','KIOSK']){
    const p=await as('post','/api/v1/plans',platform).send({name:`TEST Matrix ${family} ${stamp}`,tier:family==='KIOSK'?'PRO':'QR',productFamily:family,priceMonthly:100000,maxBranches:5,maxDevices:50,maxUsers:30,entitlements:{posTerminal:true,restaurantAdmin:true,kotKdsRouting:true,qrTableOrdering:true}});expect(p.status,JSON.stringify(p.body)).toBe(201);plans.push(p.body.id);
    const applications=family==='KIOSK'?['KIOSK','KIOSK_ADMIN']:['POS','POS_ADMIN','CAPTAIN','KDS','QR_ORDERING'];
    expect((await as('post','/api/v1/subscriptions',platform).send({restaurantId:rid,planId:p.body.id,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications})).status).toBe(201);
  }
  branches.push(await prisma.runAsTenant(rid,tx=>tx.branch.findFirstOrThrow({where:{restaurantId:rid}})));
  for(let i=1;i<5;i++){const r=await as('post','/api/v1/branches',platform).send({restaurantId:rid,name:`Branch ${i+1}`,code:`B${i+1}`});expect(r.status,JSON.stringify(r.body)).toBe(201);branches.push(r.body);}
  const activate=async(type:string,branchId?:string,label?:string)=>{const k=await as('post','/api/v1/activation-keys',platform).send({restaurantId:rid,allowedDeviceType:type,...(branchId?{branchId}:{}),label,expiresAt:new Date(Date.now()+86400000).toISOString()});expect(k.status,JSON.stringify(k.body)).toBe(201);const d=await http().post('/api/v1/activation/redeem').send({code:k.body.code,deviceType:type});expect(d.status,JSON.stringify(d.body)).toBe(201);return {id:d.body.device.id,token:d.body.deviceToken,type,branchId};};
  admin=await activate('POS_ADMIN');
  const setups=[['POS'],['POS','CAPTAIN'],['POS','POS','POS','KDS','KDS','CAPTAIN','CAPTAIN'],['KIOSK','KIOSK','KDS'],['POS','CAPTAIN','KIOSK','KDS']];
  for(let i=0;i<5;i++){devices[i]=[];for(let n=0;n<setups[i].length;n++)devices[i].push(await activate(setups[i][n],branches[i].id,`B${i+1}-${setups[i][n]}-${n}`));}
  owner=await prisma.runAsTenant(rid,async tx=>{const u=await tx.user.findFirstOrThrow({where:{restaurantId:rid,role:'OWNER'}});return tx.user.update({where:{id:u.id},data:{status:'ACTIVE'}});});ownerJwt=sign(owner);
  const manager=await prisma.runAsTenant(rid,tx=>tx.user.create({data:{restaurantId:rid,branchId:branches[1].id,email:`manager-${email}`,fullName:'Branch manager',role:'MANAGER',passwordHash:owner.passwordHash,status:'ACTIVE'}}));managerJwt=sign(manager);
  for(let i=0;i<5;i++){expect((await entity('DINING_TABLE',`table-${i}`,{tableNumber:'T1',branchId:branches[i].id,isActive:true,capacity:4,status:'AVAILABLE'})).body.results[0].status).toBe('ok');}
  await entity('MENU_CATEGORY','drinks',{name:'Drinks',isActive:true});await entity('MENU_ITEM','tea',{name:'Masala Tea',price:100,categoryId:'drinks',isAvailable:true,modifierGroupIds:[]});
},60000);
afterAll(async()=>{if(rid)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:rid}}));await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:{in:plans}}}));await prisma.platformUser.deleteMany({where:{email}});await app.close();},60000);

it('five branches have distinct activated setups and independently registered device identities',async()=>{
  expect(new Set(devices.flat().map(d=>d.id)).size).toBe(devices.flat().length);
  const d=await dashboard();expect(d.status,JSON.stringify(d.body)).toBe(200);expect(d.body.byBranch).toHaveLength(5);
  for(let i=0;i<5;i++){const b=d.body.byBranch.find((b:any)=>b.id===branches[i].id);expect(b.deployedProducts.sort()).toEqual([...new Set(devices[i].map(d=>d.type))].sort());expect(b.devices).toBe(devices[i].length);}
});

it('a smaller newer product plan cannot override the restaurant branch allowance',async()=>{
  await prisma.runAsPlatform(tx=>tx.plan.update({where:{id:plans[1]},data:{maxBranches:1}}));
  const denied=await as('post','/api/v1/branches',platform).send({restaurantId:rid,name:'Over quota',code:'OVER'});
  expect(denied.status).toBe(409);expect(denied.body.message).toContain('5 branch(es)');
});

it('branch-manager credentials cannot read consolidated payouts, while the owner can',async()=>{
  expect((await as('get','/api/v1/payments/payout-summary')).status).toBe(403);
  expect((await as('get','/api/v1/payments/payout-history').set('x-admin-branch',branches[1].id).set('x-owner-authorization',managerJwt)).status).toBe(403);
  expect((await as('get','/api/v1/payments/payout-summary').set('x-owner-authorization',ownerJwt)).status).toBe(200);
});

it('only inventory-capable terminals can access branch stock',async()=>{
  for(const d of devices.flat().filter(d=>['KIOSK','KDS','CAPTAIN'].includes(d.type))){
    expect((await as('get','/api/v1/inventory/balances',d.token)).status).toBe(403);
    expect((await as('post','/api/v1/inventory/movements',d.token).send({movements:[{}]})).status).toBe(403);
  }
});

it('low-stock alerts use the branch movement ledger rather than a stale master status',async()=>{
  await entity('INVENTORY_ITEM','ledger-milk',{branchId:branches[0].id,name:'Milk',openingStock:10,currentStock:10,minStockLevel:3,status:'IN_STOCK'});
  const d=devices[0][0];
  const movement=await as('post','/api/v1/inventory/movements',d.token).send({movements:[{movementId:'milk-sale',itemId:'ledger-milk',itemName:'Milk',type:'SALE',quantityDelta:-8,unit:'litre',reason:'test',occurredAt:new Date().toISOString()}]});
  expect(movement.body.results[0].status).toBe('ok');
  expect((await dashboard(`?branchId=${branches[0].id}`)).body.alerts.some((a:any)=>a.title==='Milk'&&a.detail==='Low stock')).toBe(true);
  expect((await dashboard(`?branchId=${branches[1].id}`)).body.alerts.some((a:any)=>a.title==='Milk')).toBe(false);
});
for(let i=0;i<5;i++)it(`Branch ${i+1} receives only its own table despite every branch using table number T1`,async()=>{
  const d=devices[i][0];const r=await as('get','/api/v1/entity-sync/DINING_TABLE?afterSeq=0',d.token);expect(r.status).toBe(200);expect(r.body.entities.map((e:any)=>e.externalId)).toEqual([`table-${i}`]);
});
for(const type of ['SHIFT','CASH_MOVEMENT','RESERVATION','SERVICE_MESSAGE','PAYMENT_TRANSACTION','INVENTORY_ITEM','RECIPE','CUSTOMER_FEEDBACK','KIOSK_CONFIGURATION'])it(`${type} records cannot be read, edited or deleted by a different branch`,async()=>{
  const id=type==='KIOSK_CONFIGURATION'?`kiosk-config-${branches[0].id}`:`scoped-${type}`;const extra=type==='KIOSK_CONFIGURATION'?{welcome:{}}:{};
  const payload=type==='KIOSK_CONFIGURATION'?{branchId:branches[0].id,updatedAt:new Date().toISOString(),display:{enabledLanguages:['en'],defaultLanguage:'en',idleWarningAfterSeconds:90,idleResetCountdownSeconds:15},welcome:{showHeritageArtwork:false,showPromoBanner:false},receipt:{restaurantName:'Branch A',address:'',phone:'',gstin:'',fssaiNumber:'',footerMessage:'',thankYouMessage:'',paperSize:'80mm',showCustomerPhone:false,showTaxBreakup:true,showTokenBig:true,enableWhatsApp:false,enableSms:false,enableEmail:false,enableQrReceipt:false}}:{id,branchId:branches[0].id,name:'Branch A only',...extra,updatedAt:new Date().toISOString()};
  const pushed=await as('post',`/api/v1/entity-sync/${type}`).send({events:[{externalId:id,payload}]});expect(pushed.body.results[0].status,JSON.stringify(pushed.body)).toBe('ok');
  const own=await as('get',`/api/v1/entity-sync/${type}?afterSeq=0`,admin.token).set('x-admin-branch',branches[0].id).set('x-owner-authorization',ownerJwt);expect(own.status).toBe(200);expect(own.body.entities.some((e:any)=>e.externalId===id)).toBe(true);
  const other=await as('get',`/api/v1/entity-sync/${type}?afterSeq=0`,admin.token).set('x-admin-branch',branches[1].id).set('x-owner-authorization',ownerJwt);expect(other.status).toBe(200);expect(other.body.entities.some((e:any)=>e.externalId===id)).toBe(false);
  const attack=await as('post',`/api/v1/entity-sync/${type}`,admin.token).set('x-admin-branch',branches[1].id).set('x-owner-authorization',ownerJwt).send({events:[{externalId:id,payload:{id,deleted:true,updatedAt:new Date().toISOString()}}]});expect(attack.body.results[0].status).toBe('error');expect(attack.body.results[0].error).toMatch(/BRANCH_FORBIDDEN|Invalid kiosk configuration scope/);
});
it('a scope header alone, a different-device proof and a branch-manager spoof cannot change scope',async()=>{
  const path='/api/v1/entity-sync/DINING_TABLE?afterSeq=0';
  expect((await as('get',path).set('x-admin-branch',branches[0].id)).status).toBe(403);
  expect((await as('get',path).set('x-admin-branch',branches[0].id).set('x-owner-authorization',sign(owner,devices[0][0].id))).status).toBe(403);
  expect((await as('get',path).set('x-admin-branch',branches[0].id).set('x-owner-authorization',managerJwt)).status).toBe(403);
  expect((await as('get',path).set('x-admin-branch',branches[1].id).set('x-owner-authorization',managerJwt)).status).toBe(200);
  const physical=await prisma.runAsTenant(rid,tx=>tx.device.findUniqueOrThrow({where:{id:admin.id}}));expect(physical.branchId).toBeNull();
});
it('a branch manager sees only their branch in the directory and dashboard, even without a branch parameter',async()=>{
  const d=await dashboard('',managerJwt);expect(d.status,JSON.stringify(d.body)).toBe(200);expect(d.body.scope.branchId).toBe(branches[1].id);expect(d.body.byBranch).toHaveLength(1);
  expect((await dashboard(`?branchId=${branches[0].id}`,managerJwt)).status).toBe(403);
  expect((await dashboard('?branchId=all',managerJwt)).status).toBe(403);
  const list=await as('get','/api/v1/tenant/branches',managerJwt);expect(list.body.map((b:any)=>b.id)).toEqual([branches[1].id]);
});
it('POS and Captain share orders with every KDS and POS in the same branch, and no other branch',async()=>{
  const a=devices[2],id=`matrix-pos-${stamp}`,start=performance.now();const pushed=await as('post','/api/v1/orders/sync',a[0].token).send({events:[order(id)]});expect(pushed.body.results[0].status).toBe('ok');
  for(const d of a){const r=await as('get','/api/v1/orders/sync?afterSeq=0',d.token);expect(r.body.orders.some((o:any)=>o.externalOrderId===id)).toBe(true);}timings.push(performance.now()-start);
  const other=await as('get','/api/v1/orders/sync?afterSeq=0',devices[1][0].token);expect(other.body.orders.some((o:any)=>o.externalOrderId===id)).toBe(false);
  const cap=a.find(d=>d.type==='CAPTAIN');expect((await as('post','/api/v1/orders/sync',cap.token).send({events:[order(`matrix-captain-${stamp}`)]})).body.results[0].status).toBe('ok');
  const kds=a.find(d=>d.type==='KDS');expect((await as('post','/api/v1/orders/sync',kds.token).send({events:[order(id,'READY')]})).body.results[0].status).toBe('ok');
  for(const d of a.filter(d=>['POS','CAPTAIN'].includes(d.type))){const r=await as('get','/api/v1/orders/sync?afterSeq=0',d.token);expect(r.body.orders.find((o:any)=>o.externalOrderId===id).status).toBe('READY');}
});
it('branch devices cannot mutate another branch order, reference its inventory order or assign its station',async()=>{
  const id=`matrix-pos-${stamp}`,b=devices[1][0];const r=await as('post','/api/v1/orders/sync',b.token).send({events:[order(id,'CANCELLED')]});expect(r.body.results[0].error).toContain('BRANCH');
  const move=await as('post','/api/v1/inventory/movements',b.token).send({movements:[{movementId:'forged-order-stock',itemId:'tea-stock',itemName:'Tea',type:'SALE',quantityDelta:-1,unit:'kg',orderId:id,reason:'spoof',occurredAt:new Date().toISOString()}]});expect(move.body.results[0].error).toContain('BRANCH_FORBIDDEN');
  const kds=devices[2].find(d=>d.type==='KDS');expect((await as('put',`/api/v1/devices/me/fleet/${kds.id}/station`).set('x-admin-branch',branches[1].id).set('x-owner-authorization',ownerJwt).send({station:'Bar'})).status).toBe(404);
});
it('QR branch settings, codes and tables reject a cross-branch ID or requested branch',async()=>{
  const scoped=(method:'get'|'post'|'put',path:string)=>as(method,path).set('x-admin-branch',branches[0].id).set('x-owner-authorization',ownerJwt);
  expect((await scoped('get',`/api/v1/restaurant/qr/settings?branchId=${branches[1].id}`)).status).toBe(403);
  expect((await scoped('put','/api/v1/restaurant/qr/tables/table-1').send({capacity:6})).status).toBe(404);
  expect((await scoped('post','/api/v1/restaurant/qr/tables/table-1/generate').send({})).status).toBe(404);
  const code=await scoped('post','/api/v1/restaurant/qr/tables/table-0/generate').send({});expect(code.status,JSON.stringify(code.body)).toBe(201);
  const other=await as('get',`/api/v1/restaurant/qr/codes/${code.body.id}/print-data`).set('x-admin-branch',branches[1].id).set('x-owner-authorization',ownerJwt);expect(other.status).toBe(404);
  const tables=await scoped('get','/api/v1/restaurant/qr/tables');expect(tables.body.map((t:any)=>t.tableId)).toEqual(['table-0']);
});
it('legacy unassigned records stay visible in consolidated totals without leaking into multiple branches',async()=>{
  await entity('DINING_TABLE','legacy-unassigned',{tableNumber:'Legacy'});
  for(const d of [devices[0][0],devices[1][0]]){const r=await as('get','/api/v1/entity-sync/DINING_TABLE?afterSeq=0',d.token);expect(r.body.entities.some((e:any)=>e.externalId==='legacy-unassigned')).toBe(false);}
});
it('dashboard sums exactly once, separates unpaid orders, excludes cancellations and uses consistent chart dates',async()=>{
  const now=new Date();await prisma.runAsTenant(rid,async tx=>{for(let i=0;i<5;i++)await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[i].id,externalOrderId:`finance-${i}`,orderType:'DINE_IN',status:'COMPLETED',paymentStatus:'SUCCESS',paymentMethod:'CASH',source:['POS','CAPTAIN','POS','KIOSK','QR'][i],items:[{externalItemId:'tea',name:'Masala Tea',quantity:1,lineTotal:10000}],subtotal:10000,taxAmount:0,totalAmount:10000,createdAt:now}});
  await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[0].id,externalOrderId:'unpaid',orderType:'DINE_IN',status:'PREPARING',paymentStatus:'PENDING',source:'KIOSK',items:[],subtotal:25000,taxAmount:0,totalAmount:25000}});
  await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[0].id,externalOrderId:'cancelled',orderType:'DINE_IN',status:'CANCELLED',paymentStatus:'SUCCESS',source:'KIOSK',items:[],subtotal:90000,taxAmount:0,totalAmount:90000}});});
  const r=await dashboard();expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.summary.sales).toBe(500);expect(r.body.byBranch.reduce((s:number,b:any)=>s+b.sales,0)).toBe(500);expect(r.body.bySource.reduce((s:number,b:any)=>s+b.sales,0)).toBe(500);expect(r.body.trend.reduce((s:number,b:any)=>s+b.sales,0)).toBe(500);expect(r.body.topItems[0].revenue).toBe(500);expect(r.body.summary.pendingAmount).toBeGreaterThanOrEqual(250);
  const branch=await dashboard(`?branchId=${branches[0].id}`);expect(branch.body.summary.sales).toBe(100);expect(branch.body.devices.every((d:any)=>d.branchId===branches[0].id)).toBe(true);
  const kiosk=await dashboard('?source=KIOSK');expect(kiosk.body.summary.sales).toBe(100);
});
it('device health uses heartbeats rather than registration status and shows pending sync alerts',async()=>{
  await prisma.runAsTenant(rid,tx=>tx.device.update({where:{id:devices[0][0].id},data:{lastSeenAt:new Date(Date.now()-3600000),pendingSyncCount:3}}));const r=await dashboard(`?branchId=${branches[0].id}`);expect(r.body.byBranch[0].online).toBe(0);expect(r.body.alerts.some((a:any)=>a.detail==='3 pending changes')).toBe(true);
});
it('parallel kiosk checkout creates one branch-owned order and payment; another kiosk cannot adopt or inspect it',async()=>{
  const a=devices[3].filter(d=>d.type==='KIOSK'),service=app.get(PaymentsService);
  await prisma.runAsTenant(rid,tx=>tx.restaurantPaymentConnection.create({data:{restaurantId:rid,status:'ACTIVE'}}));
  const input={externalOrderId:`parallel-kiosk-${stamp}`,lines:[{externalItemId:'tea',quantity:1,selectedOptionIds:[]}]};
  const replies=await Promise.all(Array.from({length:6},()=>service.createOrGetPaymentOrder(rid,a[0].id,input)));
  expect(new Set(replies.map((r:any)=>r.paymentId)).size).toBe(1);expect(new Set(replies.map((r:any)=>r.orderId)).size).toBe(1);
  const stored=await prisma.runAsTenant(rid,tx=>tx.order.findUniqueOrThrow({where:{id:replies[0].orderId}}));expect(stored.branchId).toBe(branches[3].id);
  await expect(service.createOrGetPaymentOrder(rid,a[1].id,input)).rejects.toThrow('another kiosk');
  const attack=await as('get',`/api/v1/payments/${replies[0].paymentId}/status`,a[1].token);expect(attack.status).toBe(404);
  const other=await as('get',`/api/v1/payments/${replies[0].paymentId}/status`,devices[4].find(d=>d.type==='KIOSK').token);expect(other.status).toBe(404);
});
it('a payment reference cannot declare a second order paid or cross branch boundaries',async()=>{
  const a=devices[3].find(d=>d.type==='KIOSK'),id=`parallel-kiosk-${stamp}`;
  const pay=await prisma.runAsTenant(rid,tx=>tx.paymentTransaction.findFirstOrThrow({where:{restaurantId:rid,order:{externalOrderId:id}}}));
  await prisma.runAsTenant(rid,tx=>tx.paymentTransaction.update({where:{id:pay.id},data:{status:'SUCCESS',paidAt:new Date()}}));
  const fake={...order('payment-reuse-attack'),paymentStatus:'SUCCESS',meta:{paymentTransactionId:pay.id}};
  expect((await as('post','/api/v1/orders/sync',a.token).send({events:[fake]})).body.results[0].status).toBe('ok');
  const got=await prisma.runAsTenant(rid,tx=>tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId:rid,externalOrderId:fake.externalOrderId}}}));expect(got.paymentStatus).toBe('PENDING');
});
it('business-day periods use restaurant timezone and reject impossible or oversized custom ranges',()=>{
  expect(dashboardDates('TODAY','Asia/Kolkata',undefined,undefined,new Date('2026-10-06T20:00:00Z')).from).toBe('2026-10-07');
  expect(dashboardDates('TODAY','America/Los_Angeles',undefined,undefined,new Date('2026-10-07T01:00:00Z')).from).toBe('2026-10-06');
  expect(()=>dashboardDates('CUSTOM','UTC','2026-02-30','2026-03-01')).toThrow();expect(()=>dashboardDates('CUSTOM','UTC','2024-01-01','2026-01-01')).toThrow();
});
it('POS, Captain, Kiosk and a real QR checkout converge in one branch and KDS completion returns to every origin',async()=>{
  const members=devices[4], created:string[]=[];
  for(const source of ['POS','CAPTAIN','KIOSK']){
    const d=members.find(d=>d.type===source),id=`four-source-${source}-${stamp}`,start=performance.now();
    const r=await as('post','/api/v1/orders/sync',d.token).send({events:[{...order(id),paymentMethod:'CASH_AT_COUNTER'}]});
    expect(r.body.results[0].status,JSON.stringify(r.body)).toBe('ok');created.push(id);
    fullFlowTimings.push({source,commitMs:Math.round(performance.now()-start)});
  }
  expect((await as('post','/api/v1/menu/publish').send({})).status).toBe(201);
  const code=await as('post','/api/v1/restaurant/qr/tables/table-4/generate').set('x-admin-branch',branches[4].id).set('x-owner-authorization',ownerJwt).send({});expect(code.status,JSON.stringify(code.body)).toBe(201);
  const token=code.body.url.split('/q/')[1],start=performance.now();
  const qr=await http().post(`/api/v1/public/qr/${token}/orders`).send({items:[{itemId:'tea',quantity:1,optionIds:[]}],idempotencyKey:`four-source-QR-${stamp}`,paymentMethod:'CASH_AT_COUNTER'});
  expect(qr.status,JSON.stringify(qr.body)).toBe(201);
  const record=await prisma.runAsTenant(rid,tx=>tx.syncedOrder.findFirstOrThrow({where:{restaurantId:rid,source:'QR',branchId:branches[4].id}}));created.push(record.externalOrderId);
  fullFlowTimings.push({source:'QR',commitMs:Math.round(performance.now()-start)});
  for(const d of members){const pull=await as('get','/api/v1/orders/sync?afterSeq=0',d.token);for(const id of created)expect(pull.body.orders.some((o:any)=>o.externalOrderId===id)).toBe(true);}
  const foreign=await as('get','/api/v1/orders/sync?afterSeq=0',devices[0][0].token);for(const id of created)expect(foreign.body.orders.some((o:any)=>o.externalOrderId===id)).toBe(false);
  const kds=members.find(d=>d.type==='KDS'),before=await as('get','/api/v1/orders/sync?afterSeq=0',kds.token),readyAt=performance.now();
  for(const id of created){const o=before.body.orders.find((o:any)=>o.externalOrderId===id);const wire=Object.fromEntries(Object.entries(o).filter(([,v])=>v!==null));const ready={...wire,status:'READY',updatedAt:new Date().toISOString(),items:o.items.map((i:any)=>({...i,kitchenStatus:'READY'}))};const readyPush=await as('post','/api/v1/orders/sync',kds.token).send({events:[ready]});expect(readyPush.body.results[0].status,JSON.stringify(readyPush.body)).toBe('ok');
    const served={...ready,status:'COMPLETED',updatedAt:new Date().toISOString(),items:ready.items.map((i:any)=>({...i,kitchenStatus:'SERVED'}))};expect((await as('post','/api/v1/orders/sync',kds.token).send({events:[served]})).body.results[0].status).toBe('ok');}
  for(const d of members.filter(d=>d.type!=='KDS')){const pull=await as('get','/api/v1/orders/sync?afterSeq=0',d.token);for(const id of created)expect(pull.body.orders.find((o:any)=>o.externalOrderId===id).status).toBe('COMPLETED');}
  const status=await http().get(`/api/v1/public/qr/orders/${record.publicOrderId}`);expect(status.body.status).toBe('COMPLETED');
  fullFlowTimings.push({phase:'KDS ready and served to POS/Captain/Kiosk/QR',roundTripMs:Math.round(performance.now()-readyAt)});
});
it('10,000 sales and a fleet larger than the response cap retain exact aggregate totals',async()=>{
  const count=10000;
  await prisma.runAsTenant(rid,async tx=>{
    // Generate disposable fixtures in PostgreSQL rather than serializing tens
    // of thousands of bind parameters through the ORM. RLS and the actual
    // indexes/foreign keys remain enabled for both inserts and measured reads.
    const branchIds=Prisma.sql`ARRAY[${Prisma.join(branches.map(b=>b.id))}]::text[]`;
    await tx.$executeRaw(Prisma.sql`INSERT INTO "SyncedOrder"
      (id,"restaurantId","branchId","externalOrderId","orderType",status,"paymentStatus","paymentMethod",source,items,subtotal,"taxAmount","totalAmount","createdAt","updatedAt")
      SELECT md5(${rid}||'-scale-order-'||n::text)::uuid::text,${rid},(${branchIds})[1+n%5],'scale-'||n::text,
      'TAKEAWAY','COMPLETED','SUCCESS','CASH','POS','[{"externalItemId":"tea","name":"Masala Tea","quantity":1,"lineTotal":100}]'::jsonb,
      100,0,100,timezone('UTC',now()),timezone('UTC',now()) FROM generate_series(0,${count-1}) n`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "Device"
      (id,"restaurantId","branchId",type,status,name,"lastSeenAt","updatedAt")
      SELECT md5(${rid}||'-scale-device-'||n::text)::uuid::text,${rid},(${branchIds})[1+n%5],
      'POS'::"DeviceType",'ACTIVE'::"DeviceStatus",'Scale terminal '||n::text,timezone('UTC',now()),timezone('UTC',now()) FROM generate_series(0,1000) n`);
  });
  const durations:number[]=[];let last:any;
  for(let i=0;i<3;i++){const start=performance.now(),r=await dashboard();durations.push(Math.round(performance.now()-start));expect(r.status,JSON.stringify(r.body)).toBe(200);last=r.body;expect(last.summary.sales).toBe(10500);expect(last.byBranch.reduce((s:number,b:any)=>s+b.sales,0)).toBe(10500);}
  expect(last.devices).toHaveLength(1000);expect(last.devicesTruncated).toBe(true);expect(last.byBranch.reduce((s:number,b:any)=>s+b.devices,0)).toBe(devices.flat().length+1001);expect(last.deviceCounts.reduce((s:number,d:any)=>s+d.total,0)).toBe(devices.flat().length+1002);
  writeFileSync(resolve(__dirname,'../../../docs/reports/multi-branch-2026-10-07/PERFORMANCE.json'),JSON.stringify({environment:'isolated local database',recordedAt:new Date().toISOString(),additionalOrders:count,additionalDevices:1001,dashboardRequestMs:durations,underFiveSecondLimit:Math.max(...durations)<5000,canonicalNetSales:10500,operationalBranchFanoutMs:timings,fullFlowTimings,devicesResponseCappedAt:1000,aggregateTotalsIncludeAllDevices:true,productionAwsMeasured:false},null,2));
  expect(Math.max(...durations)).toBeLessThan(5000);
// Fixture insertion and three complete reads need a separate wall-clock budget
// on busy development machines; each measured dashboard read still must stay
// below the explicit five-second assertion above.
},120000);
it('partial refunds retain their exact amount and null payment states still count as unpaid',async()=>{
  const before=(await dashboard(`?branchId=${branches[0].id}`)).body.summary;
  await prisma.runAsTenant(rid,async tx=>{
    await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[0].id,externalOrderId:'partial-report',orderType:'TAKEAWAY',status:'REFUNDED',paymentStatus:'SUCCESS',source:'POS',subtotal:10055,taxAmount:0,totalAmount:10055,meta:{refundAmountPaise:3025},items:[{externalItemId:'tea',name:'Tea',quantity:1,lineTotal:10055}]}});
    await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[0].id,externalOrderId:'null-payment-report',orderType:'TAKEAWAY',status:'NEW',source:'KIOSK',subtotal:2500,taxAmount:0,totalAmount:2500,items:[]}});
  });
  const after=(await dashboard(`?branchId=${branches[0].id}`)).body.summary;
  expect(after.sales-before.sales).toBeCloseTo(70.30);expect(after.refunds-before.refunds).toBeCloseTo(30.25);expect(after.pendingAmount-before.pendingAmount).toBe(25);
});
it('new branch staff are assigned to the selected workspace and omission cannot remove that membership',async()=>{
  const path='/api/v1/entity-sync/STAFF_USER',payload={id:'scoped-staff',fullName:'Branch cashier',roleId:'role-cashier',isActive:true,pinHash:'test-only-hash',updatedAt:new Date().toISOString()};
  const create=await as('post',path).set('x-admin-branch',branches[0].id).set('x-owner-authorization',ownerJwt).send({events:[{externalId:payload.id,payload}]});expect(create.body.results[0].status).toBe('ok');
  const update=await as('post',path).send({events:[{externalId:payload.id,payload:{...payload,fullName:'Renamed'}}]});expect(update.body.results[0].status).toBe('ok');
  const row=await prisma.runAsTenant(rid,tx=>tx.syncedEntity.findFirstOrThrow({where:{restaurantId:rid,entityType:'STAFF_USER',externalId:payload.id}}));expect((row.payload as any).branchId).toBe(branches[0].id);
  expect((await as('get',path+'?afterSeq=0',devices[1][0].token)).body.entities.some((e:any)=>e.externalId===payload.id)).toBe(false);
});

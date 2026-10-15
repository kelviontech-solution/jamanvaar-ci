import request from 'supertest';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {createTestApp,createTestPlatformUser,platformLogin} from './helpers';
import {PrismaService} from '../src/prisma/prisma.service';
import {ApplicationEntitlementsService} from '../src/modules/application-entitlements/application-entitlements.service';
import {AiAssistantService} from '../src/modules/ai-assistant/ai-assistant.service';
import {QrSettingsService} from '../src/modules/qr/qr-settings.service';

describe('generic owner entry, QR grants and AI under mixed subscriptions',()=>{
 let app:any,prisma:PrismaService,ent:ApplicationEntitlementsService,ai:AiAssistantService,platform:string;
 let restaurantId:string,branchId:string,planId:string,subscriptionId:string,device:string,owner:string;
 const stamp=Date.now(),email=`owner-console-${stamp}@example.com`,password='Owner-QA9!Restaurant';
 const planIds:string[]=[];
 const http=()=>request(app.getHttpServer());
 const p=(method:'get'|'post'|'patch',url:string)=>http()[method](url).set('Authorization',`Bearer ${platform}`);
 const d=(method:'get'|'post',url:string)=>http()[method](url).set('Authorization',`Bearer ${device}`).set('x-owner-authorization',`Bearer ${owner}`);
 const resolve=()=>prisma.runAsPlatform(tx=>ent.resolve(tx,restaurantId,'QR_ORDERING'));
 beforeAll(async()=>{
  app=await createTestApp();prisma=app.get(PrismaService);ent=app.get(ApplicationEntitlementsService);ai=app.get(AiAssistantService);
  await createTestPlatformUser(prisma,{email,password});platform=(await platformLogin(app,email,password)).body.accessToken;
  const plan=await p('post','/api/v1/plans').send({tier:'QR',name:`TEST Owner console QR ${stamp}`,priceMonthly:10000,maxBranches:3,maxDevices:10,maxUsers:5,entitlements:{qrTableOrdering:true,posAssistant:true}});
  expect(plan.status,JSON.stringify(plan.body)).toBe(201);planId=plan.body.id;planIds.push(planId);
  const r=await p('post','/api/v1/restaurants').send({name:`TEST Owner console ${stamp}`,ownerName:'Owner',ownerEmail:email,ownerPassword:password,skipInviteEmail:true});expect(r.status,JSON.stringify(r.body)).toBe(201);restaurantId=r.body.restaurant.id;branchId=r.body.branch.id;
  const sub=await p('post','/api/v1/subscriptions').send({restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString()});expect(sub.status,JSON.stringify(sub.body)).toBe(201);subscriptionId=sub.body.id;
 },90000);
 afterAll(async()=>{await prisma.runAsPlatform(async tx=>{await tx.restaurant.deleteMany({where:{id:restaurantId}});await tx.plan.deleteMany({where:{id:{in:planIds}}});});await prisma.platformUser.deleteMany({where:{email}});await app.close();});
 it('new QR plans do not implicitly grant POS, KDS, Captain or Restaurant Admin',async()=>{
  const restaurant=await prisma.runAsPlatform(tx=>tx.restaurant.findUniqueOrThrow({where:{id:restaurantId}}));expect(restaurant.restaurantCode).toMatch(/^JM\d{10}$/);
  const apps=await prisma.runAsPlatform(tx=>ent.listEnabledAppCodesForTenant(tx,restaurantId));expect(apps).toEqual(['QR_ORDERING']);
 });
 it('QR-only owner activates through the common login without specifying a product',async()=>{
  const key=await p('post','/api/v1/activation-keys').send({restaurantId,branchId,allowedDeviceType:'POS_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});expect(key.status).toBe(201);
  const login=await http().post('/api/v1/tenant-auth/login-owner').send({restaurantId,password,deviceType:'POS_ADMIN'});expect(login.status,JSON.stringify(login.body)).toBe(200);expect(login.body.requiresActivation).toBe(true);
  const activate=await http().post('/api/v1/tenant-auth/activate-device').send({activationSessionToken:login.body.activationSessionToken,activationKey:key.body.code,deviceType:'POS_ADMIN',deviceName:'QR-only owner console'});
  expect([200,201],JSON.stringify(activate.body)).toContain(activate.status);device=activate.body.deviceToken;owner=activate.body.accessToken;expect(device).toBeTruthy();
  expect((await http().get('/api/v1/tenant/me/applications').set('Authorization',`Bearer ${owner}`)).body.enabledApps).toEqual(['QR_ORDERING']);
 });
 it('QR-only management has menu and AI access but cannot read restaurant inventory/customer sync',async()=>{
  expect((await d('get','/api/v1/entity-sync/MENU_ITEM')).status).toBe(200);
  expect((await d('get','/api/v1/restaurant/qr/branches')).status).toBe(200);
  expect((await d('get','/api/v1/devices/me/ai-config')).body.state).toBe('ON');
  for(const path of ['/api/v1/entity-sync/INVENTORY_ITEM','/api/v1/entity-sync/CUSTOMER'])expect((await d('get',path)).status).toBe(403);
 });
 it('platform can pause online service while preserving the QR management license',async()=>{
  try{
   expect((await p('patch',`/api/v1/qr-ordering/restaurants/${restaurantId}/entitlement`).send({qrOrderingEnabled:false,onlinePayments:false,guestCustomization:false,liveOrderTracking:false})).status).toBe(200);
   const detail=(await p('get',`/api/v1/qr-ordering/restaurants/${restaurantId}`)).body;
   expect(detail.entitlement).toMatchObject({qrEntitled:true,qrOrderingEnabled:false,onlinePayments:false});
   expect(detail.restaurant.status).toBe('DISABLED');
   expect(await app.get(QrSettingsService).effective(restaurantId,branchId)).toMatchObject({orderingEnabled:false,allowOnlinePayment:false,allowModifiers:false,showOrderStatus:false});
   expect((await resolve()).enabled).toBe(true);
  }finally{await p('patch',`/api/v1/qr-ordering/restaurants/${restaurantId}/entitlement`).send({qrOrderingEnabled:true,onlinePayments:true,guestCustomization:true,liveOrderTracking:true});}
 });
 it.each([{capabilities:{QR_FAKE:true}},{capabilities:{QR_LOYALTY:'true'}},{qrEntitled:'true'},{otherTenant:'another-restaurant'},{maxOrdersPerDay:-1}])('rejects invalid platform QR configuration %j',async body=>{expect((await p('patch',`/api/v1/qr-ordering/restaurants/${restaurantId}/entitlement`).send(body)).status).toBe(400);});
 it('overlapping QR grants combine capabilities and platform overrides affect all grants',async()=>{
  const original=await prisma.runAsPlatform(tx=>tx.applicationEntitlement.findUniqueOrThrow({where:{subscriptionId_appCode:{subscriptionId,appCode:'QR_ORDERING'}}}));
  const secondary=await prisma.runAsPlatform(tx=>tx.subscription.create({data:{restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000),applicationEntitlements:{create:{restaurantId,appCode:'QR_ORDERING',enabled:true,config:{qrLoyalty:true,qrMaxOrdersPerDay:25}}}}}));
  try{
   expect((await resolve()).limits.qrLoyalty).toBe(true);
   expect((await resolve()).limits.qrMaxOrdersPerDay).toBeNull();
   const path=`/api/v1/qr-ordering/restaurants/${restaurantId}/entitlement`;
   expect((await p('patch',path).send({capabilities:{QR_LOYALTY:false}})).status).toBe(200);expect((await resolve()).limits.qrLoyalty).toBe(false);
   expect((await p('patch',path).send({capabilities:{QR_LOYALTY:true},maxOrdersPerDay:50})).status).toBe(200);expect((await resolve()).limits.qrLoyalty).toBe(true);expect((await resolve()).limits.qrMaxOrdersPerDay).toBe(50);
   const detail=(await p('get',`/api/v1/qr-ordering/restaurants/${restaurantId}`)).body;expect(detail.entitlement.capabilityStatus).toHaveLength(17);
   expect((await p('patch',path).send({qrEntitled:false})).status).toBe(200);expect((await resolve()).enabled).toBe(false);
  }finally{await prisma.runAsPlatform(async tx=>{await tx.subscription.delete({where:{id:secondary.id}});await tx.applicationEntitlement.update({where:{id:original.id},data:{enabled:original.enabled,config:original.config as any}});});}
 });
 it('legacy finite caps remain enforced and explicit null clears a legacy cap',async()=>{
  const row=await prisma.runAsPlatform(tx=>tx.applicationEntitlement.findUniqueOrThrow({where:{subscriptionId_appCode:{subscriptionId,appCode:'QR_ORDERING'}}}));
  try{
   await prisma.runAsPlatform(tx=>tx.applicationEntitlement.update({where:{id:row.id},data:{config:{maxOrdersPerDay:7,maxActiveTables:3}}}));
   expect((await resolve()).limits).toMatchObject({qrMaxOrdersPerDay:7,qrMaxActiveTables:3});
   await prisma.runAsPlatform(tx=>tx.applicationEntitlement.update({where:{id:row.id},data:{config:{maxOrdersPerDay:7,qrMaxOrdersPerDay:null,maxActiveTables:3,qrMaxActiveTables:null}}}));
   expect((await resolve()).limits).toMatchObject({qrMaxOrdersPerDay:null,qrMaxActiveTables:null});
  }finally{await prisma.runAsPlatform(tx=>tx.applicationEntitlement.update({where:{id:row.id},data:{config:row.config as any}}));}
 });
 it('newer non-AI plans do not hide a valid AI grant from another subscription',async()=>{
  const plan=await p('post','/api/v1/plans').send({tier:'CORE',name:`TEST Owner console base ${stamp}`,priceMonthly:0,maxBranches:1,maxDevices:5,maxUsers:5,entitlements:{posAssistant:false}});expect(plan.status).toBe(201);planIds.push(plan.body.id);
  const sub=await prisma.runAsPlatform(tx=>tx.subscription.create({data:{restaurantId,planId:plan.body.id,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000)}}));
  try{expect((await ai.resolve(restaurantId)).state).toBe('ON');expect((await ai.resolve(restaurantId)).planName).toContain('Owner console QR');}finally{await prisma.runAsPlatform(tx=>tx.subscription.delete({where:{id:sub.id}}));}
 });
 it('platform multi-grant changes roll back completely if one grant fails',async()=>{
  const second=await prisma.runAsPlatform(tx=>tx.subscription.create({data:{restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000),applicationEntitlements:{create:{restaurantId,appCode:'QR_ORDERING',enabled:true}}}}));
  const before=await prisma.runAsPlatform(tx=>tx.applicationEntitlement.findMany({where:{restaurantId,appCode:'QR_ORDERING'},orderBy:{id:'asc'}}));
  const original=ent.update.bind(ent);let count=0;
  const spy=vi.spyOn(ent,'update').mockImplementation(async(...args)=>{if(++count === 2)throw Error('Isolated rollback fixture');return original(...args);});
  try{
   expect((await p('patch',`/api/v1/qr-ordering/restaurants/${restaurantId}/entitlement`).send({capabilities:{QR_LOYALTY:true}})).status).toBe(500);
   const after=await prisma.runAsPlatform(tx=>tx.applicationEntitlement.findMany({where:{restaurantId,appCode:'QR_ORDERING'},orderBy:{id:'asc'}}));
   expect(after.map(r=>({id:r.id,enabled:r.enabled,config:r.config}))).toEqual(before.map(r=>({id:r.id,enabled:r.enabled,config:r.config})));
  }finally{spy.mockRestore();await prisma.runAsPlatform(tx=>tx.subscription.delete({where:{id:second.id}}));}
 });
 it('platform analytics disabling is enforced by the QR API',async()=>{
  const path=`/api/v1/qr-ordering/restaurants/${restaurantId}/entitlement`;
  try{expect((await p('patch',path).send({qrAnalytics:false})).status).toBe(200);expect((await d('get','/api/v1/restaurant/qr/analytics')).status).toBe(403);}finally{await p('patch',path).send({qrAnalytics:true});}
 });
 it('expired subscriptions cannot grant menu navigation or AI even with an ON override',async()=>{
  const sub=await prisma.runAsPlatform(tx=>tx.subscription.findUniqueOrThrow({where:{id:subscriptionId}}));
  try{await prisma.runAsPlatform(async tx=>{await tx.subscription.update({where:{id:subscriptionId},data:{expiresAt:new Date(Date.now()-1000)}});await tx.restaurantAiAccess.upsert({where:{restaurantId},create:{restaurantId,state:'ON'},update:{state:'ON'}});});
   expect(await prisma.runAsPlatform(tx=>ent.listEnabledAppCodesForTenant(tx,restaurantId))).toEqual([]);expect((await resolve()).enabled).toBe(false);expect((await ai.resolve(restaurantId)).state).toBe('OFF');
  }finally{await prisma.runAsPlatform(async tx=>{await tx.subscription.update({where:{id:subscriptionId},data:{expiresAt:sub.expiresAt}});await tx.restaurantAiAccess.update({where:{restaurantId},data:{state:null}});});}
 });
 it('AI quota cannot be overrun by concurrent queries across devices',async()=>{
  const baseline=await ai.resolve(restaurantId);
  await prisma.runAsPlatform(tx=>tx.restaurantAiAccess.update({where:{restaurantId},data:{dailyQueryLimit:baseline.usedToday+1}}));
  try{const results=await Promise.allSettled([ai.logTelemetry(restaurantId,'TODAY_SALES',2),ai.logTelemetry(restaurantId,'TODAY_ORDERS',2),ai.logTelemetry(restaurantId,'AOV',2)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await ai.resolve(restaurantId)).usedToday).toBe(baseline.usedToday+1);}finally{await prisma.runAsPlatform(tx=>tx.restaurantAiAccess.update({where:{restaurantId},data:{dailyQueryLimit:null}}));}
 });
});

import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { WhatsAppOutboundWebhookService } from '../src/modules/whatsapp-outbound/whatsapp-outbound-webhook.service';
import request from 'supertest';
import { randomUUID, pbkdf2Sync } from 'node:crypto';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { decideStatus } from '../src/modules/order-sync/order-rules';

// Audit-only probes: assert the observed unsafe behavior, rather than pretending it is a protection.
// All rows belong to fresh synthetic restaurants in a dedicated test database.
describe('2026-10-11 independent assessment probes', () => {
  let app:any, prisma:PrismaService, restaurantId:string, otherRestaurantId:string, planId:string, posToken:string, kdsToken:string;
  const email=`assessment-${Date.now()}@example.invalid`;
  const as=(token:string,path:string,body:object)=>request(app.getHttpServer()).post(path).set('Authorization','Bearer '+token).send(body);
  beforeAll(async()=>{
    app=await createTestApp(); prisma=app.get(PrismaService);
    await createTestPlatformUser(prisma,{email,password:'Assessment-only-password-7!'});
    const token=(await platformLogin(app,email,'Assessment-only-password-7!')).body.accessToken;
    const platform=(path:string,body:object)=>as(token,path,body);
    const r=await platform('/api/v1/restaurants',{name:'TEST Independent Assessment',ownerName:'Test Owner',ownerEmail:email,skipInviteEmail:true});
    expect(r.status).toBe(201); restaurantId=r.body.restaurant.id;
    otherRestaurantId=(await prisma.runAsPlatform(tx=>tx.restaurant.create({data:{name:'TEST RLS Assessment Other'}}))).id;
    const p=await platform('/api/v1/plans',{name:'TEST Assessment '+Date.now(),tier:'PRO',priceMonthly:10000,maxBranches:2,maxDevices:8,maxUsers:8,entitlements:{posTerminal:true,restaurantAdmin:true,kotKdsRouting:true}});
    expect(p.status).toBe(201);planId=p.body.id;
    await platform('/api/v1/subscriptions',{restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString()});
    const branchId=(await prisma.runAsTenant(restaurantId,tx=>tx.branch.findFirstOrThrow({where:{restaurantId}}))).id;
    for(const kind of ['POS','KDS']){
      const key=await platform('/api/v1/activation-keys',{restaurantId,branchId,allowedDeviceType:kind,expiresAt:new Date(Date.now()+86400000).toISOString()});expect(key.status).toBe(201);
      const d=await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({code:key.body.code,deviceType:kind});expect(d.status).toBe(201);
      if(kind==='POS')posToken=d.body.deviceToken;else kdsToken=d.body.deviceToken;
    }
  },120000);
  afterAll(async()=>{
    if(prisma){await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:{in:[restaurantId,otherRestaurantId].filter(Boolean)}}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.platformUser.deleteMany({where:{email}});}
    await app?.close();
  });
  it('CONFIRMED: a POS device bearer alone creates a manager and obtains signed manager approval',async()=>{
    const salt=Buffer.from('independent-audit-only');
    const pin='674829';
    const pinHash='pinv2:'+salt.toString('hex')+':'+pbkdf2Sync(restaurantId+':'+pin,salt,100000,32,'sha256').toString('hex');
    const r=await as(posToken,'/api/v1/entity-sync/STAFF_USER',{events:[{externalId:'audit-manager',payload:{id:'audit-manager',fullName:'Synthetic Audit Manager',roleId:'role-manager',isActive:true,pinHash,updatedAt:new Date().toISOString()}}]});
    expect(r.status).toBe(201);expect(r.body.results[0].status).toBe('ok');
    const proof=await as(posToken,'/api/v1/staff/verify-manager-pin',{pin});
    expect(proof.status).toBe(201);expect(proof.body.roleId).toBe('role-manager');expect(proof.body.approvalToken).toBeTruthy();
    // Negative control: the same creation request is forbidden to a kitchen terminal.
    expect((await as(kdsToken,'/api/v1/entity-sync/STAFF_USER',{events:[{externalId:'audit-manager',payload:{roleId:'role-manager'}}]})).status).toBe(403);
  });
  it('CONFIRMED: three newer tenant tables allow unscoped reads even using the non-bypass QA role',async()=>{
    const role=await prisma.$queryRaw<any[]>`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    expect(role[0].rolsuper).toBe(false);expect(role[0].rolbypassrls).toBe(false);
    const connection=await prisma.runAsTenant(restaurantId,tx=>tx.whatsAppChannelConnection.create({data:{restaurantId,keyPrefix:'audit',keyHash:randomUUID()}}));
    const delivery=await prisma.runAsTenant(restaurantId,tx=>tx.outboundWebhookDelivery.create({data:{restaurantId,eventType:'assessment',payload:{synthetic:true}}}));
    const payout=await prisma.runAsTenant(restaurantId,tx=>tx.restaurantPayout.create({data:{restaurantId,businessDate:'ASSESSMENT',grossAmount:100,feeAmount:0,netAmount:100,paymentCount:1}}));
    expect((await prisma.whatsAppChannelConnection.findUnique({where:{id:connection.id}}))?.restaurantId).toBe(restaurantId);
    expect((await prisma.outboundWebhookDelivery.findUnique({where:{id:delivery.id}}))?.restaurantId).toBe(restaurantId);
    expect((await prisma.restaurantPayout.findUnique({where:{id:payout.id}}))?.restaurantId).toBe(restaurantId);
    expect((await prisma.runAsTenant(otherRestaurantId,tx=>tx.restaurantPayout.findUnique({where:{id:payout.id}})))?.restaurantId).toBe(restaurantId);
    // Negative control: existing RLS-protected Restaurant rejects an unscoped read.
    expect(await prisma.restaurant.findUnique({where:{id:restaurantId}})).toBeNull();
  });
  it('CONFIRMED: an unknown order state bypasses the terminal-state rule',()=>{
    expect(decideStatus('CANCELLED','AUDIT_UNKNOWN','KDS')).toEqual({apply:true,status:'AUDIT_UNKNOWN'});
    expect(decideStatus('AUDIT_UNKNOWN','NEW','KDS')).toEqual({apply:true,status:'NEW'});
    expect(decideStatus('CANCELLED','NEW','KDS').apply).toBe(false);
  });
  it('CONFIRMED: order sync persists the unknown-state terminal bypass through the API',async()=>{
    const externalOrderId='audit-state-'+Date.now();
    const order={externalOrderId,orderType:'TAKEAWAY',status:'CANCELLED',items:[{externalItemId:'audit-item',name:'Synthetic Item',quantity:1,unitPrice:100,lineTotal:100}],subtotal:100,taxAmount:0,totalAmount:100,paymentStatus:'PENDING',updatedAt:new Date().toISOString()};
    expect((await as(posToken,'/api/v1/orders/sync',{events:[order]})).body.results[0].status).toBe('ok');
    for(const status of ['AUDIT_UNKNOWN','NEW']){
      const reply=await as(kdsToken,'/api/v1/orders/sync',{events:[{...order,status,updatedAt:new Date().toISOString()}]});
      expect(reply.body.results[0].status).toBe('ok');
      const stored=await prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId,externalOrderId}}}));
      expect(stored.status).toBe(status);
    }
  });
  it('CONFIRMED DEFAULT: a POS cancellation without staff proof is accepted and flagged',async()=>{
    const externalOrderId='audit-no-staff-'+Date.now();
    const order={externalOrderId,orderType:'TAKEAWAY',status:'NEW',items:[{externalItemId:'audit-item',name:'Synthetic Item',quantity:1,unitPrice:100,lineTotal:100}],subtotal:100,taxAmount:0,totalAmount:100,paymentStatus:'PENDING',updatedAt:new Date().toISOString()};
    expect((await as(posToken,'/api/v1/orders/sync',{events:[order]})).body.results[0].status).toBe('ok');
    expect((await as(posToken,'/api/v1/orders/sync',{events:[{...order,status:'CANCELLED',updatedAt:new Date().toISOString()}]})).body.results[0].status).toBe('ok');
    const stored=await prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId,externalOrderId}}}));
    expect(stored.status).toBe('CANCELLED');expect((stored.meta as any).actorVerified).toBe(false);
  });
  it('CONFIRMED: concurrent webhook delivery attempts send the same pending row twice (external HTTP mocked)',async()=>{
    const row=await prisma.runAsTenant(restaurantId,tx=>tx.outboundWebhookDelivery.create({data:{restaurantId,eventType:'order.status',payload:{synthetic:true}}}));
    const service=new WhatsAppOutboundWebhookService(prisma,new ConfigService({WHATSAPP_CONNECTOR_BASE_URL:'https://example.invalid',JAMANVAAR_SERVICE_SECRET:'assessment-only'}));
    let release:()=>void=()=>{}; const bothStarted=new Promise<void>(r=>{release=r;});let calls=0;
    const fake=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{calls++;if(calls===2)release();await bothStarted;return new Response('',{status:200});});
    try{await Promise.all([service.attempt(row.id),service.attempt(row.id)]);expect(calls).toBe(2);}finally{fake.mockRestore();}
  });
});

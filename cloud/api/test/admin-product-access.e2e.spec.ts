import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('shared POS_ADMIN device retains separate product authority', () => {
  let app: INestApplication, prisma: PrismaService, platformToken: string;
  const stamp = Date.now(), email = `test-admin-products-${stamp}@example.invalid`;
  const password = 'qa-correct-horse-battery-staple';
  const restaurants: string[] = [], plans: string[] = [];
  let kioskConsole: string, posConsole: string, kioskDevice: string, posDevice: string, otherKiosk: string;
  let refreshCookie: string;
  const as = (method: 'get' | 'post' | 'patch', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const platform = (method: 'get' | 'post' | 'patch', url: string) => as(method, url, platformToken);
  async function fixture(family: 'KIOSK' | 'RESTAURANT') {
    const rest = await platform('post','/api/v1/restaurants').send({ name: `TEST ${family} ${stamp}-${restaurants.length}`, ownerName: 'Owner', ownerEmail: `qa-product-${stamp}-${restaurants.length}@example.invalid`, ownerPassword: password, skipInviteEmail: true });
    expect(rest.status).toBe(201); const restaurant = rest.body.restaurant; restaurants.push(restaurant.id);
    const plan = await platform('post','/api/v1/plans').send({ tier:'PRO', productFamily: family, name:`TEST Product ${stamp}-${plans.length}`, priceMonthly: 100000, maxBranches:2, maxDevices:10, maxUsers:10, entitlements:{} }); plans.push(plan.body.id);
    await platform('post','/api/v1/subscriptions').send({restaurantId:restaurant.id,planId:plan.body.id,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString()});
    const key = await platform('post','/api/v1/activation-keys').send({restaurantId:restaurant.id,allowedDeviceType:family==='KIOSK'?'KIOSK_ADMIN':'POS_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});
    // This fixture does not provide a registered mobile, so it has no public restaurant code.
    const login = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({restaurantId:restaurant.id,password,deviceType:'POS_ADMIN'});
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const activated = await request(app.getHttpServer()).post('/api/v1/tenant-auth/activate-device').send({activationSessionToken:login.body.activationSessionToken,activationKey:key.body.code,deviceType:'POS_ADMIN'});
    expect(activated.status).toBe(200);expect(activated.body.activatedProduct).toBe(family==='KIOSK'?'KIOSK_ADMIN':'POS_ADMIN');
    if (family === 'RESTAURANT') refreshCookie = activated.headers['set-cookie'][0].split(';')[0];
    return {restaurant,token:activated.body.deviceToken};
  }
  async function enroll(restaurantId: string, type: 'POS' | 'KIOSK') {
    const key = await platform('post','/api/v1/activation-keys').send({restaurantId,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()});
    const activated = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({code:key.body.code,deviceType:type});
    expect(activated.status).toBe(201);return activated.body.device.id as string;
  }
  beforeAll(async()=>{
    app=await createTestApp();prisma=app.get(PrismaService);await createTestPlatformUser(prisma,{email,password});platformToken=(await platformLogin(app,email,password)).body.accessToken;
    const kiosk=await fixture('KIOSK'), pos=await fixture('RESTAURANT'), other=await fixture('KIOSK');
    kioskConsole=kiosk.token;posConsole=pos.token;kioskDevice=await enroll(kiosk.restaurant.id,'KIOSK');posDevice=await enroll(pos.restaurant.id,'POS');otherKiosk=await enroll(other.restaurant.id,'KIOSK');
  });
  afterAll(async()=>{if(prisma){await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:{in:restaurants}}}));await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:{in:plans}}}));await prisma.platformUser.deleteMany({where:{email}});}await app?.close();});
  it('checks resource permission on each cached verdict, not just the first request',async()=>{
    expect((await as('get','/api/v1/entity-sync/MENU_ITEM?afterSeq=0',kioskConsole)).status).toBe(200);
    expect((await as('get','/api/v1/entity-sync/%49NVENTORY_ITEM?afterSeq=0',kioskConsole)).status).toBe(403);
    for(const entity of ['INVENTORY_ITEM','CUSTOMER','SHIFT','RESERVATION']) {
      const response=await as('get',`/api/v1/entity-sync/${entity}?afterSeq=0`,kioskConsole);expect(response.status).toBe(403);expect(response.body.code).toBe('PRODUCT_ACCESS_DENIED');
    }
    expect((await as('get','/api/v1/entity-sync/MENU_ITEM?afterSeq=0',kioskConsole)).status).toBe(200);
  });
  it('rejects POS-only mutations without persisting data',async()=>{
    const response=await as('post','/api/v1/entity-sync/INVENTORY_ITEM',kioskConsole).send({events:[{externalId:'qa-denied',payload:{id:'qa-denied',name:'Denied inventory'}}]});expect(response.status).toBe(403);
    const count=await prisma.runAsPlatform(tx=>tx.syncedEntity.count({where:{restaurantId:restaurants[0],externalId:'qa-denied'}}));expect(count).toBe(0);
  });
  it('retains valid Restaurant Admin reads and shared receipt configuration',async()=>{
    expect((await as('get','/api/v1/entity-sync/INVENTORY_ITEM?afterSeq=0',posConsole)).status).toBe(200);
    expect((await as('get','/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0',posConsole)).status).toBe(200);
  });
  it('allows more than 20 legitimate session restorations behind one IP without weakening owner password login throttling',async()=>{
    for (let i=0;i<22;i++) {
      const response=await request(app.getHttpServer()).post('/api/v1/tenant-auth/refresh').set('Cookie',refreshCookie).send({});
      expect(response.status).toBe(200);expect(response.body.accessToken).toBeTruthy();
      refreshCookie=response.headers['set-cookie'][0].split(';')[0];
    }
  });
  it('keeps kiosk-only fleet and commands tenant-bound even though its physical device is POS_ADMIN',async()=>{
    const fleet=await as('get','/api/v1/devices/me/fleet',kioskConsole);expect(fleet.status).toBe(200);expect(fleet.body.devices.map((d:any)=>d.id)).toContain(kioskDevice);expect(fleet.body.devices.map((d:any)=>d.id)).not.toContain(otherKiosk);expect(fleet.body.devices.every((d:any)=>d.type==='KIOSK'||d.type==='KIOSK_ADMIN')).toBe(true);
    expect((await as('post',`/api/v1/devices/me/fleet/${otherKiosk}/commands`,kioskConsole).send({commandType:'LOCK'})).status).toBe(404);
    expect((await as('post',`/api/v1/devices/me/fleet/${posDevice}/commands`,kioskConsole).send({commandType:'LOCK'})).status).toBe(404);
    expect((await as('post',`/api/v1/devices/me/fleet/${kioskDevice}/commands`,kioskConsole).send({commandType:'LOCK'})).status).toBe(201);
  });
  it('marks a kiosk-only shared console enabled in the offline Branch Core roster',async()=>{
    const response=await as('get','/api/v1/devices/me/roster',kioskConsole);expect(response.status).toBe(200);
    expect(response.body.devices.find((d:any)=>d.type==='POS_ADMIN')?.appEnabled).toBe(true);
    expect(response.body.subscription.enabledApps).toContain('KIOSK_ADMIN');
    expect(response.body.subscription.enabledApps).not.toContain('POS_ADMIN');
  });
});

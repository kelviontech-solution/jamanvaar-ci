import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { createTestApp, createTestPlatformUser, platformLogin, ownerDeviceSession } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRestaurantPageService } from '../src/modules/qr/qr-restaurant-page.service';
import { QrMenuService } from '../src/modules/qr/qr-menu.service';
import { MenuPublicationsService } from '../src/modules/menu-publications/menu-publications.service';
import { TENANT_JWT_AUDIENCE, TENANT_JWT_ISSUER } from '../src/modules/tenant-auth/tenant-auth.service';
let app: any,
  prisma: PrismaService,
  platform: string,
  owner: string,
  rid: string,
  branch: string,
  second: string,
  other: string,
  deviceToken: string,
  deviceId: string,
  manager: string,
  planId: string;
const stamp = Date.now(),
  email = `page-${stamp}@example.invalid`,
  password = 'PageAcceptance9!',
  created: string[] = [];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgWQAAAAASUVORK5CYII=';
const http = () => request(app.getHttpServer());
const platformPost = (path: string, body: any) =>
  http()
    .post('/api/v1/' + path)
    .set('Authorization', 'Bearer ' + platform)
    .send(body);
const api = (method: 'get' | 'put' | 'post', scope = 'restaurant', path = '', body?: string | object, token = owner) =>
  http()
    [method]('/api/v1/tenant/qr-page' + path + '?scope=' + scope)
    .set('Authorization', 'Bearer ' + token)
    .send(body);
const editor = async (scope = 'restaurant') => (await api('get', scope)).body;
async function save(changes: Record<string, unknown>, scope = 'restaurant') {
  const e = await editor(scope);
  const r = await api('put', scope, '', { version: e.version, content: { ...e.draft, ...changes } });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.version;
}
async function publish(scope = 'restaurant') {
  const e = await editor(scope),
    r = await api('post', scope, '/publish', { version: e.version });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}
beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await createTestPlatformUser(prisma, { email, password });
  platform = (await platformLogin(app, email, password)).body.accessToken;
  const plan = await platformPost('plans', {
    tier: 'QR',
    name: 'TEST Page ' + stamp,
    priceMonthly: 5000,
    maxBranches: 5,
    maxDevices: 10,
    maxUsers: 10,
    entitlements: { qrTableOrdering: true }
  });
  expect(plan.status).toBe(201);
  planId = plan.body.id;
  for (let i = 0; i < 2; i++) {
    const r = await platformPost('restaurants', {
      name: 'TEST Restaurant Page ' + i + ' ' + stamp,
      ownerName: 'Page Owner',
      ownerEmail: `page-owner-${i}-${stamp}@example.invalid`,
      ownerPassword: password,
      skipInviteEmail: true
    });
    expect(r.status).toBe(201);
    created.push(r.body.restaurant.id);
    const sub = await platformPost('subscriptions', {
      restaurantId: r.body.restaurant.id,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      applications: ['QR_ORDERING']
    });
    expect(sub.status).toBe(201);
    if (i === 0) {
      rid = r.body.restaurant.id;
      branch = r.body.branch.id;
    } else other = r.body.branch.id;
  }
  second = (await platformPost('branches', { restaurantId: rid, name: 'Second dining room', code: 'PAGE-B' })).body.id;
  const key = await platformPost('activation-keys', {
    restaurantId: rid,
    branchId: branch,
    allowedDeviceType: 'POS_ADMIN',
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  });
  const a = await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
  expect(a.status).toBe(201);
  deviceToken = a.body.deviceToken;
  deviceId = a.body.device.id;
  owner = await ownerDeviceSession(prisma, deviceToken);
  const m = await prisma.runAsTenant(rid, async (tx) => {
    const u = await tx.user.findFirstOrThrow({ where: { restaurantId: rid, role: 'OWNER' } });
    return tx.user.create({
      data: {
        restaurantId: rid,
        branchId: branch,
        email: `page-manager-${stamp}@example.invalid`,
        fullName: 'Branch manager',
        role: 'MANAGER',
        status: 'ACTIVE',
        passwordHash: u.passwordHash
      }
    });
  });
  manager = new JwtService().sign(
    { sub: m.id, restaurantId: rid, did: deviceId, email: m.email },
    { secret: process.env.JWT_ACCESS_SECRET, issuer: TENANT_JWT_ISSUER, audience: TENANT_JWT_AUDIENCE, expiresIn: '15m' }
  );
}, 120000);
afterAll(async () => {
  if (prisma) {
    for (const id of created) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id } }));
    await prisma.runAsPlatform(async (tx) => {
      await tx.plan.deleteMany({ where: { id: planId } });
      await tx.platformUser.deleteMany({ where: { email } });
    });
  }
  await app?.close();
});
it('inherits landing-page access from a purchased plan without a restaurant override and rejects a plan missing base QR', async () => {
  const body={tier:'QR',name:'TEST Page Plan Access '+stamp,priceMonthly:10000,maxBranches:1,maxDevices:5,maxUsers:5,entitlements:{qrRestaurantPage:true}};
  expect((await platformPost('plans',body)).status).toBe(400);
  const plan=await platformPost('plans',{...body,entitlements:{qrRestaurantPage:true,qrTableOrdering:true,menuManagement:true,tableManagement:true}});
  expect(plan.status,JSON.stringify(plan.body)).toBe(201);
  try {
    const r=await platformPost('restaurants',{name:'TEST Page Plan Owner '+stamp,ownerName:'Plan Owner',ownerEmail:`page-plan-${stamp}@example.invalid`,ownerPassword:password,skipInviteEmail:true});
    expect(r.status).toBe(201);created.push(r.body.restaurant.id);
    const sub=await platformPost('subscriptions',{restaurantId:r.body.restaurant.id,planId:plan.body.id,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString()});
    expect(sub.status,JSON.stringify(sub.body)).toBe(201);
    const key=await platformPost('activation-keys',{restaurantId:r.body.restaurant.id,branchId:r.body.branch.id,allowedDeviceType:'POS_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});
    const activated=await http().post('/api/v1/activation/redeem').send({code:key.body.code,deviceType:'POS_ADMIN'});
    expect(activated.status).toBe(201);
    const account=await ownerDeviceSession(prisma,activated.body.deviceToken);
    const page=await http().get('/api/v1/tenant/qr-page?scope=restaurant').set('Authorization','Bearer '+account);
    expect(page.status).toBe(200);expect(page.body.capability.enabled).toBe(true);
    const row=await prisma.runAsPlatform(tx=>tx.applicationEntitlement.findFirstOrThrow({where:{subscriptionId:sub.body.id,appCode:'QR_ORDERING'}}));
    expect(row.config).toBeNull();
    const removed=await http().patch('/api/v1/plans/'+plan.body.id).set('Authorization','Bearer '+platform).send({entitlements:{qrTableOrdering:true,qrRestaurantPage:false}});
    expect(removed.status).toBe(200);
    const locked=await http().get('/api/v1/tenant/qr-page?scope=restaurant').set('Authorization','Bearer '+account);
    expect(locked.body.capability.enabled).toBe(false);expect(locked.body.capability.reason).toBe('NOT_INCLUDED');
  } finally {
    // Subscriptions must be removed before their plan during fixture cleanup.
    await prisma.runAsPlatform(async tx=>{await tx.subscription.deleteMany({where:{planId:plan.body.id}});await tx.plan.delete({where:{id:plan.body.id}});});
  }
});
it('requires a current tenant account and refuses foreign or manager global scopes', async () => {
  expect((await http().get('/api/v1/tenant/qr-page')).status).toBe(401);
  expect((await api('get', other)).status).toBe(403);
  expect((await api('get', 'restaurant', '', undefined, manager)).status).toBe(403);
  expect((await api('get', second, '', undefined, manager)).status).toBe(403);
  expect((await api('get', branch, '', undefined, manager)).status).toBe(200);
});
it('does not let a purchased QR base module invent the page add-on', async () => {
  const e = await editor();
  expect(e.capability.enabled).toBe(false);
  expect((await api('put', 'restaurant', '', { version: 0, content: e.draft })).status).toBe(403);
  await prisma.runAsTenant(rid, (tx) =>
    tx.applicationEntitlement.updateMany({ where: { restaurantId: rid, appCode: 'QR_ORDERING' }, data: { config: { qrRestaurantPage: true } } })
  );
  expect((await editor()).capability.enabled).toBe(true);
});
it('uploads validated owned pictures and rejects forged refs, script URLs and unexpected fields', async () => {
  expect((await api('post', 'restaurant', '/images', { image: 'data:image/svg+xml;base64,PHN2Zy8+' })).status).toBe(400);
  const uploaded = await api('post', 'restaurant', '/images', { image: png });
  expect(uploaded.status).toBe(201);
  const e = await editor();
  for (const changes of [
    { heroUrl: 'img:' + 'a'.repeat(64) },
    { instagram: 'javascript:alert(1)' },
    { instagram: 'https://instagram.com.attacker.invalid/name' },
    { unexpected: 'bad' },
    { reviewUrl: 'https://attacker.invalid/review' }
  ])
    expect((await api('put', 'restaurant', '', { version: e.version, content: { ...e.draft, ...changes } })).status).toBe(400);
  await save({
    title: 'Our neighbourhood kitchen',
    welcome: 'Come hungry. Leave happy.',
    enabled: true,
    entryMode: 'PAGE',
    heroUrl: uploaded.body.ref,
    instagram: 'https://www.instagram.com/our.restaurant',
    whatsapp: '+919876543210'
  });
  expect(await app.get(QrRestaurantPageService).publicPage(rid, branch)).toBeNull();
});
it('isolates drafts, rejects concurrent stale writes and explicitly publishes', async () => {
  const e = await editor(),
    body = { version: e.version, content: e.draft };
  const r = await Promise.all([api('put', 'restaurant', '', body), api('put', 'restaurant', '', body)]);
  expect(r.map((v) => v.status).sort()).toEqual([200, 409]);
  expect((await api('post', 'restaurant', '/publish', { version: e.version })).status).toBe(409);
  const p = await publish();
  expect(p.published.title).toBe('Our neighbourhood kitchen');
  const page = await app.get(QrRestaurantPageService).publicPage(rid, branch);
  expect(page.content.heroUrl).toMatch(/^\/api\/v1\/public\/qr\/images\//);
  expect(page.content.title).toBe('Our neighbourhood kitchen');
  await save({ title: 'Unpublished draft text' });
  expect((await app.get(QrRestaurantPageService).publicPage(rid, branch)).content.title).toBe('Our neighbourhood kitchen');
});
it('uses accurate branch addresses and keeps branch publications separate', async () => {
  await prisma.runAsTenant(rid, (tx) => tx.branch.update({ where: { id: branch }, data: { address: 'Branch A, River Road' } }));
  expect((await app.get(QrRestaurantPageService).publicPage(rid, branch)).content.address).toBe('Branch A, River Road');
  await save({ title: 'Branch B kitchen', address: 'Branch B, Garden Lane', reviewUrl: 'https://g.page/r/example/review' }, second);
  await publish(second);
  expect((await app.get(QrRestaurantPageService).publicPage(rid, branch)).content.title).toBe('Our neighbourhood kitchen');
  expect((await app.get(QrRestaurantPageService).publicPage(rid, second)).content.address).toBe('Branch B, Garden Lane');
});
it('serves a public browse-only share page without table identity or private draft fields', async () => {
  const e = await editor(branch);
  expect(e.sharePath).toMatch(/^\/q\/site\//);
  const slug = e.sharePath.split('/').at(-1);
  const response = await http().get('/api/v1/public/qr/sites/' + slug);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.content.title).toBe('Our neighbourhood kitchen');
  expect(response.body.items).toEqual([]);
  expect(response.body.menuReady).toBe(false);
  for (const key of ['table', 'restaurantId', 'branchId', 'draft', 'version']) expect(response.body).not.toHaveProperty(key);
  expect((await http().get('/api/v1/public/qr/sites/' + randomUUID())).status).toBe(404);
});
it('preserves original table QR context when no menu is published', async () => {
  const headers = { Authorization: 'Bearer ' + deviceToken, 'x-owner-authorization': owner };
  const table = await http().post('/api/v1/restaurant/qr/tables').set(headers).send({ tableNumber: 'PAGE-1', branchId: branch });
  expect(table.status, JSON.stringify(table.body)).toBe(201);
  const code = await http()
    .post('/api/v1/restaurant/qr/tables/' + table.body.id + '/generate')
    .set(headers)
    .send({});
  expect(code.status, JSON.stringify(code.body)).toBe(201);
  const token = code.body.url.split('/').at(-1);
  const response = await http().get('/api/v1/public/qr/' + token);
  expect(response.status).toBe(200);
  expect(response.body.table.displayNumber).toBe('PAGE-1');
  expect(response.body.restaurantPage.content.title).toBe('Our neighbourhood kitchen');
  expect(response.body.ordering.menuReady).toBe(false);
});
it('versions publications and restores only a draft until reviewed publication', async () => {
  await publish();
  const e = await editor();
  expect(e.history.length).toBeGreaterThan(0);
  const restored = await api('post', 'restaurant', '/restore', { version: e.version, id: e.history[0].id });
  expect(restored.status).toBe(201);
  expect(restored.body.draft.title).toBe('Our neighbourhood kitchen');
  expect((await app.get(QrRestaurantPageService).publicPage(rid, branch)).content.title).toBe('Unpublished draft text');
  await publish();
});
it('uses the newly published canonical menu for featured dishes after an initially missing menu', async () => {
  const category = randomUUID(),
    dish = randomUUID();
  await prisma.runAsTenant(rid, async (tx) => {
    for (const [entityType, externalId, payload] of [
      ['MENU_CATEGORY', category, { id: category, name: 'Meals' }],
      ['MENU_ITEM', dish, { id: dish, name: 'Our Thali', price: 299, categoryId: category, isAvailable: true }]
    ] as const)
      await tx.syncedEntity.create({ data: { restaurantId: rid, entityType, externalId, payload } });
    await app.get(MenuPublicationsService).publishTx(tx, rid, null, 'QA published menu');
  });
  const menu = await app.get(QrMenuService).build(rid, branch);
  expect(menu.items.map((i: any) => i.name)).toContain('Our Thali');
  await save({ featuredItemIds: [dish] });
  await publish();
  const page = await app.get(QrRestaurantPageService).publicPage(rid, branch);
  expect(page.content.featuredItemIds).toEqual([dish]);
});
it('can revert a branch to global inheritance without recycling an old draft version', async () => {
  const e = await editor(second),
    r = await api('post', second, '/inherit', { version: e.version });
  expect(r.status).toBe(201);
  expect(r.body.inherited).toBe(true);
  expect(r.body.version).toBeGreaterThan(e.version);
  expect((await api('put', second, '', { version: e.version, content: e.draft })).status).toBe(409);
  expect((await app.get(QrRestaurantPageService).publicPage(rid, second)).content.title).toBe('Our neighbourhood kitchen');
});
it('validates translations and notice dates and never serves future or expired notice text', async()=>{
  const e=await editor();
  for(const changes of [{noticeStart:'bad'},{noticeStart:'2026-10-15T11:00:00Z',noticeEnd:'2026-10-15T10:00:00Z'},{translations:{xx:{welcome:'Unknown'}}},{translations:{hi:{script:'bad'}}}])expect((await api('put','restaurant','',{version:e.version,content:{...e.draft,...changes}})).status).toBe(400);
  await save({notice:'Future event',noticeStart:new Date(Date.now()+3600000).toISOString(),noticeEnd:new Date(Date.now()+7200000).toISOString(),translations:{gu:{welcome:'આપનું સ્વાગત છે',notice:'આવતી કાલે'}}});await publish();
  let page=await app.get(QrRestaurantPageService).publicPage(rid,second);expect(page.content.notice).toBe('');expect(page.content.translations.gu.notice).toBe('');expect(page.content.translations.gu.welcome).toBe('આપનું સ્વાગત છે');
  await save({noticeStart:new Date(Date.now()-7200000).toISOString(),noticeEnd:new Date(Date.now()-3600000).toISOString()});await publish();
  page=await app.get(QrRestaurantPageService).publicPage(rid,second);expect(page.content.notice).toBe('');
  expect((await editor()).draft.notice).toBe('Future event');
});
it('reviews branch copying, preserves contact data and translated hours, and rejects stale or foreign targets',async()=>{
  await save({title:'Copied welcome',translations:{gu:{welcome:'સ્વાગત',hours:'Source hours'}},noticeStart:'',noticeEnd:''});
  await save({title:'Branch original',address:'Private branch address',hours:'Branch hours',reviewUrl:'https://g.page/r/branch/review',translations:{gu:{hours:'Own translated hours'}}},second);await publish(second);
  const before=await editor(second),source=await editor(),input={version:source.version,targets:[second],groups:['STORY']};
  expect((await api('post','restaurant','/copy-preview',input,manager)).status).toBe(403);
  expect((await api('post','restaurant','/copy-preview',{...input,targets:[other]})).status).toBe(403);
  let preview=await api('post','restaurant','/copy-preview',input);expect(preview.status).toBe(201);
  await save({footer:'Concurrent edit'},second);
  expect((await api('post','restaurant','/copy',{input,checksum:preview.body.checksum})).status).toBe(409);
  preview=await api('post','restaurant','/copy-preview',input);
  expect((await api('post','restaurant','/copy',{input,checksum:preview.body.checksum})).status).toBe(201);
  const after=await editor(second);expect(after.draft.title).toBe('Copied welcome');expect(after.draft.address).toBe(before.draft.address);expect(after.draft.reviewUrl).toBe(before.draft.reviewUrl);expect(after.draft.translations.gu.hours).toBe('Own translated hours');expect(after.published.title).toBe('Branch original');
  expect((await api('put',second,'',{version:before.version,content:before.draft})).status).toBe(409);
});
it('keeps page engagement opt-in, anonymous, branch scoped and separate from actual reviews',async()=>{
  await save({engagementEnabled:true,enabled:true},branch);await publish(branch);
  const e=await editor(branch),slug=e.sharePath.split('/').at(-1),events='/api/v1/public/qr/sites/'+slug+'/events';
  expect((await http().post(events).send({type:'REVIEW_SUBMITTED'})).status).toBe(400);
  expect((await http().post(events).set('DNT','1').send({type:'PAGE_VIEW'})).body.recorded).toBe(false);
  expect((await http().post(events).set('Sec-GPC','1').send({type:'PAGE_VIEW'})).body.recorded).toBe(false);
  expect((await http().post(events).send({type:'REVIEW_CLICK',customerPhone:'private'})).status).toBe(400);
  expect((await http().post(events).send({type:'REVIEW_CLICK'})).body.recorded).toBe(true);
  const report=await api('get',branch,'/engagement');expect(report.body.counts.REVIEW_CLICK).toBe(1);expect(report.body.counts.REVIEW_SUBMITTED).toBeUndefined();
  const rows=await prisma.runAsTenant(rid,tx=>tx.qrEvent.findMany({where:{restaurantId:rid,type:'QR_PAGE_REVIEW_CLICK'}}));expect(rows[0].sessionId).toBeNull();expect(rows[0].metadata).toBeNull();
  expect((await api('get',other,'/engagement')).status).toBe(403);
  await save({engagementEnabled:false},branch);await publish(branch);
  expect((await http().post(events).send({type:'MENU_OPEN'})).body.recorded).toBe(false);
});
it('combines scoped launch health and publication and refuses invented test-order acceptance',async()=>{
  const global=await api('get','restaurant','/launch');expect(global.status).toBe(200);expect(global.body.branchRequired).toBe(true);expect(global.body.health.checks.some((c:any)=>c.id==='payment')).toBe(true);
  const checked=await api('get',branch,'/launch');expect(checked.status).toBe(200);expect(checked.body.currentPublication).toBeTruthy();
  expect((await api('post',branch,'/launch',{orderId:'invented',scanned:true,kitchenReceived:true})).status).toBe(400);
  expect((await api('post','restaurant','/launch',{orderId:'invented',scanned:true,kitchenReceived:true})).status).toBe(400);
  expect((await api('get',second,'/launch',undefined,manager)).status).toBe(403);
});
it('provides platform-only named bundles and validates capability names and stale configuration',async()=>{
  const path='/api/v1/qr-ordering/feature-bundles';
  expect((await http().get(path)).status).toBe(401);
  const initial=await http().get(path).set('Authorization','Bearer '+platform);expect(initial.status).toBe(200);expect(initial.body.bundles.length).toBeGreaterThan(0);
  const bad={...initial.body,bundles:[{id:'bad',name:'Bad',description:'',capabilities:{QR_FAKE:true}}]};
  expect((await http().patch(path).set('Authorization','Bearer '+platform).send(bad)).status).toBe(400);
  expect((await http().patch(path).set('Authorization','Bearer '+platform).send({...initial.body,revision:initial.body.revision+999})).status).toBe(409);
});
it('publishes structured hours, categories and server-rendered sharing metadata without leaking drafts', async()=>{
  const hours={timezone:'Asia/Kolkata',weekly:Array.from({length:7},(_,day)=>({day,intervals:day===0?[]:[{start:'10:00',end:'22:00'}]})),exceptions:[{date:'2026-12-25',intervals:[]}]};
  await save({enabled:true,businessHours:hours,seo:{title:'River Kitchen — West',description:'Our neighbourhood restaurant.',imageUrl:''}},branch);
  await publish(branch);
  const e=await editor(branch),slug=e.sharePath.split('/').at(-1),url='/api/v1/public/qr/sites/'+slug;
  const page=await http().get(url);expect(page.status).toBe(200);
  expect(page.body.content.businessHours).toEqual(hours);expect(Array.isArray(page.body.categories)).toBe(true);
  const head=await http().get(url+'/head');expect(head.status).toBe(200);expect(head.headers['content-type']).toContain('text/html');expect(head.text).toContain('River Kitchen — West');expect(head.text).toContain('specialOpeningHoursSpecification');
  await save({seo:{title:'Private unfinished headline',description:'Draft only',imageUrl:''}},branch);
  const unchanged=await http().get(url+'/head');expect(unchanged.text).not.toContain('Private unfinished headline');expect(unchanged.text).toContain('River Kitchen — West');
  const invalid=await editor(branch);
  expect((await api('put',branch,'',{version:invalid.version,content:{...invalid.draft,businessHours:{...hours,timezone:'Not/AZone'}}})).status).toBe(400);
  expect((await api('put',branch,'',{version:invalid.version,content:{...invalid.draft,seo:{title:'Bad image',description:'',imageUrl:'img:'+'a'.repeat(64)}}})).status).toBe(400);
  expect((await http().get('/api/v1/public/qr/sites/not-a-real-page/head')).status).toBe(404);
});
it('turns off the landing page independently of base ordering and respects per-branch licensing', async () => {
  await save({ enabled: false }, second);
  await publish(second);
  expect(await app.get(QrRestaurantPageService).publicPage(rid, second)).toBeNull();
  await prisma.runAsTenant(rid, (tx) =>
    tx.branchProductLicense.create({
      data: {
        restaurantId: rid,
        branchId: branch,
        appCode: 'QR_ORDERING',
        enabled: true,
        disabledFeatures: ['qrRestaurantPage'],
        effectiveAt: new Date(Date.now() - 1000),
        revision: 1,
        createdBy: 'qa'
      }
    })
  );
  expect(await app.get(QrRestaurantPageService).publicPage(rid, branch)).toBeNull();
  expect((await editor(branch)).capability.enabled).toBe(false);
  const e=await editor(branch),slug=e.sharePath?.split('/').at(-1);
  if(slug)expect((await http().get('/api/v1/public/qr/sites/'+slug+'/head')).status).toBe(404);
});

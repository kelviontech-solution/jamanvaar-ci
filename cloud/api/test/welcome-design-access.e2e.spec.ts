import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { generateOpaqueToken, hashOpaqueToken } from '../src/common/security/token.util';
import { DEFAULT_WELCOME_POLICY, WELCOME_POLICY_KEY } from '../src/modules/platform-settings/welcome-policy';

describe('Platform welcome collection and restaurant access', () => {
  let app: INestApplication, prisma: PrismaService, superToken: string, supportToken: string;
  let prior: any, uploadedId: string;
  const tenants: string[] = [], users: string[] = [], plans: string[] = [];
  let admin: any, other: any, kioskA: any, kioskB: any;
  const endpoint = '/api/v1/platform/settings/kiosk-welcome/designs';
  const http = (method: 'get'|'post'|'patch', url: string, token = superToken) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const policy = (value: any) => http('patch', '/api/v1/platform/settings/platform.kioskWelcome').send({ value });
  async function terminal(restaurantId: string, branchId: string, type: 'KIOSK'|'POS_ADMIN') {
    const token = generateOpaqueToken(); const row = await prisma.runAsPlatform(tx => tx.device.create({ data: { restaurantId, branchId, type, status: 'ACTIVE', deviceTokenHash: hashOpaqueToken(token) } })); return { ...row, token };
  }
  const welcome = (id: string) => ({ showHeritageArtwork: false, showPromoBanner: false, backgroundId: id, restaurantName: 'My Hotel', headingText: 'Welcome to', subtitleText: 'Enjoy your meal' });
  let version = Date.now() + 10000;
  const push = (w: any) => http('post', '/api/v1/entity-sync/KIOSK_CONFIGURATION', admin.token).send({ events: [{ externalId: `kiosk-config-${admin.branchId}`, payload: {
    branchId: admin.branchId, updatedAt: new Date(++version).toISOString(), welcome: w,
    display: { enabledLanguages: ['en'], defaultLanguage: 'en', idleWarningAfterSeconds: 90, idleResetCountdownSeconds: 15 },
    receipt: { restaurantName: 'My Hotel', address: '', phone: '', gstin: '', fssaiNumber: '', footerMessage: '', thankYouMessage: '', paperSize: '80mm', showCustomerPhone: false, showTaxBreakup: true, showTokenBig: true, enableWhatsApp: false, enableSms: false, enableEmail: false, enableQrReceipt: false }
  } }] });
  beforeAll(async () => {
    app = await createTestApp(); prisma = app.get(PrismaService);
    prior = await prisma.runAsPlatform(tx => tx.platformSetting.findUnique({ where: { key: WELCOME_POLICY_KEY } }));
    const stamp = Date.now();
    for (const role of ['SUPER_ADMIN','SUPPORT_ADMIN'] as const) { const email = `welcome-${role.toLowerCase()}-${stamp}@example.com`; users.push(email); await createTestPlatformUser(prisma, { email, password: 'test-password', role }); const login = await platformLogin(app, email, 'test-password'); expect(login.status).toBe(200); const token = login.body.accessToken; if (role === 'SUPER_ADMIN') superToken = token; else supportToken = token; }
    await policy(DEFAULT_WELCOME_POLICY);
    for (const name of ['Main','Other']) {
      const result = await http('post', '/api/v1/restaurants').send({ name: `TEST Welcome ${name}`, ownerName: 'Owner', ownerEmail: `welcome-owner-${name}-${stamp}@example.com` }); expect(result.status).toBe(201); const id = result.body.restaurant.id; tenants.push(id);
      const plan = await http('post', '/api/v1/plans').send({ name: `TEST Welcome ${name} ${stamp}`, tier: 'PRO', productFamily: 'KIOSK', priceMonthly: 100000, maxBranches: 3, maxDevices: 10, maxUsers: 5, entitlements: {} }); plans.push(plan.body.id);
      expect((await http('post', '/api/v1/subscriptions').send({ restaurantId: id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now()+86400000).toISOString(), applications: ['KIOSK','KIOSK_ADMIN'] })).status).toBe(201);
      const branch = await prisma.runAsPlatform(tx => tx.branch.findFirstOrThrow({ where: { restaurantId: id } })); const console = await terminal(id, branch.id, 'POS_ADMIN'); if (name === 'Main') { admin = console; kioskA = await terminal(id, branch.id, 'KIOSK'); kioskB = await terminal(id, branch.id, 'KIOSK'); } else other = console;
    }
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.runAsPlatform(async tx => { if (prior) await tx.platformSetting.upsert({ where: { key: WELCOME_POLICY_KEY }, create: { key: WELCOME_POLICY_KEY, value: prior.value }, update: { value: prior.value } }); else await tx.platformSetting.deleteMany({ where: { key: WELCOME_POLICY_KEY } }); if (uploadedId) await tx.platformSetting.deleteMany({ where: { key: { in: ['welcome.asset.'+uploadedId, 'welcome.design.'+uploadedId] } } }); });
      for (const id of tenants) await prisma.runAsPlatform(tx => tx.restaurant.deleteMany({ where: { id } }));
      for (const id of plans) await prisma.runAsPlatform(tx => tx.plan.deleteMany({ where: { id } }));
      await prisma.platformUser.deleteMany({ where: { email: { in: users } } });
    }
    if (app) await app.close();
  });
  it('preserves all ten originals and exposes six distinct additions', async () => {
    const live = await request(app.getHttpServer()).get('/api/v1/health'); expect(live.status).toBe(200); expect(live.body).toEqual({ status: 'ok' });
    expect((await request(app.getHttpServer()).get('/api/v1/platform/system-health')).status).toBe(401);
    const catalog = await http('get', endpoint); expect(catalog.status).toBe(200); expect(catalog.body.designs).toHaveLength(16);
    expect(catalog.body.designs.slice(-6).map((d: any) => d.category)).toEqual(['Dark & Dramatic','Rustic & Earthy','Modern & Playful','Botanical & Fresh','Café & Pastel','Bold & Urban']);
    expect((await request(app.getHttpServer()).get('/api/v1/devices/me/welcome-designs')).status).toBe(401);
  });
  it('lets Super Admin set counts and restaurant selections without granting generic settings writes', async () => {
    expect((await policy({ ...DEFAULT_WELCOME_POLICY, maxDesigns: 3, restaurantAccess: { [admin.restaurantId]: { maxDesigns: 2, allowedIds: ['midnight-spice','botanical-bistro'] } } })).status).toBe(200);
    const own = await http('get', '/api/v1/devices/me/welcome-designs', admin.token); expect(own.body.designs.map((d: any) => d.id)).toEqual(['midnight-spice','botanical-bistro']); expect(own.body.restaurantAccess).toBeUndefined();
    expect((await http('get', '/api/v1/devices/me/welcome-designs', other.token)).body.designs).toHaveLength(3);
    expect((await http('patch','/api/v1/platform/settings/platform.branding').send({ value: { platformName: 'Denied' } })).status).toBe(403);
    expect((await http('patch','/api/v1/platform/settings/platform.kioskWelcome',supportToken).send({ value: DEFAULT_WELCOME_POLICY })).status).toBe(403);
  });
  it('rejects invalid limits, duplicates, unknown designs and non-existent restaurant overrides', async () => {
    for (const value of [{ maxDesigns: 0 }, { maxDesigns: 101 }, { enabledIds: ['unknown'] }, { enabledIds: ['midnight-spice','midnight-spice'] }, { restaurantAccess: { '00000000-0000-4000-8000-000000000000': { maxDesigns: 2, allowedIds: null } } }]) expect((await policy(value)).status).toBe(400);
  });
  it('enforces selection on the server and carries separate terminal backgrounds and editable live text', async () => {
    expect((await push({ ...welcome('midnight-spice'), backgroundLandscapeImageUrl: '/assets/branding/kiosk-welcome-v1/premium-biryani-landscape.webp' })).body.results[0].status).toBe('ok');
    const canonical = await http('get','/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0',kioskA.token); expect(canonical.body.entities[0].payload.welcome.backgroundLandscapeImageUrl).toBeUndefined();
    expect((await push({ ...welcome('premium-biryani'), customBackgrounds: [{ id: 'premium-biryani', name: 'Spoof', imageUrl: 'data:image/webp;base64,AAAA', width: 1080, height: 1920 }] })).body.results[0].status).toBe('error');
    expect((await push({ ...welcome('midnight-spice'), deviceOverrides: { [kioskA.id]: welcome('midnight-spice'), [kioskB.id]: { ...welcome('botanical-bistro'), restaurantName: 'Hotel Two', subtitleText: 'A personal greeting' } } })).body.results[0].status).toBe('ok');
    const saved = await http('get','/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0',kioskB.token); expect(saved.body.entities[0].payload.welcome.deviceOverrides[kioskB.id]).toMatchObject({ backgroundId: 'botanical-bistro', restaurantName: 'Hotel Two', subtitleText: 'A personal greeting' });
    expect((await push(welcome('premium-biryani'))).body.results[0].status).toBe('error');
    expect((await push({ ...welcome('premium-biryani'), backgroundId: undefined, backgroundImageUrl: '/assets/branding/kiosk-welcome-v1/premium-biryani-landscape.webp' })).body.results[0].status).toBe('error');
  });
  it('preserves a previously selected design after revocation while rejecting new use on another terminal', async () => {
    await policy({ ...DEFAULT_WELCOME_POLICY, enabledIds: ['botanical-bistro'] });
    expect((await push({ ...welcome('midnight-spice'), subtitleText: 'Edited after restriction', deviceOverrides: { [kioskA.id]: welcome('midnight-spice'), [kioskB.id]: welcome('botanical-bistro') } })).body.results[0].status).toBe('ok');
    expect((await push({ ...welcome('midnight-spice'), deviceOverrides: { [kioskB.id]: welcome('midnight-spice') } })).body.results[0].status).toBe('error');
  });
  it('adds a decoded durable design, serves immutable public images and blocks malformed uploads and tenant additions', async () => {
    const buffer = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#193c49' } }).webp().toBuffer(); const portrait = `data:image/webp;base64,${buffer.toString('base64')}`;
    const added = await http('post',endpoint).send({ name: 'Test Hotel Design', category: 'Custom', portrait }); expect(added.status).toBe(201); uploadedId = added.body.id;
    await policy({ ...DEFAULT_WELCOME_POLICY, enabledIds: [uploadedId] });
    const own = await http('get','/api/v1/devices/me/welcome-designs',admin.token); expect(own.body.designs[0].id).toBe(uploadedId);
    expect((await push(welcome(uploadedId))).body.results[0].status).toBe('ok');
    const saved = await http('get','/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0',kioskA.token); expect(saved.body.entities[0].payload.welcome.backgroundLandscapeImageUrl).toContain(uploadedId);
    const image = await request(app.getHttpServer()).get(own.body.designs[0].imageUrl); expect(image.status).toBe(200); expect(image.headers['content-type']).toContain('image/webp'); expect(image.headers['cache-control']).toContain('immutable'); expect((await sharp(image.body).metadata()).width).toBe(1080);
    const settings = await http('get','/api/v1/platform/settings'); expect(settings.body.some((r: any) => r.key.startsWith('welcome.asset.'))).toBe(false);
    expect((await http('post',endpoint).send({ name: 'Fake', category: 'Fake', portrait: 'data:image/webp;base64,UklGRkZha2VEYXRhV0VCUA==' })).status).toBe(400);
    expect((await http('post',endpoint,admin.token).send({ name: 'No', category: 'No', portrait })).status).toBe(401);
  });
});

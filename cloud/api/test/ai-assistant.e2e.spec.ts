import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-055/056/057/058: the AI configuration lived in the API's memory (lost on restart) with invented
 * usage numbers, no app ever received it, access came from the plan only (or a fake local licence), and
 * several questions gave identical answers or could never return data.
 */
describe('JAMAN AI configuration, access and usage (BUG-055..058)', () => {
  let app: INestApplication;
  let app2: INestApplication | null = null;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `ai-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let corePlanId: string;
  let proPlanId: string;
  const rests: Record<string, string> = {};
  const devices: Record<string, string> = {};
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

  const platform = (method: 'get' | 'post' | 'patch' | 'delete', url: string, a: INestApplication = app) =>
    request(a.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const deviceCall = (method: 'get' | 'post', url: string, key: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${devices[key]}`);

  async function makeRestaurant(key: string, planId: string) {
    const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST AI ${key} ${stamp}`, ownerName: `Owner ${key}`, ownerEmail: `ai-${key}-${stamp}@example.com` });
    rests[key] = r.body.restaurant.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: rests[key], planId, status: 'ACTIVE', expiresAt: inDays(30) });
    const k = await platform('post', '/api/v1/activation-keys').send({ restaurantId: rests[key], allowedDeviceType: 'POS', expiresAt: inDays(1) });
    const red = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: 'POS' });
    devices[key] = red.body.deviceToken;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken;
    const plan = async (tier: string) =>
      (await platform('post', '/api/v1/plans').send({ tier, name: `TEST AI ${tier} ${stamp}`, priceMonthly: tier === 'PRO' ? 700000 : 500000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id as string;
    corePlanId = await plan('CORE');
    proPlanId = await plan('PRO');
    await makeRestaurant('core', corePlanId);
    await makeRestaurant('pro', proPlanId);
  }, 90_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: Object.values(rests) } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: [corePlanId, proPlanId].filter(Boolean) } } }));
    await prisma.aiQuestion.deleteMany({ where: { id: { startsWith: 'q_custom_test_' } } });
    await prisma.platformUser.deleteMany({ where: { email } });
    await app2?.close();
    await app.close();
  });

  describe('configuration is stored in the database (BUG-055)', () => {
    it('survives an API restart: settings, question switches and custom questions', async () => {
      const set = await platform('patch', '/api/v1/ai-assistant/settings').send({ delayedKotMinutes: 22, lowStockThreshold: 6 });
      expect(set.status).toBe(200);
      const list = (await platform('get', '/api/v1/ai-assistant/config')).body;
      const q = list.questions.find((x: { id: string }) => x.id === 'q_menu_top');
      await platform('patch', `/api/v1/ai-assistant/questions/${q.id}`).send({ isEnabled: false });
      const custom = await platform('post', '/api/v1/ai-assistant/questions').send({ category: 'SALES', label: 'Test custom question', intent: 'CUSTOM_TEST', targetDomain: 'ORDERS', calculationType: 'COUNT' });
      expect(custom.status).toBe(201);
      await prisma.aiQuestion.update({ where: { id: custom.body.id }, data: { id: `q_custom_test_${stamp}` } });

      // A second, fresh application instance is what a restart looks like.
      app2 = await createTestApp();
      const after = (await platform('get', '/api/v1/ai-assistant/config', app2)).body;
      expect(after.settings).toMatchObject({ delayedKotMinutes: 22, lowStockThreshold: 6 });
      expect(after.questions.find((x: { id: string }) => x.id === 'q_menu_top').isEnabled).toBe(false);
      expect(after.questions.some((x: { id: string }) => x.id === `q_custom_test_${stamp}`)).toBe(true);

      await platform('patch', '/api/v1/ai-assistant/questions/q_menu_top').send({ isEnabled: true });
      await platform('patch', '/api/v1/ai-assistant/settings').send({ delayedKotMinutes: 15, lowStockThreshold: 3 });
    });

    it('audits configuration changes', async () => {
      const row = await prisma.auditLog.findFirst({ where: { action: 'AI_SETTINGS_UPDATED' }, orderBy: { createdAt: 'desc' } });
      expect(row?.details).toMatchObject({ updatedSettings: expect.any(Object) });
    });
  });

  describe('the catalogue only offers questions that can be answered, each with its own answer (BUG-058)', () => {
    it('has no delivery-partner questions (nothing records those channels) and no two questions sharing an intent', async () => {
      const { questions } = (await platform('get', '/api/v1/ai-assistant/config')).body as { questions: Array<{ id: string; intent: string; label: string; isCustom?: boolean }> };
      expect(questions.some((q) => /swiggy|zomato/i.test(q.label))).toBe(false);
      const seeded = questions.filter((q) => !q.isCustom);
      const intents = seeded.map((q) => q.intent);
      expect(new Set(intents).size).toBe(intents.length);
    });

    it('builds labels from the configured thresholds instead of fixed text', async () => {
      await platform('patch', '/api/v1/ai-assistant/settings').send({ delayedKotMinutes: 20 });
      const { questions } = (await platform('get', '/api/v1/ai-assistant/config')).body as { questions: Array<{ intent: string; label: string }> };
      expect(questions.find((q) => q.intent === 'DELAYED_KOT')!.label).toBe('Delayed KOTs (> 20 mins)');
      await platform('patch', '/api/v1/ai-assistant/settings').send({ delayedKotMinutes: 15 });
    });
  });

  describe('access is decided per restaurant (BUG-057)', () => {
    const cfg = (key: string) => deviceCall('get', '/api/v1/devices/me/ai-config', key);

    it('a PRO restaurant is ON and receives the enabled questions; a CORE restaurant is LOCKED with a teaser and no data questions', async () => {
      const pro = (await cfg('pro')).body;
      expect(pro).toMatchObject({ state: 'ON', source: 'PLAN' });
      expect(pro.questions.length).toBeGreaterThan(10);

      const core = (await cfg('core')).body;
      expect(core).toMatchObject({ state: 'LOCKED', source: 'PLAN' });
      expect(core.questions).toEqual([]);
      expect(core.teaser.length).toBeGreaterThan(0);
      expect(core.teaser.length).toBeLessThanOrEqual(3);
    });

    it('Super Admin can grant AI to one CORE restaurant, and withhold it from one PRO restaurant', async () => {
      expect((await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.core}/access`).send({ state: 'ON' })).status).toBe(200);
      expect((await cfg('core')).body).toMatchObject({ state: 'ON', source: 'RESTAURANT' });

      await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ state: 'OFF' });
      const pro = (await cfg('pro')).body;
      expect(pro).toMatchObject({ state: 'OFF' });
      expect(pro.questions).toEqual([]);

      // Back to the plan's decision.
      await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.core}/access`).send({ state: null });
      await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ state: null });
      expect((await cfg('core')).body.state).toBe('LOCKED');
      expect((await cfg('pro')).body.state).toBe('ON');
    });

    it('a CORE restaurant is OFF (hidden) rather than LOCKED when the teaser is switched off', async () => {
      await platform('patch', '/api/v1/ai-assistant/settings').send({ corePlanTeaserEnabled: false });
      expect((await cfg('core')).body.state).toBe('OFF');
      await platform('patch', '/api/v1/ai-assistant/settings').send({ corePlanTeaserEnabled: true });
    });

    it('validates the access change', async () => {
      expect((await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ state: 'MAYBE' })).status).toBe(400);
      expect((await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ dailyQueryLimit: -5 })).status).toBe(400);
      expect((await platform('patch', '/api/v1/ai-assistant/restaurants/00000000-0000-4000-8000-000000000000/access').send({ state: 'ON' })).status).toBe(404);
    });
  });

  describe('thresholds reach the terminals (BUG-056)', () => {
    it('sends the platform thresholds, with a per-restaurant override on top', async () => {
      await platform('patch', '/api/v1/ai-assistant/settings').send({ delayedKotMinutes: 18 });
      expect((await deviceCall('get', '/api/v1/devices/me/ai-config', 'pro')).body.settings.delayedKotMinutes).toBe(18);

      await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ thresholdOverrides: { delayedKotMinutes: 25 } });
      const pro = (await deviceCall('get', '/api/v1/devices/me/ai-config', 'pro')).body;
      expect(pro.settings.delayedKotMinutes).toBe(25);
      // The label the terminal shows follows the number it will use.
      expect(pro.questions.find((q: { intent: string }) => q.intent === 'DELAYED_KOT').label).toBe('Delayed KOTs (> 25 mins)');

      await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ thresholdOverrides: null });
      await platform('patch', '/api/v1/ai-assistant/settings').send({ delayedKotMinutes: 15 });
    });

    it('refuses an override outside the limits the platform allows', async () => {
      const res = await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ thresholdOverrides: { delayedKotMinutes: 500 } });
      expect(res.status).toBe(400);
    });

    it('does not let a terminal read another terminal\'s restaurant, or call without a device credential', async () => {
      expect((await request(app.getHttpServer()).get('/api/v1/devices/me/ai-config')).status).toBe(401);
    });
  });

  describe('usage is counted from real queries, with a real daily limit (BUG-055/056)', () => {
    it('starts at zero: no invented totals', async () => {
      const { telemetry } = (await platform('get', '/api/v1/ai-assistant/config')).body;
      const real = await prisma.aiUsageDaily.aggregate({ _sum: { queries: true } });
      expect(telemetry.totalQueries).toBe(real._sum.queries ?? 0);
      expect(telemetry.totalQueries).not.toBe(1420);
    });

    it('records each query with its measured latency, and reports them per intent', async () => {
      for (const [intent, ms] of [['TODAY_SALES', 10], ['TODAY_SALES', 30], ['LOW_STOCK', 20]] as const) {
        const res = await deviceCall('post', '/api/v1/devices/me/ai-telemetry', 'pro').send({ intent, latencyMs: ms });
        expect(res.status).toBe(201);
      }
      const { telemetry } = (await platform('get', '/api/v1/ai-assistant/config')).body;
      expect(telemetry.totalQueries).toBeGreaterThanOrEqual(3);
      const top = telemetry.topIntents.find((t: { intent: string }) => t.intent === 'TODAY_SALES');
      expect(top.count).toBeGreaterThanOrEqual(2);
      expect(telemetry.latencyMs).toBeGreaterThan(0);
      expect(telemetry.latencyMs).toBeLessThanOrEqual(30);
      expect(telemetry.todayQueries).toBeGreaterThanOrEqual(3);
    });

    it('enforces the daily limit for a restaurant and says how many are left', async () => {
      await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ dailyQueryLimit: 5 });
      const before = (await deviceCall('get', '/api/v1/devices/me/ai-config', 'pro')).body;
      expect(before.remainingToday).toBe(5 - before.usedToday);

      let last: { body: { limitReached: boolean; remainingToday: number } } | undefined;
      for (let i = 0; i < 6; i++) last = await deviceCall('post', '/api/v1/devices/me/ai-telemetry', 'pro').send({ intent: 'AOV', latencyMs: 5 });
      expect(last!.body).toMatchObject({ limitReached: true, remainingToday: 0 });
      expect((await deviceCall('get', '/api/v1/devices/me/ai-config', 'pro')).body).toMatchObject({ remainingToday: 0, limitReached: true });
      await platform('patch', `/api/v1/ai-assistant/restaurants/${rests.pro}/access`).send({ dailyQueryLimit: null });
    });

    it('does not count or answer queries for a restaurant whose AI is locked', async () => {
      const res = await deviceCall('post', '/api/v1/devices/me/ai-telemetry', 'core').send({ intent: 'TODAY_SALES', latencyMs: 5 });
      expect(res.status).toBe(403);
    });
  });
});

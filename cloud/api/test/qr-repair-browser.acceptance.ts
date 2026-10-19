import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, request as proxyRequest, type Server } from 'node:http';
import { existsSync, statSync, createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, createTestPlatformUser, platformLogin, ownerDeviceSession } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('real QR customer browser acceptance on isolated API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;
  let browser: Browser;
  let page: Page;
  let restaurantId: string;
  let planId: string;
  let qrToken: string;
  let orderId: string;
  let auth: string;
  const stamp = Date.now();
  const email = `repair-browser-${stamp}@example.invalid`;
  const origin = 'http://localhost:5528';
  const root = resolve(__dirname, '../../..');
  const build = resolve(root, '.jamanvaar/repair-build/qr-journey');
  const evidence = resolve(root, '.jamanvaar/repair-browser-journey');
  const pageErrors: string[] = [];
  const platform = (method: 'post' | 'get', path: string) => request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${auth}`);
  const required = (response: request.Response, status = 201) => {
    expect(response.status, JSON.stringify(response.body)).toBe(status);
    return response.body;
  };

  beforeAll(async () => {
    if (!existsSync(resolve(build, 'index.html')))
      throw Error('Build .jamanvaar/repair-build/qr-journey with its API origin set to http://localhost:5528 before this acceptance run');
    mkdirSync(evidence, { recursive: true });
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await app.listen(0);
    const port = (app.getHttpServer().address() as AddressInfo).port;
    await createTestPlatformUser(prisma, { email, password: 'isolated-browser-fixture-password' });
    auth = (await platformLogin(app, email, 'isolated-browser-fixture-password')).body.accessToken;
    const rest = required(
      await platform('post', '/api/v1/restaurants').send({
        name: 'Repair Browser Restaurant',
        ownerName: 'Test Owner',
        ownerEmail: `repair-owner-${stamp}@example.invalid`
      })
    );
    restaurantId = rest.restaurant.id;
    planId = required(
      await platform('post', '/api/v1/plans').send({
        tier: 'PRO',
        name: `Repair Browser ${stamp}`,
        priceMonthly: 10000,
        maxBranches: 3,
        maxDevices: 10,
        maxUsers: 10,
          entitlements: { restaurantAdmin: true, posTerminal: true, qrTableOrdering: true, kotKdsRouting: true }
      })
    ).id;
    required(
      await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000).toISOString() })
    );
    const branch = await prisma.runAsTenant(restaurantId, (tx) => tx.branch.findFirstOrThrow({ where: { restaurantId } }));
    const key = required(
      await platform('post', '/api/v1/activation-keys').send({
        restaurantId,
        allowedDeviceType: 'POS_ADMIN',
        branchId: branch.id,
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      })
    );
    const device = required(await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.code, deviceType: 'POS_ADMIN' }));
    const owner = await ownerDeviceSession(prisma, device.deviceToken);
    const admin = (path: string) =>
      request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${device.deviceToken}`).set('x-owner-authorization', owner);
    const push = async (type: string, id: string, payload: Record<string, unknown>) => {
      const result = required(
        await admin('/api/v1/entity-sync/' + type).send({ events: [{ externalId: id, payload: { id, ...payload, updatedAt: new Date().toISOString() } }] })
      );
      expect(result.results[0].status, JSON.stringify(result)).toBe('ok');
    };
    await push('MENU_CATEGORY', 'repair-main', { name: 'Meals', isActive: true, sortOrder: 0 });
    await push('MODIFIER_GROUP', 'repair-bread', {
      name: 'Choose your bread',
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 0,
      options: [{ id: 'repair-roti', groupId: 'repair-bread', name: 'Roti', priceDelta: 0, isAvailable: true, sortOrder: 0 }]
    });
    await push('MENU_ITEM', 'repair-thali', {
      name: 'Repair Thali',
      categoryId: 'repair-main',
      price: 100,
      isAvailable: true,
      dietaryType: 'VEG',
      modifierGroupIds: ['repair-bread'],
      minQuantity: 2,
      maxQuantity: 3
    });
    await push('DINING_TABLE', 'repair-table', { tableNumber: 'R1', capacity: 4, branchId: branch.id, isActive: true });
    required(await admin('/api/v1/menu/publish').send({}));
    const code = required(await admin('/api/v1/restaurant/qr/tables/repair-table/generate').send({ branchId: branch.id }));
    qrToken = code.url.split('/q/')[1];
    server = createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', origin).pathname;
      if (pathname.startsWith('/api/')) {
        const upstream = proxyRequest(
          { hostname: 'localhost', port, method: req.method, path: req.url, headers: { ...req.headers, host: `localhost:${port}` } },
          (response) => {
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
          }
        );
        upstream.on('error', () => {
          res.writeHead(502);
          res.end();
        });
        req.pipe(upstream);
        return;
      }
      // The QR production app is mounted under /q/, so its absolute asset URLs carry that
      // prefix. Match the deployed mount without serving an HTML fallback as a JS module.
      const assetPath = pathname.replace(/^\/q\/assets\//, '/assets/');
      let file = resolve(build, '.' + assetPath);
      if (!file.startsWith(build + sep) || !existsSync(file) || !statSync(file).isFile()) file = resolve(build, 'index.html');
      res.setHeader(
        'Content-Type',
        ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm' } as Record<string, string>)[extname(file)] ??
          'application/octet-stream'
      );
      createReadStream(file).pipe(res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(5528, 'localhost', resolve);
    });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });

  afterAll(async () => {
    if (page) {
      await page.screenshot({ path: resolve(evidence, 'qr-final.png'), fullPage: true }).catch(() => undefined);
      writeFileSync(
        resolve(evidence, 'browser-observations.json'),
        JSON.stringify({ scope: 'Actual customer QR browser with isolated real API; no live online money or physical devices', pageErrors }, null, 2)
      );
    }
    await browser?.close();
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prisma) {
      if (restaurantId) await prisma.runAsPlatform((tx) => tx.restaurant.delete({ where: { id: restaurantId } }));
      if (planId) await prisma.runAsPlatform((tx) => tx.plan.delete({ where: { id: planId } }));
      await prisma.platformUser.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  it('enforces required bread and configured minimum before creating a cart line', async () => {
    await page.goto(`${origin}/q/${qrToken}`);
    await page.getByRole('button', { name: 'Add Repair Thali', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Repair Thali', exact: true });
    expect(await dialog.getByRole('button', { name: /^Choose / }).isDisabled()).toBe(true);
    expect(await dialog.getByRole('button', { name: 'Fewer', exact: true }).isDisabled()).toBe(true);
    await dialog.getByRole('button', { name: 'More', exact: true }).click();
    expect(await dialog.getByRole('button', { name: 'More', exact: true }).isDisabled()).toBe(true);
    await dialog.getByRole('button', { name: 'Fewer', exact: true }).click();
    await dialog.getByText('Roti', { exact: true }).click();
    await dialog.getByRole('button', { name: /^Add 2/ }).click();
    await page.getByRole('button', { name: /View Cart/ }).click();
    await page.getByRole('button', { name: 'Checkout', exact: true }).click();
  });
  it('preserves guest details when reviewing the cart and returning to checkout', async () => {
    await page.getByPlaceholder('How should we call you?').fill('Browser Guest');
    await page.getByPlaceholder('Your mobile number').fill('9876543210');
    await page.getByPlaceholder('Any special requests?').fill('Keep these instructions');
    await page.getByRole('button', { name: /^← Cart$/ }).click();
    await page.getByRole('button', { name: 'Checkout', exact: true }).click();
    expect(await page.getByPlaceholder('How should we call you?').inputValue()).toBe('Browser Guest');
    expect(await page.getByPlaceholder('Your mobile number').inputValue()).toBe('9876543210');
    expect(await page.getByPlaceholder('Any special requests?').inputValue()).toBe('Keep these instructions');
  });
  it('recovers a real quote after an injected price-check outage without losing the cart', async () => {
    await page.route('**/api/v1/public/qr/*/quote', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary acceptance-test quote outage' }) })
    );
    await page.getByRole('button', { name: /^← Cart$/ }).click();
    await page.getByRole('button', { name: 'Retry price check', exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Checkout', exact: true }).isDisabled()).toBe(true);
    await page.unroute('**/api/v1/public/qr/*/quote');
    await page.getByRole('button', { name: 'Retry price check', exact: true }).click();
    await page.getByRole('button', { name: 'Checkout', exact: true }).click();
    expect(await page.getByPlaceholder('How should we call you?').inputValue()).toBe('Browser Guest');
  });
  it('places exactly one valid counter order, retains instructions and restores its status after reload', async () => {
    const response = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/orders'));
    await page.getByRole('button', { name: /^Place order/ }).click();
    const placed = await response;
    expect(placed.status()).toBe(201);
    const body = await placed.json();
    orderId = body.publicOrderId;
    expect(body.paymentStatus).not.toBe('SUCCESS');
    const orders = await prisma.runAsTenant(restaurantId, (tx) => tx.syncedOrder.findMany({ where: { restaurantId, publicOrderId: orderId } }));
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ source: 'QR', paymentStatus: 'PENDING' });
    const items = orders[0].items as Array<{ quantity: number; modifiers: string[] }>;
    expect(items[0].quantity).toBe(2);
    expect(JSON.stringify(orders[0])).toContain('Roti');
    expect(JSON.stringify(orders[0])).toContain('Keep these instructions');
    await page.reload();
    await page.getByText(body.orderNumber, { exact: true }).first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
    expect(pageErrors).toEqual([]);
  });
  it('shows ready and completed after real KDS transitions without falsely marking the bill paid', async () => {
    const order = await prisma.runAsTenant(restaurantId, tx => tx.syncedOrder.findUniqueOrThrow({ where: { publicOrderId: orderId } }));
    const key = required(await platform('post', '/api/v1/activation-keys').send({ restaurantId, branchId: order.branchId, allowedDeviceType: 'KDS', expiresAt: new Date(Date.now() + 86400000).toISOString() }));
    const device = required(await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.code, deviceType: 'KDS' }));
    const kds = (method: 'get' | 'post', path: string) => request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${device.deviceToken}`);
    const pull = required(await kds('get', '/api/v1/orders/sync?afterSeq=0'), 200);
    const remote = pull.orders.find((candidate: { externalOrderId: string }) => candidate.externalOrderId === order.externalOrderId);
    expect(remote).toBeDefined();
    const wire = Object.fromEntries(Object.entries(remote).filter(([, value]) => value !== null));
    const ready = { ...wire, status: 'READY', updatedAt: new Date().toISOString(), items: remote.items.map((item: Record<string, unknown>) => ({ ...item, kitchenStatus: 'READY' })) };
    expect(required(await kds('post', '/api/v1/orders/sync').send({ events: [ready] })).results[0].status).toBe('ok');
    await page.getByRole('heading', { name: 'Your order is ready', exact: true }).waitFor();
    const served = { ...ready, status: 'COMPLETED', updatedAt: new Date().toISOString(), items: ready.items.map((item: Record<string, unknown>) => ({ ...item, kitchenStatus: 'SERVED' })) };
    expect(required(await kds('post', '/api/v1/orders/sync').send({ events: [served] })).results[0].status).toBe('ok');
    await page.getByRole('heading', { name: 'Order completed', exact: true }).waitFor();
    const completed = await prisma.runAsTenant(restaurantId, tx => tx.syncedOrder.findUniqueOrThrow({ where: { id: order.id } }));
    expect(completed).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PENDING' });
    expect(pageErrors).toEqual([]);
  });
});

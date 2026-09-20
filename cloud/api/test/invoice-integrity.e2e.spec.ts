import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-050 / BUG-052: onboarding must issue exactly ONE initial invoice per
 * subscription, invoice numbers must be unique and per financial year even when
 * created at the same instant or after invoices were deleted (they used to be
 * "row count + 1"), and an invoice cannot be marked PAID without a payment or
 * voided without a reason.
 */
describe('Invoice integrity (BUG-050, BUG-052)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-invoice-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let token: string;
  let planId: string;
  const restaurantIds: string[] = [];

  const authed = (method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  async function newRestaurant(label: string) {
    const res = await authed('post', '/api/v1/restaurants').send({
      name: `TEST Invoice ${label} ${Date.now()}`,
      ownerName: 'Invoice Owner',
      ownerEmail: `invoice-owner-${label}-${Date.now()}@test.example.com`,
      state: 'Gujarat'
    });
    restaurantIds.push(res.body.restaurant.id);
    return res.body.restaurant.id as string;
  }

  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const login = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    token = login.body.accessToken;
    const plan = await authed('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Invoice Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true }
    });
    planId = plan.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('assigning a subscription issues exactly one invoice', async () => {
    const rid = await newRestaurant('one');
    const sub = await authed('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId, status: 'ACTIVE', expiresAt: inDays(30) });
    expect(sub.status).toBe(201);

    const list = await authed('get', `/api/v1/invoices?restaurantId=${rid}`);
    expect(list.body.length).toBe(1);
    expect(list.body[0].subscriptionId).toBe(sub.body.id);
  });

  it('creating several invoices at the same instant gives distinct financial-year numbers', async () => {
    const rid = await newRestaurant('parallel');
    const body = { restaurantId: rid, amount: 500000, dueDate: inDays(7), billingPeriodStart: inDays(0), billingPeriodEnd: inDays(30) };

    const responses = await Promise.all(Array.from({ length: 5 }, () => authed('post', '/api/v1/invoices').send(body)));

    responses.forEach((r) => expect(r.status).toBe(201));
    const numbers = responses.map((r) => r.body.invoiceNumber as string);
    expect(new Set(numbers).size).toBe(5);
    numbers.forEach((n) => expect(n).toMatch(/^INV-\d{4}-\d{2}-\d{4,}$/));
  });

  it('never reuses a number after a restaurant and its invoices are deleted', async () => {
    const rid = await newRestaurant('reuse');
    const body = { restaurantId: rid, amount: 500000, dueDate: inDays(7), billingPeriodStart: inDays(0), billingPeriodEnd: inDays(30) };
    const first = await authed('post', '/api/v1/invoices').send(body);
    const firstNumber = first.body.invoiceNumber as string;

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: rid } }));

    const rid2 = await newRestaurant('reuse2');
    const second = await authed('post', '/api/v1/invoices').send({ ...body, restaurantId: rid2 });
    expect(second.status).toBe(201);
    expect(second.body.invoiceNumber).not.toBe(firstNumber);
    const seq = (n: string) => Number(n.split('-').pop());
    expect(seq(second.body.invoiceNumber)).toBeGreaterThan(seq(firstNumber));
  });

  it('cannot mark an invoice PAID without a recorded payment', async () => {
    const rid = await newRestaurant('paid');
    const inv = await authed('post', '/api/v1/invoices').send({ restaurantId: rid, amount: 500000, dueDate: inDays(7), billingPeriodStart: inDays(0), billingPeriodEnd: inDays(30) });

    const res = await authed('patch', `/api/v1/invoices/${inv.body.id}/status`).send({ status: 'PAID' });

    expect(res.status).toBe(409);
  });

  it('voiding an invoice requires a reason', async () => {
    const rid = await newRestaurant('void');
    const inv = await authed('post', '/api/v1/invoices').send({ restaurantId: rid, amount: 500000, dueDate: inDays(7), billingPeriodStart: inDays(0), billingPeriodEnd: inDays(30) });

    const noReason = await authed('patch', `/api/v1/invoices/${inv.body.id}/status`).send({ status: 'VOID' });
    expect(noReason.status).toBe(400);

    const withReason = await authed('patch', `/api/v1/invoices/${inv.body.id}/status`).send({ status: 'VOID', reason: 'Issued to the wrong restaurant' });
    expect(withReason.status).toBe(200);
    expect(withReason.body.status).toBe('VOID');
  });
});

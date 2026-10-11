import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { randomUUID, pbkdf2Sync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestApp, createTestPlatformUser, platformLogin, ownerDeviceSession } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { WhatsAppOutboundWebhookService } from '../src/modules/whatsapp-outbound/whatsapp-outbound-webhook.service';

describe('assessment remediations with non-bypass PostgreSQL and real API guards', () => {
  let app: any, prisma: PrismaService, rid: string, otherRid: string, planId: string;
  const devices: Record<string, { token: string; id: string }> = {};
  const email = `remediation-${Date.now()}@example.invalid`, password = 'QA-only-Password-2026!';
  const post = (token: string, path: string, body: object, headers: Record<string, string> = {}) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).set(headers).send(body);
  const manager = 'qa-manager', pin = '674829';
  beforeAll(async () => {
    app = await createTestApp(); prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    const platform = (await platformLogin(app, email, password)).body.accessToken;
    const r = await post(platform, '/api/v1/restaurants', { name: 'TEST Remediation', ownerName: 'Owner', ownerEmail: email, skipInviteEmail: true }); expect(r.status).toBe(201); rid = r.body.restaurant.id;
    otherRid = (await prisma.runAsPlatform(tx => tx.restaurant.create({ data: { name: 'TEST Isolation Control' } }))).id;
    const plan = await post(platform, '/api/v1/plans', { name: `TEST Remediation ${Date.now()}`, tier: 'PRO', priceMonthly: 10000, maxBranches: 2, maxDevices: 8, maxUsers: 8, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true } }); expect(plan.status).toBe(201); planId = plan.body.id;
    expect((await post(platform, '/api/v1/subscriptions', { restaurantId: rid, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000).toISOString() })).status).toBe(201);
    for (const type of ['POS', 'POS_ADMIN', 'KDS']) {
      const key = await post(platform, '/api/v1/activation-keys', { restaurantId: rid, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() }); expect(key.status).toBe(201);
      const d = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type }); expect(d.status).toBe(201); devices[type] = { id: d.body.device.id, token: d.body.deviceToken };
    }
  }, 120000);
  afterAll(async () => {
    if (prisma) {
      await prisma.runAsPlatform(tx => tx.restaurant.deleteMany({ where: { id: { in: [rid, otherRid].filter(Boolean) } } }));
      if (planId) await prisma.runAsPlatform(tx => tx.plan.deleteMany({ where: { id: planId } }));
      await prisma.platformUser.deleteMany({ where: { email } });
    }
    await app?.close();
  });
  const staffBody = () => {
    const salt = Buffer.from('qa-remediation-salt');
    return { events: [{ externalId: manager, payload: { id: manager, fullName: 'QA Manager', roleId: 'role-manager', isActive: true, pinHash: `pinv2:${salt.toString('hex')}:${pbkdf2Sync(`${rid}:${pin}`, salt, 100000, 32, 'sha256').toString('hex')}`, updatedAt: new Date().toISOString() } }] };
  };
  it('device credentials alone cannot create a manager on POS, Restaurant Admin or KDS', async () => {
    for (const kind of ['POS', 'POS_ADMIN', 'KDS']) expect((await post(devices[kind].token, '/api/v1/entity-sync/STAFF_USER', staffBody())).status).toBe(403);
    expect((await post(devices.POS.token, '/api/v1/staff/verify-manager-pin', { pin })).status).toBe(403);
    expect(await prisma.runAsTenant(rid, tx => tx.syncedEntity.count({ where: { entityType: 'STAFF_USER', externalId: manager } }))).toBe(0);
  });
  it('encoded entity names and trailing slashes do not bypass human authorization', async () => {
    for (const path of ['/api/v1/entity-sync/%53TAFF_USER', '/api/v1/entity-sync/STAFF_USER/']) {
      expect((await post(devices.POS_ADMIN.token, path, staffBody())).status).toBe(403);
    }
  });
  it('every configuration event is checked before changing the customer UPI destination', async () => {
    const response = await post(devices.POS_ADMIN.token, '/api/v1/entity-sync/KIOSK_CONFIGURATION/', { events: [
      { externalId: 'qa-ui', payload: {} },
      { externalId: 'qa-receipt', payload: { receipt: { upiId: 'qa-only@example' } } }
    ] });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ADMIN_SESSION_REQUIRED');
  });
  it('a device-bound owner session creates staff, then a real manager may administer POS staff', async () => {
    const headers = { 'x-owner-authorization': await ownerDeviceSession(prisma, devices.POS_ADMIN.token) };
    expect((await post(devices.POS_ADMIN.token, '/api/v1/entity-sync/STAFF_USER', staffBody(), headers)).body.results[0].status).toBe('ok');
    const session = await post(devices.POS.token, '/api/v1/staff/sign-in', { pin }); expect(session.status).toBe(201);
    const body = { events: [{ externalId: 'qa-cashier', payload: { id: 'qa-cashier', fullName: 'QA Cashier', roleId: 'role-cashier', isActive: true } }] };
    expect((await post(devices.POS.token, '/api/v1/entity-sync/STAFF_USER', body, { 'x-staff-session': session.body.sessionToken })).status).toBe(201);
    await prisma.runAsTenant(rid, tx => tx.syncedEntity.update({ where: { restaurantId_entityType_externalId: { restaurantId: rid, entityType: 'STAFF_USER', externalId: manager } }, data: { payload: { ...staffBody().events[0].payload, roleId: 'role-cashier' } } }));
    expect((await post(devices.POS.token, '/api/v1/entity-sync/STAFF_USER', body, { 'x-staff-session': session.body.sessionToken })).status).toBe(403);
  });
  it('unscoped and foreign-tenant reads are denied on all three integration/financial tables', async () => {
    const roles = await prisma.$queryRaw<any[]>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`; expect(roles[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    const a = await prisma.runAsTenant(rid, tx => tx.whatsAppChannelConnection.create({ data: { restaurantId: rid, keyPrefix: 'qa', keyHash: randomUUID() } }));
    const b = await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.create({ data: { restaurantId: rid, eventType: 'qa', payload: {} } }));
    const c = await prisma.runAsTenant(rid, tx => tx.restaurantPayout.create({ data: { restaurantId: rid, businessDate: 'QA', grossAmount: 100, feeAmount: 0, netAmount: 100, paymentCount: 1 } }));
    for (const [model, id] of [['whatsAppChannelConnection', a.id], ['outboundWebhookDelivery', b.id], ['restaurantPayout', c.id]] as const) {
      expect(await (prisma[model] as any).findUnique({ where: { id } })).toBeNull();
      expect(await prisma.runAsTenant(otherRid, tx => (tx[model] as any).findUnique({ where: { id } }))).toBeNull();
      expect(await prisma.runAsTenant(rid, tx => (tx[model] as any).findUnique({ where: { id } }))).not.toBeNull();
      const unchangedField = model === 'whatsAppChannelConnection' ? { keyPrefix: 'qa' } : model === 'outboundWebhookDelivery' ? { eventType: 'qa' } : { businessDate: 'QA' };
      expect(await prisma.runAsTenant(otherRid, tx => (tx[model] as any).updateMany({ where: { id }, data: unchangedField }))).toMatchObject({ count: 0 });
    }
  });
  it('all restaurant-owned tables enforce RLS, with only documented platform-global exceptions', async () => {
    const unprotected = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT DISTINCT c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relkind='r' AND a.attname='restaurantId' AND NOT a.attisdropped
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
      AND c.relname NOT IN ('AuditLog', 'PlatformNotification')`;
    expect(unprotected).toEqual([]);
  });
  it('unknown API states cannot resurrect a cancelled order, and no-proof cancellation remains pending', async () => {
    const order = { externalOrderId: 'qa-order', orderType: 'TAKEAWAY', status: 'NEW', items: [{ externalItemId: 'qa', name: 'QA', quantity: 1, unitPrice: 100, lineTotal: 100 }], subtotal: 100, taxAmount: 0, totalAmount: 100, paymentStatus: 'PENDING', updatedAt: new Date().toISOString() };
    expect((await post(devices.POS.token, '/api/v1/orders/sync', { events: [order] })).body.results[0].status).toBe('ok');
    expect((await post(devices.POS.token, '/api/v1/orders/sync', { events: [{ ...order, status: 'CANCELLED' }] })).body.results[0].error).toMatch(/STAFF_UNVERIFIED/);
    await prisma.runAsTenant(rid, tx => tx.syncedOrder.update({ where: { restaurantId_externalOrderId: { restaurantId: rid, externalOrderId: order.externalOrderId } }, data: { status: 'CANCELLED' } }));
    const invalid = await post(devices.KDS.token, '/api/v1/orders/sync', { events: [{ ...order, status: 'AUDIT_UNKNOWN' }] });
    // Per-event refusal lets a valid neighboring order continue to synchronize.
    expect(invalid.status).toBe(201); expect(invalid.body.results[0].status).toBe('error');
    for (const event of [{ ...order, paymentStatus: 'AUDIT_UNKNOWN' }, { ...order, items: [{ ...order.items[0], kitchenStatus: 'AUDIT_UNKNOWN' }] }]) {
      expect((await post(devices.KDS.token, '/api/v1/orders/sync', { events: [event] })).body.results[0].status).toBe('error');
    }
    await post(devices.KDS.token, '/api/v1/orders/sync', { events: [order] });
    expect((await prisma.runAsTenant(rid, tx => tx.syncedOrder.findUniqueOrThrow({ where: { restaurantId_externalOrderId: { restaurantId: rid, externalOrderId: order.externalOrderId } } }))).status).toBe('CANCELLED');
  });
  it('concurrent webhook attempts send once; an expired lease recovers with the same signed delivery ID', async () => {
    const row = await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.create({ data: { restaurantId: rid, eventType: 'order.status', payload: {}, nextAttemptAt: new Date(0) } }));
    const service = new WhatsAppOutboundWebhookService(prisma, new ConfigService({ WHATSAPP_CONNECTOR_BASE_URL: 'https://example.invalid', JAMANVAAR_SERVICE_SECRET: 'qa-only' }));
    const fake = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { await new Promise(r => setTimeout(r, 30)); return new Response('', { status: 200 }); });
    try {
      await Promise.all(Array.from({ length: 8 }, () => service.attempt(row.id))); expect(fake).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fake.mock.calls[0][1]?.body)).deliveryId).toBe(row.id); expect(fake.mock.calls[0][1]?.signal).toBeDefined();
      await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.update({ where: { id: row.id }, data: { status: 'PENDING', claimToken: 'crashed-worker', leaseUntil: new Date(Date.now() - 1000) } }));
      await service.attempt(row.id); expect(fake).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(fake.mock.calls[1][1]?.body)).deliveryId).toBe(row.id);
    } finally { fake.mockRestore(); }
  });
  it('timeouts release the claim with backoff; a stale worker cannot overwrite a newer delivery', async () => {
    const service = new WhatsAppOutboundWebhookService(prisma, new ConfigService({ WHATSAPP_CONNECTOR_BASE_URL: 'https://example.invalid', JAMANVAAR_SERVICE_SECRET: 'qa-only' }));
    const row = await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.create({ data: { restaurantId: rid, eventType: 'order.status', payload: {}, nextAttemptAt: new Date(0) } }));
    const fake = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new DOMException('Request timed out', 'TimeoutError'));
    try {
      await service.attempt(row.id);
      const failed = await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.findUniqueOrThrow({ where: { id: row.id } }));
      expect(failed).toMatchObject({ status: 'PENDING', attempts: 1, claimToken: null, leaseUntil: null }); expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } }));
      let release!: () => void, started!: () => void;
      const wait = new Promise<void>(resolve => { release = resolve; }); const ready = new Promise<void>(resolve => { started = resolve; });
      fake.mockImplementationOnce(async () => { started(); await wait; return new Response('', { status: 500 }); }).mockResolvedValue(new Response('', { status: 200 }));
      const oldWorker = service.attempt(row.id); await ready;
      await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.update({ where: { id: row.id }, data: { leaseUntil: new Date(Date.now() - 1000) } }));
      await service.attempt(row.id); release(); await oldWorker;
      const delivered = await prisma.runAsTenant(rid, tx => tx.outboundWebhookDelivery.findUniqueOrThrow({ where: { id: row.id } }));
      expect(delivered).toMatchObject({ status: 'DELIVERED', attempts: 2, lastError: null, claimToken: null });
    } finally { fake.mockRestore(); }
  });
  it('32 concurrent tenant writes remain bounded and persist every acknowledged record', async () => {
    const latencies = await Promise.all(Array.from({ length: 32 }, async (_, i) => {
      const start = performance.now();
      const reply = await post(devices.POS.token, '/api/v1/entity-sync/CUSTOMER', { events: [{ externalId: `qa-load-${i}`, payload: { phone: `qa-load-${i}`, name: 'QA load fixture', loyaltyPoints: 0 } }] });
      expect(reply.status).toBe(201); expect(reply.body.results[0].status).toBe('ok');
      return Math.round(performance.now() - start);
    }));
    const persisted = await prisma.runAsTenant(rid, tx => tx.syncedEntity.count({ where: { entityType: 'CUSTOMER', externalId: { startsWith: 'qa-load-' } } }));
    expect(persisted).toBe(32);
    const sorted = [...latencies].sort((a, b) => a - b), p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    expect(p95).toBeLessThan(5000);
    if (process.env.ASSESSMENT_OUTPUT_DIR) writeFileSync(resolve(process.env.ASSESSMENT_OUTPUT_DIR, 'SYNC_LOAD.json'), JSON.stringify({ concurrentRequests: 32, acknowledged: 32, persisted, p95Ms: p95, maxMs: sorted.at(-1), scope: 'local isolated QA database; not production capacity certification' }, null, 2));
  });
});

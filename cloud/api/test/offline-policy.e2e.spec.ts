import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// A throwaway signing key so the grant path can run without the real private key. It has to be in
// place before AppModule is imported: ConfigModule validates the environment at import time.
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateKeyPairSync } = require('crypto');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.LICENSE_SIGNING_PRIVATE_KEY_B64 = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()).toString('base64');
});

import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-078: the Emergency Offline Policy page always recorded "Restaurant General Manager via
 * Support Call" as the requester, the API took an unvalidated body, overlapping grants raised no
 * warning, and revoke bypassed the platform DB wrapper.
 */
describe('Emergency offline extensions (BUG-078)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `offline-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let otherRestaurantId: string;
  let branchId: string;
  let otherBranchId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const grant = (body: Record<string, unknown>) =>
    auth(request(app.getHttpServer()).post('/api/v1/platform/offline-policy/grant')).send(body);
  const valid = () => ({
    restaurantId,
    extensionDays: 7,
    reason: 'Fibre cut at the site, engineer booked for Monday',
    requestedBy: 'Asha Rao (owner) by phone'
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken;

    const mk = async (label: string) => {
      const res = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
        name: `TEST Offline ${label} ${stamp}`,
        ownerName: `Owner ${label}`,
        ownerEmail: `offline-${label}-${stamp}@example.com`
      });
      return res.body.restaurant.id as string;
    };
    restaurantId = await mk('a');
    otherRestaurantId = await mk('b');
    branchId = (await prisma.runAsPlatform((tx) => tx.branch.create({ data: { restaurantId, name: 'Main', code: `M${stamp}` } }))).id;
    otherBranchId = (await prisma.runAsPlatform((tx) => tx.branch.create({ data: { restaurantId: otherRestaurantId, name: 'Other', code: `O${stamp}` } }))).id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: [restaurantId, otherRestaurantId] } } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  it('refuses a body with the wrong types, missing requester, or absurdly long text', async () => {
    expect((await grant({ ...valid(), extensionDays: 'seven' })).status).toBe(400);
    expect((await grant({ ...valid(), extensionDays: 7.5 })).status).toBe(400);
    expect((await grant({ ...valid(), extensionDays: 91 })).status).toBe(400);
    expect((await grant({ ...valid(), extensionDays: 0 })).status).toBe(400);
    expect((await grant({ ...valid(), requestedBy: undefined })).status).toBe(400);
    expect((await grant({ ...valid(), requestedBy: '  ' })).status).toBe(400);
    expect((await grant({ ...valid(), reason: 'x'.repeat(2000) })).status).toBe(400);
    expect((await grant({ ...valid(), restaurantId: 'not-a-uuid' })).status).toBe(400);
  });

  it('records who really asked and the ticket reference, in the row and in the audit trail', async () => {
    const res = await grant({ ...valid(), ticketRef: 'TCK-1042' });
    expect(res.status).toBe(201);
    expect(res.body.requestedBy).toBe('Asha Rao (owner) by phone');
    expect(res.body.ticketRef).toBe('TCK-1042');
    expect(res.body.requestedBy).not.toMatch(/General Manager via Support Call/);

    const audit = await prisma.auditLog.findFirst({
      where: { restaurantId, action: 'OFFLINE_EXTENSION_GRANTED' },
      orderBy: { createdAt: 'desc' }
    });
    expect(audit?.details).toMatchObject({ requestedBy: 'Asha Rao (owner) by phone', ticketRef: 'TCK-1042', extensionId: res.body.id });
  });

  it('signs the extension with a named key, so the signing key can be rotated (BUG-076)', async () => {
    const res = await grant(valid());
    const payload = JSON.parse(Buffer.from(res.body.certificatePayload, 'base64url').toString('utf8'));
    expect(payload.kid).toBeTypeOf('string');
    expect(payload.type).toBe('EMERGENCY_OFFLINE_EXTENSION');
  });

  it('lists terminals by the real offline rule: approaching the 7-day limit, and already locked unless an extension covers them (BUG-077)', async () => {
    const day = 86400_000;
    const fresh = (await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({ name: `TEST Offline fresh ${stamp}`, ownerName: 'O3', ownerEmail: `offline-fresh-${stamp}@example.com` })).body.restaurant.id as string;
    const mk = (rid: string, name: string, ago: number) =>
      prisma.runAsPlatform((tx) => tx.device.create({ data: { restaurantId: rid, type: 'POS', status: 'ACTIVE', name, lastSeenAt: new Date(Date.now() - ago) } as never }));
    await mk(fresh, 'seen-1d', 1 * day);
    await mk(fresh, 'seen-5d', 5 * day);
    await mk(fresh, 'seen-8d', 8 * day);
    await mk(fresh, 'seen-40d', 40 * day);
    await mk(restaurantId, 'covered-9d', 9 * day); // this restaurant has an active extension from the tests above

    const names = (r: { body: Array<{ name: string }> }) => r.body.filter((d) => d.name?.startsWith('seen-') || d.name?.startsWith('covered-')).map((d) => d.name).sort();
    const approaching = await auth(request(app.getHttpServer()).get('/api/v1/platform/offline-policy/approaching-expiry'));
    expect(names(approaching)).toEqual(['seen-5d']);

    const locked = await auth(request(app.getHttpServer()).get('/api/v1/platform/offline-policy/approaching-expiry')).query({ state: 'locked' });
    // Past the limit whatever the age (40 days needs attention most), but not the terminal an extension covers.
    expect(names(locked)).toEqual(['seen-40d', 'seen-8d']);

    const policy = await auth(request(app.getHttpServer()).get('/api/v1/platform/offline-policy/policy'));
    expect(policy.body).toMatchObject({ offlineGraceDays: 7, warnAfterDays: 4 });
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: fresh } }));
  });

  it('can target one of the restaurant\'s branches, but not another restaurant\'s branch or a made-up device', async () => {
    const ok = await grant({ ...valid(), branchId });
    expect(ok.status).toBe(201);
    expect(ok.body.branchId).toBe(branchId);

    expect((await grant({ ...valid(), branchId: otherBranchId })).status).toBe(404);
    expect((await grant({ ...valid(), deviceId: randomUUID() })).status).toBe(404);
  });

  it('warns when another extension is already active for the same restaurant', async () => {
    const res = await grant({ ...valid(), reason: 'Second request while the first is still active' });
    expect(res.status).toBe(201);
    expect(res.body.warnings?.[0]).toMatch(/already/i);
  });

  it('lists an extension whose end date has passed as EXPIRED, not ACTIVE', async () => {
    const res = await grant({ ...valid(), reason: 'Short one that we then age artificially' });
    await prisma.runAsPlatform((tx) => tx.offlineExtension.update({ where: { id: res.body.id }, data: { validUntil: new Date(Date.now() - 1000) } }));
    const list = await auth(request(app.getHttpServer()).get('/api/v1/platform/offline-policy/extensions')).query({ restaurantId });
    expect(list.body.find((e: { id: string }) => e.id === res.body.id).status).toBe('EXPIRED');
  });

  it('revokes an active extension once, and refuses to revoke it again', async () => {
    const res = await grant({ ...valid(), restaurantId: otherRestaurantId });
    const url = `/api/v1/platform/offline-policy/extensions/${res.body.id}/revoke`;
    const first = await auth(request(app.getHttpServer()).patch(url));
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('REVOKED');
    expect((await auth(request(app.getHttpServer()).patch(url))).status).toBe(400);
  });
});

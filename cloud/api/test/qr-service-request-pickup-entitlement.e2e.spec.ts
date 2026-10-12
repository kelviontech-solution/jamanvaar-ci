import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApplicationEntitlementsService } from '../src/modules/application-entitlements/application-entitlements.service';

/**
 * QR_SERVICE_REQUESTS and QR_SCHEDULED_PICKUP (application-entitlements/qr-capabilities.ts) were
 * enforced in code since they were added, but no Feature row existed for either code, and neither
 * key was ever added to Super Admin's Plan-editor entitlement list. resolveQrCapability requires
 * BOTH a matching, isActive Feature row AND the resolved plan's limits[key] === true — with the
 * first gate permanently closed (no row) and no UI able to open the second, the capability was
 * unconditionally disabled for every restaurant regardless of plan, which is what QrOperations.tsx
 * actually showed admins: "This optional feature is not licensed. Ask your platform administrator
 * to enable it" — with no page anywhere that administrator could do that from.
 * Migration 20261012180000_qr_service_request_pickup_features seeds the Feature rows; this test
 * proves the full chain now resolves, not just that the migration ran without error.
 */
describe('QR_SERVICE_REQUESTS / QR_SCHEDULED_PICKUP can now actually be granted, not just coded for', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let entitlements: ApplicationEntitlementsService;
  const adminEmail = `test-qr-capability-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let grantedPlanId: string;
  let withheldPlanId: string;

  const api = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    entitlements = app.get(ApplicationEntitlementsService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const rest = await api('post', '/api/v1/restaurants').send({
      name: `TEST QrCapability ${Date.now()}`, ownerName: 'Owner', ownerEmail: `qrcap-${Date.now()}@test.example.com`
    });
    restaurantId = rest.body.restaurant.id;

    // A plan that grants the capability (the fix this test proves).
    const grantedPlan = await api('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST QrCapability Granted Plan ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 3, maxDevices: 20, maxUsers: 20,
      entitlements: { posTerminal: true, qrTableOrdering: true, qrServiceRequests: true, qrScheduledPickup: false }
    });
    grantedPlanId = grantedPlan.body.id;

    // A plan that includes QR ordering but deliberately withholds the service-requests add-on —
    // proves this is a real per-plan grant, not just "on everywhere now that a row exists".
    const withheldPlan = await api('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST QrCapability Withheld Plan ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 3, maxDevices: 20, maxUsers: 20,
      entitlements: { posTerminal: true, qrTableOrdering: true, qrServiceRequests: false, qrScheduledPickup: false }
    });
    withheldPlanId = withheldPlan.body.id;

    await api('post', '/api/v1/subscriptions').send({
      restaurantId, planId: grantedPlanId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    for (const id of [grantedPlanId, withheldPlanId]) if (id) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a plan with qrServiceRequests: true actually resolves the capability as enabled (both gates pass)', async () => {
    const result = await prisma.runAsTenant(restaurantId, (tx) => entitlements.resolveQrCapability(tx, restaurantId, 'QR_SERVICE_REQUESTS'));
    expect(result.enabled).toBe(true);
    expect(result.reason).toBe('OK');
  });

  it('the Feature row exists and is active (the gate that was permanently closed before this fix)', async () => {
    const feature = await prisma.runAsPlatform((tx) => tx.feature.findUnique({ where: { code: 'QR_SERVICE_REQUESTS' } }));
    expect(feature).not.toBeNull();
    expect(feature?.isActive).toBe(true);
  });

  it('a sibling capability the plan deliberately withholds (qrScheduledPickup: false) stays disabled -- this is a real per-plan grant, not a blanket unlock', async () => {
    const result = await prisma.runAsTenant(restaurantId, (tx) => entitlements.resolveQrCapability(tx, restaurantId, 'QR_SCHEDULED_PICKUP'));
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('NOT_INCLUDED');
  });

  it('resolveQrCapabilities (the list the QR console UI actually reads) includes both codes with the right enabled state', async () => {
    const result = await prisma.runAsTenant(restaurantId, (tx) => entitlements.resolveQrCapabilities(tx, restaurantId));
    const serviceRequests = result.capabilities.find((c) => c.code === 'QR_SERVICE_REQUESTS');
    const scheduledPickup = result.capabilities.find((c) => c.code === 'QR_SCHEDULED_PICKUP');
    expect(serviceRequests?.enabled).toBe(true);
    expect(scheduledPickup?.enabled).toBe(false);
  });
});

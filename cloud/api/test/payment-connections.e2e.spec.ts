import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentConnectionsService } from '../src/modules/payments/payment-connections.service';

describe('Payment connection onboarding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-payconn-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  const planIds: string[] = [];
  let ownerToken: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  /**
   * Most tests in this file share one restaurant and run as a deliberate
   * state machine; the reconnect and approve-failure tests below need their
   * own isolated connection lifecycle instead, so they provision a throwaway
   * restaurant with this.
   */
  // Kiosk payment settings belong to a restaurant on a plan that includes the kiosk.
  const subscribeKiosk = async (rid: string) => {
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Pay Connection Plan ${Date.now()}`, priceMonthly: 900000, maxBranches: 5, maxDevices: 20, maxUsers: 20,
      entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, captainApp: true, selfOrderKiosk: true, qrTableOrdering: true }
    });
    planIds.push(plan.body.id);
    await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId: rid, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
  };

  const createRestaurantWithOwner = async (label: string) => {
    const ownerEmail = `payconn-${label}-${Date.now()}@test.example.com`;
    const ownerPassword = 'scoped-correct-horse-battery';
    const res = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pay Connection ${label} ${Date.now()}`,
      ownerName: 'Scoped Owner',
      ownerEmail
    });
    const id = res.body.restaurant.id;
    await subscribeKiosk(id);
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId: id, email: ownerEmail, activationToken: res.body.activationToken, newPassword: ownerPassword
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: id, email: ownerEmail, password: ownerPassword });
    return { restaurantId: id as string, token: loginRes.body.accessToken as string };
  };

  const validSubmission = {
    accountType: 'BUSINESS',
    businessType: 'Restaurant',
    pan: 'ABCDE1234F',
    contactName: 'Demo Owner',
    contactEmail: 'owner@demo.example.com',
    contactPhone: '9876543210',
    settlementAccountName: 'Demo Restaurant',
    settlementAccountNumber: '1234567890',
    settlementIfsc: 'HDFC0000001'
  };

  beforeAll(async () => {
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    // Kept as a named variable (rather than inline in useValue) so individual
    // tests — specifically the phase-3 race test below — can swap in a
    // one-time implementation via mockImplementationOnce and have it fall
    // back to this default afterwards.
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const ownerEmail = `pay-connection-owner-${Date.now()}@test.example.com`;
    const ownerPassword = 'owner-correct-horse-battery';
    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pay Connection Restaurant ${Date.now()}`,
      ownerName: 'Pay Connection Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const activationToken = restaurantRes.body.activationToken;
    await subscribeKiosk(restaurantId);

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken, newPassword: ownerPassword
    });
    const ownerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    ownerToken = ownerLoginRes.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('GET returns NOT_CONNECTED when nothing has been submitted yet', async () => {
    const res = await authed('get', '/api/v1/tenant/payment-connection', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONNECTED');
  });

  it('rejects a submission with neither bank nor UPI details', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({
      accountType: 'BUSINESS', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210'
    });
    expect(res.status).toBe(400);
  });

  it('rejects a submission with both bank and UPI details — exactly one is required, not "at least one"', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({
      accountType: 'BUSINESS', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210',
      settlementUpiVpa: 'demo@upi',
      settlementAccountName: 'Demo Restaurant', settlementAccountNumber: '1234567890', settlementIfsc: 'HDFC0000001'
    });
    expect(res.status).toBe(400);
  });

  it('a STAFF-role token cannot submit or view payment connection details (403)', async () => {
    const staffEmail = `test-payconn-staff-${Date.now()}@example.com`;
    const staffPassword = 'staff-correct-horse-battery';
    const createRes = await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
      email: staffEmail,
      fullName: 'Front Desk Staff',
      role: 'STAFF',
      password: staffPassword
    });
    expect(createRes.status).toBe(201);

    const staffLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: staffEmail, password: staffPassword });
    const staffToken = staffLoginRes.body.accessToken;

    const res = await authed('post', '/api/v1/tenant/payment-connection', staffToken).send({
      accountType: 'INDIVIDUAL', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210',
      settlementUpiVpa: 'staff-attempt@upi'
    });
    expect(res.status).toBe(403);

    // A STAFF token also can't read the connection — it would otherwise see
    // unmasked PAN/GST/CIN/UIDAI/IFSC/VPA, which toOwnView() never masks.
    const staffGetRes = await authed('get', '/api/v1/tenant/payment-connection', staffToken);
    expect(staffGetRes.status).toBe(403);
    expect((await authed('post', '/api/v1/tenant/payment-connection/request-platform-payments', staffToken)).status).toBe(403);
    expect((await authed('patch', '/api/v1/tenant/payment-connection/settlement-preference', staffToken).send({ directSettlementRequested: false })).status).toBe(403);
    expect((await authed('patch', '/api/v1/tenant/payment-connection/bank-details', staffToken).send({ settlementAccountName: 'Staff', settlementBankName: 'HDFC', settlementAccountNumber: '1234567890', settlementIfsc: 'HDFC0000001', settlementBankAccountType: 'CURRENT' })).status).toBe(403);


    // Confirm nothing was written — the guard trips before the service layer.
    const getRes = await authed('get', '/api/v1/tenant/payment-connection', ownerToken);
    expect(getRes.body.status).toBe('NOT_CONNECTED');

    await prisma.runAsTenant(restaurantId, (tx) => tx.user.deleteMany({ where: { email: staffEmail } }));
  });

  it('accepts a UPI-only submission and moves status to PENDING_VERIFICATION', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({
      accountType: 'INDIVIDUAL', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210',
      settlementUpiVpa: 'demo@upi'
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.settlementUpiVpa).toBe('demo@upi');
  });

  it('accepts a full bank submission, overwriting the prior UPI-only one while still PENDING_VERIFICATION', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.settlementAccountName).toBe('Demo Restaurant');
    // Never returns the raw/decrypted account number, even to its own owner.
    expect(JSON.stringify(res.body)).not.toContain('1234567890');
  });

  it('GET now reflects the submitted PENDING_VERIFICATION connection', async () => {
    const res = await authed('get', '/api/v1/tenant/payment-connection', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    // security-audit MED-01: pan/gst/cin/uidai are masked in the tenant's own view now
    // (they used to round-trip in full plaintext) — real value confirmed via the DB row.
    expect(res.body.pan).toBe('•••• 234F');
    const stored = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(stored.pan).toBe('ABCDE1234F');
  });

  /**
   * security-audit MED-01: since the GET response now masks gst/cin/uidai, a resubmit
   * form built from it can no longer safely pre-fill them — omitting an optional field
   * on resubmit must keep the real value already on file, not null it out (a naive
   * full-replace upsert would otherwise erase it the moment the operator makes any
   * unrelated edit, e.g. correcting the contact phone).
   */
  it('resubmitting with gst/cin/uidai omitted keeps the previously-submitted real values, not null', async () => {
    await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({ ...validSubmission, gst: '27ABCDE1234F1Z5', uidai: '234567890123' });

    const stored1 = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(stored1.gst).toBe('27ABCDE1234F1Z5');
    expect(stored1.uidai).toBe('234567890123');

    // Resubmit (e.g. to fix the contact phone) without gst/uidai in the body at all.
    const { gst: _gst, uidai: _uidai, ...withoutOptional } = { ...validSubmission, contactPhone: '9999999999' } as Record<string, unknown>;
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(withoutOptional);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const stored2 = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(stored2.gst).toBe('27ABCDE1234F1Z5');
    expect(stored2.uidai).toBe('234567890123');
    expect(stored2.contactPhone).toBe('9999999999');
  });

  it('the settlement account number is actually encrypted at rest, not stored in plaintext', async () => {
    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.settlementAccountNumberEncrypted).not.toBe('1234567890');
    expect(row.settlementAccountNumberEncrypted).toContain(':'); // credential-encryption.util's iv:authTag:ciphertext format
  });

  it('platform list shows the connection with masked settlement details', async () => {
    const res = await authed('get', '/api/v1/payment-connections', platformToken);
    expect(res.status).toBe(200);
    const mine = res.body.find((c: { restaurantId: string }) => c.restaurantId === restaurantId);
    expect(mine).toBeDefined();
    expect(mine.status).toBe('PENDING_VERIFICATION');
    expect(mine.settlementAccountNumberMasked).toBe('•••• 7890');
    expect(mine.panMasked).toBe('•••• 234F');
    expect(JSON.stringify(mine)).not.toContain('1234567890');
    expect(JSON.stringify(mine)).not.toContain('ABCDE1234F');
  });

  it('platform detail matches the list entry', async () => {
    const res = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  const activateForTest = (rid: string) =>
    prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.update({ where: { restaurantId: rid }, data: { status: 'ACTIVE' } }));

  it('suspend/reactivate/disconnect are rejected from the wrong starting status', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken).send({ password: adminPassword });
    expect(suspendRes.status).toBe(403); // still PENDING_VERIFICATION, not ACTIVE
  });

  it('approve is refused for an already ACTIVE connection too', async () => {
    await activateForTest(restaurantId);
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken).send({ password: adminPassword });
    expect(res.status).toBe(403);
  });

  it('cannot resubmit while ACTIVE', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(403);
  });

  it('suspend then reactivate works from ACTIVE, and disconnect works from SUSPENDED', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken).send({ password: adminPassword });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.status).toBe('SUSPENDED');

    const reactivateRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/reactivate`, platformToken);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.status).toBe('ACTIVE');

    const suspendAgain = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken).send({ password: adminPassword });
    expect(suspendAgain.status).toBe(200);

    const disconnectRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/disconnect`, platformToken).send({ password: adminPassword });
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.status).toBe('DISCONNECTED');
  });

  it('can resubmit after DISCONNECTED', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  it('a tenant from another restaurant cannot see or act on this connection', async () => {
    const otherOwnerEmail = `payconn-other-owner-${Date.now()}@test.example.com`;
    const otherOwnerPassword = 'other-correct-horse-battery';
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Pay Connection Restaurant ${Date.now()}`, ownerName: 'Other Owner', ownerEmail: otherOwnerEmail
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
    await subscribeKiosk(otherRestaurantId);
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId: otherRestaurantId, email: otherOwnerEmail, activationToken: otherRes.body.activationToken, newPassword: otherOwnerPassword
    });
    const otherLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: otherRestaurantId, email: otherOwnerEmail, password: otherOwnerPassword });
    const otherToken = otherLoginRes.body.accessToken;

    const res = await authed('get', '/api/v1/tenant/payment-connection', otherToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONNECTED'); // sees only their own (empty) connection, never ours

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });

  it('PATCH .../commission sets a restaurant override and it appears on the platform detail view', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 250, password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.commissionOverrideBps).toBe(250);

    const detail = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, platformToken);
    expect(detail.body.commissionOverrideBps).toBe(250);
  });

  it('PATCH .../commission accepts null to clear the override, falling back to the platform default', async () => {
    await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 250, password: adminPassword });
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: null, password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.commissionOverrideBps).toBeNull();
  });

  it('PATCH .../commission rejects an out-of-range value', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 10001, password: adminPassword });
    expect(res.status).toBe(400);
  });

  it("PATCH .../commission rejects an override below 2% (Razorpay's own 2% fee comes out of it)", async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 150, password: adminPassword });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('at least 2%');
  });

  it('setCommissionOverride still rejects out-of-range values even if a future caller skips the Zod pipe (service-level defense in depth)', async () => {
    const service = app.get(PaymentConnectionsService);
    await expect(service.setCommissionOverride(restaurantId, 10001, { id: 'fake-actor' } as never, undefined)).rejects.toThrow();
    await expect(service.setCommissionOverride(restaurantId, -1, { id: 'fake-actor' } as never, undefined)).rejects.toThrow();
  });

  it('PATCH .../commission for an unknown restaurant returns 404', async () => {
    const res = await authed('patch', '/api/v1/restaurants/00000000-0000-0000-0000-000000000000/payment-connection/commission', platformToken).send({ overrideBps: 250, password: adminPassword });
    expect(res.status).toBe(404);
  });

  it('PATCH .../commission records an audit log entry with the restaurant scope', async () => {
    await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 250, password: adminPassword });
    const entry = await prisma.runAsPlatform((tx) =>
      tx.auditLog.findFirst({ where: { action: 'COMMISSION_CHANGED', category: 'PAYMENTS', restaurantId }, orderBy: { createdAt: 'desc' } })
    );
    expect(entry).not.toBeNull();
    expect((entry!.details as { scope?: string })?.scope).toBe('RESTAURANT_OVERRIDE');
  });

  it('a FINANCE_ADMIN can read and write the restaurant commission override (billing: write)', async () => {
    const email = `test-payconn-finance-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'FINANCE_ADMIN' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, token);
    expect(getRes.status).toBe(200);
    const patchRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, token).send({ overrideBps: 250, password: 'correct-horse-battery-staple' });
    expect(patchRes.status).toBe(200);

    await prisma.platformUser.deleteMany({ where: { email } });
  });

  it('a READ_ONLY user can read but not write the restaurant commission override (billing: read)', async () => {
    const email = `test-payconn-readonly-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'READ_ONLY' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, token);
    expect(getRes.status).toBe(200);
    const patchRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, token).send({ overrideBps: 50 });
    expect(patchRes.status).toBe(403);

    await prisma.platformUser.deleteMany({ where: { email } });
  });

  it('a SUPPORT_ADMIN has no billing area access to the payment connection at all', async () => {
    const email = `test-payconn-support-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'SUPPORT_ADMIN' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, token);
    expect(getRes.status).toBe(403);

    await prisma.platformUser.deleteMany({ where: { email } });
  });

  it('approve rejects a wrong or missing step-up password, and succeeds once the correct one is supplied', async () => {
    const { restaurantId: rid, token } = await createRestaurantWithOwner('stepup-approve');
    await authed('post', '/api/v1/tenant/payment-connection', token).send(validSubmission);

    const wrong = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken).send({ password: 'totally-wrong' });
    expect(wrong.status).toBe(403);
    const missing = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken);
    expect(missing.status).toBe(403);
    const right = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken).send({ password: adminPassword });
    expect(right.status).toBe(200);
    expect(right.body.status).toBe('ACTIVE');

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: rid } }));
  });

  it('approve activates the connection even while Razorpay Route is pending (manual payout mode)', async () => {
    const { restaurantId: rid, token } = await createRestaurantWithOwner('route-pending');
    await authed('post', '/api/v1/tenant/payment-connection', token).send(validSubmission);

    const res = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken).send({ password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId: rid } }));
    expect(row.status).toBe('ACTIVE');
    expect(row.verifiedAt).not.toBeNull();
    // Approval switches payments on; it does not by itself make the restaurant payout-eligible — that still needs
    // a Super Admin to verify the bank details (see RestaurantPayoutsService.setBankVerification).
    expect(row.bankVerificationStatus).toBe('PENDING');

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: rid } }));
  });

  it('suspend and disconnect reject a wrong step-up password', async () => {
    const { restaurantId: rid, token } = await createRestaurantWithOwner('stepup-suspend');
    await authed('post', '/api/v1/tenant/payment-connection', token).send(validSubmission);
    await activateForTest(rid);

    const wrongSuspend = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/suspend`, platformToken).send({ password: 'wrong' });
    expect(wrongSuspend.status).toBe(403);
    const rightSuspend = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/suspend`, platformToken).send({ password: adminPassword });
    expect(rightSuspend.status).toBe(200);

    const wrongDisconnect = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/disconnect`, platformToken).send({ password: 'wrong' });
    expect(wrongDisconnect.status).toBe(403);
    const rightDisconnect = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/disconnect`, platformToken).send({ password: adminPassword });
    expect(rightDisconnect.status).toBe(200);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: rid } }));
  });

  it('reactivate does NOT require a step-up password (deliberately excluded)', async () => {
    const { restaurantId: rid, token } = await createRestaurantWithOwner('stepup-reactivate');
    await authed('post', '/api/v1/tenant/payment-connection', token).send(validSubmission);
    await activateForTest(rid);
    await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/suspend`, platformToken).send({ password: adminPassword });

    const reactivateRes = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/reactivate`, platformToken);
    expect(reactivateRes.status).toBe(200);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: rid } }));
  });
  it('platform collection is the default; a direct request never activates Route and bank edits require verification again', async () => {
    const own = await createRestaurantWithOwner('settlement-request');
    const other = await createRestaurantWithOwner('settlement-isolation');
    const bank = { settlementAccountName: 'Restaurant Owner', settlementBankName: 'HDFC', settlementAccountNumber: '123456789012', settlementIfsc: 'HDFC0000001', settlementBankAccountType: 'CURRENT' };
    try {
      const initial = await authed('get', '/api/v1/tenant/payment-connection', own.token);
      expect(initial.body).toMatchObject({ directSettlementRequested: false, collectionAccount: 'JAMANVAAR', payoutMode: 'MANUAL', routeStatus: 'PENDING', bankVerificationStatus: 'NOT_ADDED' });
      expect((await authed('patch', '/api/v1/tenant/payment-connection/settlement-preference', own.token).send({ directSettlementRequested: true })).status).toBe(400);
      const requested = await authed('post', '/api/v1/tenant/payment-connection/request-platform-payments', own.token);
      expect(requested.status).toBe(201);
      expect(requested.body.status).toBe('PENDING_VERIFICATION');
      expect((await authed('patch', `/api/v1/restaurants/${own.restaurantId}/payment-connection/approve`, platformToken).send({ password: adminPassword })).status).toBe(200);
      const saved = await authed('patch', '/api/v1/tenant/payment-connection/bank-details', own.token).send(bank);
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({ status: 'ACTIVE', bankVerificationStatus: 'PENDING', settlementBankName: 'HDFC', settlementBankAccountType: 'CURRENT' });
      expect(saved.body.settlementAccountNumberMasked).toContain('9012');
      expect(JSON.stringify(saved.body)).not.toContain(bank.settlementAccountNumber);
      const stored = await prisma.runAsTenant(own.restaurantId, tx => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId: own.restaurantId } }));
      expect(stored.settlementAccountNumberEncrypted).not.toContain(bank.settlementAccountNumber);
      const enabled = await authed('patch', '/api/v1/tenant/payment-connection/settlement-preference', own.token).send({ directSettlementRequested: true });
      expect(enabled.body).toMatchObject({ directSettlementRequested: true, collectionAccount: 'JAMANVAAR', payoutMode: 'MANUAL', routeStatus: 'PENDING' });
      expect((await authed('get', '/api/v1/tenant/payment-connection', other.token)).body.directSettlementRequested).toBe(false);
      expect((await authed('patch', '/api/v1/tenant/payment-connection/bank-details', own.token).send({ ...bank, restaurantId: other.restaurantId, bankVerificationStatus: 'VERIFIED' })).status).toBe(400);
      await prisma.runAsTenant(own.restaurantId, tx => tx.restaurantPaymentConnection.update({ where: { restaurantId: own.restaurantId }, data: { bankVerificationStatus: 'VERIFIED', bankVerifiedAt: new Date() } }));
      const edited = await authed('patch', '/api/v1/tenant/payment-connection/bank-details', own.token).send({ ...bank, settlementAccountNumber: '987654321012' });
      expect(edited.body.bankVerificationStatus).toBe('PENDING');
      const current = await prisma.runAsTenant(own.restaurantId, tx => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId: own.restaurantId } }));
      expect(current.bankVerifiedAt).toBeNull();
      const disabled = await authed('patch', '/api/v1/tenant/payment-connection/settlement-preference', own.token).send({ directSettlementRequested: false });
      expect(disabled.body.directSettlementRequested).toBe(false);
      await prisma.runAsTenant(own.restaurantId, tx => tx.restaurantPayout.create({ data: { restaurantId: own.restaurantId, businessDate: '20261006', grossAmount: 10000, feeAmount: 300, netAmount: 9700, paymentCount: 1 } }));
      expect((await authed('patch', '/api/v1/tenant/payment-connection/bank-details', own.token).send(bank)).status).toBe(409);

    } finally { await prisma.runAsPlatform(tx => tx.restaurant.deleteMany({ where: { id: { in: [own.restaurantId, other.restaurantId] } } })); }
  });

});

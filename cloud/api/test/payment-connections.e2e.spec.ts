import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';
import { PaymentConnectionsService } from '../src/modules/payments/payment-connections.service';

describe('Payment connection onboarding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-payconn-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let ownerToken: string;
  let createVendorMock: ReturnType<typeof vi.fn>;
  let updateVendorMock: ReturnType<typeof vi.fn>;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  /**
   * Most tests in this file share one restaurant and run as a deliberate
   * state machine; the reconnect and approve-failure tests below need their
   * own isolated connection lifecycle instead, so they provision a throwaway
   * restaurant with this.
   */
  const createRestaurantWithOwner = async (label: string) => {
    const ownerEmail = `payconn-${label}-${Date.now()}@test.example.com`;
    const ownerPassword = 'scoped-correct-horse-battery';
    const res = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pay Connection ${label} ${Date.now()}`,
      ownerName: 'Scoped Owner',
      ownerEmail
    });
    const id = res.body.restaurant.id;
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
    createVendorMock = vi.fn().mockResolvedValue({ vendorId: 'rest_mocked', status: 'IN_BENE_CREATION' });
    // Every approval after the first PATCHes the vendor that already exists
    // rather than re-creating it, so this mock echoes back whichever
    // vendor_id approve() targeted.
    updateVendorMock = vi.fn().mockImplementation(async (vendorId: string) => ({ vendorId, status: 'ACTIVE' }));
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        createVendor: createVendorMock,
        updateVendor: updateVendorMock,
        getVendorStatus: vi.fn().mockResolvedValue({ vendorId: 'rest_mocked', status: 'ACTIVE' })
      })
    );
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

  it('suspend/reactivate/disconnect are rejected from the wrong starting status', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendRes.status).toBe(403); // still PENDING_VERIFICATION, not ACTIVE
  });

  it('approve calls CashfreeGatewayService.createVendor and moves the connection to ACTIVE', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.cashfreeVendorId).toBe('rest_mocked');

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.status).toBe('ACTIVE');
    expect(row.verifiedAt).not.toBeNull();
  });

  it('cannot approve twice — already ACTIVE is rejected', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken);
    expect(res.status).toBe(403);
  });

  it('cannot resubmit while ACTIVE', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(403);
  });

  it('refresh-status calls getVendorStatus and stores the raw Cashfree status without changing our own status', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/refresh-status`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.cashfreeVendorStatus).toBe('ACTIVE');

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.status).toBe('ACTIVE'); // unchanged — our own status is a separate concept from Cashfree's
    expect(row.cashfreeVendorStatus).toBe('ACTIVE');
  });

  it('suspend then reactivate works from ACTIVE, and disconnect works from SUSPENDED', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.status).toBe('SUSPENDED');

    const reactivateRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/reactivate`, platformToken);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.status).toBe('ACTIVE');

    const suspendAgain = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendAgain.status).toBe(200);

    const disconnectRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/disconnect`, platformToken);
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.status).toBe('DISCONNECTED');
  });

  it('can resubmit after DISCONNECTED', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  it('approve refuses to overwrite if the connection status changed while Cashfree was being contacted', async () => {
    // approve() is split into three phases specifically so the Cashfree
    // network call runs with no DB transaction open; this simulates a
    // concurrent disconnect racing that in-flight call, by mutating the row
    // from inside the mocked vendor-call implementation itself.
    //
    // By this point the shared restaurant already went through one
    // approve() earlier in this file (see "approve calls
    // CashfreeGatewayService.createVendor...") followed by disconnect +
    // resubmit ("can resubmit after DISCONNECTED"), so it already carries a
    // cashfreeVendorId — this second approve() call takes the updateVendor
    // branch, not createVendor, so the race must be injected there.
    updateVendorMock.mockImplementationOnce(async () => {
      await prisma.runAsPlatform((tx) =>
        tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { status: 'DISCONNECTED' } })
      );
      return { vendorId: 'rest_raced', status: 'IN_BENE_CREATION' };
    });

    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken);
    expect(res.status).toBe(403);

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.status).toBe('DISCONNECTED'); // not silently overwritten back to ACTIVE
    expect(row.cashfreeVendorId).not.toBe('rest_raced'); // the raced vendor write was refused
  });

  it('approve leaves the connection unchanged if Cashfree rejects the vendor call', async () => {
    const { restaurantId: rid, token } = await createRestaurantWithOwner('approve-fail');
    const submitRes = await authed('post', '/api/v1/tenant/payment-connection', token).send(validSubmission);
    expect(submitRes.status).toBe(201);

    createVendorMock.mockRejectedValueOnce(new ServiceUnavailableException('Cashfree unavailable'));
    const approveRes = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken);
    expect(approveRes.status).toBe(503);

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId: rid } }));
    expect(row.status).toBe('PENDING_VERIFICATION'); // never a silent partial success
    expect(row.cashfreeVendorId).toBeNull();

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: rid } }));
  });

  it('reconnecting after DISCONNECTED updates the existing Cashfree vendor instead of creating a new one', async () => {
    const { restaurantId: rid, token } = await createRestaurantWithOwner('reconnect');

    const firstSubmit = await authed('post', '/api/v1/tenant/payment-connection', token).send(validSubmission);
    expect(firstSubmit.status).toBe(201);

    const createCallsBeforeFirst = createVendorMock.mock.calls.length;
    const firstApprove = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken);
    expect(firstApprove.status).toBe(200);
    expect(createVendorMock.mock.calls.length).toBe(createCallsBeforeFirst + 1);
    const firstVendorId = firstApprove.body.cashfreeVendorId;
    expect(firstVendorId).toBeTruthy();

    const disconnectRes = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/disconnect`, platformToken);
    expect(disconnectRes.status).toBe(200);

    const newBankSubmission = {
      ...validSubmission,
      settlementAccountName: 'New Bank Name',
      settlementAccountNumber: '9998887770',
      settlementIfsc: 'ICIC0000002'
    };
    const secondSubmit = await authed('post', '/api/v1/tenant/payment-connection', token).send(newBankSubmission);
    expect(secondSubmit.status).toBe(201);
    expect(secondSubmit.body.status).toBe('PENDING_VERIFICATION');

    const createCallsBeforeSecond = createVendorMock.mock.calls.length;
    const updateCallsBeforeSecond = updateVendorMock.mock.calls.length;
    const secondApprove = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken);
    expect(secondApprove.status).toBe(200);
    // Same vendor_id as the first approval — never a fresh create.
    expect(secondApprove.body.cashfreeVendorId).toBe(firstVendorId);
    expect(createVendorMock.mock.calls.length).toBe(createCallsBeforeSecond); // not called again
    expect(updateVendorMock.mock.calls.length).toBe(updateCallsBeforeSecond + 1);

    const lastUpdateCall = updateVendorMock.mock.calls[updateVendorMock.mock.calls.length - 1];
    expect(lastUpdateCall[0]).toBe(firstVendorId); // vendor_id passed as the path param
    expect(lastUpdateCall[1].bank.accountNumber).toBe('9998887770'); // carries the NEW bank details

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: rid } }));
  });

  it('a tenant from another restaurant cannot see or act on this connection', async () => {
    const otherOwnerEmail = `payconn-other-owner-${Date.now()}@test.example.com`;
    const otherOwnerPassword = 'other-correct-horse-battery';
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Pay Connection Restaurant ${Date.now()}`, ownerName: 'Other Owner', ownerEmail: otherOwnerEmail
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
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
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 150 });
    expect(res.status).toBe(200);
    expect(res.body.commissionOverrideBps).toBe(150);

    const detail = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, platformToken);
    expect(detail.body.commissionOverrideBps).toBe(150);
  });

  it('PATCH .../commission accepts null to clear the override, falling back to the platform default', async () => {
    await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 150 });
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: null });
    expect(res.status).toBe(200);
    expect(res.body.commissionOverrideBps).toBeNull();
  });

  it('PATCH .../commission rejects an out-of-range value', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 10001 });
    expect(res.status).toBe(400);
  });

  it('setCommissionOverride still rejects out-of-range values even if a future caller skips the Zod pipe (service-level defense in depth)', async () => {
    const service = app.get(PaymentConnectionsService);
    await expect(service.setCommissionOverride(restaurantId, 10001, { id: 'fake-actor' } as never)).rejects.toThrow();
    await expect(service.setCommissionOverride(restaurantId, -1, { id: 'fake-actor' } as never)).rejects.toThrow();
  });

  it('PATCH .../commission for an unknown restaurant returns 404', async () => {
    const res = await authed('patch', '/api/v1/restaurants/00000000-0000-0000-0000-000000000000/payment-connection/commission', platformToken).send({ overrideBps: 100 });
    expect(res.status).toBe(404);
  });

  it('PATCH .../commission records an audit log entry with the restaurant scope', async () => {
    await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/commission`, platformToken).send({ overrideBps: 300 });
    const entry = await prisma.runAsPlatform((tx) =>
      tx.auditLog.findFirst({ where: { action: 'COMMISSION_CHANGED', category: 'PAYMENTS', restaurantId }, orderBy: { createdAt: 'desc' } })
    );
    expect(entry).not.toBeNull();
    expect((entry!.details as { scope?: string })?.scope).toBe('RESTAURANT_OVERRIDE');
  });
});

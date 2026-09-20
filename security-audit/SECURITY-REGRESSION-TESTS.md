# SECURITY REGRESSION TESTS — Automated Test Specifications

This document defines automated regression tests to be incorporated into CI/CD and test suites (`cloud/api/test/*.e2e.spec.ts` and `tests/*.test.ts`) to prevent security regressions.

---

## 1. Tenant & Branch Isolation Suite (`test/security/tenant-isolation.spec.ts`)

```typescript
describe('Tenant & Branch Isolation Regression', () => {
  it('REST-01: prevents cross-tenant access via direct ID manipulation (IDOR)', async () => {
    // Authenticate as Tenant A
    const tenantAToken = await loginAsTenant(restaurantA.id, staffA.email);
    
    // Attempt to access Tenant B's invoice
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tenant/billing/invoices/${invoiceB.id}`)
      .set('Authorization', `Bearer ${tenantAToken}`);
      
    expect(res.status).toBe(404); // Fail-closed, cannot access Restaurant B
  });

  it('BRANCH-01: prevents a branch terminal from pulling orders of another branch', async () => {
    // Authenticate device at Branch 1
    const branch1DeviceToken = await getDeviceToken(branch1.id);

    // Call order sync catchUp
    const res = await request(app.getHttpServer())
      .get('/api/v1/order-sync/catch-up')
      .set('Authorization', `Bearer ${branch1DeviceToken}`);

    const returnedOrders = res.body.orders;
    const foreignBranchOrders = returnedOrders.filter(o => o.branchId === branch2.id);
    expect(foreignBranchOrders).toHaveLength(0);
  });

  it('RLS-01: verifies PostgreSQL RLS is enabled and forced on all operational tables', async () => {
    const rlsStatus = await prisma.$queryRaw<Array<{ tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }>>`
      SELECT tablename, rowsecurity, forcerowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('SyncedOrder', 'SyncedEntity', 'DeviceCommand', 'SyncEventLog', 'SyncConflict', 'Invoice', 'PaymentTransaction');
    `;
    for (const table of rlsStatus) {
      expect(table.rowsecurity).toBe(true);
      expect(table.forcerowsecurity).toBe(true);
    }
  });
});
```

---

## 2. Role Enforcement & Function-Level Authorization (`test/security/rbac.spec.ts`)

```typescript
describe('Role-Based Access Control Regression', () => {
  it('ROLE-01: blocks STAFF from settling invoices or renewing subscriptions (F-001)', async () => {
    const staffToken = await loginAsTenant(restaurantA.id, staffA.email); // Role: STAFF
    
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tenant/billing/invoices/${invoiceA.id}/pay`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ amount: 100, method: 'CASH', referenceNumber: 'FORGED_REF' });

    expect([401, 403]).toContain(res.status);
    
    // Verify invoice status unchanged
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceA.id } });
    expect(invoice.status).not.toBe('PAID');
  });

  it('ROLE-02: prevents READ_ONLY platform users from harvesting password hashes (F-004)', async () => {
    const readOnlyToken = await loginAsPlatform('read_only_user@jamanvaar.com');
    
    const res = await request(app.getHttpServer())
      .get('/api/v1/support/search?q=owner')
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(res.status).toBe(200);
    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain('passwordHash');
    expect(jsonStr).not.toContain('activationTokenHash');
    expect(jsonStr).not.toContain('deviceTokenHash');
    expect(jsonStr).not.toContain('code'); // Plaintext activation codes
  });

  it('ROLE-03: blocks low-privileged roles from generating backup download links (F-020, F-035)', async () => {
    const staffToken = await loginAsTenant(restaurantA.id, staffA.email);
    
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tenant/me/backups/${backupA.id}/download`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect([401, 403]).toContain(res.status);
  });
});
```

---

## 3. Order & Entity Synchronization Integrity (`test/security/sync-integrity.spec.ts`)

```typescript
describe('Order & Entity Sync Integrity Regression', () => {
  it('SYNC-01: overrides client-tampered order prices with server-calculated amounts (F-014)', async () => {
    const posToken = await getDeviceToken(posTerminalA.id);
    
    // Dish is ₹350 in database; client attempts to push with ₹1 unit price
    const res = await request(app.getHttpServer())
      .post('/api/v1/order-sync/push')
      .set('Authorization', `Bearer ${posToken}`)
      .send({
        events: [{
          externalOrderId: `TEST-${Date.now()}`,
          orderType: 'DINE_IN',
          status: 'COMPLETED',
          items: [{ menuItemId: dishButterChicken.id, quantity: 2, unitPrice: 100 }],
          subtotal: 200, // 2 * 100 paise = ₹2
          totalAmount: 200
        }]
      });

    // Server must reject or recalculate to 2 * ₹350 = ₹700
    const synced = await prisma.syncedOrder.findFirst({ where: { externalOrderId: res.body.results[0].externalOrderId } });
    expect(synced.totalAmount).toBe(70000); // 70000 paise
  });

  it('SYNC-02: rejects customer entity retrieval from non-POS device tokens (F-015)', async () => {
    const kioskToken = await getDeviceToken(kioskDevice.id); // Type: KIOSK

    const res = await request(app.getHttpServer())
      .get('/api/v1/entity-sync/CUSTOMER')
      .set('Authorization', `Bearer ${kioskToken}`);

    expect(res.status).toBe(403);
  });
});
```

---

## 4. Payment & Webhook Security (`test/security/payment-security.spec.ts`)

```typescript
describe('Payment & Webhook Security Regression', () => {
  it('PAY-01: rejects invalid webhook signatures without creating database records (F-017)', async () => {
    const initialCount = await prisma.webhookEvent.count();

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/cashfree/webhook')
      .set('x-webhook-signature', 'INVALID_SIGNATURE')
      .set('x-webhook-timestamp', String(Date.now()))
      .send({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'fake' } } });

    expect([400, 401]).toContain(res.status);
    const finalCount = await prisma.webhookEvent.count();
    expect(finalCount).toBe(initialCount); // Zero unauthenticated rows written
  });

  it('PAY-02: prevents race condition double-refunds (F-016)', async () => {
    const posToken = await getDeviceToken(posTerminalA.id);
    const payment = await createTestPayment(10000); // ₹100

    // Fire two concurrent refund requests for ₹100
    const [req1, req2] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/payments/${payment.id}/refund`).set('Authorization', `Bearer ${posToken}`).send({ amountPaise: 10000, reason: 'Test 1' }),
      request(app.getHttpServer()).post(`/api/v1/payments/${payment.id}/refund`).set('Authorization', `Bearer ${posToken}`).send({ amountPaise: 10000, reason: 'Test 2' })
    ]);

    // Exactly one request must succeed; the second must fail due to insufficient remaining balance
    const statuses = [req1.status, req2.status];
    expect(statuses.filter(s => s === 201 || s === 200)).toHaveLength(1);
    expect(statuses.filter(s => s >= 400)).toHaveLength(1);
  });
});
```

---

## 5. Device Licensing & Desktop Security (`test/security/device-licensing.spec.ts`)

```typescript
describe('Device Licensing & Desktop Shell Regression', () => {
  it('DEV-01: prevents concurrent redemption of a single activation key (F-011)', async () => {
    const key = await createActivationKey();

    const [act1, act2] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.code, deviceType: 'POS', appVersion: '1.0.0' }),
      request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.code, deviceType: 'POS', appVersion: '1.0.0' })
    ]);

    const statuses = [act1.status, act2.status];
    expect(statuses.filter(s => s === 201 || s === 200)).toHaveLength(1);
    expect(statuses.filter(s => s === 409 || s === 410)).toHaveLength(1);
  });

  it('DEV-02: asserts Content Security Policy is defined in Tauri configurations (F-028)', () => {
    const tauriConfigs = [
      'apps/restaurant-system/pos/src-tauri/tauri.conf.json',
      'apps/kiosk-system/kiosk-user/src-tauri/tauri.conf.json',
      'apps/restaurant-system/pos-admin/src-tauri/tauri.conf.json'
    ];

    for (const file of tauriConfigs) {
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(config.app.security.csp).not.toBeNull();
      expect(config.app.security.csp).toContain("default-src 'self'");
    }
  });

  it('DEV-03: rejects dangerous file uploads in master catalog (F-018)', async () => {
    const adminToken = await loginAsPlatformOwner();

    const res = await request(app.getHttpServer())
      .post('/api/v1/master-catalog/images')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fileName: 'exploit.svg',
        contentType: 'image/svg+xml',
        base64Data: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')
      });

    expect(res.status).toBe(400); // SVG disallowed
  });
});
```

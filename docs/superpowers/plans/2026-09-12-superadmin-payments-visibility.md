# Super Admin Payments Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give platform staff a read-only, per-restaurant view of real `PaymentTransaction`/`Order`/`Refund` rows inside `RestaurantDetailPage.tsx`, closing the gap where none of the 12 existing tabs show a single transaction.

**Architecture:** One new backend module (`platform-payments`) exposing a paginated list (`GET /api/v1/payments`) and a detail lookup (`GET /api/v1/payments/:paymentId`), both `PlatformAuthGuard`-gated and reading via `prisma.runAsPlatform`. One new frontend tab (`payments`) on `RestaurantDetailPage.tsx`, lazy-loaded on first select, following the page's existing per-tab state/fetch/render convention exactly.

**Tech Stack:** NestJS + Prisma (backend), React + TypeScript (super-admin-web), Vitest + Supertest (e2e tests).

**Spec:** `docs/superpowers/specs/2026-09-12-superadmin-payments-visibility-design.md`

## Global Constraints

- Money is always integer paise on the backend; the frontend divides by 100 only at render time (`(amount / 100).toLocaleString('en-IN')`), matching every existing tab (`billing`, `reports`).
- Platform-side reads use `prisma.runAsPlatform(...)` — never a plain `prisma.<model>` call, which would run outside any RLS context and is disallowed by this codebase's convention (see `DevicesService.list`).
- No new Zod DTO — every input is either a path param or an optional/unvalidated query-string filter, exactly like `AuditQueryController`.
- This tab is read-only. No new mutation endpoints, no new buttons that call refund/status-change routes.
- Response shape for the list endpoint is `{ rows, total, page, limit }`, matching `AuditQueryService.query()` verbatim — not a bare array (that's the `payment-connections` list's shape, which this endpoint does not follow).

---

### Task 1: Backend — platform payments list + detail endpoints

**Files:**
- Create: `cloud/api/src/modules/payments/platform-payments.service.ts`
- Create: `cloud/api/src/modules/payments/platform-payments.controller.ts`
- Modify: `cloud/api/src/modules/payments/payments.module.ts`
- Test: `cloud/api/test/platform-payments.e2e.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.runAsPlatform<T>(fn: (tx) => Promise<T>): Promise<T>` (existing, from `cloud/api/src/prisma/prisma.service.ts`); `PlatformAuthGuard` (existing, `cloud/api/src/common/guards/platform-auth.guard.ts`).
- Produces: `PlatformPaymentsService.list(filters: PlatformPaymentFilters): Promise<{ rows: PaymentTransaction[], total: number, page: number, limit: number }>` and `PlatformPaymentsService.getById(paymentId: string): Promise<PaymentTransaction & { order, refunds }>` — Task 2 (frontend) calls the HTTP routes these back, not these methods directly, but later maintenance code may.

- [ ] **Step 1: Write the failing e2e tests**

Create `cloud/api/test/platform-payments.e2e.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';

describe('Platform payments visibility', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-platpay-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let posToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        createRefund: vi.fn().mockResolvedValue({ cfRefundId: 'cf_refund_mock', refundId: 'refund_mock', refundStatus: 'PENDING', refundAmount: 100 })
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Platform Payments Restaurant ${Date.now()}`, ownerName: 'Platpay Owner', ownerEmail: `platpay-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Platpay Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { kiosk: true }
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId: planRes.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const seedPayment = async (amount: number, status: 'SUCCESS' | 'FAILED') => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `platpay-test-${Date.now()}-${Math.random()}`, items: [], subtotal: amount, taxAmount: 0, totalAmount: amount, status: status === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: order.id, restaurantId, providerOrderId: `pay_${Date.now()}_${Math.random()}`, amount, currency: 'INR', status } })
    );
    return payment.id;
  };

  it('lists payments for a restaurant in { rows, total, page, limit } shape', async () => {
    await seedPayment(10000, 'SUCCESS');
    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(25);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows[0].order).toBeDefined();
  });

  it('filters by status', async () => {
    await seedPayment(5000, 'FAILED');
    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}&status=FAILED`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r: { status: string }) => r.status === 'FAILED')).toBe(true);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('paginates with page/limit', async () => {
    for (let i = 0; i < 3; i++) await seedPayment(1000 + i, 'SUCCESS');
    const page1 = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}&page=1&limit=2`, platformToken);
    expect(page1.body.rows.length).toBe(2);
    const page2 = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}&page=2&limit=2`, platformToken);
    expect(page2.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(page1.body.rows[0].id).not.toBe(page2.body.rows[0].id);
  });

  it('includes refunds on a payment that has one', async () => {
    const paymentId = await seedPayment(10000, 'SUCCESS');
    await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 4000, reason: 'Partial refund for visibility test' });

    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}`, platformToken);
    const row = res.body.rows.find((r: { id: string }) => r.id === paymentId);
    expect(row.refunds.length).toBe(1);
    expect(row.refunds[0].amount).toBe(4000);
    expect(row.status).toBe('REFUND_PENDING');
  });

  it('detail endpoint returns order and refunds', async () => {
    const paymentId = await seedPayment(7000, 'SUCCESS');
    const res = await authed('get', `/api/v1/payments/${paymentId}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.order.totalAmount).toBe(7000);
    expect(Array.isArray(res.body.refunds)).toBe(true);
  });

  it('detail endpoint 404s for an unknown id', async () => {
    const res = await authed('get', '/api/v1/payments/00000000-0000-0000-0000-000000000000', platformToken);
    expect(res.status).toBe(404);
  });

  it('a device token (not platform) is rejected', async () => {
    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}`, posToken);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/platform-payments.e2e.spec.ts`
Expected: FAIL — `Cannot GET /api/v1/payments` (404), since neither route exists yet.

- [ ] **Step 3: Write `platform-payments.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentTransactionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PlatformPaymentFilters {
  restaurantId?: string;
  status?: PaymentTransactionStatus;
  page: number;
  limit: number;
}

@Injectable()
export class PlatformPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: PlatformPaymentFilters) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where = {
        ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      };
      const [rows, total] = await Promise.all([
        tx.paymentTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
          include: {
            order: {
              select: { id: true, externalOrderId: true, subtotal: true, taxAmount: true, discountAmount: true, totalAmount: true, status: true }
            },
            refunds: {
              select: { id: true, amount: true, status: true, reason: true, createdAt: true, processedAt: true }
            }
          }
        }),
        tx.paymentTransaction.count({ where })
      ]);
      return { rows, total, page: filters.page, limit: filters.limit };
    });
  }

  async getById(paymentId: string) {
    const payment = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findUnique({
        where: { id: paymentId },
        include: {
          order: true,
          refunds: { orderBy: { createdAt: 'desc' } }
        }
      })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}
```

- [ ] **Step 4: Write `platform-payments.controller.ts`**

```typescript
import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { PaymentTransactionStatus } from '@prisma/client';
import { PlatformPaymentsService } from './platform-payments.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/payments')
@UseGuards(PlatformAuthGuard)
export class PlatformPaymentsController {
  constructor(private readonly platformPayments: PlatformPaymentsService) {}

  @Get()
  list(
    @Query('restaurantId') restaurantId?: string,
    @Query('status') status?: PaymentTransactionStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '25'
  ) {
    return this.platformPayments.list({
      restaurantId,
      status,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 25))
    });
  }

  @Get(':paymentId')
  detail(@Param('paymentId') paymentId: string) {
    return this.platformPayments.getById(paymentId);
  }
}
```

Note: this controller's route prefix (`api/v1/payments`) is the same base path `PaymentOrdersController` already owns (`@Controller('api/v1/payments')` in `payment-orders.controller.ts`), but that controller only defines `:paymentId/refund` (a POST). Nest resolves `GET /api/v1/payments` and `GET /api/v1/payments/:paymentId` against this new controller with no collision — verified by Step 5's tests actually hitting these routes successfully.

- [ ] **Step 5: Wire the new controller/service into `payments.module.ts`**

In `cloud/api/src/modules/payments/payments.module.ts`, add the two imports and register both:

```typescript
import { PlatformPaymentsController } from './platform-payments.controller';
import { PlatformPaymentsService } from './platform-payments.service';
```

Add `PlatformPaymentsController` to the `controllers` array and `PlatformPaymentsService` to the `providers` array (do not add it to `exports` — nothing outside this module needs it, matching `MenuSyncService`'s same unexported treatment).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/platform-payments.e2e.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Run the full backend test suite to confirm no regressions**

Run: `cd cloud/api && npm test`
Expected: PASS (all suites, including the untouched `payments-refund.e2e.spec.ts`, `payment-connections.e2e.spec.ts`, `audit-query` tests).

- [ ] **Step 8: Commit**

```bash
git add cloud/api/src/modules/payments/platform-payments.service.ts cloud/api/src/modules/payments/platform-payments.controller.ts cloud/api/src/modules/payments/payments.module.ts cloud/api/test/platform-payments.e2e.spec.ts
git commit -m "feat(payments): add platform-side read-only payments list + detail endpoints"
```

---

### Task 2: Frontend — "Payments" tab on RestaurantDetailPage

**Files:**
- Modify: `cloud/super-admin-web/src/api/types.ts`
- Modify: `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/payments?restaurantId=&page=&limit=&status=` → `{ rows: PlatformPayment[], total: number, page: number, limit: number }` and `api.get<T>(url: string): Promise<T>` (existing, `cloud/super-admin-web/src/api/client.ts`). `Badge`, `Button`, `Card`, `EmptyState`, `FilterTabs`, `SkeletonTable` from `../../components/ui` (existing, signatures confirmed in Task 1's research — `FilterTabs<T extends string>({ options: Array<{ id: T; label: string; count?: number }>, value: T, onChange: (val: T) => void })`, `Badge({ tone: BadgeTone, children })`, `SkeletonTable({ rows?, cols? })`, `EmptyState({ title, description, icon?, action? })`).
- Produces: nothing consumed by a later task — this is the last task in this plan.

- [ ] **Step 1: Add the `PlatformPayment` type**

In `cloud/super-admin-web/src/api/types.ts`, add near the existing `Invoice`/`AuditLogPage` types:

```typescript
export interface PlatformPaymentOrder {
  id: string;
  externalOrderId: string;
  subtotal: number; // paise
  taxAmount: number; // paise
  discountAmount: number; // paise
  totalAmount: number; // paise
  status: string;
}

export interface PlatformPaymentRefund {
  id: string;
  amount: number; // paise
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  reason: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface PlatformPayment {
  id: string;
  orderId: string;
  restaurantId: string;
  provider: 'CASHFREE';
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: number; // paise
  currency: string;
  status: 'CREATED' | 'PENDING' | 'AUTHORIZED' | 'SUCCESS' | 'FAILED' | 'USER_DROPPED' | 'CANCELLED' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  method: 'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET' | 'OTHER' | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  order: PlatformPaymentOrder;
  refunds: PlatformPaymentRefund[];
}

export interface PlatformPaymentPage {
  rows: PlatformPayment[];
  total: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 2: Add the `payments` tab to the `Tab` union and `TABS` array**

In `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`, find the `Tab` union type (the multi-line union ending `| 'backups';` just above the `TABS` array). Add `'payments'` right after `'billing'`:

```typescript
  | 'billing'
  | 'payments'
  | 'reports'
```

In the `TABS` array, add the new entry right after the `billing` entry:

```typescript
  { key: 'billing', label: 'Billing & Invoices', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
```

`Wallet` is not currently imported from `lucide-react` in this file — add it to the existing `lucide-react` import statement at the top of the file (find the line starting `import { ... } from 'lucide-react';` and add `Wallet` to that list).

- [ ] **Step 3: Add state and the lazy-load fetch**

Add `PlatformPayment` and `PlatformPaymentPage` to this file's existing multi-line `import type { AuditLogPage, RestaurantDetail, Invoice, RestaurantDiagnostics, Plan, Backup, RestaurantReport } from '../../api/types';` statement (`RestaurantDetailPage.tsx:4-12`). Also add `FilterTabs` to the existing `import { Badge, Button, Card, ConfirmModal, EmptyState, Modal, SkeletonCard, SkeletonTable, statusTone } from '../../components/ui';` statement (`RestaurantDetailPage.tsx:15-25`) — it is not currently imported in this file.

Then add these four new state hooks next to the other secondary-tab state (near `const [invoices, setInvoices] = useState<Invoice[] | null>(null);`):

```typescript
  const [payments, setPayments] = useState<PlatformPaymentPage | null>(null);
  const [paymentsStatusFilter, setPaymentsStatusFilter] = useState<PlatformPayment['status'] | 'ALL'>('ALL');
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
```

In the existing lazy-load `useEffect` (the one containing the `if (tab === 'billing' && !invoices) { ... }` block), add a new block. This one cannot use the `!payments` guard the other tabs use, because changing the filter or page must re-fetch even though `payments` is already non-null:

```typescript
    if (tab === 'payments' && id) {
      const params = new URLSearchParams({ restaurantId: id, page: String(paymentsPage), limit: '25' });
      if (paymentsStatusFilter !== 'ALL') params.set('status', paymentsStatusFilter);
      api
        .get<PlatformPaymentPage>(`/api/v1/payments?${params.toString()}`)
        .then(setPayments)
        .catch(() => setPayments({ rows: [], total: 0, page: 1, limit: 25 }));
    }
```

Add `paymentsStatusFilter` and `paymentsPage` to that `useEffect`'s dependency array so switching the filter or page while already on the tab re-fetches.

- [ ] **Step 4: Render the tab**

Add this block immediately after the closing `)}` of the existing `{tab === 'billing' && ( ... )}` block (found in Step 4's research at `RestaurantDetailPage.tsx:1249-1315`), before the `{/* TAB 9: REPORTS & ANALYTICS */}` comment:

```typescript
      {/* TAB: PAYMENTS */}
      {tab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {payments && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Transactions (this page)</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0B253A', marginTop: 4 }}>{payments.total}</div>
              </div>
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Successful Amount</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>
                  ₹{(payments.rows.filter((p) => p.status === 'SUCCESS').reduce((sum, p) => sum + p.amount, 0) / 100).toLocaleString('en-IN')}
                </div>
              </div>
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Refunded Amount</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#ea580c', marginTop: 4 }}>
                  ₹{(payments.rows.flatMap((p) => p.refunds).filter((r) => r.status === 'SUCCESS').reduce((sum, r) => sum + r.amount, 0) / 100).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          )}

          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <span>Payments &amp; Refunds ({payments?.total ?? 0})</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Real Cashfree-backed payment transactions and refunds for this restaurant.
                </p>
              </div>
            </div>
            <div style={{ padding: '0 22px 14px' }}>
              <FilterTabs<PlatformPayment['status'] | 'ALL'>
                value={paymentsStatusFilter}
                onChange={(val) => { setPaymentsStatusFilter(val); setPaymentsPage(1); }}
                options={[
                  { id: 'ALL', label: 'All' },
                  { id: 'SUCCESS', label: 'Success' },
                  { id: 'FAILED', label: 'Failed' },
                  { id: 'PENDING', label: 'Pending' },
                  { id: 'REFUND_PENDING', label: 'Refund Pending' },
                  { id: 'PARTIALLY_REFUNDED', label: 'Partially Refunded' },
                  { id: 'REFUNDED', label: 'Refunded' }
                ]}
              />
            </div>
            {!payments ? (
              <div style={{ padding: 20 }}><SkeletonTable rows={4} cols={5} /></div>
            ) : payments.rows.length === 0 ? (
              <EmptyState title="No payments yet" description="Real orders and payments from this restaurant's kiosks and POS will appear here." />
            ) : (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Order</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Refunded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.rows.map((p) => {
                      const refundedAmount = p.refunds.filter((r) => r.status === 'SUCCESS').reduce((sum, r) => sum + r.amount, 0);
                      const expanded = expandedPaymentId === p.id;
                      return (
                        <React.Fragment key={p.id}>
                          <tr>
                            <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                              {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="mono" style={{ fontSize: 12 }}>
                              <button
                                type="button"
                                className="table-link"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                                onClick={() => setExpandedPaymentId(expanded ? null : p.id)}
                              >
                                {p.order.externalOrderId}
                              </button>
                            </td>
                            <td style={{ fontWeight: 700 }}>₹{(p.amount / 100).toLocaleString('en-IN')}</td>
                            <td>{p.method ?? '—'}</td>
                            <td><Badge tone={paymentStatusTone(p.status)}>{p.status.replace('_', ' ')}</Badge></td>
                            <td>{refundedAmount > 0 ? `₹${(refundedAmount / 100).toLocaleString('en-IN')}` : '—'}</td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={6} style={{ background: '#f8fafc', padding: '14px 22px', fontSize: 12.5 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                                  <div><strong>Cashfree Order ID:</strong> {p.providerOrderId}</div>
                                  <div><strong>Cashfree Payment ID:</strong> {p.providerPaymentId ?? '—'}</div>
                                  {p.failureReason && <div><strong>Failure Reason:</strong> {p.failureReason}</div>}
                                </div>
                                {p.refunds.length > 0 && (
                                  <div style={{ marginTop: 10 }}>
                                    <strong>Refunds:</strong>
                                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                                      {p.refunds.map((r) => (
                                        <li key={r.id}>
                                          ₹{(r.amount / 100).toLocaleString('en-IN')} — <Badge tone={r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'error' : 'warning'}>{r.status}</Badge>
                                          {r.reason ? ` — ${r.reason}` : ''}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '14px 22px' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Page {payments.page} of {Math.max(1, Math.ceil(payments.total / payments.limit))}</span>
                  <Button size="sm" variant="ghost" disabled={payments.page <= 1} onClick={() => setPaymentsPage((p) => p - 1)}>Prev</Button>
                  <Button size="sm" variant="ghost" disabled={payments.page * payments.limit >= payments.total} onClick={() => setPaymentsPage((p) => p + 1)}>Next</Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
```

- [ ] **Step 5: Add the `paymentStatusTone` helper**

Add this function near the existing `formatDeviceTypeLabel` helper at the top of the file (both are page-local formatting helpers exported/used the same way):

```typescript
function paymentStatusTone(status: PlatformPayment['status']): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
    case 'USER_DROPPED':
    case 'CANCELLED':
      return 'error';
    case 'PENDING':
    case 'CREATED':
    case 'AUTHORIZED':
    case 'REFUND_PENDING':
    case 'PARTIALLY_REFUNDED':
      return 'warning';
    case 'REFUNDED':
    default:
      return 'neutral';
  }
}
```

This is deliberately a page-local helper, not an addition to the shared `statusTone` in `components/ui.tsx` — `statusTone('SUCCESS')` today falls through to `'neutral'` (it only recognizes `'PAID'`/`'VERIFIED'` as success-like strings), and widening that shared function's behavior would silently change badge colors on every other page that already calls it with a `'SUCCESS'`-shaped string, which is out of scope here.

- [ ] **Step 6: Type-check the frontend**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors. If `Wallet` wasn't added to the `lucide-react` import in Step 2, this fails with "Cannot find name 'Wallet'" — fix by confirming the import.

- [ ] **Step 7: Manual verification**

Start the backend (`cd cloud/api && npm run start:dev`) and the super-admin web app (`cd cloud/super-admin-web && npm run dev`). Log in as platform staff, open a restaurant that has at least one real payment from Phase 4a's test flow (or use the POS/kiosk flow directly), click the new "Payments" tab, and confirm:
- The summary strip renders with correct totals.
- The status `FilterTabs` filters the table and resets to page 1.
- Pagination `Prev`/`Next` buttons work and disable correctly at the boundaries.
- Clicking an order id expands the row inline showing Cashfree IDs and any refunds; clicking again collapses it.
- A restaurant with zero payments shows the `EmptyState`, not an error or infinite skeleton.

- [ ] **Step 8: Commit**

```bash
git add cloud/super-admin-web/src/api/types.ts cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx
git commit -m "feat(super-admin): add read-only Payments tab to restaurant detail page"
```

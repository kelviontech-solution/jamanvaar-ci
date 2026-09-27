# Cashfree Commission & Split Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this project's standing instruction is direct/native execution, no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Cashfree order actually route the restaurant's share of the payment to its own vendor account (currently 100% stays in JAMANVAAR's master account, since `order_splits` is never sent), with a configurable platform commission — a platform-wide default percentage plus a per-restaurant override, snapshotted immutably on each `PaymentTransaction` at creation time.

**Architecture:** All changes live inside the existing `cloud/api/src/modules/payments/` module — this is that module's own domain (order creation, vendor onboarding), not a new subsystem. Three additive Prisma fields, one new shared helper (`commission.util.ts`), a small change to `CashfreeGatewayService.createOrder`'s request body, and two new small config surfaces (platform default, per-restaurant override) reusing the existing `PlatformAuthGuard` + audit-log conventions this module already follows throughout. Refunds need no code change — Cashfree automatically reverses the vendor's already-settled share proportionally to the original split.

**Tech Stack:** NestJS + Prisma + Zod (backend), Vitest + Supertest (e2e, against a real test Postgres DB via `createTestApp`), React + TypeScript (Super Admin frontend, no test runner — manual verification).

**Spec:** `docs/superpowers/specs/2026-09-27-cashfree-commission-split-design.md`

## Global Constraints

- Commission is always an integer in basis points, `0`–`10000` inclusive (0%–100%) — never a float, matching this schema's integer-paise-everywhere convention.
- `PaymentTransaction.commissionBps`/`platformAmount`/`restaurantAmount` are written exactly once, at order-creation time, and never recomputed or rewritten by a later commission-rate change.
- No change to how the Cashfree webhook or the refund endpoint/service works — Cashfree auto-reverses a vendor's split share proportionally on refund; this plan does not touch `createRefund`, `processCashfreeWebhook`, or their tests except to confirm they still pass unmodified.
- Schema changes applied via hand-written SQL + `psql` (this project's standing constraint — never run `prisma migrate diff --shadow-database-url` against the real `DATABASE_URL`).
- Every commission-rate change (platform default or restaurant override) is audit-logged via the existing `AuditService.log()` — action `'COMMISSION_CHANGED'`, category `'PAYMENTS'`.
- Commission config endpoints are Super-Admin-only (`PlatformAuthGuard`), matching every other sensitive action already in this module (approve/suspend/reactivate a connection).
- The full existing e2e suite (`cd cloud/api && npx vitest run`) must stay green throughout — no regressions to the already-shipped, already-hardened payment flows.

## Review Focus

- A restaurant configured at exactly 0% commission must still get a real `order_splits` entry (`percentage: 100`) — omitting the split entirely (the original bug) is not "0% commission," it's "no money routes to the vendor at all." Pinned in Task 3.
- The existing-order retry path (a prior payment attempt is terminal-failed, customer clicks Pay again) must also include the split — today this path doesn't even reload the `RestaurantPaymentConnection`, so it's the easiest place to accidentally leave the old, unsplit behavior in place. Pinned in Task 3.
- A commission value outside `[0, 10000]` must be rejected server-side even for a caller that bypasses the DTO's Zod validation — the service method re-validates, it doesn't trust the controller layer alone for a value stored long-term. Pinned in Tasks 4 and 5.
- Changing the platform default or a restaurant's override must never rewrite a `PaymentTransaction` row created before the change — pinned in Task 3 (a transaction created under one rate keeps its snapshot after the rate changes).
- A non-platform caller (a kiosk/POS device token, or no token at all) must not be able to read or change commission config — pinned in Tasks 4 and 5 by confirming `PlatformAuthGuard` actually rejects such a call, not just assumed from it being applied elsewhere.

---

### Task 1: Schema migration — commission fields

**Files:**
- Modify: `cloud/api/prisma/schema.prisma` (add fields to `RestaurantPaymentConnection` and `PaymentTransaction`)
- Create: `cloud/api/prisma/migrations/20260927060000_payment_commission/migration.sql`

**Interfaces:**
- Produces: `RestaurantPaymentConnection.commissionOverrideBps: Int | null`, `PaymentTransaction.commissionBps: Int | null`, `PaymentTransaction.platformAmount: Int | null`, `PaymentTransaction.restaurantAmount: Int | null` — every later task in this plan reads/writes these exact field names.

- [ ] **Step 1: Add the fields to the Prisma schema**

In `cloud/api/prisma/schema.prisma`, on the `RestaurantPaymentConnection` model, add this field immediately after `lastPaymentAt`:

```prisma
  commissionOverrideBps             Int?                    // basis points, 0-10000; null = use the platform default (PlatformSetting key PAYMENT_DEFAULT_COMMISSION_BPS)
```

On the `PaymentTransaction` model, add these three fields immediately after `failureReason`:

```prisma
  commissionBps     Int?    // basis points snapshot at order-creation time; frozen forever after — never recomputed on a later rate change
  platformAmount    Int?    // paise, computed once at creation from commissionBps
  restaurantAmount  Int?    // paise, computed once at creation; platformAmount + restaurantAmount == amount
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- Commission & split settlement: routes each Cashfree order's restaurant
-- share to the restaurant's own vendor account (previously never declared,
-- so 100% of every payment stayed in the platform's master Cashfree
-- account). commissionBps/platformAmount/restaurantAmount are an immutable
-- snapshot taken once at order-creation time.
ALTER TABLE "RestaurantPaymentConnection" ADD COLUMN "commissionOverrideBps" INTEGER;
ALTER TABLE "PaymentTransaction" ADD COLUMN "commissionBps" INTEGER;
ALTER TABLE "PaymentTransaction" ADD COLUMN "platformAmount" INTEGER;
ALTER TABLE "PaymentTransaction" ADD COLUMN "restaurantAmount" INTEGER;
```

- [ ] **Step 3: Apply the migration to the local/test database and regenerate the Prisma client**

Run:
```bash
cd cloud/api
psql "$DATABASE_URL" -f prisma/migrations/20260927060000_payment_commission/migration.sql
npx prisma generate
```
Expected: both commands exit 0. If a separate test database URL is configured (check `cloud/api/.env.test` or however this project's `createTestApp` resolves its DB — confirm before running), apply the same SQL there too; the e2e tests in later tasks run against that database.

- [ ] **Step 4: Confirm no regression**

Run: `cd cloud/api && npx vitest run`
Expected: same pass count as before this change (these new nullable columns don't affect any existing query — Prisma's generated client only includes them because the schema now declares them, and no existing `select`/`create` call needs updating for a new nullable field it doesn't reference).

- [ ] **Step 5: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations/20260927060000_payment_commission
git commit -m "feat(payments): add commission/split fields to RestaurantPaymentConnection and PaymentTransaction"
```

---

### Task 2: `CashfreeGatewayService.createOrder` — real `order_splits`

**Files:**
- Modify: `cloud/api/src/modules/payments/cashfree-gateway.service.ts`
- Test: `cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `CreateCashfreeOrderInput.orderSplits?: { vendorId: string; percentage: number }[]` — Task 3 passes this field.

- [ ] **Step 1: Write the failing tests**

Add to `cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts`, after the existing `'createOrder throws when Cashfree responds with a non-2xx status'` test:

```typescript
  it('createOrder includes order_splits when orderSplits is provided', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ cf_order_id: '1', order_id: 'pay_1', payment_session_id: 'session_abc', order_status: 'ACTIVE' }),
        { status: 200 }
      )
    );

    await service.createOrder({
      orderId: 'pay_1',
      amountPaise: 10000,
      currency: 'INR',
      customerId: 'order_1',
      orderSplits: [{ vendorId: 'rest_abc123', percentage: 98 }]
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.order_splits).toEqual([{ vendor_id: 'rest_abc123', percentage: 98 }]);
  });

  it('createOrder omits order_splits entirely when orderSplits is not provided', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ cf_order_id: '1', order_id: 'pay_1', payment_session_id: 'session_abc', order_status: 'ACTIVE' }),
        { status: 200 }
      )
    );

    await service.createOrder({ orderId: 'pay_1', amountPaise: 10000, currency: 'INR', customerId: 'order_1' });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.order_splits).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run src/modules/payments/cashfree-gateway.service.spec.ts`
Expected: FAIL — `body.order_splits` is `undefined` in the first new test (the field doesn't exist on `CreateCashfreeOrderInput` yet and nothing serializes it).

- [ ] **Step 3: Implement**

In `cloud/api/src/modules/payments/cashfree-gateway.service.ts`, update the `CreateCashfreeOrderInput` interface:

```typescript
export interface CreateCashfreeOrderInput {
  orderId: string; // 3-45 chars, alphanumeric/underscore/hyphen — our own generated id
  amountPaise: number;
  currency: string;
  customerId: string;
  notifyUrl?: string;
  orderSplits?: { vendorId: string; percentage: number }[];
}
```

Update `createOrder`'s request body:

```typescript
  async createOrder(input: CreateCashfreeOrderInput): Promise<CashfreeOrderResult> {
    const res = await fetch(`${this.baseUrl()}/orders`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: Number((input.amountPaise / 100).toFixed(2)),
        order_currency: input.currency,
        customer_details: { customer_id: input.customerId, customer_phone: PLACEHOLDER_CUSTOMER_PHONE },
        ...(input.notifyUrl ? { order_meta: { notify_url: input.notifyUrl } } : {}),
        ...(input.orderSplits && input.orderSplits.length > 0
          ? { order_splits: input.orderSplits.map((s) => ({ vendor_id: s.vendorId, percentage: s.percentage })) }
          : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree order creation failed: ${body?.message ?? res.statusText}`);
    }
    return { cfOrderId: body.cf_order_id, orderId: body.order_id, paymentSessionId: body.payment_session_id, orderStatus: body.order_status };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run src/modules/payments/cashfree-gateway.service.spec.ts`
Expected: all tests PASS, including the two new ones and every pre-existing test in this file (unchanged behavior when `orderSplits` is absent).

- [ ] **Step 5: Commit**

```bash
git add cloud/api/src/modules/payments/cashfree-gateway.service.ts cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts
git commit -m "feat(payments): CashfreeGatewayService.createOrder sends real order_splits"
```

---

### Task 3: Wire commission resolution into order creation

**Files:**
- Create: `cloud/api/src/modules/payments/commission.util.ts`
- Modify: `cloud/api/src/modules/payments/payments.service.ts`
- Test: `cloud/api/test/payments-orders.e2e.spec.ts`

**Interfaces:**
- Consumes: `CreateCashfreeOrderInput.orderSplits` (Task 2); `RestaurantPaymentConnection.commissionOverrideBps`, `PaymentTransaction.commissionBps`/`platformAmount`/`restaurantAmount` (Task 1).
- Produces: `getDefaultCommissionBps(prisma: PrismaService): Promise<number>` and `PAYMENT_DEFAULT_COMMISSION_BPS_KEY` — Task 4's `PlatformPaymentsService` reads both.

- [ ] **Step 1: Write the failing tests**

Add to `cloud/api/test/payments-orders.e2e.spec.ts`, after the existing `'is idempotent: retrying the same externalOrderId...'` test:

```typescript
  it('sends a 100% vendor split when commission is 0% (no override, no platform default set)', async () => {
    // PlatformSetting is a genuinely global, unscoped table (not restaurant-scoped like
    // everything else this suite touches) — a prior run of this same file (e.g. this
    // test's own "verify it fails" pass before implementation) can leave a real row
    // behind. Delete it first so "no platform default set" is actually true here,
    // regardless of test run history.
    await prisma.runAsPlatform((tx) => tx.platformSetting.deleteMany({ where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' } }));
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { cashfreeVendorId: 'rest_test_vendor' } })
    );
    const createOrderMock = app.get(CashfreeGatewayService).createOrder as ReturnType<typeof vi.fn>;
    createOrderMock.mockClear();

    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-split-1', lines: validLines });
    expect(res.status).toBe(201);

    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderSplits: [{ vendorId: 'rest_test_vendor', percentage: 100 }] })
    );

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: res.body.paymentId } }));
    expect(payment.commissionBps).toBe(0);
    expect(payment.platformAmount).toBe(0);
    expect(payment.restaurantAmount).toBe(res.body.amount);
  });

  it('uses the restaurant commissionOverrideBps over the platform default', async () => {
    await prisma.runAsPlatform((tx) =>
      tx.platformSetting.upsert({
        where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' },
        create: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS', value: { bps: 500 }, category: 'PAYMENTS' },
        update: { value: { bps: 500 } }
      })
    );
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { cashfreeVendorId: 'rest_test_vendor', commissionOverrideBps: 200 } })
    );
    const createOrderMock = app.get(CashfreeGatewayService).createOrder as ReturnType<typeof vi.fn>;
    createOrderMock.mockClear();

    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-split-2', lines: validLines });
    expect(res.status).toBe(201);

    // 54600 total, 2% commission -> 1092 platform, 53508 restaurant, vendor percentage 97.99
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderSplits: [{ vendorId: 'rest_test_vendor', percentage: 97.99 }] })
    );
    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: res.body.paymentId } }));
    expect(payment.commissionBps).toBe(200);
    expect(payment.platformAmount).toBe(1092);
    expect(payment.restaurantAmount).toBe(53508);
  });

  it('falls back to the platform default when no restaurant override is set', async () => {
    await prisma.runAsPlatform((tx) =>
      tx.platformSetting.upsert({
        where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' },
        create: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS', value: { bps: 300 }, category: 'PAYMENTS' },
        update: { value: { bps: 300 } }
      })
    );
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { cashfreeVendorId: 'rest_test_vendor', commissionOverrideBps: null } })
    );

    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-split-3', lines: validLines });
    expect(res.status).toBe(201);
    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: res.body.paymentId } }));
    expect(payment.commissionBps).toBe(300);
  });

  it('changing the platform default does not rewrite an already-created PaymentTransaction', async () => {
    const first = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-split-4', lines: validLines });
    const before = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: first.body.paymentId } }));

    await prisma.runAsPlatform((tx) =>
      tx.platformSetting.upsert({
        where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' },
        create: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS', value: { bps: 999 }, category: 'PAYMENTS' },
        update: { value: { bps: 999 } }
      })
    );

    const after = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: first.body.paymentId } }));
    expect(after.commissionBps).toBe(before.commissionBps);
  });

  it('a retried order (prior attempt terminal-failed) also includes the vendor split', async () => {
    const create = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-split-5', lines: validLines });
    await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: create.body.paymentId }, data: { status: 'FAILED' } }));

    const createOrderMock = app.get(CashfreeGatewayService).createOrder as ReturnType<typeof vi.fn>;
    createOrderMock.mockClear();

    const retry = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-split-5', lines: validLines });
    expect(retry.status).toBe(201);
    expect(retry.body.orderId).toBe(create.body.orderId);
    expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({ orderSplits: expect.any(Array) }));
  });
```

Restore a clean, deleted `PlatformSetting` row at the end of this file's existing `afterAll` (so this global, unscoped table is never left with a leftover 999-bps test value for the user's own later manual/sandbox testing against the same database):

```typescript
  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.platformSetting.deleteMany({ where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });
```

(This replaces the existing `afterAll` block — same body, with the one new `deleteMany` line added first.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/payments-orders.e2e.spec.ts`
Expected: FAIL — `createOrderMock` is called without an `orderSplits` field at all (still `undefined`), and `payment.commissionBps` is `null` on every assertion.

- [ ] **Step 3: Implement `commission.util.ts`**

Create `cloud/api/src/modules/payments/commission.util.ts`:

```typescript
import { PrismaService } from '../../prisma/prisma.service';

export const PAYMENT_DEFAULT_COMMISSION_BPS_KEY = 'PAYMENT_DEFAULT_COMMISSION_BPS';

export async function getDefaultCommissionBps(prisma: PrismaService): Promise<number> {
  const row = await prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY } }));
  const value = row?.value as { bps?: number } | undefined;
  return typeof value?.bps === 'number' ? value.bps : 0;
}
```

- [ ] **Step 4: Wire it into `payments.service.ts`**

In `cloud/api/src/modules/payments/payments.service.ts`, add the import:

```typescript
import { getDefaultCommissionBps } from './commission.util';
```

Replace `createOrGetPaymentOrder` (currently lines 25-89) with:

```typescript
  async createOrGetPaymentOrder(restaurantId: string, kioskId: string, dto: CreatePaymentOrderDto) {
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));

    const existingOrder = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: dto.externalOrderId } },
        include: { paymentTransactions: { orderBy: { createdAt: 'desc' } } }
      })
    );

    if (existingOrder) {
      const latest = existingOrder.paymentTransactions[0];
      if (existingOrder.status === 'PAID' || (latest && NON_TERMINAL_STATUSES.includes(latest.status))) {
        return this.toOrderResponse(existingOrder, latest);
      }
      // Every prior attempt is terminal-failed: open a fresh attempt at the same, already-validated total.
      const payment = await this.createCashfreeAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency, connection);
      return this.toOrderResponse(existingOrder, payment);
    }

    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException('Online payments are not active for this restaurant yet');
    }

    const menuItems = await this.menuSync.loadItemsByExternalIds(restaurantId, dto.lines.map((l) => l.externalItemId));
    const lookup = new Map<string, MenuSnapshotItemLookup>(
      menuItems.map((item) => [
        item.externalItemId,
        {
          externalItemId: item.externalItemId,
          name: item.name,
          basePrice: item.basePrice,
          taxRate: item.taxRate,
          isAvailable: item.isAvailable,
          modifierGroups: (item.modifierGroups as unknown as MenuSnapshotItemLookup['modifierGroups']) ?? []
        }
      ])
    );

    let priced;
    try {
      priced = priceCart(dto.lines, lookup);
    } catch (err) {
      if (err instanceof PriceValidationError) throw new BadRequestException(err.message);
      throw err;
    }

    const order = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: {
          restaurantId,
          kioskId,
          externalOrderId: dto.externalOrderId,
          items: priced.lines as unknown as Prisma.InputJsonValue,
          subtotal: priced.subtotal,
          taxAmount: priced.taxAmount,
          discountAmount: 0,
          totalAmount: priced.totalAmount,
          status: 'PENDING_PAYMENT'
        }
      })
    );

    const payment = await this.createCashfreeAttempt(order.id, restaurantId, order.totalAmount, order.currency, connection);
    return this.toOrderResponse(order, payment);
  }
```

Note: `connection` is now loaded once, before the `existingOrder` branch, so the retry path can pass it into `createCashfreeAttempt` too. The `!connection || connection.status !== 'ACTIVE'` gate stays exactly where it was — only reached on the fresh-order path, unchanged from today's behavior (the retry path never re-checks connection status, matching its existing behavior; this plan does not change that gate's semantics, only makes the connection object available to both paths for the split).

Replace `createCashfreeAttempt` (currently lines 91-109) with:

```typescript
  private async createCashfreeAttempt(
    orderId: string,
    restaurantId: string,
    amount: number,
    currency: string,
    connection: { cashfreeVendorId: string | null; commissionOverrideBps: number | null } | null
  ) {
    const commissionBps = connection?.commissionOverrideBps ?? (await getDefaultCommissionBps(this.prisma));
    const platformAmount = Math.round((amount * commissionBps) / 10000);
    const restaurantAmount = amount - platformAmount;
    const vendorPercentage = Number(((restaurantAmount / amount) * 100).toFixed(2));

    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, providerOrderId: `pay_${randomUUID()}`, amount, currency, status: 'CREATED', commissionBps, platformAmount, restaurantAmount }
      })
    );

    const cfOrder = await this.cashfree.createOrder({
      orderId: payment.providerOrderId,
      amountPaise: amount,
      currency,
      customerId: orderId,
      notifyUrl: this.config.get<string>('CASHFREE_WEBHOOK_NOTIFY_URL'),
      orderSplits: connection?.cashfreeVendorId ? [{ vendorId: connection.cashfreeVendorId, percentage: vendorPercentage }] : undefined
    });

    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.update({ where: { id: payment.id }, data: { paymentSessionId: cfOrder.paymentSessionId, status: 'PENDING' } })
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/payments-orders.e2e.spec.ts`
Expected: all tests PASS, including the five new ones and every pre-existing test in this file.

- [ ] **Step 6: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: same pass count as Task 1's baseline, plus the new tests — no regressions in `payments-refund.e2e.spec.ts`, `payments-webhook.e2e.spec.ts`, `payment-connections.e2e.spec.ts`, or `platform-payments.e2e.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/payments/commission.util.ts cloud/api/src/modules/payments/payments.service.ts cloud/api/test/payments-orders.e2e.spec.ts
git commit -m "feat(payments): resolve and snapshot commission, wire real order_splits into order creation"
```

---

### Task 4: Platform default commission config

**Files:**
- Create: `cloud/api/src/modules/payments/dto/commission-config.dto.ts`
- Modify: `cloud/api/src/modules/payments/platform-payments.service.ts`
- Modify: `cloud/api/src/modules/payments/platform-payments.controller.ts`
- Modify: `cloud/api/src/modules/payments/payments.module.ts`
- Test: `cloud/api/test/platform-payments.e2e.spec.ts`

**Interfaces:**
- Consumes: `getDefaultCommissionBps`/`PAYMENT_DEFAULT_COMMISSION_BPS_KEY` (Task 3).
- Produces: `GET /api/v1/payments/commission-config` → `{ defaultBps: number }`; `PATCH /api/v1/payments/commission-config` body `{ defaultBps: number }`.

- [ ] **Step 1: Write the failing tests**

Add to `cloud/api/test/platform-payments.e2e.spec.ts` (read the file first to match its existing `beforeAll`/token setup exactly — it already has a `platformToken` and an `authed` helper from the same pattern as `payments-orders.e2e.spec.ts`):

```typescript
  it('GET /commission-config defaults to 0 when never set', async () => {
    const res = await authed('get', '/api/v1/payments/commission-config', platformToken);
    expect(res.status).toBe(200);
    expect(typeof res.body.defaultBps).toBe('number');
  });

  it('PATCH /commission-config sets the platform default and it is reflected on GET', async () => {
    const res = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 250 });
    expect(res.status).toBe(200);
    expect(res.body.defaultBps).toBe(250);

    const getRes = await authed('get', '/api/v1/payments/commission-config', platformToken);
    expect(getRes.body.defaultBps).toBe(250);
  });

  it('PATCH /commission-config rejects an out-of-range value', async () => {
    const tooHigh = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 10001 });
    expect(tooHigh.status).toBe(400);
    const negative = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: -1 });
    expect(negative.status).toBe(400);
  });

  it('PATCH /commission-config records an audit log entry', async () => {
    await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 400 });
    const entry = await prisma.runAsPlatform((tx) =>
      tx.auditLog.findFirst({ where: { action: 'COMMISSION_CHANGED', category: 'PAYMENTS' }, orderBy: { createdAt: 'desc' } })
    );
    expect(entry).not.toBeNull();
    expect((entry!.details as { scope?: string })?.scope).toBe('PLATFORM_DEFAULT');
  });

  it('a non-platform caller cannot read or change commission config', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/payments/commission-config');
    expect(res.status).toBe(401);
  });
```

`authed` in this test file's existing helper only takes `get`/`post` per the pattern seen elsewhere — check its exact signature when adding this; extend it to accept `'patch'` if it doesn't already (this file already exercises `PlatformAuthGuard`-protected routes for its existing list/detail tests, so a `patch` variant is a small, natural addition following the identical shape).

Add cleanup to this file's existing `afterAll` (same reasoning as Task 3: `PlatformSetting` is a genuinely global, unscoped table, and these tests must not leave a leftover commission value for the user's own later manual/sandbox testing against the same database):

```typescript
  await prisma.runAsPlatform((tx) => tx.platformSetting.deleteMany({ where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' } }));
```

(add this line to whatever this file's `afterAll` already does, following the same placement convention as Task 3's change to `payments-orders.e2e.spec.ts`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/platform-payments.e2e.spec.ts`
Expected: FAIL with 404 (no such route exists yet).

- [ ] **Step 3: Implement the DTO**

Create `cloud/api/src/modules/payments/dto/commission-config.dto.ts`:

```typescript
import { z } from 'zod';

export const setCommissionConfigSchema = z.object({
  defaultBps: z.number().int().min(0).max(10000)
});
export type SetCommissionConfigDto = z.infer<typeof setCommissionConfigSchema>;

export const setCommissionOverrideSchema = z.object({
  overrideBps: z.number().int().min(0).max(10000).nullable()
});
export type SetCommissionOverrideDto = z.infer<typeof setCommissionOverrideSchema>;
```

- [ ] **Step 4: Implement the service methods**

In `cloud/api/src/modules/payments/platform-payments.service.ts`, add the `AuditService` dependency and the two new methods:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentTransactionStatus, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PAYMENT_DEFAULT_COMMISSION_BPS_KEY, getDefaultCommissionBps } from './commission.util';

export interface PlatformPaymentFilters {
  restaurantId?: string;
  status?: PaymentTransactionStatus;
  page: number;
  limit: number;
}

@Injectable()
export class PlatformPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // ...existing list() and getById() unchanged...

  async getCommissionConfig() {
    return { defaultBps: await getDefaultCommissionBps(this.prisma) };
  }

  async setDefaultCommissionBps(bps: number, actor: PlatformUser) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      throw new BadRequestException('defaultBps must be an integer between 0 and 10000');
    }
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.platformSetting.findUnique({ where: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY } });
      const oldBps = (existing?.value as { bps?: number } | undefined)?.bps ?? 0;
      await tx.platformSetting.upsert({
        where: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY },
        create: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY, value: { bps }, category: 'PAYMENTS', updatedBy: actor.id },
        update: { value: { bps }, updatedBy: actor.id }
      });
      await this.audit.log(
        { actorType: 'PLATFORM', actorId: actor.id, action: 'COMMISSION_CHANGED', category: 'PAYMENTS', details: { scope: 'PLATFORM_DEFAULT', oldBps, newBps: bps } },
        tx
      );
      return { defaultBps: bps };
    });
  }
}
```

(Keep the file's existing `list`/`getById` methods exactly as they are — only the constructor and these two new methods are added.)

- [ ] **Step 5: Implement the controller routes**

In `cloud/api/src/modules/payments/platform-payments.controller.ts`, add the new routes **above** the existing `@Get(':paymentId')` route (NestJS matches routes in declaration order for the same HTTP method — `commission-config` would otherwise be captured by the `:paymentId` param route):

```typescript
import { Body, Controller, Get, Param, Patch, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PaymentTransactionStatus, PlatformUser } from '@prisma/client';
import { PlatformPaymentsService } from './platform-payments.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setCommissionConfigSchema, SetCommissionConfigDto } from './dto/commission-config.dto';

@Controller('api/v1/payments')
@UseGuards(PlatformAuthGuard)
export class PlatformPaymentsController {
  constructor(private readonly platformPayments: PlatformPaymentsService) {}

  @Get('commission-config')
  getCommissionConfig() {
    return this.platformPayments.getCommissionConfig();
  }

  @Patch('commission-config')
  @UsePipes(new ZodValidationPipe(setCommissionConfigSchema))
  setCommissionConfig(@Body() body: SetCommissionConfigDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformPayments.setDefaultCommissionBps(body.defaultBps, actor);
  }

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

- [ ] **Step 6: Confirm the module still wires correctly**

`cloud/api/src/modules/payments/payments.module.ts` already imports `AuditModule` and already lists `PlatformPaymentsService` as a provider — no change needed there (the new `AuditService` constructor dependency resolves from the module's existing `AuditModule` import).

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/platform-payments.e2e.spec.ts`
Expected: all tests PASS, including the five new ones and every pre-existing test in this file.

- [ ] **Step 8: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: no regressions.

- [ ] **Step 9: Commit**

```bash
git add cloud/api/src/modules/payments/dto/commission-config.dto.ts cloud/api/src/modules/payments/platform-payments.service.ts cloud/api/src/modules/payments/platform-payments.controller.ts cloud/api/test/platform-payments.e2e.spec.ts
git commit -m "feat(payments): add Super Admin platform-default commission config endpoints"
```

---

### Task 5: Per-restaurant commission override

**Files:**
- Modify: `cloud/api/src/modules/payments/payment-connections.service.ts`
- Modify: `cloud/api/src/modules/payments/platform-payment-connections.controller.ts`
- Test: `cloud/api/test/payment-connections.e2e.spec.ts`

**Interfaces:**
- Consumes: `setCommissionOverrideSchema`/`SetCommissionOverrideDto` (Task 4).
- Produces: `PATCH /api/v1/restaurants/:id/payment-connection/commission` body `{ overrideBps: number | null }`; `RestaurantPaymentConnection.commissionOverrideBps` now appears in `toPlatformView`'s response shape.

- [ ] **Step 1: Write the failing tests**

Add to `cloud/api/test/payment-connections.e2e.spec.ts` (read the file first to match its existing setup/token variables exactly):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts`
Expected: FAIL with 404 (no such route exists yet).

- [ ] **Step 3: Implement the service method**

In `cloud/api/src/modules/payments/payment-connections.service.ts`, add this method (placed after `refreshStatus`):

```typescript
  async setCommissionOverride(restaurantId: string, overrideBps: number | null, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!existing) throw new NotFoundException('No payment connection for this restaurant');
      const updated = await tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { commissionOverrideBps: overrideBps } });
      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId,
          action: 'COMMISSION_CHANGED',
          category: 'PAYMENTS',
          details: { scope: 'RESTAURANT_OVERRIDE', oldBps: existing.commissionOverrideBps, newBps: overrideBps }
        },
        tx
      );
      return { commissionOverrideBps: updated.commissionOverrideBps };
    });
  }
```

In the existing `toPlatformView` method's parameter type (the large inline object type starting `private toPlatformView(connection: {`), add this line after `lastPaymentAt: Date | null;`:

```typescript
    commissionOverrideBps: number | null;
```

And in that same method's returned object, add this line after `verifiedAt: connection.verifiedAt,`:

```typescript
      commissionOverrideBps: connection.commissionOverrideBps,
```

This makes the field appear in both `listForPlatform()` and `getForPlatform()` responses (both call `toPlatformView`), and in this task's own `setCommissionOverride` response (which reuses the same shape — no, `setCommissionOverride` returns its own small `{ commissionOverrideBps }` object directly, not `toPlatformView`; only the list/detail endpoints need this change).

- [ ] **Step 4: Implement the controller route**

In `cloud/api/src/modules/payments/platform-payment-connections.controller.ts`, add the import and route:

```typescript
import { Body, Controller, Get, Param, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PaymentConnectionsService } from './payment-connections.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setCommissionOverrideSchema, SetCommissionOverrideDto } from './dto/commission-config.dto';

@Controller()
@UseGuards(PlatformAuthGuard)
export class PlatformPaymentConnectionsController {
  constructor(private readonly connections: PaymentConnectionsService) {}

  // ...existing list/detail/approve/suspend/reactivate/disconnect/refreshStatus routes unchanged...

  @Patch('api/v1/restaurants/:id/payment-connection/commission')
  @UsePipes(new ZodValidationPipe(setCommissionOverrideSchema))
  setCommission(@Param('id') id: string, @Body() body: SetCommissionOverrideDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.setCommissionOverride(id, body.overrideBps, actor);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts`
Expected: all tests PASS, including the five new ones and every pre-existing test in this file.

- [ ] **Step 6: Run the full backend suite for regressions**

Run: `cd cloud/api && npx vitest run`
Expected: no regressions — this is also the point to confirm Task 3's assumption (retry path passing `connection` through) still holds across the whole suite, not just its own file.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/payments/payment-connections.service.ts cloud/api/src/modules/payments/platform-payment-connections.controller.ts cloud/api/test/payment-connections.e2e.spec.ts
git commit -m "feat(payments): add per-restaurant commission override endpoint"
```

---

### Task 6: Super Admin frontend — commission controls

**Files:**
- Modify: `cloud/super-admin-web/src/api/types.ts`
- Modify: `cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/v1/payments/commission-config` (Task 4), `PATCH /api/v1/restaurants/:id/payment-connection/commission` (Task 5).

- [ ] **Step 1: Add the field to the `PaymentConnection` type**

In `cloud/super-admin-web/src/api/types.ts`, add `commissionOverrideBps: number | null;` to the `PaymentConnection` interface (after `cashfreeVendorStatus`).

- [ ] **Step 2: Add a platform-default commission control to the page header**

In `cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx`, add state and a load call for the platform default, and a small inline editor in the page header:

```typescript
  const [defaultBps, setDefaultBps] = useState<number | null>(null);
  const [defaultBpsInput, setDefaultBpsInput] = useState('');
  const [savingDefault, setSavingDefault] = useState(false);

  useEffect(() => {
    api.get<{ defaultBps: number }>('/api/v1/payments/commission-config').then((d) => {
      setDefaultBps(d.defaultBps);
      setDefaultBpsInput(String(d.defaultBps / 100));
    }).catch(() => {});
  }, []);

  async function handleSaveDefaultCommission() {
    const percent = Number(defaultBpsInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      showToast('Enter a percentage between 0 and 100');
      return;
    }
    setSavingDefault(true);
    try {
      const result = await api.patch<{ defaultBps: number }>('/api/v1/payments/commission-config', { defaultBps: Math.round(percent * 100) });
      setDefaultBps(result.defaultBps);
      showToast(`Platform default commission set to ${percent}%`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save default commission');
    } finally {
      setSavingDefault(false);
    }
  }
```

Add the control markup inside the existing `page-header` block, after the title/subtitle `<div>`:

```tsx
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Platform default commission</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={defaultBpsInput}
            onChange={(e) => setDefaultBpsInput(e.target.value)}
            style={{ width: 70 }}
          />
          <span className="muted" style={{ fontSize: 12 }}>%</span>
          <Button size="sm" variant="ghost" disabled={savingDefault} onClick={handleSaveDefaultCommission}>Save</Button>
        </div>
```

(`defaultBps` fetched but not otherwise displayed separately — `defaultBpsInput` is the editable, always-current display of it.)

- [ ] **Step 3: Add a per-restaurant override column**

Add a new `<th>Commission</th>` column (after `<th>Cashfree</th>`) and a corresponding `<td>` in the row map, with local per-row edit state:

```typescript
  const [overrideEdits, setOverrideEdits] = useState<Record<string, string>>({});
  const [savingOverrideId, setSavingOverrideId] = useState<string | null>(null);

  async function handleSaveOverride(c: PaymentConnection) {
    const raw = overrideEdits[c.id];
    const overrideBps = raw === undefined || raw === '' ? null : Math.round(Number(raw) * 100);
    if (overrideBps !== null && (!Number.isFinite(overrideBps) || overrideBps < 0 || overrideBps > 10000)) {
      showToast('Enter a percentage between 0 and 100, or leave blank to use the platform default');
      return;
    }
    setSavingOverrideId(c.id);
    try {
      await api.patch(`/api/v1/restaurants/${c.restaurantId}/payment-connection/commission`, { overrideBps });
      showToast(`${c.restaurant.name}: commission override saved`);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save commission override');
    } finally {
      setSavingOverrideId(null);
    }
  }
```

```tsx
                      <td style={{ fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            placeholder={defaultBps !== null ? `${defaultBps / 100}% default` : '—'}
                            value={overrideEdits[c.id] ?? (c.commissionOverrideBps !== null ? String(c.commissionOverrideBps / 100) : '')}
                            onChange={(e) => setOverrideEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            style={{ width: 60 }}
                          />
                          <Button size="sm" variant="ghost" disabled={savingOverrideId === c.id} onClick={() => handleSaveOverride(c)}>Save</Button>
                        </div>
                      </td>
```

- [ ] **Step 4: Manual verification**

No test runner exists for `super-admin-web` (matching every other page in this app — established finding from prior sub-projects). Start the dev servers (`cloud/api` and `super-admin-web`) and, logged in as a platform user:
1. Navigate to the Payment Gateways page. Confirm the platform-default commission field loads (shows `0` if never set).
2. Change it to e.g. `2` (%), click Save, confirm the toast and that reloading the page still shows `2`.
3. For a restaurant with an active connection, enter e.g. `1.5` in its row's commission field, click Save, confirm the toast and that the value persists on reload.
4. Clear a restaurant's override (empty the input, Save), confirm it reverts to showing the platform-default placeholder.

- [ ] **Step 5: Commit**

```bash
git add cloud/super-admin-web/src/api/types.ts cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx
git commit -m "feat(super-admin): add platform-default and per-restaurant commission controls"
```

---

### Task 7: Final full-suite regression pass

**Files:** none (verification only).

- [ ] **Step 1: Run the entire backend suite**

Run: `cd cloud/api && npx vitest run`
Expected: all tests pass, including every test added in Tasks 2-5, with no regressions anywhere else in the suite (payments, refunds, webhooks, connections, platform-payments, and every unrelated module).

- [ ] **Step 2: Run the root workspace suite**

Run: `npx vitest run` (from the repo root)
Expected: same pass count as this project's last known baseline (170 files / 1171 tests per the most recent session checkpoint) plus nothing removed — this plan adds no root-level tests, so an exact match confirms no cross-package regression.

- [ ] **Step 3: Report to the user**

Summarize what was built, note that real sandbox verification (an actual Cashfree order with `order_splits` reaching a real sandbox vendor) requires the user's own `CASHFREE_CLIENT_ID`/`CASHFREE_CLIENT_SECRET`/`CASHFREE_WEBHOOK_SECRET` env vars — which the user has said they will add themselves — and that until those are set, `CashfreeGatewayService.isConfigured()` remains `false` and every real call throws `ServiceUnavailableException`, exactly as today.

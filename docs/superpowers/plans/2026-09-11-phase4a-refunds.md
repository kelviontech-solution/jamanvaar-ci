# Phase 4a: Real Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built `RazorpayGatewayService.createRefund()` to a real, webhook-confirmed refund endpoint, give POS a real device identity so it can reach it, and replace the local-only refund status flip in POS and POS Admin with a real Razorpay refund for UPI-paid orders.

**Architecture:** A new `POST /api/v1/payments/:paymentId/refund` route (device-authed, `POS`/`POS_ADMIN` only) creates a `Refund` row and calls Razorpay synchronously, but treats that response as provisional — only `REFUND_STATUS_WEBHOOK` (extending the existing single-endpoint webhook handler) ever writes a final `REFUNDED`/`PARTIALLY_REFUNDED` state. POS gets device activation via the already-recognized `deviceType: 'POS'`; POS Admin already has credentials and needs no new activation work.

**Tech Stack:** NestJS/Prisma (`cloud/api`), React/Tauri (`apps/restaurant-system/pos`, `apps/restaurant-system/pos-admin`), Razorpay Refunds API.

**Spec:** docs/superpowers/specs/2026-09-11-phase4-refunds-design.md

## Global Constraints

- **Never trust the synchronous Razorpay refund response for final state.** `createRefund()`'s handler may only ever set `PaymentTransaction.status` to `REFUND_PENDING` — never `REFUNDED`/`PARTIALLY_REFUNDED`. Only the `REFUND_STATUS_WEBHOOK` handler writes those.
- **The refundable-amount check counts `PENDING` refunds too**, not just `SUCCESS` ones — a second refund request issued before the first's webhook lands must not be approved against the same remaining balance.
- **Money amounts are integer paise** everywhere in `cloud/api`, matching every other payment code in this codebase. The local domain model (POS) is rupees — conversion points are explicit below.
- **Do not use `prisma migrate diff --shadow-database-url` against the real `DATABASE_URL`.** The one schema change in this plan (adding `PARTIALLY_REFUNDED`/`REFUNDED` to `OrderPaymentStatus`) is applied via hand-written SQL + `psql`, exactly like every prior migration in this project.
- **Cash/card-only orders are untouched.** `OrderRepository.refundOrder()`'s existing local-only behavior for orders with no real Razorpay transaction (`paymentMethod !== 'UPI'` or no `paymentTransactionId`) does not change at all.

---

## Task 1: Schema migration + refund creation endpoint

**Files:**
- Modify: `cloud/api/prisma/schema.prisma`
- Create: `cloud/api/prisma/migrations/<timestamp>_order_refund_statuses/migration.sql`
- Create: `cloud/api/src/modules/payments/dto/create-refund.dto.ts`
- Modify: `cloud/api/src/modules/payments/payments.service.ts`
- Modify: `cloud/api/src/modules/payments/payment-orders.controller.ts`
- Test: `cloud/api/test/payments-refund.e2e.spec.ts`

**Interfaces:**
- Produces: `PaymentsService.createRefund(restaurantId: string, paymentId: string, dto: CreateRefundDto): Promise<{ refundId: string; providerRefundId: string; status: string; amount: number }>` — consumed by Task 2 (no changes needed there, but Task 2's webhook handler updates the same `Refund`/`PaymentTransaction`/`Order` rows this task creates) and by the controller route.
- Produces: `POST /api/v1/payments/:paymentId/refund` — consumed by Task 4 (POS) and Task 5 (POS Admin).

- [ ] **Step 1: Add the schema change**

In `cloud/api/prisma/schema.prisma`, add two new values to the existing `OrderPaymentStatus` enum (find it via `grep -n "enum OrderPaymentStatus" cloud/api/prisma/schema.prisma`):

```prisma
enum OrderPaymentStatus {
  DRAFT
  PENDING_PAYMENT
  PAYMENT_PROCESSING
  PAID
  SENT_TO_POS
  PAYMENT_FAILED
  CANCELLED
  PARTIALLY_REFUNDED
  REFUNDED
}
```

Create `cloud/api/prisma/migrations/<YYYYMMDDHHMMSS>_order_refund_statuses/migration.sql` (pick a timestamp later than the most recent existing migration folder — check with `ls cloud/api/prisma/migrations | sort | tail -1`) with hand-written, idempotent SQL (matching this project's established pattern for every prior migration):

```sql
-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "OrderPaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "OrderPaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

Apply it directly with `psql` against the real `DATABASE_URL` (never `prisma migrate diff --shadow-database-url` — this project's standing constraint after an earlier data-loss incident). Confirm additive-only via `\d "Order"` or an equivalent enum-values check before and after. Then run `npx prisma generate` in `cloud/api` and confirm the regenerated client actually exposes the two new enum values (a real round-trip check, not just a successful exit code — this project has previously hit `EPERM` renaming the query-engine DLL when a dev server holds the file lock; if that happens, verify functionally rather than killing the dev server, per this project's established remediation).

- [ ] **Step 2: Write the refund DTO**

```typescript
// cloud/api/src/modules/payments/dto/create-refund.dto.ts
import { z } from 'zod';

// No status field, no client-sent "is this valid" trust — the service
// layer re-validates the amount against what's actually still refundable.
export const createRefundSchema = z.object({
  amountPaise: z.number().int().min(1),
  reason: z.string().min(1).max(500)
});

export type CreateRefundDto = z.infer<typeof createRefundSchema>;
```

- [ ] **Step 3: Add `PaymentsService.createRefund`**

In `cloud/api/src/modules/payments/payments.service.ts`, add the import at the top:

```typescript
import { CreateRefundDto } from './dto/create-refund.dto';
```

Add this method to the `PaymentsService` class, after `getPaymentStatus` (currently ending around line 121) and before `processRazorpayWebhook`:

```typescript
async createRefund(restaurantId: string, paymentId: string, dto: CreateRefundDto) {
  const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
    tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId } })
  );
  if (!payment) throw new NotFoundException('Payment not found');

  if (payment.status !== 'SUCCESS' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new BadRequestException(`Cannot refund a payment in status ${payment.status}`);
  }

  // PENDING counts against the remaining balance too, not just SUCCESS — a
  // second refund request issued before the first's webhook lands must not
  // be approved against the same remaining balance.
  const committed = await this.prisma.runAsTenant(restaurantId, (tx) =>
    tx.refund.aggregate({
      where: { paymentId: payment.id, status: { in: ['SUCCESS', 'PENDING'] } },
      _sum: { amount: true }
    })
  );
  const alreadyCommitted = committed._sum.amount ?? 0;
  const remaining = payment.amount - alreadyCommitted;
  if (dto.amountPaise > remaining) {
    throw new BadRequestException(`Refund amount ${dto.amountPaise} exceeds remaining refundable amount ${remaining}`);
  }

  const refund = await this.prisma.runAsTenant(restaurantId, (tx) =>
    tx.refund.create({
      data: { paymentId: payment.id, restaurantId, amount: dto.amountPaise, reason: dto.reason, status: 'PENDING' }
    })
  );

  let result;
  try {
    result = await this.razorpay.createRefund({
      orderId: payment.providerOrderId,
      refundId: refund.id,
      amountPaise: dto.amountPaise,
      note: dto.reason
    });
  } catch (err) {
    await this.prisma.runAsTenant(restaurantId, (tx) => tx.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } }));
    throw err;
  }

  // The synchronous response is informational only — store whatever
  // Razorpay reports on the Refund row itself, but never let it flip
  // PaymentTransaction/Order to a final refunded state. Only the
  // REFUND_STATUS_WEBHOOK handler (Task 2) does that.
  const informationalStatus = result.refundStatus === 'SUCCESS' ? 'SUCCESS' : result.refundStatus === 'FAILED' ? 'FAILED' : 'PENDING';
  await this.prisma.runAsTenant(restaurantId, (tx) =>
    tx.refund.update({
      where: { id: refund.id },
      data: { providerRefundId: result.cfRefundId, status: informationalStatus }
    })
  );
  await this.prisma.runAsTenant(restaurantId, (tx) =>
    tx.paymentTransaction.update({ where: { id: payment.id }, data: { status: 'REFUND_PENDING' } })
  );

  return { refundId: refund.id, providerRefundId: result.cfRefundId, status: result.refundStatus, amount: dto.amountPaise };
}
```

- [ ] **Step 4: Add the controller route**

In `cloud/api/src/modules/payments/payment-orders.controller.ts`, update the imports and add the route:

```typescript
import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { createPaymentOrderSchema, CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { createRefundSchema, CreateRefundDto } from './dto/create-refund.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('api/v1/payments')
@UseGuards(DeviceAuthGuard)
export class PaymentOrdersController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders')
  @UsePipes(new ZodValidationPipe(createPaymentOrderSchema))
  async createOrder(@Body() body: CreatePaymentOrderDto, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK' && device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only a Kiosk device can create a payment order');
    }
    return this.payments.createOrGetPaymentOrder(device.restaurantId, device.id, body);
  }

  @Get(':paymentId/status')
  async getStatus(@Param('paymentId') paymentId: string, @CurrentDevice() device: Device) {
    return this.payments.getPaymentStatus(device.restaurantId, paymentId);
  }

  @Post(':paymentId/refund')
  @UsePipes(new ZodValidationPipe(createRefundSchema))
  async refund(@Param('paymentId') paymentId: string, @Body() body: CreateRefundDto, @CurrentDevice() device: Device) {
    if (device.type !== 'POS' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only a POS device can initiate a refund');
    }
    return this.payments.createRefund(device.restaurantId, paymentId, body);
  }
}
```

- [ ] **Step 5: Write the e2e tests**

Create `cloud/api/test/payments-refund.e2e.spec.ts`, following `test/payments-orders.e2e.spec.ts`'s exact setup pattern (restaurant + plan + subscription + activation-key + redeem) and mocking `RazorpayGatewayService`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';

describe('Refund creation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-refund-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let posToken: string;
  let kioskToken: string;
  let createRefundMock: ReturnType<typeof vi.fn>;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    createRefundMock = vi.fn().mockResolvedValue({ cfRefundId: 'cf_refund_mock', refundId: 'refund_mock', refundStatus: 'PENDING', refundAmount: 100 });
    app = await createTestApp((builder) =>
      builder.overrideProvider(RazorpayGatewayService).useValue({
        isConfigured: () => true,
        createRefund: createRefundMock
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Refund Restaurant ${Date.now()}`, ownerName: 'Refund Owner', ownerEmail: `refund-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;

    const kioskKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kioskRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kioskKeyRes.body.code, deviceType: 'KIOSK' });
    kioskToken = kioskRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const seedPaidOrder = async (amount: number) => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-test-${Date.now()}-${Math.random()}`, items: [], subtotal: amount, taxAmount: 0, totalAmount: amount, status: 'PAID' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: order.id, restaurantId, providerOrderId: `pay_${Date.now()}_${Math.random()}`, amount, currency: 'INR', status: 'SUCCESS' } })
    );
    return payment.id;
  };

  it('a KIOSK device cannot initiate a refund (403)', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, kioskToken).send({ amountPaise: 10000, reason: 'Customer request' });
    expect(res.status).toBe(403);
  });

  it('creates a refund, sets PaymentTransaction to REFUND_PENDING, never claims REFUNDED synchronously', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 10000, reason: 'Customer request' });
    expect(res.status).toBe(201);
    expect(res.body.refundId).toBeTruthy();

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUND_PENDING');

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: payment.orderId } }));
    expect(order.status).toBe('PAID'); // untouched — only the webhook finalizes this
  });

  it('rejects a refund exceeding the remaining refundable amount', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 10001, reason: 'Too much' });
    expect(res.status).toBe(400);
  });

  it('counts a PENDING refund against the remaining balance for a second request', async () => {
    const paymentId = await seedPaidOrder(10000);
    const first = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 6000, reason: 'Partial 1' });
    expect(first.status).toBe(201);

    const second = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 5000, reason: 'Partial 2' });
    expect(second.status).toBe(400); // 6000 + 5000 > 10000, and the first is still PENDING
  });

  it('rejects a refund on a payment that was never SUCCESS', async () => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-unpaid-${Date.now()}`, items: [], subtotal: 5000, taxAmount: 0, totalAmount: 5000, status: 'PENDING_PAYMENT' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: order.id, restaurantId, providerOrderId: `pay_unpaid_${Date.now()}`, amount: 5000, currency: 'INR', status: 'PENDING' } })
    );
    const res = await authed('post', `/api/v1/payments/${payment.id}/refund`, posToken).send({ amountPaise: 5000, reason: 'Too early' });
    expect(res.status).toBe(400);
  });

  it('a POS device from another restaurant cannot refund this restaurant\'s payment', async () => {
    const paymentId = await seedPaidOrder(10000);

    const otherRestaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Refund Restaurant ${Date.now()}`, ownerName: 'Other Owner', ownerEmail: `other-refund-owner-${Date.now()}@test.example.com`
    });
    const otherRestaurantId = otherRestaurantRes.body.restaurant.id;
    const otherKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId: otherRestaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const otherRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: otherKeyRes.body.code, deviceType: 'POS' });
    const otherPosToken = otherRedeemRes.body.deviceToken;

    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, otherPosToken).send({ amountPaise: 10000, reason: 'Cross-tenant attempt' });
    expect(res.status).toBe(404); // tenant-scoped lookup finds nothing, not a 403 that would confirm the payment exists

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });
});
```

- [ ] **Step 6: Run the tests, verify, commit**

```bash
cd cloud/api
npx vitest run test/payments-refund.e2e.spec.ts
npx tsc --noEmit -p tsconfig.json
```

Expected: all 6 new tests pass, `tsc` clean. Then run the full suite (`npm test`) to confirm no regressions.

```bash
git add cloud/api/prisma/schema.prisma "cloud/api/prisma/migrations/<timestamp>_order_refund_statuses" cloud/api/src/modules/payments/dto/create-refund.dto.ts cloud/api/src/modules/payments/payments.service.ts cloud/api/src/modules/payments/payment-orders.controller.ts cloud/api/test/payments-refund.e2e.spec.ts
git commit -m "feat(payments): add refund creation endpoint (webhook confirms, never the sync response)"
```

---

## Task 2: Refund webhook handling

**Files:**
- Modify: `cloud/api/src/modules/payments/payments.service.ts`
- Test: `cloud/api/test/payments-refund-webhook.e2e.spec.ts`

**Interfaces:**
- Consumes: Task 1's `Refund` rows (`providerRefundId`, `paymentId`, `amount`, `status`).
- Produces: nothing new consumed elsewhere — this task closes the loop Task 1 opened.

- [ ] **Step 1: Fix the shared payload-extraction to be refund-aware**

The existing `providerEventKey` derivation (`payments.service.ts`, inside `processRazorpayWebhook`, currently reads `payload.data?.payment?.cf_payment_id` and `payload.data?.order?.order_id`) doesn't know about `REFUND_STATUS_WEBHOOK`'s payload shape, which nests everything under `payload.data.refund` instead of `payload.data.payment`/`payload.data.order`. Without this fix, every refund webhook would fall through to `randomUUID()` for its dedup key, breaking idempotency entirely (a resent refund webhook would be treated as a brand-new event every time).

Find this block (currently around line 189-193):

```typescript
    const payload = parsed as Record<string, any>;
    const eventType: string = payload.type;
    const cfPaymentId: string | undefined = payload.data?.payment?.cf_payment_id;
    const providerOrderId: string | undefined = payload.data?.order?.order_id;
    const providerEventKey = `${eventType}:${cfPaymentId ?? providerOrderId ?? randomUUID()}`;
```

Replace it with:

```typescript
    const payload = parsed as Record<string, any>;
    const eventType: string = payload.type;
    // REFUND_STATUS_WEBHOOK nests everything under data.refund instead of
    // data.payment/data.order — both order_id and a payment-identifying id
    // are still present there, verified against Razorpay's real refund
    // webhook payload docs, so the same PaymentTransaction lookup below
    // (by providerOrderId) works unchanged for refund events too.
    const cfPaymentId: string | undefined = payload.data?.payment?.cf_payment_id ?? payload.data?.refund?.cf_payment_id;
    const providerOrderId: string | undefined = payload.data?.order?.order_id ?? payload.data?.refund?.order_id;
    const cfRefundId: string | undefined = payload.data?.refund?.cf_refund_id;
    // cf_refund_id is the most specific identifier available for a refund
    // event — falling back to cfPaymentId/providerOrderId would collide
    // dedup keys across multiple refunds on the same payment.
    const providerEventKey = `${eventType}:${cfRefundId ?? cfPaymentId ?? providerOrderId ?? randomUUID()}`;
```

- [ ] **Step 2: Branch to the refund handler before the payment-specific logic**

Find this block (currently around line 241-247, right after the `payment` lookup and `webhookEvent.restaurantId` backfill):

```typescript
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id: webhookEvent.id }, data: { restaurantId: payment.restaurantId } }));

    const RELEVANT_TYPES = ['PAYMENT_SUCCESS_WEBHOOK', 'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'];
    if (!RELEVANT_TYPES.includes(eventType)) {
      await this.markWebhookProcessed(webhookEvent.id);
      return;
    }
```

Replace it with:

```typescript
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id: webhookEvent.id }, data: { restaurantId: payment.restaurantId } }));

    if (eventType === 'REFUND_STATUS_WEBHOOK') {
      await this.handleRefundWebhook(payment, payload, webhookEvent.id);
      return;
    }

    const RELEVANT_TYPES = ['PAYMENT_SUCCESS_WEBHOOK', 'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'];
    if (!RELEVANT_TYPES.includes(eventType)) {
      await this.markWebhookProcessed(webhookEvent.id);
      return;
    }
```

(The payment lookup itself, and everything from `if (!providerOrderId)` through this point, is unchanged — this task only adds the branch.)

- [ ] **Step 3: Add `handleRefundWebhook`**

Add this private method to `PaymentsService`, right after `processRazorpayWebhook` ends (before `markWebhookProcessed`):

```typescript
  private async handleRefundWebhook(
    payment: { id: string; orderId: string; restaurantId: string; amount: number },
    payload: Record<string, any>,
    webhookEventId: string
  ): Promise<void> {
    const refundData = payload.data?.refund;
    const cfRefundId: string | undefined = refundData?.cf_refund_id;
    const refundStatus: string | undefined = refundData?.refund_status;
    const refundAmountRupees = refundData?.refund_amount;
    const receivedRefundAmountPaise = typeof refundAmountRupees === 'number' ? Math.round(refundAmountRupees * 100) : null;

    if (!cfRefundId || receivedRefundAmountPaise === null) {
      await this.markWebhookFailed(webhookEventId, 'Missing refund id or amount in REFUND_STATUS_WEBHOOK payload');
      return;
    }

    const refund = await this.prisma.runAsPlatform((tx) => tx.refund.findFirst({ where: { paymentId: payment.id, providerRefundId: cfRefundId } }));
    if (!refund) {
      await this.markWebhookFailed(webhookEventId, `No Refund found for cf_refund_id ${cfRefundId}`);
      return;
    }

    if (receivedRefundAmountPaise !== refund.amount) {
      await this.markWebhookFailed(webhookEventId, `Refund amount mismatch: expected ${refund.amount}, got ${receivedRefundAmountPaise}`);
      return;
    }

    if (refund.status === 'SUCCESS' || refund.status === 'FAILED') {
      // Already terminal — a resent webhook for an already-processed refund.
      await this.markWebhookProcessed(webhookEventId);
      return;
    }

    const newRefundStatus = refundStatus === 'SUCCESS' ? 'SUCCESS' : refundStatus === 'FAILED' || refundStatus === 'CANCELLED' ? 'FAILED' : null;
    if (!newRefundStatus) {
      // Still processing at Razorpay's end — nothing final to record yet.
      await this.markWebhookProcessed(webhookEventId);
      return;
    }

    await this.prisma.runAsTenant(payment.restaurantId, async (tx) => {
      await tx.refund.update({ where: { id: refund.id }, data: { status: newRefundStatus, processedAt: new Date() } });

      if (newRefundStatus === 'SUCCESS') {
        const totalRefunded = await tx.refund.aggregate({
          where: { paymentId: payment.id, status: 'SUCCESS' },
          _sum: { amount: true }
        });
        const refundedSoFar = totalRefunded._sum.amount ?? 0;
        const isFullyRefunded = refundedSoFar >= payment.amount;
        const finalStatus = isFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

        await tx.paymentTransaction.update({ where: { id: payment.id }, data: { status: finalStatus } });
        await tx.order.update({ where: { id: payment.orderId }, data: { status: finalStatus } });
      }
      // FAILED: leave PaymentTransaction/Order status untouched — the money never left.
    });

    await this.markWebhookProcessed(webhookEventId);
  }
```

- [ ] **Step 4: Write the webhook tests**

Create `cloud/api/test/payments-refund-webhook.e2e.spec.ts`, following `test/payments-webhook.e2e.spec.ts`'s exact `signedRequest`/HMAC-signing pattern:

```typescript
import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const WEBHOOK_SECRET = 'test-refund-webhook-secret';

describe('Refund webhook processing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-refund-webhook-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let restaurantId: string;
  let orderId: string;
  let paymentId: string;
  const providerOrderId = `pay_${Date.now()}`;
  const cfRefundId = `cf_refund_${Date.now()}`;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const signedRequest = (payload: object) => {
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(timestamp + rawBody).digest('base64');
    return request(app.getHttpServer())
      .post('/api/v1/payments/razorpay/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .send(payload);
  };

  const refundPayload = (refundAmountRupees: number, status: string, refundId = cfRefundId, orderId = providerOrderId) => ({
    type: 'REFUND_STATUS_WEBHOOK',
    event_time: new Date().toISOString(),
    data: {
      refund: { cf_refund_id: refundId, order_id: orderId, refund_amount: refundAmountRupees, refund_status: status }
    }
  });

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    const platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Refund Webhook Restaurant ${Date.now()}`, ownerName: 'Refund Webhook Owner', ownerEmail: `refund-webhook-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: 'refund-webhook-test-order', items: [], subtotal: 10000, taxAmount: 0, totalAmount: 10000, status: 'PAID' } })
    );
    orderId = order.id;
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId, restaurantId, providerOrderId, amount: 10000, currency: 'INR', status: 'SUCCESS' } })
    );
    paymentId = payment.id;
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.refund.create({ data: { paymentId, restaurantId, amount: 10000, status: 'PENDING', providerRefundId: cfRefundId } })
    );
  });

  afterAll(async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a SUCCESS refund webhook marks the Refund, PaymentTransaction, and Order REFUNDED (full amount)', async () => {
    const res = await signedRequest(refundPayload(100, 'SUCCESS'));
    expect(res.status).toBe(200);

    const refund = await prisma.runAsPlatform((tx) => tx.refund.findFirstOrThrow({ where: { providerRefundId: cfRefundId } }));
    expect(refund.status).toBe('SUCCESS');

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUNDED');

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderId } }));
    expect(order.status).toBe('REFUNDED');
  });

  it('a resent SUCCESS webhook for the same refund is idempotent (no error, no duplicate effect)', async () => {
    const res = await signedRequest(refundPayload(100, 'SUCCESS'));
    expect(res.status).toBe(200);

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUNDED');
  });

  it('a webhook amount mismatch is recorded as a FAILED WebhookEvent, not applied', async () => {
    const mismatchOrder = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-mismatch-${Date.now()}`, items: [], subtotal: 5000, taxAmount: 0, totalAmount: 5000, status: 'PAID' } })
    );
    const mismatchPayment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: mismatchOrder.id, restaurantId, providerOrderId: `pay_mismatch_${Date.now()}`, amount: 5000, currency: 'INR', status: 'SUCCESS' } })
    );
    const mismatchRefundId = `cf_refund_mismatch_${Date.now()}`;
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.refund.create({ data: { paymentId: mismatchPayment.id, restaurantId, amount: 5000, status: 'PENDING', providerRefundId: mismatchRefundId } })
    );

    // 999 rupees (99900 paise) sent where the Refund row's own amount is 5000 paise.
    const res = await signedRequest(refundPayload(999, 'SUCCESS', mismatchRefundId, mismatchPayment.providerOrderId));
    expect(res.status).toBe(200);

    const refund = await prisma.runAsPlatform((tx) => tx.refund.findFirstOrThrow({ where: { providerRefundId: mismatchRefundId } }));
    expect(refund.status).toBe('PENDING'); // untouched — the mismatch was rejected before any update
  });
});
```

Remove the stray `await createTestPlatformUser;` line from Step 4's `beforeAll` before running — it was left in from drafting and does nothing useful; `createTestPlatformUser` is already called correctly earlier in the same block.

- [ ] **Step 5: Run the tests, verify, commit**

```bash
cd cloud/api
npx vitest run test/payments-refund-webhook.e2e.spec.ts
npx tsc --noEmit -p tsconfig.json
npm test
```

Expected: all 3 new tests pass, `tsc` clean, full suite green (confirm the existing `payments-webhook.e2e.spec.ts` payment-webhook tests still pass unchanged — this task's Step 1 change to the shared extraction logic must not alter `cfPaymentId`/`providerOrderId` derivation for `PAYMENT_SUCCESS_WEBHOOK`/etc., since those still hit `payload.data.payment`/`payload.data.order` first via the `??` fallback chain).

```bash
git add cloud/api/src/modules/payments/payments.service.ts cloud/api/test/payments-refund-webhook.e2e.spec.ts
git commit -m "feat(payments): confirm refunds via REFUND_STATUS_WEBHOOK, not the sync response"
```

---

## Task 3: POS device activation

**Files:**
- Create: `apps/restaurant-system/pos/src/cloud/cloudClient.ts`
- Create: `apps/restaurant-system/pos/src/vite-env.d.ts`
- Modify: `apps/restaurant-system/pos/src/App.tsx`

**Interfaces:**
- Produces: `isPosDeviceConnected(): boolean`, `getPosDeviceToken(): string | null`, `getPosRestaurantId(): string | null`, `activatePosDevice(code: string): Promise<void>`, `deviceFetch(path, init?): Promise<Response>`, `createRefund(paymentId: string, amountPaise: number, reason: string): Promise<{ refundId: string; providerRefundId: string; status: string; amount: number }>` — all consumed by Task 4.

- [ ] **Step 1: Write POS's cloudClient.ts**

Mirrors kiosk-user's Phase 3 `cloudClient.ts` exactly (same single-call activation pattern — a POS till has no natural login layer of its own to attach a second step to, matching the same reasoning already established for kiosk-user):

```typescript
// apps/restaurant-system/pos/src/cloud/cloudClient.ts

/**
 * POS's only connection to cloud/api. Single-call activation, same pattern
 * as kiosk-user's Phase 3 cloudClient.ts: the activation-key redeem
 * response's own deviceToken is used directly, no second login step.
 */

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

const RESTAURANT_ID_KEY = 'jamanvaar_pos_restaurant_id';
const DEVICE_ID_KEY = 'jamanvaar_pos_device_id';
const DEVICE_TOKEN_KEY = 'jamanvaar_pos_device_token';

export class CloudApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? res.json() : undefined;
}

export function isPosDeviceConnected(): boolean {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function getPosDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getPosRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}

export async function activatePosDevice(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'POS', appVersion: '1.0.0' })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  try {
    localStorage.setItem(RESTAURANT_ID_KEY, data.restaurantId);
    localStorage.setItem(DEVICE_ID_KEY, data.device.id);
    localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
  } catch {
    // Storage unavailable — activation succeeded server-side, this terminal
    // just won't remember it across reloads.
  }
}

export function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getPosDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

export async function createRefund(paymentId: string, amountPaise: number, reason: string): Promise<{ refundId: string; providerRefundId: string; status: string; amount: number }> {
  const res = await deviceFetch(`/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amountPaise, reason })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Refund failed (${res.status})`, res.status);
  }
  return data;
}
```

- [ ] **Step 2: Add vite-env.d.ts**

```typescript
// apps/restaurant-system/pos/src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

First check `apps/restaurant-system/pos/src/vite-env.d.ts` doesn't already exist (`ls apps/restaurant-system/pos/src/vite-env.d.ts`) — if it does, read it first and only add the missing pieces rather than overwriting.

- [ ] **Step 3: Add the activation gate to App.tsx**

In `apps/restaurant-system/pos/src/App.tsx`, add the import at the top (alongside the existing imports, e.g. right after the `usePosStore` import):

```typescript
import { activatePosDevice, isPosDeviceConnected, CloudApiError } from './cloud/cloudClient';
```

Add new state inside the `App: React.FC` component body, before the existing `useEffect` calls:

```typescript
const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isPosDeviceConnected());
const [activationCode, setActivationCode] = useState('');
const [activationError, setActivationError] = useState('');
const [isActivating, setIsActivating] = useState(false);

const handleActivate = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsActivating(true);
  setActivationError('');
  try {
    await activatePosDevice(activationCode);
    setIsDeviceActivated(true);
  } catch (err) {
    setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed');
  } finally {
    setIsActivating(false);
  }
};
```

Add the gate as the very first early-return, before the existing `if (authStatus === 'AUTH_LOADING')` check (device identity comes before staff login):

```tsx
if (!isDeviceActivated) {
  return (
    <JAMANVAARStartup appName="POS Terminal" appType="POS" subtitle="Restaurant Operations Platform">
      <div className="min-h-screen flex items-center justify-center p-6">
        <form onSubmit={handleActivate} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg space-y-4 text-center">
          <h1 className="text-2xl font-black text-[#0B253A]">Activate This Terminal</h1>
          <p className="text-sm text-[#4A5568]">Enter the activation code provided by JAMANVAAR to connect this POS terminal to your restaurant.</p>
          <input
            type="text"
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
            placeholder="Activation code"
            className="w-full text-center text-lg font-mono bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-4 py-3"
            autoFocus
          />
          {activationError && <p className="text-sm font-bold text-rose-700">{activationError}</p>}
          <button
            type="submit"
            disabled={isActivating || !activationCode.trim()}
            className="w-full py-3 rounded-2xl bg-[#E66817] text-white font-black uppercase tracking-wider disabled:opacity-60"
          >
            {isActivating ? 'Activating…' : 'Activate'}
          </button>
        </form>
      </div>
    </JAMANVAARStartup>
  );
}
```

(`JAMANVAARStartup` is already imported in this file, confirmed via its existing use in the `AUTH_LOADING`/login branches right below this new one.)

- [ ] **Step 4: Verify and commit**

```bash
cd apps/restaurant-system/pos
npx tsc --noEmit -p tsconfig.json
```

Expected: clean. Manually verify the activation gate blocks the app until a valid code is entered (matching kiosk-user's Phase 3 verification approach), and that clearing `localStorage` shows the gate again.

```bash
git add apps/restaurant-system/pos/src/cloud/cloudClient.ts apps/restaurant-system/pos/src/vite-env.d.ts apps/restaurant-system/pos/src/App.tsx
git commit -m "feat(pos): add real device activation (deviceType: POS)"
```

---

## Task 4: Wire POS's refund UI to the real endpoint

**Files:**
- Modify: `apps/restaurant-system/pos/src/components/bills/PosBillsView.tsx`

**Interfaces:**
- Consumes: Task 3's `createRefund(paymentId, amountPaise, reason)`.

- [ ] **Step 1: Import the new function**

In `apps/restaurant-system/pos/src/components/bills/PosBillsView.tsx`, add to the top imports:

```typescript
import { createRefund, CloudApiError } from '../../cloud/cloudClient';
```

- [ ] **Step 2: Make `handleConfirmRefund` reach the cloud for real Razorpay payments**

Find the existing `handleConfirmRefund` (confirmed at `PosBillsView.tsx:297-318`):

```typescript
const handleConfirmRefund = (e: React.FormEvent) => {
  e.preventDefault();
  if (!refundModalBill) return;

  const amt = Number(refundAmountInput) || refundModalBill.totalAmount;
  requestManagerOverride(
    'REFUND',
    `Process Refund on Invoice #${refundModalBill.orderNumber}`,
    `Refunding ₹${amt} on settled bill #${refundModalBill.orderNumber}`,
    (mgr) => {
      OrderRepository.refundOrder(refundModalBill.id, amt, refundReasonInput, mgr);
      AuditRepository.log({
        action: 'REFUND_INVOICE',
        category: 'PAYMENT',
        details: `Refunded ₹${amt} on #${refundModalBill.orderNumber}. Reason: ${refundReasonInput}`,
        username: mgr
      });
      setRefundModalBill(null);
      showToast(`✓ Refund of ₹${amt} processed for Invoice #${refundModalBill.orderNumber}`);
    }
  );
};
```

Replace it with:

```typescript
const handleConfirmRefund = (e: React.FormEvent) => {
  e.preventDefault();
  if (!refundModalBill) return;

  const amt = Number(refundAmountInput) || refundModalBill.totalAmount;
  const bill = refundModalBill;

  requestManagerOverride(
    'REFUND',
    `Process Refund on Invoice #${bill.orderNumber}`,
    `Refunding ₹${amt} on settled bill #${bill.orderNumber}`,
    async (mgr) => {
      // Only a real Razorpay UPI payment has a paymentTransactionId that
      // matches a cloud PaymentTransaction — a locally-generated cash
      // receipt id never does, so cash/card orders fall straight through
      // to the existing local-only refund, unchanged.
      if (bill.paymentMethod === 'UPI' && bill.paymentTransactionId) {
        try {
          await createRefund(bill.paymentTransactionId, Math.round(amt * 100), refundReasonInput);
        } catch (err) {
          const message = err instanceof CloudApiError ? err.message : 'Refund request failed';
          showToast(`✗ Refund failed for Invoice #${bill.orderNumber}: ${message}`);
          return; // never flip local status on a failed cloud refund
        }
      }

      OrderRepository.refundOrder(bill.id, amt, refundReasonInput, mgr);
      AuditRepository.log({
        action: 'REFUND_INVOICE',
        category: 'PAYMENT',
        details: `Refunded ₹${amt} on #${bill.orderNumber}. Reason: ${refundReasonInput}`,
        username: mgr
      });
      setRefundModalBill(null);
      showToast(`✓ Refund of ₹${amt} processed for Invoice #${bill.orderNumber}`);
    }
  );
};
```

(`requestManagerOverride`'s `onApprove` parameter type is `(managerName: string) => void` — an async function is structurally assignable to this, since callers that don't await a `void`-typed callback simply ignore the returned promise. This is the same pattern already used elsewhere in this codebase for fire-and-forget approved actions.)

- [ ] **Step 3: Verify and commit**

```bash
cd apps/restaurant-system/pos
npx tsc --noEmit -p tsconfig.json
```

Expected: clean. Manually verify: a cash-settled bill's refund flow is unchanged (no network call, same as before); a UPI-settled bill's refund flow calls the new endpoint and only proceeds to the local status flip on success.

```bash
git add apps/restaurant-system/pos/src/components/bills/PosBillsView.tsx
git commit -m "feat(pos): wire refund UI to the real Razorpay-backed endpoint for UPI orders"
```

---

## Task 5: Wire POS Admin's refund UI to the real endpoint

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`
- Modify: `apps/restaurant-system/pos-admin/src/components/OrderDetailModal.tsx`

**Interfaces:**
- Consumes: Task 1's `POST /api/v1/payments/:paymentId/refund` directly (POS Admin already has its own device token from its existing activation flow — no dependency on Task 3).

- [ ] **Step 1: Add `createRefund` to POS Admin's existing cloudClient.ts**

POS Admin's `request<T>()` helper (`apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts:146-176`) authenticates with the tenant-auth login `accessToken`, not the raw device token — but the new refund endpoint is `DeviceAuthGuard`-protected, so this call needs the device token specifically. POS Admin already has `getStoredDeviceToken()` (confirmed exported, `cloudClient.ts:70-76`) for exactly this. Add a small dedicated function rather than routing through `request<T>()`:

```typescript
export async function createRefund(paymentId: string, amountPaise: number, reason: string): Promise<{ refundId: string; providerRefundId: string; status: string; amount: number }> {
  const token = getStoredDeviceToken();
  if (!token) throw new CloudApiError('Device not activated', 401);

  const res = await fetch(`${API_BASE}/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amountPaise, reason })
  });
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Refund failed (${res.status})`, res.status);
  }
  return data;
}
```

Add this at the end of `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`. Confirm `API_BASE` and `CloudApiError` are already defined earlier in this file (both confirmed present, `cloudClient.ts:14,21-28`) — no new imports needed.

- [ ] **Step 2: Wire `handleRefund`**

In `apps/restaurant-system/pos-admin/src/components/OrderDetailModal.tsx`, add to the top imports:

```typescript
import { createRefund, CloudApiError } from '../cloud/cloudClient';
```

Find the existing `handleRefund` (confirmed at `OrderDetailModal.tsx:59-72`):

```typescript
const handleRefund = (e: React.FormEvent) => {
  e.preventDefault();
  setRefundError('');
  const amt = parseFloat(refundAmount) || order.totalAmount;
  if (!amt || !refundReason) {
    setRefundError('A valid amount and reason are required to process this refund.');
    return;
  }
  OrderRepository.refundOrder(order.id, amt, refundReason, 'Manager');
  setIsRefunding(false);
  setRefundAmount('');
  setRefundReason('');
  onOrderUpdated();
};
```

Replace it with:

```typescript
const handleRefund = async (e: React.FormEvent) => {
  e.preventDefault();
  setRefundError('');
  const amt = parseFloat(refundAmount) || order.totalAmount;
  if (!amt || !refundReason) {
    setRefundError('A valid amount and reason are required to process this refund.');
    return;
  }

  if (order.paymentMethod === 'UPI' && order.paymentTransactionId) {
    try {
      await createRefund(order.paymentTransactionId, Math.round(amt * 100), refundReason);
    } catch (err) {
      setRefundError(err instanceof CloudApiError ? err.message : 'Refund request failed');
      return; // never flip local status on a failed cloud refund
    }
  }

  OrderRepository.refundOrder(order.id, amt, refundReason, 'Manager');
  setIsRefunding(false);
  setRefundAmount('');
  setRefundReason('');
  onOrderUpdated();
};
```

Note the JSX further down in this file that calls `handleRefund` (a form `onSubmit`) does not need to change — React allows an async event handler in `onSubmit` the same as a sync one.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/restaurant-system/pos-admin
npx tsc --noEmit -p tsconfig.json
```

Expected: clean.

```bash
git add apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts apps/restaurant-system/pos-admin/src/components/OrderDetailModal.tsx
git commit -m "feat(pos-admin): wire refund UI to the real Razorpay-backed endpoint for UPI orders"
```

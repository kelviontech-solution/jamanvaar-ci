# Cashfree Payment Gateway — Phase 4a: Real Refunds

Status: Approved for planning
Date: 2026-09-11
Scope: First of four Phase 4 sub-projects (refunds, Super Admin revenue visibility, real receipts/e-bills, POS live payment-status check — decided during a post-Phase-3 workflow/security audit). Covers: POS device activation, a real Cashfree-integrated refund endpoint, refund webhook handling, and wiring both POS's and POS Admin's existing local-only refund UI to it.

## Context

`CashfreeGatewayService.createRefund()` (`cloud/api/src/modules/payments/cashfree-gateway.service.ts:132-147`) is a real, correct implementation of Cashfree's refund API — verified against current docs during this sub-project's brainstorming — but nothing calls it. The `Refund` Prisma model already exists (`cloud/api/prisma/schema.prisma:1068-1084`), explicitly commented `"Schema only in Phase 1 — no refund endpoint yet"`. `PaymentTransactionStatus` already includes `REFUND_PENDING`/`PARTIALLY_REFUNDED`/`REFUNDED` (`schema.prisma:915-926`) — this was deliberately deferred, not forgotten.

Meanwhile, `OrderRepository.refundOrder()` (`packages/database/src/repositories.ts:792-820`) is real and wired into two UIs — `apps/restaurant-system/pos/src/components/bills/PosBillsView.tsx` (behind a manager-PIN override, `requestManagerOverride('REFUND', ...)`) and `apps/restaurant-system/pos-admin/src/components/OrderDetailModal.tsx` — but only flips the **local** order's `paymentStatus`/`orderStatus` to `'REFUNDED'`. For an order paid via real Cashfree UPI (`paymentMethod: 'UPI'`, `paymentTransactionId` set to the cloud's real `PaymentTransaction.id` by `OrderRepository.settleOrder()`), clicking "Refund" today marks it refunded and prints that on a receipt — the customer's money never moves. This was the single most consequential gap found in the audit.

`POS` (`apps/restaurant-system/pos`) has no cloud credentials at all today — it's the one restaurant-facing app in this codebase that never calls `cloud/api`. `POS Admin` (`apps/restaurant-system/pos-admin`) already does (`cloudClient.ts`, `deviceType: 'POS_ADMIN'`) — its own refund flow (`OrderDetailModal.tsx:59-72`) can be wired to the new endpoint directly, no new credentialing needed.

Cashfree's refund webhook, verified directly against current docs: event type `REFUND_STATUS_WEBHOOK`, payload `data.refund.{cf_refund_id, refund_id, order_id, refund_status, refund_amount, ...}` — delivered to the same webhook URL, same signature scheme, as payment webhooks (confirmed by inspecting `cashfree-webhook.controller.ts`'s existing single-endpoint-for-all-event-types design, which verifies the signature over the raw body before ever branching on `payload.type`).

## Goals

- POS gets a real device identity: a first-run activation gate (`deviceType: 'POS'`, already accepted by `redeemActivationKeySchema` — no backend change needed for this part), storing a device token the same way kiosk-user's Phase 3 activation does. No login layer on top — POS's existing manager-PIN override already gates the *refund action* itself; this is about the terminal being able to reach the cloud at all.
- A restaurant staff member (with manager-PIN override, exactly as today) can refund a Cashfree-paid order, full or partial, and the customer's money actually moves via a real Cashfree refund call — not just a local status flip.
- The refund amount can never exceed what's actually left refundable on that payment (original amount minus any prior successful refunds) — enforced server-side, not just in the UI's default-prefilled input.
- A refund's true completion state is never assumed from the synchronous Cashfree API response alone — `REFUND_STATUS_WEBHOOK` is what actually confirms `SUCCESS`/`FAILED`, mirroring exactly how payment confirmation already works in this codebase.
- Cash/card-only orders (no real Cashfree transaction on them) keep today's local-only refund behavior, completely unchanged — there is nothing to call Cashfree for.
- POS Admin's existing refund UI (`OrderDetailModal.tsx`) is wired to the same new endpoint — it already has device credentials, no activation work needed there.

## Non-goals

- No Super Admin visibility into or approval of refunds — that's Sub-project B (Super Admin order/revenue visibility), not this one. Restaurant staff can self-serve a refund exactly as fast as they can today (manager PIN, no additional approval hop) — this sub-project doesn't slow that down or add oversight, just makes the existing action real.
- No refund-reason taxonomy or reporting changes — `reason` stays a free-text field, exactly as the existing local UI already collects it.
- No changes to how cash/card refunds work locally — `OrderRepository.refundOrder()`'s behavior for those orders is untouched.
- No retry/reconciliation UI for a refund that gets stuck `PENDING` at Cashfree — if that happens, it's visible in the `Refund` row's status for a future support/ops flow to deal with, not solved here.
- No serializable-transaction guard against two refund requests racing within the same short window before either's DB write commits (the kind of TOCTOU `approve()` was fixed for in Sub-project B). The `PENDING`-counts-too rule above closes the practically relevant case (a slow second click after the first request has already written its row); a true simultaneous double-submit is accepted as a narrow, low-probability risk given this action is manager-PIN-gated and infrequent — not the automated, high-frequency path `approve()` was.

## Data model changes

New enum values on the existing `OrderPaymentStatus` (cloud `Order.status` — currently has no refunded state at all, unlike the local kiosk-side model which already has `'REFUNDED'`):

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

No other schema changes — `Refund` and `PaymentTransactionStatus` already have everything needed. Applied via hand-written SQL + `psql`, per this project's standing constraint never to run `prisma migrate diff --shadow-database-url` against the real `DATABASE_URL`.

## Backend

### `POST /api/v1/payments/:paymentId/refund`

New route on the existing `PaymentOrdersController` (`cloud/api/src/modules/payments/payment-orders.controller.ts`), behind the same `DeviceAuthGuard` the controller already uses. Restricted to `device.type === 'POS' || device.type === 'POS_ADMIN'` — mirrors `createOrder`'s existing `KIOSK`/`KIOSK_ADMIN` multi-device-type pattern exactly.

Request body (new `dto/create-refund.dto.ts`, Zod, matching this module's existing DTO convention): `{ amountPaise: number (int, min 1), reason: string (min 1) }`. No client-sent "is this valid" trust — the service layer re-validates against the actual remaining refundable amount.

New method on `PaymentsService` (`cloud/api/src/modules/payments/payments.service.ts`, the same service `createOrGetPaymentOrder`/`getPaymentStatus`/`processCashfreeWebhook` already live on): `createRefund(restaurantId: string, paymentId: string, dto: CreateRefundDto)`:

1. Load the `PaymentTransaction` scoped to `{ id: paymentId, restaurantId }` inside `runAsTenant` (same tenant-isolation pattern `getPaymentStatus` already uses) — 404 if not found.
2. Reject (400) if `status` isn't `SUCCESS` or `PARTIALLY_REFUNDED` — can't refund a payment that was never confirmed paid.
3. Compute already-committed total: sum of `amount` across this payment's `Refund` rows with `status: SUCCESS` **or** `PENDING` — a `PENDING` refund still reserves its amount, so two refund requests issued close together (before the first's webhook lands) can't both be approved against the same remaining balance. Reject (400) if `dto.amountPaise` exceeds `payment.amount - alreadyCommitted`.
4. Create a `Refund` row (`status: PENDING`, `requestedBy` = the device id, `reason: dto.reason`) inside the same transaction as step 1-3's read (all reads/writes here are fast local DB ops, no network call yet — unlike `approve()`'s vendor-creation flow, there's no long external call inside this transaction).
5. Outside any transaction, call `CashfreeGatewayService.createRefund({ orderId: payment.providerOrderId, refundId: <the new Refund row's id>, amountPaise: dto.amountPaise, note: dto.reason })`.
6. On success, update the `Refund` row with `providerRefundId: result.cfRefundId` and whatever `result.refundStatus` Cashfree reported (map to `RefundStatus` — Cashfree's `SUCCESS`/`PENDING`/`FAILED` maps directly). Set `PaymentTransaction.status` to `REFUND_PENDING` if not yet terminal, and set `Order.status` to `PARTIALLY_REFUNDED` if `dto.amountPaise < payment.amount`, else leave it for the webhook to finalize.
7. On failure (Cashfree API error), mark the `Refund` row `FAILED` — that status is the durable record, no new field needed for the error message — and propagate the error to the caller as a 503 (matching this module's existing `ServiceUnavailableException` convention). The manager sees the refund didn't go through and can retry.

### Refund webhook handling

Extend `PaymentsService.processCashfreeWebhook`'s `RELEVANT_TYPES` (`payments.service.ts:243`) to include `'REFUND_STATUS_WEBHOOK'`. New branch (parallel to the existing payment-success/failure branch, same signature-verification/idempotency/raw-body machinery already in place — no changes to any of that shared path):

- Extract `cf_refund_id`/`refund_id`/`refund_status`/`refund_amount` from `payload.data.refund`.
- Look up the `Refund` row by `providerRefundId` (the `cf_refund_id` this refund's own creation step already stored) — mark the webhook event `FAILED` (same durable-record-for-support pattern the payment webhook branch already uses) if no matching row exists, rather than throwing.
- Cross-check `refund_amount` against the `Refund` row's own `amount` (paise) before trusting the webhook, same principle as the existing payment-webhook amount check.
- Update `Refund.status`/`processedAt`. If `refund_status === 'SUCCESS'`: recompute the payment's total refunded amount; if it now equals the original `PaymentTransaction.amount`, set `PaymentTransaction.status = REFUNDED` and `Order.status = REFUNDED`; otherwise `PARTIALLY_REFUNDED` on both. If `refund_status === 'FAILED'`: set `Refund.status = FAILED`, leave `PaymentTransaction.status` as `SUCCESS` (the money never left, nothing to revert).

## Frontend

### POS device activation

New `apps/restaurant-system/pos/src/cloud/cloudClient.ts`, following the exact same shape as kiosk-user's Phase 3 `cloudClient.ts` (`isPosDeviceConnected()`, `getPosDeviceToken()`, `getPosRestaurantId()`, `activatePosDevice(code)`, `deviceFetch()`) — consuming the activation-redeem response's own `deviceToken` directly (`deviceType: 'POS'`), no second login step, matching the precedent this project already established (and explicitly ruled out the more roundabout POS-Admin-style two-step pattern for exactly this reason) for a terminal with no natural login layer to attach to.

First-run activation gate in `apps/restaurant-system/pos`'s top-level app component, matching kiosk-user's gate pattern.

New `createRefund(paymentId, amountPaise, reason)` function in the new `cloudClient.ts`, calling `POST /api/v1/payments/:paymentId/refund`.

### Wiring the existing refund UI

`PosBillsView.tsx`'s `handleConfirmRefund` (currently calls `OrderRepository.refundOrder(...)` unconditionally inside the manager-PIN-approved callback): if `refundModalBill.paymentMethod === 'UPI' && refundModalBill.paymentTransactionId` (the real Cashfree `PaymentTransaction.id`, set by `settleOrder()` when a kiosk order was UPI-paid — a locally-generated cash receipt id never matches this condition, so cash/card orders are naturally unaffected), call `createRefund(refundModalBill.paymentTransactionId, amountPaise, refundReasonInput)` first; on success, proceed with the existing local `OrderRepository.refundOrder(...)` call for immediate UI feedback (receipt reprint, timeline entry) — on failure, show the error and do **not** flip local status, so the UI never claims a refund happened when it didn't.

`pos-admin/src/components/OrderDetailModal.tsx`'s `handleRefund`: identical conditional wiring, reusing `pos-admin`'s own already-existing `cloudClient.ts` (add `createRefund` there too, same shape) — no device-activation work needed for this app.

## Testing

Backend e2e tests (new `cloud/api/test/payments-refund.e2e.spec.ts`, following the established `createTestApp`/mocked-`CashfreeGatewayService` pattern already used by `payments-orders.e2e.spec.ts`/`payment-connections.e2e.spec.ts`): full refund success path (mocked `createRefund` + webhook delivery → `Refund`/`PaymentTransaction`/`Order` all reach `REFUNDED`), partial refund (amount less than original, status lands on `PARTIALLY_REFUNDED`), over-refund rejection (requesting more than remains refundable → 400), refund on a non-`SUCCESS` payment rejected, device-type gate (`KIOSK` device token rejected on this route, `POS`/`POS_ADMIN` accepted), tenant isolation (one restaurant's device can't refund another restaurant's payment), webhook signature/idempotency reusing the exact same test patterns `payments-webhook.e2e.spec.ts` already established.

Frontend: no test runner in `pos`/`pos-admin` (matching this project's established finding for every kiosk/POS-family app) — manual verification, honestly disclosed if the execution environment can't run a live Tauri/browser session (consistent with every prior phase this session).

## Open items explicitly out of scope

- Super Admin refund visibility/approval (Sub-project B).
- Refund retry/reconciliation tooling for a stuck-`PENDING` Cashfree refund (Non-goals).
- Any change to how cash/card local-only refunds behave (Non-goals).

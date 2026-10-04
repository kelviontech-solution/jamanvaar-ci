# Razorpay Payment Gateway — Phase 3: Kiosk-User Device Activation & Checkout

Status: Approved for planning
Date: 2026-09-10
Scope: Phase 3 of the Razorpay integration (see Phase 1's spec for the four-phase breakdown: Phase 1 backend foundation, Phase 2 connection onboarding — both shipped). Covers: kiosk-user's device activation, real UPI payment via Razorpay at checkout, and the small Kiosk Admin addition (menu sync) that Phase 3's payment flow depends on. Phase 4 (POS handoff, receipts, refunds) remains out of scope.

## Context

`apps/kiosk-system/kiosk-user` is a mature, single-file (~3,300 line) customer-facing ordering app with a real menu/cart/checkout flow, but three things about it predate this project's Razorpay work entirely:

- **No device identity.** `kioskId: 'KIOSK-01'` and a restaurant address are hardcoded literals throughout the file. There is no `cloudClient.ts`, no activation flow, no restaurant lookup — every install of this app is assumed to be the same single demo kiosk.
- **Orders are local-only.** Checkout calls `OrderRepository.createOrder(...)` against the shared local database (`packages/database`, the same store POS/Captain/KDS read from for real-time sync) — never a cloud API.
- **Payment is entirely mocked**, and worse, unconditionally fabricated: `handleFinalizePayment` always passes `paymentStatus: 'SUCCESS'` the instant the (fake) UPI QR / card-terminal / cash flow finishes, regardless of whether anything real happened. This is exactly the pattern the original project brief forbade — it has simply never been touched by this project's payment work until now.

None of this needed the backend anything else built: **Phase 1 already built the entire payment pipeline this phase needs.** `PaymentOrdersController` (`cloud/api/src/modules/payments/payment-orders.controller.ts`) already sits behind `DeviceAuthGuard` and already checks `device.type === 'KIOSK'` explicitly — Phase 1 was written anticipating this exact consumer, it just never got one. `MenuSyncController` likewise already exists, gated on `device.type === 'KIOSK_ADMIN'`, and Kiosk Admin already has a working device-activation flow (`redeemActivationCode`/`DEVICE_TOKEN_KEY` in its `cloudClient.ts`) — it simply never calls the sync endpoint. The generic activation-key system (`cloud/api/src/modules/activation-keys/`) already recognizes `'KIOSK'` as an `allowedDeviceType`/`deviceType`, identically to how POS Admin and Captain already activate themselves. And the local domain model (`packages/types/src/enums.ts`) already has everything needed to represent an unsettled order correctly: `PaymentStatus` includes `PENDING`, `PaymentMethod` includes `UPI` and `CASH_AT_COUNTER`, and `OrderRepository.settleOrder(id, method, tenderedAmount?, transactionId?)` already exists as the mechanism POS's own cashier billing screen presumably uses to settle a pending order — kiosk-user just needs to actually create orders `PENDING` and call this instead of always faking `SUCCESS` at creation time.

So Phase 3 is almost entirely **wiring existing infrastructure together**, not building new backend surface. The only backend gap is that nothing has ever populated `MenuSnapshotItem` (the table `PaymentOrdersController` prices orders against), because Kiosk Admin has never called the menu-sync endpoint it already has credentials for.

## Goals

- kiosk-user activates itself against a restaurant using an activation key (device type `KIOSK`), exactly like POS Admin/Captain do today — no new backend endpoint, no new device-auth mechanism.
- Kiosk Admin pushes its menu to `POST /api/v1/tenant/menu-sync` (existing endpoint, currently unused) so `MenuSnapshotItem` has real, current data for kiosk-user's orders to be priced against server-side.
- At checkout, when the customer chooses UPI: kiosk-user creates a **local** order in `PENDING` payment status first (so it has a stable id to reference), calls `POST /api/v1/payments/orders` with that id and the cart lines (no price — the backend computes it from `MenuSnapshotItem`, never trusting the client), and renders Razorpay's own hosted checkout (via `razorpay.js`, using the returned `payment_session_id`) for the customer to actually pay.
- kiosk-user polls `GET /api/v1/payments/:paymentId/status` until the payment reaches a terminal state. The Razorpay **webhook** (already built in Phase 1, already idempotent and signature-verified) is what actually confirms payment — polling only reflects what the webhook has already recorded, never itself.
- On confirmed `SUCCESS`: kiosk-user calls `OrderRepository.settleOrder(id, 'UPI', undefined, razorpayPaymentId)` — the same local settlement path POS already uses — and proceeds through the existing KOT/print/confirmation flow unchanged.
- If UPI isn't available (offline, or the restaurant's `RestaurantPaymentConnection.status !== 'ACTIVE'`) or the payment fails/expires: the customer is directed to pay cash at the counter. The local `PENDING` order is left exactly as-is (not silently settled) — staff verify the order's real payment status (a small new "Order Status" lookup, see below) before accepting cash and calling `settleOrder(id, 'CASH_AT_COUNTER', tenderedAmount)` themselves. This closes the double-collection gap: a UPI payment that lands moments after the kiosk's countdown expires never gets paid twice, because staff check before accepting cash rather than the kiosk blindly re-offering payment.
- The fake card-terminal payment option is removed from kiosk-user's UI. UPI and cash-at-counter are the only two payment paths after this phase.

## Non-goals

- **Full reconciliation across cash/digital.** Requiring a staff check before cash closes the immediate double-collection risk, but building an automated system that detects and flags "this order was already paid via UPI after we gave up waiting" is real POS-handoff work — explicitly Phase 4 per Phase 1's original roadmap (`POS handoff, receipt generation, refund endpoint/UI (Phase 4)`).
- **Real card-terminal payments.** A physical POS card terminal is separate, unrelated hardware-integration work; the existing fake card-terminal UI is removed, not replaced with something real, in this phase.
- **Automatic/scheduled menu sync.** Kiosk Admin pushes its menu on explicit triggers (see Backend below) — no background job, no periodic cron. If the menu changes and nothing re-syncs, kiosk-user's next order attempt for a changed/new item fails clearly (the backend's `priceCart` already throws `PriceValidationError` for an unknown `externalItemId` — Phase 1 built this), rather than silently mispricing.
- **QR table ordering's own payment integration.** This codebase has a separate QR table ordering flow (`tests/qr_table_ordering_pipeline.test.ts`) that also creates local orders; whether/how it adopts real Razorpay payment is a separate decision, not addressed here.
- **Offline payment queuing.** If the kiosk is offline, UPI is simply unavailable for that order (cash fallback) — there is no "queue the payment attempt for when connectivity returns" mechanism.

## Backend

One new consumer of existing endpoints (Kiosk Admin → menu-sync), zero new endpoints, zero schema changes.

### Kiosk Admin: menu-sync calls (new)

`apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts` gains a `syncMenuToCloud()` function calling the existing `POST /api/v1/tenant/menu-sync` with the device token Kiosk Admin already has from its own (already-working) device activation. It maps every local `MenuItem` (`packages/types/src/domain.ts`) whose `isKioskEnabled` is true to a `MenuSyncItemDto`: `externalItemId: item.id`, `name`, `basePrice` (local `price`/`basePrice` field, converted to integer paise — the local domain model stores rupees, `MenuSnapshotItem`/Phase 1's whole payments module is integer-paise throughout, matching its existing money convention), `modifierGroups` (mapped from the item's own `modifierGroups`, each option's price delta similarly converted to paise), `taxRate` (resolved from the item's `taxGroupId`, however that's currently resolved elsewhere in this codebase for receipt/tax calculation — the plan will locate and reuse that existing resolution rather than re-deriving tax logic), `isAvailable`.

Trigger points for calling this (App.tsx, `apps/kiosk-system/kiosk-admin`): on app boot once a device token exists, and on every menu save/publish action in the existing Menu Management screen. No new UI is needed beyond wiring these two call sites — this is invisible infrastructure from the Kiosk Admin user's point of view.

### Everything else already exists

- `POST /api/v1/activation/redeem` with `deviceType: 'KIOSK'` — already accepted by `redeemActivationKeySchema`. Super Admin's existing activation-key generation screen already supports issuing a `KIOSK`-typed (or `ANY`-typed) key; no Super Admin changes needed.
- `POST /api/v1/payments/orders` (`PaymentOrdersController.createOrder`) — already gates on `device.type === 'KIOSK'`, already idempotent on `externalOrderId` (a second call with the same id and a still-pending prior attempt returns/reopens the existing attempt rather than double-creating), already rejects with `ForbiddenException` when the restaurant's connection isn't `ACTIVE`, already prices via `MenuSnapshotItem` + `priceCart` (never trusting a client-sent amount).
- `GET /api/v1/payments/:paymentId/status` (`PaymentOrdersController.getStatus`) — already returns `{ paymentId, orderId, status, amount, currency, orderStatus }`.
- Razorpay webhook processing (`razorpay-webhook.controller.ts` / `PaymentsService.processRazorpayWebhook`) — already idempotent, signature-verified, amount/currency-cross-checked against the `PaymentTransaction` it's confirming; this is what actually flips `PaymentTransaction.status`/`Order.status` to `SUCCESS`/`PAID`, independent of anything the kiosk's own polling believes.

## Frontend

### kiosk-user: device activation

A new first-run screen, shown before `LANGUAGE_SELECT` whenever no stored device token exists (mirroring POS Admin's own activation gate) — asks for an activation code, calls the new `redeemActivationCode()` (a new `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts`, following `pos-admin`'s `cloudClient.ts` pattern exactly: same localStorage keys convention, same `redeemActivationCode(code)` shape), stores `restaurantId`/`deviceId`/`deviceToken`, then proceeds into the existing flow. All hardcoded `kioskId: 'KIOSK-01'` references become the stored, real kiosk/device id.

### kiosk-user: checkout flow changes

Inside the existing `CHECKOUT_PAYMENT` step (`App.tsx`, currently ~line 1872 onward):

1. Replace the current three mock payment options with two: **UPI** and **Pay at counter**. UPI is only offered when the device is online AND a client-side check of the restaurant's connection status (a lightweight addition — reusing the already-existing `GET /api/v1/tenant/payment-connection` shape from Phase 2, called with the device token instead of a tenant JWT... actually this specific endpoint is `TenantAuthGuard`-gated, not `DeviceAuthGuard` — **the plan needs to resolve exactly how kiosk-user learns the connection is `ACTIVE` before attempting payment**: either a new lightweight `DeviceAuthGuard`-gated read of connection status, or simply attempting `createOrder` and handling its `403` gracefully as the "not active" signal. Flagging this as an implementation decision for the plan, not resolved here) confirms it's `ACTIVE`.
2. On choosing UPI: `OrderRepository.createOrder({ ...cartAsOrderData, paymentStatus: 'PENDING', paymentMethod: 'UPI' })` — creating the local order immediately, unsettled, so it has a stable `id` before any network call. This replaces `handleFinalizePayment`'s current create-with-fake-SUCCESS call for this path.
3. Call `POST /api/v1/payments/orders` with `externalOrderId: localOrder.id` and cart lines derived from the same cart data already used to build the local order (item id, quantity, selected modifier option ids).
4. On success, load and render Razorpay's hosted checkout using `razorpay.js` and the returned `payment_session_id`, inside the existing payment-step UI (replacing the mock QR image). The existing 180s countdown (`paymentTimeLeft`) becomes the real timeout for this attempt.
5. Poll `GET /api/v1/payments/:paymentId/status` on an interval (exact interval is a plan detail — something in the low single-digit seconds, matching how quickly a webhook typically lands) until `SUCCESS`, `FAILED`/`USER_DROPPED`, or the countdown expires.
6. On `SUCCESS`: `OrderRepository.settleOrder(localOrder.id, 'UPI', undefined, razorpayPaymentId)`, then proceed through the existing KOT-generation/print/confirmation flow exactly as today.
7. On `FAILED`/`USER_DROPPED`/expiry/offline/connection-not-active: show "please pay at the counter" — the local order stays `PENDING`, unsettled. No further action from the kiosk itself.

### Kiosk Admin (or POS/cashier surface): counter settlement check

Wherever staff already settle a `PENDING` order at the counter (this codebase already has a cashier billing/settlement screen for POS — the plan will locate it rather than assume), that screen needs one small addition for orders that came from kiosk-user with `paymentMethod: 'UPI'` already attempted: before accepting cash, show the order's live payment status by calling something equivalent to `GET /api/v1/payments/:paymentId/status` (the plan decides which existing device credential — Kiosk Admin's, or a shared POS one — is used for this specific read) so staff can see if it actually already succeeded. This is deliberately a manual check, not automatic reconciliation (see Non-goals).

## Testing

Backend: no new backend code beyond Kiosk Admin's menu-sync caller (frontend), so no new `cloud/api` e2e suite — Phase 1's existing `payments-orders.e2e.spec.ts` and `payments-menu-sync.e2e.spec.ts` already cover `PaymentOrdersController`/`MenuSyncController` from the server side.

Frontend: kiosk-user has no existing test runner (matching what Sub-project A found for Kiosk Admin) — manual verification, honestly disclosed if browser/Tauri verification is unavailable in the execution environment (as it has been throughout this project). The repo-root `tests/qr_table_ordering_pipeline.test.ts`-style local-runtime tests are a useful pattern to follow if any pure-logic pieces (cart-to-payment-lines mapping, the create-PENDING-then-settle sequencing) can be tested against the local `OrderRepository` directly without a real Razorpay call.

## Open items explicitly out of scope

- Full cash/digital reconciliation (Non-goals) — carried to Phase 4.
- Real card-terminal payments (Non-goals).
- Automatic/background menu sync (Non-goals).
- QR table ordering's own payment integration (Non-goals).
- True per-restaurant independent Razorpay merchant accounts (blocked on Razorpay Partner approval — carried forward from Phase 1's spec, unchanged).

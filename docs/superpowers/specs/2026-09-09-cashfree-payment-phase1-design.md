# Cashfree Payment Gateway — Phase 1: Backend Foundation

Status: Approved for planning
Date: 2026-09-09
Scope: Phase 1 of 4 (see "Full project decomposition" below). This spec covers Phase 1 only.

## Context

JAMANVAAR is adding real, production-grade Cashfree payments to kiosk ordering.
The full request (Super Admin payment control, per-restaurant onboarding, kiosk
QR/card checkout, POS handoff, receipts, refunds) is too large for one spec, so
it is split into four phases, each with its own design → plan → implementation
cycle:

1. **Backend foundation** (this spec): schema, credential encryption, Cashfree
   service layer, webhook handling, payment-status API, menu-price validation.
   No end-user UI.
2. Kiosk Admin "Connect Cashfree Account" flow + Super Admin payment-gateway
   oversight dashboard.
3. Kiosk-user checkout UI (QR/card screens, all payment states) + kiosk-user
   device activation (it has none today).
4. POS handoff, receipt integration, refunds UI/flow.

### Findings from codebase research that shape this design

- **NestJS + Prisma + Postgres**, Zod DTOs, thin controllers, RLS-based
  multi-tenancy (`PrismaService.runAsTenant(restaurantId, tx => ...)` /
  `runAsPlatform`). The `application-entitlements` module/migration is the
  cleanest recent template and is mirrored throughout this spec.
- **Kiosk-user, kiosk-admin, and the POS app are offline-first.** All order/menu
  state lives in a `localStorage`-backed local store (`@jamanvaar/database`).
  There is no cloud `Order` model and no cloud→kiosk menu sync today. Only
  Kiosk Admin has any real-time cloud connection (one-time device activation
  via `tenant-auth`/`device-auth`).
- **Payment is currently 100% mocked**: `packages/api/src/payment.ts` defines
  `IPaymentGateway` (`initiate`/`verify`/`cancel`) with fake gateway
  implementations that always resolve `SUCCESS` client-side. This is the seam
  a real `CashfreePaymentGateway` replaces, but real gateway calls need a
  server-held secret, so `initiate`/`verify` move server-side.
- **No cloud copy of any restaurant's real menu/prices exists.** There is an
  orphaned `MasterMenuItem` / `RestaurantMenuSyndication` pair in Postgres, but
  nothing in any kiosk/POS app reads or writes it — it does not reflect what
  restaurants actually sell. A new, bounded sync path is needed (see below)
  rather than trying to repurpose that orphaned system.
- **Cashfree account model**: verified against current Cashfree docs that
  "each restaurant has its own independent Cashfree account" requires Cashfree
  **Partner/Platform approval** (a business relationship JAMANVAAR does not
  yet have). The product available on a standard Cashfree account is **Easy
  Split**: one JAMANVAAR-owned merchant account processes all payments;
  restaurants are registered as **Vendors** (bank/UPI + KYC details, not API
  credentials) and Cashfree auto-settles each vendor's share after payment.
  This spec builds on Easy Split, with the connection model shaped so a true
  per-restaurant merchant-account mode can be added later without a schema
  rewrite (see `connectionType` below).
- **No credential-encryption utility exists.** Only one-way hashing
  (`hashOpaqueToken`) is used elsewhere in the codebase, for tokens. A new
  reversible AES-256-GCM utility is needed for settlement bank details.
- Money is represented as integer paise throughout the existing schema
  (`Invoice.amount`, `Payment.amount`); this spec follows that convention.

## Goals (Phase 1)

- A restaurant's menu and prices become knowable to the backend, sourced from
  the kiosk itself (not invented, not trusted blindly from the checkout call).
- An internal `Order` + `Payment` can be created server-side with a
  backend-computed total, a real Cashfree order, and a returned payment
  session — with no UI yet, this is verified via automated tests and manual
  sandbox calls.
- Cashfree webhooks are received, signature-verified, and processed
  idempotently, and are the sole source of truth for marking a payment
  successful.
- Every payment-related table is tenant-isolated via the same RLS pattern as
  the rest of the schema.
- No secrets appear in frontend responses, logs, or client storage.

## Non-goals (Phase 1)

- No Kiosk Admin or Super Admin UI (Phase 2).
- No kiosk-user checkout screens or kiosk-user device activation (Phase 3).
- No POS handoff, no receipt generation, no refund *endpoint* (Refund table
  exists in the schema so later phases don't need a migration, but no refund
  API is built yet) (Phase 4).
- No true per-restaurant independent Cashfree accounts (blocked on Cashfree
  Partner approval — documented as a limitation, not implemented).

## Data model

All new tables added to `cloud/api/prisma/schema.prisma`, each carrying
`restaurantId` and the exact RLS block used by the `application-entitlements`
migration (`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`,
`tenant_isolation` policy on `current_setting('app.is_platform_context')` /
`app.current_restaurant_id`). All money fields are integer paise. Enum naming
follows the existing `RestaurantStatus`/`InvoiceStatus` style.

### `MenuSnapshotItem`

The trusted, backend-queryable copy of what a restaurant actually sells,
pushed from Kiosk Admin (which already has a live device connection) whenever
its local menu changes. This is what order totals are validated against.

- `id`, `restaurantId`
- `externalItemId` — the kiosk's own local item id (correlation key)
- `name`, `category`
- `basePrice` (paise)
- `modifierGroups` (Json) — modifier/option price deltas, shaped to match
  what `packages/business/src/modifiers.ts` (`calculateItemUnitPrice`,
  `calculateItemTotal`, `validateModifiers`) already expects, so the backend
  can reuse those exact pure functions rather than reimplementing pricing
  math. (Implementation should confirm `packages/business` is importable
  from `cloud/api` as a workspace package; if not, port the pure functions
  in, not reinvent them.)
- `taxRate`/`cgst`/`sgst` as applicable
- `isAvailable`
- `syncedAt`, `createdAt`, `updatedAt`
- `@@unique([restaurantId, externalItemId])`

### `Order`

Does not exist today; new model, cloud source of truth for a kiosk order.

- `id`, `restaurantId`, `kioskId` (device id from `DeviceAuthGuard`)
- `externalOrderId` — correlates to the kiosk's local order id; doubles as
  the idempotency key for order creation
- `items` (Json snapshot: itemId, name, qty, unitPrice, modifiers, lineTotal
  — captured at creation time, immutable after)
- `subtotal`, `taxAmount`, `discountAmount`, `totalAmount` (paise)
- `currency` (default `INR`, matching `Restaurant.currency`)
- `status`: `OrderPaymentStatus` enum — `DRAFT`, `PENDING_PAYMENT`,
  `PAYMENT_PROCESSING`, `PAID`, `SENT_TO_POS`, `PAYMENT_FAILED`, `CANCELLED`
- `createdAt`, `updatedAt`
- `@@unique([restaurantId, externalOrderId])`

### `Payment`

- `id`, `orderId` → `Order`, `restaurantId`
- `provider` (`CASHFREE`), `providerOrderId`, `providerPaymentId` (nullable
  until known)
- `amount`, `currency`
- `status`: `PaymentStatus` enum — `CREATED`, `PENDING`, `AUTHORIZED`,
  `SUCCESS`, `FAILED`, `USER_DROPPED`, `CANCELLED`, `REFUND_PENDING`,
  `PARTIALLY_REFUNDED`, `REFUNDED`
- `paymentMethod`, `paymentSessionId`
- `providerResponse` (Json — sanitized: no secrets, only what Cashfree
  returns about the transaction)
- `failureReason`, `paidAt`
- `createdAt`, `updatedAt`
- `@@unique([provider, providerOrderId])`,
  `@@unique([provider, providerPaymentId])` (partial/nullable-safe)

### `RestaurantPaymentConnection`

One per restaurant. Represents the Easy Split vendor registration, shaped so
a future `connectionType: PLATFORM_POOLED | CONNECTED_ACCOUNT` distinction
can be added later without breaking this table (Phase 1 only ever writes
`PLATFORM_POOLED`).

- `id`, `restaurantId` (`@unique`)
- `provider` (`CASHFREE`), `connectionType` (`PLATFORM_POOLED` — only value
  used in Phase 1)
- `cashfreeVendorId` (nullable until created)
- `status`: `NOT_CONNECTED`, `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`,
  `DISCONNECTED`
- Settlement details, **encrypted at rest** via the new
  `credential-encryption.util.ts`: account holder name, encrypted account
  number, IFSC, or UPI VPA
- KYC fields needed by Cashfree's Create Vendor API (business type, PAN, etc.)
- `verifiedAt`, `lastWebhookAt`, `lastPaymentAt`
- `createdAt`, `updatedAt`

Phase 1 only adds the model and the internal service methods to read/write
it (needed by the payment-creation flow to check `status === ACTIVE` before
allowing a payment). The actual onboarding UI/endpoints that populate this
table are Phase 2.

### `Refund`

Schema only in Phase 1 — no endpoint yet, so Phase 4 doesn't need a
migration.

- `id`, `paymentId` → `Payment`, `restaurantId`
- `providerRefundId`, `amount`, `reason`
- `status`: `PENDING`, `SUCCESS`, `FAILED`
- `requestedBy`, `processedAt`, `createdAt`

### `WebhookEvent`

Every inbound webhook is stored raw before any processing, for idempotency
and audit.

- `id`
- `restaurantId` (nullable — unknown until the payload is parsed and matched
  to an `Order`/`Payment`)
- `provider`, `providerEventId`, `eventType`
- `rawPayload` (Json), `signatureValid` (boolean)
- `processingStatus`: `RECEIVED`, `VERIFIED`, `PROCESSED`, `FAILED`,
  `IGNORED_DUPLICATE`
- `processedAt`, `retryCount`, `errorMessage`
- `createdAt`
- `@@unique([provider, providerEventId])`

Because webhooks arrive without a tenant JWT, `WebhookEvent` rows are written
via `runAsPlatform`; the restaurant is resolved and backfilled onto the row
once the referenced `Order` is found.

## Credential encryption

New `cloud/api/src/common/security/credential-encryption.util.ts`:
AES-256-GCM, key from a new required-when-used env var
`PAYMENT_CREDENTIAL_ENCRYPTION_KEY` (32-byte, base64). Used only for
`RestaurantPaymentConnection` settlement details (bank account number). Two
functions: `encryptCredential(plaintext) -> string` and
`decryptCredential(ciphertext) -> string`, following the same file-location
convention as the existing `token.util.ts`.

## Cashfree service layer

New module `cloud/api/src/modules/payments/`:

- `payments.module.ts` — imports `AuditModule`, exports `CashfreeGatewayService`
  and `PaymentsService` for reuse by later phases (Super Admin dashboard,
  refunds).
- `cashfree-gateway.service.ts` — thin wrapper over the Cashfree PG API:
  - `createOrder(...)`, `getOrderStatus(providerOrderId)`
  - `createVendor(...)`, `getVendorStatus(...)` (Easy Split; used by
    Phase 2's onboarding flow, but the client method belongs here)
  - `verifyWebhookSignature(rawBody, signatureHeader, timestampHeader)`
  - `createRefund(...)` (client method only; no endpoint calls it yet)
  - Env vars read via Zod validation, all **optional**:
    `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENVIRONMENT`
    (`sandbox`/`production`), `CASHFREE_API_VERSION`,
    `CASHFREE_WEBHOOK_SECRET`. Follows the `BackupStorageService` pattern:
    `isConfigured()` getter; any method call when unconfigured throws
    `ServiceUnavailableException` naming exactly which env vars are missing.
    No crash at boot.
- `payments.service.ts` — order/payment creation, price validation against
  `MenuSnapshotItem`, status lookup, webhook processing/idempotency. All
  Prisma access via `runAsTenant`/`runAsPlatform` per the existing pattern.
- `menu-sync.service.ts` (or a method on `payments.service.ts` — implementation
  detail) — upserts `MenuSnapshotItem` rows from a Kiosk Admin push.
- `dto/*.dto.ts` — Zod schemas for the request/response shapes below.

## Endpoints (Phase 1 — no UI consumer yet)

All mounted under the existing versioned prefix (`api/v1`), guards per the
existing pattern (`restaurantId` always derived from the authenticated
principal, never the body):

- `POST /tenant/menu-sync` — `DeviceAuthGuard` (Kiosk Admin's existing device
  token). Body: array of menu items/modifiers/prices. Upserts
  `MenuSnapshotItem` scoped to `device.restaurantId`.
- `POST /payments/orders` — `DeviceAuthGuard`. Body: cart (item ids, qty,
  modifiers) + `externalOrderId`. Validates every line against
  `MenuSnapshotItem` for `device.restaurantId`, computes totals server-side
  (reusing `packages/business` pricing functions), checks
  `RestaurantPaymentConnection.status === 'ACTIVE'`, creates `Order` +
  `Payment` (`CREATED`), calls Cashfree to create the order, stores
  `providerOrderId`/`paymentSessionId`, returns only
  `{ paymentId, orderId, paymentSessionId, amount, currency }` to the caller
  — never provider credentials.
- `GET /payments/:paymentId/status` — `DeviceAuthGuard` or `TenantAuthGuard`,
  ownership-checked (`payment.restaurantId === requester.restaurantId`).
  Returns `{ paymentId, orderId, status, amount, currency, orderStatus }`.
- `POST /payments/cashfree/webhook` — public (no guard; Cashfree calls this
  directly), raw body captured via a route-specific raw-body reader (needed
  for signature verification — most of the app can keep JSON body parsing,
  this route cannot). Verifies signature before touching the payload;
  invalid signatures are rejected with no processing. On success: resolves
  `Order`/`Payment` via `providerOrderId`, verifies amount + currency +
  restaurant match, applies the status transition idempotently, updates
  `RestaurantPaymentConnection.lastWebhookAt`/`lastPaymentAt`. Always
  responds 200 once the event is durably recorded (even if internal
  processing defers), per Cashfree's at-least-once delivery expectations.

## Error handling & idempotency

- **Duplicate "Pay Now" / retried order creation**: `@@unique([restaurantId,
  externalOrderId])` on `Order` — a retried create with the same
  `externalOrderId` returns the existing order/payment instead of creating a
  new one.
- **Duplicate webhook delivery**: `@@unique([provider, providerEventId])` on
  `WebhookEvent` — a repeat delivery is recorded as `IGNORED_DUPLICATE` and
  short-circuits before any `Order`/`Payment` mutation.
- **Payment status transitions are write-once for terminal states**: once a
  `Payment` reaches `SUCCESS`, no later webhook (even a legitimate one for
  the same order, e.g. a delayed retry) can move it again; the handler
  no-ops and logs.
- **Amount/currency/restaurant mismatch on webhook**: rejected, `WebhookEvent`
  marked `FAILED` with `errorMessage`, `Order`/`Payment` untouched — never
  guessed at or auto-corrected.
- **Cashfree unreachable at order-creation time**: `Order` stays
  `PENDING_PAYMENT` (never partially advanced), the create-order call returns
  a clear error to the caller, no `Payment` row is orphaned in `CREATED`
  without a `providerOrderId`.
- **`RestaurantPaymentConnection` not `ACTIVE`**: `/payments/orders` rejects
  with a clear error before any Cashfree call is attempted.
- **Unconfigured Cashfree credentials (no env vars set yet)**: every
  `CashfreeGatewayService` method throws `ServiceUnavailableException` naming
  the missing var; this is the expected state until real sandbox keys are
  added, and it must not crash the app at boot.

## Security

- Cashfree secrets only ever read from env vars server-side; never returned
  in any API response, never logged (the sanitization applied to
  `providerResponse` before persisting is also applied to log statements).
- Settlement bank details encrypted at rest (AES-256-GCM); decrypted only
  when calling Cashfree's Create Vendor API.
- Every payment table RLS-protected identically to existing tenant tables.
- `restaurantId` on every payment endpoint is derived from
  `DeviceAuthGuard`/`TenantAuthGuard`, never from the request body.
- Webhook signature verified on the raw body before the payload is parsed or
  trusted in any way.

## Testing (Phase 1)

Following the existing `*.e2e.spec.ts` convention
(`activation-redeem.e2e.spec.ts`, `backups.e2e.spec.ts`):

- Unit tests for `credential-encryption.util.ts` (round-trip, tamper
  detection).
- Unit tests for webhook signature verification (valid, invalid, malformed).
- e2e tests for order creation: price computed correctly from
  `MenuSnapshotItem` + modifiers, rejects tampered/mismatched cart amounts,
  rejects when `RestaurantPaymentConnection` isn't `ACTIVE`, rejects when
  Cashfree is unconfigured.
- e2e tests for webhook idempotency: duplicate `providerEventId` is a no-op;
  duplicate delivery of an already-`SUCCESS` payment is a no-op; amount
  mismatch is rejected; wrong-restaurant mismatch is rejected.
- e2e tests for tenant isolation: a device/tenant token for restaurant A
  cannot read restaurant B's `Order`/`Payment`/status.
- All of the above run against a mocked `CashfreeGatewayService` (no real
  sandbox keys needed for Phase 1 automated tests, matching "don't use real
  API keys during development"). Manual sandbox verification happens once
  the user adds real sandbox credentials, using curl/Postman against these
  endpoints directly (no UI exists yet to exercise them).

## Environment variables introduced

```env
CASHFREE_CLIENT_ID=
CASHFREE_CLIENT_SECRET=
CASHFREE_ENVIRONMENT=sandbox
CASHFREE_API_VERSION=2025-01-01
CASHFREE_WEBHOOK_SECRET=
PAYMENT_CREDENTIAL_ENCRYPTION_KEY=
```

All optional at boot (graceful degradation); required only when the
corresponding functionality is actually invoked.

## Open items carried to later phases (explicitly out of scope here)

- Kiosk Admin UI to submit settlement/KYC details and drive
  `RestaurantPaymentConnection` through `PENDING_VERIFICATION` → `ACTIVE`
  (Phase 2).
- Super Admin oversight dashboard, approval action for `PENDING_VERIFICATION`
  → `ACTIVE` (Phase 2).
- Kiosk-user device activation and checkout UI (Phase 3).
- POS handoff, receipt generation, refund endpoint/UI (Phase 4).
- True per-restaurant independent Cashfree merchant accounts — blocked on
  Cashfree Partner/Platform approval, a business step outside this codebase.

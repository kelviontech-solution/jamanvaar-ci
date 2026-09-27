# Cashfree Payment Gateway — Commission & Split Settlement

Status: Approved for planning
Date: 2026-09-27
Scope: First of five sub-projects closing the remaining gaps in JAMANVAAR's Cashfree integration (commission & split settlement [this spec], reconciliation, dashboards, RBAC/step-up auth, consolidated docs — see "Follow-on sub-projects" below). Builds on the already-shipped four-phase Cashfree integration (backend foundation, vendor onboarding, kiosk checkout, refunds/visibility/receipts — all previously specced under `docs/superpowers/specs/2026-09-09-cashfree-payment-phase1-design.md` and its successors).

## Context

An audit of the existing, already-hardened Cashfree integration (schema, gateway service, webhook processing, vendor onboarding, refunds, Super Admin visibility — all shipped and e2e-tested) found one concrete, verified gap: `CashfreeGatewayService.createOrder()` never sends Cashfree's `order_splits` field. Per Cashfree's current API docs (verified directly, not assumed):

> "If split details aren't provided for dynamic splits, the entire amount will get settled into your account and not to the vendor."

This means today, **no money actually routes to a restaurant's vendor account** — despite `RestaurantPaymentConnection` vendor onboarding being fully built and gating order creation on `status === 'ACTIVE'`. Every payment currently settles 100% into JAMANVAAR's own master Cashfree account. Confirmed with the user: no real (non-sandbox) traffic has occurred yet, so this is a pre-launch correctness fix, not an incident requiring manual restaurant payout recovery.

The user explicitly wants a real, live monetary split (not just a reporting-only ledger), so this spec adds the actual `order_splits` wiring plus a configurable platform commission — the two are the same piece of work, since declaring *any* vendor split requires deciding what percentage the vendor gets, and "commission" is simply the platform's declared complement of that percentage.

### Research findings (current Cashfree docs, verified during brainstorming)

- **Create Order** (`POST /pg/orders`) accepts `order_splits: [{ vendor_id, amount?, percentage?, tags? }]` — split can be declared **at order-creation time**, not only via the separate "Split After Payment" endpoint. Exactly one of `amount`/`percentage` per split entry; percentage is required (not amount) when the vendor is billed for prepaid charges — not JAMANVAAR's case, but noted as a real Cashfree constraint.
- **Refunds automatically reverse the vendor's share proportionally** to the original split ratio, whether the refund happens before or after the vendor's settlement — Cashfree's own words: "the refund will be done from your and vendor's settlement account according to the respective transaction split created." No new refund-side code is needed; the existing `createRefund`/webhook flow (Phase 4a, unchanged by this spec) already produces the correct outcome.
- Settlement timing/schedule specifics (instant vs T+1/T+2) were not found in the pages fetched during this research pass and are not required to implement this spec — Cashfree handles settlement scheduling on its own side regardless of what this spec builds.

## Goals

- Every Cashfree order created by `PaymentsService` declares a real `order_splits` entry routing the restaurant's contractual share to its own `cashfreeVendorId` — including restaurants configured at 0% commission (they still need an explicit 100%-to-vendor split; omitting the split entirely is the bug, not the fix for "no commission").
- Super Admin can configure a single platform-wide default commission percentage, and override it per restaurant.
- Every payment's actual commission split is captured as an immutable snapshot at the moment the Cashfree order is created — changing the platform default or a restaurant's override later never rewrites history.
- Every commission-rate change (platform default or per-restaurant override) is audited (actor, old value, new value).

## Non-goals

- No reconciliation job comparing JAMANVAAR's ledger against Cashfree's own settlement records (next sub-project).
- No Super Admin platform-wide payments dashboard, no Kiosk Admin/Restaurant Admin revenue dashboards (a later sub-project — these want to *show* commission data this spec produces, but building them isn't in scope here).
- No new payment RBAC roles or step-up re-authentication for changing the commission rate — it goes behind the existing `PlatformAuthGuard`, matching how every other Super-Admin-only payment action (approve/suspend/reactivate a connection) is already gated in this codebase. Revisiting this is a later sub-project's explicit concern, not silently skipped here.
- No fixed-amount commission option — platform-wide default + per-restaurant percentage override only, per the chosen commission model (a fixed amount on a variable order total needs its own rounding/partial-refund rules that aren't needed yet).
- No change to how the Cashfree webhook processes payment/refund events — the split is declared once at order creation; nothing about webhook parsing, signature verification, or idempotency changes.
- No migration/backfill of historical `PaymentTransaction` rows created before this ships — they simply have `commissionBps: null`, correctly reflecting that no split was ever declared for them (this is honest history, not something to paper over).

## Data model

Three additive changes, no destructive migration, applied via hand-written SQL + `psql` per this project's standing constraint (never run `prisma migrate diff --shadow-database-url` against the real `DATABASE_URL`):

### `PlatformSetting` (existing table, no schema change — a new row)

```
key: "PAYMENT_DEFAULT_COMMISSION_BPS"
value: { "bps": 0 }   // default 0 until Super Admin sets one — never crashes/blocks payments if unset
category: "PAYMENTS"
```

Basis points (integer, 0–10000 inclusive = 0%–100%), matching this schema's integer-paise-everywhere convention — no floats for money-adjacent figures anywhere in this codebase.

### `RestaurantPaymentConnection` (new column)

```prisma
commissionOverrideBps Int?  // null = use the platform default; 0-10000 inclusive when set
```

### `PaymentTransaction` (new columns)

```prisma
commissionBps    Int?  // resolved (override ?? default) at the moment this row's Cashfree order was created; frozen forever after
platformAmount   Int?  // paise, computed once at creation
restaurantAmount Int?  // paise, computed once at creation; platformAmount + restaurantAmount == amount
```

All three nullable: existing rows (created before this ships) simply have `null` — an honest record that no split was declared for them, not backfilled with a guessed value.

## Backend

All changes inside the existing `cloud/api/src/modules/payments/` module — this is squarely that module's existing domain, not a new one.

### `CashfreeGatewayService.createOrder` (`cashfree-gateway.service.ts`)

`CreateCashfreeOrderInput` gains:

```typescript
orderSplits?: { vendorId: string; percentage: number }[];
```

Serialized into the request body as `order_splits: [{ vendor_id, percentage }]` when present (using `percentage`, never `amount` — percentage is simpler to reason about for a restaurant-share-of-total split and avoids rounding drift against the order's own integer-paise total). Omitted entirely (not sent as an empty array) when `orderSplits` is undefined — preserves today's behavior for any code path that legitimately has no vendor yet (there shouldn't be one reachable in production, since order creation already gates on `connection.status === 'ACTIVE'`, but the gateway method itself shouldn't assume that invariant on its caller's behalf).

### `PaymentsService` (`payments.service.ts`)

New private helper `resolveCommissionBps(connection: { commissionOverrideBps: number | null }): Promise<number>`:
returns `connection.commissionOverrideBps ?? (await this.getDefaultCommissionBps())`, where `getDefaultCommissionBps()` reads the `PlatformSetting` row above via `runAsPlatform`, defaulting to `0` if the row doesn't exist yet.

`createOrGetPaymentOrder` (both the existing-order retry path at what is currently line 38-40, and the fresh-order path at line 87): resolve `commissionBps = await this.resolveCommissionBps(connection)` right after loading `connection` — the retry path currently does **not** reload `connection` before calling `createCashfreeAttempt`; this spec adds that reload, since the retry path needs the vendor id and commission rate exactly as much as the fresh-order path does.

`createCashfreeAttempt(orderId, restaurantId, amount, currency, vendorId: string, commissionBps: number)` (signature gains the last two params):

```typescript
const platformAmount = Math.round((amount * commissionBps) / 10000);
const restaurantAmount = amount - platformAmount;
const vendorPercentage = Number(((restaurantAmount / amount) * 100).toFixed(2)); // Cashfree's percentage field
```

Stores `commissionBps`, `platformAmount`, `restaurantAmount` on the `PaymentTransaction` row at the same `create` call that already exists (no extra write). Passes `orderSplits: [{ vendorId, percentage: vendorPercentage }]` into `this.cashfree.createOrder(...)` — always populated (never conditionally omitted for a 0%-commission restaurant, since 0% commission means `vendorPercentage = 100`, not "no split at all").

### Commission configuration endpoints

New methods on `PlatformPaymentsService` (`platform-payments.service.ts` — the existing read-only platform-payments module from the Super Admin visibility sub-project; commission config is platform-payments-adjacent, not its own module):

- `getCommissionConfig(): Promise<{ defaultBps: number }>` — reads the `PlatformSetting` row.
- `setDefaultCommissionBps(bps: number, actor: PlatformActor): Promise<void>` — validates `0 <= bps <= 10000` (`BadRequestException` otherwise), upserts the `PlatformSetting` row, audit-logs `COMMISSION_CHANGED` with `{ scope: 'PLATFORM_DEFAULT', oldValue, newValue }`.
- `setRestaurantCommissionOverride(restaurantId: string, bps: number | null, actor: PlatformActor): Promise<void>` — same validation (null explicitly allowed, meaning "clear the override, fall back to platform default"), updates `RestaurantPaymentConnection.commissionOverrideBps`, audit-logs `COMMISSION_CHANGED` with `{ scope: 'RESTAURANT_OVERRIDE', restaurantId, oldValue, newValue }`.

New routes on `PlatformPaymentsController` (existing controller, `@UseGuards(PlatformAuthGuard)` already applied):

- `GET /api/v1/payments/commission-config` → `{ defaultBps }`.
- `PATCH /api/v1/payments/commission-config` — body `{ defaultBps: number }` (new Zod DTO `dto/commission-config.dto.ts`).
- `PATCH /api/v1/restaurants/:id/payment-connection/commission` — body `{ overrideBps: number | null }`, mounted alongside the existing `platform-payment-connections.controller.ts` routes (same "resource it naturally belongs to" convention already used there) rather than on `PlatformPaymentsController` — a restaurant's own override belongs with its connection record, not the platform-wide list endpoint.

## Frontend (Super Admin)

Two small additions to `cloud/super-admin-web`, no new page:

- `PaymentConnectionsListPage.tsx`: a small header control showing/editing the platform default commission percentage (calls the new `GET`/`PATCH /api/v1/payments/commission-config`), following the page's existing plain `useState`/`useEffect` + hand-rolled `api` client convention (no react-query, matching every other page in this app).
- The restaurant's payment-connection detail view (wherever `platform-payment-connections.controller.ts`'s detail endpoint is already consumed — located precisely during planning): an override input, `null`/empty = "using platform default (N%)", calling the new `PATCH .../commission` route.

Both actions confirm via the existing `ConfirmModal` pattern before submitting (matches every other mutating action in this app) and refetch on success.

## Error handling

- `commissionOverrideBps`/`defaultBps` outside `[0, 10000]`: rejected 400, both at the DTO layer (Zod) and defensively in the service method (never trust the DTO layer alone for a value stored long-term).
- Cashfree rejects the `order_splits` entry (e.g., vendor blocked/deleted at Cashfree's side after JAMANVAAR marked the connection `ACTIVE`): surfaces as today's existing `ServiceUnavailableException("Cashfree order creation failed: ...")` — the order/payment attempt fails cleanly, exactly like any other Cashfree order-creation failure already handled by this code; there is no silent fallback that creates an unsplit order.
- Changing the platform default or an override: takes effect only for `PaymentTransaction` rows created after the change (already guaranteed structurally — the resolved value is read once, at creation, and stored; nothing re-reads `PlatformSetting`/`commissionOverrideBps` for an existing row).
- A restaurant whose connection isn't yet `ACTIVE`: unreachable by this code — `createOrGetPaymentOrder` already throws `ForbiddenException` before ever reaching `createCashfreeAttempt`, unchanged by this spec.

## Testing

Extends the existing e2e suite, no new test file (this is additive behavior on an already-tested flow):

- `cloud/api/test/payments-orders.e2e.spec.ts`: order creation calls the mocked `CashfreeGatewayService.createOrder` with the expected `orderSplits` array; a restaurant with no override uses the platform default; a restaurant with an override uses its own value regardless of the platform default; a restaurant at exactly 0% commission still sends `percentage: 100` (not an omitted/undefined `orderSplits`); the retry path (existing order, prior attempt terminal-failed) also includes the split (regression check for the "retry path doesn't reload `connection`" gap this spec fixes).
- `cloud/api/test/payment-connections.e2e.spec.ts` (or a new adjacent spec if planning decides the file is already large enough to warrant a split): commission-config get/set (platform default), restaurant override get/set/clear, out-of-range rejection (negative, >10000), non-platform token rejected by `PlatformAuthGuard`, audit log entry created with correct old/new values on each change.
- `cloud/api/test/payments-refund.e2e.spec.ts`: confirm the existing suite passes unmodified — no refund-side code changes in this spec, this is a regression guard, not new coverage.

## Follow-on sub-projects (explicitly out of scope here, tracked for later)

1. **Reconciliation** — a scheduled job comparing JAMANVAAR's payment/split records against Cashfree's own split-and-settlement records (`GET /pg/easy-split/orders/{order_id}/split` or equivalent), surfacing mismatches as investigable exceptions rather than silently trusting either side.
2. **Dashboards** — Super Admin platform-wide (cross-restaurant) payments dashboard with aggregate stats and filters; Kiosk Admin and Restaurant Admin revenue dashboards. These consume the `commissionBps`/`platformAmount`/`restaurantAmount` fields this spec adds.
3. **RBAC / step-up auth** — finer-grained payment roles (e.g. a `FINANCE_ADMIN` distinct from `SUPER_ADMIN`) and re-authentication before high-risk payment actions (changing commission, disabling payment, refunding). Today everything sensitive is behind the single existing `PlatformAuthGuard`/`SUPER_ADMIN` role, unchanged by this spec.
4. **Consolidated documentation** — the specific `docs/CASHFREE_*.md` files originally requested, written once all of the above (particularly reconciliation and dashboards) actually exist to document, rather than documenting a system that's still partly aspirational.

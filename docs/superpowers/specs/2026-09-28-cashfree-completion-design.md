# Cashfree Payment Gateway — Completing the Integration (Reconciliation, Dashboards, Step-Up Security)

Status: Approved for planning
Date: 2026-09-28
Scope: The four remaining sub-projects identified at the end of the commission/split work (`docs/superpowers/specs/2026-09-27-cashfree-commission-split-design.md`), plus a security hardening pass, plus consolidated documentation. Builds on everything already shipped: backend foundation, vendor onboarding, kiosk checkout, refunds, Super Admin per-restaurant payments visibility, and real `order_splits` commission routing.

## Context — corrected findings from further investigation

Two assumptions from the prior sub-project's "follow-on" list turned out to be wrong once actually checked, so this spec starts by recording what's really there:

- **RBAC already exists and already covers payments.** `cloud/api/src/common/rbac/access.ts` is a complete, tested (27 cases, `access.spec.ts`), deny-by-default, path-pattern → area → role permission table, enforced globally inside `PlatformAuthGuard` (every platform request already goes through `canAccess(role, areaForPath(path), method)` before reaching a controller). `/api/v1/payments*`, `/api/v1/payment-connections*`, and `/api/v1/restaurants/:id/payment-connection*` are already mapped to the `'billing'` area. `FINANCE_ADMIN` already gets `billing: 'write'`; `READ_ONLY` gets `billing: 'read'` only; `PLATFORM_OPS`/`SUPPORT_ADMIN` get no billing access at all. The commission endpoints added in the prior sub-project are automatically covered by this — confirmed by path pattern, not yet confirmed by a role-boundary test written specifically for them (this spec adds that test; see Security below). **There is no RBAC sub-project left to build** — only a verification gap to close.
- **A scheduled-job system already exists.** `cloud/api/src/modules/jobs/jobs.service.ts` runs a fixed list of idempotent jobs every 15 minutes (renewals, overdue invoices, key expiry, backups, notifications), each job's owning service injected directly into `JobsService`'s constructor — this is the established pattern (not the unused `register()` hook mentioned in that file's own comment, which nothing currently calls). Reconciliation is added the same way: a new job entry backed by a new service, no new cron infrastructure.
- **What's genuinely still missing**, confirmed by grep across the whole payments module and both frontends: a reconciliation job, any platform-wide (cross-restaurant) payments aggregate view, any Kiosk Admin or Restaurant Admin revenue view, and step-up (re-authentication) protection on high-risk payment actions — today `approve`/`suspend`/`reactivate`/`disconnect` a payment connection and the new commission-config endpoints all execute immediately on any `FINANCE_ADMIN`+ role with a valid session, no re-entry of credentials.

## Non-goals (unchanged from the prior spec unless noted)

- No true per-restaurant independent Cashfree merchant accounts (still blocked on Cashfree Partner approval).
- No new RBAC roles or table changes — the existing six roles and `ROLE_ACCESS` table are sufficient; this spec only adds tests proving the new commission routes respect them, and (see Step-Up Auth) an additional, narrower re-authentication layer on top of role checks for a specific handful of actions, not a replacement for them.
- No automated recovery/auto-correction from a reconciliation mismatch — every mismatch becomes a durable, investigable exception; nothing is silently overwritten (matches the original spec's explicit instruction).
- No websocket/live-updating dashboards — matches every other Super Admin tab's load-on-select convention.

## Part A — Security hardening

### A1. Fix the two deferred minors from the commission sub-project

- `PaymentConnectionsService.setCommissionOverride` gains the same defensive `0 <= bps <= 10000` re-check `PlatformPaymentsService.setDefaultCommissionBps` already has, for symmetry (currently unreachable via HTTP since the controller already Zod-validates, but cheap and consistent).
- `PaymentConnectionsListPage.tsx`'s platform-default commission input disables its Save button until the initial `GET /commission-config` has resolved (a new `defaultLoaded` boolean state), closing the "save 0% before the real value loads" window.

### A2. RBAC boundary tests for the new commission routes

New e2e tests (extending `platform-payments.e2e.spec.ts` and `payment-connections.e2e.spec.ts`) creating a `FINANCE_ADMIN` and a `READ_ONLY` test platform user (via `createTestPlatformUser(prisma, { email, password, role })`, which already accepts any of the six roles):

- `FINANCE_ADMIN` can `GET` and `PATCH` `/api/v1/payments/commission-config` and the restaurant override route (matches `billing: 'write'`).
- `READ_ONLY` can `GET` both but a `PATCH` is rejected 403 (matches `billing: 'read'`).
- `SUPPORT_ADMIN` (no `billing` grant at all) is rejected 403 even on `GET`.

This doesn't add any new production code — it proves the existing `PlatformAuthGuard`/`access.ts` machinery already does the right thing for the newest routes, closing the verification gap named above.

### A3. Step-up authentication for high-risk payment actions

Per the original request's section 40 ("step-up authentication... for... refund, disabling payment, enabling payment, changing commission... using the strongest mechanisms supported by the existing authentication architecture"): the strongest mechanism already in this codebase's platform-auth layer is the password itself (platform login is email+password, then a mandatory emailed OTP — re-sending an OTP for every sensitive click would be heavy-handed and match no existing UX pattern in this app; re-entering the password the caller already knows is the standard, proportionate step-up pattern and requires no new delivery channel).

**Backend**: new `cloud/api/src/common/security/step-up.util.ts`:

```typescript
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PlatformUser } from '@prisma/client';

export async function requireStepUpPassword(actor: PlatformUser, password: string | undefined): Promise<void> {
  if (!password || !actor.passwordHash || !(await bcrypt.compare(password, actor.passwordHash))) {
    throw new ForbiddenException('Re-enter your password to confirm this action');
  }
}
```

Applied at the top of these existing/new service methods (each gains a `stepUpPassword: string` parameter, threaded from a new required DTO field on the corresponding controller route):

- `PaymentConnectionsService.approve` — a fresh Cashfree vendor becomes live; the highest-stakes action in this module.
- `PaymentConnectionsService.suspend` / `disconnect` — stops a restaurant's ability to take real payments.
- `PlatformPaymentsService.setDefaultCommissionBps` and `PaymentConnectionsService.setCommissionOverride` — changes what share of every future payment the platform keeps.

`reactivate` and `refreshStatus` are deliberately excluded — reactivate restores a state Super Admin already put the connection into once (re-approving already required step-up), and refresh-status is read-adjacent (it only polls Cashfree's own reported status, no state change of consequence).

DTOs (`dto/step-up.dto.ts`): a small `stepUpPasswordSchema = z.object({ password: z.string().min(1) })`, merged into the existing `setCommissionConfigSchema`/`setCommissionOverrideSchema` (add `password: z.string().min(1)` directly to both) and used standalone (body-only, since `approve`/`suspend`/`disconnect` currently take no body at all) for the connection-action routes.

**Frontend**: a single new shared component `cloud/super-admin-web/src/components/StepUpPasswordModal.tsx` (small modal: password field, Confirm/Cancel, following the existing `ConfirmModal` structural pattern in `components/ui.tsx`), reused by both `PaymentConnectionsListPage.tsx` (approve/suspend/disconnect, commission save) — replacing the plain `ConfirmModal` currently used for approve/suspend/disconnect with this password-collecting variant, and adding it to both commission-save flows.

**Testing**: e2e — `approve`/`suspend`/`disconnect`/both commission-set routes reject with 403 when `password` is missing or wrong (using the real platform user's real password created by `createTestPlatformUser`, so the check is proven against a real bcrypt hash, not a stub); succeed when the correct password is supplied. `reactivate`/`refreshStatus` continue to work with no password field (regression check that these two were deliberately not touched).

## Part B — Reconciliation

### Cashfree API (verified during the prior sub-project's research, reused here)

`GET /pg/easy-split/orders/{order_id}/split` — returns the split and settlement status Cashfree actually recorded for an order, keyed by the same `providerOrderId` this codebase already stores on every `PaymentTransaction`. New `CashfreeGatewayService.getOrderSplitDetails(providerOrderId): Promise<{ splits: { vendorId: string; status: string; settledAt: string | null }[] }>` (same `isConfigured()`/`ServiceUnavailableException` pattern every other gateway method already follows).

### Data model

New table, RLS-protected exactly like every other payment table:

```prisma
enum ReconciliationExceptionType {
  MISSING_AT_CASHFREE
  AMOUNT_MISMATCH
  SPLIT_MISMATCH
  UNEXPECTED_STATUS
}

enum ReconciliationExceptionStatus {
  OPEN
  ACKNOWLEDGED
  RESOLVED
}

model ReconciliationException {
  id             String                        @id @default(uuid())
  restaurantId   String
  restaurant     Restaurant                    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  paymentId      String
  payment        PaymentTransaction            @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  type           ReconciliationExceptionType
  details        Json // { expected, actual } — shape depends on `type`, never includes secrets
  status         ReconciliationExceptionStatus @default(OPEN)
  acknowledgedBy String?
  acknowledgedAt DateTime?
  createdAt      DateTime                      @default(now())

  @@index([restaurantId])
  @@index([status])
}
```

`PaymentTransaction` and `Restaurant` each gain a back-relation array field, `reconciliationExceptions ReconciliationException[]` (Prisma requires the inverse side on both related models, the same way `PaymentTransaction.refunds`/`Restaurant`'s existing payment-table back-relations already do).

### `PaymentReconciliationService` (new, `cloud/api/src/modules/payments/payment-reconciliation.service.ts`)

`reconcile(): Promise<{ checked: number; exceptionsCreated: number }>`:

1. `runAsPlatform`: load every `PaymentTransaction` with `status: 'SUCCESS'` (or `PARTIALLY_REFUNDED`/`REFUNDED`) whose `createdAt` is within the last 7 days and that has no existing `OPEN` `ReconciliationException` of a type this run would re-detect (idempotent re-runs don't pile up duplicate exceptions for the same still-unresolved issue) and whose `commissionBps` is not null (only payments this system actually declared a split for are reconcilable against split data — pre-migration rows are skipped, not falsely flagged).
2. For each, call `getOrderSplitDetails(payment.providerOrderId)`.
3. Compare: Cashfree's reported vendor id matches `restaurant.paymentConnection.cashfreeVendorId`; if not found at all → `MISSING_AT_CASHFREE`. If the split exists but its status is neither settled nor pending-settlement in a way that matches our `PaymentTransaction.status` → `UNEXPECTED_STATUS`. (Amount/split-percentage mismatch detection uses the `platformAmount`/`restaurantAmount` this system already snapshotted vs. what Cashfree's response reports, when the response includes an amount — if it doesn't, that comparison is skipped rather than guessed at.)
4. Any mismatch creates a `ReconciliationException` row (`status: OPEN`) — never mutates the `PaymentTransaction` itself.
5. A Cashfree API error for one payment (e.g. rate-limited) is caught per-payment, logged, and does not stop the run from checking the rest — matches `JobsService`'s existing per-job try/catch isolation philosophy, applied here per-payment inside one job.

Registered in `JobsService`'s constructor + `jobs` getter list (`{ name: 'payment-reconciliation', description: 'Compare recent successful payments against Cashfree's own split/settlement records', run: () => this.reconciliation.reconcile() }`), following the exact pattern `backups`/`invoices` already use — `JobsService`'s existing `payments` import needs `PaymentReconciliationService` added to its constructor and `PaymentsModule` exported alongside `PaymentsService`/`CashfreeGatewayService`.

### Super Admin surface

New tab on the existing per-restaurant `RestaurantDetailPage.tsx`'s "Payments" tab area — not a new page: a small "Reconciliation Exceptions" section below the existing transaction table, showing only `OPEN`/`ACKNOWLEDGED` exceptions for that restaurant (loaded alongside the tab's existing payment list call), each row: type, details (formatted per type), created date, and an "Acknowledge" action (`PATCH /api/v1/payments/reconciliation-exceptions/:id/acknowledge`, sets `status: ACKNOWLEDGED`, `acknowledgedBy`/`acknowledgedAt`) — deliberately no "Resolve" action from the UI in this pass (resolution implies the underlying money problem was actually fixed, which is an operational step outside this codebase; `RESOLVED` exists in the enum for a future manual/support workflow, not wired to any endpoint yet — an honest scope limit, not an oversight).

New endpoints on `PlatformPaymentsController` (same controller, same guard, `'billing'` area already covers this path since it's still under `/api/v1/payments`):

- `GET /api/v1/payments/reconciliation-exceptions?restaurantId=&status=` — paginated list, same `{ rows, total, page, limit }` shape as the existing payments list.
- `PATCH /api/v1/payments/reconciliation-exceptions/:id/acknowledge` — step-up not required (acknowledging is informational triage, not a financial mutation).

## Part C — Super Admin platform-wide payments dashboard

The prior visibility work was deliberately restaurant-scoped only (support-ticket workflow). This adds the cross-restaurant view the original request asked for, as a new top-level page (not a `RestaurantDetailPage` tab) — `cloud/super-admin-web/src/pages/PlatformPayments/PlatformPaymentsDashboardPage.tsx`, new nav entry under "SaaS Management" alongside "Payment Gateways".

### Backend: `GET /api/v1/payments/platform-summary`

New method on `PlatformPaymentsService`, `platformSummary(filters: { from?: Date; to?: Date; restaurantId?: string; status?: PaymentTransactionStatus })`:

```typescript
async platformSummary(filters: PlatformSummaryFilters) {
  return this.prisma.runAsPlatform(async (tx) => {
    const where = {
      ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : {})
    };
    const [successAgg, refundAgg, statusCounts, exceptionCount] = await Promise.all([
      tx.paymentTransaction.aggregate({ where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amount: true, platformAmount: true, restaurantAmount: true }, _count: true }),
      tx.refund.aggregate({ where: { status: 'SUCCESS', payment: where }, _sum: { amount: true } }),
      tx.paymentTransaction.groupBy({ by: ['status'], where, _count: true }),
      tx.reconciliationException.count({ where: { status: 'OPEN' } })
    ]);
    return {
      grossVolume: successAgg._sum.amount ?? 0,
      platformCommission: successAgg._sum.platformAmount ?? 0,
      restaurantShare: successAgg._sum.restaurantAmount ?? 0,
      refundedAmount: refundAgg._sum.amount ?? 0,
      successfulCount: successAgg._count,
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
      openReconciliationExceptions: exceptionCount
    };
  });
}
```

Route: `GET /api/v1/payments/platform-summary?restaurantId=&status=&from=&to=` on `PlatformPaymentsController`, declared alongside `commission-config` (above the `:paymentId` route, same ordering reason).

### Frontend

- Summary tiles: Gross Volume, Platform Commission, Restaurant Share, Refunded, Open Reconciliation Exceptions (linking to a filtered view — see below).
- Filters: restaurant (a searchable select, reusing the restaurant list already fetched by `PaymentConnectionsListPage`'s pattern or a lightweight new `GET /api/v1/restaurants?fields=id,name` — check whether the existing restaurants list endpoint already supports a lightweight projection before adding a new one), status, date range (from/to).
- Below the tiles: the same paginated transactions table `RestaurantDetailPage.tsx`'s existing Payments tab already renders, reused as a shared component (`extract into cloud/super-admin-web/src/components/PaymentsTable.tsx` if not already generically written, or duplicated minimally if extraction is riskier — implementation-time judgment call, not a design ambiguity: prefer extraction, since the two views' row shape is identical) — now driven by `GET /api/v1/payments` with the platform-wide filters (no forced `restaurantId`).

## Part D — Kiosk Admin revenue view

### Backend: `GET /api/v1/tenant/payments/summary`

New tenant-facing endpoint (device-authed, `TenantAuthModule`'s existing pattern — Kiosk Admin already has a real staff session per the earlier onboarding work), restricted to the caller's own `restaurantId` (never a query param):

```typescript
// payments.service.ts — new method, reuses the same aggregate shape as platformSummary but tenant-scoped
async tenantSummary(restaurantId: string, filters: { from?: Date; to?: Date }) {
  return this.prisma.runAsTenant(restaurantId, async (tx) => {
    const where = { restaurantId, ...(filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : {}) };
    const [successAgg, refundAgg] = await Promise.all([
      tx.paymentTransaction.aggregate({ where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amount: true }, _count: true }),
      tx.paymentTransaction.count({ where: { ...where, status: 'FAILED' } })
    ]);
    const refunded = await tx.refund.aggregate({ where: { status: 'SUCCESS', payment: { restaurantId } }, _sum: { amount: true } });
    return {
      grossVolume: successAgg._sum.amount ?? 0,
      successfulCount: successAgg._count,
      failedCount: refundAgg,
      refundedAmount: refunded._sum.amount ?? 0
    };
  });
}
```

Mounted on a new `TenantPaymentsController` (`TenantAuthGuard`, `api/v1/tenant/payments/summary`) — confirmed to match the exact guard `kiosk-payment-connection.controller.ts` already uses for Kiosk Admin's real staff session (`TenantAuthGuard`, mounted under `api/v1/tenant/...`), the same session Kiosk Admin's existing Payment Gateway settings screen already authenticates with.

### Frontend

A new small section in Kiosk Admin's existing "Payment Gateway" settings area (added in the Phase 2 onboarding sub-project) — three numbers (Today's Gross, Successful count, Refunded) fetched once on tab focus, no new tab/nav entry (this app is tab-based per its established structure, and Payment Gateway is already the natural home for anything payment-related to this restaurant).

## Part E — Restaurant Admin (pos-admin) revenue view

### Backend

Reuses Part D's exact `GET /api/v1/tenant/payments/summary` endpoint — Restaurant Admin (`pos-admin`) already has its own device/tenant credentials (confirmed: `pos-admin`'s `cloudClient.ts` already calls cloud endpoints for refunds). No new backend route needed.

### Frontend

New section in `pos-admin`'s existing `components/reports/ReportsDashboard.tsx` (the natural home — this file already aggregates local sales figures) or a new small card, calling the same tenant-summary endpoint via `pos-admin`'s existing `cloudClient.ts` (add a `getPaymentsSummary()` function there, mirroring Kiosk Admin's new one) — showing Online Sales (Cashfree gross volume), Refunds, alongside whatever cash-sales figures this dashboard already computes locally, clearly labeled as two different sources (online vs. local/cash) rather than merged into one misleading total.

## Part F — Consolidated documentation

Once Parts A-E exist, write the seven files originally requested, each a genuinely useful artifact now that there's a real system to document (not written speculatively beforehand):

- `docs/CASHFREE_CURRENT_API_RESEARCH.md` — the verified Cashfree API surface this whole effort actually used (Create Order + `order_splits`, Easy Split vendor CRUD, refunds, webhook signature scheme, Split After Payment, Get Split/Settlement Details) with source links, written from what's now implemented, not reconstructed from memory.
- `docs/CASHFREE_PAYMENT_ARCHITECTURE.md` — the end-to-end flow diagram and component list (kiosk → backend → Cashfree → webhook → ledger → POS/KDS → settlement → reconciliation), current as of this implementation.
- `docs/CASHFREE_SECURITY_MODEL.md` — RBAC areas/roles table, step-up auth coverage, secret handling, webhook signature/replay protection, tenant isolation — a security reviewer's map of this module.
- `docs/CASHFREE_ONBOARDING_FLOW.md` — the vendor onboarding state machine (`NOT_CONNECTED` → ... → `ACTIVE`) with the exact Cashfree API calls at each transition.
- `docs/CASHFREE_WEBHOOK_FLOW.md` — signature verification, idempotency, the event types actually handled.
- `docs/CASHFREE_SETTLEMENT_FLOW.md` — commission/split mechanics, what settles where, refund-reversal behavior.
- `docs/CASHFREE_RECONCILIATION.md` — what the new job checks, exception types, how a Super Admin acts on one.

## Testing summary (detail lives in the implementation plan)

Every new backend behavior gets an e2e test following this module's established `createTestApp`/mocked-`CashfreeGatewayService` pattern. Every frontend addition gets manual verification against real running dev servers (no test runner exists for any of the three frontends touched here, matching this project's consistent prior finding) — done directly, in a real visible browser, the same way the commission sub-project's UI was verified.

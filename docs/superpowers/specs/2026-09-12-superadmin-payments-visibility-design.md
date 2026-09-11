# Super Admin Payments Visibility — Design

**Status:** Approved
**Phase:** Phase 4, sub-project B (of: refunds ✅, payments visibility, real receipts/e-bills, POS live payment-status check)

## Problem

Platform staff (Super Admin) currently have no way to see a restaurant's real
orders, payments, or refunds. `RestaurantDetailPage.tsx` has 12 tabs
(Overview, Owner & Users, Branches, Subscription, Applications, Plan Quotas,
Feature Entitlements, Devices & Keys, Billing & Invoices, Reports &
Analytics, Audit Logs, Support & Diagnostics, Backup & Recovery) and none of
them show a single `Order`, `PaymentTransaction`, or `Refund` row. Support
staff investigating "customer says they paid but the order is stuck" or "why
does this restaurant's revenue look low" have to ask an engineer to query the
database directly.

Reports & Analytics (`/api/v1/platform/reports/restaurants/:id`) shows
backend-aggregated KPIs, not individual transactions — it answers "how much"
not "which one." This design adds the transaction-level view.

## Non-goals

- No platform-wide, cross-restaurant payments view. Support staff always
  start from a specific restaurant (a support ticket, a phone call); a
  per-restaurant tab matches that workflow and matches every existing
  transaction-level tab (Devices & Keys, Audit Logs, Billing & Invoices).
  A cross-restaurant view can be added later if a real workflow needs it.
- No actions. This tab is read-only — no refund button, no status override.
  Refunds are already actioned from POS/POS Admin (Phase 4a); duplicating
  that here would create a second, less-informed path to the same mutation.
- No CSV export. Reports & Analytics already owns aggregate export; adding
  a second, row-level export surface is out of scope until someone asks.
- No live/websocket updates. Matches every other tab on this page — all are
  load-on-tab-select, not live.

## Architecture

**Backend:** one new read-only module, `platform-payments`, following the
exact split `payment-connections` already uses — tenant-facing writes live
in one controller (`kiosk-payment-connection.controller.ts`), platform-facing
reads live in another (`platform-payment-connections.controller.ts`). This
keeps `payments.service.ts` (already carrying order creation, webhook
processing, and refund creation) from also growing a third, unrelated
concern.

- `PlatformPaymentsController` (`@UseGuards(PlatformAuthGuard)`):
  - `GET /api/v1/payments?restaurantId=<id>&page=&limit=&status=` — paginated
    list, following the `audit-query` module's exact response shape
    (`{ rows, total, page, limit }`) and query-param style (`?restaurantId=`,
    matching `devices` and `audit-logs`).
  - `GET /api/v1/payments/:paymentId` — single payment detail, including its
    parent order and its refunds.
- `PlatformPaymentsService`, using `prisma.runAsPlatform(...)` (the same
  helper `DevicesService.list()` uses for platform-scoped, cross-restaurant
  reads that bypass tenant RLS).

`PaymentTransaction` is the primary listing entity, not `Order` — it is the
one with `status`, `method`, `paidAt`, and `providerPaymentId`, and it is
what "payments visibility" is actually about. Each row's parent `Order`
(subtotal/tax/discount/total, `externalOrderId`) comes along via `include`.

```typescript
// platform-payments.service.ts
export interface PlatformPaymentFilters {
  restaurantId?: string;
  status?: PaymentTransactionStatus;
  page: number;
  limit: number;
}

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
          order: { select: { id: true, externalOrderId: true, subtotal: true, taxAmount: true, discountAmount: true, totalAmount: true, status: true } },
          refunds: { select: { id: true, amount: true, status: true, reason: true, createdAt: true, processedAt: true } }
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
```

No new DTO/Zod schema is needed — every input is either a path param or an
optional query-string filter, exactly like `AuditQueryController`, which
takes the same shape unvalidated (`Number(page) || 1`, clamped).

**Frontend:** a 13th tab, `payments`, added to `RestaurantDetailPage.tsx`'s
`TABS` array (after `billing`, before `reports` — money-adjacent tabs stay
grouped), lazy-loaded on first select exactly like `activity`/`invoices`/
`backups`, following `PaymentConnectionsListPage.tsx`'s structural
convention:

- A summary strip above the table: total transactions, total successful
  amount, total refunded amount, computed client-side from the loaded page
  — not a separate aggregate call, since Reports & Analytics already owns
  real aggregate KPIs and this strip is just an at-a-glance header for the
  table below it, not a competing analytics surface.
- A `FilterTabs` row for status (`All / Success / Failed / Pending / Refund
  Pending / Partially Refunded / Refunded`), refetching with `status=` on
  change. `CREATED`/`AUTHORIZED`/`USER_DROPPED`/`CANCELLED` rows still show
  up under "All" with their own `Badge` color — they're real but rare
  states not worth a dedicated filter tab.
- A paginated table: Date, Order ID (`externalOrderId`), Amount, Method,
  Status (`Badge`, colored per status), Refunded amount (sum of that
  payment's `SUCCESS` refunds, if any), using `SkeletonTable` while loading
  and `EmptyState` when `rows.length === 0`.
- Clicking a row expands inline (no navigation, no modal) to show: full
  Cashfree IDs (`providerOrderId`/`providerPaymentId`), failure reason (if
  any), and each refund's id/amount/status/reason/timestamps. This matches
  how `AuditLogPage`'s `selectedLog` modal already surfaces "everything about
  one row" without leaving the tab — except inline expansion is enough detail
  here that a separate modal isn't needed.

## Data flow

1. Platform staff opens a restaurant's detail page, clicks the "Payments"
   tab.
2. Frontend calls `GET /api/v1/payments?restaurantId=<id>&page=1&limit=25`.
3. Backend (`PlatformAuthGuard` already verifies the caller is platform
   staff) runs the query under `runAsPlatform`, returns `{ rows, total, page,
   limit }`.
4. Frontend renders the summary strip (computed from `rows`) and the table.
5. Changing the status filter or page re-issues the same call with new query
   params; the tab's own `useState`, not a global cache, holds the result
   (matches every other tab's lazy-load pattern — no cross-tab cache
   invalidation to reason about).
6. Clicking a row does not trigger a new network call — the list response
   already includes each payment's order and refunds needed for the expanded
   view.

## Error handling

- `restaurantId` with no matching restaurant: the query legitimately returns
  `{ rows: [], total: 0, ... }` — same as `audit-logs` today. The frontend
  shows the existing `EmptyState`, not an error.
- `GET /api/v1/payments/:paymentId` for a non-existent id: 404
  (`NotFoundException`), matching `DevicesService.getById`'s exact pattern —
  unused by this tab's list view but kept for symmetry and any future direct
  link.
- Network/API failure on load: matches the existing pattern used by every
  other tab (`activity`/`invoices`/`backups`) — `.catch(() => {})` for
  `activity`/`invoices`/`reports` or `.catch(() => setX([]))` for `backups`.
  Payments follows the `backups` style (`.catch(() => setPayments({ rows:
  [], total: 0, page: 1, limit: 25 }))`) so a failed load renders as an empty
  table rather than an indefinite skeleton.

## Testing

- Backend e2e (`cloud/api/test/platform-payments.e2e.spec.ts`):
  - Platform token can list payments filtered by `restaurantId`; response
    shape matches `{ rows, total, page, limit }`.
  - Status filter (`?status=SUCCESS`) returns only matching rows.
  - Pagination (`page`/`limit`) slices correctly across >1 page of results.
  - A payment's `refunds` array is populated when refunds exist (reuses
    Phase 4a's refund-creation flow to seed one).
  - `GET /api/v1/payments/:paymentId` returns the full detail including
    `order` and `refunds`.
  - `GET /api/v1/payments/:paymentId` for an unknown id returns 404.
  - A tenant-auth or device-auth token (not platform) is rejected 401/403 by
    `PlatformAuthGuard` — no new guard logic to test, just confirms the
    existing guard is actually applied.
- Frontend: no new automated test infra exists for `super-admin-web` today
  (none of the other 12 tabs have one) — manual verification only, per this
  project's existing convention: load the tab against a restaurant with real
  Phase 4a payments/refunds, confirm the summary strip, filter, pagination,
  and row expansion all render correctly.

# Multi-branch audit and implementation plan

## Architecture found before editing

Restaurant is the RLS tenant. Branches, users, activation keys and devices have explicit tenant relationships. Operational terminals are assigned to branches during activation; multi-branch restaurants must name a branch. Restaurant subscriptions and application entitlements are restaurant-level, while activated devices and QR codes determine each branch's deployed setup. QR is a channel, not a terminal. Preserve this licensing model rather than invent branch subscriptions.

SyncedOrder is the operational/reporting record, with a restaurant-wide sequence and branch assignment. Gateway Order/PaymentTransaction is a separate payment record. POS, Captain, Kiosk and QR share order sync; signed webhooks gate online kitchen admission. Branch Core authenticates a cached roster and supports cursor recovery and idempotent inventory movements. The master catalog is restaurant-wide; published branch overrides supply prices and availability.

## Confirmed gaps

| Severity | Finding | Evidence before changes | Implementation |
| --- | --- | --- | --- |
| High | Restaurant Admin cannot aggregate all branches | BranchDirectoryModal explicitly says it is a directory; dashboard computes from the console's local orders. | Add authenticated tenant aggregation and actual branch scope with persistent context; keep operational caches separate. |
| High | Dashboard charts can disagree with period | KPI uses dashFilter; top dishes and hourly sales use TODAY regardless of filter. | Compute every widget from one backend scope/date range. |
| Critical | Operational entity branch scope is incomplete | STAFF_USER, SHIFT, CASH_MOVEMENT, RESERVATION and SERVICE_MESSAGE are not passed a branch filter consistently. | Stamp/validate branch ownership on writes; scope reads without skipping invisible cursor pages. Preserve deliberately shared catalog/customer records. |
| High | Kiosk gateway order loses branch | createOrGetPaymentOrder saves kioskId but not branchId. | Derive branch from the authenticated kiosk and prevent another kiosk adopting the payment reference. |
| Critical | Payment object endpoints validate tenant but not branch | Status/QR/claim/fulfillment/refund accept any payment ID within the restaurant. | Enforce branch and kiosk ownership before accessing/mutating a payment. |
| High | Null legacy orders reach every branch | Order catch-up uses own branch OR branchId:null. | Permit legacy null records only in a genuinely single-branch restaurant; retain owner recovery access. |
| High | Branch-bound console can change another branch KDS station | setKitchenStation checks only restaurantId. | Enforce console branch on target selection. |
| High | Tenant branch directory ignores assigned user branch | TenantBranchesController lists all branches for any tenant user. | Owner sees own restaurant; manager sees assigned branch; staff cannot use admin scope. |
| Medium | Branch creation limit can race | Branch count and create lack a shared lock. | Serialize quota enforcement and branch creation. |
| Medium | Platform dashboard conflates ACTIVE with online | Device count uses status ACTIVE instead of lastSeenAt. | Use the existing shared health definition. |

## Implementation and test sequence

1. Tighten backend branch ownership and payment provenance with regression tests before dashboard work.
2. Add owner/manager scope authorization, database dashboard aggregation, bounded recent orders/fleet, source and branch charts, top items, pending payments and relevant alerts. Use branch timezones for branch scope and restaurant timezone for consolidated reporting. AOV is total sales divided by paid-order count.
3. Add a persistent scope selector and independent branch caches/authorized transport for owner operations. All Branches is aggregate reporting; branch operations require a selected branch. Changing scope never transfers a terminal or rewrites historical orders.
4. Run isolated database matrices for POS only, POS+Captain, repeated devices of each type, Kiosk+Kiosk Admin, five distinct branch setups, all four sources, multi-tenant/branch IDOR, concurrency, inventory replay and gateway replay.
5. Run compiled-app Playwright checks for selector persistence, widgets, branch operations, mobile/tablet layouts, cross-app orders, reconnect and separate device identities. Add measured aggregation timings and scale checks. Record simulated-provider and live AWS limitations.

No production database, credentials, deployed configuration or customer payment will be changed by the local audit tests. Existing legacy records remain recoverable and are never assigned to an arbitrary branch to hide an isolation problem.

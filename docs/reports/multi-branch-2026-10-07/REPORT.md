# Multi-branch implementation and verification

Date: 7 October 2026. Scope: repository implementation and isolated local verification. This report does not certify the currently deployed AWS build.

## Resulting owner flow

The owner signs into the existing Restaurant Admin console once. **All restaurant** shows consolidated business reporting. Choosing a branch opens its orders, tables, inventory and device workspace. The Restaurant Admin and Kiosk Admin product views share this selection and retain their own available modules. Switching the workspace does not reassign the registered console, change an activation key, or move historical orders.

Each restaurant/branch workspace has a separate durable browser database and fallback namespace. Existing branch queues remain in their original workspace. A new branch starts with an empty floor plan; it never imports another branch's legacy tables or creates demo tables. Other tabs retain their original request scope even if a different tab changes its selection.

Subscriptions remain restaurant-level product-family subscriptions. Branch setup is derived from activated device types and active QR codes. Coexisting plans use the largest active, unexpired branch capacity, without adding their capacities together. No branch subscription system has been invented.

## Confirmed problems and implemented fixes

| Severity | Confirmed cause / evidence | Affected apps and files | Fix and expected impact |
| --- | --- | --- | --- |
| Critical | Branch filtering covered tables but omitted several operational JSON domains. Payment endpoints checked restaurant ownership without checking the branch or kiosk. | POS, Captain, KDS, Kiosk, admin; `entity-sync.service.ts`, `payments.service.ts`, `payment-orders.controller.ts` | Validate and retain branch ownership on writes/deletions; filter reads; reject foreign branch/kiosk payment IDs. Stops cross-branch edits and payment-reference adoption. |
| High | Kiosk gateway orders stored the kiosk ID without their branch ID. Concurrent requests could create competing attempts. | Kiosk, POS settlement, financial reporting; `payments.service.ts`, `order-sync.service.ts` | Derive branch from the authenticated kiosk; serialize order/attempt creation; require payment reference, amount and canonical order to match. Repeated checkout returns one payment. |
| High | Owner dashboard counted the console's local cache rather than all branch records. Some charts always used today's data despite another selected period. | Restaurant Admin; `tenant-dashboard.service.ts`, `BranchBusinessDashboard.tsx` | Canonical database aggregation with one consistent branch/date/source snapshot. Sales trend, branch/source totals, top items and AOV reconcile. Unpaid amounts remain separate from collected sales. |
| High | Branch switching could reuse the same browser database. A fresh empty cache seeded twelve demo tables. | Restaurant/Kiosk Admin; `adminBranchScope.ts`, `browser_boot.ts` | Independent durable caches and explicit empty initialization. Prevents stale tables and queued edits from entering another branch. |
| High | Tenant branch directory ignored assigned manager scope; branch-bound admin could assign another branch's KDS station. | Admin, KDS; `tenant-branches.controller.ts`, `device-auth.guard.ts`, `devices.service.ts` | OWNER may select own branches; MANAGER stays assigned; staff cannot use the business dashboard; station/device targets stay in scope. |
| High | QR administration accepted other branch table/code/settings identifiers. The scoped overview query attempted an unsupported Prisma relation. | QR, Restaurant Admin; `qr-admin.service.ts`, `qr.controllers.ts` | Scope every operation and use the stored event branch field. QR overview and branch controls work without exposing other branch activity. |
| High | Restaurant-wide payouts could be read through branch-manager scope. | Kiosk/Restaurant Admin; `device-auth.guard.ts`, `cloudClient.ts` | Multi-branch restaurant payout endpoints require the current owner's device-bound session. Payouts remain restaurant-wide rather than being falsely attributed to a branch. |
| High | Partial refund amount was not preserved in the order sync metadata; a refunded status alone could reverse the entire sale in the new aggregate. | POS, admin; `repositories.ts`, `outbox.ts`, order-sync DTO/service, dashboard | Carry the exact refund in paise, authorize changes, subtract it once and clamp it to the sale total. Legacy records lacking an amount retain their existing full-refund interpretation. |
| Medium | Branch quota count/create could race and the latest smaller Kiosk plan could mask Restaurant plan capacity. | Super Admin; `branches.service.ts` | Transaction lock and capacity across active, unexpired product plans. |
| Medium | ACTIVE devices were counted as connected; low-stock alerts could use a stale master status. | Owner/platform dashboards; dashboard services | Recent heartbeat defines online; stock alerts use opening stock plus that branch's movement ledger. Aggregate fleet totals include devices beyond the bounded detail list. |
| High | Local Core inventory endpoints lacked the device-type read restriction and generic entity routes accepted unknown types. | Branch Core, all operational apps; `server.ts`, inventory controller | Match cloud inventory permissions and entity allowlist. Public Kiosk, KDS and Captain cannot access the stock ledger. |
| High | The staff-sync coalescer waited for every queued invalidation before resolving callers, allowing repeated background pulls to prolong PIN sign-in. Staff serialization also omitted branch membership. | POS, Captain, KDS, admin; `staff_sync.ts`, `repositories.ts`, cloud entity sync, Branch Core | Release callers after one completed sync pass and run queued invalidations separately. Preserve staff branch membership across pull/edit/push and stamp new branch staff. KDS now shows PIN verification progress and clears its busy state on success or error. The coalescer starvation mechanism is confirmed by a regression test; browser sign-in verification is recorded separately. |

## Data and consistency contract

- `Restaurant` is the RLS tenant. Operational records retain `restaurantId`, `branchId` and originating device identity. A new composite foreign-key migration enforces tenant membership for devices, users, keys, orders, QR codes/settings and inventory movements, in addition to existing application checks.
- The database aggregation counts `SyncedOrder` once. Gateway `Order`/`PaymentTransaction` contributes payment/refund evidence, never a second sale. Net sales mean paid gross minus successful refunds. A counter-payment order is visible operationally immediately; its amount remains awaiting payment until the cashier settles it.
- Kitchen service and financial closure remain separate: KDS publishes per-dish Served while an unpaid counter order remains collectible at POS. Cashier settlement completes the financial order. Guest QR tracking derives Completed from the served dishes without pretending that an unpaid order has been paid.
- The sale's business date uses the selected branch timezone; consolidated reporting uses the restaurant timezone. Refunds shown here belong to the selected sale cohort, not a separate refund cash-flow date report.
- Operational updates use the existing realtime invalidation and cursor catch-up paths. This is eventual consistency. Lost connections recover through persisted outboxes, idempotent events and sequence cursors. Existing admin order fallback runs every four seconds and master-data fallback every fifteen seconds; they are recovery intervals, not an AWS delivery guarantee.
- The business dashboard refreshes every fifteen seconds and has explicit Refresh. Its widgets use one repeatable-read snapshot. A failed refresh retains the last successful snapshot with a visible stale-data message.
- A remote branch workspace uses the cloud, rather than accidentally routing to a paired Core belonging to another branch. It keeps its own cache while offline; remote branch mutations require valid owner/manager proof and cloud access. Physical branch terminals retain their existing local Core operation.
- Null-branch legacy records remain visible to the owner for recovery. In a multi-branch restaurant they are excluded from operational branch reads; no arbitrary branch is assigned. Single-branch compatibility is retained where ownership can be unambiguous.
- Catalog, customer and supplier masters are deliberately shared within the restaurant. Branch menu price/availability overrides and catalog branch visibility are enforced. Staff PIN records are filtered by branch and terminal role.

## Verification evidence

Tests run against a dedicated local QA database with tenant RLS. Fixtures use disposable restaurants, subscriptions, branches and devices. Payment-provider networking is simulated/blocked; no customer payment is charged. The exact branch-membership migration has also been exercised against transaction-local tables with all eight foreign-key rejection checks, then applied to the dedicated QA database.

Scenario results, final test counts and measurements are recorded alongside this report in `BROWSER_RESULTS.json`, `PERFORMANCE.json` and the final verification record. The matrix covers five different branch setups, multiple POS/KDS/Captain/Kiosk identities, branch IDOR, concurrency, cursor recovery, exact financial totals and actual QR checkout through KDS completion. Browser evidence covers owner login, selection, refresh, product switching, custom dates and responsive layouts.

Final isolated KDS browser verification is **PASS** (`KDS_BROWSER_RESULTS.json`): three genuine device sessions sign in, two screens receive the same branch ticket, the third branch receives none, Ready/Served propagates, and cash settlement through POS completes the order. Ticket arrival, including activation of its originating kiosk, measured **1,602 ms** locally. No browser page errors occurred.

The compiled production dashboard service passed seven verification scenarios with **10,000 sales and 1,001 devices** (`COMPILED_DASHBOARD_RESULTS.json`). Three aggregate service/database reads measured **198 / 2,337 / 4,098 ms**, all below the retained five-second assertion. This includes exact partial refunds, null unpaid states, four source filters, manager isolation, fault alerts outside the detail cap and every branch's exact totals. These are service timings, not HTTP/browser timings.

Earlier verification failures remain available rather than being overwritten as successes: the combined owner/KDS browser run passed seven owner scenarios before an activation-key transaction exceeded its 15-second deadline; an earlier API scale run exceeded five seconds under machine load. The optimized financial query and isolated compiled/KDS checks passed afterward. No production transaction timeout was increased to hide those failures.

The final API acceptance rerun is **39/39 PASS**: all 34 multi-branch scenarios plus five order-payload fidelity/validation cases (`logs/multi-branch-final-acceptance-api.log`). With 10,000 extra orders and 1,001 extra devices, aggregate HTTP requests measured **152 / 131 / 134 ms**; same-branch catch-up fanout took **129 ms**. POS/Captain/Kiosk commits measured **19 / 19 / 17 ms**, QR checkout commit **67 ms**, and KDS Ready/Served through all origins **205 ms**. These isolated local measurements are distinct from the three-screen browser arrival and the earlier busy-machine timings; they do not establish production AWS performance.

Latest staff/cache/outbox tests passed 21 cases; the separately rerun Branch Core suite passed all 24 cases. The initial combined run had a five-second Core test deadline failure; its isolated rerun completed all Core tests in 1.7 seconds. Existing local regression evidence also covers 97 API cases, 67 Core/storage cases, 42 Captain/KDS/QR cases and 35 refund/outbox cases; these counts overlap and must not be summed into a unique test total.

Final builds passed for the API and all seven current web workspaces: Restaurant/Kiosk Admin, POS, Captain, KDS, Kiosk, QR Guest and Super Admin (`BUILD_RESULTS.json`). Shared code is bundled into the app builds. The latest frontend recompilation skipped unchanged asset-packaging lifecycle scripts; normal builds had already prepared the same assets successfully. `git diff --check` passed. The exact migration rejection verifier passed again for all eight constrained record types.

## Deployment and further verification

1. Apply normal Prisma migrations to the release database before deploying the matching API. The new tenant-membership migration intentionally fails if historical rows point at another restaurant's branch; investigate those rows rather than reassigning them automatically. Production migrations have not been run by this task.
2. Build and deploy the API, shared libraries/Core and frontend assets together. Branch selection uses the existing admin shell; it does not require reactivating or moving operational terminals.
3. Verify live multi-instance SSE/notification delivery through AWS/Nginx/ALB, real mobile UPI handoff and callbacks, physical LAN outage/recovery, printer hardware and realistic concurrent restaurant traffic. Local timing cannot establish AWS latency.
4. Legacy partial refunds with no stored amount cannot be reconstructed safely from a refunded status alone. Reconcile them from financial records if historical partial-refund reporting is required.

Known performance limitation: several existing app builds still emit large JavaScript chunk warnings. Successful compilation and local tests do not prove fast cold startup on low-end production devices.

## Changed API behavior

- `GET /api/v1/tenant/dashboard` provides authorized aggregate or branch reporting with date/source filters.
- Financial widgets reuse one materialized, scoped sales dataset in one database query, instead of recomputing sales/refund reconciliation for each chart. The device/stock reads share the same repeatable-read transaction.
- Tenant branch listing respects manager assignment. Branch creation validates timezone and serializes quota enforcement.
- Entity sync, order catch-up, inventory ledger, QR administration and device commands enforce the authenticated branch. Scoped owner administration uses `x-admin-branch` plus a valid device-bound owner/manager session; the header alone grants no access.
- Payment create/status/claim/QR/fulfillment/refund operations validate originating branch and kiosk. Recent payments and day statements use branch scope; consolidated payouts require owner access for multi-branch restaurants.
- Order sync carries the authorized exact refund amount in paise. It preserves authoritative financial metadata against updates from kitchen/captain terminals.

## Likely problems and verification limits

Large app bundles and a busy development machine can increase startup and test latency. This is not evidence of an AWS bottleneck. Production connection-pool pressure, load-balancer stream behavior and payment-provider latency remain unmeasured because production logs and tracing are unavailable. The local evidence distinguishes canonical database commit time, delivery/catch-up time and browser rendering; none should be described as a production SLA.

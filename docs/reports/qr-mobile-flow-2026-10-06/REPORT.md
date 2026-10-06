# QR table ordering: investigation, fixes and verification

Investigation started 6 October 2026; final verification completed 7 October 2026. The attached documents supplied requirements; claims about current behaviour were checked against the repository, read-only production responses and isolated tests.

**Status:** fixes implemented and local checks pass. Production has not been redeployed from this workspace. Real phone UPI switching, live gateway collection, physical printing and AWS behaviour after deployment remain unverified. Provider HTTP calls in automated tests are simulated; application logic, database, permissions, signatures and synchronization run for real.

## 1. Confirmed blank-page root cause

The production QR HTML requested JavaScript `/assets/index-BqaCms6k.js` and CSS `/assets/index-CcsfJAOu.css`. Both returned **404 HTML**. The same files under `/q/assets/` returned **200 JavaScript/CSS**. `/q/<token>` is routed to the guest container, while root assets go to the platform application. Vite's root asset base prevented the guest application from mounting.

The public API returned a normal JSON `QR_NOT_FOUND` for a deliberately invalid test token. Production investigation used GET requests only and created no production orders or payments.

**Severity: Critical. Affected:** every production QR customer page. **Fix:** build guest assets with `/q/` base. **Expected impact:** scanned URLs mount the guest app instead of an empty page.

## 2. Routes and deployment configuration

Guest route remains `/q/<secure-token>`. Payment return uses `/q/<secure-token>?order=<public-order-reference>`. JS/CSS remain under `/q/assets/`. Existing outer nginx prefix removal is retained; the container's SPA document now revalidates after releases, while hashed assets retain immutable caching.

The production build still requires `VITE_CLOUD_API_BASE_URL`, supplied by Compose's `PUBLIC_ORIGIN`. Generated codes and payment returns use API `QR_ORDER_BASE_URL`, also supplied by `PUBLIC_ORIGIN`. These must identify the public HTTPS origin. No live environment values or production keys were changed. `npm run dev:all` now includes the guest server on port 5190; local instructions were added to `RUN_SERVERS.md`.

## 3. Token, tenant and table validation

Preserved server-minted, revocable codes and tenant/branch/table resolution. The guest never supplies a trusted restaurant or branch ID. Entitlement, restaurant/branch activation, QR mode, table activation and revocation remain enforced. A manually blocked table now also refuses guest ordering. Public order references remain unguessable capabilities and expose customer-safe data only.

Tests cover revocation/regeneration, cross-tenant and cross-branch isolation, tampering, disabled restaurants/branches, entitlement changes and rate limits. Existing paid order status remains readable after its QR code is revoked.

## 4. Mobile screens and recovery

Menu, cart, checkout and status use browser history. Cart and submission identity survive refresh; payment returns restore the same order. Network failures preserve the saved order reference, expose a retry action and do not create another order. Missing scripts and React render failures show a visible recovery screen. Requests terminate with an actionable connection error rather than indefinite loading.

Real compiled guest app passed Chromium mobile emulation at 360, 375, 390, 412 and 430 px, plus 844 px landscape, without document overflow. Buttons and quantity controls have at least 44 px targets. Physical Android/iPhone testing is outstanding.

## 5. Shared menu and availability

QR continues to use the existing published menu snapshot, modifiers, taxes and branch overrides. Owner changes become public after **Publish to guests**; draft edits are not silently published. Names/descriptions configured in English, Hindi or Gujarati survive publication and can be selected in the guest menu. Search, category and dietary filters work together. Uploaded image URLs use the existing image service.

Live availability now hides deleted/archived/unavailable dishes, disabled categories, QR exclusions and branch exclusions. Checkout and quote bypass the short availability cache and fail closed if availability cannot be checked.

**Severity: High. Affected:** guest menu/checkout. **Expected impact:** a recently sold-out or removed dish cannot be ordered through a stale page.

## 6. Cart, customization and quote integrity

Required/optional modifier rules, quantity limits, item notes and server pricing remain authoritative. Different variants of the same dish now have distinct order-line identities, retaining the underlying menu item ID; downstream merges no longer collapse them into one line.

Quotes now carry their published menu version. Checkout refreshes the quote when that version changes and submits the version of the amount actually displayed. An older async quote cannot replace a newer quote. Submission is latched before React renders and the attempt key is saved before sending the request.

**Severity: High. Affected:** guest cart, QR order creation and downstream KOTs. **Expected impact:** variants retain their choices and quantities; a menu refresh cannot silently substitute a different charge for the displayed amount.

## 7. Order creation and idempotency

Reused `OrderSyncService.ingestServerOrder`, its per-order advisory lock, sequencing, audit and realtime publication. Existing idempotency keys remain restaurant/code scoped. Replays return the original order before repricing against a later menu. Cash orders enter the existing operational lifecycle; online orders enter as `DRAFT` with payment pending.

Concurrency tests prove one order/payment attempt for duplicate submissions, unique numbering, 100 concurrent guest orders, 50 retries of one order and isolation across simultaneous tables/restaurants.

## 8. Payment choices and commission

Cash is offered only when configured. Online is offered only when configured, the payment connection is ACTIVE, and gateway credentials plus the webhook verification secret are present. The existing Razorpay payment service and tables handle hosted checkout; no second payment system was added.

**QR orders have zero kiosk commission:** commission basis points and platform amount are zero, and restaurant amount equals the collected amount. The earlier kiosk-only fee and Route-pending/manual-payout policy are preserved.

## 9. Mobile UPI and return flow

Hosted Razorpay Payment Links provide the customer checkout entry. The browser follows an HTTPS provider URL and returns to the same public order reference. Callback/query parameters do not mark an order paid. The server verifies payment independently.

Provider request/return fields follow the [official payment-link creation API](https://razorpay.com/docs/api/payments/payment-links/create-standard/) and [official SDK reference](https://github.com/razorpay/razorpay-node/blob/master/documents/paymentLink.md). Actual provider checkout UI and switching to installed UPI apps were **not** tested by the simulator.

## 10. Payment failure and ambiguous responses

Continue/check/retry operate on the existing order. If link creation times out, recovery looks up the original unique provider reference rather than issuing a fresh payment reference. Provider-confirmed expired/cancelled links permit another attempt; an unknown attempt is not treated as proof that nothing was created.

A signed payment received before the creation response returns—or before that response fails—wins over pending/failed writes. Payment settlement is serialized and late failures cannot downgrade a settled payment.

**Severity: High. Affected:** QR checkout and shared payment settlement. **Expected impact:** fewer duplicate-charge risks and no false pending/failed state overwriting verified payment.

## 11. Webhook verification and missed-webhook recovery

Retained raw-body HMAC verification, durable event deduplication and exact reference/amount/currency checks. Only verified captured payment releases the existing draft. A missing webhook can be recovered from an independently fetched provider link with matching identity, amount, currency and captured payment; polling a browser success parameter is insufficient.

Tests prove invalid signatures and wrong signed amounts cannot admit an order, replay does not advance the order twice, and provider reconciliation recovers a missed event. Automated tests used disposable QA secrets and no live payment credentials.

## 12. POS integration

Actual built POS receives the same QR order, item/modifier and total. The cashier browser test settled the existing cash QR bill for INR 299 once. Online drafts show a payment-pending explanation and cannot offer **Settle Cash** or a premature void action. Backend sync also rejects device attempts to edit or release an unpaid online QR draft.

**Severity: High. Affected:** POS order list and backend sync. **Expected impact:** the cashier cannot locally declare an online payment complete or collect cash over the pending online attempt.

## 13. KOT and KDS integration

Reused the existing order catch-up, realtime wake-up and KOT generation. A draft generates no KOT. Verified payment changes that same order to the configured admitted status, increments its sequence and wakes existing consumers. Stable line/ticket identities prevent replayed payments from duplicating tickets.

The actual KDS browser received one cash ticket, returned Ready to the customer, received no online ticket before payment, then received exactly one ticket after two copies of the signed paid webhook. Paid QR totals/quantities cannot be rewritten by subsequent device sync.

## 14. Customer order status

Payment pending is distinct from received/preparing/ready/completed/cancelled. Payment verification and kitchen status are displayed separately. Existing five-second status checks are serialized, do not apply after unmount, stop for terminal states and respect the owner's status-display setting. Returning focus checks status promptly.

Kitchen Ready was observed on the customer screen through the real backend. No new WebSocket or parallel order-status transport was introduced.

## 15. Table lifecycle

The existing floor sync associates admitted QR dine-in orders with their table. An unpaid draft does not occupy a table. A table remains occupied if one of several QR orders completes while another remains active. Existing active Captain orders and blocked tables are preserved. Known table IDs take priority over number matching, avoiding collisions between branches.

Four new tests cover draft admission, multiple orders, preserving Captain/blocked tables and branch identity; the existing table synchronization suite also passed.

## 16. Receipt and historical accuracy

Guest details include restaurant/branch identity, table, reference, date, immutable items/options/notes, subtotal, tax, discount, total and payment state. Paid receipts can be printed/saved. Receipt currency and identity survive a later QR/context failure.

The browser test changed the published coffee price from INR 120 to INR 160; the menu updated on focus while the earlier paid receipt retained INR 120. No physical printer was exercised.

## 17. Changed APIs and database use

Existing describe/menu/quote/order/status routes were extended. Added `POST /api/v1/public/qr/orders/:publicOrderId/payment` for explicit payment continuation/recovery. Admin settings now accept online payment preference and admin order views include the payment method.

Reused `SyncedOrder`, `Order`, `PaymentTransaction`, existing settings, QR codes, menu snapshots and sync/event tables. **No Prisma schema change or new migration is required.** Gateway completion is recorded separately from durable operational admission.

## 18. Files affected

| Area | Files |
|---|---|
| Guest routing, recovery, menu/cart/payment/receipt | `apps/qr-guest/vite.config.ts`, `nginx.conf`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/api.ts`, `src/styles.css` |
| QR API/settings/menu/admin integration | `cloud/api/src/modules/qr/qr-public.service.ts`, `qr-menu.service.ts`, `qr-settings.service.ts`, `qr-admin.service.ts`, `qr.controllers.ts`, `qr.module.ts` |
| Shared payment and order admission | `cloud/api/src/modules/payments/payments.service.ts`, `razorpay-gateway.service.ts`, `cloud/api/src/modules/order-sync/order-sync.service.ts` |
| Published translations | `cloud/api/src/modules/menu-publications/menu-snapshot.ts` |
| Owner controls and table matching | `apps/restaurant-system/pos-admin/src/cloud/qrAdminClient.ts`, `components/qrconsole/QrConsole.tsx`, `components/tables/FloorTablesModule.tsx` |
| Cashier pending-payment controls | `apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx` |
| Existing floor lifecycle | `packages/database/src/repositories.ts`, `packages/sync/src/floor_sync.ts` |
| Local launch/documentation | `package.json`, `RUN_SERVERS.md` |
| Verification | `cloud/api/test/qr-mobile-payments.e2e.spec.ts`, `qr-ordering-saas.e2e.spec.ts`, `tests/qr_table_lifecycle.test.ts`, `tooling/qa/browser-qr-mobile-flow.cjs`, `run-qr-mobile-api-tests.cjs`, `browser-audit-server.cjs` |

Earlier menu completeness changes already present in this workspace were preserved. Unrelated concurrent edits were not reset.

## 19. Verification results and measurements

| Check | Result |
|---|---|
| Complete QR/payment/regression API run | 184 tests passed across 12 files |
| Quote/version regression after its final change | 80 tests passed across 3 files |
| Final focused payment/security/race tests | 13 tests passed; includes two added cases beyond the original 184-test run |
| Guest cart, QR propagation/desk and table unit tests | 40 tests passed across 5 files |
| Built guest + actual POS/KDS browser flow | 18 checks passed; zero uncaught guest/KDS exceptions |
| Cloud API, guest, POS, Restaurant Admin, KDS and Captain builds | Passed |
| Root TypeScript project check and diff whitespace check | Passed |

This is **186 distinct API test cases**, not a sum of overlapping reruns. The gateway is simulated. Execution summary and final payment cases: [VERIFICATION_RESULTS.json](VERIFICATION_RESULTS.json). Browser evidence and exact steps: [BROWSER_RESULTS.json](BROWSER_RESULTS.json), [screenshots](evidence/), [PERFORMANCE_SUMMARY.json](PERFORMANCE_SUMMARY.json).

Latest browser measurement: 27 successful public API requests; local p50 **32.94 ms**, p95 **71.39 ms**, maximum **80.37 ms**. Signed online-payment delivery through to the visible KDS ticket took **311.93 ms**, including the browser assertions. These are isolated-machine observations, not AWS latency guarantees. The scale suite separately exercised 100 simultaneous orders, 500 menu reads, duplicate submissions and PostgreSQL realtime delivery across API instances.

Consistency expectations: guest kitchen status normally catches up within the existing five-second check plus network time; focus checks sooner. Open menus check publication every 60 seconds and on focus. Availability reads can cache for five seconds, but quote/checkout always read fresh. Owners must publish draft menu changes. A checkout refresh replaces the displayed quote; a submission against a changed price is refused for review.

## 20. Deployment and remaining verification

On the deployment host, use the normal release workflow to publish these changes, then rebuild/recreate the affected services with the correct public origin:

```sh
docker compose up -d --build backend qr-guest pos pos-admin captain kds kiosk-user
```

This command was **not executed against production**. Confirm `PUBLIC_ORIGIN`, `QR_ORDER_BASE_URL`, gateway credentials and webhook secret without exposing their values. No new permission or real payment was exercised from this workspace.

After deployment, an existing generated QR should load `/q/assets/` with HTTP 200. Validate an owner-published menu, cash checkout, one supervised online transaction on real Android/iPhone, actual UPI app return/cancel, matching webhook/captured amount, one POS/KDS order, status return, receipt and physical printing. Verify proxy/container health under production traffic. These checks require the deployed build and physical/provider environment and cannot be certified by local emulation.

**Confirmed problems addressed:** asset routing, missing online QR checkout, receipt/payment visibility, recovery/navigation races, duplicate variant identities, stale checkout availability, pending-online cashier actions, checkout version/amount race and QR table association.

**Likely environment risks to inspect after release:** an older deployed image or stale HTML, unset public origin, or an inactive/misconfigured payment connection. These are conditional checks, not claims that current production configuration is wrong.

**Needs further verification:** live release, physical phones/UPI/provider behaviour, printer output and AWS latency/capacity. The result is not a claim of 10/10 production readiness or that every possible platform issue has disappeared.

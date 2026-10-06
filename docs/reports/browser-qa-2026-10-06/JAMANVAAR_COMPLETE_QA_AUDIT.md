# JAMANVAAR COMPLETE QA AUDIT

**Date:** 2026-10-06. **Release decision: NOT READY.** Twelve confirmed findings: five Critical, two High, four Medium and one Low. No application, configuration, schema or business-logic fix was applied in this discovery audit. Only QA scripts and reports were added.

This is a substantial local browser audit, **not certification that every page control or every requested functionality passed**. All 38 inventoried protected Super Admin routes and 27 Restaurant Admin navigation entries were rendered; POS/Captain/KDS/Kiosk/QR views are listed below. Functional assertions, unexecuted scenarios and blocked dependencies are separated explicitly. Existing production issues cannot be attributed quantitatively to AWS without deployed telemetry.

## Environment and evidence quality

Playwright Chromium with real application UI, compiled Nest AppModule, actual PostgreSQL migrations/RLS, device signatures, real auth guards and locally captured OTP. Isolated database jamanvaar_browser_test_1791252294420, two newly created QA restaurants, two branches for A and one for B, issued role PINs and branch-bound activation keys. Existing port 4000 and user data were not modified. LAN core was absent: cloud-only fallback was exercised. Main apps used local Vite; Restaurant Admin fleet loop and merged Kiosk Admin activation were also tested with a production bundle. Gateway QR/refund delivery was simulated with a throw-away secret; actual application webhook signature/amount/idempotency logic was retained. SMTP, AWS, WhatsApp and external fetches were disabled in the corrected harness.

**Harness incident:** an early Prisma import reloaded developer environment values after initial gateway sanitization, permitting one unpaid real-provider QR creation. No customer charge, real refund or bank transfer was completed. The audit API was stopped, Prisma import moved before sanitization and nonlocal fetches blocked. Subsequent payment/refund tests used the explicit local simulation. The interruption is accounted for in the reviewed matrix; affected original Captain assertions are PARTIAL. This incident is not presented as a production application bug.

Raw attempts: 170 (118 PASS, 52 FAIL); distinct named scenarios after deduplication: 138. Reviewed outcomes: {"PASS":100,"PARTIAL":14,"HARNESS_ERROR":11,"FAIL":13}. A raw FAIL can be a selector/response-field mistake or interrupted harness; it is not one bug. A raw PASS can cover only a narrow equality. [Reviewed cases](TEST_MATRIX.csv), [every attempt disposition](ATTEMPT_DISPOSITIONS.csv), [unexecuted scenarios](UNEXECUTED_SCENARIOS.csv), [route/view coverage](COVERAGE_MATRIX.csv), and [observed control inventory](CONTROL_INVENTORY.csv) preserve that distinction.

## Applications, views and completed functional coverage

| Application | Local URL | Views visited | Functional actions executed | Disposition / limits |
| --- | --- | --- | --- | --- |
| Super Admin | localhost:5180 | 38 protected route patterns rendered; owner detail fixture block resolved; login/OTP and /dashboard alias also exercised. | Onboarding A/B, auth, payment approval, negative commission step-up, EOD skip, injected 503 retry. | PARTIAL; most destructive/admin mutations and positive commission edit not executed. |
| Restaurant Admin (POS Admin + merged Kiosk Admin) | localhost:5176; production localhost:5286 | 27 main navigation entries; inventory/purchasing subtabs; four QR tabs; production activation. | Menu/category/staff/table/GST/customer creation, price sync, CSV, bank request, gross/fee/net, supplier/delivery/count, QR publish, auth recovery. | FAIL; B001/B002/B007–B010. Separate Kiosk Admin is retired, not an extra untested deployment. |
| POS | localhost:5175 | 11 primary billing/operation tabs; five settings subtabs and print queue. | PIN auth, hold/recall, KOT, ready, running cash settlement, 20 sequential sales, 30 sequential KOTs, zero-float shift close, offline queue, QR acceptance, refund permission probe. | FAIL; B002/B004/B005. All billing variations and hardware not certified. |
| Captain | localhost:5177 | Mobile My Tables, Orders, Food Ready, Messages, More; three More tools and connection settings. | Correct/denied role PIN, table selection, price visibility, KOT creation, kitchen-ready notification, eventual table release, offline/reconnect. | PARTIAL; final Captain order DB truth confirmed; original flow assertions interrupted. Modifiers, amendment, split/transfer, messaging and all role tools not certified. |
| KDS | localhost:5179 | Active, Cooking, Ready, Served, Expo; Main Kitchen/All Stations/Switch Station. | PIN auth, real POS/Captain/QR tickets, ready propagation, 30-ticket recovery, paid/unpaid kiosk contrast, restart reconnection. | FAIL; B003/B006. Multi-station simultaneous load, recall, priority, sound and every item-level transition not certified. |
| Kiosk | localhost:5174 | Activation, welcome, language selection, takeaway menu/item/cart/payment/confirmation. | Owner price sync, unavailable gateway fallback, simulated capture/signatures/duplicate callback, receipt, unpaid admission. | FAIL; B002/B003/B006/B011. Dine-in, all languages, all modifiers, accessibility, cash acceptance and real QR payments not certified. |
| QR guest (additional discovered surface) | localhost:5190 | Invalid URL, menu/cart/checkout/status in a mobile viewport. | GST18 quote, double-click order and refresh idempotency, cashier acceptance, KDS ready → same guest status; invalid quantities/reference. | PARTIAL; supported tested chain passed, full public abuse/rate/security matrix not certified. |

## Confirmed problems

| ID | Severity | Affected apps | Confirmed problem |
| --- | --- | --- | --- |
| B001 | Critical | Restaurant Admin | Idle production dashboard creates a kiosk-fleet request storm |
| B002 | Critical | POS, Kiosk, Restaurant Admin, QR guest (comparison) | Configured tax, displayed payable, gateway amount and receipt disagree |
| B003 | Critical | Kiosk, KDS, POS | Paid kiosk customer confirmation does not deliver a kitchen ticket |
| B004 | Critical | POS, KDS, Restaurant Admin | SEND KOT followed by Instant Bill creates a second order |
| B005 | Critical | POS, Payment backend | Cashier can invoke a refund without server-verified manager approval |
| B006 | High | Kiosk, KDS | Unpaid online checkout appears in the kitchen before cash acceptance or capture |
| B007 | High | Restaurant Admin, Inventory consumers | Inventory master definition does not reach another activated admin |
| B008 | Medium | Restaurant Admin | Newly created stock item is missing from the current inventory list |
| B009 | Medium | Restaurant Admin | Cash reconciliation dashboard asserts a float and reconciliation without a shift |
| B010 | Medium | Restaurant Admin | Revoked cloud owner session silently removes navigation without sign-in recovery |
| B011 | Low | Kiosk | Kiosk auto-print path dereferences an absent printer |
| B012 | Medium | Super Admin, Merged Restaurant Admin | Provisioning instructions send kiosk owners to the retired standalone admin |

### B001 — Idle production dashboard creates a kiosk-fleet request storm

- **Severity / confidence:** Critical; CONFIRMED in the isolated environment.
- **Apps / role / page:** Restaurant Admin; Restaurant Owner. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Activate the merged production Restaurant Admin with the QA KIOSK_ADMIN key; leave the dashboard idle for 10 seconds.
- **Expected:** One initial fleet fetch and the configured 30-second refresh interval.
- **Actual:** 1316 GET fleet responses in 10 seconds, with no user action. Development also produced 2,734 calls in a 32.7-second observation.
- **API / request / result:** GET /api/v1/devices/me/fleet. Authenticated branch device; no body. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [production-idle-fleet.json](production-idle-fleet.json), [evidence/production-admin-fleet-storm.png](evidence/production-admin-fleet-storm.png), [evidence/failure-adminprod-1791253679880.png](evidence/failure-adminprod-1791253679880.png), [network.jsonl](network.jsonl). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/restaurant-system/pos-admin/src/App.tsx:550`, `apps/restaurant-system/pos-admin/src/hooks/useEntitlements.ts:77`. Line numbers refer to the audited working tree.
- **Root cause:** useEntitlements returns a new hasApp function every render. The fleet effect depends on that function and immediately fetches; setKiosks triggers the next render and restarts the effect.
- **Operational impact:** Unbounded background traffic multiplies auth and database work. This is a concrete code-level contributor to shared API pressure; its contribution to AWS latency cannot be measured locally.
- **Recommended fix / expected impact:** Stabilize the entitlement function and effect dependency; preserve the existing refresh policy; cancel obsolete fetches and keep one in-flight refresh.
- **Regression checks / risk:** Idle production build, entitlement changes, kiosk-only keys and navigation: bounded call counts, no missed legitimate fleet changes.


### B002 — Configured tax, displayed payable, gateway amount and receipt disagree

- **Severity / confidence:** Critical; CONFIRMED in the isolated environment.
- **Apps / role / page:** POS, Kiosk, Restaurant Admin, QR guest (comparison); Cashier / Customer / Owner. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Owner creates a GST18 group and a ₹100 dish. Add it in POS, Kiosk and guest QR. Separately pay for the unassigned-tax ₹299 dish through the simulated kiosk gateway and inspect its receipt.
- **Expected:** Identical configured tax and amount across cart, authoritative quote, payment, order and receipt; components reconcile to total.
- **Actual:** GST18: POS and Kiosk display ₹105; Kiosk backend and QR guest quote ₹118. For the unassigned-tax ₹299 dish, Kiosk displays ₹314 but charges ₹299. Receipt shows subtotal ₹299 + CGST ₹7.48 + SGST ₹7.48 + round ₹0.04, yet total ₹299. Final SyncedOrder tax is 1,496 paise while the primary payment Order tax is zero.
- **API / request / result:** POST /api/v1/payments/orders; POST /api/v1/public/qr/:token/quote; POST /api/v1/orders; GET /api/v1/orders/sync. items: [{ menu item id, quantity: 1 }]; owner tax group CGST 9%, SGST 9%; money in integer paise at API boundaries. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [evidence/pos-gst18-cart.png](evidence/pos-gst18-cart.png), [evidence/kiosk-ui-vs-payment-amount.png](evidence/kiosk-ui-vs-payment-amount.png), [evidence/gst18-kiosk-unpaid-amount.png](evidence/gst18-kiosk-unpaid-amount.png), [evidence/qr-customer-authoritative-tax.png](evidence/qr-customer-authoritative-tax.png), [evidence/failure-kiosk-1791253956137.png](evidence/failure-kiosk-1791253956137.png), [database-verification.json](database-verification.json). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `packages/business/src/pricing.ts:74`, `apps/restaurant-system/pos/src/store/posStore.ts:311`, `apps/kiosk-system/kiosk-user/src/App.tsx`, `cloud/api/src/modules/payments/pricing.util.ts`, `packages/business/src/central_reporting_service.ts:358`. Line numbers refer to the audited working tree.
- **Root cause:** The shared frontend cart defaults to 5% without applying the menu item tax-group reference in these paths. Server menu-snapshot pricing follows configured tax instead. Receipt/sync metadata is not constrained to that authoritative quote. The exact subsequent writer that changed SyncedOrder tax was not isolated.
- **Operational impact:** Customers see one amount and are asked to pay another; tax receipts and reports can disagree with the actual collected amount.
- **Recommended fix / expected impact:** Use the same item-aware pricing contract at every consumer and snapshot the authoritative quote. Validate subtotal − discount + tax + charges + round-off = total. Preserve legitimate zero tax.
- **Regression checks / risk:** Zero, 5%, 18%, inclusive tax, mixed baskets, modifiers, discounts, round-off, cash/online, refunds, reports and offline resync all reconcile; paid snapshots stay immutable.


### B003 — Paid kiosk customer confirmation does not deliver a kitchen ticket

- **Severity / confidence:** Critical; CONFIRMED in the isolated environment.
- **Apps / role / page:** Kiosk, KDS, POS; Customer / Kitchen Staff. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Use cloud sync only, with no LAN core. Capture a simulated kiosk payment using the real signature validator. Wait for confirmation and check KDS by the same external order id/token.
- **Expected:** Exactly one durable kitchen ticket containing the paid item, visible without refresh.
- **Actual:** Customer confirmation and successful payment persist; two tested paid kiosk orders become COMPLETED with PENDING kitchen items. K104 remains absent from KDS after a 15-second wait and after reopening. Cloud existence alone did not prove kitchen delivery.
- **API / request / result:** POST /api/v1/payments/razorpay/webhook; POST /api/v1/payments/:id/kot-claim; POST /api/v1/payments/:id/fulfilled; GET /api/v1/orders/sync. Valid simulated captured-payment event, duplicate same event, external order id retained; provider and delivery are simulated only. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [evidence/kiosk-simulated-paid-confirmation.png](evidence/kiosk-simulated-paid-confirmation.png), [evidence/kds-kiosk-paid-ticket.png](evidence/kds-kiosk-paid-ticket.png), [evidence/failure-kds-1791253941089.png](evidence/failure-kds-1791253941089.png), [database-verification.json](database-verification.json). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/kiosk-system/kiosk-user/src/App.tsx:1379`, `apps/kiosk-system/kiosk-user/src/App.tsx:1392`, `packages/sync/src/outbox.ts:435`. Line numbers refer to the audited working tree.
- **Root cause:** finalizePaidOrder settles the local order before kitchen fulfilment; settlement marks it COMPLETED. The cloud kitchen projector excludes COMPLETED orders. A local KOT/fulfilled acknowledgement can therefore precede remote kitchen availability.
- **Operational impact:** A customer can pay and receive confirmation while kitchen staff never see the order.
- **Recommended fix / expected impact:** Separate payment settlement from kitchen lifecycle; persist/acknowledge kitchen delivery before treating fulfilment as successful. Ensure cloud fallback works without LAN.
- **Regression checks / risk:** Cloud-only and LAN modes, duplicate callback, kiosk crash before/after capture, late capture, restart and reconnect: one paid order and one KOT, no lost dishes.


### B004 — SEND KOT followed by Instant Bill creates a second order

- **Severity / confidence:** Critical; CONFIRMED in the isolated environment.
- **Apps / role / page:** POS, KDS, Restaurant Admin; Cashier. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Add a dish; SEND KOT; invoke Instant Bill for that running cart. Compare persisted external ids and payment statuses.
- **Expected:** Settle the existing running order and preserve its kitchen item identities.
- **Actual:** Two backend orders persist: the original PREPARING/PENDING and a new COMPLETED/SUCCESS order with the same dish. Reproduced again with a clean single-item cart. Unique external-id constraints do not prevent this business duplicate.
- **API / request / result:** POST /api/v1/orders (two different externalOrderId values). Same cart item/quantity; first operation SEND KOT, second Instant Bill CASH. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [data-consistency.jsonl](data-consistency.jsonl), [evidence/pos-running-kot-instant-bill.png](evidence/pos-running-kot-instant-bill.png), [evidence/failure-pos-1791254660924.png](evidence/failure-pos-1791254660924.png). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/restaurant-system/pos/src/store/posStore.ts:1581`, `apps/restaurant-system/pos/src/store/posStore.ts:1649`. Line numbers refer to the audited working tree.
- **Root cause:** executeInstantBill unconditionally creates an order instead of resolving the runningOrderId already retained by SEND KOT.
- **Operational impact:** Orphan unpaid tickets, misleading open-order totals and possible duplicate preparation or reporting.
- **Recommended fix / expected impact:** Resolve and settle the existing running order; create a new order only when the cart has no running order.
- **Regression checks / risk:** Takeaway/dine-in, recalled cart, running KOT, repeat click and offline reconnect: one sale, one kitchen identity and one shift posting.


### B005 — Cashier can invoke a refund without server-verified manager approval

- **Severity / confidence:** Critical; CONFIRMED in the isolated environment.
- **Apps / role / page:** POS, Payment backend; Cashier. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Authenticate POS using the issued Cashier PIN. Call the published cloud refund client from the browser without a manager approval credential; request a one-paise refund on a simulated paid transaction.
- **Expected:** Server denies a cashier without refund permission or verified manager step-up.
- **Actual:** Refund API returned 201 and processed one paise through the simulated provider. Transaction changed to PARTIALLY_REFUNDED. No manager approval occurred. Device signatures are present but they do not establish the staff role.
- **API / request / result:** POST /api/v1/payments/:paymentId/refund. { amount: 1 paise, reason: QA permission probe, idempotency key }; signed POS device request, Cashier staff session. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [data-consistency.jsonl](data-consistency.jsonl), [evidence/cashier-refund-api-permission-probe.png](evidence/cashier-refund-api-permission-probe.png), [evidence/failure-pos-1791255595719.png](evidence/failure-pos-1791255595719.png), [database-verification.json](database-verification.json). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `cloud/api/src/modules/payments/payment-orders.controller.ts:118`, `cloud/api/src/modules/payments/payments.service.ts`, `cloud/api/src/common/guards/device-signature.guard.ts`. Line numbers refer to the audited working tree.
- **Root cause:** Refund route verifies device credentials, signature and device type, but does not enforce server-verified staff permission/manager approval. Client-supplied attribution cannot substitute for authorization.
- **Operational impact:** An operator with access to an activated POS can bypass the approval UI and initiate financial refunds. Real provider behaviour was not exercised.
- **Recommended fix / expected impact:** Require verified staff identity with refund permission or a bound, short-lived manager approval credential. Validate scope and transaction limits, and derive audit attribution server-side.
- **Regression checks / risk:** Cashier denied, authorized manager allowed, expired/replayed/other-branch approval denied, duplicate idempotency key refunded once, audit actor verified.


### B006 — Unpaid online checkout appears in the kitchen before cash acceptance or capture

- **Severity / confidence:** High; CONFIRMED in the isolated environment.
- **Apps / role / page:** Kiosk, KDS; Customer / Kitchen Staff. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Open a fresh GST18 kiosk checkout, choose online QR, never pay and never confirm Cash at Counter. Inspect the KDS ticket and database.
- **Expected:** Online payment pending stays outside actionable kitchen preparation until payment or explicit accepted cash workflow.
- **Actual:** Backend payment amount 11,800 paise, order CONFIRMED/PENDING and one visible KDS ticket after five seconds. Evidence explicitly records neverConfirmedCash=true.
- **API / request / result:** POST /api/v1/payments/orders; GET /api/v1/orders/sync. Fresh one-item online checkout; no successful callback or cash confirmation. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [data-consistency.jsonl](data-consistency.jsonl), [evidence/kds-unpaid-checkout-visible.png](evidence/kds-unpaid-checkout-visible.png), [evidence/failure-kds-1791255893848.png](evidence/failure-kds-1791255893848.png). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/kiosk-system/kiosk-user/src/App.tsx:1291`, `packages/sync/src/outbox.ts:435`. Line numbers refer to the audited working tree.
- **Root cause:** Checkout creates a CONFIRMED local order before payment; kitchen projection admits the confirmed order without checking this online-payment acceptance state.
- **Operational impact:** Kitchen may prepare abandoned, expired or unpaid orders.
- **Recommended fix / expected impact:** Publish actionable online kitchen work only on verified capture; use an explicit accepted cash-at-counter state for the intended cash flow.
- **Regression checks / risk:** Abandoned QR, cancel, expiry, failed payment, late capture and explicit cash confirmation: correct admission, cancellation and exactly-once ticket.


### B007 — Inventory master definition does not reach another activated admin

- **Severity / confidence:** High; CONFIRMED in the isolated environment.
- **Apps / role / page:** Restaurant Admin, Inventory consumers; Restaurant Owner / Stock Manager. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Create QA Cheese (10 kg, ₹100/unit) in owner UI; receive five kg and count-adjust stock. Open a second activated production Restaurant Admin for the same tenant/branch.
- **Expected:** Another device receives the stock definition and reconciles movements to the same balance.
- **Actual:** First device ultimately holds 18 kg and cloud has three movements. Cloud INVENTORY_ITEM definitions remain zero; second admin shows zero items. A reload on the original device restores its local record but does not prove cross-device persistence.
- **API / request / result:** GET /api/v1/entity-sync/INVENTORY_ITEM; inventory ledger pull/push. Create stock definition, receive +5 kg, adjustments +4 and −1 kg; second device same branch. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [database-verification.json](database-verification.json), [evidence/second-admin-stock-definition-missing.png](evidence/second-admin-stock-definition-missing.png), [evidence/qa-delivery-ledger.png](evidence/qa-delivery-ledger.png), [evidence/stock-count-corrected-saved-quantity.png](evidence/stock-count-corrected-saved-quantity.png). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `packages/database/src/repositories.ts:3270`, `packages/sync/src/inventory_ledger_sync.ts:135`, `apps/restaurant-system/pos-admin/src/App.tsx`. Line numbers refer to the audited working tree.
- **Root cause:** Definition creation mutates local storage without the observed cloud master-entity transport. applyRemote returns if an inventory definition is absent; movements alone cannot bootstrap a new device.
- **Operational impact:** Owners and terminals disagree on available stock, valuation and purchasing; a replacement device loses the inventory catalogue.
- **Recommended fix / expected impact:** Durably sync stock master definitions before replaying movements, with stable ids and tenant/branch scoping. Bootstrap and reconcile balances deterministically.
- **Regression checks / risk:** New device, offline definition creation, duplicate/out-of-order movements, stock count, delivery and replacement-device recovery all converge.


### B008 — Newly created stock item is missing from the current inventory list

- **Severity / confidence:** Medium; CONFIRMED in the isolated environment.
- **Apps / role / page:** Restaurant Admin; Restaurant Owner. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Create QA Cheese and inspect summary plus ingredient list immediately without leaving the screen; remount the view.
- **Expected:** Created stock item appears immediately in both summary and table.
- **Actual:** Summary shows one item and ₹1,000 value while the ingredient table shows zero/no ingredients. Remounting makes the item visible.
- **API / request / result:** Local inventory repository create; cloud gap separately tracked as B007.. One new raw ingredient; default filters. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [evidence/admin-inventory-populated.png](evidence/admin-inventory-populated.png), [evidence/inventory-after-remount.png](evidence/inventory-after-remount.png). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/restaurant-system/pos-admin/src/components/inventory/InventoryRecipesModule.tsx:54`, `packages/database/src/repositories.ts:3270`. Line numbers refer to the audited working tree.
- **Root cause:** Filtered inventory useMemo depends on the array identity; the repository unshifts into that same array, leaving the cached list stale.
- **Operational impact:** Owner may think saving failed and create duplicates or refresh unnecessarily.
- **Recommended fix / expected impact:** Use a changed collection/version when mutations occur, or recompute the filtered view on the actual mutation signal.
- **Regression checks / risk:** Create/edit/delete with active filters: immediate correct rows and summaries, no manual refresh.


### B009 — Cash reconciliation dashboard asserts a float and reconciliation without a shift

- **Severity / confidence:** Medium; CONFIRMED in the isolated environment.
- **Apps / role / page:** Restaurant Admin; Restaurant Owner / Cashier. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Inspect dashboard before any shift exists; confirm POS says no active shift and cloud contains no shift.
- **Expected:** Show no active shift/unreconciled state and no invented opening cash.
- **Actual:** Dashboard claims 100% reconciled and a ₹2,000 cashier float. Later an actual zero-opening shift is persisted correctly, showing that the dashboard default is not evidence of cash truth.
- **API / request / result:** GET /api/v1/entity-sync/SHIFT; dashboard local aggregation.. Empty shift collection, then zero-opening QA shift for comparison. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [evidence/owner-no-shift-reconciliation.png](evidence/owner-no-shift-reconciliation.png), [evidence/owner-actual-shift-ledger.png](evidence/owner-actual-shift-ledger.png), [evidence/pos-qa-shift-closed.png](evidence/pos-qa-shift-closed.png). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/restaurant-system/pos-admin/src/components/dashboard/NeedsAttentionSection.tsx:200`. Line numbers refer to the audited working tree.
- **Root cause:** openingCash || 2000 substitutes a fabricated float for missing or zero values; the dashboard treats absence of variance as reconciliation evidence.
- **Operational impact:** Owner receives misleading financial assurance and cannot trust the dashboard cash position.
- **Recommended fix / expected impact:** Represent no-shift, open, uncounted and reconciled states explicitly; preserve zero with null-aware defaults and calculate only from persisted cash counts.
- **Regression checks / risk:** No shift, zero float, open shift, short/over cash and closed shift: honest status and exact ledger amounts.


### B010 — Revoked cloud owner session silently removes navigation without sign-in recovery

- **Severity / confidence:** Medium; CONFIRMED in the isolated environment.
- **Apps / role / page:** Restaurant Admin; Restaurant Owner. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Observe an owner session rejected by refresh/applications APIs, while local admin session remains signed in.
- **Expected:** Visible session-expired/reconnect state with a clear login recovery action.
- **Actual:** Refresh/applications return 401; owner remains on Dashboard while Menu/Kiosk navigation disappears, with no useful expired-session prompt. Explicit logout/login recovers; three subsequent clean reloads pass.
- **API / request / result:** POST /api/v1/tenant-auth/refresh; GET /api/v1/tenant/me/applications. Existing local session with rejected cloud refresh. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [evidence/owner-refresh-failure-before-login.png](evidence/owner-refresh-failure-before-login.png), [evidence/owner-clean-session-reloads.png](evidence/owner-clean-session-reloads.png), [database-verification.json](database-verification.json). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/restaurant-system/pos-admin/src/hooks/useEntitlements.ts:48`, `apps/restaurant-system/pos-admin/src/App.tsx`. Line numbers refer to the audited working tree.
- **Root cause:** Entitlement error becomes an empty app list while local login state remains active. Why refresh reuse occurred under interrupted audit sessions is not proven as a normal production defect.
- **Operational impact:** Owner can misinterpret auth failure as a missing plan/module and remain stuck.
- **Recommended fix / expected impact:** Distinguish auth failure, network failure and a genuinely empty entitlement list; surface re-authentication while preserving appropriate local work.
- **Regression checks / risk:** 401, revoked token, offline startup, valid empty plan and repeated normal reloads; retain reuse detection and validate refresh coordination separately.


### B011 — Kiosk auto-print path dereferences an absent printer

- **Severity / confidence:** Low; CONFIRMED in the isolated environment.
- **Apps / role / page:** Kiosk; Customer / Owner. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Complete simulated kiosk payment on a fresh device with no configured printer; inspect console.
- **Expected:** Clear pending/unavailable printer state without a TypeError.
- **Actual:** Console records Auto print dispatch error: TypeError: Cannot read properties of undefined (reading 'name'). Customer confirmation remains visible; actual printing is blocked by absent hardware.
- **API / request / result:** Local proceedToConfirmation / PrinterService; no physical print was tested.. No active printer on an activated kiosk. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [console.jsonl](console.jsonl), [evidence/kiosk-simulated-paid-confirmation.png](evidence/kiosk-simulated-paid-confirmation.png). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `apps/kiosk-system/kiosk-user/src/App.tsx:1487`. Line numbers refer to the audited working tree.
- **Root cause:** getActivePrinter may return undefined and the code immediately uses activePrn.name.
- **Operational impact:** No-printer startup produces avoidable runtime errors and ambiguous receipt-delivery feedback.
- **Recommended fix / expected impact:** Guard absent printer and show accurate queued/unavailable/delivered states.
- **Regression checks / risk:** No printer, offline printer, failed dispatch, successful physical receipt and duplicate dispatch.


### B012 — Provisioning instructions send kiosk owners to the retired standalone admin

- **Severity / confidence:** Medium; CONFIRMED in the isolated environment.
- **Apps / role / page:** Super Admin, Merged Restaurant Admin; Super Admin / Restaurant Owner. Local app URLs are listed in the coverage table; page-specific screenshot and raw case URL identify the view.
- **Preconditions:** isolated QA tenant/branch, activated device and relevant role; fixture/provider context described in the steps.
- **Steps:** Open the real QA restaurant detail and read Hardware & Terminal Activation Keys instructions. Compare with the successfully activated merged production admin.
- **Expected:** KIOSK_ADMIN keys route the owner into Restaurant Admin according to the plan, as the user specified.
- **Actual:** Restaurant detail says a KIOSK_ADMIN key must instead be entered at a separate Kiosk Admin console (local default :5173). That surface is retired; the same key actually activated merged Restaurant Admin at :5286 in the production browser test.
- **API / request / result:** GET /api/v1/restaurants/:id; presentation-level app URL and provisioning instructions.. No mutation; actual restaurant detail browser snapshot and production activation response compared. Status distributions are retained in API_PERFORMANCE_MATRIX.csv; exact failed/pass assertion is in TEST_MATRIX.csv.
- **Evidence:** [evidence/super-route--restaurants-c5f75d1f-915e-4a3d-953b-a787fd76364f.json](evidence/super-route--restaurants-c5f75d1f-915e-4a3d-953b-a787fd76364f.json), [TEST_MATRIX.csv](TEST_MATRIX.csv). Console warnings/errors are in console.jsonl; API records omit authorization headers and request bodies. A screenshot alone is not backend proof.
- **Affected files:** `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx:918`, `cloud/super-admin-web/src/lib/appUrls.ts:9`, `cloud/super-admin-web/src/pages/Onboarding/OnboardRestaurantPage.tsx:592`. Line numbers refer to the audited working tree.
- **Root cause:** Super Admin retains standalone Kiosk Admin URLs and instructions after the actual admin workflow was merged.
- **Operational impact:** Owners can follow onboarding instructions to a deleted app or believe they need a different console.
- **Recommended fix / expected impact:** Point KIOSK_ADMIN provisioning and copied onboarding messages to merged Restaurant Admin, with plan-specific wording.
- **Regression checks / risk:** POS_ADMIN and KIOSK_ADMIN keys both follow the current merged flow; every displayed/copied app link matches deployed routes.

## Likely problems — separate from reproduced bugs

- **Medium, POS:** temporary KOT-sent success state can survive into a fresh cart. The 30-ticket browser sequence waited for exact SEND KOT and took about 90.56 seconds; code retains a three-second success label. A targeted fresh-cart stale-label interaction is still needed before calling it a confirmed lost-click bug.
- **High, reports:** central_reporting_service uses `cgstAmount || fallback5Percent` and corresponding SGST logic. Legitimate zero values can be replaced. Code risk confirmed; complete dated report reconciliation with zero/mixed tax was not executed.
- **Medium, Inventory:** supplier and recipe master transport may have the same local-only gap as stock definitions; second-device browser proof currently covers stock definitions only.
- **Medium, load time:** production Restaurant Admin bundle reported approximately 5,456.87 kB raw / 3,293.35 kB gzip. Slow-WAN startup impact needs a throttled profile; bundle size alone is not a measured loading failure.
- **Low/Medium, React lifecycle:** POS PosHeader and Admin KioskDisplaySettingsPanel emitted update-during-render warnings. No additional complete application crash was established. Review state notification side effects before expanding this into a confirmed user-visible failure.

## Needs further verification

- Real AWS API latency attribution: DB query/lock/pool waits, CPU/memory, connection limits, ALB timing and deployed Nginx SSE settings. Repository proxies contain SSE buffering/timeout provisions; deployed equivalence was not verified. No confirmed DB pool exhaustion.
- Normal owner refresh rotation across tabs/processes: six refresh-reuse audit events occurred during interrupted QA sessions. Three clean reloads passed after login. B010 confirms missing recovery UX; it does not prove normal production refresh always reuses a token. Keep token-reuse protection.
- SSE multi-instance PostgreSQL relay, device revocation/plan expiry during active streams, long idle/network soak and complete conflict/out-of-order replay. POS/KDS actual isolated API restart reconnection passed.
- Hourly reporting window/time-zone boundaries, all statement exports, post-refund ledger reconciliation, historical commission snapshots after a successful future rate change, full payout marking and bank-reference audit.
- Physical print/cash drawer, real SMTP/WhatsApp/Route/UPI, real refund provider states, full concurrent restaurant peak and every individual control action.

## Where delay was actually observed

Owner price change persisted in 205.7 ms, reached POS in 279.6 ms and Kiosk in 293.6 ms in one local observation. [Measured complete POS flow](realtime-flow-timeline.json): 1620.63 ms to backend ACK; 1667.44 ms to kitchen visibility; Ready update 132.77 ms to ACK and 450.44 ms to POS; cash settlement 4182.49 ms to cloud observation (includes assertion polling). Simulated paid-kiosk confirmation was observed in about 4.518 s; kitchen delivery remained absent after 15 s. The latter is a lifecycle correctness failure, not merely a slow stream. The strongest reproduced load source is B001 fleet loop generated 1316 idle production fleet calls/10 s. These samples cannot split time into SQL, AWS or WAN stages.

[API performance matrix](API_PERFORMANCE_MATRIX.md) classifies every captured non-streaming API group using the requested diagnostic thresholds, with counts/statuses/payloads/errors and separate middleware timings. Intentional negative authorization, offline injection, gateway-unavailable 503 and normal stream closure are identified, not counted indiscriminately as defects.

## Cross-app and database truth

| Flow / entity | Observed truth | Consistency status | Delay / stale-data policy |
| --- | --- | --- | --- |
| Owner price → POS/Kiosk | ₹249 → ₹299 persisted and shown on both customer/cashier views without refresh. | PASS for price; tax separately FAIL | Backend 205.7 ms, POS 279.6 ms, Kiosk 293.6 ms from action; sequential local observations, not production p95. |
| Captain → DB → KOT → KDS → Ready → POS/cash → Captain table | One final Captain order, ₹314, SUCCESS/CASH/COMPLETED; table released; original intermediate assertions partly interrupted. | PARTIAL original chain; final DB truth PASS | Continuous initial Captain delivery not fully timed; no claim that every intermediate step passed. |
| Measured POS → DB/KOT → KDS → Ready → POS/cash | Same external id, dish and amount through creation, ready and one cash settlement. | PASS targeted complete chain | 1620.63 ms action→API ACK; 1667.44 ms action→KDS; 132.77 ms Ready→ACK; 450.44 ms Ready→POS; 4182.49 ms cash→cloud observation. |
| Paid Kiosk → DB → KDS | Paid primary order and customer confirmation, but kitchen projection absent. | FAIL B003 | Still absent after 15 seconds/reopen. Unacceptable for a confirmed paid order. |
| Unpaid Kiosk → KDS | CONFIRMED/PENDING order visible before cash approval/capture. | FAIL B006 | One actionable ticket after five-second observation; cooking unpaid checkout is unacceptable. |
| GST18 pricing | ₹100 item: POS/Kiosk 105 vs backend/QR guest 118. | FAIL B002 | Financial mismatch is never an acceptable eventual-consistency window. |
| QR guest → POS accept → KDS Ready → guest status | One guest reference/id, one accepted ₹118 GST18 order and one correct kitchen ticket; guest status READY. | PASS targeted chain | Eventual guest READY observed; precise full-chain timing not instrumented. |
| SEND KOT → Instant Bill | Two distinct orders for one basket; old unpaid preparing order survives. | FAIL B004 | Business duplicate persists; zero duplicate external ids does not make this correct. |
| Inventory definition / movements | First device has 18 kg; three movements cloud-side, zero definitions, second admin zero items. | FAIL B007 | No observed convergence; missing stock masters cannot be accepted as normal delayed sync. |
| Cash shift | Opening 0, cash sales 314, expected/count 314, close variance 0, owner SHIFT payload matches. | PASS targeted ledger; dashboard no-shift FAIL B009 | Explicit cloud reconciliation performed; not a full financial report audit. |
| Kiosk fee/collection before refund | Gross 59,800 paise; fee 1,794; net/pending 58,006; paid 0; MANUAL/Route PENDING. | PASS pre-refund snapshot | Only simulated kiosk collections included. ₹580.06 is owed/pending, not transferred. |
| Refund probe | Cashier refund processed 1 paise; old commission snapshot remains 300 bps. | FAIL permission B005; snapshot preservation observed | Post-refund complete payout/statement reconciliation not executed. Do not reuse the pre-refund summary as current truth. |
| Tenant/branch isolation | B cannot read A tested master/orders; A2 shares menu but not A1 floor/orders; unscoped DB sees zero orders. | PASS specific negative probes | Security result covers tested resources only; not blanket permission certification. |
| Offline KOT → reconnect | One local pending KOT, no cloud copy offline; one cloud copy after reconnect and refresh. | PASS targeted short outage | Local acknowledgement must remain pending until cloud durable; long outage/conflict matrices not executed. |
| SSE recovery | Actual 200 text/event-stream; device auth survives isolated API restart. | PASS restart test; brief browser-offline reconnection PARTIAL | POS reconnect 7.095 s, KDS 8.435 s includes 1.8 s down time and API startup; no post-reconnect kitchen-loss permission. |

## Scorecard

PASS means an individually named assertion passed. PARTIAL means incomplete or narrow coverage; FAIL means at least one confirmed defect in that dimension; BLOCKED means a required dependency was unavailable. No whole application is certified PASS merely because its pages rendered.

| App | Functionality | Security | Performance | Usability | Offline/recovery | Data consistency |
| --- | --- | --- | --- | --- | --- | --- |
| Super Admin | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Restaurant Admin | FAIL | PARTIAL | FAIL | FAIL | PARTIAL | FAIL |
| POS | FAIL | FAIL | PARTIAL | PARTIAL | PARTIAL | FAIL |
| Captain | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| KDS | FAIL | PARTIAL | PARTIAL | FAIL | PARTIAL | FAIL |
| Kiosk | FAIL | PARTIAL | PARTIAL | FAIL | PARTIAL | FAIL |
| QR guest | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |

## Remaining test work and blocked dependencies

| Scope | Status | Reason / precise limit |
| --- | --- | --- |
| All views/controls | PARTIAL | Route and control inventories completed for visited screens; a large number of CRUD, delete, undo, bulk actions, form variants and disabled-state transitions remain unexecuted. CONTROL_INVENTORY is not an action-pass matrix. |
| Peak operations | PARTIAL | 20 sequential cashier sales and 30 sequential KOT submissions were executed. Simultaneous 20 cashiers/30 active kitchen workflows/multiple Captains/kiosks were not executed. |
| AWS performance/infrastructure | BLOCKED | No deployed logs/credentials/ALB metrics or reproducible sanitized live trace; all timing measurements are local. |
| Real UPI/Route/refund/bank payout | BLOCKED | Provider simulation after initial harness incident; Route is pending, QA bank unverified; no real customer charge, refund or bank transfer. |
| Physical printer and drawer | BLOCKED | No connected printer/drawer; queue/failure screens observed but paper output and drawer pulse not tested. |
| SMTP/WhatsApp delivery | BLOCKED | OTP captured locally; real delivery and WhatsApp provider integration unavailable. |
| Full finance lifecycle | PARTIAL | Default 3% snapshot and negative step-up checks passed; positive rate edit, overrides, approved-bank EOD creation, mark-paid, payout/refund races and post-refund statement reconciliation untested. |
| Complex ordering | PARTIAL | Modifiers, combos, coupons, inclusive/mixed tax, partial/split payments, table transfers/merges, cancellation/void approval and all refund states untested. |
| Resilience/security | PARTIAL | Single API restart, short offline queue, two-tenant/branch probes passed. Multi-API relay, long outage/soak, expiry during active SSE, backup restore and simultaneous edit/conflict resolution untested. |
| Responsive/accessibility | PARTIAL | Unauthenticated 390×844 gates plus Captain/QR mobile workflows observed; keyboard/screen-reader, all devices, touch misclicks and every page viewport not certified. |

## Release gates / recommended order

1. P0: fix request storm, canonical pricing/receipts, paid kitchen delivery, running-order duplicate billing and server refund authorization; rerun the complete owner→customer→cashier→kitchen→report chain with the same ids and amounts.
2. P1: prevent unpaid kitchen admission and sync inventory definitions/ledger bootstrap; verify two physical devices and cloud-only recovery.
3. P2: correct stale inventory UI, cash dashboard truth, auth recovery and merged-admin onboarding links; complete stock/shift/report financial reconciliation and role workflows.
4. P3: no-printer state, success-label clarity, console warnings and measured WAN startup improvements.
5. Before release, execute untested controls/complex ordering, simultaneous peak/soak, deployed AWS instrumentation, real payment sandbox/Route prerequisites and physical hardware verification.

[Fix plan](FIX_PLAN.md), [product audit](JAMANVAAR_PRODUCT_AUDIT.md), [missing/unfinished capabilities](MISSING_FEATURES.md), [role recommendations](ROLE_BASED_RECOMMENDATIONS.md), [UX friction](UX_FRICTION_REPORT.md) and [reproduction guide](QA_REPRODUCTION.md) complete the handoff. This audit stops before application fixes as requested in the attached discovery briefs.

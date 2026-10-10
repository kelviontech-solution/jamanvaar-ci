# QR Ordering implementation and verification — 10 October 2026

## Result and scope

Both supplied QR Ordering briefs were implemented in the existing QR guest application and Restaurant Admin console. QR_ORDERING remains a canonical, independently configurable entitlement. A QR-only subscription with Restaurant Admin access can publish a menu, manage tables and printed codes, accept orders, collect counter payments and complete orders without a POS terminal.

This work is local. Production, real provider credentials and customer funds were not modified. Unrelated assets and earlier workspace changes were preserved.

## Architecture audit and changes

The public application is `apps/qr-guest`, at `/q/:token`. Restaurant Admin's existing QR entry renders `QrConsole`; Super Admin's existing plan/application workflow controls `QR_ORDERING`. Explicit subscription application selections support QR plus administrative access without granting a POS terminal entitlement. Existing bundled subscriptions are preserved.

The backend resolves the opaque code into the restaurant, branch and table. Published canonical menu snapshots supply dishes, categories, branch prices, visibility, modifiers, tax groups and quantity constraints. Live availability is checked again at submission. The server calculates prices in integer paise; browser prices never authorize a charge.

`OrderSyncService.ingestServerOrder` creates one canonical operational order shared with licensed POS, KDS and Captain devices. Online orders remain DRAFT until verified payment admission. Cash orders follow the configured manual/automatic preparation workflow while payment remains due. QR Admin operates these same records and publishes branch-scoped realtime events. Payments reuse `Order`, `PaymentTransaction`, `Refund`, settlement locks and reconciliation. There is no second menu, order, licensing or accounting database.

Gaps addressed: quotes/analytics incorrectly consuming order-submission limits; hosted payment handoffs; four-section console with read-only orders; missing schedule/capacity rules, partial branch inheritance, design customization and filtered analytics; reloads inflating scans; uneditable cart choices; switches snapping back during save; and concurrent settings/code creation races.

## Customer experience

- Compact branded mobile menu, search/clear, categories, canonical images, descriptions and dietary indicators.
- Required variants, optional modifiers, quantity/selection limits and item notes. Required choices remain usable when optional add-ons are disabled.
- Editable cart choices and notes, server-quoted per-item and final totals, refresh recovery and unavailable-item handling.
- Guest checkout requests only configured information. Table codes fix the table; enabled modes/payment methods determine visible choices. Checkout refreshes current rules, methods and availability.
- Official in-page Razorpay checkout before confirmed-order UI. Dismissal retains the pending order; retry reuses its provider order.
- Confirmation separates payment from real kitchen progress. Ready/completed reflect order/item transitions. Counter orders show the amount due. Receipts use the saved order snapshot.
- Accessible item-selection dialogs, focus handling and Escape. Mobile/tablet overflow checks run against compiled apps.

## QR Admin

Nine sections: Overview, Menu & Availability, Tables & QR, QR Design Studio, QR Orders, Payment Settings, Ordering Rules, Analytics and QR Settings.

Overview retains today's activity and adds date/branch-filtered analytics. Menu & Availability previews canonical visibility/exclusion reasons, changes branch availability and publishes the current catalog. Table controls include creation, rename, on/off, generation, sequential bulk generation, regeneration, disable/enable, revoke and printing. Regeneration/revocation warn about existing printed materials.

QR Orders provides search, branch/status filters, refresh, optional new-order sound, details/history and legal prepare/ready/complete/cancel actions. Counter collection requires confirmation and records authenticated actor, amount, timestamp and audit information. Actions require the current order version and shared order lock. Paid cancellation uses the existing authorized Billing refund workflow.

Payment Settings separates online and counter switches, safe gateway readiness/mode, actual attempts and payment instructions. Server secrets and existing Super Admin collection approval remain authoritative. Unsupported gateways are not advertised.

Ordering Rules supports restaurant defaults, partial branch overrides/reset, restaurant-timezone hours, overnight intervals, temporary pause/resume, modes, minimum amount, preparation estimate, concurrent capacity, per-window limits and customer instructions. Input validation, save feedback and unsaved-rule warnings are included. Backend enforcement is authoritative.

Restaurant-wide QR administration requires a current signed OWNER session bound to the requesting device. Branch managers cannot select another branch or restaurant-wide scope. The scope extension is limited to QR and related menu administration; unrestricted entity sync is not granted.

## QR Design Studio

Nine styles: minimal white, premium restaurant, modern colorful, cafe, fine dining, family restaurant, casual dining, takeaway and table number card. Controls cover style, accent, instruction, footer, logo visibility, card/tent/label layout, individual tables and a branch.

Preview, SVG, 1920×2580 PNG, print/PDF and bulk print-ready HTML share one renderer and each active table's exact destination. Exported logos are embedded. Decoration stays outside the black-on-white QR and four-module quiet zone. Saved designs also apply to table printing. Bulk export is a print-ready HTML set; browser Print provides Save as PDF.

All nine designs were rasterized and decoded to their exact QR URL in tests. Physical printing, scaling, lighting and camera checks remain deployment checks.

## Payment verification and recovery

Fresh attempts use Standard Checkout. Existing hosted attempts retain their saved mode/reference; `QR_PAYMENT_CHECKOUT_MODE=HOSTED` supports compatible hosted operation. The integration follows [Razorpay's Standard Checkout server verification guidance](https://razorpay.com/docs/server-integration/python/test-app/).

Provider orders are created server-side for the saved amount, currency and reference. Only public checkout parameters reach the browser. SDK success requires HMAC validation against the stored provider order and independent authenticated lookup of the exact captured payment ID, order, amount and currency. An authorized-only payment does not admit an order.

Webhooks verify the exact request body. Standard webhooks without payment notes map through the stored provider order. Repeated callbacks/webhooks settle once. Polling recovers captured payments after browser loss. Ambiguous create timeouts recover the same reference rather than create another charge attempt; bounded provider-history recovery refuses unresolved outcomes.

A Standard Checkout order cannot be independently switched by the guest to cash because provider orders cannot be atomically cancelled alongside cash collection. UI and backend prevent this race. Existing cancellable hosted attempts retain safe fallback behavior. Staff can reconcile ambiguous outcomes using the existing financial workflow.

The supported provider is Razorpay, not Cashfree. UPI app selection depends on provider/merchant activation, browser/device and installed apps. Tests simulate provider transport while retaining real backend HMAC, amount, RLS and transaction checks; they do not prove live UPI collection.

## Analytics definitions

- Scans/menu views: deduplicated per code, signed browser session and restaurant day. These measure opened pages, not camera scans that never reach the website.
- Item additions: observed add actions; cart/checkout sessions are deduplicated. Aborted requests or blocked analytics can undercount.
- Accepted orders/value: exclude DRAFT, cancelled, voided and fully refunded status; unpaid counter orders are included.
- Gross paid sales/collected: canonical paid order value, including collected counter bills and captured online payments, before refunds.
- Refunds: successful canonical refund records, with full-refund metadata fallback, capped at original collection. Refunds belong to the original order cohort, matching shared dashboard accounting.
- Net sales: gross paid sales minus successful partial/full refunds. Outstanding counter value is separate.
- AOV: accepted order value/count. Conversion: accepted orders/menu-view sessions; repeat orders can exceed 100%.
- Actual transaction states drive payment counts; scoped orders/events drive trends, popular items and per-table/QR-version performance.

Date filters explicitly use UTC calendar boundaries; opening schedules use restaurant timezone. Money accumulates in paise before display conversion. Preparation times are configured estimates, not fabricated kitchen predictions.

## Database and APIs

Additive migration: `cloud/api/prisma/migrations/20261010000000_qr_module_rules/migration.sql` adds nullable `QrSettings.rules`, `QrSettings.overrides`, `QrBranding.printDesign` and a restaurant/branch settings index. Existing tokens, orders and flags remain intact. Old branch rows without override metadata preserve their previous complete-row behavior; new changes inherit individual defaults.

Settings/reset/code creation serialize within tenant transactions. Capacity enforcement runs inside canonical admission. Recent unpaid drafts reserve capacity for 30 minutes; this does not automatically cancel orders or declare external payments expired.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/public/qr/:token/events` | Validated signed-session cart/checkout/item observations |
| `POST /api/v1/public/qr/orders/:id/verify-payment` | Server-verified Standard Checkout result |
| `POST /api/v1/restaurant/qr/orders/:id/action` | Versioned operation/counter collection |
| `GET /api/v1/restaurant/qr/analytics` | Validated date/branch metrics |
| `POST /api/v1/restaurant/qr/settings/inherit` | Restore branch defaults |
| `GET/PUT /api/v1/restaurant/qr/print-design` | Saved print customization |

Existing public/admin routes remain compatible. Menu previews reject cross-branch scope; availability updates preserve price overrides.

## Files changed

Customer: `apps/qr-guest/index.html`, `src/App.tsx`, `src/api.ts`, new `src/checkout.ts`, `src/styles.css`.

Administration: `apps/restaurant-system/pos-admin/src/App.tsx`, `cloud/cloudClient.ts`, `cloud/qrAdminClient.ts`, `components/qrconsole/QrConsole.tsx`, new `QrAdvanced.tsx`, `qrPrint.ts`.

API: QR public/admin/controller/settings/rate limiter and new rules module; device guard, menu publication, canonical order sync, payments and Razorpay gateway; Prisma schema/migration; environment example and compose checkout-mode configuration.

Verification: QR module/rules/SDK/design tests, legacy hosted fixture update, isolated browser runner/provider harness and this report's evidence/results.

## Verification

Final result: **178 API tests, 19 client tests, seven compiled-app browser scenarios and three production builds passed**. The final browser run has no page errors.


Exact final counts and scenarios are saved beside this report in `API_RESULTS.json`, `CLIENT_RESULTS.json`, `BROWSER_RESULTS.json` and `BUILD_RESULTS.json`. Tests use a dedicated database with actual authentication, tenant RLS and transactions. Browser QA uses compiled applications and simulated provider transport, without real charges.

Coverage: QR-only/bundled licensing, independent guests, duplicates, tenant/branch/owner scope, inheritance, schedules/pause/minimum/modes, concurrent capacity, unavailable dishes, menu versions/modifiers, collection, legal/stale actions, invalid signatures/capture mismatches, webhook recovery/deduplication, partial refunds, analytics, print decoding and shared POS/Captain/Kiosk/QR/KDS convergence.

Screenshots are automated browser evidence. No manual phone, printer or live merchant-payment session has been claimed.

## Deployment and rollback

1. Back up the database and inspect pending Prisma migrations. Validate the intended release in staging. QA received equivalent additive schema alignment; its migration ledger can still report older pending migrations. Production migrations were not run.
2. Apply canonical release migrations with `npm run prisma:deploy --workspace=@jamanvaar/cloud-api`; generate Prisma Client and build the API. Apply schema before starting the new API.
3. Set compose `PUBLIC_ORIGIN`, `QR_ORDER_BASE_URL` to the bare public origin, and frontend build `VITE_CLOUD_API_BASE_URL`. Maintain existing `/q/` and `/api/` proxy routes. Guest production builds intentionally need the API build variable.
4. Keep `QR_SESSION_SECRET` stable across replicas. Configure server-only `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and collection approval. Use staging test credentials and confirm webhook reachability. Never place secret keys in Vite configuration.
5. Default `QR_PAYMENT_CHECKOUT_MODE=STANDARD`. Deploy API, Restaurant Admin and QR Guest together. Revalidate HTML; hashed assets remain cacheable. Check existing printed codes, QR-only/bundled accounts and branch scopes.
6. Verify real-device UPI app selection, dismissal/failure, capture, refresh, kitchen completion and physical printing before declaring the live integration verified.

Rollback restores previous app/API artifacts while retaining additive columns/data. Known attempts retain their saved mode; changing environment does not rewrite provider orders. Reconcile in-flight payments before operational changes. Dropping columns would discard saved rules/designs and is unnecessary for application rollback. Printed codes need no regeneration solely for this release.

## Practical limits

Credentials retain the existing platform collection model; no duplicate merchant credential store was added. Additional gateways, scheduled future-order booking, automatic kitchen-load prediction, customer accounts and ZIP archives are not exposed as working features. Ordinary order access retains existing opaque capability/restaurant retention behavior. Runtime availability depends on entitlement, active branch, catalog, QR rules and real provider readiness.

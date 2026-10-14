# QR Admin verification record

See [REPORT.md](REPORT.md) for findings, page results and additions recommended for restaurant owners.

## Environment

- Current local workspace, dated 14 October 2026.
- Static production bundles from the previous fix verification, serving unchanged public assets from the repository.
- Standalone QR Admin: `http://localhost:5316/qr/admin/`.
- Actual compiled Nest API: `http://localhost:4011`.
- Isolated PostgreSQL test database; production database was not used.
- Chromium/Chrome through Playwright.
- External payment/messaging transport blocked or captured locally. Signature/auth/RLS/ledger/application code remained real.
- QR optional entitlements were temporarily enabled on the test tenant through the existing entitlement config, not by bypassing frontend gates. [Fixture helper](fixture-capabilities.cjs) validates the database is a test database and saves original configuration for restoration.

## Page and UI coverage

[Main page sweep](browser-pages.cjs) visited these pages through their real standalone URLs:

Overview, QR Orders, Service Requests, Menu & Availability, Tables & QR, QR Design Studio, Customer Branding, Payment Settings, Ordering Rules, Pickup Scheduling, QR Settings, Advanced Features, Analytics, Menu Performance.

Advanced subsections: Translations, Promotions, Feedback, Alerts, Collections, License. Feature controls are included in Advanced Features, making 20 distinct page/section states.

Each was captured at desktop 1440×960, tablet 768×1024 and phone 390×844, for both the base-license and temporarily licensed optional-feature configuration: **120 captures**. The refined optional-feature-enabled matrix contains no horizontal document overflow, duplicate IDs or unnamed visible buttons. Closed details and hidden off-canvas controls were excluded from the refined checks.

## Committed functional browser checks

The following **25 distinct positive scenarios** passed after correcting harness selectors, waiting for actual save responses and including feature entitlements. Their raw logs also contain initial harness failures; only final classified outcomes are counted here.

| Area | Passed scenarios |
| --- | --- |
| Base console — 9 | Mobile menu focus/Escape; menu search/no results; category+item draft save/publication; invalid CSV blocking; branding persistence/sample preview; ordering-rule persistence; table PNG preview/download; design save/SVG download; reversed-date error/branch view. |
| Optional features — 9 | Service settings save/restore; pickup lead save/invalid slot rejection; translation save/reload; promotion create/API pause; branch counted stock save/restore; ledger load; Feedback render; Alerts render; License render. |
| Deep flows — 4 | Sidebar unsaved warning/Keep editing; customer service request acknowledge/start/complete; partial cash collection retaining debt; real menu-performance CSV export. |
| Authentication — 3 | Sign out/sign in reuses activation; missing recovery identity blocked; wrong password visibly denied. |

Scripts: [base features](browser-features.cjs), [advanced features](browser-advanced.cjs), [deep flows](browser-deep-flows.cjs), [authentication](browser-auth.cjs), [final corrected checks](browser-final-checks.cjs).

The partial-cash browser test initially had an overbroad test name mentioning a refund. It only collected ₹25 and verified the remaining debt. The script name was corrected and this report does **not** count a browser cash-refund action as passed. Refund coverage below comes from backend tests.

## Defect reproduction

[Order-limit test](browser-order-limit.cjs) created 61 temporary historical records on the isolated tenant, including an old unpaid READY bill. The default response returned 50 rows, an explicit larger limit returned 66, and the old pending bill disappeared from the UI Ready filter. Records were removed in `finally`.

Other observations in [observations.jsonl](evidence/observations.jsonl) record actual browser outcomes:

- Browser Back loses unsaved branding without warning.
- Sidebar navigation loses unsaved translation/promotion fields without warning.
- QR preview lacks a dialog role; PNG generation still succeeds.
- Order details leaves focus outside and does not close with Escape.
- Invalid preparation-time save returns 400 and reloads the old value.
- A ₹199 partially collected bill has ledger values ₹25 collected / ₹174 remaining, while quick confirmation asks for ₹199. The dialog was cancelled.
- Phone menu height 13,954 px; Analytics 2,823 px; Advanced Settings 2,881 px on an 844 px viewport.

## Backend integration results

**96/96 tests passed** in this audit, with one worker and a dedicated test database:

```powershell
# Configure the existing secure test database/auth environment first.
npx vitest run --config vitest.config.ts `
  test/qr-menu-control.e2e.spec.ts `
  test/qr-operations.e2e.spec.ts `
  test/qr-module.e2e.spec.ts `
  test/qr-mobile-payments.e2e.spec.ts `
  test/qr-feature-request.e2e.spec.ts `
  --maxWorkers=1
```

Run from `cloud/api`. Never run these suites against a production database. The test harness enforces a test database and cleans up its own fixtures.

Coverage includes QR menu control, entitlement gates, feature requests, operations/service/pickup boundaries, branch/device isolation, group-session limits, workload, stock reservation concurrency, coupon limits, loyalty verification/redemption/earning/reversal, idempotent collections/refunds, partial balance safety, interrupted mobile checkout and server payment signatures. Bank/provider transport was mocked; real merchant acceptance remains unverified.

## Still not verified as browser business flows

- Fresh console activation, real email recovery/reset and administrator reassignment.
- Every category/item edit/delete permutation, uploaded photo validation, every CSV schema/error combination and all modifier/tax authoring paths.
- Every table regeneration/disable/revoke permutation through the UI; backend tests cover the operations and isolation.
- Real OS print dialog, physical table-card scan/readability, bulk multi-file browser download acceptance and printer output.
- Real Android/iOS UPI chooser/return, charges/refunds/payouts; actual SMTP/SMS/WhatsApp delivery.
- Actual mobile scheduled-pickup booking/handover, group ordering, loyalty, customer feedback and history restoration as complete browser journeys; backend coverage is recorded separately.
- Browser rollout across multiple simultaneous branches/devices, offline reconnect, every owner/manager permission state and peak queues.
- Current deployed HTTPS/proxy/service-worker/artifact state.

## Cleanup and artifacts

Original optional-entitlement configuration restored through the fixture helper. Temporary order-limit records deleted. Other audit-labelled menu/coupon/translation/service/partial-payment writes were confined to the existing QA tenant. Production application configuration and data were untouched.

Evidence includes screenshots/DOM snapshots, [PNG card](evidence/table-card.png), [SVG card](evidence/table-card.svg), [CSV export](evidence/menu-performance.csv) and JSONL action/observation logs. Credentials, private fixture state and captured OTP/email material remain in ignored local QA storage.

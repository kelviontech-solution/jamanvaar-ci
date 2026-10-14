# Browser audit fixes — 14 October 2026

This is the implementation follow-up to [REPORT.md](REPORT.md). The original report and its original evidence remain the baseline. All 28 confirmed findings have code changes; verification and external acceptance are distinguished below. Recommendations are tracked separately because an existing control, an implemented improvement and a real-device acceptance test are different outcomes.

## Confirmed findings

| Finding | Change | Relevant source / verification |
| --- | --- | --- |
| F01 | Dashboard pending order count and debt exclude drafts and fully collected balances. Accepted sales, collections, refunds and debt remain separate. | `cloud/api/src/modules/dashboard/tenant-dashboard.service.ts`; multi-branch dashboard regression inserts an unpaid draft and checks unchanged totals. |
| F02 | Screen, HTML, thermal text, PDF/email and WhatsApp bills distinguish collected money from the balance due. Pending cash says payment due at counter. Receipt printing does not create a collection. | `packages/ui/src/ThermalReceiptView.tsx`, POS `printerService.ts`, API notification receipt services; pending/partial/paid component tests, receipt delivery integration tests and PDF smoke. |
| F03 | Super Admin Vite asset base follows its router basename. Nested URLs can load and refresh under the root and `/admin`. | `cloud/super-admin-web/vite.config.ts`; [deep-link test](fix-super-deep-links.cjs). A real production proxy still needs deployment verification. |
| F04 | Header uses the authoritative selected branch name, code, ID and address, and displays loading while branch access resolves. | `AdminBranchWorkspace.tsx`, admin `App.tsx`; browser identity check. |
| F05 | Kitchen average uses recorded creation/readiness times for the selected station and restaurant date. Missing samples show no completed tickets instead of a seeded 14 minutes. | `KitchenKotModule.tsx`; browser metric check. |
| F06 | Captain shift summary uses actual assigned tables and zones, with an explicit no-assignment state. | `CaptainShiftStatsView.tsx`. |
| F07 | Tax configuration label no longer claims every restaurant uses 5% GST. | Admin tax/customization navigation. |
| F08 | Cash reports show actual counted shifts and variance; missing counts cannot display unconditional reconciliation. | `PosReportDocument.tsx`. |
| F09 | Startup and POS footer describe preparation/local-first billing; measured connectivity remains a separate control. Platform health describes API/database reachability accurately. | Shared startup, POS footer, Super Admin health page. |
| F10 | Kiosk sidebar All Menu clears category, dietary filter and search together. | Kiosk `App.tsx`; browser reset check. |
| F11 | Guest assistance is a compact non-blocking strip with accept/snooze. Acknowledged/resolved requests do not return as fresh alerts after sync. | Shared `GuestAssistanceStrip`, POS/Captain alert components and Captain store; focus, snooze and service-message tests. |
| F12 | Mobile admin header has a compact app selector with redundant identity/captions hidden on small screens. | `PosAdminHeader.tsx`; 390-pixel browser check. |
| F13 | Kiosk wording editor groups welcome, menu, cart, payment, receipt and assistance; technical keys are optional, with language override previews and scoped publication confirmation. | `KioskContentPanel.tsx`; screen-grouping browser check. |
| F14 | Connection page starts with guided cloud/optional branch-server setup. URL/PIN/recovery diagnostics are placed in optional sections. | `packages/ui/src/ConnectionPanel.tsx`. This probes a configured server; it does not claim browser LAN discovery. |
| F15 | Repeated branch pickers have unique generated IDs. | `AdminBranchWorkspace.tsx`; browser duplicate-ID check. |
| F16 | Print queue has dialog role/name, focus handling, named close control and Escape behavior, including nested job detail. | `PosPrintQueueModal.tsx`; browser keyboard check. |
| F17 | Kitchen station creation/edit controls have explicit accessible names. | `KitchenStationsPanel.tsx`; browser unnamed-control check. |
| F18 | Observed unnamed settings, quantity, close, back and station controls are labelled. | POS settings/customization/search, Kiosk navigation, Captain modifiers, KDS station pills; targeted tests/browser captures. This is not a claim that every possible hidden dialog state has been audited. |
| F19 | CRM empty/search states explain creating a customer or continuing as a guest. New accounts start with zero points instead of an invented grant. | `PosCustomersView.tsx`; browser guest action. |
| F20 | Purchasing empty state links directly to inventory and offers a return to receiving goods. | `InventoryControlModule.tsx`, admin inventory route; browser navigation check. |
| F21 | Empty coupons explain an example and channel review, with a create action. | Admin coupon page. |
| F22 | Empty combos explain that no deals are available and offer browsing individual dishes. | Kiosk menu. |
| F23 | Existing first ten background designs keep their assets and receive distinct palette/cuisine descriptions, with portrait/landscape previews together. | `welcome-builtins.json`, `KioskWelcomeScreenPanel.tsx`. |
| F24 | Download cards show a published version only when artifact metadata exists; otherwise no published release. Device/report version fallbacks no longer invent 1.0.0. | Admin downloads, platform device/report pages. |
| F25 | QR analytics defaults to restaurant timezone calendar dates; labels explain inclusive midnight boundaries and expose corresponding UTC instants. Backend converts both local date boundaries separately. | `qr-admin.service.ts`, `QrAdvanced.tsx`, QR client types. These are calendar-day filters, not the POS business-day cutoff. |
| F26 | Ticket-created, ticket-assigned and ticket-reply notification filters have distinct names. | Platform notification page. |
| F27 | Positive cash collection requires an active register shift. Instant Bill directs the cashier to Shift & Cash and preserves the cart. Zero-payable bills do not require a cash collection. Legacy unassigned cash is shown separately with a review path. | POS store, payment modal, Shift & Cash; no-shift and existing-checkout regressions. Historical collections are not silently backdated or collected twice. |
| F28 | PDFKit dependency restored; smoke generates paid receipt, pending receipt and backup PDFs. CI and final API container build run the smoke against packaged dependencies. | `tooling/qa/receipt-pdf-smoke.cjs`, API Dockerfile, quality workflow. Local PDFs pass; Docker is unavailable here, so an actual container build is not claimed. |

## Additional bugs found and corrected

- Order detail invented a kitchen event one minute after creation and a verified payment. Staff detail now uses a shared activity view backed by a restaurant/branch-authorized endpoint; offline fallback uses only recorded timestamps. It is connected to Restaurant/Kiosk Admin, POS, Captain and KDS details. Customer QR/Kiosk status routes retain their existing customer-scoped access.
- WhatsApp receipt text could call an unpaid cash bill paid. It now uses the authoritative payment ledger and exposes the outstanding balance.
- POS customization could retain options/quantity/notes from the previous dish. Opening a new dish resets state and requires valid selections.
- Filtering sold-out options could remove an entire required group and permit adding the dish without its required choice. Required unavailable groups remain visible and block submission; optional groups remain optional.
- Kiosk dish search depended on a physical keyboard. Touch search now opens a themed keyboard, and session reset clears the keyboard and previous search.

## Recommendations and remaining acceptance

| Recommendation | Implementation / remaining acceptance |
| --- | --- |
| R01 / R02 | Dashboard and receipt corrections above preserve canonical financial allocations and separate accepted debt from unpaid drafts. Existing reporting services remain authoritative. |
| R03 | Shared staff activity endpoint/view added. Shows recorded item events, attempts, collections and refunds; events missing timestamps are not invented. Historical data without recorded served timestamps cannot acquire a truthful historical time. |
| R04 | Existing device/config delivery diagnostics retained. Welcome publication shows actual command/config-version acknowledgement, pending and failure. Real device reconnect remains acceptance work. |
| R05 | Open-shift cash guard and legacy unassigned-cash review added. Manager reconciliation is explicit; automatic historical reassignment is not implemented. |
| R06 | Existing QR setup/payment readiness checks retained. Real merchant methods, webhook reachability and mobile UPI chooser/return still require provider acceptance; no test is fabricated from saved credentials. |
| R07 / R08 | Packaged PDF release gate and root/prefix nested-route browser regression added. Container and production proxy acceptance remain external checks. |
| R09 / R10 | Existing resumeable owner setup and persisted branch selection retained; branch identity/loading corrected. Branch-scoped navigation continues to require an accessible active branch. |
| R11 | Content publication adds explicit scope confirmation; welcome preview/publish and command acknowledgements retained. This is not a universal before/after diff for every restaurant setting. |
| R12 | Fleet comparison and selected-terminal overrides retained/clarified. Previous successful presentation can be restored into preview before publishing, scoped by restaurant/branch/device. Revert history is local to that admin browser, not a server-wide version archive. Physical two-kiosk acceptance remains. |
| R13 | Screen-based wording editor implemented. |
| R14 | CSV warns on unknown columns and accepts `gst_rate` as an explicit tax alias. Existing validation covers duplicate SKUs, numbers and supported photo values; actual photo URL availability remains a separate asset check. |
| R15 | Existing menu publication status and customer previews retained. Actual delivery to an offline fleet remains acceptance work. |
| R16 | Checkout reward choice now shows remaining points and estimated earning, with final-bill verification explained. Existing loyalty tests cover redemption, repeated visits, active/paused programs and duplicate settlement. Concurrent server redemption/refund acceptance must be assessed against the production ledger. |
| R17 | Search added for long combo/modifier lists, selected options stay visible, required/sold-out selection corrected, touch menu search added. Existing category/staff search retained. |
| R18 | Existing quick Billing/Orders/Tables/Collect workflow preserved; opening a shift is now an explicit cash prerequisite. |
| R19 | Non-blocking deduplicated alert with accept/snooze added. Existing server request ownership/progress retained. A fully configurable escalation policy is not added in this change. |
| R20 | Reported icon/dialog accessibility defects corrected. Targeted focus/Escape tests added; a complete keyboard audit of every nested dialog remains wider acceptance work. |
| R21 | Existing KDS density, bounded cards, station timing and TV controls preserved. Phone layout is checked. Physical TV/zoom and peak-queue acceptance remain. |
| R22 | Truthful kitchen averages and station workload implemented. |
| R23 | Actual Captain assignments shown and non-blocking guest workflow implemented. Existing table/handover controls retained; all transfer/merge/handover permutations are not proven by these checks. |
| R24 | Existing customer status/history restoration and outstanding balance preserved. No forced reopening of completed orders on ordinary menu entry. |
| R25 | Restaurant-time QR calendar analytics implemented. POS business-date reporting retains its configured cutoff; these scopes are labelled distinctly. |
| R26 | Existing entitlement gates and setup health retained; deployment failures and missing metadata now have explicit error states. No global redesign of every optional module's state machine is claimed. |
| R27 | Scoped settings summary and shortcuts added for tax, payment, receipts, devices and licensed products; unavailable product pages are excluded. |
| R28 | Super Admin now checks same-origin HTML entry/title and JavaScript/CSS reachability, plus release metadata. It explicitly does not claim browser execution or installer signature validation from a HEAD check. |
| R29–R31 | Purposeful empty states, compact mobile header and clearer background descriptions/previews implemented. |
| R32 | Receipt/payment and reported operational labels improved; technical statuses remain available in audit diagnostics. |
| R33 | Placeholder versions removed. Actual metadata availability is distinguished from a verified artifact download/signature. |
| R34 | Support form offers reviewed, sanitized branch/device/version/connection/queue context. Credentials, server URLs and customer data are excluded. |

## Verification

Verified on 14 October 2026:

| Check | Result |
| --- | --- |
| API multi-branch dashboard / receipt integration | **64/64 passed**, including canonical activity access restrictions and QR daylight-saving boundaries. |
| Dashboard at 10,000 added sales / 1,001 added devices | Exact aggregate totals; three idle-machine requests took **498 / 501 / 521 ms**. An earlier concurrent-build run exceeded five seconds; it was rerun without changing the limit. This is local performance, not a production benchmark. |
| Targeted browser financial/identity/layout/navigation checks | **7/7 passed**. |
| Touch menu search / canonical KDS history and phone layout | **2/2 passed**; no horizontal overflow or unnamed controls in the final KDS phone capture. |
| Super Admin protected nested routes, direct loads and refreshes under root and `/admin` | **176/176 passed**. These logged-out checks prove correct entry loading and auth redirection, not privileged business mutations on every page. |
| New audit regressions plus staff practice suite | **21/21 passed** (receipts/CSV, guest focus/snooze, cash guards, customization/keyboard, canonical balance, deployment asset validation, staff isolation). |
| Loyalty / modifier / service-message / welcome configuration suites | **75/75 passed**. |
| Existing cash checkout, running-order, sync, receipt and persistence suites | **60/60 passed** in the final run. Fixtures explicitly open a real register shift for normal cash cases; separate tests enforce rejection without a shift. |
| Additional canonical activity / deployment / receipt rerun | **7/7 passed**. |
| Final activity / cash guards / receipt / modifier rerun after last source adjustments | **24/24 passed**. |
| PDF generation | Paid receipt, pending receipt and backup PDFs generated from compiled API and installed production dependencies. |
| TypeScript / builds | API and all six affected frontend workspaces typechecked; Nest and Vite bundles built. Rebuilt POS/KDS after the last accessibility adjustment. Final QA bundles use an isolated API and serve unchanged public assets from the repository; this is not production deployment. |

Root suite counts above overlap where a regression was rerun; do not sum them as a unique test total. Reproducible entry points:

- [Targeted browser regressions](fix-browser.cjs)
- [Touch search and canonical KDS history checks](fix-additional-browser.cjs)
- [All platform nested routes under root/proxy prefixes](fix-super-deep-links.cjs)
- Root Vitest audit, checkout, loyalty, modifier, receipt and CSV suites.
- API Vitest multi-branch dashboard and receipt integration suites on an isolated test database.
- Backend TypeScript/Nest build and frontend TypeScript/Vite builds; build-size warnings remain, without compile failures.
- `node tooling/qa/receipt-pdf-smoke.cjs`.

Browser fixtures, authentication and keys remain in ignored local QA state. Evidence is sanitized. No production deployment, real bank charge, real customer message, signing-key change or privileged platform mutation was performed for these fixes.

## Remaining deployment and operational checks

Deploy the reviewed changes, then verify HTTPS/proxy paths and service-worker upgrade behavior on the actual host. Run the new container smoke gate in the release environment. Real UPI apps, SMTP/WhatsApp delivery, printers, native upgrades/data migration, LAN reconnect and simultaneous restaurant devices need their respective provider/hardware environments. Those limitations must not be represented as failed code fixes or as completed real-world acceptance.

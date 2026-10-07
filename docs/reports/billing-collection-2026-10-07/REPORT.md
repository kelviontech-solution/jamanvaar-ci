# Kiosk counter payments, billing visibility and exports — 7 October 2026

Implemented in the workspace. Production deployment and AWS latency have not been verified.

## Correct financial behaviour

| State | Total order value | Collected revenue | Pending collection |
| --- | ---: | ---: | ---: |
| Existing paid orders | ₹5,116 | ₹5,116 | ₹0 |
| Customer confirms a ₹250 kiosk cash-at-counter order | ₹5,366 | ₹5,116 | ₹250 |
| Cashier collects ₹250 using POS “Settle Cash” | ₹5,366 | ₹5,366 | ₹0 |

Uncollected cash must remain distinguishable from money received. Draft and cancelled orders are excluded from these totals. Recorded refunds reduce collected revenue. Selecting an order source scopes the summary to that source; payment/status/search filters control the ledger and exports. Export summaries are calculated from exactly the exported rows.

## Confirmed problems and changes

| Problem / evidence | Severity | Apps / files | Fix and impact |
| --- | --- | --- | --- |
| The screenshot's ₹250 order is marked CANCELLED. Reports intentionally exclude cancelled and unpaid orders from collected sales. Billing had no separate accepted-order and pending-collection totals. | High | Kiosk; Admin `BillingInvoicesModule.tsx`; `billingLedger.ts` | Added Total Order Value, Collected Revenue and Pending Collection. New accepted kiosk orders become visible immediately without falsely recording cash as received. The earlier kiosk lifecycle fix prevents confirmation-screen reset from cancelling submitted orders. |
| POS's direct counter settlement wrote the payment locally but did not request an immediate outbox flush. | High | POS `PosOrdersView.tsx` | Flush after cash settlement or verified UPI reconciliation. The real browser test confirms the payment reaches the backend and Admin without waiting for the routine background cycle. Cancelled/refunded orders cannot use this cash action. |
| Billing and order history lacked a source filter. | Medium | Admin Billing and `OrdersModule.tsx`; shared `order_source.ts` | Kiosk-only views in both modules, alongside POS, QR Table, Captain and other sources. Preserve the originating source after POS settlement, including legacy kiosk token fallback. |
| Cash summary filtering matched only CASH, excluding CASH_AT_COUNTER; other tender aliases also differed. Paid tender counts included unpaid orders. | High | Admin `BillingInvoicesModule.tsx`; shared tender normalizer | Normalize cash/UPI/card aliases and exclude unpaid orders from paid tender counts. Pending Collection has its own filter. |
| PDF targeted the interactive table, which used only the current 25-row page. The existing hidden restaurant statement was not the export target. | High | Admin Billing; `BillingStatementDocument.tsx` | Print a dedicated A4 landscape statement with every filtered invoice, restaurant/branch identity, configured contact and tax identifiers, logo, date/filter scope, source, payment status, summaries and recorded GST. No guessed fixed GST rate. |
| Admin print CSS hides semantic headers and discourages table page breaks; both interfered with the statement layout. | Medium | Dedicated statement and print options | Keep the letterhead visible, allow the ledger to paginate, repeat table headings, retain individual rows, and apply 10 mm page margins. |
| JSON was an unnecessary competing export. CSV lacked the restaurant/source/payment-context details needed for reconciliation. | Medium | Admin Billing and `billingLedger.ts` | Removed JSON export. CSV includes identity, filter scope, source, payment/order status, pending amount, refunds and exact filtered rows. Preserve Unicode, sanitize spreadsheet formula fields and release the download object URL. |

## Verification

- POS and Restaurant Admin production builds passed. Existing bundle-size advisory remains.
- 44 distinct tests passed across eight root test files: collection accounting, billing, central reporting, business-day consistency, cashier workflow, print isolation and PDF identity.
- Eight Playwright checks passed using the compiled Kiosk, POS, KDS and Restaurant Admin with the real isolated local API/database and a disposable tenant. The ₹5,116 paid baseline is an explicit test fixture; the ₹250 order is submitted through the actual customer kiosk UI and settled through the actual POS UI.
- Browser assertions cover kiosk → KDS/POS/Admin, pending totals, source/payment filters, CSV content, absence of JSON export, counter settlement, duplicate prevention, kiosk order history, and PDF export beyond page one.
- The final PDF contains all 32 ledger records, the kiosk invoice, restaurant identity and branding. PDF extraction checks the actual saved artifact in addition to the browser DOM. See `PDF_VERIFICATION.json`.
- No uncaught browser exceptions. External font requests were intentionally blocked; a separate local-core health probe was unavailable in this cloud-sync test environment.

Evidence: `BROWSER_RESULTS.json`, `VERIFICATION_RESULTS.json`, `PDF_VERIFICATION.json`, and `evidence/` (pending/collected screenshots, kiosk CSV, branded statement PNG and actual PDF).

## Needs further verification

- Deploy the corresponding app bundles before expecting these changes on `system.kelviontech.in`. The kiosk lifecycle correction from the preceding task is also required to stop newly submitted orders being cancelled by the old confirmation reset.
- Historical orders already marked CANCELLED are not automatically revived or booked as collected cash. They need reconciliation against what was actually served and paid.
- Production SSE delivery, proxy/load-balancer behaviour, concurrent cashier settlement, physical printers and live provider payments were not exercised by this local cash-flow test. Local latency must not be presented as AWS latency.
- The partial-refund unit test uses a recorded refund amount. This task does not certify all legacy refund metadata or real provider refund reconciliation.

No API credentials, environment secrets or existing production records were changed by this QA run.

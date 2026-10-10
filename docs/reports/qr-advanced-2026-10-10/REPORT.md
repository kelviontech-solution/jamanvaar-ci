# QR advanced implementation and verification - 10 October 2026

## Implementation

The QR module continues to use the shared restaurant / branch / device / canonical order hierarchy. It does not introduce a separate kitchen order database or replace the existing subscriptions.

| Area | Implemented behavior |
| --- | --- |
| Shared ordering | Random table invitations, signed browser membership, contribution ownership, optimistic revisions, expiry, one host checkout and idempotent consolidation into one canonical order. Anonymous guest labels accompany the order. |
| Kitchen workload | Unfinished dish quantities from all order sources in the branch determine estimates and optional capacity refusal. Accepted orders are never automatically cancelled by this feature. |
| Customer loyalty | Optional verified-phone enrollment through the existing MSG91 integration, private balances, explicit reward selection, atomic points reservation, settlement earnings and refund/cancellation reversals in the existing CRM event ledger. |
| Languages | Reviewed dish/category translations, configurable default language, canonical item IDs/prices, fallback text and translation-aware menu ETags. |
| Promotions | Existing canonical coupon records, server pricing, eligibility, usage limits, optional verified-customer restrictions and configured menu recommendations. Coupons and rewards cannot silently stack. |
| Branch administration | Restaurant defaults, explicit local overrides, restoration of inheritance, preview/version checks for owner propagation, preservation of local overrides and branch-manager restrictions. |
| Feedback | One private response per completed order, rating summaries, branch isolation, date/rating filters and CSV export. Dates follow the existing QR analytics UTC convention. Reports are capped at the latest 500 matching responses. |
| Menu/inventory | Published price snapshots remain authoritative. Fresh availability is checked at checkout; visible pages refresh every 20 seconds and on focus. Optional counted QR portions reserve under the canonical admission lock and restore once on cancellation/full refund. Local imports do not consume those dish counts again; existing ingredient movement ledgers remain in use. |
| Payment allocations | Additive collection/refund ledger in integer paise, tenant RLS and composite canonical-order ownership. Partial counter collections, cash refunds, replay-safe references, remaining balance visibility and gateway reconciliation. POS acknowledges the exact remaining amount before completing a partly collected bill. |
| Alerts | Recoverable branch-scoped order/payment/refund attention records derived from canonical orders and confirmed allocation entries, configurable types and quiet hours. |
| History/receipts | Signed-browser order history, receipt recovery and reorder into a reviewable cart at current menu prices. No phone-number lookup exposes another customer's history. |
| Licensing | Thirteen optional QR capability flags extend the existing Feature/Plan/ApplicationEntitlement machinery. Features remain unavailable until licensed and enabled. Existing base ordering stays compatible. |
| Accessibility/data | Explicit control labels, touch targets, phone layouts, reduced-motion styling and a persistent text-only menu that avoids food-image requests. |

Restaurant Admin: **QR Table Ordering / Advanced Features**. Configuration, translations, promotions, feedback, alerts, collections and license usage have separate views. Branch stock and inheritance controls use the same current admin scope.

## Supported payment boundaries

Online checkout remains a full-bill, server-verified Razorpay Standard Checkout operation. The host accepts responsibility for the consolidated shared bill. Partial collections currently support physical cash received by authorized staff; customer online split-by-person payments are not offered. Independent guests may still place and pay their own orders. Refunds reuse the existing authorized manual refund workflow and confirmed refund records.

Abandoned online drafts can retain reward/portion reservations while a provider payment is still potentially payable. They must be reconciled before a safe cancellation; this implementation does not release a payable reservation on a blind timer or accept a client claim that money was collected. Counted QR portions are an optional availability extension; ingredient accounting and existing POS inventory movements have not been replaced by a new stock system.

Loyalty verification requires `MSG91_AUTH_KEY` and an approved `QR_LOYALTY_MSG91_FLOW_ID` whose OTP variable is `VAR1`. The transport uses the existing notification gateway; missing configuration leaves ordinary ordering available and verification explicitly unavailable. Provider reference: [MSG91 flow API](https://api.msg91.com/apidoc/textsms/send-sms-flow.php). Real SMS delivery and real funds have not been exercised in QA.

The optional Razorpay script can fail without replacing a healthy menu. The startup error screen now applies only to the application entry script; payment-script errors stay in the checkout flow. Collection and reward selectors have explicit accessible labels.

## Verification

Local verification passed:

- **276 API tests across 15 suites**, including branch isolation, all-source canonical order propagation, gateway verification/retries/refunds, partial cash/POS remainder acknowledgement, counted-stock races, concurrent reward reservation and capability enforcement.
- **82 shared/client tests across 10 suites**, including CRM loyalty, inventory, payment splits, QR-to-local imports and checkout SDK behavior.
- **13 compiled-app browser flows**, covering base QR-only administration, gateway dismissal/retry, cash collection, two independent phones, shared consolidation, translations, loyalty, coupons, feedback, receipt history and mobile text-only mode. No browser page errors.
- API, Restaurant Admin, QR Guest, POS, Captain and KDS builds succeeded. Existing large-chunk build warnings remain non-fatal.
- `git diff --check` passed. Phone menu, shared confirmation, text-only mode and desktop feedback screenshots were visually inspected.

The isolated load harness stored 100 concurrent same-table orders without collisions in 2.155 seconds and served 500 menu reads in 1.875 seconds. Its 120-order workload reported 64.7 orders/second, order p95 428 ms and menu p95 167 ms. These are local QA measurements, not production latency guarantees.

Evidence: [VERIFICATION.json](VERIFICATION.json), [BROWSER_RESULTS.json](BROWSER_RESULTS.json), and [screenshots](evidence/). API tests use only the dedicated QA database and real tenant RLS/authentication. Browser tests use compiled applications with isolated gateway/OTP transports and block external networking. No production records, live payments or real SMS were used.

## Deployment and rollback

This work is local and has not been deployed or pushed during this task. Apply pending migrations through the repository's normal `prisma migrate deploy` process after backing up the database, then deploy the rebuilt API, Restaurant Admin, QR Guest and affected device applications. The additive migration is `20261010120000_qr_order_payment_ledger`; the earlier QR rules migration is also required. The isolated QA schema was aligned directly for testing and its migration-history warning must not be mistaken for production deployment.

Do not deploy guest artifacts built with the QA API origin `http://localhost:5288`. Production builds must receive their production API origin. Enable optional capabilities in the existing plan/add-on controls, configure the desired branch settings and verify real merchant/SMS integrations before making them available to guests.

For an application rollback, keep the new ledger and its data. Disable optional QR capabilities and redeploy the previous application version. Do not drop confirmed money entries or reset customer balances/orders as a rollback shortcut. The collection-entry database trigger prevents rewriting entries; refunds append entries, while existing tenant deletion/retention policies still govern deletion.

# JAMANVAAR_PRODUCT_AUDIT

## Executive summary

**NOT READY.** Existing app breadth is substantial, and selected owner→cashier→kitchen→guest workflows succeeded, but five Critical release blockers affect shared API pressure, financial truth, paid kitchen delivery, duplicate sale identity and refund authorization. The product is not certified functionally complete, safe at peak or production-scalable by this local audit.

## Tested applications/pages/workflows

| Application | Local URL | Pages/views | Executed workflow | Limits |
| --- | --- | --- | --- | --- |
| Super Admin | localhost:5180 | 38 protected route patterns rendered; owner detail fixture block resolved; login/OTP and /dashboard alias also exercised. | Onboarding A/B, auth, payment approval, negative commission step-up, EOD skip, injected 503 retry. | PARTIAL; most destructive/admin mutations and positive commission edit not executed. |
| Restaurant Admin (POS Admin + merged Kiosk Admin) | localhost:5176; production localhost:5286 | 27 main navigation entries; inventory/purchasing subtabs; four QR tabs; production activation. | Menu/category/staff/table/GST/customer creation, price sync, CSV, bank request, gross/fee/net, supplier/delivery/count, QR publish, auth recovery. | FAIL; B001/B002/B007–B010. Separate Kiosk Admin is retired, not an extra untested deployment. |
| POS | localhost:5175 | 11 primary billing/operation tabs; five settings subtabs and print queue. | PIN auth, hold/recall, KOT, ready, running cash settlement, 20 sequential sales, 30 sequential KOTs, zero-float shift close, offline queue, QR acceptance, refund permission probe. | FAIL; B002/B004/B005. All billing variations and hardware not certified. |
| Captain | localhost:5177 | Mobile My Tables, Orders, Food Ready, Messages, More; three More tools and connection settings. | Correct/denied role PIN, table selection, price visibility, KOT creation, kitchen-ready notification, eventual table release, offline/reconnect. | PARTIAL; final Captain order DB truth confirmed; original flow assertions interrupted. Modifiers, amendment, split/transfer, messaging and all role tools not certified. |
| KDS | localhost:5179 | Active, Cooking, Ready, Served, Expo; Main Kitchen/All Stations/Switch Station. | PIN auth, real POS/Captain/QR tickets, ready propagation, 30-ticket recovery, paid/unpaid kiosk contrast, restart reconnection. | FAIL; B003/B006. Multi-station simultaneous load, recall, priority, sound and every item-level transition not certified. |
| Kiosk | localhost:5174 | Activation, welcome, language selection, takeaway menu/item/cart/payment/confirmation. | Owner price sync, unavailable gateway fallback, simulated capture/signatures/duplicate callback, receipt, unpaid admission. | FAIL; B002/B003/B006/B011. Dine-in, all languages, all modifiers, accessibility, cash acceptance and real QR payments not certified. |
| QR guest (additional discovered surface) | localhost:5190 | Invalid URL, menu/cart/checkout/status in a mobile viewport. | GST18 quote, double-click order and refresh idempotency, cashier acceptance, KDS ready → same guest status; invalid quantities/reference. | PARTIAL; supported tested chain passed, full public abuse/rate/security matrix not certified. |

## Functional bugs, cross-app inconsistency and data truth

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

See [complete reproducible findings](JAMANVAAR_COMPLETE_QA_AUDIT.md) and [data consistency matrix](DATA_CONSISTENCY_MATRIX.md). Same-order-id flow checks were more informative than page rendering: POS → KDS → Ready → POS passed, QR guest → cashier → KDS → guest passed, but paid Kiosk → KDS and SEND KOT → Instant Bill failed.

## Performance and security

Production Admin made 1316 fleet calls in 10 idle seconds. This is a demonstrated frontend-driven workload problem; production SQL/ALB attribution remains blocked. [API measurements](API_PERFORMANCE_MATRIX.md) include actual status/count/timing/size groups. Cashier refund bypass is a backend authorization defect (B005), while selected tenant/branch isolation and RLS probes passed. No blanket security or scale guarantee is made.

## UX, difficult workflows and too many clicks

Inventory save feedback, fabricated shift truth and hidden navigation on session failure add confusion for owners. A short billing workflow is unsafe if it creates another order. Five primary kiosk actions before scanning were observed; no human study establishes that five is excessive. [UX friction](UX_FRICTION_REPORT.md) describes observed sequences without invented human completion times.

## Error handling, offline and payment

Injected Super restaurant 503 recovered through Retry; unavailable payment gateway showed a recoverable error. Owner auth failure needs explicit recovery. Short offline KOT queued locally then synced once; Captain navigation recovered; POS/KDS event streams reconnected after actual isolated API restart. Long outages/concurrent conflicts remain untested. Kiosk amount/receipt/kitchen problems block release despite passing valid/invalid signature checks. Route remains pending/manual as the user requested; no real funds moved in the executed payment simulations.

## Missing functionality and common POS expectations

[Missing features](MISSING_FEATURES.md) separates demonstrated missing guarantees from unverified functionality. No competitor-specific research or parity claim was made. Split payments, all modifiers/tax variants, table transfers, approvals and reliable physical printing need explicit certification, not assumption.

## Role-specific recommendations

| Role | Worked in tested path | Friction | Priority |
| --- | --- | --- | --- |
| Cashier | Hold/recall, cash settlement of a running order, short offline KOT, zero-float shift close and guest QR acceptance worked. | Instant Bill after KOT creates a second order; configured GST is ignored; refund approval can be bypassed server-side. | One sale identity, accurate tax, server refund approval, truthful printer feedback and known recovery/shift state. |
| Kitchen Staff | POS/QR tickets, ready→cashier visibility, tabs/station selection and 30-ticket recovery worked. | Paid kiosk orders disappear while unpaid QR checkout can appear. Staff cannot infer payment acceptance safely. | Reliable paid/cash-accepted admission; stable ticket identity and explicit recovery state before more display options. |
| Captain / Waiter | Mobile table/menu selection, role PIN rejection, ready notification, final table release and offline navigation worked. | Original full timed flow was interrupted; quantity/modifier/amendment/transfer/service request workflows remain unverified. | Fast repeat ordering, clear send acknowledgement, safe amendments and an end-to-end table lifecycle backed by the same order id. |
| Restaurant Owner | Menu price propagation, menu CSV, staff/customer creation, stock delivery/count ledger and collection labels worked in selected paths. | Idle request storm; inventory disappears on another device; false reconciled cash float; auth errors hide modules. | Trustworthy numbers, immediate save feedback, cross-device stock and explicit login/module state. |
| Customer | Guest QR correctly quoted GST18, double-submit/refresh retained one order and status became Ready. | Kiosk payable differs from charged amount; paid confirmation may not reach kitchen; no-printer runtime error. | One accurate payable amount and confirmation that represents actual order acceptance and kitchen delivery. |
| Super Admin / Finance | OTP, A/B onboarding, payment approval, negative commission authorization and unverified-bank EOD protection worked. | Most admin actions only rendered; positive commission edit, payout fulfilment, full statements and provider operations not certified. | Actionable exceptions based on durable fulfilment, immutable fee snapshots, accountable refunds and verified payout audit. |

[Six-role top-10 recommendations](ROLE_BASED_RECOMMENDATIONS.md) prioritize Cashier, Kitchen, Captain and Owner.

## P0 / P1 / P2 / P3

- P0: B001–B005.
- P1: B006–B007.
- P2: B008–B010 plus report/role/complex ordering verification.
- P3: B011, label clarity, render warnings and measured startup usability.

[Fix plan](FIX_PLAN.md) gives expected impact and regression gates. Application fixes were not made. All unexecuted functionality is explicitly PARTIAL/BLOCKED; this is not an all-features-pass sign-off.

# Implemented fix plan and remaining release verification

Additional merged-key follow-up: [kiosk-only post-activation access](../merged-admin-key-fix-2026-10-06/REPORT.md) is now corrected in the backend device guard and quota accounting. Actual browser key entry and refresh pass with POS-only modules remaining hidden.

Updated 2026-10-06 after authorized implementation. All twelve confirmed discovery findings are fixed and their demonstrated local paths pass. Additional B013–B015 were corrected during verification. Changes have not been deployed; production readiness remains unverified.

See the [implementation report](../browser-fixes-2026-10-06/IMPLEMENTATION_REPORT.md), [per-app and system scores](../browser-fixes-2026-10-06/SCORES.md), [reviewed Playwright scenarios](../browser-fixes-2026-10-06/TEST_MATRIX.csv), and [verification summary](../browser-fixes-2026-10-06/verification-summary.json). The original audit preserves pre-fix discovery evidence.

| Findings | Current status | Verified result / remaining gate |
| --- | --- | --- |
| B001 | Complete locally | Production preview has 0 idle fleet requests / 10 seconds; measure deployed request volume |
| B002 | Complete locally | Configured zero/GST18 and inclusive pricing regressions pass; complex browser finance and historical reconciliation remain |
| B003/B006 | Complete locally | One paid KDS ticket, no unpaid actionable ticket; real callback/crash/long-outage lifecycle remains |
| B004 | Complete locally | KOT → Instant Bill retains one order; repeated counter scenarios pass |
| B005 | Complete locally | Server manager/owner proof, scoped approval, audit actor and refund idempotency pass; actual provider refund untested |
| B007/B008 | Complete locally | Cloud masters, replacement-device stock/supplier, immediate inventory save pass |
| B009/B010 | Complete locally | No fabricated cash float, explicit zero preserved, owner sign-in recovery passes |
| B011/B012 | Complete locally | Absent-printer guard and merged provisioning links verified |
| B013 | Complete locally | Imported Captain order remains visible in POS/day reports and settles once |
| B014 | Complete locally | Branch reads/writes/deletion retain ownership in API regressions |
| B015 | Complete locally | Valid inclusive subtotal has no false warning; menu-ID underpricing remains flagged |
| Release certification | Open | Staging/AWS, simultaneous peak/soak, providers/hardware, every control/complex role matrix |

No Prisma migration was added. Deploy backend/frontend contracts together using production URLs and review historical bad orders/stock explicitly. Online kiosk promotion redemption still needs a server contract; checkout now avoids consuming benefits absent from the authoritative quote.

The table below preserves the original proposed implementation order and broader regression goals. Its verification gates are not a claim that every variation has been certified.

| Priority | Findings | Concrete fix | Expected impact / release gate |
| --- | --- | --- | --- |
| P0 | B001 | Stable entitlement function/effect; one in-flight fleet request; existing 30-second interval. | Remove idle request amplification; production idle test bounded; verify entitlement changes still update modules. |
| P0 | B002 | One item-aware quote/snapshot across clients/payment/receipt; preserve zero and reconcile every component. | No customer payable mismatch or invalid tax receipt; full mixed/inclusive tax/report regression. |
| P0 | B003 + admission contract B006 | Separate payment from kitchen state, verified admission and durable KOT acknowledgement. | Paid order always reaches kitchen once, pending QR does not cook; cloud-only/crash/replay tests. |
| P0 | B004 | Instant Bill resolves current running order rather than unconditional create. | One sale/KOT/shift entry per basket; repeated/offline operations keep identity. |
| P0 | B005 | Server-verified staff refund permission/manager approval with bound scope and audit actor. | Cashier cannot bypass UI approval; authorized managers retain correct idempotent refund workflow. |
| P1 | B007 | Master inventory transport and deterministic bootstrap before movement replay. | Two-device stock truth and replacement-device recovery; no double-applied movements. |
| P2 | B008/B009/B010/B012 | Inventory reactive update; ledger-backed cash state; explicit auth/entitlement error recovery. | Immediate visible saves, honest cash reconciliation and clear sign-in recovery. |
| P3 | B011 + likely UX risks | Guard printer absence; distinguish queued/printed; verify KOT success label and render-side warnings. | No avoidable print TypeError; reduce repeat-click confusion after targeted evidence. |
| Verification gate | Not yet certified | All remaining control mutations, permission/complex ordering matrices, multi-instance/peak/soak, AWS and hardware/provider tests. | Do not approve release on route-rendering or local averages alone. |

Each original bug includes discovery evidence in JAMANVAAR_COMPLETE_QA_AUDIT.md. Route-pending semantics are preserved: default Jamanvaar collection; direct-bank toggle is a request; MANUAL stays effective until linked account/Route activation and bank verification. Commission applies to intended kiosk QR collections. Positive Super Admin 3% → 4% edit, new-payment fee and preserved historical snapshot now pass locally; the default was restored afterward.

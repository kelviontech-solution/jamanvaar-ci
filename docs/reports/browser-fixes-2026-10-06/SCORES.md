# Post-fix scores — 2026-10-06

**Overall locally verified quality: 8/10. Production readiness: not rated without deployed verification.** Scores are engineering judgments about implementation and evidence, not percentages calculated from green tests. They refer to the repaired local build. [Implementation report](IMPLEMENTATION_REPORT.md) gives supporting evidence.

## Applications

| Application | Score / 10 | Verified strengths | What prevents 10/10 |
| --- | --- | --- | --- |
| POS | 8.5 | Correct tax, one-order billing, hold/recall, 20 sales/30 KOTs, Captain/QR settlement, offline recovery, refund authorization | Full split/refund/amendment browser matrix, concurrent cashiers, hardware |
| POS Admin / Restaurant Admin | 8.5 | Fleet storm removed; auth recovery; price/tax chain; replacement stock; honest cash/collection totals | Every admin mutation, complex stock/recipe flows, real payouts, accessibility |
| Super Admin | 8 | Merged provisioning links; positive commission edit with historical snapshots; build passes | All destructive/permission controls, approved-bank EOD, production operations |
| Kiosk | 8 | Authoritative quotes; unpaid kitchen exclusion; captured ticket once; absent-printer handling | Real payments/devices, every language/modifier/dine-in path, full online promotion redemption |
| Kiosk Admin — merged | 8.5 | Restaurant Admin activation/provisioning and kiosk collection settings | Same limits as Restaurant Admin; no separate executable remains |
| KDS | 8.5 | Paid admission, no unpaid work, 30 tickets, Ready propagation, SSE recovery | Concurrent stations, recall/priority/audio/Expo/item-level transitions, long outage |
| Captain | 8.5 | GST18 order → KDS → Food Ready → same POS settlement; corrected business-day visibility | Full amendments/modifiers/table moves/cancellation/messages and concurrent staff |
| QR guest — additional | 8 | Correct ₹118, double-submit/refresh identity, cashier acceptance and Ready | Public abuse/rate matrix, mobile accessibility, real-world connectivity |

POS Admin and Kiosk Admin share one build/assessment; they are listed separately to match the original seven-app inventory. Their evidence is not counted twice.

## Shared areas and the original sixteen concerns

| Area | Score / 10 | Evidence / remaining limit |
| --- | --- | --- |
| 1. Slow APIs / request performance | 7.5 | Fleet storm removed, main Admin gzip reduced 87.76%; production query/p95/p99 unavailable |
| 2. Failed/pending requests | 8 | Owner recovery and targeted failures pass; every API/loading error path unverified |
| 3. Database / connection pool | Not rated | PostgreSQL/RLS tests pass; deployed pool saturation/query metrics unavailable |
| 4. Auth / refresh | 8 | Owner 401 recovery and refund/role proofs pass; all refresh/expiry/device lifecycle races unverified |
| 5. Cache / stale data | 8.5 | Price and replacement stock reach other apps; full concurrent edit matrix remains |
| 6. SSE / reconnect | 8.5 | POS/KDS restart recovery passes; multi-instance/proxy/long-outage tests remain |
| 7. Duplicate operations | 8.5 | Fleet, KOT, billing, QR and refund replay fixes pass; concurrent action matrix remains |
| 8. Retry loops | 8 | Demonstrated amplification fixed; prolonged failure paths not soaked |
| 9. Infinite loading | 8 | Owner recovery and tested checkout complete; every page/control error state not certified |
| 10. Frontend state sync | 8.5 | Price/tax/kitchen/Ready/day-view chains pass; wider mutation/browser matrix remains |
| 11. AWS / Nginx / ALB | Not rated | No live telemetry; local tests cannot establish infrastructure health |
| 12. KDS real-time KOT | 8.5 | Paid/unpaid and 30-ticket/Ready chains pass; full concurrent kitchen lifecycle remains |
| 13. Captain real-time status | 8.5 | Same-order floor → kitchen → cashier passes; multiple Captains and complex changes remain |
| 14. Offline / reconnect | 8 | Offline KOT survives reconnect/refresh once; crash, long outage and multi-device conflict remain |
| 15. Race conditions | 8 | Refund intent/balance and double-click checks pass; peak concurrency and chaos remain |
| 16. Tenant / branch security | 8.5 | Two-tenant tampering denied; branch read/write/tombstone APIs pass; wider penetration and deployed RLS remain |
| Pricing / reports / settlements | 8 | Zero/GST18, inclusive API checks, frozen fees and report deltas pass; promotions, historical repair and real payout lifecycle remain |
| Inventory correctness | 8 | Cloud masters, baseline/movement replay and clean-device recovery pass; complex concurrent recipes remain |
| UX / accessibility | 8 | Actual Cashier/Kitchen/Captain/Owner chains improved; touch/keyboard/screen-reader and all controls remain |
| QA coverage | 7 | 1,382 runtime tests, targeted API suites and 35 fix scenarios pass; navigation inventory does not certify every variant or production condition |

Before increasing these scores: complete remaining control/role matrices on staging, simultaneous staff/kiosk load and prolonged outage tests, real provider/manual payout reconciliation, physical device checks and deployed API/database/SSE measurement. Finish server-side online promotion redemption if the product promises it. Route activation remains provider-dependent by design.

All twelve original demonstrated defects are locally resolved. Global “no issues left” and 10/10 certification are not established.

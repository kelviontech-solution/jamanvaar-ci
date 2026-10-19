# Current repair status — 19 October 2026

**The programme is not complete and the product is not rated 10/10.** Local repairs and verification have advanced; source work and installed/production acceptance both remain. This is an uncommitted working tree on `ccf17d93288ede1a1bdf7bb2c150adf84ec88e72`, with inherited and concurrent edits preserved. Nothing was pushed or deployed.

| Dimension | Current provisional score |
| --- | ---: |
| Security | **7.0/10** |
| Code quality | **7.0/10** |
| SaaS readiness | **6.5/10** |

These are separate engineering judgments, not reliability percentages or certifications. Passing tests cannot substitute for authorization, recovery, payment, hardware or installed-upgrade acceptance.

## Latest verified repairs

| Area | Result | Detail |
| --- | --- | --- |
| POS cancellation | A sent dish is cancelled once after SQLite acknowledgement; cancelled history survives later submission, the trash action no longer re-adds it, and the last cancelled dish releases its table. | [Cancellation/balances](CANCELLATION_BALANCES_2026-10-19.md) |
| Saved prices and tax | Counter/table recall and cancellation retain accepted prices, taxes and percentage/coupon discounts after later menu changes. | [Cancellation/balances](CANCELLATION_BALANCES_2026-10-19.md) |
| Recorded balances | Receipt, activity, settlement and outstanding helpers agree on cancelled, partially paid and returned bills. A cancelled payment attempt does not itself cancel an unpaid bill. | [Cancellation/balances](CANCELLATION_BALANCES_2026-10-19.md) |
| Inbound orders | Orders/KOTs/inventory save before advancing the cursor. Preparation failures retain the page; pending local edits resist newer-timestamp legacy responses. | [Inbound orders](INBOUND_SYNC_2026-10-19.md) |
| Interrupted POS save | Managers can restore the original operation after refresh, review recorded balances, identify current and unrestored drafts, then acknowledge recovery. No automatic payment, print or drawer repeat. | [Manager recovery](INTERRUPTED_OPERATION_RECOVERY_2026-10-19.md) |
| Inbound entities | Catalog, customer and inventory pages save before advancing their cursor and defer during financial recovery. Empty pages avoid rebroadcasting unchanged business collections. | [Entity sync](ENTITY_SYNC_2026-10-19.md) |

POS recovery is at **Settings → Local DB & Sync → Finish an interrupted save**, for an active signed-in manager. It is not yet an equivalent guided recovery interface in Captain, Kiosk and Admin.

## Verification scope

- Full root working-tree baseline: **2,418 passed / 336 files**, no failures/skips. Concurrent QR template work and the later hidden-draft guard mean this is not a frozen final-release certificate.
- Final original-operation recovery follow-up: **94 passed / eight files**, no failures/skips. This covers the later hidden-draft guard independently.
- Latest entity/order/financial follow-up: **203 passed / 21 files**, no failures/skips. This follows the full-root baseline and covers the latest entity changes.
- Root and API TypeScript gates: clean in the latest stage. Seven production frontend bundles and **20 Chrome/SQLite OPFS component/service scenarios** have separately recorded results in the stage ledgers. Existing bundle-size warnings remain; frontend bundles are not signed native artifacts.
- Full API database regression remains the earlier **1,588-test / 173-file** baseline with one opt-in scenario skipped; it was not rerun for these client-side stages.

The runs overlap; **do not sum these test counts**. Fault-injection identities, approvals and hardware are fixtures. The new order/entity persistence cases use real Node SQLite; the 20 browser scenarios cover actual components and services with OPFS, rather than every authenticated app page or provider payment.

## Remaining work toward a stronger assessment

| Work package | Remaining source work | Required acceptance |
| --- | --- | --- |
| W03 | Guided recovery in other apps; legacy storage policy; held/abandon paths; concurrent admission. | Installed interruption/crash and two-device recovery without duplicate effects. |
| W04 | Core/cloud revision bridging, conflict resolution and historical quarantine reconciliation. | Reordered, lost-response and failover scenarios across actual endpoints/devices. |
| W05 | Complete payment/return exception recovery and lifecycle consistency. | Provider sandbox and limited live retries, late success, refunds and reconciliation using original references. |
| W06 | Every report/export/cutoff reconciled; historical tax/stock-return policies. | Independent paise fixtures and conservation across order, payment, loyalty and inventory effects. |
| W07 | Complete installed/offsite recovery and key-loss procedures. | Isolated full restore, corrupt/missing files, unavailable keys, measured recovery time/data loss. |
| W08 | Actionable preparation/sync diagnostics and fleet incident handling. | Physical supported printer/drawer and disconnected-device acceptance. |
| W09 | Formal all-role journey and F01–F25 closure evidence. | Authenticated all-app/page/role flows, beyond isolated components. |
| W10 | Complete route/role/entitlement adversarial review and native artifact inspection. | Rejection of unauthorized/altered inputs and artifacts on supported builds. |
| W11 | Representative capacity limits, sustained load and operational thresholds. | Production-like workload, recovery under load and documented capacity. |
| W12 | Signed update/pilot rollout and recovery procedures. | Upgrade over original signed installations, data preservation and restaurant pilot. |

These are **ten incomplete work packages**, not ten tiny remaining bugs, and they include existing partial implementations. Some are substantial. Original signing identities, provider access, physical devices and approved recovery infrastructure must be used; replacement keys or simulated successes would not close those gates.

The [master repair plan](REPAIR_MASTER_PLAN.md), [coverage matrix](REPAIR_COVERAGE_MATRIX.md) and stage verification ledgers retain the detailed acceptance requirements and historical failed runs.

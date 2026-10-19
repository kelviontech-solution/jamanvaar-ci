# Inbound sync persistence and local-edit protection — 19 October 2026

This follows [cancellation and recorded balances](CANCELLATION_BALANCES_2026-10-19.md). **EC-01/W03 is improved but remains open.** Scores remain Security **7.0/10**, Code quality **7.0/10**, SaaS readiness **6.5/10**. Changes are local and uncommitted; no deployment or push was performed.

## Defects reproduced and repaired

1. **The pull cursor advanced before orders were acknowledged by SQLite.** Both a held write and a failed disk write reproduced a cursor of `seq:9` before reliable persistence. Each page now queues its order/KOT/inventory changes together, waits for the database persistence barrier, then advances its cursor. A crash after the data save but before the separate cursor write repeats the page rather than skipping orders.
2. **Inventory preparation errors were swallowed as though recipe data were absent.** Missing recipes are already a no-op in the repository; a real exception now rolls back page preparation and keeps its cursor. A failed second page preserves the previously acknowledged first page and its cursor.
3. **Legacy responses could overwrite queued local quantities using a newer timestamp.** Both sequenced and legacy responses now defer updates for `SAVED_LOCALLY`, `SYNCING`, `FAILED` and `DEAD_LETTER` orders. A future-dated response cannot erase those pending edits; the authoritative server acceptance claim remains a separate merge rule.
4. **Pull materialization ran while financial recovery was pending.** Admission now defers before fetching and checks again after an in-flight response returns. It cannot materialize a new page while the earlier financial intent needs adoption/recovery.

`db.flushPersistence()` is explicitly an ordering barrier. It does not replace the stronger persisted financial command/replay API. Legacy synchronous or memory storage retains compatibility; passing in-memory tests is not evidence that such a store offers SQLite durability. The cursor and data are deliberately ordered separate writes, not one claimed cross-system transaction.

Screenshot review also found the POS cart header still hardcoded “New Order — Unsaved” after a successful kitchen save. It now identifies the existing bill and distinguishes saved dishes from newly added unsent dishes. The cancellation browser scenario checks that the misleading new-order header disappears.

## Verification and limits

The [aggregate verification ledger](INBOUND_SYNC_VERIFICATION.json) records exact final counts, source hashes, separate failed reproductions, type gates, frontend bundles and browser regression scope. Raw fixture records remain private.

The corrected affected regression completed **197 passes, zero failures/skips across 17 files**. This overlaps the preceding 129-test stage; the counts must not be added together. Root/API type gates and seven frontend build results are recorded separately in the ledger.

The new real SQLite tests cover delayed saves, disk failure/retry, four pending-state classes, inventory rollback, pending operations before/during a pull, and retention of an acknowledged page when the next page fails. Existing sync tests also cover QR propagation, item states, tickets, offline routing and financial command callers. The first wider run passed 196 cases with one fixture status mismatch: configuring a new transport intentionally normalizes abandoned `SYNCING` rows. The corrected fixture sets the live-push state after configuration and retains every quantity/total preservation assertion.

Browser regression reruns the 18 preceding component/service scenarios using Chrome and SQLite OPFS. It checks that the shared database change does not break cancellation, returns, kitchen submission, checkout or protected recovery. **The new inbound fault injection is a Node SQLite integration test; it is not presented as a browser or installed-device fault drill.** Frontend Vite bundles are not signed Windows/Android release artifacts.

The prior broad root result remains 2,378 passes and one cold entitlement initialization timeout, with an unchanged isolated 8-test follow-up. Focused green results do not replace that failed broad gate. No new complete API database-suite run is claimed.

## Work still required

| Package | Remaining source work and acceptance |
| --- | --- |
| W03 | Generic pending-command recovery after refresh; held/abandon routes; explicit legacy storage policy; serializable concurrent admission; installed interruption drills. The cursor ordering repair closes only the reproduced skip window. |
| W04 | Core/cloud revision bridging, failover and guided reconciliation of quarantined history. |
| W05 | Full provider/manual-return retry and late-callback matrix; payment exceptions resolved against original references. |
| W06 | Agreement across every report/export/cutoff; historical missing tax snapshots; inventory treatment of remote cancellations/returns. |
| W07 | Complete installed/offsite restore, lost-key recovery and reconciliation drills. |
| W08 | Physical printer/drawer acceptance, fleet incidents and actionable diagnostics when a page fails preparation. |
| W09 | All-role authenticated journeys and formal F01–F25 revalidation. |
| W10 | Complete adversarial route coverage and inspection of signed native artifacts. |
| W11 | Representative sustained load and capacity limits. |
| W12 | Upgrade over original signed installations, recovery/rollback and restaurant pilot. |

An inventory validation failure now stops the affected page instead of silently acknowledging incomplete stock effects. Surfacing that exact preparation failure with an operator recovery action remains important; this stage does not claim a completed guided sync recovery interface. Real provider, hardware and original-signing evidence cannot be substituted with fixtures or generated keys.

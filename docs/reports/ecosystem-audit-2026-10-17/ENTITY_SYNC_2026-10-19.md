# Entity-sync persistence before cursor acknowledgement — 19 October 2026

This follows [POS manager recovery](INTERRUPTED_OPERATION_RECOVERY_2026-10-19.md) and the [order cursor repair](INBOUND_SYNC_2026-10-19.md). The programme remains incomplete; provisional Security / Code quality / SaaS readiness scores remain **7.0 / 7.0 / 6.5**. No push or deployment was performed.

## Reproduced failures and changes

Real SQLite tests reproduced an advanced sequence cursor before saved **menu categories, customer balances and inventory records** were acknowledged. A disk failure was also reported as a successfully pulled page, and an incoming customer page was applied while another financial operation needed recovery. Five cases failed before the repair; their raw results are retained separately.

`EntitySyncEngine` now waits for prior queued writes, checks financial recovery before fetching and again after the response, applies the synchronous consumer page, and waits for its data to persist before acknowledging its sequence/catalog checkpoint. It rechecks transport/device scope after the save so a late response cannot acknowledge a different connection. A failed save retains the old cursor and reports no acknowledged page.

This is **ordered data and cursor persistence**, not an assertion that every consumer is one serializable transaction. A consumer can partially apply records before rejecting a later record. Its cursor stays unchanged and the existing merge-by-identity contract must make replay safe; the regression retries such a page without duplication. Async consumers and external side effects are outside the synchronous callback contract. Legacy memory/storage policy and complete entity conflict recovery remain open.

Empty entity/order pages now advance their metadata without unnecessarily notifying and rebroadcasting unchanged business collections. Separate tests cover both engines, reducing the risk of sync wake-ups causing needless relay traffic.

## Evidence

The [verification ledger](ENTITY_SYNC_VERIFICATION.json) records final affected counts, type gates, seven production frontend bundles, browser regression scope and current source hashes. Exact raw records stay private.

The final affected run passed **203 tests across 21 files, zero failures/skips**. This includes both order/entity empty-page guards and the existing financial/cross-channel callers selected for the shared change. Root and API TypeScript checks passed with no diagnostics. All seven final production frontend bundles passed; existing bundle-size warnings remain. The initial type run also caught a fixture assertion assuming every customer has an `id`; the customer regression now checks its actual phone identity and loyalty balance after reopening storage.

New SQLite coverage includes each of the three data families, a delayed write, disk failure/retry, partial consumer failure, financial recovery before and during a network pull, and empty-page behavior. Existing affected tests cover catalog conflict handling, cross-window/menu synchronization, QR routing, offline sync and financial replay.

The preceding full root run passed **2,418 tests across 336 files** before this entity repair. It remains a separate working-tree baseline; the new entity checks are not retroactively part of that count. The preceding 94-test recovery follow-up and this stage's tests overlap and must not be added together.

Chrome/SQLite OPFS regression repeats the existing **20 component/service scenarios**. Those check that shared changes preserve submission, cancellation, returns, payment, original-operation review and protected recovery. The new entity fault injection itself is a Node SQLite integration test, **not a production or installed browser failure drill**. Frontend bundles do not certify signed native upgrades; no complete API database-suite rerun is claimed.

## Remaining work

W03 still needs explicit legacy backend policy, guided Captain/Kiosk/Admin recovery, held/abandon routes and installed/concurrent-device acceptance. W04 retains Core/cloud revision bridging and full conflict reconciliation. Both sync engines still need clear operator diagnostics for rejected page preparation. Payment/provider reconciliation, all-report agreement, full installed/offsite/key-loss restore, physical hardware, adversarial/native acceptance, sustained representative load and the restaurant pilot remain in the [package-by-package table](INBOUND_SYNC_2026-10-19.md#work-still-required).

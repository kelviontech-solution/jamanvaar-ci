# Repair continuation: 18 October 2026

Latest continuation: [current reassessment, new repairs and remaining work](REASSESSMENT_2026-10-18.md). This now supersedes the older broad-run failures and the W01/W04/internal-recovery status below. The new full API run passes; EC-01 still remains open.

Status: this repair batch is implemented and locally verified. This is not completion of all twelve work packages or a new 10/10 assessment. Machine-readable evidence: [verification results and source hashes](REPAIR_VERIFICATION_2026-10-18.json).

## Starting state

Continued from the other agent's uncommitted work at HEAD `ccf17d93288ede1a1bdf7bb2c150adf84ec88e72`. Preserved its Captain/UI/type/test/device changes and the pre-existing modified historical performance artifact. The supplied handoff reports 19 API test failures; a fresh isolated rerun is required before adopting those results as this continuation's evidence.

Created a new local run-owned PostgreSQL test database, applied migrations and seeded it. Verified the test role is neither superuser nor BYPASSRLS. After the database tests completed, verified its exact run-owned identity/owner and zero active connections, then removed only that database. Shared databases were untouched. Credentials and raw provider/application logs are not report artifacts.

## Changes in this continuation

| Finding | Implementation | Verification / limit |
| --- | --- | --- |
| EC-02 | Portable SHA-256 identity of the canonical complete transmitted business payload. Authorization tokens and last-seen server revision do not alter retry identity. Responses are matched against the current mutation, including when the local object was replaced. | Same-time modifier/split/seat/refund/discount changes, stable retries, plain-HTTP compatibility and old success/rejection/transport responses against a newer edit pass. Installed-client upgrade/replay acceptance remains separate. |
| EC-03 | Required/available options checked at direct Captain store entry and before KOT, in addition to existing modal guards. Existing min/max behaviour retained. | New direct-store/invalid-option/min-max regressions plus existing Captain service scenarios pass. Generic service fixtures explicitly use plain dishes instead of silently bypassing customization. Browser entry paths still require current acceptance. |
| EC-04 | Optional server `baseSyncVersion` checks, future-clock rejection, recovery from an existing poisoned timestamp and explicit legacy stale errors. | Four real database/service regressions pass. Revision-aware client conflict presentation/merge rollout is not complete; this is not closure of the entire concurrency work package. |
| EC-05 | Restore preserves canonical ID, QR public identity, source, original creation date, menu/QR references and valid device/branch attribution. | Extended actual encrypted snapshot/restore integration tests; results recorded after execution. |
| EC-06 | Snapshot v2 includes collection/refund entries; restoration recreates validated entries with original references. Server-origin MAC is required for recreating financial evidence. Existing financial history is protected; missing collection evidence prevents unsafe paid-order recreation. Preview lists unsupported recovery families. | Forged uploaded financial evidence is rejected. Operational snapshot only. Gateway/provider, inventory/object/key and complete infrastructure recovery remain outside this restore path. Full disaster-recovery acceptance remains open. |
| EC-07 | Report reads immutable payment entries first; partial refunds do not turn paid bills into open bills. Added gross/refund/collection/net/outstanding and legacy-fallback fields. | Real ₹100 collection/₹20 refund fixture gives ₹80 net and zero outstanding, including branch/method views. This report is an order-created cohort, not a cash-activity or settlement report. |
| EC-08 | Calendar grouping uses the branch timezone, falling back to the restaurant timezone, independently of database session zone. | UTC-to-Asia/Kolkata boundary passes. Response labels `BRANCH_LOCAL_CALENDAR_DATE`; business-cutoff/other reports still need dictionary-wide acceptance. |
| EC-09 | Automatic printer selection preserves actual OFFLINE/ERROR/UNKNOWN state and last real test timestamp. | Three status regressions pass. Physical print completion is not verified by a configuration test. |
| EC-10 | Existing heartbeat-based summary repair checked against persisted online/stale/revoked devices. | Real database count differences pass. Full fleet UI matrix remains separate. |
| EC-15 | Production upload was already protected. Added fail-closed invalid-key handling in all environments, truthful policy health and staging opt-in required encryption. Existing encrypted format retained. | Four service regressions pass, including encrypted round-trip and tamper rejection. Actual off-site/key-loss recovery remains unverified. |
| EC-16 | Local Core status reads actual bounded loopback HTTP health and validates service identity. Beacon stops advertising an unhealthy service; sidecar launch failure is reported. | Four standalone Rust transport tests pass. Whole Tauri build/install acceptance and fleet alert/SLO work remain separate. |

Additional safeguards: reports and snapshot exports use repeatable-read transactions for a consistent multi-query view. Operational restore skips customer/staff/cash/stock balance entities whose independent rollback could contradict current ledgers. Shared modifier validation rejects unavailable, unknown and duplicate options. Explicit `DurableStorage.commitBatch` publishes its batch only after backend acknowledgement and reports pending/committed/failed/closed states. `commitCommand` adds guarded read dependencies and atomic operation-result replay through direct, worker and cluster backends. These are foundations for W03, not yet adoption by every financial caller.

## Important semantics

- The sales endpoint selects orders created within its period. Its refunds/collections are known by period end. It does not claim to be a separate refund-date cashbook. Top-item revenue is before bill-level returns, and method groups use the order's primary method.
- Historical orders without payment entries are explicitly counted as legacy fallback. This read-only report does not manufacture missing ledger evidence.
- Calendar dates and business-day cutoff reports are different metrics. This change labels the former rather than silently changing historical business-day interpretation.
- Existing settled orders are preserved during operational snapshot restore. A legacy snapshot without financial evidence must use a proper complete recovery procedure for missing paid orders.
- Financial recovery signatures use a domain-separated key derived from the existing backup encryption key, or the existing JWT secret fallback. Preserve that key for recovery; this work did not rotate it. Encrypting a client-uploaded JSON file does not make its financial entries authoritative.
- Source improvements to Core health do not establish a physically running installed sidecar, successful printer output or a release signature.

## Verification ledger

Results below are updated as commands finish; raw logs are private because integration output may contain fixture credentials or application data.

- Root targeted regression run: **52 tests passed across 3 files** (`outbox_reliability`, `ecosystem_repair_order_and_printer`, `captain_store_service`).
- Database report/device tests: **5 passed** on the isolated migrated database.
- Database entity clock/revision tests: **4 passed** on that database.
- Backup encryption-policy tests: **4 passed**.
- Standalone Rust health transport: **4 passed**; healthy body, HTTP failure, oversize response and closed port.
- Root full regression run: **2,267 passed, zero failed across 323 files**. Subsequent stronger modifier/commit tests have separate targeted evidence; do not add overlapping run counts together.
- Captain course/kitchen-delivery fixture follow-up: **64 passed across 5 files**. These fixtures now create valid plain dishes for service tests; required-choice rejection retains dedicated tests.
- Latest modifier/outbox/commit targeted run: **32 passed across 4 files** before the two additional real-SQLite commit cases.
- Previously failing API contract groups: **115 passed, one failed** (quota message shape); the last assertion was corrected and passed in the next scenario run.
- Multi-branch/channel scenarios plus the quota fixture: **47 passed across 3 files**. Includes KDS completion propagation, branch isolation and kiosk own-order privacy.
- Extended encrypted backup/restore, reporting, entity-clock and policy run: **24 passed, zero failed** before the additional protected-entity restore test.
- Bounded sync load: **7 passed**, first with 50 reusable connections, then again with explicit accepted-business-result and persisted-order-count assertions. This is a bounded integration workload, not proof of 1,000 simultaneous sockets or production capacity.
- All **7 production Vite bundles pass**; public assets served separately by the local harness. All **8 browser entry/activation/invalid-QR checks pass** with zero page errors and no horizontal overflow. Authenticated every-feature browser acceptance is still open.
- Root TypeScript build check and API all-project no-emit check passed; checks after the latest additions are recorded separately below when complete.
- POS Tauri library `cargo check --lib --offline` passes using `.jamanvaar/native-target`. The first attempt in the existing target directory failed inside a dependency build script with an unwritable output path; fresh target compilation succeeded. This is compilation, not a signed release or installed upgrade.
- Actual customer QR browser journey: **5 scenarios pass** against the real isolated API: required choices/min/max, checkout detail preservation, quote-failure retry, a persisted counter order/status reload, and KDS ready/served propagation to the customer page. Fulfillment completion preserves the unpaid balance. KDS transitions use the real authorized API, not a physical KDS button. The initial harness served HTML at `/q/assets/` module URLs; fixing the harness mount resolved that run's failures. This was not an app-loading defect.
- Final durable subset: **30 passed across 5 files**, including real SQLite commit/reopen, rollback, clustered storage and existing offline POS acceptance. Additional duplicate/unavailable-choice regressions are separate.
- Full API regression run: **1,559 passed, 3 failed, 1 skipped across 170 files**. The four sustained/load suites were excluded; the optional live fixture was discovered and skipped because `LIVE_FIXTURE` was unset. The original exclusion flag used the wrong live-fixture filename, which did not activate it or affect external data. Three failures concerned snapshot v2 expectations, updated report wording, and a restore-preview case edited during that long-running baseline. All six affected backup/report/entity/policy files subsequently passed **44 tests**. Later financial-origin protection passed **27 tests in both backup files**. This is a broad baseline plus passing corrections, not a newly rerun clean full API suite.
- The three previously excluded order-sync/inventory/QR scale files subsequently passed **24 tests** on the same isolated database. Sustained load separately passed its **45-second** configured workload with 30 makers and two KDS readers.
- Measured sustained rerun: **1,217 orders, 1,206 kitchen updates, 2,423 mutation requests, zero errors**. Measured mutation latency: p50 **424 ms**, p95 **693 ms**, p99 **767 ms**, maximum **1,264 ms**; measured wall time **46 seconds**, approximately **53 mutation requests/second**. This is one local development host with concurrent verification activity, not a fleet capacity/SLO certification. Both KDS readers received each final persisted revision.
- Sustained harness now checks accepted business results, real POS/Kiosk/Captain origins and exact expected final statuses, drains after producers finish, and checks final KDS revisions. Removed an always-true filter and the false POS label previously used for every channel.
- Post-change outbox/cross-app/KOT targeted run: **27 passed across 3 files**. Storage/outbox compatibility run: **45 passed across 6 files** before the operation-replay stage. These overlap other results; do not sum them into a unique test total.
- Guarded operation-replay stage plus storage/outbox/offline regression subset: **60 passed across 7 files**, covering real SQLite replay/rollback/conflicts and simulated worker/cluster transport. See [the local command contract](LOCAL_COMMAND_CONTRACT.md) for its acceptance limits. Final root/type/build refresh follows this stage in the verification JSON.
- Refreshed full root suite after the operation-replay stage: **2,288 passed, zero failed across 324 files**. The final invalid-envelope guards also have a separate passing three-file targeted follow-up. Root build-mode TypeScript and API all-project no-emit checks pass after the storage changes. Changed storage/protocol/test files pass ESLint.
- Final operation validation/barrier/cluster follow-up: **24 passed across 3 files**. Final production Vite build refresh after the operation protocol changes: **all 7 pass, process exit 0**. The build emits existing large-chunk warnings; those are not a performance certification. No public source-map emission was enabled by this work.
- Repeated all **8 entry/activation/invalid-QR browser checks against the final bundles**: zero page errors and no horizontal overflow. These are entry checks, not authenticated all-feature acceptance.

## Current work-package status

| Package | Current status |
| --- | --- |
| W01 | Both type gates pass. Fresh full API run: 1,588 passed, zero failures, one opt-in test skipped across 173 files. Root catalog/recovery baseline: 2,314 passed; final financial follow-up: 63 passed. The verification ledger records the final frozen refresh when complete. |
| W02 | Captain store/KOT safeguards and common modifier validation repaired and regression-tested. QR customer required/min/max browser path passes. Remaining channel/browser revalidation still required. |
| W03 | Commit barrier, guarded operation-result ledger and complete internal recovery envelope implemented through direct/worker/cluster backends. Real SQLite replay/rollback/conflicts and lost-acknowledgement/leader-takeover tests pass. Financial callers and protected user-facing recovery workflows have not adopted these boundaries; EC-01 remains open. |
| W04 | Complete wire fingerprint, server revision/clock safeguards and reviewed client conflicts for four catalog domains tested, including actual mobile/desktop Chrome choices. Core exposes local revisions. Core/cloud revision bridging, other applicable entity domains and installed protocol acceptance remain open. |
| W05 | Existing order/payment architecture retained. Multi-branch API and QR browser-to-KDS acceptance expanded; real online payment/late-callback acceptance remains open. |
| W06 | Partial-refund/local-calendar reporting repaired with independent ledger fixtures. Full dictionary-wide analytics, cutoff history, exports and CRM acceptance remain incomplete. |
| W07 | Operational identity/collection restore and encryption policy repaired; unsafe independent balance rollback blocked. Complete database/object/key/stock recovery and off-site drill remain open. |
| W08 | Printer/device/Core source truthfulness repaired and locally tested; POS native library compiles. Real printer/drawer and aggregated fleet alert acceptance remain open. |
| W09 | QR drafts/retry/customer-order browser revalidation added. Every-role/every-page UI and remaining ordering findings are not fully verified. |
| W10 | Existing security regressions run as part of the API suite; no server authorization weakened. Full route/product/native/provider acceptance remains incomplete. |
| W11 | Bounded reusable-connection workload, three other load suites and a measured 45-second mixed-channel/KDS run pass. Production-like capacity and fleet SLOs remain unverified. |
| W12 | Evidence/reporting updated; no production pilot, release or new score certification. |

### Test-contract repairs

The isolated rerun of the earlier failing file groups initially produced 145 passes and 22 failures, including the newly explicit stale-entity contract. Repairs retain stronger behaviour:

- Quota tests check both key issuance and redemption with spare keys issued before capacity is filled; they no longer submit an undefined code after a legitimate issuance rejection.
- Shared feature quota changes are restored in `finally` to avoid contaminating later suites.
- Identity/menu edit fixtures supply verified owner/manager proof; implementation authorization was not relaxed.
- Restaurant identity tests require the existing stable generated fallback code, including later phone changes.
- QR legacy fixtures actually publish a valid menu and authenticate privileged menu changes.
- Kiosk visibility tests explicitly assert other origins are absent; operational consoles still see the appropriate branch orders.
- Multi-branch concurrent fixtures use their own branch's actual table and an explicit cash-at-counter choice.
- Payout fixtures verify funds become eligible after bank verification instead of weakening that requirement.
- Load harness uses one persistent listener, bounded reusable connections and waits for all outstanding requests even after a failed request. Returned HTTP 201 responses must include accepted business results and reconcile to persisted rows.

## Remaining programme

EC-01/W03 is still the major unfinished boundary: financial success must await an atomic durable local command before receipt, print, drawer, broadcasts or synchronization claim acceptance. Adding a flush after existing side effects is insufficient, and this continuation does not claim that fix.

Other remaining work includes complete client concurrency integration, full recovery scope/drills, financial dictionary-wide reconciliation, F01–F25 current browser acceptance, authorization/product matrices, signed existing-installation upgrades, provider/hardware acceptance, measured scale, fleet alerts and a release pilot. Record external acceptance as BLOCKED where the actual environment is unavailable. No production deployment, push or key rotation was performed.

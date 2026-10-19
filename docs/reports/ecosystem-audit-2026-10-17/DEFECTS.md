# Prioritized defect and risk register

Evidence labels: **reproduced** = executable observation; **source** = concrete code path reviewed; **risk** = consequence/scale not demonstrated. P1 findings block an unqualified commercial release claim. P2/P3 findings require scoped scheduling. No confirmed cross-tenant exploit is claimed.

Paths below are relative to repository root; [source index and hashes](SOURCE_INDEX.md) preserve the inspected implementation. Effort is relative engineering size, not a delivery promise: S = localized, M = multiple related components, L = cross-app/domain, XL = substantial storage/protocol change.

## EC-01 — Financial actions precede local durable acknowledgement

**P1 · reproduced storage boundary + source action callers · POS/Kiosk/Captain/local persistence · L–XL · high confidence in the boundary; native loss rate unmeasured.**

- Location: `packages/database/src/durable/durable_storage.ts`: setItem, enqueue, flush, close; `packages/database/src/db.ts`: notify/commitPending; financial action stores in POS and Captain.
- Reproduce: run the observation probe; write a sale, inspect health/readback, close before the queued write. Actual: value readable/health ok, no persisted sale. Expected: a UI promise of “saved” follows successful durable commit or clearly says storage is pending/failed.
- Root cause: synchronous repository success over asynchronous SQLite batching; callers do not await a local commit barrier.
- Impact: a crash/disk problem in this interval can invalidate a displayed receipt/KOT or queued sync. This is not proof of loss in every installed build.
- Fix/tests: an awaited transactional local command boundary for order, payment, stock and outbox effects; test delayed writes, disk-full, abrupt termination immediately after settlement and recovery before any network reconnect. Preserve essential offline service.

## EC-02 — Sync event identity omits material payload fields

**P2 · reproduced pure identity function · packages/sync/outbox.ts: contentFingerprint/toPushEvent · M · high confidence, rare timing condition.**

- Reproduce two copies of an order with the same updatedAt, totals and line IDs, changing only a zero-price modifier. Actual: different serialized modifier payload, identical event ID. The server intentionally deduplicates by this ID.
- Expected: distinct business mutations have distinct identities; retry of one mutation keeps its identity.
- Root cause: partial payload fingerprint plus millisecond timestamp. Impact: a modifier-only mutation in that condition can be mistaken for a replay.
- Fix/tests: persist a monotonic local revision/operation ID, or hash the full canonical mutation payload. Test modifier, payment allocation, discount, seat and metadata changes sharing a timestamp, plus dropped-response replay.

## EC-03 — Captain quick-add bypasses required options and quantity minimum

**P1 · reproduced store path + UI caller source · Captain · M · high confidence.**

- Locations: `captainStore.ts`: addItemToCart/updateCartQuantity; `CaptainTableWorkspaceModal.tsx`: Quick Add invokes empty modifiers, quantity one.
- Reproduce a dish requiring one bread and minimum quantity two. Actual: quantity one, zero selected choices. Expected: open required choices and honor configured quantity rules before KOT submission.
- Root cause: this entry point has not adopted the ordering-rule fixes present in other channels. Business/data impact: incomplete kitchen instructions and channel-dependent order validity.
- Fix/tests: shared add/configure/merge validation across main card, quick add, repeat order and held drafts; final ingestion review for legacy/offline clients. Test Captain → KOT → POS with identical fixtures to POS/Kiosk/QR.

## EC-04 — Future client clock silently dominates later entity edits

**P1 · reproduced actual entity service/database · EntitySyncService.pushEventsForRestaurant / changedAt · M–L · high confidence.**

- Reproduce a valid category with updatedAt in 2050, then a correction stamped now. Both return status ok/version one; the future-clock content remains.
- Expected: an explicit conflict/review or server-versioned update, not silent acceptance of an unapplied correction.
- Root cause: last-change-wins compares client timestamps and acknowledges the older payload as ok. A bad device clock can affect prices, availability, staff and configuration records governed by the same policy.
- Fix/tests: expected server revision/CAS, bounded clock-skew handling and explicit stale outcomes; preserve intentional offline merges. Test future/past clocks and two legitimate admins editing different fields.

## EC-05 — Recreating a QR order from backup loses identity and history

**P1 · reproduced actual restore database loop · BackupsService.executeRestore · M–L · high confidence.**

- Reproduce snapshot → remove only the disposable order → execute restore. Actual: original QR source becomes POS, publicOrderId disappears, original createdAt is not retained. Storage inspection/safety backup were stubbed in this probe; the real DB restore loop ran.
- Expected: reviewed restoration preserves source, public tracking identity, timestamps and valid relationships, or refuses an unsupported record.
- Root cause: the create/upsert field allowlist omits operational identity fields and uses new-row defaults.
- Impact: tracking cannot locate the restored QR identity; channel/date analytics change; restore counts can look successful despite incomplete recovery.
- Fix/tests: versioned recovery schema and explicit identity mapping; empty-target QR/Kiosk/POS restoration with tracking, receipts, branch membership and historical reports verified.

## EC-06 — Operational snapshots omit financial and inventory recovery evidence

**P1 · reproduced snapshot scope and restored entry count · BackupsService.buildRestaurantSnapshot/restorePlan/executeRestore · L–XL · high confidence.**

- Actual snapshot includes operational orders/entities but no OrderPaymentEntry, gateway attempt/refund or InventoryMovement recovery set. Recreated paid/refunded order had zero ledger entries.
- Expected: clearly advertised partial snapshot scope, with protected financial restoration rules; a separately verified full database/object/key disaster-recovery process.
- Root cause: older generic order/entity backup model predates the newer ledgers. The restore exclusion list does not fully explain those omissions.
- Impact: order status and reconstructed financial evidence can disagree after data loss. This is not proof that an operator's external infrastructure backups are absent.
- Fix/tests: define supported recovery scope; prevent partial snapshots from rewriting current settled financial history; add a coordinated full recovery set or documented PostgreSQL point-in-time recovery. Verify ledger, stock, guest identity and reconciliation in an isolated restored environment.

## EC-07 — Partial refunds disappear from sales and become open bills

**P1 · reproduced actual report queries · ReportsService.getRestaurantSales · M · high confidence.**

- Fixture: completed ₹100 sale, ₹100 collection, ₹20 return, PARTIALLY_REFUNDED. Actual: sales ₹0, order count zero, openOrders one. Net collection is independently ₹80.
- Expected: clearly separate original/gross sales, returns, net collections and outstanding balance. Neither gross nor net is zero in this example, and no amount remains to collect.
- Root cause: successful sale and open-order predicates only recognize exact SUCCESS rather than ledger/settlement semantics.
- Impact: misleading owner/platform totals, comparisons and exports; staff can misinterpret a returned order as unpaid.
- Fix/tests: one documented metric contract used by summary, branch/source trends and exports. Test full/partial refund, return on a later business day, credit and partial collection using independent paise calculations.

## EC-08 — Sales-day grouping uses database date instead of restaurant date

**P2 · reproduced actual SQL report · ReportsService.getRestaurantSales byDay query · M · high confidence.**

- Fixture: 1 October 20:00 UTC, Asia/Kolkata restaurant. Independent local date is 2 October; report returns 1 October with a UTC database session.
- Expected: documented restaurant/branch timezone and cutoff semantics, consistent with POS business-day reports.
- Root cause: createdAt::date depends on database session zone, without the restaurant operating profile.
- Impact: daily dashboards and settlement comparisons disagree across deployment timezones.
- Fix/tests: canonical business date or explicit timezone/cutoff grouping; test midnight/cutoff boundaries and multiple branches with different profiles. Preserve historical time semantics.

## EC-09 — Printer configuration fabricates readiness

**P2 · reproduced method, no hardware involved · PrinterService.autoConfigureKioskPrinter, called by Kiosk App startup · S–M · high confidence.**

- Reproduce with one configured printer marked OFFLINE. Actual: method reports success and sets READY without a hardware probe. Expected: configuration selection does not establish current connectivity or successful printing.
- Root cause: assigning default printer also updates health and lastTestAt. Impact: misleading kiosk/fleet readiness.
- Fix/tests: separate configured, reachable, queued, dispatched and hardware-confirmed states. Retain last real test result; test offline, paper-out, timeout and restart. Do not mark payment failed solely because printing failed.

## EC-10 — Reports confuse activated devices with online devices

**P2 · source · ReportsService.getSummary and ReportsPage Hardware Terminals · S–M · high confidence in formula, no current fleet-wide browser scenario.**

- Actual: active count uses registration status ACTIVE, “offline” is total minus ACTIVE; UI labels it offline. An active-but-stale terminal is not counted offline, while a revoked terminal can be.
- Expected: activation/registration and fresh operational health shown separately, using the existing deviceHealth helper already used elsewhere.
- Impact: Super Admin cannot trust this overview when diagnosing lost connectivity.
- Fix/tests: current/late/never-seen/revoked/locked devices with authoritative timestamps and explicit thresholds.

## EC-11 — Typecheck quality gates fail

**P1 for release pipeline · executed baseline · root/API test and QA types · S–M · high confidence.**

- Root no-emit check: eight errors including incomplete Order cast, mock callback typing and unresolved `/src/...` QA fixture imports. API all-project check: ten unknown-value errors in operations-expansion/service-maturity tests. API production-source check passes; all seven Vite bundles pass.
- Expected: declared CI typecheck commands pass for production, tests and QA fixtures without weakening strictness or merely excluding meaningful tests.
- Impact: CI/native release quality job can block publication, and transpiled passing tests do not establish type correctness.
- Fix/tests: correct fixture contracts/mock types and dedicated fixture module resolution; run the exact CI commands and affected tests.

## EC-12 — Brittle source assertions and evolving contracts obscure regressions

**P2 · executed root baseline + source · root test suite · M · high confidence; repeat results in TEST_REPORT.md.**

- Examples: startup test requires an asset path although the brand logo is an embedded data URL; activation-key tests assert specific old wording/JSX shape; a settlement test expects boolean true while concurrent POS work returns `{ok:true}`.
- Expected: behavioural authorization/persistence/UX assertions and explicit typed contract tests. A wording or safe asset-delivery change should not masquerade as a broken business flow.
- Root cause: source-text assertions and tests/callers evolving separately. Impact: noisy gates hide genuine defects; return-contract changes can also affect real callers and must be reviewed rather than dismissed.
- Fix/tests: inspect each failing assertion, retain the original business requirement and test the actual action/result. Do not delete or weaken tests to achieve green output.

## EC-13 — Test cleanup is unsafe when fixture creation fails

**P2 · source risk · e.g. test/sync-chaos.e2e.spec.ts afterAll · S–M · high confidence in undefined-ID pattern; no data-loss claim.**

- Actual cleanup calls deleteMany with a fixture ID variable that can remain undefined after a failed beforeAll. Undefined filters can become an unbounded cleanup in the shared test database.
- Expected: fixture ID validated before deletion, owned names/IDs recorded, and disposable database isolation.
- Impact: a setup failure can invalidate unrelated QA fixtures and later test results. Test setup blocks production databases, which limits scope but does not remove the QA hazard.
- Fix/tests: guard IDs and ownership; test failure before restaurant/plan creation; use per-run databases as this audit did after schema preflight failed.

## EC-14 — Per-restaurant serialization and finite pools need measured limits

**P2 · scalability risk, source · order/entity locks, SyncSequence, pool/admission services · M–L · medium confidence about bottleneck location; capacity unknown.**

- Actual order push takes ordered per-order locks and one restaurant entity lock for the transaction/batch. Pool/admission limits and clean retries exist, but branching a restaurant does not remove serialization.
- Expected: measured burst/reconnect limits, bounded waiting and a documented operational envelope before claiming 1,000 restaurants or 10,000 sessions.
- Impact: busy branches or reconnect bursts can delay otherwise independent work. No production throughput number is inferred from unit tests.
- Fix/tests: execute SCALABILITY.md stages, profile lock/pool/JSON costs, tune batch/admission sizes before redesigning locking. Keep correctness and commit-ordered cursors intact.

## EC-15 — Backup encryption can be disabled by missing/invalid configuration

**P1 deployment-dependent security risk · source · BackupStorageService.encryptionKey/describe · S–M · high confidence in conditional behaviour; production settings unknown.**

- An absent key returns null; an invalid key warns and also returns null. Snapshot writing can continue without API-side encryption.
- Expected: an explicit production policy, with fail-closed behaviour when encryption is required and a tested key-recovery procedure.
- Impact: sensitive snapshots may lack application encryption if operators misconfigure it. External disk/bucket encryption and actual production exposure were not inspected; no leak is asserted.
- Fix/tests: required-encryption policy and startup/health gates; invalid key, encrypted backup restore, external key loss and rotation/migration compatibility tests. Never print keys.

## EC-16 — Health and telemetry are useful but not an end-to-end service guarantee

**P2 · capability gap/source · QR metrics, runtime sync stats, local Core/native launch · M–L · medium confidence.**

- QR has p50/p95/p99 samples, sync has admission counters and devices report health. These are not demonstrated durable fleet-wide SLOs or outage alerts. Native POS also returns constant RUNNING from get_local_core_info and discards sidecar spawn errors while advertising discovery.
- Expected: actual readiness probes, last-good status, per-instance aggregation and alerts linked to the affected order/payment/device.
- Impact: the dashboard may not explain a failure without manual logs; an advertised local service may not actually have started.
- Fix/tests: fail sidecar launch, kill Core, disconnect a printer, lose a sync acknowledgement and delay a paid order; verify detection, alert, exact-task link, recovery and clearance. Export only sanitized diagnostics.

## Hypotheses explicitly not promoted to defects

- Entity restore missing an explicit service-level seq assignment: **rejected**; the database trigger advanced it from 2 to 4 in the probe.
- Every screenshot without images means production image serving is broken: **not established**; local asset/setup differences must be separated.
- No tenant isolation because clients carry IDs: **not established**; guards/context/RLS and branch constraints exist.
- Every root failure means a runtime bug: **not established**; stale assertions, timing and concurrent edits need classification.
- No payments/analytics/monitoring implementation: **false**; these are substantial real modules with specific remaining gaps.

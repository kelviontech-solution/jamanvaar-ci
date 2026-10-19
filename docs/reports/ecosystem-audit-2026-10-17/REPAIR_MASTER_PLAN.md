# JAMANVAAR: complete repair and verification plan

Date: 17 October 2026. Deliverable: implementation plan, not a claim that repairs have been completed.

Progress: [18 October implementation and verification](IMPLEMENTATION_2026-10-18.md). Read this before continuing work; it distinguishes current repairs, passing checks and unfinished work from the original plan.

## 1. Outcome and starting position

Make ordering dependable, money reconcilable, recovery demonstrable and daily operation understandable across Super Admin, Restaurant Admin, Kiosk Admin, QR Admin, POS, Kiosk, Captain, KDS and customer QR.

The current provisional scores are **Security 6.5/10, Code quality 6/10 and SaaS readiness 6/10**. Keep these separate. The engineering maturity estimate of 6.2/10 excludes unverified performance and full authenticated UX; it is not a complete product score.

**10/10 is the aspiration, not a promised outcome of this backlog.** Completing patches does not establish safe installed upgrades, live payment behaviour or sustained reliability. Reassess against the rubric in section 12 after collecting evidence. Any remaining critical unknown must remain visible, even if the UI and automated tests look excellent.

Sources:

- [Ecosystem assessment](REPORT.md), [defect register](DEFECTS.md), [scorecards](SCORECARDS.md), [test evidence](TEST_REPORT.md), [release gates](RELEASE_CHECKLIST.md).
- [Earlier ordering-flow assessment](../ordering-flow-audit-2026-10-17/REPORT.md).
- [Complete finding-to-work-package mapping](REPAIR_COVERAGE_MATRIX.md): all EC-01–EC-16 and F01–F25.

### Baseline limitations to preserve

- Ecosystem HEAD: `ccf17d93288ede1a1bdf7bb2c150adf84ec88e72`; the earlier ordering audit used `1fbe9342ffb31a9dbc61275ca65341bb0950fcb8`.
- Source fixes and uncommitted edits already exist for several earlier ordering findings. At planning time, eight application/API/type files are modified. Do not overwrite them or assume the older failures still reproduce.
- Final recorded root/API results: **3,763 passing and 28 failing tests**, plus failing root/API all-project typechecks. Some failures are stale contracts or harness problems; each requires classification.
- Seven frontend bundles and API production-source compilation passed. Eight browser entry checks passed; they do not certify every authenticated page or feature.
- Native crash durability, original-installation upgrades, real UPI app switching, physical printing, production recovery and production-like capacity remain unverified.

## 2. Execution rules

1. Capture the exact commit, working-tree diff and test environment before a repair batch. Preserve unrelated edits. Close findings only against the tested source identity.
2. Use small coherent changes with a specific failing regression, targeted checks, impacted builds and a rollback note. Avoid one enormous storage/payment/UI rewrite.
3. Keep the existing authoritative cloud operational order, `SyncedOrder`. Payment-attempt `Order` records and platform subscription invoices are different domains; do not merge them merely because their names overlap.
4. Keep financial effects, order lifecycle and fulfillment states related but separate. A kitchen ticket marked served does not prove money was collected.
5. Preserve offline POS, existing SQLite data, device identities, signing identities and updater verification. Never reset customer data to make a migration or update pass.
6. Use isolated, run-owned databases for destructive integration tests. Never run restore, cleanup or chaos cases against production or a shared development database.
7. Repair tests to enforce the intended behaviour. Do not weaken tenant privacy, owner proof, bank verification or quota checks to satisfy obsolete fixtures.
8. Features already implemented receive acceptance and simplification first. Additional dashboards cannot compensate for an incorrect ledger or a false readiness indicator.

## 3. Delivery sequence and dependencies

S = localized change; M = multiple related components; L = cross-app/domain; XL = storage or protocol migration. These are engineering sizes, not delivery-date promises. Refine estimates after the first stable baseline, including test, migration and installed-device work.

| Stage | Work packages | Dependency and release result |
| --- | --- | --- |
| A: establish trust in verification | W01 | Stable baseline, safe fixtures, meaningful passing type/contract gates |
| B: stop immediate correctness errors | W02, W06 initial report fixes, W08 initial health fixes, W07 encryption policy | Build on W01; independently reviewable fixes before broad architecture changes |
| C: make every accepted operation recoverable | W03 → W04; W05 alongside the shared contracts | Durable local commands, stable replay identity, explicit conflicts and one lifecycle |
| D: recover and reconcile the entire business record | W06 complete, W07 complete | Depends on agreed W03–W05 data contracts; verified financial reporting and isolated restore |
| E: complete daily journeys and secure releases | W08 complete, W09, W10 | Test against the stabilized contracts; native acceptance needs actual installed artifacts/devices |
| F: establish the supported operating envelope | W11 → W12 | Correctness first; measured load, recovery drills, pilot and independent rescore |

No unqualified broad rollout until the financial, durability, recovery and isolation gates pass. A narrowly scoped pilot needs its own recorded risk decision and supported feature set.

### First implementation batch

1. Inventory and protect current edits; reproduce only outstanding findings on a stable snapshot.
2. Guard cleanup ownership and create run-isolated fixtures before another broad integration run.
3. Fix root/API typing and review structured POS cart-switch results at every caller.
4. Close the Captain required-choice/quantity bypass with shared validators and cross-channel tests.
5. Correct partial-refund/date reporting with independent financial fixtures.
6. Remove fabricated printer/Core/device readiness and enforce required backup encryption configuration.
7. Begin the durable local command implementation only after its transaction and compatibility contract is reviewed.

These changes reduce known risk quickly while preparing the larger storage/recovery work.

## 4. Detailed engineering work packages

### W01 — Reliable build gates, contracts and safe test infrastructure

**Priority:** P1 for release gates; P2 cleanup risk. **Size:** M. **Findings:** EC-11, EC-12, EC-13.

**Primary scope:** root/API TypeScript and Vitest configuration, QA fixtures, `cloud/api/test`, affected root tests and POS cart-switch action callers.

Implement:

- Correct incomplete domain fixtures, mock callback types, QA alias resolution and unknown-value narrowing. Preserve meaningful test compilation and strict production types.
- Review the new `CartSwitchResult` contract in `packages/types/src/domain.ts` and all recall/settlement callers. Handle success, blocked and preserved-work outcomes explicitly; object truthiness is not a successful result check.
- Replace brittle source-text/old-label assertions with behaviour tests where appropriate. Retain accessibility, permission and business requirements behind those assertions.
- Classify the 20 API failures separately: actual defects, obsolete product contracts, fixture authorization, privacy expectations, and connection/load-harness failures. Reproduce connection failures in an isolated run before attributing them to capacity.
- Update fixtures for intentional restaurant-code fallback, feature catalog growth, verified-bank payout rules and owner identity proof. Confirm the intended product policy before changing expectations.
- Require a validated owned fixture ID before cleanup; track created records and use a run-specific database. Inject failures before and during setup to prove cleanup cannot become unbounded.
- Record ignored/quarantined tests with reason, owner and expiry. A release-critical test cannot disappear behind quarantine.

**Acceptance:** declared root/API typechecks pass; affected behavioural tests pass; setup-failure cleanup removes only owned fixtures; privacy and authorization negative cases still reject. All remaining suite failures have a diagnosis and repair, not merely a new expected value.

**Rollback:** test/config changes must not mutate operational data. Retain original business assertions in the change explanation when replacing brittle tests.

### W02 — One dish, customization and quantity contract

**Priority:** P1. **Size:** M. **Findings:** EC-03; F01–F03, F14.

**Primary scope:** `packages/validation`, shared business/types, Captain `captainStore.ts` and `CaptainTableWorkspaceModal.tsx`, existing POS/Kiosk add flows, QR cart merging and API ingestion/quoting.

Implement:

- Reuse a pure contract for required choices, allowed option IDs, min/max quantities, supported increments, merged lines and dietary eligibility. Keep channel-specific presentation outside the validator.
- Route Captain quick-add, normal add, reorder, held drafts and quantity edits through that contract. Open customization when necessary.
- Validate before KOT and final submission as well as before displaying the cart. Audit all alternative entry points, including recommendations and repeat-last-order.
- Revalidate existing POS/Kiosk/QR fixes rather than replacing them. Filter recommendations using the same restaurant-entered dietary declarations as the main menu.
- Define legacy/offline handling: preserve accepted historical prices and choices; return a clear review/conflict for an invalid new mutation. Never silently reprice a collected offline bill using today's catalog.

**Acceptance:** the same required-bread, min-two/max-three fixture behaves identically in all four ordering channels. Add three twice cannot create an invalid merged line. Invalid direct API input is rejected with a field-level correction; valid offline orders continue to reconcile.

### W03 — Durable local financial commands

**Priority:** P1. **Size:** XL. **Finding:** EC-01. **Depends on:** W01 and a shared command contract.

**Primary scope:** `packages/database/src/durable/durable_storage.ts`, `packages/database/src/db.ts`, local repositories/outbox, POS/Kiosk/Captain action stores; browser SQLite/OPFS and native persistence adapters.

Implement in stages:

1. Specify an awaited command result: committed, rejected, or outcome requiring recovery. Separate in-memory updates from persistent acknowledgement.
2. Introduce an atomic storage command for the relevant order, collection, inventory/loyalty effects and outbox entry. A simple asynchronous flush after several independent writes is not proof of atomicity.
3. Persist the operation ID and its result in the same transaction. Repeating one operation returns its prior result; it does not create another collection or stock movement.
4. Move financial action callers to the awaited boundary. Show “Saving on this device” until commit succeeds. Emit success receipts, sync notifications and automatic print side effects only after the appropriate commit.
5. Define supported storage modes. Detect unavailable durable storage, quota failures and browser fallback explicitly; do not advertise the same recovery guarantee for every fallback.
6. Migrate existing local data and pending outbox entries transactionally. Test rollback/restart at every migration boundary, with a local backup before migration.

**Acceptance:** terminate immediately before/during/after commit and restart without a network. A confirmed bill, its ledger effects and outbox are recovered together; an uncommitted action is clearly unconfirmed/retryable. Test disk-full, denied storage, delayed writes, worker/leader failure and two windows. No duplicate cash, loyalty or inventory effect occurs on retry.

**Rollback:** staged client rollout and backward-compatible schema/protocol expansion. Do not roll an old binary over a new local schema until compatibility is proven; prefer a forward repair if downgrade would destroy data.

### W04 — Reliable replay, concurrency and entity revisions

**Priority:** P1/P2. **Size:** L. **Findings:** EC-02, EC-04; measured limits later in EC-14. **Depends on:** W03 operation identity.

**Primary scope:** `packages/sync/src/outbox.ts`, `cloud/api/src/modules/entity-sync/entity-sync.service.ts`, order-sync service, shared sync DTOs and migration/schema support.

Implement:

- Persist a unique mutation ID/revision at creation. Retries retain it; genuinely different mutations receive different identities even within one millisecond and with unchanged totals.
- Cover modifiers, tenders/splits, discounts, notes, table/seat, source and material metadata. If a digest is retained, specify canonical serialization and version it.
- Use server entity revisions/expected-version checks for concurrency. Client timestamps remain descriptive, not the sole authority deciding which update wins.
- Return applied, duplicate, conflict or rejected outcomes explicitly. Do not report a silently ignored correction as applied. Preserve conflicting work for an authorized resolution flow.
- Maintain commit-ordered pull cursors, tenant scope and existing replay guarantees. Handle two device instances independently; a device-local counter alone is not globally unique.
- Introduce protocol negotiation and deterministic handling of older queued events before tightening validation.

**Acceptance:** zero-price modifier changes and split changes with identical timestamps both arrive; retransmission after a lost server response applies once. Test future/past clocks, reordered delivery, deleted entities, simultaneous edits, stale revisions, page boundaries and SSE loss followed by cursor catch-up.

### W05 — Canonical order lifecycle and auditable payments

**Priority:** P1. **Size:** L. **Findings:** F13, F17, F18, F20, F25; cross-app acceptance requirement.

**Primary scope:** existing order-sync/QR/payment/refund services, `order-payment-ledger.ts`, shared lifecycle rules, POS payment modal, Kiosk and QR checkout/status, Captain/KDS transitions.

Implement/verify:

- Document the current state transition table: actor, permitted previous state, expected revision, resulting state and audit event. Use the existing state names; resolve aliases rather than inventing a second lifecycle.
- Define item/station/expo completion and whole-order fulfillment. KDS served propagates to customer completion only when the whole applicable order is served; it does not settle an unpaid bill.
- Keep payment attempts, verified collections, outstanding amounts, refunds and merchant settlements distinct. A client callback, UPI deep-link return or payment-link creation cannot mark a bill paid.
- Use the existing ledger and verified provider events with transactional idempotency. Reject invalid signatures; reconcile duplicate/out-of-order events and late success. Never place provider network calls inside a long-held database transaction unnecessarily.
- Preserve one payment/order reference through retry and app switching. Unknown outcome offers verification/recovery; counter fallback needs a defined audited policy for an in-flight attempt, not an automatic second collection.
- Obtain authoritative quotes before payment; explain price/eligibility changes and require confirmation. Never silently remove a selected reward and charge the changed amount.
- Allocate only to enabled tenders. A partial cash entry may leave a remaining balance; it must not invent a disabled UPI allocation.
- Keep unresolved exceptions assigned and traceable. Refund initiation, confirmed refund and bank settlement are separate milestones.

**Acceptance:** online checkout opens before any paid confirmation; signed verification admits the paid order once. Cash-at-counter appears as unpaid and is settled once in the correct branch. Exercise cancellation, timeout, retry, late success, double-tap, two collectors, split tender, partial/full refund and KDS served before/after collection. Complete sandbox and limited live acceptance separately.

### W06 — Correct finance, loyalty, inventory and reporting

**Priority:** P1/P2. **Size:** L overall; report repair M. **Findings:** EC-07, EC-08, F16, F17; CRM regression scope.

**Primary scope:** `cloud/api/src/modules/reports/reports.service.ts`, ledger-backed read models, shared pricing/loyalty calculations, owner/platform reports and PDF/CSV exports.

Implement:

- Publish one metric dictionary: gross sales, discounts, tax, returns, net sales, confirmed collections, net collections, outstanding credit, refund liability and settlement differences. Specify recognition date and exclusions for each.
- Repair partially refunded handling: a completed ₹100 bill collected ₹100 with ₹20 refunded retains the original sale, ₹20 return and ₹80 net collection; it is not a zero-sale open bill. Derive outstanding from obligations and ledger effects, not a single SUCCESS enum check.
- Group days using the agreed branch timezone and business cutoff. Keep order-sale day, collection day and later refund day distinguishable. Preserve historical time semantics when settings change.
- Reconcile restaurant/branch/source summaries, trends, top items, day close and exports to the same filtered persisted data. Source categories include POS/Captain/Kiosk/QR without treating device UUIDs as channel names.
- Revalidate consistent optional loyalty redemption: 150 points can buy the configured ₹100 reward, not automatically ₹150. Apply earning/redemption once on the defined collection milestone, including partial payments, cancellation, refund and replay.
- Reconcile inventory movements and historical price/cost snapshots. Sold bills keep their original price/tax/cost evidence after menu changes.
- Improve export clarity with restaurant/branch identity, date scope, timezone and metric definitions; include PDF design and CSV escaping tests where affected.

**Acceptance:** independent integer-paise fixtures reconcile across API, dashboard and export. Include unpaid/cancelled/void/partial payment, later-day refund, discounts, taxes, rounding, house credit, business cutoff and branch/source filters. Verify ledger and stock conservation under replay and refund.

### W07 — Faithful backups, protected restores and encryption

**Priority:** P1. **Size:** XL. **Findings:** EC-05, EC-06, EC-15. **Depends on:** W03–W06 recovery contracts.

**Primary scope:** backups service/storage service, versioned recovery schema, Prisma migrations if needed, Super Admin restore preview and infrastructure recovery runbooks.

Implement:

- Fix recreated-order mapping for source, public identity, original timestamps, branch/device attribution and linked tracking/receipt references. Test creation into an empty target, not only upsert over existing rows.
- Clearly name supported backup scopes: configuration/operational snapshot versus full disaster recovery. List every included/excluded data family in the manifest and preview.
- Provide a coordinated recovery method for orders, payment entries/attempts/refunds, stock and loyalty movements, auth/device relationships, published assets and required encryption material. This may use PostgreSQL point-in-time recovery plus object/key recovery; avoid building a competing database backup engine without need.
- Prevent partial snapshots from overwriting current settled financial history. Restore to an isolated environment first; block outbound payments, webhooks, emails and printing there.
- Enforce the production encryption policy. When encryption is required, absent/invalid keys fail the relevant backup readiness/write path rather than quietly producing plaintext. Preserve existing encrypted-backup compatibility and do not expose key material.
- Add checksum/authenticity validation, key identification, retention/access policy, off-site copies and recovery instructions. Test key unavailability and documented rotation without casually rotating current keys.
- Choose approved recovery-point and recovery-time objectives per deployment tier; measure both during a drill. A successful upload is not a successful restore.

**Acceptance:** restore into a new isolated environment and compare IDs, historical dates, guest tracking, paid/refunded balances, stock, loyalty, branch access and object availability. Record actual data-loss window and recovery duration. Test corrupt/missing backup, wrong key, old schema, interrupted restore and resuming safely. No outbound financial side effect is replayed.

**Rollback:** back up the target before any permitted restore; use preview, scope checks and an auditable execution record. Do not “undo” a restore by deleting real post-backup collections.

### W08 — Truthful devices, printing and local Core health

**Priority:** P2, release-critical for supported hardware. **Size:** M–L. **Findings:** EC-09, EC-10, EC-16; F21, F22.

**Primary scope:** `packages/api/src/printer.ts`, reports/device-health helpers, receipt/print queue, POS `src-tauri/src/lib.rs`, branch Core/legacy bridge readiness.

Implement:

- Separate registration, configuration, reachability and actual service health. Count stale ACTIVE devices as disconnected when appropriate; show revoked/never-seen separately.
- Printer auto-configuration chooses a destination; it cannot manufacture READY or last-test success. Preserve the last real test timestamp/result.
- Track receipt queued, dispatched, failed and confirmed outcomes only to the level supported by the printer protocol. If hardware acknowledgement is unavailable, say “sent to printer; completion unconfirmed”, not “printed”.
- Reprint deliberately with a copy indicator and original reference; payment success survives printer failure.
- Probe Core readiness and surface spawn failures; stop advertising a dead service. Distinguish the branch-core service from the legacy HTTP bridge before consolidating them.
- Link each operational alert to the exact affected bill/device/task and clear it after actual recovery. Export sanitized diagnostics with versions and correlation IDs.

**Acceptance:** offline printer, paper-out where detectable, blocked queue, dead Core, stale heartbeat, restart, duplicate print request and disconnected cash drawer. Test with actual supported hardware before claiming physical readiness.

### W09 — Complete customer and staff journeys; simplify the UI

**Priority:** P1 data preservation, P2/P3 usability. **Size:** L across apps. **Findings:** F04–F12, F14, F15, F19, F23, F24; additional audit UX observations.

**Primary scope:** existing POS cart/draft/payment views, Kiosk guest session/keyboard/receipt screens, customer QR drafts/recovery/help, shared owner/admin shell and scoped setup checklists.

Implement/verify:

- POS: guard every cart replacement; preserve or explicitly discard current work. Persist active draft identity, customer, table, notes, discounts and selected reward after recall/settlement switching. Reset editor-local state for a different guest.
- Checkout: sticky total/remaining/change and confirm action at 1366×768; retain keyboard access and accessible focus. Show uncommon split tools secondarily without hiding enabled payment methods.
- QR: retain checkout fields when reviewing the cart, refreshing a quote or recovering from MENU_CHANGED. Show changes in place, explicit retry and a definite error state. Never charge from an unverified stale quote.
- Secure order recovery: preserve the existing signed guest-ownership boundary. Add a scoped expiring recovery method or verified-contact recovery where appropriate; public order IDs alone cannot grant access. Explain original-tab limitations until a secure method is available.
- Kiosk: use configured phone verification or a clearly unverified contact flow; never display a locally generated code as proof of phone ownership. Restrict profile/points access accordingly.
- Provide appropriate touch keyboards for all customer text inputs, visible field/focus and email/phone layouts. Keep receipt sending/sent/failed states on screen; pause inactivity during typing/sending and clear PII/rewards between guests.
- Keep internal KOT IDs and printer repair controls behind staff access. Guests need token, collection place, paid/due state and Call Staff.
- Retry enabled QR service-help discovery with an appropriate fallback. Apply dietary filters to every recommendation/add surface.
- Pause receipt dismissal during interaction; retain Last receipt. Use friendly terminal/table names and truthful local-save/sync/kitchen statuses.
- Owner setup: purchased → branch enabled → configured → verified ready. One console with relevant product sections, clear restaurant/branch/terminal setting scope, guarded drafts and useful preview. Skip table/printer requirements for setups that do not need them.

**Acceptance:** authenticated page/action coverage by role, mobile and touch layouts, no lost carts/notes, no cross-guest contact/reward leakage, no obscured primary action, complete status/error/empty/loading states. Representative owners/cashiers complete tasks without developer guidance; record mistakes and retest the fixes.

### W10 — Security, product authorization and installed release acceptance

**Priority:** P1 for any confirmed authorization/signature defect. **Size:** L. **Scope:** verify and harden existing controls, not an assertion they are absent.

**Primary scope:** API route families, tenant context/RLS, role/branch/entitlement services, QR guest proof, native capabilities, five Tauri wrappers, Gradle/Rust/frontend builds and release workflows.

Implement/verify:

- Build a route-family matrix for restaurant/branch/device/role/product access, including list/detail/export/bulk actions, media, SSE and recovery endpoints. Test guessed IDs, disabled plans, revoked devices and background jobs with a non-bypass-RLS database role.
- Verify simultaneous activation respects branch/product quotas transactionally. Test QR-only, Kiosk-only and all-product onboarding and branch-specific allocations with no client-side elevation.
- Define cached offline entitlement validity, expiry warnings and reconnect revocation. Preserve already accepted bills and queued sync; never erase local data on expiry. Enforce privileged server actions on the server even if the client is patched.
- Check secret history/artifacts, logging redaction, session storage, uploads, backup access, origin/CSRF policy as applicable and sensitive-endpoint rate limits. Audit clean dependency results without treating them as a complete security audit.
- Verify least-privilege Tauri capabilities/IPC validation, release optimization/symbol policy, no unintended public source maps, no development URLs/debug settings. Use supported R8 release optimization for Java/Kotlin; it does not protect all bundled Rust/JavaScript.
- Build all supported native product/platform/architecture combinations. Preserve package/application IDs, version continuity, original Android signing certificates and Tauri updater keys. Authenticode and updater signatures serve different purposes.
- Upgrade the currently distributed installation, keeping SQLite, pending sync, printer settings and device identity. Reject altered/wrong-signature/wrong-architecture/downgrade artifacts as required by policy; verify the installed version after restart.

**Acceptance:** negative authorization cases reject without data leakage; valid role/product flows work; patched local plan flags cannot unlock server authority. Original-signed upgrades retain operational data and reject tampering. Missing original release keystore or trusted signing configuration is a recorded blocker, not permission to create a replacement identity. Reverse engineering remains possible; score practical exposure reduction honestly.

### W11 — Measured scale and operational visibility

**Priority:** P2; required before capacity claims. **Size:** L. **Findings:** EC-14, EC-16. **Depends on:** correctness gates above.

**Primary scope:** existing admission/pool/lock/SSE services, reports/backup queries, sync telemetry, alert ingestion and deployed monitoring.

Implement/verify:

- Reuse existing SSE, PostgreSQL notifications, cursor catch-up and admission controls. Measure before introducing another broker, microservice or database.
- Instrument request latency, lock/pool wait, transaction duration, provider calls, sync oldest age, retry/dead-letter count, event-to-screen delay and per-instance resources. Aggregate fleet metrics durably with tenant-safe access.
- Profile batch size, tenant-lock fairness, polling costs and report/export/backup memory. Bound or stream large reads without silently returning incomplete financial exports.
- Establish a deployment connection budget across API replicas, workers, listeners and tools; preserve capacity for auth and customer checkout during catch-up.
- Exercise 10 → 100 → 1,000 restaurant scenarios and 10,000 mixed sessions only as staged workloads, not supported-capacity promises. Add multi-instance/proxy/provider limits and a generator that can sustain the workload.
- Set approved latency, error and recovery objectives before the benchmark. Existing suggested sync warning thresholds are tuning starting points, not contractual SLAs.

**Acceptance:** publish hardware/configuration, source hash, active workload, p50/p95/p99, failure rate, maximum queue age, recovery time and financial duplicate count. Sustain realistic rush/reconnect/report/backup mix, show fairness and bounded recovery, and demonstrate alert detection and clearance. Document the actual supported envelope and headroom.

### W12 — Release evidence, pilot and independent rescore

**Priority:** final release gate. **Size:** M plus observation time. **Depends on:** relevant W01–W11 acceptance.

Implement:

- Produce a release evidence bundle: exact source/artifact identities, migration results, all relevant tests, browser action coverage, financial reconciliations, restore drill, native signatures/upgrades and remaining risks.
- Start with controlled representative restaurants, including one all-product multi-branch setup and one simple standalone product setup. Stage the rollout and monitor original clients reconnecting.
- Include at least a full trading cycle, shift/day close, an offline/reconnect exercise and the relevant scheduled/overnight jobs; extend observation when defects or infrequent operations require it. Choose the observation window before rollout.
- Define pause/recovery triggers: confirmed order loss, duplicate collection/stock effects, tenant escape, failed recovery or broken installed upgrades. Keep a supported forward-repair path for irreversible migrations.
- Re-run the scorecard against the evidence and obtain review by someone other than the patch author. Record residual risks, untested configurations and next review date.

**Acceptance:** all in-scope release-critical gates pass, no unexplained financial discrepancy or unresolved P1, demonstrated recovery and usable daily tasks. A high score follows this evidence; it is not assigned in advance.

## 5. End-to-end test matrix

Use deterministic fixtures with known paise totals, modifier rules, loyalty balances and branch entitlements. The rows below are scenario families; expand each into executable cases rather than calling one broad test “all flows”.

| Scenario family | Required assertions |
| --- | --- |
| One restaurant/one branch/POS only | Relevant setup only, cash shift, valid offline bill, receipt, reconnect, no unlicensed QR/Kiosk authority |
| POS + Captain | Table/order sharing, required customization, KOT delta, bill request, one collection and correct customer instructions |
| Multiple POS terminals | Concurrent collection conflict, held-cart isolation, shared table updates, unique tokens and stable replay |
| Multiple KDS screens/stations | Item revisions, simultaneous ready/served, partial station completion, restart and canonical whole-order status |
| Multiple Captain devices | Concurrent table edits, draft preservation, role/branch scope and delayed reconnect |
| Kiosk + Kiosk Admin | Activation branch/quota, distinct per-terminal design, publication acknowledgement, touch/receipt/privacy and counter settlement |
| QR-only product | Dedicated login/admin, published menu and optional restaurant page, table context, quote/payment/help/history/CRM according to enabled features |
| Bundled QR in owner console | All entitled QR features available without a duplicate admin silo; scoped settings and clear license explanation |
| Five branches, different products | Effective product/device limits, branch-specific menu/order/device isolation and correct restaurant aggregation |
| POS/Captain/Kiosk/QR together | Same authoritative records and correct source; no duplicate KOT/order/payment/inventory effect |
| Tenant/branch negative access | Restaurant A cannot read/mutate/export/subscribe to B; branch-limited staff cannot operate another branch; kiosk guest/session privacy preserved |
| Money | Manual/preset discount, reward opt-in, rounding/tax, split/partial cash, online cancel/retry/late success, partial/full/later-day refund |
| Stock/loyalty | Once-only movements, refund/cancel policy, concurrent last-stock order, repeat customer earning and restored balances |
| Recovery | Empty-target restore, original guest identity, historical reporting, no outbound side effects and measured RPO/RTO |
| Updates | Original Windows/Android installation → new signed release; restart/version check; SQLite/outbox/settings preserved |

## 6. Failure-injection acceptance

| Failure | Safe outcome |
| --- | --- |
| Server commits, HTTP response is lost | Same operation retries to the existing result; exactly one business effect |
| Client stops before/during/after local commit | Confirmation reflects the commit boundary; restart recovers the full committed command |
| Disk full/denied storage/worker loss | Explicit save failure or recovery state; no false “saved” receipt |
| Zero-cost modifier/split edited in the same millisecond | Distinct mutation identity and complete server state |
| Device clock in 2050 or far in the past | No silent dominance; explicit revision/conflict handling |
| SSE/proxy/API interruption | Cursor reconciliation catches up without cursor gaps or unauthorized data |
| Gateway timeout then late success | Original attempt reconciled once; no uncontrolled second collection |
| Double tap/two cashiers/replayed webhook | One collection and correctly associated audit records |
| Printer/Core failure after paid order | Paid order remains paid; honest output state and safe retry/help |
| Backup corrupt/key missing/restore interrupted | Validation blocks unsafe recovery, current data protected, recoverable execution record |
| License expires/revocation arrives after offline work | Defined policy and warning; prior accepted work/data retained; server authority enforced |
| App refresh/back navigation/session timeout | Correct draft restored; next guest cannot see prior PII or use prior reward state |

## 7. Browser and human acceptance

For every supported role/product combination, inventory routes and meaningful actions. Mark each **PASS, FAIL, BLOCKED or NOT APPLICABLE**, with source hash, fixture, viewport, expected/actual outcome and evidence path. Do not substitute screenshots for business assertions.

- Owner/admin desktop: include 1366×768 and a larger screen. Test sidebar, scope changes, editors, unsaved navigation, loading/empty/error states, permission locks, exports and exact-task alert links.
- Kiosk: 1080×1920 portrait master and supported landscape/smaller touch layouts. Test every customer input without a physical keyboard, timers, overlays, scroll and session reset.
- Customer QR: 360×740 and 390×844 mobile examples, plus real Android/iOS browsers and supported in-app scanning contexts. Verify UPI handoff/return on actual devices.
- Captain/KDS: actual deployed orientation and touch size; verify rush-hour visibility, station selection, priority ordering, search and reprint where entitled.
- Accessibility: keyboard/focus order, labels, readable errors, contrast, larger-text/touch presets, zoom and overlays. Automated checks complement manual tasks.
- Human tasks: a new owner activates the purchased setup; cashier completes/recovers a bill; captain sends an accurately configured dish; kitchen serves it; guest pays and receives a receipt. Record steps, completion, errors and assistance required, then simplify the slow/confusing parts.

## 8. CI and verification execution

Run exact declared gates after W01; use a clean, stable source snapshot for release evidence. Commands below are planned checks, not new results from this documentation task.

```powershell
# From repository root
npm run typecheck
npm run typecheck --workspace=@jamanvaar/cloud-api
node node_modules/typescript/bin/tsc --noEmit --incremental false -p cloud/api/tsconfig.build.json
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot --no-cache
npm run build --workspace=@jamanvaar/cloud-api
npm run build --workspace=@jamanvaar/super-admin-web
npm run build:pos-admin
npm run build:pos
npm run build:captain
npm run build:kds
npm run build:kiosk
npm run build:qr-guest
npm run lint
npm run format:check
```

API integration command, **only after provisioning a disposable owned database and safe fixture configuration**:

```powershell
npm run test --workspace=@jamanvaar/cloud-api
```

Also run the staged [load plan](SCALABILITY.md), authenticated browser cases, native builds and hardware/provider tests appropriate to the change. Standard workspace builds may invoke asset preparation; capture generated changes and do not overwrite another task's asset work. Run source/dependency/artifact scans through existing tooling, with secrets excluded from logs.

Do targeted checks per patch, then the affected integration slice. Run the full declared suite at milestones and on the release candidate. Do not repeatedly run expensive full suites without a new change or unresolved failure justifying them. Triage pre-existing lint/format debt explicitly; do not mass-format unrelated source or relax gates to conceal new violations.

## 9. Migration, compatibility and rollout controls

- Expand compatible schemas/contracts first; migrate data; deploy readers/writers that understand both versions; retire old paths only after installed-client coverage is established.
- Include browser cached/service-worker clients and long-offline native installations in compatibility tests. A new server must give an old client an actionable upgrade/conflict response, not silently drop its bills.
- Snapshot/validate local and cloud data before a destructive migration. Compare counts and ledger invariants afterwards.
- Use supported release channels/feature controls for staged rollout. A feature flag is not authorization and cannot replace server checks.
- Keep provider webhooks and background jobs idempotent across mixed server versions. Test rolling restart and job leases across replicas.
- Version backup/protocol/export formats; document unsupported conversions. Prefer additive audit corrections to overwriting financial history.
- Prepare rollback or forward repair per package. A binary rollback alone cannot safely reverse every database or financial migration.

## 10. External acceptance dependencies

These need access to the appropriate environment when execution reaches them. They do not prevent the earlier local repairs.

| Required evidence | Dependency |
| --- | --- |
| Real UPI checkout/app choice, late callbacks and refunds | Configured merchant sandbox, then a controlled live acceptance account/device; no credentials in source/logs |
| Existing APK upgrade | Original installed APK and original secure release signing configuration; preserve package/certificate identity |
| Existing Windows upgrade | Distributed installation, trusted updater signing process and supported architecture; Authenticode where configured |
| Printer/cash drawer completion | Supported physical models/connections and deployed driver/protocol |
| Production-equivalent disaster recovery | Off-site storage, keys, database backup/PITR and a private isolated recovery environment |
| Deployment capacity | Representative infrastructure/proxy, external generator and agreed workload/objectives |
| Owner/cashier usability | Representative staff running realistic tasks without developer coaching |

No production deployment is performed or implied by this plan. Record missing acceptance as BLOCKED; do not replace it with a simulated PASS.

## 11. Milestone exit gates

| Milestone | Must be true before closing |
| --- | --- |
| M1: trustworthy baseline | Type gates and test-safety pass; contract failures classified/fixed; source snapshot recorded |
| M2: valid orders and truthful screens | Cross-channel dish rules pass; report and device-health repairs verified; no known unsupported cart mutation |
| M3: financial durability | W03–W05 crash/lost-ACK/concurrency cases pass; no duplicate or missing committed effects |
| M4: recoverable business | Empty-target restore reconciles identities, financial/stock/loyalty records and assets; encryption policy/key recovery verified |
| M5: complete supported journeys | Role/product browser action matrix passes; real provider/hardware/native upgrade acceptance attached |
| M6: measured release | Agreed operating envelope demonstrated, alerts/recovery drilled, pilot completed and residual risks reviewed |

Unresolved financial loss/duplication, tenant escape, invalid signature acceptance or inability to recover supported customer data blocks release regardless of milestone averages.

## 12. How the scores will be reassessed

The following ten equally weighted review areas per score are a transparent rubric for the next assessment. Rate each area **0 = absent/known unsafe, 0.5 = implemented but incomplete acceptance, 1 = passes its documented in-scope acceptance with reproducible evidence**. Keep critical blockers separate: a failed isolation or recovery gate cannot be hidden by nine passing areas. Compare with the earlier provisional judgments transparently; do not claim the new rubric is an identical historical measurement.

| Security: ten review areas | Code quality: ten review areas | SaaS readiness: ten review areas |
| --- | --- | --- |
| Authentication/session lifecycle | Production/test type gates | Product/branch-aware onboarding |
| Role and privileged-action authorization | Behavioural contract tests | Tenant and branch isolation |
| Tenant/branch/data isolation | Shared domain rules and lifecycle | Accurate quota/entitlement enforcement |
| Server product/device entitlement checks | Durable transaction boundaries | Durable offline/reconnect operation |
| Guest/customer ownership and privacy | Replay/conflict correctness | Ledger/report reconciliation |
| Payment/webhook integrity | Readable module responsibilities | Faithful backup and measured recovery |
| Backup encryption/access/key recovery | Useful static/lint/build gates | Verified integrations/hardware |
| Secret/log/artifact exposure controls | Compatible versioned migrations | Signed installed upgrades |
| Native IPC/update/signing integrity | Safe isolated test infrastructure | Supported measured capacity and alerts |
| Abuse controls and security regression review | Maintained documentation/dead-code policy | Complete usable role-specific journeys |

For dead code, start with import/export and runtime-route evidence; verify dynamic imports, native entry points, registry references and migrations before removal. Delete in small reviewed batches with affected builds. Do not delete operational recovery paths merely because a static scanner reports them unused.

**A 10/10 result means all documented review areas pass for the named versions, platforms and deployment scope, with no unresolved critical blocker.** It does not mean no unknown vulnerability exists, no future bug can occur or reverse engineering is impossible. Record untested platforms separately and renew the assessment after material changes.

## 13. Completion record required for every finding

Maintain the coverage matrix with: finding ID, current reproduction, owning work package, changed files/commit, regression test, browser/native/provider evidence where applicable, migration/rollback note and closure status.

Use **OPEN → REPRODUCED → FIXED IN SOURCE → VERIFIED**, with **BLOCKED** for required external acceptance and **NOT REPRODUCED ON CURRENT VERSION** when an older report is superseded. Only VERIFIED counts as an accepted repair. A source fix, passing probe that reproduces a defect, or successful bundle alone cannot close the finding.

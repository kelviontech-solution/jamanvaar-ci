# JAMANVAAR ecosystem engineering audit

**Start here for current progress:** [19 October status, separate scores, verification and remaining work](CURRENT_STATUS_2026-10-19.md). Earlier sections and stage notes below retain their historical scope.

**Latest sync follow-up:** [Entity-sync data before cursor acknowledgement](ENTITY_SYNC_2026-10-19.md), with [verification evidence](ENTITY_SYNC_VERIFICATION.json), extends the persisted-data barrier to catalog/customer/inventory pulls and prevents empty-page rebroadcasts. This remains an incomplete programme, with source and acceptance work listed in that report.

**Latest implementation:** [Manager-reviewed interrupted POS recovery](INTERRUPTED_OPERATION_RECOVERY_2026-10-19.md), with [separate verification evidence](INTERRUPTED_OPERATION_RECOVERY_VERIFICATION.json). Managers can resume an original local operation after refresh, review recorded balances and explicitly handle the draft before acknowledging recovery. Equivalent guided recovery in other apps and the remaining master-plan gates are still open.

**Latest 19 October follow-up:** [Inbound sync persistence and local-edit protection](INBOUND_SYNC_2026-10-19.md) repairs cursor advancement before acknowledged writes, swallowed inventory errors and pending-edit overwrite. The separate [ledger](INBOUND_SYNC_VERIFICATION.json) records the affected verification; remaining source and external acceptance gates are listed explicitly.

**19 October continuation:** [Cancellation, accepted pricing and recorded balances](CANCELLATION_BALANCES_2026-10-19.md) adds actual POS cancellation/recovery, retained accepted prices/taxes/discounts and shared balance semantics. Its [verification ledger](CANCELLATION_BALANCES_VERIFICATION.json) records 129 focused tests, 18 browser fixtures, both type gates and seven frontend bundles. The programme and broad release acceptance remain incomplete; scores are unchanged.

**18 October update:** see the [current repair reassessment](REASSESSMENT_2026-10-18.md) and [verification evidence](REPAIR_VERIFICATION_2026-10-18.json). The sections below retain the original audit observations; they are not a claim that every original defect remains unchanged. The repair programme remains incomplete.

Latest continuation: [Admin returns and POS reconciliation](ADMIN_RETURN_RECONCILIATION_2026-10-18.md), following [channel durability](CHANNEL_DURABILITY_2026-10-18.md). Each stage records its own verification scope and remaining gaps; earlier source fixes are not automatically production acceptance.

17 October 2026. Initial HEAD: `ccf17d93288ede1a1bdf7bb2c150adf84ec88e72`, main. Application changes appeared concurrently and were preserved; this is not a clean-commit release certification.

**The system has a substantial working architecture, but it is not 10/10 or ready for an unqualified broad commercial release.** Shared order synchronization, server entitlement enforcement, branch/device scoping, payment ledgers, real reporting and operational tools already exist. The main work is repairing correctness and recovery boundaries and proving the complete installed-device workflows—not adding another independent order engine or more administration screens.

This is a repository-wide engineering assessment with targeted runtime evidence. It is **not** a completed every-button audit of all authenticated screens, a production load test, live-payment acceptance, native upgrade test or security certificate. Those boundaries are explicit throughout the deliverables.

## Scores and readiness

The [detailed repair master plan](REPAIR_MASTER_PLAN.md) defines implementation stages, dependencies, regression tests, rollout gates and score reassessment. Its [coverage matrix](REPAIR_COVERAGE_MATRIX.md) maps every ecosystem and earlier ordering-flow finding, including existing fixes that need revalidation.

| Separate dimension | Original 17 October | Current provisional 18 October |
| --- | ---: | ---: |
| Security | 6.5 / 10 | **7.0 / 10** |
| Code quality | 6.0 / 10 | **7.0 / 10** |
| SaaS readiness | 6.0 / 10 | **6.5 / 10** |

The **original** weighted engineering maturity was **6.2 / 10 over 85% assessed dimensions**. It has not been recomputed as a current overall score; full UX and production performance remain unverified. [Method and original application scorecards](SCORECARDS.md).

Production readiness remains **NO-GO for an unqualified broad rollout** because of unfinished durable financial caller integration, recovery scope and operational acceptance. The declared type gates and fresh full API baseline now pass; current results and remaining limits are in the reassessment. No average overrides the financial/recovery blockers. No confirmed cross-tenant exploit is asserted.

## Top confirmed problems

| Priority | Problem and observed effect | Evidence |
| --- | --- | --- |
| P1 | A local accepted write/healthy readback can precede SQLite commit; immediate close loses the probe's value | EC-01, controlled local storage probe plus action caller review |
| P1 | Captain quick-add accepts a required-choice/minimum-two dish with zero choices and quantity one | EC-03, real store path and UI caller |
| P1 | A future-dated category edit blocks a later correction, but the correction returns ok with no revision change | EC-04, actual entity service/database |
| P1 | Restoring a missing QR order changes its source to POS, drops public tracking identity and resets its historical date | EC-05, actual restore DB loop with storage/safety side effects stubbed |
| P1 | Restaurant snapshots omit newer financial/inventory ledgers; the recreated paid/refunded order has no payment entries | EC-06, snapshot scope and restoration probe |
| P1 | ₹100 collected, ₹20 returned becomes ₹0 sales and one open bill in Super Admin's per-restaurant sales report | EC-07, actual report queries and independent ₹80 net collection |
| P2 | A sale belonging to 2 October in Asia/Kolkata is grouped under 1 October by a UTC database session | EC-08, actual report query |
| P2 | Automatic kiosk printer configuration changes an OFFLINE printer to READY without testing hardware | EC-09, actual method observation |
| P1 | Root and API all-project typechecks fail, although API production source and frontend Vite bundles compile | EC-11, executed checks |
| P2 | A modifier-only change at the same timestamp can reuse the preceding sync event ID | EC-02, executable identity probe; timing condition explicitly limited |

Additional source findings include activation-versus-online device counts, brittle/contract-drifted tests, unsafe cleanup after failed fixture setup, configuration-dependent backup encryption and unverified fleet readiness/capacity. [Complete defect register](DEFECTS.md) includes severity, code/function, reproduction, expected/actual behaviour, cause, impact, repair, regression criteria, confidence and effort.

## What worked or was ruled out

- Fresh provisioning applied **all 101 migrations** successfully in an audit-owned PostgreSQL database and seeded the catalogue.
- API production-source compilation passed. **All seven frontend Vite bundles built.** These are not signed EXE/APK or full deployment-asset acceptance results.
- The structured root repeat recorded **2,241 passing tests and eight failures**; the initial run's tax/source-scan timeouts did not recur. Remaining failures include stale source assertions and changing action contracts, so they are not counted as eight runtime product defects.
- The isolated API baseline recorded **1,522 passes and 20 failures** across 165 files. Activation, tenant isolation, security, webhook/refund, inventory replay and sync-chaos slices passed. Failed contract/privacy/load cases remain a red acceptance gate and are classified in TEST_REPORT.md, not dismissed or counted automatically as twenty application bugs.
- Eight current unauthenticated browser entry states recorded no page errors or document-wide horizontal overflow. Authenticated pages and integrations were not certified by those screenshots.
- Server order locks, processed-event idempotency, version/item merge, post-commit hints, periodic catch-up, branch/device guards, RLS and server licensing are real implementations.
- Gateway verification and payment/refund allocation logic exist; the payment shell and canonical operational order serve different purposes. Platform subscription payments remain a separate financial domain.
- A suspected restore cursor bug was **rejected**: a database trigger advanced the entity sequence during restoration. Explicit service-level seq assignment was not necessary.
- Current registry production npm audit returned zero advisories; limited tracked-text secret indicators found no matches. Neither is a full security or artifact assessment.

See [test report](TEST_REPORT.md), [sanitized test summary](TEST_SUMMARY.json), [backend observations](BACKEND_PROBES.json), [browser entry evidence](BROWSER_ENTRY_CHECKS.json), [source hashes](SOURCE_SNAPSHOT.json) and [route inventory](ROUTE_INVENTORY.json).

## Top recommended improvements

1. Establish an awaited durable local transaction boundary before accepting a financial action, then test crash/disk-full at that boundary.
2. Preserve QR/source/date identity and financial relationships during supported recovery; explicitly separate operational snapshots from full disaster recovery.
3. Apply one required-choice/quantity contract to every channel and add surface, including Captain quick add/repeat.
4. Replace silent client-clock dominance with server revisions, explicit stale outcomes and a documented offline merge policy.
5. Derive sales, collections, refunds, outstanding and business-day reports from one documented metric dictionary and independent financial test vectors.
6. Separate configured/activated from reachable/acknowledged/printed health, using actual observations and last-good timestamps.
7. Stabilize action return types and repair meaningful CI/type/test contracts without reverting improved product flows to satisfy old wording assertions.
8. Rehearse dropped-response replay, late gateway success, concurrent settlement, duplicate events and restored financial state as integrated scenarios.
9. Establish measured pool/lock/polling limits and fleet-level operational alert evidence before promising large deployment capacity.
10. Simplify owner/staff flows around the exact task and recovery action, with preserved unfinished work and clearly scoped settings.

## Most serious risks

**Business:** incomplete kitchen instructions, losing a locally accepted action during the persistence window, misleading sales/unpaid totals, and a recovery that reports restored records while losing tracking/financial meaning.

**Technical:** asynchronous local persistence behind synchronous business actions; client-time conflict policy; partial mutation identity; mismatched recovery/metric contracts; tenant-wide write serialization; insufficiently verified native/provider/hardware failure recovery.

**Security/deployment:** production backup encryption and transport/signing settings need explicit acceptance. Client modification cannot be treated as an authorization boundary. No private signing keys were generated, rotated or exposed; no production systems were attacked.

## Deliverables

| Document | Purpose |
| --- | --- |
| [Inventory](INVENTORY.md) | Applications/products, entry points, stack, authentication, dependencies, build/distribution, code/dead-interface candidates |
| [Architecture](ARCHITECTURE.md) | Current/recommended diagrams, authoritative records, dependency flow, entity ownership |
| [Defect register](DEFECTS.md) | Confirmed defects versus source risks, prioritization and regression requirements |
| [Data consistency](DATA_CONSISTENCY.md) | Transactions, local/cloud boundaries, ledger/replay/restoration invariants |
| [Security](SECURITY.md) | Controls, scoped findings, dependency/secret check and acceptance limits |
| [Scalability](SCALABILITY.md) | Bottlenecks, illustrative workloads, executable benchmark plan and monitoring targets |
| [Tests](TEST_REPORT.md) | Commands, counts, failures, exclusions and A–J scenario coverage |
| [Scorecards](SCORECARDS.md) | Separate scores, application dimensions, unknowns and weighted calculation |
| [Roadmap / first five repairs](ROADMAP.md) | Safe sequence, effort, dependencies, acceptance and simpler human flows |
| [Release checklist](RELEASE_CHECKLIST.md) | PASS/FAIL/BLOCKED gates and release decision |

## Work performed and limits

This task added audit documents, source/route inventories, observation probes and browser evidence. It did not implement broad application fixes, alter production infrastructure, migrate the existing shared database, send customer messages, charge money or replace signing identities. Disposable test data is cleaned up after evidence capture; unrelated concurrent source changes are retained.

The remaining work is concrete: repair the P1 items, obtain a green stable-commit baseline, then complete the authenticated cross-product, physical/native and payment/recovery acceptance matrix. More features should not obscure those unresolved checks.

# Repair reassessment — 18 October 2026

**The repair programme is not complete.** The original 17 October scores were Security 6.5, Code quality 6.0 and SaaS readiness 6.0. This reassessment reflects the current uncommitted checkout on `ccf17d93288ede1a1bdf7bb2c150adf84ec88e72`; it is not a production release certificate. Inherited edits were preserved. No deployment, push or signing-key change was performed.

Latest implementation stage: [Admin returns and POS online reconciliation](ADMIN_RETURN_RECONCILIATION_2026-10-18.md), following [channel durability](CHANNEL_DURABILITY_2026-10-18.md) and [POS checkout/protected local recovery](FINANCIAL_CHECKOUT_2026-10-18.md). These stages extend acknowledged commands to Kiosk draft/quote/admission, POS/Captain kitchen submission, Captain cancellation, POS returns, Admin local billing/Orders void and POS verified-online collection. The latest stage adds truthful partial-balance UI and its own verification ledger. **Other callers, legacy policy and installed/provider/hardware/recovery acceptance remain open; provisional scores are unchanged.**

## Separate provisional scores

Further update: [Entity-sync persistence](ENTITY_SYNC_2026-10-19.md) fixes early cursor acknowledgement for menu/customer/inventory pages and defers them during financial recovery. The preceding broad root gate passed 2,418 tests; this later source change has its own affected checks. Scores remain unchanged pending remaining package acceptance.

Latest implementation: [POS manager interrupted-operation recovery](INTERRUPTED_OPERATION_RECOVERY_2026-10-19.md). The database can resume the exact saved command without its original cart fingerprint, and the POS manager reviews balances and draft ownership before releasing recovery. This does not close guided recovery for every app or certify provider/hardware/native acceptance.

Further follow-up: [Inbound sync persistence and local-edit protection](INBOUND_SYNC_2026-10-19.md), with a package-by-package remaining-work table. This closes reproduced cursor/data ordering failures, not all sync concurrency or recovery acceptance. Scores are unchanged.

Latest follow-up: [19 October cancellation and balances](CANCELLATION_BALANCES_2026-10-19.md). The previously documented cancelled-bill activity fallback and POS running-dish removal gaps are fixed in that scope. Accepted-price/tax/discount recall has regression coverage; other W03/W06 acceptance remains open. Scores below are unchanged.

| Dimension | Previous | Current | Evidence and remaining limits |
| --- | ---: | ---: | --- |
| Security | 6.5/10 | **7.0/10** | Required backup encryption now fails closed; financial restore evidence requires server origin; stronger revision and input validation; clean local API regression. Complete route/role/product adversarial coverage, native tamper acceptance and production configuration review remain incomplete. |
| Code quality | 6.0/10 | **7.0/10** | Root/API type gates and the fresh full API baseline pass. The earlier root baseline passed; later broad refreshes exposed timeout-sensitive crypto/I/O tests, with focused correction runs recorded separately. Behavioural tests cover conflict review, recovery, rollback and Core isolation. Large synchronous stores, incomplete durable checkout adoption and legacy paths remain. |
| SaaS readiness | 6.0/10 | **6.5/10** | Restored order identity, partial-refund reporting, truthful device/printer health, revision review and bounded load evidence improve operation. Durable checkout integration, full recovery drills, provider/hardware/native upgrades and production capacity still prevent broad acceptance. |

These are conservative engineering judgments for the inspected scope, not measured reliability percentages. More passing tests alone cannot certify financial durability or make an installed payment flow work. No combined score is substituted for these dimensions, and no 10/10 claim is made.

## Repairs added during this continuation

1. **Catalog conflict review:** menu, category, modifier and tax edits carry expected server revisions scoped to the selected endpoint and identity. A concurrent edit preserves both versions and requires review. The menu editor shows the changed fields and offers “Use published version” or “Keep my edit and sync.” An outdated comparison cannot approve a newer change; deleted records cannot be resurrected. Guest publication refuses unresolved reviews. Branch Core exposes its own revisions; its cloud uplink still needs full revision bridging.
2. **Complete internal local recovery:** a transactionally consistent envelope includes collections and operation-result history. Empty-target restore preserves replay protection and rejects corrupt, duplicate or wrong-scope input. Direct, worker and cluster protocols are covered. This is an internal unencrypted envelope, not a completed customer backup/export feature.
3. **Failed financial mutations:** rollback now happens before observers, persistence and relay see a failed mutation. Nested external effects wait for successful outer completion. Settlement and cancellation use this synchronous rollback boundary. Stock batches, dish stock/availability and low-stock alerts roll back with orders and movements.
4. **Loyalty double debit:** a configured reward was debited by `commitOrderRedemption`, then a second generic debit could succeed if the customer still had enough points. The regression reproduced a balance of 740 instead of 890. Configured rewards now debit once. Legacy pending point requests use an order-keyed ledger debit before earnings and reject insufficient opening balance.
5. **Core uplink acknowledgements:** order and inventory results now match the original references rather than response-array positions. Missing, duplicated or unsolicited results cannot silently mark another job sent. Catalog acknowledgements require both the submitted payload and its local revision, so an edit changed away and back remains pending after an old acknowledgement. Real Core SQLite fixtures cover these paths.
6. **Credential entropy and PIN issuance:** missing Web Crypto now refuses secure key/credential generation instead of falling back to `Math.random()`. PIN issuance first samples unused strong candidates, retaining exhaustive fallback for a full space. Random-index inputs that cannot be sampled safely are rejected. Existing PBKDF2 parameters, issued PINs and stored hash formats are unchanged.
7. **Core isolation and kiosk privacy:** reject a wrong-restaurant roster; filter all downloaded branch records; refuse financial uploads with an unbound/wrong-branch credential; restrict kiosk reads/edits to their server-recorded creator. Add stock branch provenance, quarantine unprovable old cloud rows without deleting pending local work, and expose diagnostic counts. See [Core repair and rollout limits](CORE_ISOLATION_REPAIR_2026-10-18.md). Installed acceptance and guided historical reconciliation remain outstanding.

The initial rollback/loyalty repairs improved synchronous correctness. The latest stage additionally makes actual POS regular and SQLite Instant Bill checkout await the command boundary. EC-01 remains open for other callers, fallback policy and installed acceptance; see the linked implementation stage.

## Evidence

The [verification ledger](REPAIR_VERIFICATION_2026-10-18.json) records exact run summaries, scope and current source hashes. Earlier overlapping runs are not added together.

- The fresh full API run passed **1,588 tests across 173 files, zero failures and one opt-in scenario skipped**. It used a newly migrated, seeded run-owned local database and a non-bypass-RLS role. The live-fixture file was excluded. The owned database was removed after the run; shared databases were not changed.
- The full root run before the final loyalty/stock additions passed **2,314 tests across 328 files, zero failures**. Final follow-up results are recorded in the verification ledger after completion.
- The first frozen financial root refresh produced **2,313 passes and five failures across four files**. An isolated rerun confirmed two five-second timeout failures, in exhaustive tax matching and repeated PIN generation; the image checks passed in isolation. PIN generation now avoids the full-space shuffle in the usual case; exhaustive tax coverage retains every value with fewer matcher allocations. Dedicated crypto/image I/O tests have explicit budgets without reducing their work or changing production KDF settings. A later security subset passed 111 tests with one timeout in its 200,000 secure-draw distribution test; that unchanged sample set subsequently passed with its own 30-second budget. The latest full result, when available, is recorded separately. These are not represented as one clean original run.
- The subsequent broad root refresh completed **2,319 passes, four timeout failures across 329 files**. The remaining failures were two real encrypted-backup checks, the repeated whole-tree identity scan, and a packaged-image check. The source scan now reads each file once for all forbidden identities; image checks reuse existence results while retaining every item check. Explicit file/crypto budgets retain every backup/KDF/tamper assertion. The affected-file follow-up is separate evidence. Core source evolved while this long run was active; final Core results are recorded separately rather than calling that run a frozen release gate.
- The affected-file follow-up passed **87 tests across six files, zero failures**. This includes every assertion from the four failing broad-run cases; it is not a new clean full-suite run.
- Core branch/provenance/privacy/credential regression passed **84 tests across eight files**. Real API/Core integration passed **21 tests across three files**, including offline/reconnect, a dropped response, branch isolation and an actual scoped roster total. These are local integration results, not an installed fleet certification.
- After enforcing active/present branch status, the final Core/offline follow-up passed **75 tests across nine files**. It includes real offline POS SQLite, routing, QR order desk, Core authorization/HTTP privacy, encrypted backup operations and chaos scenarios. Its file selection differs from the 84-test subset; the counts overlap and must not be added together.
- Both type gates and all seven production Vite bundles passed after catalog/recovery integration. The final synchronous financial changes receive their own type and regression refresh.
- Final root `tsc -b` and API all-project `tsc --noEmit -p cloud/api/tsconfig.json` refreshes both completed with exit **0**. The later API roster/Core repairs have targeted runtime evidence above. Production Vite builds were not repeated for these server/Core-only changes.
- The actual menu review component passed **four Chrome checks**: both resolution choices at 390px and 1366px. There were no page errors or horizontal overflow. The fixture transport deliberately contains no live restaurant data. This is not an authenticated all-pages audit.
- The new high-balance loyalty and failed-inventory regressions both failed before the repairs. The final financial subset passed **63 tests across four files, zero failures**, including the subsequent insufficient-point and cancellation rollback cases. These overlap the full suite and are not added to its count.
- Earlier evidence remains useful within its stated scope: five real customer QR/API journeys, eight app-entry checks, real SQLite worker/cluster fault tests, a native library compile and a 45-second mixed-channel/KDS load run. They are not signed upgrade, hardware or production payment acceptance.

Reproduce the catalog UI check from the repository root:

```powershell
node docs/reports/ecosystem-audit-2026-10-17/catalog-review-browser.cjs
```

It builds a local fixture and opens headless Chrome on loopback port 5530. Results/screenshots go under ignored `.jamanvaar/`. It does not sign in to, mutate or inspect a production restaurant.

## Remaining work, in dependency order

### Original finding status

“Locally verified” describes the stated regression scope; it does not substitute for the production acceptance column of the master plan.

| Finding | Current status |
| --- | --- |
| EC-01 | **Partially implemented:** POS regular/SQLite Instant Bill, Kiosk draft/quote/admission, POS/Captain kitchen submission, Captain cancellation, POS returns, Admin local billing/Orders void and POS online reconciliation adopt acknowledged commands in the latest stages' stated scope. POS running-dish removal, sync admission, guided recovery, legacy policy and installed acceptance remain. |
| EC-02 | Locally verified: complete payload identity and late-acknowledgement protections. |
| EC-03 | Captain safeguards repaired and regression-tested; complete cross-channel/device acceptance still required. |
| EC-04 | Partial: explicit clock/version checks and catalog review implemented; Core/cloud revision bridging and other relevant entity domains remain. |
| EC-05 | Operational restore identity repaired and API-tested; complete recovery is tracked separately under EC-06/W07. |
| EC-06 | Partial: unsafe financial/balance rollback restricted; complete protected recovery workflows and drill remain. |
| EC-07 | Restaurant sales endpoint repaired and independently tested; dictionary-wide reports/exports reconciliation remains. |
| EC-08 | Local-calendar grouping repaired and tested; historical business-cutoff acceptance remains separate. |
| EC-09 | Status fabrication removed and local regression passes; physical printer failure/recovery remains unverified. |
| EC-10 | Locally verified: revoked, stale, never-seen and connected device classification distinguished. |
| EC-11 | Locally verified: declared root/API type gates pass, subject to final refresh recorded in the ledger. |
| EC-12 | Locally verified: clean full root/API runs replace the failing baseline; final financial follow-up is recorded separately. |
| EC-13 | Locally verified: unsafe undefined-ID cleanup rejected; owned-database teardown demonstrated. |
| EC-14 | Partial: bounded and short sustained local load passes; production-like limits/fairness/recovery remain. |
| EC-15 | Required encryption policy repaired and encrypted/tamper regressions pass; actual off-site/key-loss drill remains. |
| EC-16 | Partial: actual bounded Core readiness and truthful local health; fleet incident/SLO acceptance remains. |

### Work packages

| Work | Actual remaining requirement | Acceptance environment |
| --- | --- | --- |
| **W03 / EC-01 — financial durability** | POS regular/SQLite Instant Bill plus the latest Kiosk submission, POS/Captain kitchen and POS return actions retain original commands and await SQLite. Finish the specific remaining callers listed in the channel stage, guided pending-operation recovery and legacy storage policy. | Local SQLite and component/OPFS fixtures are documented by stage. All-channel and installed-device crash/close acceptance remain. **Primary remaining source blocker.** |
| **W04 — concurrent editing** | Extend reviewed revision handling beyond the four catalog domains where appropriate. Bridge Core/cloud revision histories without treating unrelated local/cloud version numbers as interchangeable. Verify original channel/creator attribution on relayed uploads and direct-cloud failover. Reconcile quarantined historical mirrors through a guided authorized process. Verify multi-device table amendments and deletion. | Local Core/cloud integration and multiple installed terminals. |
| **W05 — order/payment lifecycle** | Finish channel/state and retry matrices, provider cancellation/late callback/duplicate collection/refund/counter-fallback journeys. Preserve original references on unknown outcomes. | Local regressions plus configured payment sandbox and customer devices. No live collection was attempted. |
| **W06 — financial reconciliation** | Apply one metric dictionary across dashboards, cashbooks, exports, cutoff histories and CRM refund/reward flows. The repaired restaurant sales endpoint is an order-created cohort, not a refund-date cashbook. | Independent persisted financial fixtures, then browser reconciliation. |
| **W07 — recoverability** | POS protected local export/verification and an encrypted empty-target replay drill added; unsafe JSON history/ownership replacement blocked. Finish the installed restore workflow, complete database/object/key/stock/loyalty recovery, supported migrations and key-loss procedures. | Disposable local targets plus genuine installed/off-site recovery environments; file verification alone is not a complete disaster-recovery drill. |
| **W08 — operations** | Complete fleet incident detection and exact-task recovery; confirm printer, drawer and sidecar health with actual devices. | Local injected failures plus physical hardware. |
| **W09 — channel/user experience** | Formally revalidate F01–F25 against the current build and all relevant roles. Finish every supported add/edit/hold/recall/payment/receipt/mobile/accessibility route; do not infer success from entry pages. | Authenticated browser fixtures plus touch/native devices. |
| **W10 — security acceptance** | Finish endpoint/role/tenant/product/branch matrices, secret/artifact review and reconnect/revocation/native tamper cases. | Local security fixtures and genuine signed release artifacts. |
| **W11 — measured capacity** | Measure sustained production-like tenant load, lock/pool fairness, retry storms, failure recovery and fleet alert SLOs. | Representative infrastructure; the local short run is not a production limit. |
| **W12 — release pilot** | Verify existing-installation Windows/Android upgrades with original identities and keys, local data retention, rollback/recovery and a bounded restaurant pilot. | Existing signed installations, original secure signing configuration, provider/hardware acceptance. |

Source work and missing external acceptance are separate. Missing physical devices or signing acceptance does not explain away the still-unimplemented financial caller integration. W03 must be completed before claiming that local checkout is safe under storage failure.

The original audit contains 16 findings and the earlier audit 25 ordering findings. Several overlap or have partial repairs. There is no defensible single “bugs left” count obtained by subtracting passing tests from those numbers. The table above describes ten unfinished work packages; W01 now has passing gates and a clean full API baseline, while W02 has local fixes with cross-channel acceptance remaining.

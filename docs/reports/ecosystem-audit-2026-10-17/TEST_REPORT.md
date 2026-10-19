# Test and verification report

All execution was local. No production migration, real-money payment, external customer message, physical printer action or signing-key rotation was performed.

## Baseline commands and outcomes

| Check | Outcome | Evidence / limitation |
| --- | --- | --- |
| Initial Git state | PASS | main, HEAD ccf17d93288ede1a1bdf7bb2c150adf84ec88e72, initially clean; concurrent application edits later appeared and are preserved |
| Root `tsc --noEmit --incremental false` | FAIL | Eight errors: Order fixture cast, mock callback type and unresolved QA fixture imports |
| API `tsc --noEmit --incremental false -p tsconfig.json` | FAIL | Ten errors in operations-expansion/service-maturity test types |
| API production-source `tsc --noEmit --incremental false -p cloud/api/tsconfig.build.json` | PASS | Distinguish production source compilation from test/QA gate failures |
| Root Vitest initial, maxWorkers=2, no cache | FAIL | 321 files: 312 passed/9 failed; 2,249 tests: 2,238 passed/11 failed; 816.84 seconds |
| Root Vitest structured repeat, maxWorkers=4 | FAIL | 321 files: 314 passed/7 failed; 2,249 tests: 2,241 passed/8 failed; all zero pending. Fresh structured summary is in TEST_SUMMARY.json. |
| Existing test DB preflight/API attempt | BLOCKED; stopped | Local non-superuser, no RLS bypass, but five pending migrations and missing Restaurant.digestEnabled. Not counted as product failures. |
| Fresh audit-owned DB migration/seed | PASS | All 101 migrations applied and catalogue seeded; original shared test DB not migrated/reset |
| Isolated API baseline | FAIL | 165 files: 151 passed/14 failed; 1,542 tests: 1,522 passed/20 failed, zero pending; approximately 1,206 seconds. Four named sustained/load suites and the opt-in live fixture excluded; other bounded stress cases still ran. |
| Seven frontend Vite bundles | PASS | Super, shared Admin/QR product entry, POS, Kiosk, Captain, KDS, QR. Public asset copy skipped; audit hook supplied service worker needed by app-shell plugin. This is not native packaging or full deploy-asset acceptance. |
| Local observation probes | Reproduced four observations | Storage commit gap, payload fingerprint collision, Captain validation bypass and fabricated printer readiness. Passing probes document defects, not successful repair. |
| Backend/service probes | PASS as observation harness | Seven observations in BACKEND_PROBES.json, using uncommitted disposable fixture data and real service/database code; not HTTP authorization or disaster-recovery certification |
| Browser entries | PASS within limited scope | Eight unauthenticated entry/activation/invalid-QR states, no recorded page errors or document-wide horizontal overflow. Does not cover all authenticated screens/actions. |
| Production npm advisory check | PASS | npm audit --omit=dev returned zero production advisories; Rust/platform and application security not established by this result |
| Limited tracked-text secret indicators | No matches | No tracked .env; bounded pattern scan only, not full Git history/entropy/binary analysis |

## Remaining root failures in the structured repeat

| File | Observation / interpretation |
| --- | --- |
| jamanvaar_startup_experience.test.ts | Expects a brand-assets PNG path; source provides an embedded image. Delivery-contract assertion needs review; not proof of missing logo. |
| owner_daily_flow.test.tsx | Navigation group/location assertion fails. Verify desired current information architecture rather than treating an old grouping as universally correct. |
| pos_admin_report_data_engine.test.ts | Expects an inactive Tandoor row; current implementation derives rows from actual KOTs. Decide whether empty configured stations belong in the report, then test that contract. |
| pos_cashier_ux_overhaul.test.ts | Expects boolean true from recall; concurrent POS work returns structured outcome. Review all callers and update contract tests together. |
| restaurant_admin_kiosk_terminals_cta.test.ts | Asserts the former Support redirect, which the newer guided kiosk setup replaced. Old behaviour should not be reintroduced simply to pass. |
| super_admin_qr_activation_key_label.test.ts | Two source-text assertions depend on old warning wording and JSX shape. Retain behavioural entitlement denial tests. |
| usability_financial_integrity.test.ts | Expects boolean true from load-for-settlement; concurrent work returns structured outcome. Actual settlement identity/idempotency must remain covered. |

The repeat no longer had the initial tax-split/source-scan timeouts. Tests were not modified or weakened to make that happen. Concurrent POS source changes and resource contention limit clean-commit attribution.

## API failures and interpretation

The sanitized summary records every failed case. Twenty failing assertions do **not** establish twenty exploitable or customer-facing defects.

| Files / cases | What the evidence supports |
| --- | --- |
| branch-devices-config | Test expects a branch POS to rename the master dish after pushing back its branch price. Current authority rules need review before weakening catalogue protection. |
| device-limit, feature-disable-impact-and-quotas, merged-admin-access, multi-family-subscriptions | Quota/key-generation contract disagreements: refusal can occur before redemption, while older fixtures expect successful key creation and later denial. Verify both seat accounting and unused-key behaviour. |
| ecosystem | One broad concurrent scenario failed its all-requests-success assertion (28 rejected results). Fixtures rotate table IDs including T00 and cross-branch codes and omit some explicit payment context. Exact rejected-response diagnosis remains required; no data-loss cause is invented. |
| multi-branch-dashboard cross-channel lifecycle | Its “every device sees every order” assertion conflicts with current Kiosk own-order privacy filtering. The later KDS/guest-completion assertions were not reached. Retain privacy; repair the acceptance matrix instead of exposing other guests' orders. |
| order-sync-pool-sizing | Four burst/wave tests encountered ECONNREFUSED. This is a local HTTP/load-harness result under concurrent audit work, not a measured production DB throughput limit. Repeat on a controlled benchmark host. |
| owner-console-plans | Fixed feature-count assertion expected 17 and received 18 as catalogue capabilities changed. Assert intended capabilities rather than magic counts. |
| owner-welcome-email, restaurants | Tests expect no-mobile restaurantCode=null; current onboarding intentionally generates a usable fallback JM code. Verify uniqueness/fallback review semantics instead of restoring an unusable identifier. |
| qr-legacy-compat | Unknown/unpublished-menu failures in compatibility fixtures. Publication and migration contracts need explicit setup and current guest-session proof. |
| restaurant-identity-sync | Owner/profile writes now require stronger authorization; older tests send only a device token and receive 403. Preserve the authorization control while updating authorized fixtures and negative tests. |
| restaurant-payouts | Expected pending amount before bank verification conflicts with current verified-bank eligibility for payout batching. Review metric semantics and acceptance for held/unverified funds; no bank transfer discrepancy demonstrated. |

Targeted passing API files include activation-redeem, tenant-isolation, security-audit-regressions, security-hardening, payments-webhook, payments-refund, payments-refund-webhook, inventory-ledger, realtime-stream, sync-events-and-sequence and sync-chaos. These are useful component/integration proofs, not complete installed-device acceptance.

## Required scenario coverage

| Scenario | Current acceptance status | What remains |
| --- | --- | --- |
| A: onboarding → plan → branch → owner → devices | BLOCKED for complete UI/native acceptance | API fixtures exercise components; all-product, QR-only, kiosk-only and revoked/expired owner/device journey still require stable-commit UI acceptance |
| B: POS → bill → printer → kitchen → reports | FAIL / BLOCKED | Local durable acknowledgement and report defects confirmed; no physical printer/kitchen acceptance |
| C: QR scan → customization → payment → POS/KDS → guest tracking | BLOCKED for full current journey | Backend contracts exist and older browser evidence is available; actual mobile gateway/app transition and physical kitchen sequence not repeated |
| D: Kiosk language → choices → payment → POS/KDS/receipt | FAIL / BLOCKED | Printer readiness issue and local commit risk confirmed; real provider and receipt delivery acceptance missing |
| E: Captain table/course → KOT → serving | FAIL / BLOCKED | Direct-add required-choice/minimum defect reproduced; full native multi-device journey unverified |
| F: offline order → restart → reconnect exactly once | FAIL / partial verification | Awaited-flush SQLite tests exist and run; immediate accepted-before-commit window reproduced; native forced-termination drill outstanding |
| G: entitlement removed/expired/revoked and restored | BLOCKED for installed acceptance | Server tests/source recorded separately; cached-policy, offline duration and signed release compatibility need devices |
| H: two tenants/branches and realtime scope | See API summary for targeted tests; BLOCKED for exhaustive certification | Not every one of 527 route declarations was manually probed |
| I: concurrent order/payment/inventory/device actions | See API cases; BLOCKED for broad production-like load | Add the same financial cases to a stable deployed branch with actual latency/restarts |
| J: commit/response loss, process restart, replay and delayed webhook | BLOCKED for full-system acceptance | Unit/integration pieces exist; one integrated fault-injection journey with durable recovery and audit is still required |

## Reproduction and artifacts

- Root suite was invoked directly, bypassing the npm pretest photo-generation hook.
- API suite ran with TEST_DATABASE_URL/DATABASE_URL redirected only inside its process to the audit-owned database; NODE_ENV=test, SMTP disabled, provider secrets stripped by test setup. Excluded: live fixture, sustained-load, order-sync-load, inventory-ledger-load and qr-scale suites. Other tests can contain bounded stress fixtures, so “excluded load suites” does not mean no stress requests ran.
- A local multi-branch test produced a dataset measurement: 10,000 additional orders and 1,001 additional devices; dashboard requests 380/345/524 ms. This is three local requests on seeded data, not a concurrency or production capacity guarantee. See MULTI_BRANCH_MEASUREMENT.json.
- A first custom Vite invocation failed because its skipped-public-assets setup omitted sw.js. The audit harness was corrected; the seven builds then succeeded. This was not labelled an application compilation bug.
- Entry screenshots used the audit bundles with an isolated API base at port 4027 and no interactive backend attached. An “API unreachable” indicator there is an expected harness limitation, not evidence of a production outage. The API integration suite exercised a real local Nest application separately.
- Raw structured runner files and private console logs stay in ignored `.jamanvaar/ecosystem-audit-2026-10-17`; sanitized summaries, source hashes and screenshot evidence are included here. Failure output can contain large fixture/source dumps and is not blindly published.
- The audit's temporary DB is removed after evidence capture. A test-generated change to the historical PERFORMANCE.json is restored; unrelated application/type edits are preserved.

## Critical missing acceptance

Native power loss/disk-full after accepted payment, two cashiers settling one bill, real late gateway success after a timeout, retry/refund replay, two KDS stations and Captain serving together, receipt/printer failure recovery, expired entitlement offline/reconnect, encrypted isolated full recovery, and signed upgrades over installed EXE/APK versions. Raw passing test count does not substitute for those flows.

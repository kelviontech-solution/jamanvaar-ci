# Release decision checklist

Verdict: **NO-GO for an unqualified broad commercial rollout**. The engineering assessment is useful progress, not certification that every application and physical integration has passed acceptance.

| Gate | Status | Evidence / required next action |
| --- | --- | --- |
| Current scope, source identities and route inventory recorded | PASS | Baseline, source hashes and AST inventory |
| Fresh PostgreSQL migration chain | PASS | All 101 migrations on an audit-owned local DB |
| API production source compilation | PASS | No-emit build-project check |
| All declared TypeScript quality gates | FAIL | Root and API test/QA typing errors |
| Root regression suite | FAIL | Structured repeat 8 failures; preserve business requirements while fixing contracts/assertions |
| API integration baseline | FAIL | 1,522 passed/20 failed; stale-contract, privacy-matrix and load-harness cases require diagnosis; do not weaken safety controls to make old fixtures pass |
| Frontend bundling | PASS | Seven Vite build targets; deployment asset/native bundle acceptance separate |
| Basic current browser entries | PASS | Eight limited unauthenticated states; no page errors or horizontal overflow recorded |
| Every authenticated page and button | BLOCKED | Requires stable-commit role/product matrix; not completed in this assessment |
| Durable accepted offline sale | FAIL | Local accepted/write-commit window reproduced; native crash test still required |
| Cross-channel required choices/quantities | FAIL | Captain direct-add defect |
| Financial metric reconciliation | FAIL | Partial-refund and local-day report examples |
| Full recovery with guest identity/history/ledger | FAIL | QR identity/date lost and missing payment entries in restore probe |
| Server tenant/branch authorization mechanisms | PASS for inspected mechanisms | Guards, forced RLS, constraints and targeted tests; exhaustive route-negative acceptance BLOCKED |
| Live payment/refund and merchant settlement | BLOCKED | No real money/provider account test; operational manual payout must not be mistaken for an automatic bank transfer |
| Physical printer/receipt and cash drawer | BLOCKED | No hardware; configuration cannot prove readiness |
| Fleet health truthfulness | FAIL | Printer READY and device offline formula gaps |
| Production backup encryption and off-site restore | BLOCKED | Configuration-dependent policy and real recovery drill required |
| Measured 1,000-restaurant/10,000-session deployment capacity | BLOCKED | Benchmark plan and limited local evidence only |
| Signed existing-installation Windows/Android upgrade | BLOCKED | Trusted signing identity, installed artifacts and data-retention verification required |
| Zero production npm advisories in current registry check | PASS | Limited to npm advisory result; not a security certificate |
| Production schema/infrastructure mutation during audit | NOT APPLICABLE | Audit stayed local; no production deployment or migration requested/performed |

Before a release, attach acceptance evidence to the repaired P1 items, run the declared gates on one stable commit, complete the affected cross-app journeys and confirm recovery of real signed installed clients. Any demonstrated tenant escape, forged collection or unrecoverable financial loss is a release blocker regardless of the maturity score.

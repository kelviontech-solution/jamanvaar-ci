# JAMANVAAR remediation and reassessment — 11 October 2026

The reproducible authorization, tenant-isolation, state-validation and webhook-concurrency problems were addressed in the workspace. Dependencies, release gates, native update checks and container configuration were hardened. This is a source/local-QA reassessment, not a claim that production or signed Android installations have been independently certified.

The original assessment remains unchanged at `../ecosystem-assessment-2026-10-11/REPORT.md`, based on commit `a6e13aaf01f19088bc3c2c89b59cf0badd763120`. The remediation includes uncommitted workspace changes. Pre-existing and concurrent user edits were preserved.

## Separate scores

Scores use the original category weights so that improvements are comparable. These are engineering judgments, not certifications or a guarantee against exploitation. `SCORECARD.json` records each dimension and the calculation.

| Assessment | Before | Reassessed |
| --- | ---: | ---: |
| Security | 5.1/10 | 7.7/10 |
| Code quality | 6.0/10 | 7.4/10 |
| SaaS readiness | 5.6/10 | 7.8/10 |

10/10 would be unsupported. Development dependency alerts, large components/repositories, restaurant-wide sync serialization, historical unsigned installers, incomplete native credential-vault coverage, and unperformed container/device/production acceptance tests remain material limitations.

## Changes and finding disposition

| Finding | Remediation and current limit |
| --- | --- |
| SEC-01 | Staff writes require a device-bound owner/branch-manager session or a current, existing POS manager session. Device-only manager creation is rejected. Current role and active state are checked. Encoded entity paths and trailing slashes cannot bypass the boundary; the controller independently requires the verified admin actor. |
| SEC-02 | Additive ENABLE/FORCE RLS policies protect all three missing tenant tables. QA tests verify unscoped/foreign reads, foreign updates, authorized reads, and a schema-wide invariant with explicit platform-global exceptions. |
| SEC-03 | Finite order, item kitchen and payment states, including supported legacy aliases, reject unknown states. Branch core shares lifecycle rules and the cloud's revision-aware item merge. |
| SEC-04 | Production requires verified staff authority for sensitive operations. Server time/current staff records govern verification. Ordinary offline sales continue through the core; protected writes use cloud authorization and do not block ordinary outbox batches. POS QR cancellation shows pending approval/sync until acknowledged. |
| SEC-05 | Android publishing uses release builds, stable-key signing, digest/certificate/debuggable checks and a draft release. Actual key configuration and device upgrade acceptance remain pending. |
| SEC-06 | API runner is non-root and installs API production dependencies, retaining Prisma explicitly for migration. Seed runs compiled JavaScript; clean builds remove stale output. Container build/runtime/volume acceptance is pending. |
| SEC-07 | Native APK updates validate transport, expected digest, package, increasing version, signer and debug flag; verification is off the Android UI thread. Native acceptance tests are pending. |
| SEC-08 | Windows branch-core key storage uses DPAPI, retaining/migrating the existing encryption key. Browser device credentials and non-Windows storage remain a bounded, documented residual risk. |
| DEP-01 | NestJS/Vitest/React Router and vulnerable compatible transitive dependencies were updated. Production npm scan is clear. Nine development-only alerts and Rust upstream maintenance/unsound warnings remain. |
| ART-01 | Trusted Windows signing and updater signatures are mandatory in the new release workflow. Existing historical EXE/MSI artifacts still have no verified valid signatures; they were inspected, not executed or replaced. |
| QUAL-01 | Both TypeScript projects were repaired and rechecked. Typed fixtures and current library API compatibility were corrected. |
| QUAL-02 | Regression failures were investigated, separating actual domain bugs from outdated expectations. Final validation evidence and any remaining failures are recorded in `VERIFICATION.json`. |
| QUAL-03 | Multi-source integration tests now select their own QR fixture and respect branch-specific tables, rather than accidentally reading another order. |
| QUAL-04 | Duplicate core/cloud kitchen merging was removed; focused authorization and update-validation helpers were introduced. Large UI components and the main repository/service still need staged decomposition; this finding is only partly resolved. |
| QUAL-05 | Super Admin uses permitted leaf imports for shared utilities. Its React Router upgrade compiles. |
| QUAL-06 | 4,741 generated Rust target files were removed from Git tracking, preserving the local files. Purposeful native sidecars remain. KDS/Captain lockfiles were added for reproducibility. |
| QUAL-07 | Fresh-database webhook assertions target the created delivery/audit event; response-body and receipt fixture expectations were corrected without weakening authorization tests. |
| SAAS-01 | Atomic delivery leases and claim tokens prevent simultaneous workers sending the same pending record. Timeouts, lease recovery and stale-worker updates are covered. Receivers still need stable delivery-ID deduplication. |
| SAAS-02 | The isolated local 32-request test persisted every acknowledged write. Restaurant-wide sequence locking is retained; sustained large-tenant capacity and a safe cursor/sequence redesign remain open. |
| SAAS-03 | Backend, root tests, all seven frontend builds, npm security/SBOM and all five native Rust audits are quality gates. Native compilation includes all five products. Actual GitHub run, signing and runtime acceptance remain pending. |
| CFG-01 | Release URLs come from validated repository configuration and must use public HTTPS origins. Tenant configuration remains dynamic. |

The final authority review also closed a LAN bypass for receipt UPI changes: the core refuses a changed payment destination from either console credential, accepts the cloud-confirmed configuration, and retains safe cosmetic edits at its own boundary. Configuration POSTs are routed through cloud validation; cached reads remain local. This last guard change was followed by focused core/configuration/API tests and fresh typechecks/API build after the full-suite passes.

Additional correctness repairs include loyalty account creation using the attached customer name, same-millisecond token-reset integrity, truthful diet/payment responses, and current NestJS/Express request validation and RxJS compatibility. These were exercised with existing regression tests.

## Verification scope

`VERIFICATION.json` summarizes the final evidence. Logs are under `evidence/`; unsuccessful intermediate runs are retained for traceability and are not represented as passing runs.

Full-suite results: 1,774 root tests passed and 1,335 API tests passed; two live-fixture tests were skipped. Both full runs completed with zero assertion failures. The final receipt-authority change was then checked with 52 root and 21 API tests. Both TypeScript checks and the API build passed afterward. Windows PowerShell's redirected-stderr behavior was reproduced with a zero-exit Node probe: it can report a shell failure for expected Nest error-handler logs even when tests pass. The QA harness now captures stderr as evidence and records the actual child exit code for subsequent runs.

- Seven application frontend production builds passed. POS was rebuilt after the pending-cancellation UI change.
- An isolated installation of the API's production dependency set completed with 210 installed packages and zero reported vulnerabilities. Prisma CLI is present; Nest CLI, the TypeScript compiler and Vitest are absent. This checks the dependency selection on Windows, not the Linux container image.
- QA API tests use an isolated local database and a non-superuser/non-BYPASSRLS role. Three additive migrations were applied there; production was not migrated.
- Real HTTP/DB tests cover staff escalation rejection, authorized owner/manager writes, revoked role rejection, finite-state rejection, RLS, concurrent/stale webhook workers and bounded concurrent sync writes.
- Root tests cover ordinary offline sales, protected writes remaining pending, split outbox batches, branch isolation, reboot/SQLite persistence, order merge, loyalty, menu and cross-device behavior.
- Production npm audit reports zero vulnerabilities. Full npm audit reports nine development-only alerts (eight high, one moderate), retained as unresolved.
- The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version for the affected recursive parser. A blanket compatible-version override cannot fix that Tailwind 3 dependency chain; a checked toolchain migration or replacement is needed.
- All five native lockfiles were audited: no reported vulnerabilities; unmaintained/unsound advisories are retained rather than hidden. The Windows KDS Rust check compiled successfully. This does not substitute for all platform release builds.
- Release workflow YAML and signing-script syntax were checked locally. There is no claim that the gated GitHub workflows have already passed.

## Reverse engineering

Yes: shipped applications can be inspected or reverse engineered. Minification, stripping symbols and native compilation raise effort but do not make client-side code or secrets a trustworthy authorization boundary. Critical authority must stay on the server. See the [OWASP mobile resilience guidance](https://mas.owasp.org/MASVS/controls/MASVS-RESILIENCE-1/).

Read-only inspection covered 16 historical EXEs: 12 contain CLR metadata, and recoverable string counts were recorded without dumping recovered contents. Seven frontend distributions contain inspectable JavaScript, with no source maps or private-key PEM markers detected in that limited scan. Absence of those markers is not proof that every secret is absent. Some inspected EXEs are installer wrappers: CLR metadata does not prove that every contained application's logic is managed code. Artifact hashes identify exactly what was inspected; their source revision could not be established.

The separate Authenticode scan still finds no valid signature among the 18 inspected historical EXE/MSI artifacts. No JAMANVAAR APK was present in the repository release/build locations or identified in Downloads; Android SDK/device inspection was unavailable. Android reverse-engineering/provenance checks therefore remain source-level, not a completed APK penetration test.

## Remaining work toward a higher score

Follow `DEPLOYMENT.md` for concrete acceptance gates: trusted signing identities and upgrade tests, a real container/volume startup check, backup restore rehearsal, provider sandbox payment/refund verification, representative multi-branch load/soak tests, replacing vulnerable dev tooling, native credential-vault coverage and staged decomposition of large modules. Do not bypass these gates or inflate the score to 10/10.

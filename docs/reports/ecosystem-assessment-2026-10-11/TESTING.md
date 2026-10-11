# Execution evidence and reproduction

Audit date: 2026-10-11. Both assessments use detached commit `a6e13aaf01f19088bc3c2c89b59cf0badd763120`.
Node 24.19.0; npm 11.17.0; Cargo 1.98.0; Python 3.13. Initial tests used an existing isolated QA database with migration-history drift. The fresh repetition uses a new localhost-only QA database with all 83 frozen migrations, exact checksums and a non-superuser/non-BYPASSRLS role. Use a new dedicated QA database when reproducing; never use production.

## Executed checks

| Check | Actual outcome | Evidence |
| --- | --- | --- |
| Tracked-file/manifests/controllers/migration inventory | 10,959 tracked files, 21 manifests, 72 controllers, 62 models | INVENTORY.json; inspect_repository.py |
| npm audit --package-lock-only --json | 45 vulnerable packages, exit 1 | npm-audit.json |
| npm audit --package-lock-only --omit=dev --json | 13 vulnerable packages, exit 1; overlaps full audit | npm-audit-production.json |
| Root Vitest all, --maxWorkers=2 | 227 files pass/11 fail; 1,758 tests pass/13 fail, exit 1 | root-tests.log |
| Existing pretest asset preparation + rerun of 11 failed files | 2 files pass/9 fail; 150 tests pass/11 fail, exit 1 | asset-preparation.log; root-failure-recheck.log |
| Selected critical API suites | 11 files pass/1 fail; 188 tests pass/1 fail, exit 1 | api-critical-tests.log |
| Additional API control suites | 8 files pass; 94 tests pass, exit 0 | api-controls-tests.log |
| Independent audit probes | 1 file/6 tests pass, exit 0; intentionally reproduce unsafe behavior | assessment-probes.log; assessment-probes.e2e.spec.ts |
| Multi-branch diagnostic copy | Original selector: 33 pass/1 fail; explains stale fixture | api-flow-diagnostic.log |
| Multi-branch audit copy restricted to returned QR order identity | All 34 scenarios pass, exit 0; original checked-in test unchanged | api-flow-selector-recheck.log; assessment-flow-diagnostic.e2e.spec.ts |
| API tsc -p cloud/api/tsconfig.json --noEmit --incremental false | One baseline constructor diagnostic, exit 1 | api-types.log |
| Root tsc --noEmit | Four diagnostic headers in three test fixture files, exit 1 | root-types.log |
| Local artifact inventory/hash/Authenticode | 18 EXE/MSI: 14 NotSigned, 4 UnknownError; five ICNS not applicable | AVAILABLE_ARTIFACTS.json; ARTIFACT_SIGNATURES.json |
| Fresh frozen-commit migration + seed | All 83 migrations applied; matching names/checksums; non-bypass role | fresh-qa-preparation.log; FRESH_QA_SCHEMA_BASELINE.json |
| Fresh repetition of 22 API files | 321 passing / 2 failing tests (323); six unsafe probes reproduce; both failures diagnosed test defects | fresh-api-tests.log; WEBHOOK_FAILURE_VERIFICATION.json |

Do not add pass counts across reruns or call them coverage percentages. Initial root execution bypassed npm pretest; the controlled failed-file recheck performs the normal asset preparation. The two cleared asset cases are not reported as production defects. Eleven remaining failures include stale text/regex/path expectations and require individual product triage. Full prepared root suite was not rerun because only the changed preparation conditions justified the failed-file recheck.

The original critical API failure is a confirmed test-selector defect: earlier finance-4 QR fixture has no replay seq; the newly created QR order is returned correctly. Selecting by `qr.body.publicOrderId` in an audit-only copy permits the lifecycle assertions to run and pass. Neither the original test nor production code was fixed in this assessment.

The fresh repeat additionally exposes the unknown-reference webhook assertion: it searches for a historical raw-reference substring, while current source writes No matching payment transaction found. Exact synthetic payload lookup with platform RLS context confirms the current callback exists, has a valid signature and FAILED processing status. Initial reused-DB passing results were not sufficient here. See QUAL-07 and WEBHOOK_FAILURE_VERIFICATION.json. This is a test-identity/message defect, not an approved-payment or missing-webhook finding.

API control files: activation-redeem, rls-platform-reads, backups, backups-local, master-catalog-upload, entity-sync, order-rules.unit, audit-probes. Critical file names/counts are retained verbatim in the log. Two initially supplied selector names matched no file; the actual critical run was 12 files, not 14.

## Reproduce safely

1. Create a detached checkout at the recorded revision. Compare lock SHA-256 to INVENTORY.json. Install/build dependencies independently for a clean CI reproduction; this audit reused a lock-compatible installed node_modules junction.
2. Prepare a dedicated test database with migrations and a non-bypass application role. Do not migrate production. A database name containing test is an additional harness guard, not proof by itself of isolation.
   The retained prepare_fresh_qa.cjs reads local connection configuration without printing secrets, explicitly rejects remote hosts and creates its own uniquely named database. It never overwrites the pre-existing browser QA state. Its private state is ignored under .jamanvaar; never publish it.
3. `node node_modules/vitest/vitest.mjs run --maxWorkers=2` runs the root offline/source tests. Run the recorded `node tooling/dev/sync_description_photos.mjs` pretest when checking prepared assets; it regenerates public files only in the checkout.
4. Use run_api_tests.cjs with checkout path, private QA-state path and selected `test/*.spec.ts` paths. It reads the QA URL silently, clears live gateway/service secrets and disables SMTP. Existing API tests mock gateway/email; backup S3 tests run a local S3rver, not AWS. Never publish the private state. Some tests mutate only fresh owned fixture rows; older tests can sweep jobs in the dedicated QA DB, which is why shared production DB use is prohibited.
5. Copy the retained audit probe into cloud/api/test of the audit checkout only. It creates fresh synthetic restaurants/devices/staff, verifies the real non-bypass DB role and deletes its owned fixtures. Webhook HTTP is mocked; no real message is sent. Probe PASS proves the unsafe behavior remains. Fixes should make the reproductions fail and new protection tests pass.
6. Type checks: `node node_modules/typescript/bin/tsc --noEmit`; `node node_modules/typescript/bin/tsc -p cloud/api/tsconfig.json --noEmit --incremental false`.
7. Dependency commands above scan the recorded lock and consult the npm advisory registry; exit 1 indicates advisory results. Advisory severity is not an exploitation result. Raw logs may use PowerShell UTF-16; report JSON/Markdown are UTF-8.
8. Signature checks used Get-AuthenticodeSignature and SHA-256 only; no installer was launched. Treat UnknownError as inconclusive and verify on the target signing platform.

## Explicit NOT TESTED

Every-screen browser CRUD/layout/accessibility; full production app builds; fresh npm install; Rust advisory scanning; Docker/OS image scanning; full git-history secret scanning; native binary decompilation; current deployed source/artifact linkage; actual APK signatures/upgrade; physical touchscreen/printing/LAN intrusion; live mobile UPI/gateway funds; actual AWS/IAM/network/TLS/S3 state; production backup restoration; sustained concurrent load and RPS capacity.

Historical reports and other concurrently running workspace tasks are not counted as same-commit current audit verification.

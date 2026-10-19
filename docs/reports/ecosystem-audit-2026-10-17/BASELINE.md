# Ecosystem audit baseline

Audit date: 17 October 2026. Initial branch: `main`; initial HEAD: `ccf17d93288ede1a1bdf7bb2c150adf84ec88e72`. Initial working tree was clean. No application fixes have been performed in this report-first stage.

Discovery found seven frontend build targets, one shared administrative frontend with Restaurant/Kiosk/QR product experiences, five Tauri application wrappers, a Nest/Prisma API, 65 Prisma models, 101 SQL migrations and 82 singular controller files. The initial grep estimate of 486 decorated handlers was superseded by a class-aware AST inventory of 527 HTTP/SSE declarations, including plural controller files. Counts identify inventory, not manual coverage.

The root Vitest baseline was invoked directly to avoid the root npm pretest photo-generation hook. Repository and API no-emit typechecks failed; their detailed results will be preserved in TEST_REPORT.md. The existing local `jamanvaar_test` database has five pending migrations and lacks `Restaurant.digestEnabled`; the first API-suite attempt was stopped on that environmental blocker, not counted as application test failures.

A separately named, audit-owned disposable database was created with the existing non-superuser, non-RLS-bypass test role. All 101 migrations deployed successfully and the catalogue was seeded without printing generated credentials. The API baseline runs against that database. The existing development/test databases and production infrastructure are not migrated or reset.

Application files changed externally during the audit (Kiosk App, POS cart and POS store). Those changes are preserved. Final evidence will distinguish baseline HEAD, live source hashes and test timing; this is not a clean-commit certification.

Read-only discovery is complete enough to proceed with evidence probes and reporting. Broad application refactoring has not started. This directory contains audit documentation and reproduction probes only.

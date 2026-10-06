# Reproduction and evidence guide

No application fixes were made. QA scripts mutate only the isolated test database and browser profiles. Do not run them against a production DATABASE_URL or a live payment provider. The fixture bootstrap makes a new database; do not rerun it while investigating the existing evidence.

## Retained evidence

- audit-summary.json: counts and environment.
- TEST_MATRIX.csv: latest named scenario with reviewed disposition and limits.
- ATTEMPT_DISPOSITIONS.csv: every raw attempt, superseded/harness errors separated.
- test-matrix.jsonl: immutable append-only original outcomes.
- COVERAGE_MATRIX.csv / CONTROL_INVENTORY.csv: rendered views and observed controls; not every control was executed.
- UNEXECUTED_SCENARIOS.csv: remaining functional/external/concurrency requirements.
- network.jsonl, console.jsonl, resource-failures.jsonl: captured browser API, console and resource observations.
- API_PERFORMANCE_MATRIX.csv / SERVER_PERFORMANCE_MATRIX.csv: normalized API groups and actual middleware timings.
- database-verification.json, data-consistency.jsonl, realtime-flow-timeline.json, realtime-connections.jsonl: cross-app and DB evidence.
- evidence/: screenshots, text/control snapshots and QA menu export.

Secrets, PINs, device/JWT credentials, captured OTP and DB connection string are only in ignored .jamanvaar/browser-audit/. Do not publish that directory. Report records contain synthetic fixture identifiers, not production customer records. Test profiles and database are retained for reproduction; owned servers are stopped at handoff. The original restaurant-detail screenshot displayed activation credentials and is retained only in private-evidence; its scrubbed JSON is public evidence. Activation-entry screenshots are also retained privately. Public text artifacts were checked against private passwords, tokens, encryption secrets and complete activation codes with zero matches.

## Environment bootstrap for a fresh run

1. Use local PostgreSQL and install the repository dependencies. Read prepare-browser-audit.cjs before running; it creates an isolated migrated database and non-bypass role, not a production migration.
2. Build cloud/api using its existing build script; no source fixes are required to reproduce current defects.
3. Run `node tooling/qa/prepare-browser-audit.cjs`, then `node tooling/qa/browser-audit-runtime.cjs`. Verify port 4010 is the isolated API, ports 5174/5175/5176/5177/5179/5180/5190 are the test apps, and no user process on 4000 is changed.
4. Run the role-specific scripts sequentially; they share fixture state and persistent profiles. Start with super, fixtures, admin activation, restaurant-setup, activate-terminals, terminal-login and cross-app. Read dependencies in each file; this is a recorded audit workflow, not a single repeatable unit-test suite.
5. Payment simulation must be explicitly enabled in private-state by the QA harness before restarting its API. Gateway create-QR/refund are simulated, webhook validation uses the throw-away secret, and external fetch is blocked. Unconfigured-gateway tests require simulation off. Do not supply real provider credentials.
6. Build Restaurant Admin with localhost:4010 QA URLs and serve preview on 5286 for browser-audit-production-admin.cjs. Preserve application throttle/auth guards.
7. Run later stock/QR/shift/isolation/offline/live-trace/refund-rbac scripts with their fixtures prepared. browser-audit-sse-restart.cjs requires a verified PID whose command is this audit server; it stops/restarts that isolated API only.
8. Run browser-audit-db-check.cjs, then browser-audit-report.cjs. Reports intentionally preserve failed assertions and their review dispositions.

Browser Playwright assertions plus API/DB corroboration are required to reproduce money/order bugs. No test matrix row certifies every function of its page. External/hardware/peak checks must be supplied before a release-ready claim.

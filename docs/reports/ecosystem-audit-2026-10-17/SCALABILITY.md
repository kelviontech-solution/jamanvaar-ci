# Scalability and operational assessment

No production capacity is certified by this audit. The general baseline excludes four sustained/load suites; existing executable benchmark scenarios are retained rather than fabricating measurements. Any measured focused results are recorded separately in TEST_REPORT.md.

The included multi-branch fixture measured three dashboard calls at 380/345/524 ms after seeding 10,000 additional orders and 1,001 devices. Other included pool-sizing burst/wave tests failed with ECONNREFUSED. This mix is useful local evidence, not a supported restaurant/session count or a clean performance acceptance. Raw measurement: [MULTI_BRANCH_MEASUREMENT.json](MULTI_BRANCH_MEASUREMENT.json).

## What the implementation already does

- Configurable Prisma connection-pool size/timeouts, transaction wait/run limits, sync admission, clean BUSY responses and transient retry with jitter.
- Commit-ordered cursor pulls, bounded pages/batches and dead-letter retention.
- Lightweight SSE invalidations plus PostgreSQL cross-instance notification; periodic reconciliation remains the source of recovery.
- QR resolution caching, database-backed rate counters, local QR latency percentiles and sync admission counters.
- Durable webhook delivery leases/retries and scheduled operational jobs.

## First bottlenecks to measure

| Concern | Actual location / mechanism | Measure and next step |
| --- | --- | --- |
| Tenant-wide write serialization | Order pushes take order locks and one restaurant entity lock for the batch; entity counter/trigger writes serialize too | Lock wait, transaction duration, batch size and rejection rate. Try smaller batches/fair admission before changing lock ordering. |
| Finite DB pool | Compose defaults DB_POOL_SIZE=5 per API process; SSE relay uses an additional pg connection | Sum connections across replicas, workers and tools; reserve headroom for auth, QR and support. A replica is not free capacity. |
| Frequent background polling | POS has a 4-second operational loop and 15-second heavier loop in addition to SSE | Trace actual requests/bytes per idle and busy device. Add conditional/delta/batched reads where profitable; keep a recovery poll. |
| Long-lived clients | Device stream rechecks approximately every 30 seconds | 10,000 device streams imply about 333 recheck operations/second before other work—an arithmetic scenario, not measured throughput. Test proxy limits, memory and DB cost. |
| QR guest reads | Public menu/status requests perform scope/rate validation; status polling also consumes request capacity | Cache only safe immutable/published data. Preserve guest authorization and abuse controls. Measure provider-verification calls independently. |
| Local collection serialization | Local repositories serialize collections to a key/value SQLite store; multiple windows coordinate through a leader | Memory/JSON/write amplification versus catalogue/order history size. Benchmark data retention and compaction before rewriting the storage layer. |
| Unbounded operational/export paths | Some backup snapshots, pending-command lists and report-related source reads collect whole sets | Profile large tenants; use chunked snapshots/streamed exports and explicit limits with completeness labels. |
| Instance-local telemetry | QR latency sample window/admission counters reset with processes | Aggregate/export operational metrics and preserve important business exception records; do not label one replica's view as fleet-wide. |

## Illustrative growth scenarios

These are workload definitions, not supported-customer counts. Measure actual per-device traffic before substituting numbers.

| Scenario | Proposed test workload | Required evidence |
| --- | --- | --- |
| 10 restaurants | Five terminals/branch, normal menu browsing, order/KDS/payment mix | Correctness plus p50/p95/p99, pool occupancy, sync and notification lag |
| 100 restaurants | Mixed 1–5 branches, independent licensed products, rush-hour arrivals | Fairness, tenant isolation, lock distributions, bounded retries and memory |
| 1,000 restaurants | Realistic active/idle distribution, reports and backups alongside service | Multiple API processes, DB/relay sizing, object storage, job lease safety and recovery |
| 10,000 active sessions | Separate QR guests from long-lived device streams; vary activity and polling | Socket/proxy limits, request/DB capacity, provider rate limits, load-generator capacity and sustained error rate |
| Reconnect burst | Offline devices replay 100+ queued mutations while new guests order | No duplicate financial/stock effects; bounded queue growth and fair catch-up |

## Executable isolated test plan

Use a **new disposable database**, apply the 101 migrations, seed its catalogue and provide TEST_DATABASE_URL only to the test process. Never use production or a shared development database. Existing test cleanup needs the guard repairs in EC-13.

From `cloud/api`:

```powershell
node ../../node_modules/vitest/vitest.mjs run test/order-sync-load.e2e.spec.ts --reporter=verbose
node ../../node_modules/vitest/vitest.mjs run test/inventory-ledger-load.e2e.spec.ts --reporter=verbose
node ../../node_modules/vitest/vitest.mjs run test/qr-scale.e2e.spec.ts --reporter=verbose
node ../../node_modules/vitest/vitest.mjs run test/sustained-load.e2e.spec.ts --reporter=verbose
node ../../node_modules/vitest/vitest.mjs run test/sync-chaos.e2e.spec.ts test/realtime-recheck-storm.e2e.spec.ts --reporter=verbose
```

These are local component/integration measurements. Add a separate external multi-tenant generator, reverse proxy and production-like database before extrapolating. Test a server commit with a lost HTTP response, restart the API/relay, replay identical events, delay callbacks and kill/restart a client.

Record successful and failed requests, business duplicate count, p50/p95/p99, API CPU/RSS, database pool/lock wait, outbox oldest age, retry/dead-letter count, event-to-screen lag and recovery time. Save environment, commit/source hashes, dataset size and active concurrent builds/tests with every result.

## Proposed alert targets, not measured SLAs

- Paid but not admitted to kitchen, unknown payment outcome and ledger mismatch: immediate actionable exceptions with original references.
- Sync oldest age over 30 seconds while connected: warning; over two minutes: escalation, tuned by deployment.
- Persistent pool saturation, BUSY/5xx increases and growing queue age: capacity alerts correlated by tenant/branch.
- Printer errors: distinguish queued/dispatched/device status and give staff a safe reprint route.
- Backup age, object verification and last successful isolated restore: separate signals.

Start with correct metrics and one deployable instance plus verified backups. Then tune queries, batching and pools; add replicas only after cross-instance rate limits, job leases, relay recovery and signing/deployment compatibility are accepted. Infrastructure complexity does not repair order or ledger invariants.

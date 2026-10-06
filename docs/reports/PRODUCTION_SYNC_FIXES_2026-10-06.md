# Jamanvaar production synchronization remediation - 6 October 2026

## Scope and release status

Code changes were authorized after the read-only audit. The active scope is POS, Restaurant Admin (POS Admin with merged kiosk administration), Super Admin, Kiosk, KDS and Captain. The existing standalone KIOSK_ADMIN login retirement is preserved. No production deployment, live database migration or AWS configuration change was performed.

This report distinguishes defects fixed in the repository from infrastructure conditions that cannot be established without inspecting the deployed environment. Passing local tests is not proof that production has no remaining issues.

## Confirmed problems addressed

| Severity | Root cause and evidence | Affected applications / files | Implemented change | Expected impact |
|---|---|---|---|---|
| Critical | Same-origin authenticated GET responses could enter the service-worker cache; the two apps also shared a cache name. | KDS and Captain `public/sw.js` | Exclude APIs, authenticated requests and event streams; app-specific cache names and scopes; retire the old shared cache; precache emitted JavaScript/CSS and SQLite worker/WASM assets through the Vite build plugin. A production browser check confirmed first-visit offline reload failed before asset precaching and passed afterward. | Reloads and sync pulls receive server responses rather than cached API data; offline reload can load the complete app immediately after its first installation. |
| Critical | Timestamp entity pagination could skip tied timestamps, older records and filtered pages. Cursor advancement did not track committed entity ordering. | Cloud Prisma schema/migration, `entity-sync.service.ts`, shared `entity_sync.ts`, Branch Core store/core/uplink | Database-maintained per-restaurant entity sequence, sequence indexes, explicit `afterSeq`, scanned-page metadata and bounded page draining; clients rebuild old timestamp cursors once. | Old records and every page remain recoverable after interruptions or missed events. |
| Critical | Order pulls acknowledged cursor positions while refusing updates for locally pending orders. | `packages/sync/src/outbox.ts` | Keep the cursor until deferred rows can be applied after upload; coalesce overlapping pulls; initial replay begins at sequence zero. | A cook's READY update cannot disappear permanently behind a local pending edit. |
| High | Persisted SYNCING orders were not eligible for resumed upload. Backlogs exceeded request record limits. | Shared outbox and sync batching | Recover interrupted uploads; batches respect record count and order JSON byte budget; permanent validation failures remain visible as dead letters. | Reload/reconnect resumes the backlog without oversized requests or endless retries for invalid records. |
| High | A syncing state was mistaken for a connectivity transition, causing duplicate pushes and recursion in validation. | Outbox reconnect subscription | SYNCING remains connected; own state changes cannot trigger reconnect work. | Removes self-triggered retry loops and duplicate requests. |
| High | Generic entity writes lacked realtime wake-ups; a fresh/reconnected stream did not trigger recovery of all relevant data. | Cloud entity/menu/QR/backup services; shared heartbeat/realtime client | Publish post-commit hints; recover on ready/reconnect; wake registered entity consumers; idle watchdog and reader cleanup; serialize/coalesce PostgreSQL notification sends. | Menu, staff, table and status changes propagate promptly using the existing SSE and cursor protocol. |
| High | Kiosk omitted ordinary order catch-up; Captain messages used callbacks whose results were not delivered to its inbox. | Kiosk/Captain `App.tsx`, shared floor sync | Add order recovery to the kiosk's existing sync tick; register Captain message delivery; coalesce subsequent catalog/staff/table changes during in-flight work. | Kiosk and Captain receive remote updates and edits made during another sync are processed afterward. |
| Critical | Shared browser databases and generic cursor keys coupled different applications and device bindings. | Database durable boot, key-value storage, tenant isolation, endpoint resolver, app entrypoints | App-specific SQLite and fallback stores; device/branch/server-specific cursors; reset all scoped menu cursor variants; isolate disconnect flags; bind new activations before the first heartbeat. | One app's reset or cursor cannot make another app skip records or adopt its local state. |
| Critical | A branch-bound terminal could target another branch's existing order/table; LAN messages lacked a branch check. | Cloud order/entity sync, shared LAN mesh, heartbeat scope recovery | Enforce authenticated branch ownership; reject foreign-branch mesh messages; recheck SSE device scope; quarantine pending orders when legacy/changed branch ownership is uncertain. | Prevents cross-branch updates and unauthorized synchronization. |
| High | Refresh rotation could consume an old token before its replacement was safely created; tabs could rotate shared cookies concurrently. | Tenant/platform auth services, admin HTTP clients | Atomic claim-and-replacement transactions; browser refresh locks plus in-app singleflight; protect admin refresh from late logout/session changes; explicit body-token transport for the legacy client. | Failed replacement writes leave the original token usable; concurrent refresh requests are serialized in supported browsers. |
| High | HTTP calls and SQLite worker initialization could remain unresolved; legacy relay HTTP was attempted from HTTPS deployments. | `packages/api/src/http.ts`, shared device gate, clients, durable worker/cluster, database relay | Deadlines cover response bodies and caller cancellation; bound worker startup; release leaders and close failed workers; use legacy relay only when explicitly permitted/local. | Requests and startup finish with a recoverable result instead of indefinite loading. SSE retains its separate streaming lifecycle. |
| High | Durable storage's single remote callback was overwritten by another database consumer. | Durable storage and database attachment | Independent subscriptions with cleanup. | Every attached database observes persisted cross-window changes. |
| High | Staff records were repeatedly uploaded as full snapshots, and local menu/table edits waited for periodic ticks. | Shared staff/local-change/menu/floor sync and active app integrations | Acknowledged staff deltas and immediate publication of actual local edits; preserve read-only consumers. | Reduces recurring request volume and edit-to-display delay. |
| High | Kiosk cart validation read a separate menu snapshot that could lag the merged Restaurant Admin menu. | Cloud payment menu sync and payment order creation | Derive trusted pricing, availability, tax and modifiers from current synced entities and branch overrides; retain the legacy snapshot fallback. | A kiosk can sell a newly added admin item without a separate snapshot upload, and sold-out items are refused. |
| High | Payment/provider calls could hang; repeated payment checks overlapped; uncertain refund results were marked failed. | Payment service/gateway/upstream helper, Kiosk payment effects, email service | Bounded provider/body reads, payment status singleflight, non-overlapping checks and effect cleanup; preserve pending refunds when the provider result is unknown. | Fewer duplicate provider requests and no false failure that releases refund capacity after an uncertain result. |
| High | Dashboard code requested a second pooled connection while holding a transaction; report summaries loaded full histories. | Cloud dashboard/reports services, Compose environment forwarding | Reuse the transaction client; database financial aggregates and bounded recent lists; forward pool and transaction settings to the API container. | Lower pool pressure, fewer queries and memory use that no longer grows with full history for those summary endpoints. |
| High | Branch Core shutdown closed SQLite while an uplink was still using it; acknowledgements could clear a newer local edit. | Branch Core main/uplink/core | Cancel and await active uplink before closing; conditional entity acknowledgement; wake the uplink for local entity edits. | Clean shutdown and preservation of edits made during upload. |
| Medium | A rolled-back entity could have an earlier successful acknowledgement in the same response; test setup could silently fall back to a development database. | Entity sync service, backend test setup | Acknowledge only after associated work succeeds; fail closed unless a dedicated test database is configured. | Clients retain failed records; regression runs cannot silently use the normal development database. |

Remote Google Fonts stylesheets in the five operational app HTML entrypoints now load without blocking app startup. This removes another network-dependent cold-render delay; local bundled CSS still loads normally.

## Complete flow verified locally

The database-backed HTTP/SSE regression in `cloud/api/test/realtime-stream.e2e.spec.ts` performs:

1. Activate Captain, POS and KDS devices for one branch.
2. Subscribe Captain and KDS to their authenticated SSE streams.
3. Captain creates an order through `/api/v1/orders/sync`.
4. Read the committed `SyncedOrder` and verify its item.
5. Observe the KDS order wake-up and pull the canonical order by sequence.
6. KDS writes READY, including the item kitchen status, through the same sync endpoint.
7. Observe the Captain wake-up and verify both Captain and POS pull READY after the previous sequence.

An isolated local run measured: creation/acknowledgement **19 ms**, separate committed-row read **3 ms**, creation through KDS wake-up and pull **32 ms**, and READY through Captain/POS reads **78 ms**. These are observed local round-trip timings, not separate AWS network, auth or database execution measurements. The event-wait helper checks at 40 ms intervals, so notification arrival timing has that observation granularity.

The existing frontend KOT/order propagation suites exercise reconstruction, station routing, idempotency, add-on rounds and kitchen-status reconciliation. The API carries canonical order/items; KOT reconstruction happens in the receiving app's local repository.

Additional local load scenarios include 100 concurrent table orders, 500 menu reads, and 160 mixed-channel orders from 54 order-creating terminals plus QR across two restaurants and four branches. Results vary with simultaneous builds/test load; they are not production capacity guarantees.

## Validation

- Full backend run: **126 passed test files, 1,071 passed tests**; two opt-in live/stress suites skipped by default.
- Final full frontend/package run: **187 passed files, 1,374 passed tests**.
- Later targeted checks: **71 tests** covering outbox, byte budgets, scoped cursor reset, storage isolation, core acknowledgements and kitchen/menu flows; **52 tests** covering menu, tables, staff, reactivation and health.
- Backend build, all six active frontend production builds, frontend/backend TypeScript checks and Prisma schema validation passed.
- Final backend follow-up after the last commit-order/core changes: **3 files, 50 tests passed**.
- Opt-in sustained load: **45-second configured run, 30 creating terminals, 2 KDS readers, 2,237 created orders, 2,222 kitchen updates, 4,459 requests, zero errors**. Both KDS readers received every created order. Observed local request p50/p95/p99 were 106/754/1,609 ms while other verification work was running.
- Production shell follow-up: **28 PWA/storage regression tests passed**, plus same-origin online/offline browser checks.
- Git whitespace/diff checks passed. Build output still reports large frontend chunks; that does not fail the builds, and cold-load performance on slow devices requires deployed browser measurement.

Browser checks used headless Chromium against development origins and then the built KDS and Captain apps under one shared production-style origin (`/kds/` and `/captain/`). Both selected SQLite, used distinct shell caches, and rendered without page errors. After the first installation, with network access disabled, both reloaded and retained SQLite mode. Observed local online/cache-ready times were 800 ms (KDS) and 335 ms (Captain); offline render times were 137 ms and 136 ms. The first production check exposed missing cached bundles; the build-generated precache manifest resolved that failure. This proves shell/storage recovery in that browser; authenticated UI operations are covered by the API and frontend regression suites.

The entity sequence migration was applied successfully to the dedicated local `jamanvaar_test` database and the verified localhost development database `jamanvaar`. Only this migration was pending in development. Production was not migrated.

## Likely production contributors - needs deployment verification

- Pool exhaustion under the deployed number of API replicas, background jobs and connections: pool controls are now forwarded, but the right production pool size must fit the database connection budget.
- CPU, memory, storage or database saturation on AWS: no production metrics were supplied. Local load results cannot identify those live bottlenecks.
- Old bundles/service workers/API processes remaining after deployment: source fixes take effect only after the matching releases are deployed and loaded.
- Proxy or load-balancer configuration differing from checked-in Nginx files. Both checked-in SSE proxy layers already disable buffering; their live installation and any ALB idle timeout are unverified.

## Release steps and remaining verification

1. Back up the live database through the normal release process. Apply `20261006040000_entity_recovery_sequence` with `npm run prisma:deploy --workspace=@jamanvaar/cloud-api` and generate the matching Prisma client as part of the backend build. The migration backfills existing entities and takes write locks; schedule that database work appropriately for live traffic and table size.
2. Deploy the matching API, active frontends and Branch Core build where a core is installed. The frontend clients require the new sequence protocol to recover their old cursor gaps.
3. Confirm configured pool size multiplied by API replicas, plus relay/job/admin connections, fits PostgreSQL's available connections. Verify the effective environment rather than merely the Compose source.
4. Verify both effective Nginx layers route SSE with buffering disabled and preserve a heartbeat interval below any load-balancer idle timeout. No AWS/ALB setting was changed speculatively.
5. Run the Captain/POS/Kiosk -> KDS -> READY -> Captain/POS flow on the deployed stack, including disconnect/reconnect, app reload, two branches and two tenants. Compare browser network timings with request IDs and backend timing logs. Aborted non-stream requests are now logged as well.
6. For legacy storage whose branch ownership is unknown, original data is retained and unsent orders are quarantined. Review those records against their original branch before any recovery; they are never automatically submitted under a different binding.

There is no demonstrated AWS-specific incident root cause without live observations. Repository defects above are implemented and locally verifiable; production rollout and post-deployment measurements remain necessary.

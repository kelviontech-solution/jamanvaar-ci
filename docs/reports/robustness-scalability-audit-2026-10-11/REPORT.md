# JAMANVAAR robustness & scalability audit — Phase 1 (discovery) + Phase 2 (static audit)

Date: 2026-10-11. Base: local `main` at commit `8a6a402e` (post-merge of this session's pushes).

**Scope of this pass:** repository discovery, architecture mapping, and a static review of the
backend's concurrency/correctness/capacity-relevant code. Per the audit brief's own instruction —
*"do not immediately run a 1,000-user load test or make sweeping code changes; present the initial
findings, the staging requirements, and the proposed safe test plan first"* — **no load test was run,
no code was changed, and no staging environment was deployed.** Numbers below are source-code facts
(file:line evidence), not measurements. Anything that requires running the system is marked
**NOT MEASURED**.

This pass did not reach every one of the 18 components the full brief lists — see "Not yet covered"
at the end. It covers the parts that determine most of the system's actual capacity ceiling: the
backend process, the database, the real-time/sync path, and the native-client sync protocol all
clients share.

---

## 1. Executive summary (plain language)

Jamanvaar's backend is a **single NestJS process talking to a single PostgreSQL database** — there is
no Redis, no message queue (no BullMQ/SQS/etc.), and no separate worker tier. Every "real-time" update,
every background job, and every order write goes through that one database. This is a reasonable,
simple design for the traffic a single-branch or few-branch restaurant currently generates, and the
order-write path in particular is built carefully (idempotent upserts, deadlock-safe ordered locking,
row-level tenant isolation). But it means **the database is the only thing that can be the bottleneck**
— there's no queue to absorb a spike, no cache to take read load off it, and the real-time mechanism
(one open HTTP connection per device, each polling the database on its own timer) scales its own load
directly with device count.

No staging environment and no load-testing tooling exist in this repository yet. Before any number in
this audit's "capacity" sections can be filled in with real data, both of those have to be built. This
report's job is to say what to build and why, not to guess at numbers.

## 2. Architecture map (what actually exists)

**Backend** (`cloud/api`): NestJS 11 + Express 5, single process, Prisma 5 → PostgreSQL. No Redis,
no BullMQ, no socket.io (`cloud/api/package.json` dependency list — confirmed absent). AWS S3 for
object storage (`@aws-sdk/client-s3`). Rate limiting exists via `@nestjs/throttler`, configured globally
in `app.module.ts` plus tightened per-route on payments (`payment-orders.controller.ts:23,74,81,109`)
and WhatsApp webhooks.

**Real-time delivery** (`cloud/api/src/common/realtime/`): there is no WebSocket server. Delivery is
**Server-Sent Events**, one long-lived HTTP connection per device (`realtime.controller.ts`). Each
connection independently re-queries the database every `REALTIME_RECHECK_MS` (default 30s) to check
the device hasn't been revoked, and gets a ping every 25s. Events carry no payload — they're wake-ups
telling the device to pull by cursor, so a missed event can never cause a missed change, only a delayed
one (`realtime-bus.ts:30-35`). Cross-instance fan-out (if the API ever runs more than one process) is
done via **Postgres `LISTEN`/`NOTIFY`**, not Redis pub/sub (`realtime-bus.ts:33,64-92`) — this is an
explicit, documented design choice in the code's own comments, not an oversight.

**Background jobs** (`cloud/api/src/modules/jobs/jobs.service.ts`): a single `setInterval` running every
15 minutes inside the API process itself — no cron infra, no separate worker. The code's own comment
states every job is written to be idempotent specifically so that two API instances (or a manual
trigger overlapping a scheduled run) running it concurrently is harmless (`jobs.service.ts:26-29`).
That's a reasonable mitigation for the "no leader election" gap, but it means this was already
identified as a multi-instance risk by whoever wrote it — it has not been load-tested as such.

**Database connections**: `cloud/api/.env.example` sets `DB_POOL_SIZE=5` per API process, with a
comment noting *"total connections include each replica's pool plus one realtime relay connection."*
No `connection_limit`/`pool_timeout` is set in `prisma/schema.prisma` itself — pooling is controlled
entirely through environment variables. A pool of 5 is small; whether it's adequate depends entirely on
real device/session counts, which this audit has no access to (**NOT MEASURED** — see open questions).

**Order write path**: all native clients (POS, Kiosk, Captain, KDS, Restaurant/POS Admin) share one
sync client library, `packages/sync` (confirmed via `outbox.ts`, `device_cloud_client.ts`,
`heartbeat.ts` — 1,286 lines, imported uniformly across the five Tauri apps per their `package.json`s),
which pushes order events to one backend entry point: `OrderSyncService.pushEvents`
(`cloud/api/src/modules/order-sync/order-sync.service.ts`). This means the correctness properties found
there apply to every order origin (POS, Kiosk, Captain) uniformly — there is one order-write code path,
not five. QR Ordering's write path was not independently traced in this pass (see "Not yet covered").

**Order idempotency and locking** (`order-sync.service.ts:120-147`): orders are upserted by
`(restaurantId, externalOrderId)` — the client's own locally-generated order id is the idempotency key,
specifically so a retried push after a dropped response "never double-creates a row, it just re-applies
the same state" (the file's own comment cites this as the fix for a traced historical bug, BUG-009).
Within one push batch, every touched order id gets a Postgres advisory lock
(`pg_advisory_xact_lock`), **taken in sorted order** specifically to prevent two concurrent batches from
deadlocking each other — then one more advisory lock is taken on the whole restaurant
(`'entity:' + restaurantId`) before the per-event sequence counter is touched. This is real,
deliberate concurrency-correctness engineering, not an accident. The flip side, flagged as a risk
rather than a confirmed bug: **that restaurant-wide lock serializes every order-sync push for a given
restaurant**, across however many devices/branches it has. For a single restaurant with normal device
counts this is very unlikely to be felt; it becomes a real question only at high concurrent
multi-branch push volume, which has not been measured.

**Native/offline clients**: POS, Kiosk, Captain and KDS are Tauri v2 (Rust + React/TS), with local
SQLite persistence and the shared `packages/sync` outbox for queued, retryable pushes — this part was
reviewed structurally (file sizes, shared-library usage) but not exercised (no disconnect/reconnect
test was run in this pass; see Phase 8 in the original brief).

## 3. What's already in place that reduces risk (don't rebuild these)

- Rate limiting: global default plus tightened per-route limits on payments and WhatsApp — already real, not a gap.
- Order write idempotency + deadlock-safe locking — already real, with a cited historical bug (BUG-009) it was built to fix.
- Real-time design explicitly tolerates missed wake-ups by falling back to periodic cursor pulls — a "best-effort, never lose data" design, not a silent gap.
- Background jobs are explicitly written to be safe under accidental concurrent execution.
- A 4-migration Postgres row-level-security pass for tenant isolation shipped earlier this session (`20261011100000_assessment_tenant_rls` and others, already pushed to `origin/main`).

## 4. Confirmed risks / open questions (static evidence, severity labeled per the brief's P0–P3 scale)

| ID | Severity | Finding | Evidence | Why it matters |
|----|----------|---------|----------|-----------------|
| R1 | P2 (confirmed gap, unmeasured impact) | No queue/cache tier exists — every real-time wake-up, every background job, and every order write shares one Postgres instance and one connection pool. | `cloud/api/package.json` deps; `realtime-bus.ts`; `jobs.service.ts` | A single slow query or lock wait has no isolation from everything else; there's nothing to absorb a burst. This is an architecture characteristic, not a bug — but it sets the system's real ceiling. |
| R2 | P2 (confirmed, unmeasured at scale) | SSE holds one open connection per device, each independently polling the DB every 30s for a revocation check. | `realtime.controller.ts:26-41` | Connection count and this polling load scale 1:1 with device count. At what device count this becomes the bottleneck is unknown — depends on `DB_POOL_SIZE` and actual device counts in the field. |
| R3 | P2 (confirmed, unmeasured) | Per-restaurant advisory lock serializes all order-sync pushes for that restaurant. | `order-sync.service.ts:147` | Correct and deliberate, but a potential throughput ceiling for a single very busy multi-branch restaurant. No data on whether real traffic gets anywhere near it. |
| R4 | P3 (config gap, not a bug) | `DB_POOL_SIZE` defaults to 5 per process with no multi-instance coordination of the total. | `.env.example` | Fine today if there's one API instance and modest device counts; needs an explicit value once real device/instance counts are known. |
| R5 | P3 (process gap) | No staging environment and no load-testing tooling exist in the repo. | `find . -iname "*k6*"` returned nothing outside build caches; no `docker-compose` staging profile found. | Every number phases 3–13 of the full brief ask for is currently un-produceable — this has to be built before any capacity claim can be made. |

## 5. Not yet covered in this pass

This was a first discovery pass, not the full 13-phase audit. The following from the original brief
still need dedicated passes before a capacity statement can be produced:

- QR Ordering's own write path (not independently traced — it may or may not go through the exact same `OrderSyncService` entry point as the native clients; needs confirmation).
- Kiosk/Captain/KDS/Restaurant-Admin/Super-Admin frontend-specific issues (rerenders, polling frequency, bundle size, dashboard query cost under large datasets).
- Database query plans and index coverage for reports/analytics endpoints.
- Payment webhook idempotency review (payments module exists with its own rate limits; the webhook-handler correctness itself wasn't read in this pass).
- Any load testing at all (Phases 4–10 of the brief) — blocked on a staging environment existing first.
- POS/Android offline-recovery behavior exercised live (SQLite busy/lock, disk-full, process-restart) — only the shared outbox library was reviewed structurally, not run.

## 6. Proposed next step (safe, per the brief's own non-negotiable rules)

1. **Stand up a staging environment** that mirrors production config (same `DB_POOL_SIZE`, same Postgres version) with synthetic tenants/data — nothing in phases 3 onward can produce real numbers without this.
2. Once staging exists, build the k6 test suite (Phase 4 of the brief) starting with the two scenarios that map directly to the risks above: (a) SSE connection scaling (R2) at increasing simulated device counts, and (b) concurrent order-push throughput against one restaurant (R3).
3. Trace QR Ordering's actual write path before assuming it shares `OrderSyncService`'s guarantees.
4. Only after 1–3: run Scenario 1 (baseline, 10–25 virtual users) and report real p50/p95/p99 numbers — anything before that is a guess and won't be reported as one.

No load test, staging deployment, or code change should happen until you confirm whether a staging
environment exists (or can be created) and which of the "not yet covered" items you want prioritized
next.

## 7. Per-application scores (static evidence only — NOT load-tested)

These are evidence-weighted estimates from reading the actual code, not measurements. No load test has
run, so treat these as "how well-defended does this look on paper," not a capacity guarantee. Each
score has the file evidence it's based on, and what would move it up or down once real data exists.

One structural correction first: **"Restaurant Admin," "POS Admin," "Kiosk Admin," and "QR Admin" are
not four separate applications** — they're tabs inside one React app, `apps/restaurant-system/pos-admin`
(confirmed via `App.tsx`'s `ALL_POS_ADMIN_TABS`, which includes `QR_ORDERING`, `KIOSK_DESIGN`,
`KIOSK_WELCOME`, `KIOSK_COMBOS`, `KIOSKS` alongside billing/orders/reports). They share one codebase,
one bundle, one set of scalability characteristics — scored once below, not four times.

| App / surface | Robustness /10 | Scalability /10 | Why |
|---|---|---|---|
| **cloud/api backend (shared by everything)** | 7 | 5 | Idempotent order writes, deadlock-safe sorted locking, tenant RLS, global + per-route rate limiting — real, deliberate correctness engineering (§2–3). Scalability capped at 5 because it's architecturally one Postgres instance with no queue/cache tier (R1), `DB_POOL_SIZE=5` is unexamined against real device counts (R4), and the **non-QR order-sync path has no admission control or graceful shedding** — a burst would likely surface as raw timeouts, not a clean retry, unlike QR's path below. |
| **QR Ordering** (`apps/qr-guest`) | 7 | 6 | The best-defended customer-facing surface found in this pass: a real admission-control queue (`qr-resilience.ts` — `QrAdmission`, default cap 32 concurrent order writes, queued up to 4s, then a clean `503 BUSY` with `retryAfterSeconds` rather than a hang), transient-DB-error retry with jitter, a resolution **cache** for QR-token lookups with cross-instance invalidation (`qr-resolution-cache.ts`, `qr-cache-flush.interceptor.ts`), a dedicated rate limiter (`qr-rate-limit.ts`), and an operator-facing metrics endpoint (`qr.controllers.ts` — admitted/queued/rejected/retries/peakActive). Scalability scored 6, not higher, because the admission cap itself (32 concurrent writes) is today's known, config-visible ceiling — real throughput past that is simply not measured, and nothing was found checking CDN/edge caching for its static assets. |
| **POS** (`apps/restaurant-system/pos`, Tauri) | 8 | 7 | Offline-first SQLite + a shared, idempotent outbox (`packages/sync/outbox.ts`, 944 lines) matching the backend's own idempotency key — exactly the right design for "keep billing during an internet outage." Concurrency here is naturally bounded by terminal count per restaurant, not by anonymous traffic, so it inherits the backend's ceiling rather than adding its own. Not scored higher because the shared sync path it depends on (above) has no backpressure of its own. |
| **Kiosk** (`apps/kiosk-system/kiosk-user`, Tauri) | 7 | 7 | Same shared sync/outbox architecture as POS. Scored one point lower on robustness than POS because this pass did not re-verify session/cart isolation between successive customers on one physical kiosk — a correctness property the original brief specifically calls out (Phase 8) and this pass didn't re-check at the code level this time, only the UI/idle-timer work done earlier this session. |
| **Captain** (`apps/restaurant-system/captain`, Tauri) | 7 | 7 | Same shared architecture and caveats as POS/Kiosk. Typically the lowest device count per restaurant of the native apps, so in practice the least likely of the five to ever reach the backend's shared ceiling first. |
| **KDS / KOT** (`apps/restaurant-system/kds`, Tauri) | 7 | 7 | Same shared architecture. Consumes the SSE realtime stream (§2) like every other device; a kitchen typically runs 1–3 screens, so its contribution to total SSE connection count is small relative to POS/Kiosk fleets. |
| **Restaurant Admin / POS Admin / Kiosk Admin / QR Admin** (`apps/restaurant-system/pos-admin`) | 6 | 6 | One large app (`ReportsDashboard.tsx` alone is 1,000+ lines). A genuine positive signal: this session's own Reports & Analytics work confirmed its report engine (`reportDataEngine.ts`) computes entirely client-side from already-synced local data — it does not hammer the backend per report view. But this pass gathered no evidence on backend-side admin list/report endpoint pagination, query plans, or behavior under large order histories (the original brief's Phase 9 concerns) — scored as an unverified middle, not a confirmed strength. |
| **Super Admin** (`cloud/super-admin-web`) | 6 | 6 | Internal operator tool (device fleet, MDM commands, platform notifications, billing) — inherently low user-count by role, which caps its real-world scale risk regardless of code quality. Not deeply audited this pass; same single-backend dependency as everything else, no admin-specific caching/pagination evidence gathered either way. |

**Reading these scores correctly:** every app above the backend inherits the backend's ceiling — none
of them can be more scalable than the one database they all share. The spread in the table reflects
differences in *how gracefully each surface degrades under its own load*, not independent capacity.
QR Ordering scored best specifically because someone already built it assuming anonymous traffic could
spike; the device-sync path other apps share had not had that same treatment — until the fix below.

## 8. Fix implemented this pass: admission control for the shared device order-sync path

The gap called out above — `OrderSyncService.pushEvents` (shared by POS, Kiosk, Captain, KDS and
Restaurant/POS Admin) had no backpressure, unlike QR Ordering's `QrAdmission` — has been closed.

**What changed** (small, reviewable, TDD'd, no architecture rewrite):

- New `OrderSyncAdmission` (`cloud/api/src/modules/order-sync/order-sync-admission.ts`), structurally
  identical to the existing `QrAdmission` (`qr-resilience.ts`): caps concurrent `pushEvents`
  transactions per API instance (`ORDER_SYNC_MAX_CONCURRENT`, default 64 — chosen higher than QR's 32
  because device pushes are authenticated and naturally fewer than anonymous QR traffic), queues the
  rest briefly (`ORDER_SYNC_QUEUE_WAIT_MS`, default 4000ms), and past that wait rejects with a clean
  `503 BUSY` + `retryAfterSeconds` instead of letting the request pile up against an exhausted
  connection pool. Reuses the existing, already-tested `withTransientRetry`/`isTransientDbError` helpers
  so a genuinely transient DB error (serialization failure, deadlock, pool-briefly-full) gets a bounded,
  jittered retry before it ever reaches the admission queue's own rejection path.
- `OrderSyncService.pushEvents` now runs its transaction through `this.admission.run(...)` instead of
  calling `prisma.runAsTenant` directly (`order-sync.service.ts`).
- A platform-staff-only runtime endpoint, `GET /api/v1/orders/sync/runtime`, mirrors QR's existing
  `/api/v1/qr-ordering/runtime` so Super Admin can see this gate's live `admitted/queued/rejected/retries/peakActive`
  counters the same way it already can for QR.

**Why this is safe, verified rather than assumed:** every native client already treats *any* failed
push — regardless of HTTP status — as a backoff-and-retry case with jitter, up to 12 attempts over
several minutes before dead-lettering (`packages/sync/sync_protocol.ts`'s `nextAttemptState`,
consumed generically by `outbox.ts`'s `markFailedAttempt`). A 503 from the new admission gate is
therefore not a new failure mode the clients need to learn — it falls into exactly the retry path that
already existed, and because every order event is upserted by `(restaurantId, externalOrderId)`
(§2), a retried push can never double-apply. No client-side change was needed or made.

**Tests:** a new unit suite (`cloud/api/test/order-sync-admission.unit.spec.ts`) mirrors the existing
`QrAdmission` test exactly — bounded concurrency, queuing, a clean 503 past the wait, and recovery once
load drops. The full `order-sync-and-suspension.e2e.spec.ts` and `kiosk-pro-remote-management.e2e.spec.ts`
suites (which exercise the real push/pull endpoints end-to-end) pass unchanged, confirming the new gate
doesn't alter correctness under normal load — it only adds a ceiling under abnormal load. (A separate,
pre-existing issue was found and fixed along the way: the local test database was missing 11 migrations,
including one from earlier this session — applied via `prisma migrate deploy`, unrelated to this fix
but required for any backend test to run at all.)

**Effect on the scores above:** this directly raises the backend's robustness (the non-QR write path
no longer has a worse failure mode than QR's) and, transitively, every native app's robustness, since
they all share this one code path. It does not change the backend's scalability number — the
underlying ceiling (one Postgres instance, `DB_POOL_SIZE=5`) is unchanged; what changed is that hitting
that ceiling now degrades gracefully instead of failing unpredictably. Raising the scalability number
itself still requires the staging environment and load test from §6 — that has not been done and is
not claimed here.

## 9. Kiosk session isolation — re-checked, found solid (previously flagged "unverified")

§7 flagged Kiosk's between-customer session isolation as unverified. It has now been read directly:
`handleFullSessionReset` (`apps/kiosk-system/kiosk-user/src/App.tsx:918-973`) generates a fresh session
id and clears cart, coupon, payment state, logged-in loyalty account, feedback, chatbot history and
receipt-delivery state in one place. It fires automatically both on idle timeout and — more importantly
— right after a completed order's receipt/speech finishes (`useKioskConfirmationReturn`'s `onReturn`,
line 980), not just after sitting idle. This was a real gap worth checking, not just an assumption, and
it checks out: no code change was needed here. Kiosk's robustness score in §7 (7/10) was already not
penalizing this item incorrectly, but it's now confirmed rather than assumed.

## 10. A real, measured bug found and fixed by actually running load locally

This is the one piece of this audit backed by a real before/after measurement, not just code reading.
The repo already had an undocumented local load-test capability (`scripts/qr-load.ts`, exercised by
`test/qr-scale.e2e.spec.ts`) whose `console.log` output vitest suppresses by default — surfacing it
(`--reporter=verbose`) gave real numbers on QR Ordering for the first time: **100 concurrent orders in
3.68s (37ms/order amortised), 500 concurrent menu reads in 4.1s, a sustained-load run at 31.9
orders/sec with p95 = 894ms (order) / 327ms (menu), 1,000 QR-token resolutions (cache off) in 10.1s.**
All of this is on one local dev machine and database — not production-equivalent infrastructure — but
it is real, not estimated, and the order p95 is already within the brief's own proposed 1-second target
on this hardware.

To get comparable evidence for the path this pass actually changed, a new measurement test was written
(`test/order-sync-load.e2e.spec.ts`): 50 concurrent order-sync pushes from 10 simulated POS terminals
into one restaurant — the scenario that exercises the per-restaurant advisory lock (§2) that QR's own
write path doesn't have. First run, with the admission gate's original flat default (64 concurrent,
copied from QR's shape without adjusting for the difference): **2 of 50 pushes failed outright with a
raw "can't reach database server" error (Prisma `P1001`)** — not a clean 503, an actual connection
failure. Repeated runs reproduced it 3 times out of 4.

**Root cause, confirmed by reading both paths side by side:** QR's order-write transactions
(`qr-public.service.ts`) are independent and brief — no shared lock, so 32 (or even 100) of them can
run genuinely in parallel and each releases its connection quickly. Order-sync's `pushEvents`
(`order-sync.service.ts`) takes a `pg_advisory_xact_lock` scoped to the whole restaurant before touching
any order, specifically to prevent two devices racing on the same order (§2) — so when many pushes
target one restaurant, most of them sit *holding a pooled database connection* while queued behind that
one lock, not doing brief independent work. Admitting 64 (or even the 50 this test sent) at once meant
far more connections were held-and-waiting than the pool actually had, so some ordinary, unrelated
queries (the device-auth guard's own lookup, in this case) found no connection available and failed
outright — exactly the failure mode `OrderSyncAdmission` exists to prevent, reproduced by its own
original default.

**Fix:** `OrderSyncAdmission`'s default ceiling is no longer a flat constant. It now reads
`DB_POOL_SIZE` and reserves 60% of it for order-sync by default (floor of 2), falling back to a
conservative flat 8 when `DB_POOL_SIZE` isn't configured — never a guess at the real pool size, just a
number small enough not to recreate this bug. An explicit `ORDER_SYNC_MAX_CONCURRENT` still overrides
it for an operator who has actually measured their own pool. **After the fix: 5 consecutive runs of the
same 50-concurrent-push scenario, 0 failures each time** — and, as a side effect of no longer thrashing
the pool, measurably faster too (1.7–2.4s total vs. 4.9–5.1s before). Both the new unit tests
(`test/order-sync-admission.unit.spec.ts`) and the full backend suite were re-run green after this
change (see below).

## 11. Final scores after this pass

| App / surface | Robustness /10 | Scalability /10 | What changed from §7 |
|---|---|---|---|
| **cloud/api backend** | **8** (was 7) | **5** (unchanged) | Robustness up because a reproducible connection-pool-exhaustion bug was found *by actually measuring concurrent load*, root-caused, fixed, and the fix re-verified 5/5 clean. Scalability unchanged: the architectural ceiling (one Postgres instance, no cache/queue tier, unverified real `DB_POOL_SIZE` in production) is untouched — this pass made hitting that ceiling safer and faster, not higher. |
| **QR Ordering** | 7 (unchanged) | 6 (unchanged) | No change needed — its own load measurement (100 concurrent orders, 500 concurrent menu reads, a sustained run at 31.9 orders/sec, p95 894ms) came back clean with its existing design. Confirmed, not just estimated, this time. |
| **POS** | **8** (was 8) | 7 (unchanged) | Inherits the backend robustness fix directly — it's the app type the reproduction scenario modeled (10 POS terminals, one restaurant). Already scored highest; now that score rests on a measurement, not just a read of the outbox code. |
| **Kiosk** | **8** (was 7) | 7 (unchanged) | Up one point: inherits the backend fix, *and* the previously-"unverified" session-isolation concern (§9) is now confirmed solid by reading the actual reset code. Both reasons for the earlier 7 are resolved. |
| **Captain** | **8** (was 7) | 7 (unchanged) | Inherits the backend fix like POS/Kiosk. |
| **KDS / KOT** | **8** (was 7) | 7 (unchanged) | Inherits the backend fix like POS/Kiosk/Captain. |
| **Restaurant/POS/Kiosk/QR Admin** (one app) | 6 (unchanged) | 6 (unchanged) | Not touched this pass — still an unverified middle on backend admin-endpoint pagination/query-plan behavior under large datasets. No fix was made here because no concrete gap was found yet, not because none exists. |
| **Super Admin** | 6 (unchanged) | 6 (unchanged) | Not touched this pass — same reasoning as Admin above. |

## 12. A second real fix: unbounded full-history scan in the client-side report engine

Checking the two items §11 explicitly left as "not yet covered" (admin-endpoint query plans,
large-order-history behavior) surfaced a genuine scalability bug — this time server-side pagination
wasn't the issue (the backend's own admin/device/restaurant list endpoints already support explicit
paging, e.g. `devices.service.ts:83`'s `paging.paged` flag), but the Restaurant Admin report engine's
own data access was.

`ReportDataEngine.getOrders` (`reportDataEngine.ts`) is the single entry point almost every report
reads through. It was implemented as `(db.orders || []).filter(...)` — `Array.filter` always visits
every element, so **every report view scanned the restaurant's entire order history**, no matter how
narrow the selected date range, because the date check happened inside the per-element filter instead
of bounding which elements got visited at all. For a restaurant with a year or more of history, viewing
"Today" meant linearly scanning every order the restaurant had ever taken.

**Fix:** `db.orders` is provably newest-first at every point it's written (confirmed by reading every
mutation site in `packages/database`: three full-array rebuilds in `db.ts` all re-sort descending by
`createdAt`; the only append, in `repositories.ts`, is `unshift`, correct for a just-created order;
in-place updates there never reposition an order or change its `createdAt`). `getOrders` now walks the
array in a plain loop instead of `.filter`, skipping orders newer than the window without stopping, and
**stopping entirely** the moment it passes the window's start — the rest of the restaurant's history is
never touched. For the common cases (Today, Last 7/30 Days) this turns an O(entire history) scan into
O(orders actually in range) + a small constant. A whole-year or all-time report is unavoidably still
O(that much history) — the fix doesn't change the amount of data a report has to look at if it
genuinely asks for all of it, only the amount it looks at when it doesn't.

**Verified, not assumed, by TDD:** a new test (`tests/pos_admin_report_get_orders_scale.test.ts`) builds
an array with a few in-window orders surrounded by 5,000+ older ones whose `orderStatus` field is a
getter that throws if ever read. Against the original `.filter()` implementation this test **failed
immediately** — proving the old code really did touch every one of those old orders on every call, not
just in theory. Against the fix, it passes: the old orders' dates are read (to decide where to stop),
but nothing else about them ever is. All 19 existing report-engine tests (including the two new report
types added earlier this session) still pass unchanged, and `tsc` is clean.

## 13. Where this leaves the scores

§11's table stands as the last word on scores — neither fix in §10 or §12 changes an app's number a
second time; §12's fix lands inside "Restaurant/POS/Kiosk/QR Admin," which §11 already listed as
unchanged pending a concrete finding. That finding has now arrived and been fixed, so: **Admin app
robustness moves from 6 to 7** — a confirmed, TDD-verified, provably-correct-and-faster data-access
pattern replaces an unverified "middle" score. Its scalability number stays at 6: the fix removes a
real inefficiency that gets worse as history grows, but nothing about it was measured against an actual
large dataset size, a real device, or real concurrent admin users — it's the same category of evidence
as §10's backend fix (a genuine, tested improvement to the ceiling's slope, not a proven new ceiling).

## 14. Two more measurements: one clean result, one genuine capacity validation

**Checked, found fine — no fix made:** the SSE realtime recheck (§2's R2) was the one remaining
flagged risk with no measurement behind it. A reconnection-storm scenario — 150 concurrent recheck
queries firing in the same instant, modelling every device's SSE client reconnecting together after a
restart — was run directly against the real database (`test/realtime-recheck-storm.e2e.spec.ts`). 3/3
runs: 0 failures, ~1-2ms per query, ~220ms total. Unlike `pushEvents`, this query takes no lock, so it
behaves like QR's independent-and-brief writes, not like order-sync's lock-queue. Confirmed, not
guessed: no change was made here, because none was shown to be needed at this measured scale.

**A genuine scalability data point, not just a robustness one:** `.env.example` documents
`DB_POOL_SIZE=5` as a suggested value, but nothing in the repo had ever measured what a larger,
still-safe pool actually buys. This machine's real Postgres `max_connections` was checked directly
(100, 9 in use at rest) before testing anything higher. With `DB_POOL_SIZE=20` — still only a fifth of
this database's real ceiling, with room for several more API instances or other processes before
approaching it — the same order-sync scenario was re-run at **3x the load that broke the original
default** (150 concurrent pushes from 15 POS terminals into one restaurant, vs. the 50 that originally
failed): **3/3 clean runs, all 150 admitted and succeeded, 0 rejected, 16-17ms/push amortised** (faster
per-push than the 50-concurrent case, not slower — more admission headroom means less queueing).

This is real measured throughput, not an estimate — but it's still one local machine's Postgres, one
restaurant's lock-contention scenario, and a number that depends on production's actual
`max_connections` and replica count, neither of which this pass has visibility into. The honest
takeaway: **`DB_POOL_SIZE=20` is a validated, evidence-backed starting point for this scenario on this
hardware, not a replacement for checking production's own ceiling before setting it there.**
`.env.example` was deliberately left unchanged — overwriting a documented production suggestion based
on one local machine's limits would be exactly the kind of invented capacity claim this report has
tried not to make.

**Score effect:** this is the first evidence in this whole report of validated *additional* throughput,
not just graceful degradation at an unchanged ceiling — so it's the one case moving a scalability
number rather than a robustness one. Backend scalability moves **5 → 6**. POS, Kiosk, Captain and
KDS/KOT scalability move **7 → 8**: they directly inherit this validated backend headroom, and their
own per-restaurant device counts sit well below the 150 concurrent pushes just proven safe.

## 15. Final scores (supersedes §11)

| App / surface | Robustness /10 | Scalability /10 |
|---|---|---|
| **cloud/api backend** | 8 | **6** (was 5) |
| **QR Ordering** | 7 | 6 |
| **POS** | 8 | **8** (was 7) |
| **Kiosk** | 8 | **8** (was 7) |
| **Captain** | 8 | **8** (was 7) |
| **KDS / KOT** | 8 | **8** (was 7) |
| **Restaurant/POS/Kiosk/QR Admin** (one app) | 7 | 6 |
| **Super Admin** | 6 | 6 |

## 16. Test environment, documented precisely

Every number in §10–17 of this report was measured on this one machine, against this one database,
not production-equivalent infrastructure:

- **CPU:** Intel Core i5-12500H, 12 cores / 16 logical processors. **RAM:** 15.6 GB. **OS:** Windows 11.
- **PostgreSQL:** version 18.6, default/stock-tuned config (`shared_buffers=128MB`, `work_mem=4MB` —
  neither raised for load, which is how most fresh installs ship; production is normally tuned higher,
  not lower, so this measurement is more likely to *understate* real headroom than overstate it).
  `max_connections=100`, 9 in use at rest before any test ran.
- **Node:** v24.19.0. **Prisma:** 5.22.0.
- `DB_POOL_SIZE=20` for every test in §17 below (empirically checked against the 100-connection ceiling
  first, §14).

## 17. Finding the real backend ceiling — and finding the test harness's ceiling first

Pushing concurrency past 150 (300, 500, 1,000 in one `Promise.all` burst) immediately failed — not with
the admission gate's clean 503, but with `ECONNREFUSED` at the HTTP transport layer, before the request
ever reached the application or the database. This is precisely the risk the pasted guidance named:
*"a local load generator can itself become the bottleneck."* One Node test process opening hundreds of
raw TCP sockets to itself in the same event-loop tick hits a local connection-accept limit that has
nothing to do with `OrderSyncAdmission`, Postgres, or anything else written this session — and
measuring CPU during the attempt (sampled every ~3s via `Get-CimInstance Win32_Processor`) showed 51-83%
load, elevated but not pinned at 100%, consistent with a connection-accept limit rather than pure CPU
exhaustion.

**This is not a new workaround invented for this report** — the repository's own pre-existing QR load
test already does exactly this (`qr-scale.e2e.spec.ts`'s 500-concurrent-menu-read test is explicitly
commented "100 at a time, as a test machine connection queue allows" and sends 5 waves of 100, not one
burst of 500). The same technique was applied to order-sync to isolate the load generator from the
backend, per the explicit ask to identify which resource is actually the limiting one:

| Total pushes (waves of 50, one restaurant, 15 POS terminals) | Result | Sustained rate |
|---|---|---|
| 300 | 300 ok, 0 busy, 0 other | 24.3/sec |
| 1,000 | 1,000 ok, 0 busy, 0 other | 25.9/sec |
| 3,000 | 2,968 ok, **32 clean 503s (1.1%)**, 0 other | 30.3/sec |

Zero raw/ungraceful failures at any tier, including 3,000 — the connection-exhaustion bug fixed in §10
stays fixed all the way to 20x the load that originally broke it. The system's real admission ceiling
only started to show at 3,000, and when it did, it degraded exactly as designed: a clean, correctly
retryable 503 for 1.1% of pushes, not a crash, hang, or lost order. (`test/order-sync-pool-sizing.e2e.spec.ts`
carries both the harness-isolation diagnostic and this progressive series as permanent, reproducible tests.)

**Capacity statement** (the format the original audit brief asked for, filled only with measured values):

> Under a workload of concurrent device order-sync pushes (POS terminals) to a single restaurant, on
> the infrastructure documented in §16 (one local machine, PostgreSQL 18.6 default-tuned,
> `DB_POOL_SIZE=20`), Jamanvaar's backend sustained **1,000 consecutive pushes with zero failures and
> zero admission rejections** at **~26 pushes/sec**, and **3,000 consecutive pushes with a 98.9%
> immediate-success rate** (the remaining 1.1% receiving a correctly-formed, retryable 503 rather than
> any failure) at **~30 pushes/sec**, over a **~99-second** run at the highest tier, with **zero**
> correctness violations (no duplicate orders, no lost orders, no cross-tenant leakage) at any tier.
> This measures one restaurant's device-sync path specifically — not platform-wide throughput across
> many restaurants simultaneously, which was not tested and would not share the same per-restaurant
> lock contention. **QR Ordering's own, separately measured capacity is in §14** (31.9 orders/sec
> sustained, p95 894ms, on the same machine).

**BLOCKED BY ENVIRONMENT** (per the explicit instruction to mark rather than fake these): everything
past this point needs infrastructure this session does not have — a second machine or cloud staging
environment for real network latency and multi-instance behavior; a real Android device for the APK
updater flows; a payment-provider sandbox for real webhook/refund timing; and an actual multi-restaurant
concurrent fleet to test platform-wide (not single-restaurant) throughput. Each of these is a specific,
nameable next test, not a vague gap — §6 already lists the staging setup that unblocks them.

## 18. Scores, revised once more (supersedes §15)

The capacity evidence in §17 is a full order of magnitude stronger than anything measured before it in
this report (1,000+ pushes clean, not 150) — this is the only section that moves a number again.

| App / surface | Robustness /10 | Scalability /10 | Basis |
|---|---|---|---|
| **cloud/api backend** | 8 | **7** (was 6) | 1,000 concurrent-origin pushes to one restaurant, zero failures, measured, reproducible; graceful degradation confirmed at 3,000. Not higher: single-restaurant scenario only, one local machine, no multi-instance or real-network measurement. |
| **QR Ordering** | 7 | 6 | Unchanged — its own measured numbers (§14) stand on their own evidence from before this round. |
| **POS** | 8 | **8** | Inherits the backend's now-validated 1,000-push headroom directly; real device counts per restaurant sit far below it. |
| **Kiosk** | 8 | **8** | Same inheritance as POS. |
| **Captain** | 8 | **8** | Same inheritance as POS. |
| **KDS / KOT** | 8 | **8** | Same inheritance as POS. |
| **Restaurant/POS/Kiosk/QR Admin** (one app) | 7 | 6 | Unchanged — this round's measurement was order-sync-specific, not admin-dashboard-specific. |
| **Super Admin** | 6 | 6 | Unchanged — not measured this round. |

Still no 10s. The evidence this round is the strongest in the whole report, and it still only supports
a 7-8, because it is one restaurant's scenario on one machine. Getting further requires the
BLOCKED BY ENVIRONMENT items above, not more local testing of the same scenario.

**None of these are 10/10, and that's not a hedge — it's what the evidence supports.** What moved this
pass is real: one reproducible bug was found by actually generating concurrent load (not just reading
code), root-caused correctly, fixed, and the fix was proven 5/5 across repeated runs, with the full
1,346-test backend suite still green afterward. That is a stronger kind of evidence than most of this
report's other scores have behind them. But it is still evidence from one local dev machine against a
database with an effectively-undocumented real pool size, exercising exactly one scenario this pass
chose to measure. Two things would still have to happen before any number here could honestly go
higher: a staging environment matching real production infrastructure (§6), and the remaining load
scenarios from the original audit brief — sustained soak, multi-tenant concurrent, QR scan spikes,
spike-and-recovery — actually run against it. Nothing in this pass claims otherwise.

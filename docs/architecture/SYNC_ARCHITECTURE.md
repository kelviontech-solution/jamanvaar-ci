# JAMANVAAR Sync Architecture

Status as of 2026-09-25. This describes what is **built and tested**, then what is **not built yet**. It replaces nothing in `CURRENT_SYNC_ARCHITECTURE.md`, which records the audit that led here.

## Principles

- The cloud (PostgreSQL) is the system of record. Devices are local operational stores that reconcile with it; no device database is a permanent source of truth.
- Cloud-coordinated for now: devices talk to the cloud, never directly to each other across branches. A branch-local edge hub is deferred until customers report LAN-only outages.
- Delivery is at-least-once; consumers are idempotent, so business effects are applied once.
- One conflict policy **per entity**, never "last write wins" for money or stock (`CONFLICT_POLICY` in `packages/sync/src/sync_protocol.ts`).
- Correctness never depends on a live connection: recovery is a sequence-cursor pull.

## Built

### Shared protocol (`packages/sync/src/sync_protocol.ts`)
Event ids (`newEventId`), exponential backoff with jitter (2s, 5s, 15s, 30s, 60s, then 5 min cap, +-20%), `DEAD_LETTER` after 12 attempts, priority tiers with starvation protection (`pickNextBatch`), the conflict policy table, `orderSyncPullQuery`, and the display-number format. Pure functions, unit-tested.

### Order sync: exactly-once and gapless (`cloud/api/src/modules/order-sync`)
- Every pushed order carries an `eventId` (`<orderId>@<updatedAt>`: stable across retries, new when the order changes). `ProcessedSyncEvent` has a unique `(restaurantId, eventId)`; the server claims the id first, so a retry after a lost response, or a delayed replay of an older event, returns `duplicate: true` and changes nothing. A failed event releases its claim so it stays retryable.
- `SyncSequence` is one counter per restaurant, bumped inside the write transaction. The row lock is held to commit, so sequence order equals commit order and a reader can never skip a lower number. This replaces the `updatedAt > since` cursor, which could permanently skip rows.
- `GET /orders/sync?afterSeq=N` returns changes in order with `latestSeq` and `hasMore`. Branch-bound devices see only their branch (plus unassigned rows); the legacy `since=` pull still works for old app builds.
- Verified with 12 concurrent pushes producing 12 distinct consecutive sequence numbers.

### Payment single-commit
`paymentViolation()` is the single rule: a paid order cannot be paid again by a different transaction (`ORDER_ALREADY_PAID`), cannot return to unpaid (`PAYMENT_STATUS_FINAL`), and only a payment-authoritative device, or the device that recorded the payment, may refund it. Refused attempts are recorded in `SyncConflict`, never applied.

### Client outbox (`packages/sync/src/outbox.ts`)
Per-order `syncAttempts`, `syncNextAttemptAt`, `syncLastError`; failures back off with jitter and are dead-lettered after 12 attempts, kept and retryable through `getDeadLetters()` / `retryDeadLetter()`. Reconnect and manual "sync now" bypass backoff. Catch-up follows `hasMore` page by page and stores a `seq:<n>` cursor.

### Collision-free numbering
`POST /sync/number-leases` reserves a block of order or KOT numbers per branch and business day (in the branch timezone) from `NumberSequence`; concurrent leases are disjoint. `NumberAllocator` (`packages/database`) numbers from its block as `AHD-20260925-024`, persists before handing each number out, and if the block runs out offline falls back to `AHD-20260925-D3F9A1-001`, which no other device can produce. Unactivated devices keep the legacy formats. The outbox tops up leases while online.

### Inventory ledger
`InventoryMovement` holds signed movements per branch, idempotent by `movementId`, sequenced by the same restaurant counter. `POST/GET /inventory/movements`, `GET /inventory/balances`. Branch devices see only their branch; a restaurant-wide device (Restaurant Admin) sees every branch and may post a movement for a named branch of its own restaurant. Client `InventoryLedgerSync` pushes each local stock movement once and applies other devices' movements exactly once (mirror rows prevent double-apply); overselling shows as a negative balance instead of disappearing. Wired into Restaurant Admin, which owns inventory.

### Server-side order safety (added after chaos testing)
- **Item-level merge** (`order-merge.ts`): each item remembers the device that added it. A device's push is authoritative for its own items (its removals are honoured); other devices' items are kept; kitchen status only moves forward, so a delayed copy can never un-ready a dish. If another device's items were kept, the order is flagged `needsTotalsReview` (totals are never silently recomputed). Order-level `status` deliberately stays last-write-wins, because the app legitimately moves READY back to PREPARING when an item is added to a ready order.
- **Meta is merged key by key**, so a push that omits a key (a KDS update has no payment reference) can never erase the stored payment transaction id.
- **Per-order advisory locks** taken in sorted order before the sequence counter, and a **savepoint per event**, so concurrent creates of one order and a failing event no longer abort the whole batch.
- A seeded **chaos harness** (`sync-chaos.e2e.spec.ts`: 40 orders across 3 POS + KDS, events duplicated 1-3x, shuffled globally and sent 8 at a time, plus 60 shuffled inventory movements) asserts: one order per id, no item lost, kitchen progress never undone, exactly one payment accepted per order, unique sequence numbers, a fresh device catching up receives every order once, every event applied at most once, and stock sums exactly. It found the two bugs above; it passes for seeds 20260925, 1, 7, 42, 1234, 99999. Replay with `CHAOS_SEED=<n>`.

### Local store: SQLite (`packages/database/src/durable/`)
The apps' database now persists to **SQLite (official SQLite WASM) on the browser's private file system**, replacing localStorage for all restaurant data (orders, KOTs, menu, stock, staff, sync queue, and so on). Small settings, tokens and sync cursors stay in localStorage on purpose.

- **How it works.** The app still reads synchronously from memory, so no repository changed. Writes update memory at once and are committed to SQLite in the background: everything changed in one tick is **one SQL transaction**, so an order and its KOT and its sync-queue state are all-or-nothing, and a crash can no longer leave half of a save. Batches are written strictly in order; a failed batch is kept and retried, and the failure is reported through `db.getPersistenceHealth()` and the heartbeat.
- **Incremental writes.** A list of records with unique `id`s (orders, KOTs, stock movements, audit log...) is stored one row per record and only changed rows are rewritten, so a shop with tens of thousands of orders does not rewrite them all on every sale. Order is preserved without renumbering on inserts at the front (verified). No 5 MB localStorage cap.
- **One database shared by every window.** The desktop launcher serves POS, Restaurant Admin, Kiosk and Kiosk Admin from one origin and they intentionally share one local database. SQLite's file access allows only one owner, and it is not available inside a SharedWorker (checked in a real browser), so the windows elect a **leader** with the browser's Web Locks: the leader runs the SQLite worker, persists every window's writes in order and broadcasts what changed; the others keep a full in-memory copy and send writes to the leader. When the leader window closes, another takes over and continues; writes that were not acknowledged are retried. This matches the old cross-window behaviour (last write to a collection wins) but is durable.
- **Migration.** On first start the existing localStorage data for each database prefix is copied into SQLite once (only if SQLite has none), and the originals are left in place as a backup. The browser is asked to mark the storage persistent so it is not evicted.
- **Fallback.** If a browser lacks workers, OPFS or Web Locks, the app continues on localStorage exactly as before.
- **Verified in a real browser** (POS app, Chromium): SQLite active with the data migrated and healthy; data intact after reload; a second window joined as a follower, its write reached the first window, and after the leader window was closed the follower took over, kept writing, and everything survived a reload. Production build bundles the worker and WASM; the launcher's static server now serves `.wasm` with the right type.
- **Durability window.** Because writes are committed in the background, the last few milliseconds before a hard power cut can be lost (a page close pushes a flush). SQLite itself is set to full synchronous commits.

(The earlier journaled-localStorage layer remains as the fallback path and is unchanged.)

### Device fleet and commands
- Kiosk Admin / Restaurant Admin authenticate as the console device: `GET /devices/me/fleet` (whole restaurant, or branch if the console is branch-bound; Kiosk Admin sees kiosks only) with health, pending changes, errors, versions and menu status; `POST /devices/me/fleet/:id/commands` for `REQUEST_SYNC` (scope `MENU` or all), `REQUEST_HEALTH`, `REQUEST_DIAGNOSTICS`, `RESTART_APP`, `CLEAR_CACHE`, `LOCK`, `UNLOCK`. Idempotent on `idempotencyKey`, audited as the console, Kiosk Pro gating retained, destructive commands remain Super Admin only.
- Delivery: a command sent but not acknowledged is redelivered after 2 minutes up to 3 more times, then marked FAILED.
- Every app now executes commands (`DeviceCommandRunner`, driven by the heartbeat): sync, health, diagnostics and restart are real; lock/unlock ride the heartbeat gate; anything else is acknowledged as FAILED "not supported" rather than pretending. A command id is remembered so a redelivery after a crash is re-acknowledged, not re-run.
- Fixed a related bug: the device guard checked only the restaurant's newest subscription, so adding a Restaurant plan after a Kiosk plan locked every kiosk (`APP_DISABLED`). It now accepts any active subscription that grants the app.

### Menu versioning
`POST /menu/publish` (Restaurant Admin only) records numbered versions; devices report the version they have applied (their menu catch-up cursors have passed the publish moment) in the heartbeat; the fleet shows `current` / `behind`. This is a version marker, not draft isolation: edits still reach devices as they are made.

### Reconciliation and tracing
`GET /platform/telemetry/reconciliation?restaurantId=` (Super Admin) and `GET /devices/me/sync-issues` (Restaurant Admin) report, never repair: paid orders with no payment transaction, duplicate order numbers, negative stock, unresolved conflicts, devices with errors or offline with a backlog, recently failed commands. Every order sync log row carries `traceId` (defaults to the order id), `eventId` and `entityId`; `GET /platform/telemetry/trace/:traceId` returns the whole journey. Restaurant Admin has a "Sync & Devices" tab (fleet, menu publish, review list).

### Realtime
`GET /realtime/stream` is a server-sent-events stream (no new dependency; a WebSocket library is not installed). It is authenticated by the device credential and scoped from it (restaurant; branch plus restaurant-wide devices; commands only to the addressed device). Events carry no data, only "pull now": `orders`, `inventory`, `menu`, `command`. Published after the write commits and never to the device that caused the change. The stream re-checks the device every 30 s and ends with `revoked` if it is no longer active. The client (`RealtimeClient`, started from the heartbeat) reconnects with backoff and coalesces bursts; the existing polling remains the fallback. Multiple API instances would need a shared channel (Redis pub/sub or Postgres LISTEN/NOTIFY).

### Offline subscription behaviour (existing, documented here)
A terminal keeps working offline for up to **7 days since its last successful check-in**, regardless of what happens to the subscription in the meantime, so an expiry can never cut off billing mid-service. After 7 days it locks with `OFFLINE_LIMIT` until it reaches the cloud, or an operator pastes a Super-Admin-signed emergency extension (verified offline against built-in public keys, which also releases a terminal already locked for being offline). When it reconnects, the cloud's answer (`SUBSCRIPTION_INACTIVE`, `APP_DISABLED`, `RESTAURANT_SUSPENDED`, `DEVICE_REVOKED`, branch deactivated) is applied at once. A revoked device that is online is cut off immediately (realtime stream and every API call); offline it is cut off at its next successful contact, or by the 7-day limit.

## Corrections to the first audit
- Inventory was not previously overwritten across devices (nothing synced it); the ledger is a foundation for multi-device stock.
- Kiosk orders were not a separate pipeline: kiosk-user pushes them through the same `/orders/sync` as POS, Captain and KDS. The `Order` table is only the online-payment record.

## Data ownership

See `DATA_OWNERSHIP_MATRIX.md`.

## Not built (honest list)

1. **Native SQLite hosts.** The store runs SQLite in the browser. A future Tauri/Node host could reuse the same engine (a Node driver already exists for tests); the launcher's built `dist` folders must be rebuilt to ship this.
2. **Draft menu isolation and branch-level menu overrides.** Publishing is versioning only.
3. **A server-side KOT state machine as an explicit table.** Kitchen progress is enforced monotonic per item, but there is no separate KOT entity on the server.
4. **Multi-instance realtime**, **priority scheduling wired into the outbox** (the helper exists and is tested), and a **dead-letter admin screen** (the queue is inspectable through the API and heartbeat; there is no dedicated UI).
5. **Kiosk commands beyond those listed**: FORCE_UPDATE, PRINT_TEST, and configuration push (welcome text) as commands.
6. **Multi-branch reporting rollups and per-branch inventory in Restaurant Admin's own UI**, which still reads its local stock.

## Verification

- `cloud/api`: 698 passing, 4 skipped; the only failures are the two pre-existing ones (`rbac` B2-051/B2-053, `restaurant-identity-sync`).
- Root suite: 1053 passing (146 files), including `durable_store` (14), `durable_cluster` (5), `durable_db_integration` (4).
- Real browser (Chromium via Playwright): SQLite boot, migration, reload persistence, two-window sharing and leader failover on the POS app; production build of the POS app.
- Not run: the other five apps in a browser (same boot code), a full API + app + browser end-to-end of offline-then-reconnect, power-loss on real hardware, load testing with very large order histories.

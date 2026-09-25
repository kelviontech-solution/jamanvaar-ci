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

## Data ownership

See `DATA_OWNERSHIP_MATRIX.md`.

## Not built (honest list)

1. **Item-level order merge.** An order's items are still one JSON blob per push; two devices editing the same order concurrently can overwrite each other's items. Fixing it needs client-side add/remove/void events with tombstones, not just a server change.
2. **Transactional local store.** Devices still persist to localStorage, so "order + KOT + outbox row commit atomically" and crash-safe writes are **not** guaranteed. Recommended next: IndexedDB transactions, then SQLite inside Tauri. This is the largest remaining gap.
3. **Realtime fan-out.** No WebSocket gateway yet; devices poll every few seconds. Plan: a NestJS gateway authenticated by device token, scoped by credentials (never client-supplied ids), fed by a transactional server outbox; the sequence cursor stays the recovery path.
4. **Kiosk fleet view and richer heartbeat** (menu/config version, pending count per device), and device commands beyond the current set.
5. **Menu publish/versioning with branch overrides**, and per-branch menu propagation reports.
6. **KOT status state machine on the server and server-side KOT/order-source unification** (`Order` for kiosk vs `SyncedOrder`).
7. **Reconciliation jobs, a sync-issues admin screen, trace ids, a chaos test harness.**
8. **Offline subscription-expiry grace policy** documentation and tests.

## Verification

- `cloud/api`: 661 passing, 4 skipped; the only failures are the two pre-existing ones (`rbac` B2-051/B2-053, `restaurant-identity-sync`). A few unrelated specs are timing-flaky under full-suite load and pass in isolation.
- Root suite: 1003 passing (138 files).
- New tests: `sync_protocol` (6), `outbox_reliability` (6), `number_allocator` (9), `numbering_integration` (3), `inventory_ledger_sync` (6); API `sync-events-and-sequence` (9), `number-leases` (5), `inventory-ledger` (7).
- Not run: crash/power-failure simulation, network-chaos harness, multi-device end-to-end through real UIs.

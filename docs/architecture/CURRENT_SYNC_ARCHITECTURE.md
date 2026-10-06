# JAMANVAAR — Current Sync Architecture (audit, 2026-09-25)

Scope of this audit: what the code does today, verified by reading it. Nothing was changed. Items marked **[not verified]** were not opened.

## 1. What exists

```
                      JAMANVAAR CLOUD  (cloud/api, NestJS + PostgreSQL, RLS via runAsTenant)
                        │  HTTPS only. No WebSocket / SSE / Socket.IO anywhere in cloud/api.
        ┌───────────────┼───────────────┐
   Restaurant A                    Restaurant B
        │
   Branch 1..n   (Device.branchId is NULLABLE)
        │
  POS · POS Admin · KDS · Captain · Kiosk · Kiosk Admin
  each = React/Vite app, in-memory JS arrays persisted to localStorage (packages/database)
        │
  SyncOutboxEngine (packages/sync/src/outbox.ts)  ── HTTPS push/pull ──►  /api/v1/orders/sync
  entity_sync.ts (CRM/inventory snapshots)        ── HTTPS push/pull ──►  /api/v1/entity-sync
  LanMeshSyncEngine (lan_mesh_sync.ts)            ── BroadcastChannel + localStorage (same browser only)
  heartbeat.ts / device_gate.ts                   ── HTTPS heartbeat, revocation/lock answers
  command_pipeline.ts + DeviceCommand table       ── cloud → device commands (Phase 13 gating added)
```

| Piece | Where | Behaviour today |
|---|---|---|
| Local store | `packages/database/src/db.ts`, `schema.ts` | **Not SQLite.** `schema.ts` says so itself: in-memory arrays, serialised to `localStorage.setItem`. No transactions, no atomic multi-write. |
| Outbox | `packages/sync/src/outbox.ts` | Events: `PENDING` / `FAILED` / `COMPLETED` (+`PROCESSING`), `retryCount` incremented. **No backoff, no jitter, no dead-letter state**, no per-event id distinct from the order id. |
| Order push | `order-sync.service.ts` | Upsert on `(restaurantId, externalOrderId)`; `syncVersion` bumps on every push. Last write wins, except a guard on settled payments (HIGH-05). No processed-event table. |
| Order pull | `order-sync.service.ts#catchUp` | Cursor is **`updatedAt` timestamp** (`gt sinceDate`), capped at 500 rows, default lookback 24 h. Branch-filtered (device with `branchId` null sees everything). |
| Generic entities | `entity-sync.service.ts`, `SyncedEntity` | Customers, staff, tables, shifts, menu as opaque JSON per `(restaurantId, entityType, externalId)`. Client-stamped `updatedAt`, tombstones sticky. Push sends full snapshots. Pull by `updatedAt`. |
| Kiosk orders | `Order` + `PaymentTransaction` tables | A **second, separate** order table from `SyncedOrder`, keyed by `kioskId`. |
| Same-branch realtime | `lan_mesh_sync.ts` | `BroadcastChannel`/`localStorage`: works only between tabs of one browser on one machine. Its own comment admits there is no real LAN transport. Real cross-device delivery is polling the cloud. |
| Heartbeat / health | `device_gate.ts`, `common/device-health.ts` | `lastSeenAt` thresholds (online/degraded/offline). Reasonable; no reported pending count / catalog version / cursor per device in a first-class field (only `pendingSyncCount`, `syncError`). |
| Device commands | `device-commands`, `command_pipeline.ts` | Real, authenticated, audited, ack'd. Command set differs from the requested list. |
| Observability | `SyncEventLog`, `SyncConflict`, sync-observability module | Per-push log rows and conflict rows exist; no trace/correlation id. |
| Numbering | `repositories.ts` | KOT number = `max(local kotNumber) + 1` (`KOT-01`…). Order number = random, checked for uniqueness **locally only**. Token number = local `nextTokenNumber`. |

Existing tests touching sync (root `tests/`): outbox persistence, online/offline, mesh suite, KOT routing, POS/kiosk integration, order sync fidelity/flagging, cross-device staff/table sync. None covers concurrency between two devices, duplicate delivery of one event, or crash mid-write.

## 2. Weaknesses (ranked by risk to "no lost / duplicate data")

1. **Numbering collisions across offline devices.** KOT `max+1` and locally-unique order/token numbers will collide when two terminals are offline together. Two different KOTs/orders can carry the same human number. (KOT identity: `KOTRecord` ids are UUIDs, so this is a display/uniqueness problem, not silent overwrite — **[not verified]** whether any code looks KOTs up by number.)
2. **No event-level idempotency.** Idempotency is "same order id upserts". A retried event re-applies state and bumps `syncVersion`; there is no record that event X was applied, so out-of-order or replayed stale events can overwrite newer state. Order *items* are one JSON blob per push: two devices adding items to one order overwrite each other (last write wins).
3. **Cursor is a wall-clock timestamp.** Two rows committed in the same millisecond, or a long-running transaction committing after a later one, can be skipped forever by `updatedAt > since`. A monotonic per-branch sequence is needed.
4. **Local store is not transactional.** localStorage-backed in-memory arrays cannot give "order + KOT + outbox row commit atomically" or survive a crash mid-write; size is capped (~5 MB) and every write rewrites blobs. This is the largest structural gap against the requirements and is a platform decision (see §4).
5. **Inventory has no multi-device story.** *(Correction, found while implementing the ledger: the first version of this audit said inventory syncs as last-write-wins snapshots. No code does that: only staff, tables, menu, customers and shifts travel through entity sync. Stock lives on the device that holds recipes, Restaurant Admin, which deducts from synced orders.)* The risk is therefore latent, not active: the moment stock is tracked on two devices or branches there is nothing to add their sales together.
6. **Payments guarded only for the settled-then-changed case.** No unique constraint or state machine preventing two devices both recording a payment for one order before either syncs (the guard only fires once a terminal status is already stored).
7. **No realtime, so KDS latency = poll interval.** No server push exists. KDS correctness is fine (pull catches up) but delivery is only as fresh as the poll; the "LAN mesh" gives nothing between devices.
8. **Two order tables** (`SyncedOrder`, kiosk `Order`), so kiosk orders do not enter the same server-side pipeline/reporting as POS/Captain orders by construction. **[not verified]** how much reporting merges them.
9. **Branch scoping is optional.** `Device.branchId` is nullable and a null-branch device sees the whole restaurant; `SyncedEntity` has no `branchId` at all (inventory, tables, cash drawer are restaurant-scoped rows).
10. **No dead-letter, no backoff, no jitter** → a poison event is retried at every tick forever, or sits `FAILED` with no operator surface beyond logs.
11. **No trace id** linking kiosk → order → KOT → KDS.
12. **Offline entitlement grace** exists in the license-certificate system (signed certificates, offline extension), but no documented, tested policy for subscription expiry mid-service **[not verified in detail]**.

Things that are already sound and should be kept: device bearer-credential auth (hashed token), per-tenant RLS plus explicit `restaurantId` filters, tombstone stickiness (B2-038), payment-terminal guard (HIGH-05), device revocation/lock delivered through heartbeat answers, throttling of sync endpoints, `DeviceCommand` audit trail.

## 3. Restaurant vs branch today

Restaurant → Branch → Device exists in the schema (`Device.restaurantId`, nullable `branchId`). Operational rows are restaurant-scoped with an optional `branchId` on `SyncedOrder` only. There is no branch-level sync sequence and no branch-scoped inventory/menu-override model.

## 4. Decisions that need the owner's call before implementation

The prompt asks for local SQLite, WebSocket fan-out, a branch edge node, per-branch inventory ledger and menu overrides. These are each multi-week pieces and several are not additive:

1. **Local database.** Replacing localStorage with a real transactional store (SQLite via Tauri/Capacitor, or IndexedDB with transactions in the browser apps) touches every repository in `packages/database` (5,000+ lines) and all six apps. It is the prerequisite for "atomic order + KOT + outbox". Options: (a) IndexedDB now (works in every current web app, real transactions), SQLite later inside Tauri; (b) go straight to SQLite in Tauri only. Recommendation: (a).
2. **Realtime transport.** Adding a NestJS WebSocket gateway is straightforward; correctness must not depend on it (pull with sequence cursor stays the source of recovery). Recommendation: build sequence cursor first, gateway second.
3. **Edge/hub.** Direct device→cloud is sufficient at small/medium scale; recommend deferring an edge node until real customers report LAN-only outages.
4. **Order model unification** (`Order` vs `SyncedOrder`) — a migration with reporting impact.

## 5. Proposed implementation order (each independently shippable, TDD, one shared protocol package)

1. **Protocol package** (`packages/sync`): event envelope (`eventId` ULID, `deviceId`, `restaurantId`, `branchId`, `entityType`, `op`, `traceId`), sync states, backoff+jitter helper, conflict-policy table. Pure, fully unit-tested.
2. **Server: processed-events + branch sequence.** `ProcessedEvent(restaurantId, eventId unique)`, `BranchSyncSequence`, monotonic `seq` on changed rows, `GET /sync/changes?after=seq` with acknowledgement. Fixes weaknesses 2 (server half) and 3.
3. **Order events with item-level merge** (add-item/remove-item/status events instead of whole-order blob) + payment single-commit constraint. Fixes 2 and 6.
4. **Collision-safe numbering** (branch-day scoped `AHD-20260925-001` display number with a device-prefixed fallback while offline; ULID identity). Fixes 1.
5. **Client outbox upgrade**: event ids, exponential backoff with jitter, `DEAD_LETTER`, resume by ack cursor, dead-letter admin screen. Fixes 10.
6. **Inventory movement ledger** (server `InventoryMovement`, client emits movements not balances). Fixes 5.
7. **Heartbeat fields + Kiosk Admin fleet view** (catalog/config version, pending, per-kiosk commands with the requested command types actually supported). 
8. **WebSocket fan-out with outbox worker**, authenticated, scoped by credentials. Fixes 7.
9. **Local store transactions** (decision in §4.1). Fixes 4.
10. **Branch scoping hardening, menu versioning/publish, order-model unification, reconciliation jobs, chaos harness.**

Steps 1–6 can be done without touching the six apps' UI and are where the "no duplicate / no lost" guarantees are actually earned on the server.

## 6. Not yet done (from the request)

Parts 79 (research with sources), the final `SYNC_ARCHITECTURE.md`, and `DATA_OWNERSHIP_MATRIX.md` are not written; they should follow the decisions in §4 rather than precede them.

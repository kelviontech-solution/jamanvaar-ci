# Data Ownership Matrix

Scope = the boundary that decides who may read/write an entity. Authority = who decides on conflict. Based on the schema and sync code as of 2026-09-25; rows marked (planned) are not implemented.

| Entity | Scope | Authority on conflict | Sync path today |
|---|---|---|---|
| Restaurant profile, identity | RESTAURANT | Cloud (Super Admin / owner edit) | identity pull/push |
| Branch | RESTAURANT | Cloud | via device binding |
| Subscription, plan, entitlements | RESTAURANT | Cloud only | heartbeat / signed license certificate |
| Device, activation key | BRANCH (Restaurant Admin device: restaurant-wide) | Cloud | activation, heartbeat |
| Device command / lock / revoke | DEVICE | Cloud | heartbeat answer |
| Staff user, PIN hash | RESTAURANT | Cloud copy edited from Restaurant Admin | entity sync `STAFF_USER` |
| Menu, categories | RESTAURANT (branch overrides: planned) | Server-authoritative, newest edit wins per record, tombstones sticky | collection sync |
| Order | BRANCH (owned by the branch of the device that first pushed it) | Idempotent by `eventId`; payment fields under the payment invariant | order sync (seq cursor) |
| Order items | BRANCH | Currently whole-order overwrite; event merge (planned) | order sync |
| KOT | BRANCH | Derived from the order on each device; KOT status state machine (planned) | derived from synced orders |
| Order / KOT number | BRANCH per business day | Server-leased blocks; device-prefixed fallback offline | number leases |
| Payment | BRANCH | Single commit: one paid transaction per order; refunds need authority | inside order sync |
| Inventory stock | BRANCH | Ledger: net of all movements, never overwritten | inventory ledger |
| Inventory item definition, recipe | RESTAURANT (held by Restaurant Admin) | Restaurant Admin device | not synced across devices (planned) |
| Dining table + live state | BRANCH | Branch conflict handling, newest per record with tombstones | entity sync `DINING_TABLE` |
| Cash drawer, shift | DEVICE within BRANCH | Owning device; shift summary syncs up | shift sync |
| Customer / CRM | RESTAURANT | Newest edit per record, tombstones sticky | entity sync |
| Printer, kitchen routing | DEVICE / BRANCH | Local device configuration | not synced |
| Kiosk config (welcome text, display) | DEVICE | Versioned; pushed as a command (planned fleet view) | device commands / display settings |
| Sync events, conflicts, dead letters | BRANCH | Append-only, operator resolves | `SyncEventLog`, `SyncConflict` |

Rules that follow from this table:
- A branch-bound device only ever receives BRANCH rows for its own branch; a restaurant-wide device (Restaurant Admin) sees every branch.
- Device-to-device cross-branch sync does not exist; everything goes through the cloud.
- Financial (payment) and stock changes are never resolved by timestamp.

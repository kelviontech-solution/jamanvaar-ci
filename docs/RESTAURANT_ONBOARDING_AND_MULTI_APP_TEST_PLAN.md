# Restaurant onboarding and multi-application test plan

Source requirement: [RESTAURANT_ONBOARDING_MULTI_APP_TEST_SPECIFICATION.md](RESTAURANT_ONBOARDING_MULTI_APP_TEST_SPECIFICATION.md) (the original 60-section brief; it was previously stored under this file's name). Findings and execution log: [RESTAURANT_ONBOARDING_MULTI_APP_TEST_REPORT.md](RESTAURANT_ONBOARDING_MULTI_APP_TEST_REPORT.md).

**Status: audit complete and every confirmed defect fixed (section 9). Sections 1-8 are the audit as found.** It records how the code actually works, the test matrix built from it, and which cells are verified. No production code was changed. The only code added is `cloud/api/test/audit-probes.e2e.spec.ts` (19 probes, described in section 6). Nothing here was packaged.

## 1. Status legend (used in every matrix)

| Mark | Meaning |
|---|---|
| **PASS-EXISTING** | An existing automated test asserts this and passed in today's full runs (cloud 98 files / 807 tests; root 161 files / 1124 tests). Matched by reading the test's assertions, not only its title. |
| **PASS-PROBE** | Verified by an audit probe run for this audit. |
| **DEFECT-CONFIRMED** | An audit probe asserting the required behaviour FAILED against the current code, for the stated reason (probe id given). |
| **DEFECT-BY-CODE** | Read in the code, believed wrong, **not yet executed**. Needs a probe before it is treated as fact. |
| **PARTIAL** | Some of the cell is tested; the missing part is named. |
| **GAP** | No test exists. Behaviour not known. |
| **DESIGN** | The architecture deliberately does not do this; the spec item does not apply or needs a decision. |

## 2. The architecture as it actually is (traced from code)

### 2.1 Tenancy and identity
* `Restaurant` → `Branch` → `Device` in PostgreSQL with row-level security on `restaurantId` (`runAsTenant` / `runAsPlatform`). `Device.id` is a server-generated UUID; `restaurantId`, `branchId`, `type` are separate columns (`schema.prisma` model `Device`). Device types: POS, POS_ADMIN, CAPTAIN, KDS, KIOSK, KIOSK_ADMIN. QR is not a device.
* A device gets its identity **only** by redeeming a single-use `ActivationKey` (`activation-keys.service.ts: redeem`). The key carries `allowedDeviceType`, optional `branchId`, `label` (becomes `Device.name`). The device receives one opaque bearer token (hash stored). There is **no client-side stable device identity** (no hardware id, no client-generated device id): a reinstall is a new key, a new `Device` row and a new seat.
* `Device.branchId` is `key.branchId ?? onlyActiveBranchId(restaurant)`; the latter returns `null` when the restaurant has more than one active branch. `Device.branchId` is `ON DELETE SET NULL`.

### 2.2 Entitlements
* One service, `ApplicationEntitlementsService`: `appsForPlan` = tier bundle (`DEFAULT_APPS_BY_FAMILY_TIER`: CORE POS+POS_ADMIN; PRO adds CAPTAIN+KDS; QR adds QR_ORDERING only by flag) **plus** every application whose bridged plan flag (`posTerminal`, `kotKdsRouting`, `captainApp`, `selfOrderKiosk`, `qrTableOrdering`, `restaurantAdmin`) is true. Rows are dense per subscription (`ApplicationEntitlement`, all 7 app codes).
* Enforcement points: key generation (`assertAppEnabled`), redeem (`assertAppEnabled` + `assertDeviceQuotaAvailable`), **every device request** (`DeviceAuthGuard`: device status, restaurant status, active subscription, application entitlement for `device.type`, branch active, MDM lock), QR resolution (`resolve`).
* Quota: per application `deviceQuota` → `Feature.defaultDeviceQuota` → plan `maxDevices`, counted per restaurant and device type (not per branch).
* A restaurant may hold one active subscription per product family (RESTAURANT + KIOSK).

### 2.3 Order pipeline (canonical order)
* `SyncedOrder` (unique `restaurantId + externalOrderId`), `source` derived from device type / meta (`orderSourceFor`), `branchId` = branch of the **first pushing device**, `seq` from `nextSyncSequence` (per-restaurant counter row; the row lock is held to commit, so sequence numbers are gapless and commit-ordered).
* Push (`OrderSyncService.pushEvents`): one transaction per request; advisory lock per order id (sorted); per-event SAVEPOINT; exactly-once claim of `eventId` in `ProcessedSyncEvent`; payment invariants (`paymentViolation`); **item-level merge** (`mergeOrderItems`: items owned by originating device, kitchen progress ranks forward only); meta merged key by key; then a **plain overwrite of header fields** (`status`, totals, `tableId`, `notes`, `orderType`) with the pushing device's values. Order, `SyncEventLog`, `ProcessedSyncEvent` and `seq` commit together.
* Pull (`catchUp`): `afterSeq` cursor (server-side gapless); legacy `since` timestamp cursor still served. Branch filter: `device.branchId ? (branchId = mine OR branchId IS NULL) : none`.
* Server-created orders (QR): `ingestServerOrder`, same table, same sequence, same locks, `source = QR`.
* Wake-ups: `RealtimeBus` (SSE per device, relayed across API instances through PostgreSQL LISTEN/NOTIFY). Every device also polls (KDS every 3 s, others 15 s); an event only means "pull now".

### 2.4 KOT / KDS
* **There is no KOT entity in the cloud.** A KOT is a local object on each device, derived from the order's items (`ensureKotsForOrder`, `kitchen_routing.ts`). Only QR orders get deterministic KOT ids/numbers (`kot-<orderId>-r<round>`); POS-created KOTs use the device's own numbering (number leases, disjoint per branch).
* Kitchen state crosses devices as **item `kitchenStatus`** inside the order (rank-forward merge). KOT status is recomputed locally (`KOTRepository.reconcileWithOrders`).
* Routing: each item carries `kitchenStation` (from the menu). A KDS chooses its **station name at the screen** (session `stationName`, default ALL) and filters locally. The server does not know which station a KDS serves; every KDS in a branch receives every branch order.

### 2.5 Sync paths and the topology
* Devices talk through `EndpointResolver`: Branch Core (LAN) first when discovered, cloud as fallback, each with its own cursor key. Branch Core (`packages/branch-core`) uplinks to the cloud (`uplink.ts`), receives the device roster (`/branch-roster`) to authenticate devices offline.
* Non-order data (`entity-sync`): menu, categories, modifier/tax groups, tables, staff, customers, combos, coupons, shifts, feedback, service messages. Restaurant-wide; **not branch-scoped**; last-change-wins by payload `updatedAt` with sticky tombstones.
* Inventory: cloud movement ledger (`InventoryMovement`, per branch, idempotent by `movementId`, `seq`); devices with recipe data (Restaurant Admin) deduct on pull via `reconcileOrder`.
* Numbers: `NumberSequence` leases (branch-scoped, disjoint blocks) for ORDER/KOT; QR uses its own `QR-n` counter.

### 2.6 Order data flow per source (implemented, not idealised)

| Source | Path |
|---|---|
| POS | UI → local DB (`OrderRepository.createOrder`, local KOTs) → `order.syncStatus = SAVED_LOCALLY` (the outbox is the flag on the order) → `processOutbox` → Branch Core or cloud `POST /orders/sync` → `SyncedOrder(source=POS)`, seq → other devices pull by cursor → each builds its own KOT / order copy |
| Kiosk | UI → local DB → same outbox → `source=KIOSK` (device type) → POS / KDS / Admin pull. Kiosk does not pull orders back (push only) |
| Captain | UI → local DB → same outbox → `source=CAPTAIN` → items merged per device with POS additions |
| QR | Guest browser → public API → priced from the published snapshot → `ingestServerOrder` → `SyncedOrder(source=QR, status NEW or PREPARING by autoAccept)`, seq → POS `QrOrderDesk` accepts (first-accept-wins, `acceptedBy`) → KDS/Captain/Admin pull; deterministic KOTs |
| KDS | pulls orders, builds KOTs, pushes item `kitchenStatus` / order status through the same endpoint (`source` from device type KDS is not a sales channel) |

## 3. Test infrastructure inventory

| Layer | What exists | What is missing |
|---|---|---|
| Cloud API e2e (`cloud/api/test`, Vitest + Supertest, real PostgreSQL with RLS, non-superuser) | 99 spec files. Activation, device limits, enforcement, fleet, commands, sync sequence/chaos/reconciliation, order merge, tenant isolation, roster, realtime, inventory ledger, number leases, multi-family, QR (4 specs + scale) | Whole-ecosystem specs (POS+Kiosk+Captain+QR+KDS at once); multi-branch KDS routing; device re-registration; quota race; branch policy; status state machine |
| Root suite (`tests`, Vitest, in-process simulation of local DBs and a fake cloud transport) | 161 files: outbox reliability, persistence, LAN mesh, Branch Core (chaos, discovery, operations), KDS/KOT routing, floor sync, inventory ledger sync, unified local core, per-role DBs | Multi-device simulation with real cloud (only fake transports); clock-skew; multi-KDS station |
| Browser E2E | Playwright MCP used ad hoc (guest page, Restaurant Admin screens). No committed Playwright suite | A committed multi-app browser regression; no KDS/Captain/Kiosk/POS browser run |
| Load | `cloud/api/scripts/qr-load.ts` (QR only) and in-suite acceptance tests | A device-order load harness (POS/Kiosk/Captain pushes), multi-restaurant/branch soak |
| Fixtures | Ad hoc per spec (restaurant/plan/branch/device creators repeated) | One shared fixture builder for the spec's `TEST_RESTAURANT_01` topology |

## 4. The test matrix

Section numbers follow the source specification. "Existing evidence" names the spec/test file; all listed files passed in today's runs.

### 4.1 Onboarding and entitlement (spec 3-8, 31, 32, 39, 40)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| ON-01 | Restaurant, branch, plan, subscription created; applications derived from the plan through the central service | PASS-EXISTING | `restaurants`, `plans-dynamic-entitlements`, `application-entitlements-db-catalog`, `saas-modules` |
| ON-02 | CASE 01-09 (POS only ... full): exactly the expected applications entitled; keys for any other type refused | **PASS-PROBE** | `audit-probes` P-OK-5 x9 (CORE tier + feature flags) |
| ON-03 | Onboarding wizard "enabledApps" path with the same combinations | GAP | Only the plan-flag path was probed |
| ON-04 | Kiosk only when its entitlement is on (RESTAURANT vs KIOSK family, two subscriptions) | PASS-EXISTING | `multi-family-subscriptions` |
| ON-05 | Admin view of applications across BOTH subscriptions (Restaurant + Kiosk) | **DEFECT-CONFIRMED** | P-FAIL-6: `listForRestaurant` reads only the newest subscription; a restaurant with both shows `[KIOSK, KIOSK_ADMIN]` and no POS |
| ON-06 | Same restaurantId for every device; no duplicate restaurants/branches | PASS-PROBE | P-OK-1 |
| ON-07 | Device ids unique server UUIDs, not restaurantId/type | PASS-PROBE | P-OK-1 |
| ON-08 | Per-application device quota; independent per app; revoke frees a seat | PASS-EXISTING | `device-limit`, `feature-disable-impact-and-quotas` |
| ON-09 | Quota under **concurrent** redemption of different keys | **DEFECT-CONFIRMED** | P-FAIL-2: quota 2, six concurrent redeems, **6 devices created** (`assertDeviceQuotaAvailable` counts then inserts with no lock) |
| ON-10 | Same code redeemed concurrently: one wins | PASS-EXISTING | `activation-redeem` (atomic `updateMany` claim) |
| ON-11 | Entitlement disabled while devices online: device refused at once (`APP_DISABLED`); existing orders remain | PASS-EXISTING | `device-enforcement`, `order-sync-and-suspension`, `qr-scale` (QR) |
| ON-12 | Entitlement changed while a device is offline: refreshed on reconnect, no stale privilege | PASS-EXISTING (by design) | Enforcement is per request (`DeviceAuthGuard`), so there is no cached privilege to go stale. Local-app behaviour on restore: PARTIAL (`license_entitlements`, `device_gate`) |
| ON-13 | Quota is per restaurant+type, not per branch | DESIGN | Needs a decision if a chain wants a per-branch cap |
| ON-14 | Device seat per `label` uniqueness (POS-01, POS-02) | GAP | `Device.name` is free text, not unique; two devices can share a name |

### 4.2 Device identity, registration, restart (spec 6, 29-31)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| DV-01 | Activation returns restaurantId, branchId, deviceId, type, token, restaurant identity | PASS-EXISTING | `activation-redeem`, `restaurant-identity-sync` |
| DV-02 | Entitlements/configuration delivered to a device after activation | PARTIAL | `tenant/me/entitlements` and identity sync exist; per-device configuration (e.g. KDS station) does not (see KD-02) |
| DV-03 | Re-registration / reinstall of the same physical device | GAP + **DESIGN DEFECT-BY-CODE** | No client device id: reinstall consumes a new key and a new seat while the old device stays ACTIVE until revoked. Policy decision required |
| DV-04 | Restart preserves local data, pending sync, identity, no duplicate registration | PASS-EXISTING | `outbox_reliability`, `sync_outbox_persistence`, `pos_crash_recovery`, `persistence_atomicity`, `db_persistence_batching` (fake storage, not a browser restart) |
| DV-05 | Device with no branch in a multi-branch restaurant | **DEFECT-CONFIRMED** | P-FAIL-3: redeem succeeds (201) with `branchId = null` |
| DV-06 | Device revoke / lock / branch deactivate | PASS-EXISTING | `device-enforcement`, `device-command-fleet` |
| DV-07 | Kiosk Admin sees its fleet with status, last seen, backlog, errors; commands only to own restaurant's kiosks | PASS-EXISTING | `device-command-fleet` |
| DV-08 | Fleet statuses are computed from real heartbeat times, not invented | PASS-EXISTING | `fleet-and-keys` (health counts), `heartbeat_health` |
| DV-09 | Offline command stays pending and is delivered on reconnect; redelivery limits | PASS-EXISTING | `device-command-fleet`, `device_command_runner` |

### 4.3 Order sources and the canonical pipeline (spec 9-19, 52)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| OR-01 | POS -> canonical order -> other device pull | PASS-EXISTING | `order-sync-and-suspension`, `order_sync_fidelity` |
| OR-02 | Kiosk -> POS | PARTIAL | `pos_kiosk_integration`, `kiosk_kot_routing` (simulated); no cloud two-device test with a KIOSK-type device |
| OR-03 | Captain -> POS/order pipeline (no Captain-only pipeline) | PASS-EXISTING | `sync-events-and-sequence` (two device types share one order), `captain_app_workflows` |
| OR-04 | QR -> POS and KDS with table context | PASS-EXISTING | `qr-ordering-saas`, `qr_order_propagation` |
| OR-05 | Simultaneous POS + KDS + second POS pushes: all land once, distinct seq | PASS-PROBE | P-OK-3 |
| OR-06 | 100 concurrent QR orders on one table | PASS-EXISTING | `qr-scale` |
| OR-07 | Multiple POS / Kiosk / Captain devices creating orders simultaneously, all sources at once | **GAP** | Only three device types x one order each (P-OK-3). No N-device, all-source run |
| OR-08 | Order id / KOT id collision across devices | PARTIAL | Number leases disjoint (`number-leases`); order ids are device-generated `ord-<ts>-<rand4>` (`repositories.ts`): 4 base-36 chars of randomness per millisecond, collision odds low but not proven; KOT ids for non-QR orders are `kot-<ts>-<rand3>` |
| OR-09 | Field-by-field consistency across POS, Admin, KDS, Captain, Kiosk, Cloud, Branch Core (restaurantId, branchId, source, deviceId, tableId, items, modifiers, pricing, tax, status, timestamps) | PARTIAL | Cloud-side and QR checked; `order_sync_fidelity` covers POS -> pulled device. No test compares the tuple end to end across five apps |
| OR-10 | Order `source` and `deviceId` recorded | PARTIAL | `source` derived from device type; **KDS/POS_ADMIN pushes on an existing order do not change `source` (correct)**, but `SyncedOrder.deviceId` is overwritten by the last pushing device, so the originating device is lost (DEFECT-BY-CODE: `data.deviceId = device.id` on every update) |

### 4.4 Status propagation and conflicts (spec 20-22, 47)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| ST-01 | Item kitchen progress never regresses | PASS-EXISTING + PASS-PROBE | `order-merge.unit`, P-OK-4 |
| ST-02 | ORDER-level status cannot regress (READY then stale PREPARING, fresh eventId) | **DEFECT-CONFIRMED** | P-FAIL-1: stored `PREPARING`. `data.status = evt.status` unconditionally; only replays of the **same** eventId are ignored |
| ST-03 | Concurrent KDS-01 PREPARING vs KDS-02 READY: authoritative transition rules | **DEFECT-CONFIRMED** (same cause) | No transition table; last request wins |
| ST-04 | Concurrent item modification (POS vs Captain vs Kiosk) | PASS-EXISTING | `sync-events-and-sequence` (two terminals adding keep each other's items, flagged for totals review) |
| ST-05 | Concurrent header changes (totals, table, notes) | DEFECT-BY-CODE | Header overwritten by the last pusher; only a `needsTotalsReview` flag when foreign items were kept. No `If-Match` / version precondition |
| ST-06 | Any device type may set any order status | DEFECT-BY-CODE | `paymentViolation` only protects payment. A KIOSK could mark an order COMPLETED. No role-to-transition rules |
| ST-07 | Out-of-order delivery (event 103 before 102) | PARTIAL | Cursor is server-sequenced and gapless (`sync-events-and-sequence`), but **client events are not sequenced**: an older event with a new eventId is applied as newer (ST-02) |
| ST-08 | Client applies remote order only if `remote.updatedAt >= local.updatedAt` | DEFECT-BY-CODE | `remote.updatedAt` is the SERVER clock, `local.updatedAt` the DEVICE clock (`outbox.ts catchUpFromCloud`). A device whose clock runs ahead ignores server updates (READY from KDS never shown). Not tested |
| ST-09 | Status propagates back to POS / Admin / Captain / QR customer | PARTIAL | QR customer status: PASS-EXISTING. POS/Captain: by cursor pull, tested in simulation only |

### 4.5 Sync, events, cursors, WebSocket (spec 45-50)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| SY-01 | Same event sent repeatedly -> one logical result | PASS-EXISTING | `sync-events-and-sequence`, `sync-chaos` |
| SY-02 | `eventId` unique per event | **DEFECT-BY-CODE / risk** | Client eventId = `<orderId>@<updatedAt>` (`outbox.ts toPushEvent`). Two distinct changes that share an `updatedAt` millisecond, or a change that does not bump `updatedAt`, produce the **same** eventId and the second is silently dropped as a duplicate. Needs a probe against the device code |
| SY-03 | Cursor 100 -> receive 101,102 -> disconnect -> 103 | PASS-EXISTING | `sync-events-and-sequence` (pull by sequence), `sync_protocol`, `outbox_reliability` |
| SY-04 | No dependence on `updatedAt` alone | PARTIAL | Orders: sequence. Entities (menu, tables, staff): `updatedAt` last-change-wins with sticky tombstones |
| SY-05 | WebSocket/SSE failure: order still arrives by pull | PASS-EXISTING | `realtime-stream`, `realtime_client`, KDS 3 s poll |
| SY-06 | Cross-instance wake-up | PASS-EXISTING | `qr-scale` (LISTEN/NOTIFY, relay reconnect) |
| SY-07 | Order + items + sync record cannot partially commit (cloud) | PASS-EXISTING (by design) | one transaction: order, `SyncEventLog`, `ProcessedSyncEvent`, `seq`; SAVEPOINT per event |
| SY-08 | Local order + outbox marker cannot separate (device) | PARTIAL | The outbox is the `syncStatus` flag on the order, so they are one record; `persistence_atomicity`, `sync_outbox_persistence` cover it. Crash between in-memory create and debounced persist (`db_persistence_batching`) is a documented window; not exercised against a real browser/SQLite kill |
| SY-09 | Failure injection: DB timeout / API timeout / duplicate request | PARTIAL | `sync-chaos`, `outbox_reliability`, `qr-scale` (transient retry) |

### 4.6 Branch and tenant isolation (spec 36, 41, 42)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| BR-01 | Restaurant A cannot read Restaurant B (RLS) | PASS-EXISTING | `tenant-isolation`, `rls-platform-reads`, `order-sync-and-suspension` |
| BR-02 | Branch A order reaches Branch A KDS only | PASS-PROBE + PASS-EXISTING | P-OK-2, `order-sync-and-suspension` |
| BR-03 | Branch-bound device cannot post inventory into another branch | PASS-EXISTING | `inventory-ledger` |
| BR-04 | **Branchless** device sees every branch's orders, and its orders are visible to every branch | **DEFECT-CONFIRMED** | P-FAIL-4 (`catchUp`: no filter when `branchId` is null; `OR branchId IS NULL` for branch devices) |
| BR-05 | Branch A cannot pull Branch B's **tables** | **DEFECT-CONFIRMED** | P-FAIL-5: entity sync has no branch filter |
| BR-06 | Menu / staff / customers / combos across branches | DESIGN (needs decision) | Restaurant-wide by design. The published QR menu honours branch lists and per-branch overrides; **POS, Kiosk and Captain do not** (they read the synced catalogue) |
| BR-07 | Shared kitchen across branches | DESIGN / GAP | No configuration exists; branch filter makes it impossible unless a device is branchless (which is the defect in BR-04) |
| BR-08 | Deleting a branch | DEFECT-BY-CODE | `Device.branchId ON DELETE SET NULL` turns its devices branchless (BR-04). Whether a branch can be hard-deleted was not checked |

### 4.7 KDS, stations, Captain, Kiosk specifics (spec 14-18, 33)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| KD-01 | POS/Kiosk/Captain/QR order -> KOT -> KDS with items, modifiers, quantity, table, source | PARTIAL | KOT derivation tested locally (`pos_kot_and_stations`, `kiosk_kot_routing`, `suite_architecture_and_kds`, `kot_status_from_orders`); QR deterministic KOTs tested; no cloud-connected multi-app run |
| KD-02 | Multiple KDS screens = stations: routing configured where? | **FINDING** | Station chosen on the KDS screen, matched by name against `item.kitchenStation`; the server has no KDS-to-station assignment, so a mistyped/renamed station silently shows nothing; two KDS on "ALL" both show everything |
| KD-03 | Two KDS bump different items of one order | PARTIAL | Item ranks merge forward (ST-01); KOT-level status per station recomputed locally |
| KD-04 | KDS in a branch with no POS online | PARTIAL | Pull path works with cloud; Branch Core fallback tested in root suite |
| KD-05 | Kiosk fleet management from Kiosk Admin | PASS-EXISTING | DV-07 |

### 4.8 Offline, Branch Core, topology (spec 25-28, 43)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| OF-01 | Offline POS, online Kiosk converge with no duplicate ids | PARTIAL | `offline_routing_integration`, `sync_online_offline`, `sync-chaos` |
| OF-02 | Two offline POS create orders, then sync | PASS-EXISTING (simulated) | `number_allocator`, `number-leases`, `cross_app_sync_cluster` |
| OF-03 | Offline kiosk | PARTIAL | Kiosk local persistence + outbox tested; public QR cannot operate offline (DESIGN, documented in `QR_ORDERING_OFFLINE_BEHAVIOR.md`) |
| OF-04 | Branch Core stopped: what each app can still do | PARTIAL | `branch_core_chaos`, `branch_core_operations`, `endpoint_resolver` (fallback to cloud). No per-app matrix |
| OF-05 | Which traffic uses cloud vs Branch Core/LAN; no incompatible paths | PARTIAL | `EndpointResolver` decides per request; entity sync and menu publish go to the cloud only; documented in `CURRENT_SYNC_ARCHITECTURE.md`; no automated topology assertion |

### 4.9 Menu, inventory, payment readiness (spec 23, 24, 37, 38)

| ID | Scenario | Status | Evidence / note |
|---|---|---|---|
| MN-01 | Menu edit -> publish -> QR sees only the published snapshot; orders validated against it (409 on price change) | PASS-EXISTING | `qr-menu-control`, `menu-versioning` |
| MN-02 | POS / Kiosk / Captain menu propagation after a change | PARTIAL | `menu_edit_delete_sync`, `menu_version_tracker`, `payments-menu-sync`; entity sync is restaurant-wide, last-change-wins |
| MN-03 | Old cached POS/Kiosk menu cannot submit invalid prices | **GAP / DEFECT-BY-CODE** | Only QR prices on the server; device orders (POS, Kiosk, Captain) are accepted with whatever prices the device computed (totals never recomputed) |
| MN-04 | Branch price overrides visible on POS / Kiosk / Captain | **GAP** | Overrides exist only in the QR snapshot |
| IN-01 | Concurrent sales by several devices add up (ledger) | PASS-EXISTING | `inventory-ledger`, `inventory_ledger_sync` |
| IN-02 | QR orders deduct inventory | **DEFECT-BY-CODE** | The cloud creates no movements for QR orders; deduction happens only on a pulling device that owns recipe data (`reconcileOrder`). If none is online the sale is never booked; if two Admin consoles pull, both may book (idempotency is per local order, not per ledger movement id: unverified) |
| PY-01 | Order model supports safe payment concurrency | PASS-EXISTING (readiness only) | `paymentViolation` (paid once, refund authority, no revert), `payments-*` specs. Not extended: out of scope |

### 4.10 Concurrency and load matrix (spec 51)

| ID | Combination | Status |
|---|---|---|
| CC-01 | 2 POS + 1 KDS | PARTIAL (P-OK-3, 3 events) |
| CC-02 | 2 POS + 2 Kiosk + 1 KDS | GAP |
| CC-03 | 3 POS + 3 Kiosk + 2 KDS + 5 Captain | GAP |
| CC-04 | 5 POS + 5 Kiosk + 2 KDS + 10 Captain | GAP |
| CC-05 | QR + POS + Kiosk + Captain simultaneously | GAP |
| CC-06 | Multiple branches simultaneously | GAP (branch isolation verified only for a sequential order, P-OK-2) |
| CC-07 | Multiple restaurants simultaneously | PARTIAL (`qr-scale`: two restaurants, QR only) |
| CC-08 | Measured throughput of device order pushes (per-restaurant sequence row is a serialization point) | GAP |

## 5. Confirmed and suspected defects (ordered by severity)

| # | Severity | Status | Finding | Where |
|---|---|---|---|---|
| D1 | **Critical** | CONFIRMED (P-FAIL-2) | Device quota is not enforced under concurrency: 6 of 6 concurrent activations succeeded against a quota of 2 | `activation-keys.service.ts redeem`, `application-entitlements.service.ts assertDeviceQuotaAvailable` |
| D2 | **High** | CONFIRMED (P-FAIL-3, P-FAIL-4) | A device can be activated with no branch in a multi-branch restaurant and then reads all branches' orders and writes orders every branch sees | `activation-keys.service.ts` (`onlyActiveBranchId`), `order-sync.service.ts catchUp` |
| D3 | **High** | CONFIRMED (P-FAIL-1) | Order status is last-request-wins with no transition rules; a stale or wrong device can move an order backwards | `order-sync.service.ts` (`status: evt.status`) |
| D4 | **High** | CONFIRMED (P-FAIL-5) | Tables (and every other entity type) are not branch-scoped; Branch B devices pull Branch A's floor | `entity-sync.service.ts` |
| D5 | **High** | BY CODE | Device-computed prices/totals are trusted; only QR prices are server-validated (MN-03). Any order source other than QR can submit any price | `order-sync.service.ts` |
| D6 | **High** | BY CODE | Client compares server `updatedAt` with device `updatedAt`: clock skew can hide server updates (ST-08) | `packages/sync/src/outbox.ts` |
| D7 | **High** | BY CODE | `eventId = orderId@updatedAt` can collide and silently drop a real change (SY-02) | `packages/sync/src/outbox.ts` |
| D8 | **Medium** | BY CODE | Any device type can set any order status (ST-06); header fields have no version precondition (ST-05) | `order-sync.service.ts` |
| D9 | **Medium** | CONFIRMED (P-FAIL-6) | Admin application list shows only the newest subscription's apps; source labels ignore flag-granted apps | `application-entitlements.service.ts listForRestaurant/withSource` |
| D10 | **Medium** | BY CODE | QR orders never deduct inventory unless a recipe-owning device pulls them; double deduction possible with two consoles (IN-02) | `outbox.ts`, `ingestServerOrder` |
| D11 | **Medium** | BY CODE | `SyncedOrder.deviceId` is overwritten on every update, losing the originating device (OR-10) | `order-sync.service.ts` |
| D12 | **Medium** | DESIGN GAP | No stable device identity: reinstall = new key + seat (DV-03) | `activation-keys.service.ts`, schema |
| D13 | **Medium** | FINDING | KDS station assignment is client-side only (KD-02) | `kds/src/App.tsx` |
| D14 | **Low** | BY CODE | `Device.name` not unique; order/KOT ids rely on timestamp + short random (OR-08, ON-14) | schema, `repositories.ts` |
| D15 | **Low** | NOTE | `DeviceAuthGuard` does four queries on every device request (per-request enforcement is correct; cost matters at scale) | `device-auth.guard.ts` |

## 6. Audit probes added (executed)

`cloud/api/test/audit-probes.e2e.spec.ts`, run against the real test database. `it.fails` = the required behaviour is NOT met (the probe passes while the defect exists and turns red when it is fixed); plain `it` = required behaviour met. Each `it.fails` probe was also run as a plain `it` once to confirm it fails for the stated reason (recorded in the report).

| Probe | Result |
|---|---|
| P-OK-1 device identity / branch binding | met |
| P-OK-2 branch A order reaches only branch A KDS | met |
| P-OK-3 three terminals at once, distinct seq | met |
| P-OK-4 item kitchen progress cannot regress | met |
| P-OK-5 x9 onboarding CASE 01-09 | met (all nine) |
| P-FAIL-1 order status regression | **defect** (`PREPARING` stored) |
| P-FAIL-2 quota under concurrency | **defect** (6 > 2) |
| P-FAIL-3 branchless activation | **defect** (201) |
| P-FAIL-4 branchless device sees other branches | **defect** |
| P-FAIL-5 table isolation by branch | **defect** |
| P-FAIL-6 admin apps across subscriptions | **defect** |

## 7. Missing tests to write (no fix needed to write them)

1. Whole-ecosystem cloud spec with a shared fixture (TEST_RESTAURANT_01: two branches, 2 POS, 2 Kiosk, KDS x2, Captain x3, QR, tables T01-T03, Pizza/Burger/Coffee): CC-01 to CC-08, all sources at once, field-consistency tuple (OR-09).
2. Device-code probes (root suite): eventId collision (SY-02), clock skew (ST-08), originating-device loss (OR-10), double inventory deduction with two consoles (IN-02).
3. Multi-KDS station routing and two-KDS bump (KD-02/03).
4. Device re-registration behaviour (DV-03) once a policy is chosen.
5. Branch Core stopped: a per-application capability matrix (OF-04).
6. Order-level status transition table and version precondition tests (ST-02/03/05/06) written first as failing tests.
7. Server-side price validation for device orders (MN-03) once a decision is taken.
8. A committed Playwright regression for guest, Restaurant Admin, KDS, Captain, Kiosk, POS.

## 8. Recommended execution order

1. **Fix D1** (quota race). Small, self-contained: serialise redemption per restaurant and app (advisory lock inside `redeem`), re-run P-FAIL-2 and `device-limit`.
2. **Decide and fix D2** (branch policy). Recommended: refuse key generation and redemption without a branch when the restaurant has more than one active branch; allow a restaurant-wide device only for POS_ADMIN/KIOSK_ADMIN; stop treating `branchId IS NULL` orders as visible to every branch. Re-run P-FAIL-3/4 and the branch specs.
3. **Fix D3 and D8** (order status). Add a transition table (who may move an order to which status; forward-only unless an explicit correction event), reject stale header writes with a version precondition, keep item merge. Tests first (ST-02/03/05/06).
4. **Fix D6 and D7** (client correctness). Server-time comparison for remote apply; per-event unique `eventId` (UUID) with the order id kept as a separate field. These affect every app; do after the server rules so the new tests cover both ends.
5. **Decide and fix D4** (entity branch scope), starting with `DINING_TABLE`; **decide D5** (server price validation for device orders) and **D10** (where inventory is booked for QR orders).
6. **Fix D9** (admin view across subscriptions).
7. Write the ecosystem, multi-KDS and Branch-Core-stopped tests (section 7) and run the load matrix (CC-01..08), producing measured numbers.
8. Address D11-D15 and the device re-registration policy (D12).

Decisions needed from you before steps 2, 5 and 8: branchless device policy; whether POS/Kiosk/Captain prices are validated server-side; whether branch price overrides apply to POS/Kiosk/Captain; whether a KDS is assigned a station by the server; device re-registration policy (re-bind an existing device vs new seat).


## 9. Fix phase: decisions taken and results (current state)

Sections 1-8 record the audit as found. This section is the current state after the fixes.

### 9.1 Decisions (taken on the product owner's behalf, chosen to fit the SaaS flow)

| Question | Decision | Why |
|---|---|---|
| Branchless devices | Refused when the restaurant has more than one active branch, at key generation and at redemption. Only the two admin consoles (POS_ADMIN, KIOSK_ADMIN) may be restaurant-wide, and they see all branches. | A terminal that does not know its branch would see every branch; a chain owner's console legitimately does. |
| Server-side price checks for POS/Kiosk/Captain | Checked and **flagged, never rejected**: line total, subtotal, and price below the published menu price become `meta.reviewFlags` plus a recorded conflict for the operator. | Terminals work offline on an older menu; rejecting would lose real sales. Flagging makes discrepancies visible without breaking offline-first. |
| Branch price overrides on POS/Kiosk/Captain | Stay a QR-menu feature. The device price check treats the restaurant-wide menu price as the floor. | Applying overrides on devices needs a device-side menu change across four apps; it is a separate feature, not a defect. Recorded as a known limit. |
| KDS station assignment | Unchanged: chosen on the KDS screen, matched by station name; every KDS of a branch receives all branch orders. Two kitchens advancing their own items merge correctly (tested). | Server assignment is a new configuration product; the current model works and is now tested. |
| Re-registration | A key may name the device it **replaces** (`replacesDeviceId`). Redeeming revokes the old record in the same transaction and reuses its seat; name and branch are inherited. | A reinstall must not cost a seat or leave two live records. |
| Terminal names | Unique per branch among live terminals and pending keys. | Fleet screens need distinguishable terminals. |

### 9.2 What was fixed (defect -> change -> proof)

| Defect | Change | Proof |
|---|---|---|
| D1 quota race | `pg_advisory_xact_lock` per restaurant and app inside the quota check | `audit-probes` P-FIXED-2 (6 concurrent activations, quota 2, at most 2 succeed) |
| D2 branchless | Branch required for non-console terminals when there is more than one branch; consoles may be restaurant-wide | P-FIXED-3, P-FIXED-4, `order-sync-and-suspension` (rewritten to the new rule) |
| D3, D8 order state | `order-rules.ts`: forward-only status, terminal states stick, a kiosk cannot run the kitchen or counter, explicit `statusCorrection` for POS/POS Admin; refusals recorded as `SyncConflict`, the push still merges and is acknowledged; `baseSyncVersion` precondition keeps newer totals/table and flags review | `order-rules.unit` (7), `onboarding-hardening` (order state, version), P-FIXED-1 |
| D4 tables | Tables stamped with the pushing terminal's branch; pull filters by branch; unbranded tables are shared | `onboarding-hardening` (floor plan), P-FIXED-5 |
| D5 device prices | Integrity and price flags (see decision) | `onboarding-hardening` (price review), `order-rules.unit` |
| D6 clock skew | The client applies a cloud order by the cloud sequence, not by comparing clocks; unsent local changes are pushed first | `multi_app_client_hardening` (fails against the old `outbox.ts`, passes now) |
| D7 event ids | `orderId@updatedAt#fingerprint`: distinct changes get distinct ids, retries keep theirs | same file (fails against old code) |
| D9 admin app list | Merged across all active subscriptions; source label uses the plan-flag-aware set | P-FIXED-6 |
| D10 inventory | Stock movements for an order use a deterministic id (`sale:<order>:<line>:<ingredient>:<from>><to>`); a movement already held locally or received from the ledger is not booked again | `multi_app_client_hardening` (two consoles) |
| D11 origin device | Server-owned `meta.originDeviceId` set at creation, never changed by clients | `onboarding-hardening` |
| D12 re-registration | `replacesDeviceId` | `onboarding-hardening` (seat reuse, old credential dead, wrong type and other restaurant refused) |
| D14 ids and names | Order/KOT id randomness widened; terminal names unique per branch | `onboarding-hardening`, root suite |

### 9.3 New end-to-end evidence

`cloud/api/test/ecosystem.e2e.spec.ts`: two restaurants, two branches each; per branch of restaurant A 5 POS + 5 Kiosk + 2 KDS + 10 Captain + QR (restaurant B smaller), all creating orders in the same instant (160 orders from 54 terminals plus QR guests, 784 ms on the development machine). Asserted on stored rows: nothing lost or duplicated, sequence numbers distinct and gapless, every order carries the right restaurant, branch and source, totals preserved exactly, QR order numbers unique per branch, every KDS receives exactly its branch's orders and none from the other branch or restaurant. This closes matrix rows OR-07 and CC-02 to CC-07 for the cloud path.

### 9.4 Matrix rows still open

| Row | State |
|---|---|
| DV-04 restart in a real browser or native shell | Not executed (tested with in-process persistence only) |
| OF-04 per-application Branch Core outage matrix | Covered by `branch_core_*` and `endpoint_resolver` tests; no per-app table was written |
| MN-04 branch overrides on devices | Known limit (decision above) |
| D13 KDS server-assigned stations | Decision: unchanged |
| D15 four queries per device request | Unchanged; correct, measure before optimising |
| Sustained device order load | Not run beyond the ecosystem test |


## 10. Second fix phase: the previously open rows

| Row | Result | Evidence |
|---|---|---|
| MN-04 branch prices on POS / Kiosk / Captain | **Done.** A branch's override is applied on the way out when a branch terminal pulls the menu: the dish arrives with the branch's price / availability, the restaurant-wide record is never changed, and changing an override touches the dish so terminals re-pull it. A branch terminal pushing the dish back cannot turn the branch price into the base price. No device code change was needed. | `branch-devices-config.e2e` (3 tests) |
| D13 KDS station assigned by the server | **Done.** `Device.kitchenStation`; Restaurant Admin assigns or clears it (`PUT /api/v1/devices/me/fleet/:id/station`, console only, KDS of its own restaurant only); the heartbeat answer carries it; the KDS app follows it (and a later change) and it survives a restart. | `branch-devices-config.e2e` (2 tests), `branch_core_outage_matrix` (heartbeat storage), KDS typecheck |
| D15 four queries per device request | **Done.** A passing device verdict is cached for 2 s (`DEVICE_AUTH_CACHE_MS`, 0 = off); any revoke, lock, plan, subscription, application, branch, restaurant or key change flushes it on every instance at once; heartbeats do not flush it; failures are never cached. | `branch-devices-config.e2e` (lock, unlock, application off/on and revoke each take effect on the very next request) |
| OF-04 per-application Branch Core outage matrix | **Done and it found a real bug.** 5 applications x 4 situations (all up, core down, internet down, both down) asserted request by request. The bug: `/api/v1/menu/*` and `/devices/me/sync-issues` were classed as "operational" (sent to the Branch Core first) although the core does not serve them, so with a core configured they got a 404 that is a real answer and never fell back. They now go to the cloud. | `branch_core_outage_matrix` (22 tests) |
| DV-04 restart in a real browser | **Done for identity and session.** Restaurant Admin was signed in and activated in a real browser, then the page was restarted three times: same device id, same credential, no login or activation screen, and the server still shows exactly three devices and three redeemed keys (no duplicate registration). Not proven in a browser: a pending offline queue surviving a restart (covered by `sync_outbox_persistence` in-process), and a cold start with no network (the dev server is unreachable; this is a packaged-app property, not testable against a dev server). | Playwright against the real API and Vite server; database read before and after |
| Sustained load | **Done, and it found a real limit.** 45 s, 10 POS + 10 Kiosk + 10 Captain + 2 KDS pulling: 3,746 orders and 3,740 kitchen updates (7,486 requests, 164 requests/s), **0 errors**, p50 45 ms, p95 251 ms, p99 532 ms, max 2.4 s; every order stored exactly once, cursor never went backwards, each KDS received every order. The first attempt failed 10,677 of 12,177 requests: the per-address ceiling for terminal sync (1,500/minute) is exhausted in seconds by one busy branch because a whole branch shares one address. The ceiling is now 12,000/minute and configurable (`DEVICE_SYNC_RPM`). | `sustained-load.e2e` (run with `SUSTAINED_LOAD=45`) |

Still not proven: a device restart with unsent offline orders in a real browser; behaviour behind carrier-grade NAT (many restaurants on one address) at the new ceiling; more than about 165 requests/second (the per-restaurant sequence row serialises order writes, visible as the 2 s maximum under this synthetic load).

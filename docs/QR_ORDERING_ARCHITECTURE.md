# QR Ordering: Architecture

QR ordering is one more **channel** into JAMANVAAR's single order pipeline. It is not a separate mini application: it owns QR codes, QR settings and QR analytics events, and nothing else. Orders, menu, sync, entitlements and kitchen tickets are the platform's own.

```
 SUPER ADMIN
     │  builds plans (feature lists), assigns a plan, may override one feature for one restaurant
     ▼
   PLAN ── features ──▶ SUBSCRIPTION ──▶ ApplicationEntitlement (QR_ORDERING, limits, override)
                                              │
                                              ▼   ApplicationEntitlementsService.resolve()   ← the ONE answer
                                         RESTAURANT ── BRANCH ── TABLE (synced DINING_TABLE)
                                                                   │
                                                          QrCode (server-minted token, status, version)
                                                                   │  printed on the table
                                                                   ▼
                                                              CUSTOMER  (phone, no login)
                                                                   │  GET/POST /api/v1/public/qr/:token…
                                                                   ▼
                              ┌──────────── QR public API (cloud) ─────────────┐
                              │ resolve token → restaurant, branch, table      │
                              │ entitlement + status checks, every request     │
                              │ canonical menu (restaurant's own), server price│
                              └───────────────┬────────────────────────────────┘
                                              ▼
                     OrderSyncService.ingestServerOrder()   (same path devices use)
                     SyncedOrder  source=QR, seq, branch, syncVersion, realtime wake-up
                                              │
                    cloud downlink ─▶ BRANCH CORE (LAN) ─▶ POS / Kiosk / Captain / KDS  (cursor pull, exactly once)
                                              │
                                              ▼
              POS "New QR orders" inbox: ONE terminal accepts (first claim wins) and prints
              every device derives the SAME kitchen tickets (deterministic id + number)
                                              │
                                              ▼
                                   KDS: PREPARING → READY ──▶ order status ──▶ customer's page
```

## What owns what

| Owner | Data |
|---|---|
| **Cloud** | restaurants, branches, plans, subscriptions, entitlements and overrides, `QrCode`, `QrSettings`, `QrEvent`, published menu / modifier / tax entities, canonical orders (`SyncedOrder`), reporting |
| **Branch Core** (LAN, one per branch) | local operational replica of the branch's orders, kitchen state, sync queue, device roster |
| **Device** (POS, KDS, …) | local cache, pending events, UI state, its own SQLite database |
| **Customer's browser** | the temporary cart, an anonymous session id, the reference of the order just placed |

Nothing authoritative lives only in the customer's browser: the cart is a convenience, every price and every decision is the server's.

## Components

| Component | Where |
|---|---|
| Entitlement service | `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts` (`resolve`, `appsForPlan`) |
| QR module (public API, admin API, menu, settings, rate limiter) | `cloud/api/src/modules/qr/` |
| Shared order ingest | `cloud/api/src/modules/order-sync/order-sync.service.ts` (`ingestServerOrder`) |
| Super Admin projection of the entitlement | `cloud/api/src/modules/qr-ordering/` |
| Customer ordering web app | `apps/qr-guest/` (its own bundle; uses only the public API) |
| Restaurant Admin QR console | `apps/restaurant-system/pos-admin/src/components/qrconsole/` |
| POS QR inbox and kitchen-ticket rules | `apps/restaurant-system/pos/src/components/orders/QrOrdersInbox.tsx`, `packages/sync/src/qr_order_desk.ts`, `packages/sync/src/outbox.ts` (`qrKotIdentity`) |
| Branch Core (claim rule, cursor delivery) | `packages/branch-core/src/core.ts` |

## Design decisions (and what they replaced)

1. **One order domain.** QR orders are `SyncedOrder` rows with a first-class `source` column. The QR service calls the same ingest the devices use, so a QR order gets a sequence number, a per-order lock, an event log entry and a realtime wake-up automatically. *(Before: the guest service wrote the row directly without a sequence number, so a device reading by cursor never received it.)*
2. **One entitlement service.** `resolve(restaurantId, appCode)` reads the subscription's `ApplicationEntitlement` row (plan features, plus any per-restaurant override on the same row) and returns `{enabled, reason, source, limits, validUntil}`. The tier fallback, the plan-JSON reads and the `PlatformSetting` override store were removed.
3. **`QrCode`, evolved from `QrTableLink`** (not a second table). Server-minted 192-bit tokens, status ACTIVE / DISABLED / REVOKED, version, mode TABLE_ORDER / MENU_ONLY, one active code per table (unique partial index), branch required.
4. **The customer's menu is the restaurant's own.** Categories, dishes, modifier groups and tax groups come from that restaurant's synced entities. Availability is data: an explicit `salesChannels` list, the per-dish QR switch, optional `branchIds`. *(Before: a platform-wide static modifier list and a fixed 5% tax.)*
5. **Kitchen tickets are derived, not counted.** For a QR order the ticket id is `kot-<orderId>-r<round>[-station]` and the number `KOT-<order number>[-n][-R<round>]`. Every device builds identical tickets, so several POS terminals never create duplicates or collide, and there is no `max + 1`.
6. **Accepting is a claim.** The first device to record `acceptedBy` owns the order (cloud and Branch Core both keep the first claim). The owner prints; a terminal that lost prints nothing.
7. **Analytics are facts.** Scans, menu views and order events are recorded by the server; sales come from real orders. Client-reported usage was removed.
8. **Platform independence.** No QR business rule touches a browser-specific, Tauri or Android API. The customer app is a plain web app; Restaurant Admin and POS call HTTP.

## Numbering and idempotency

* Guest order numbers `QR-n` come from `NumberSequence` (kind `QR`, per branch per business day), incremented atomically in the order's own transaction.
* An order's identity is `qr_<sha256(restaurant : code : idempotencyKey)>`. A repeat of the same key returns the original order (per-order advisory lock plus the unique index), whether it is a double tap, a retry after a timeout, a refresh or a concurrent duplicate.

## Failure behaviour

| Situation | Result |
|---|---|
| Restaurant's internet down | The public cloud QR page is unavailable (see offline document); the restaurant keeps working locally |
| Branch Core down | Orders wait in the cloud; devices fall back to the cloud or catch up by cursor when the core returns |
| Realtime wake-up missed | The device's next cursor pull recovers the order |
| Plan downgraded / QR revoked / table switched off | New orders are refused immediately (checked on every request); history stays |

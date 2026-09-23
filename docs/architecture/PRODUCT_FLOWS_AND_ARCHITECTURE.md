# JAMANVAAR — Flow Catalog, Database Architecture & Implementation Roadmap

**Purpose:** This document does two things. First, it answers a specific question — *is the database architecture genuinely SaaS (multi-tenant, cloud-backed), or not?* — with evidence from the actual schema files, not inference. Second, it catalogs every real flow across the 7 applications (Super Admin, Restaurant Admin/POS Admin, POS, Captain, KDS, Kiosk Admin, Kiosk), states its current condition as verified by hands-on testing (see `FULL_ECOSYSTEM_QA_AUDIT_REPORT.md`), and specifies the target flow it should become, organized by business domain rather than by app — because almost every defect found in this product is a *cross-app* flow problem, not a single-screen bug.

**How to read this:** Each flow entry has a status tag:
- 🟢 **WORKS** — real, correctly wired, cross-app where relevant.
- 🟡 **PARTIAL** — real within one app, doesn't propagate or has a specific gap.
- 🔴 **BROKEN** — exists in the UI but doesn't do what it claims.
- ⚪ **MISSING** — no implementation exists at all; needs building.

Bug IDs (BUG-001 … BUG-022) refer to the numbered findings in `FULL_ECOSYSTEM_QA_AUDIT_REPORT.md`.

---

## Part 1 — Database Architecture: Is This SaaS?

**Verdict: the control plane is real SaaS architecture. The operational plane is not SaaS at all — it's per-device local storage with a sync layer that was never connected to anything.** This single fact is the root cause of the large majority of cross-app bugs found in this audit. Everything else in this document follows from it.

### 1.1 The cloud schema (`cloud/api/prisma/schema.prisma`) — genuinely well-built multi-tenant SaaS

- **Real tenant isolation**: every tenant-owned table carries `restaurantId`, is indexed on it, and — per the schema's own header comment — is protected by actual Postgres Row-Level Security with `FORCE ROW LEVEL SECURITY` (the detail that matters: Postgres exempts table-owner roles from RLS by default, and the app's DB role owns these tables, so `FORCE` is what makes the policies real rather than decorative — whoever wrote this understood the failure mode).
- **Real platform/tenant identity separation**: `PlatformUser` (Super Admin staff) and `User` (restaurant staff) are structurally distinct tables with no code path that can confuse one for the other.
- **Real entitlement model**: `Plan → Subscription → ApplicationEntitlement` — one row per `(subscription, appCode)`, which is the actual gating mechanism for POS/Captain/KDS/Kiosk/Kiosk Admin/POS Admin access, more granular than the legacy flat-boolean `Plan.entitlements` JSON it supersedes.
- **Real billing**: `Invoice`/`Payment` for platform→tenant SaaS billing, kept deliberately distinct from `Order`/`PaymentTransaction`/`Refund` (customer-facing Cashfree payments), which have real idempotency keys, webhook signature verification, and dedup (`WebhookEvent.providerEventKey`).
- **Real device fleet/MDM**: `Device`, `DeviceCommand` (lock/unlock/force-logout/wipe/etc. with a status lifecycle), `ActivationKey`.
- **Sync observability tables exist**: `SyncEventLog`, `SyncConflict` — built to receive real sync telemetry. (They're empty in practice — see 1.3.)

### 1.2 What's missing from the cloud schema — and why the audit found what it found

The cloud schema has **no model for the restaurant's actual operating data**: no Menu/Category/MenuItem (beyond a platform-curated `MasterMenuCatalog` used for syndication, which is a different feature), no Table/FloorPlan, no Staff PIN roster, no general Order/KOT model (the one `Order` model is explicitly scoped to Kiosk online-payment checkout only, per its own code comment: *"kiosks are offline-first and never had a cloud order model before this"*), no CRM Customer, no Inventory/Ingredient.

This is not an oversight — it's because that data was designed to live somewhere else: a shared local schema.

### 1.3 The local schema (`packages/database/src/schema.ts` + `db.ts`) — the real operational model, disconnected from the cloud

- `packages/database/src/schema.ts` defines a complete second schema (`SQLITE_SCHEMA_DDL`): `restaurants`, `outlets`, `categories`, `modifier_groups`/`modifier_options`, `tax_groups`, `menu_items` (with `is_available`/`sold_out_reason` columns — the out-of-stock flag genuinely exists in the schema, confirming BUG-021 is a wiring gap, not a missing feature), `combos`, `tables`, `coupons`, `offers`, `orders`/`order_items` (with per-item `kitchen_status`), `payment_transactions`, `receipts`, `service_requests`, `device_health`, `sync_events` (an outbox table), `audit_logs`.
- **This DDL is decorative.** Nothing in `db.ts` executes it against a real SQLite engine — there is no `better-sqlite3`, no `sql.js`, no Prisma SQLite provider anywhere in the package. The actual runtime is `packages/database/src/db.ts`: a singleton class holding plain in-memory JavaScript arrays, persisted via `localStorage.setItem()` per collection. Every UI label across the product claiming **"Local SQLite Ledger," "100% Offline DB," "Local Engine Active"** is describing something that isn't true — it's `localStorage`, not SQLite.
- **All six client apps import the same singleton** (`pos_db.ts`, `captain_db.ts`, `kds_db.ts`, `pos_admin_db.ts`, `kiosk_admin_db.ts`, `kiosk_user_db.ts` are each a one-line re-export of `db`). This works only within one process/tab — across the real separate app instances tested in this audit, each gets its own independent `localStorage`-backed copy, which is *why* POS, Captain, and KDS routinely disagree about the same order.
- **The outbox is a stub.** `packages/sync/src/outbox.ts`, `SyncOutboxEngine.processOutbox()`, flips every pending event from `PENDING → PROCESSING → COMPLETED` (and every order from `SAVED_LOCALLY → SYNCING → SYNCED`) with the literal source comment `// Simulate cloud acknowledgment`. **It makes no network call of any kind.** This is the single root cause behind BUG-009 (KDS never receives real orders), the empty `SyncEventLog`/`SyncConflict` tables Super Admin's Sync & Conflict Monitor correctly and honestly shows as empty, the platform-wide zero backups in Backups & Recovery, and the Payments & Split / CRM / Inventory disconnects (BUG-012, 015, 016, 018).
- **Cross-device sync, where it exists at all, is LAN-local, not cloud.** `db.ts` has `pushToServer()`/`initServerSync()`/`forceSyncNow()`, plus `packages/sync/src/lan_mesh_sync.ts` (`BroadcastChannel` + a same-hostname sync server on port 5178). None of this calls anything in `cloud/api`. It's built for same-network device-to-device sync (plausible for KDS/POS talking to each other on one restaurant's LAN), not for reaching the multi-tenant Postgres database that Super Admin actually reads from.
- **`Backup & Restore`'s own UI copy admits this**: *"Connect to JAMANVAAR Cloud in Settings → Subscription Plan to enable real off-device backup"* — cloud backup is openly aspirational in the product's own text, not just something the audit inferred.
- CRM (`CustomerAccount`, with loyalty tiers) and Inventory (`InventoryItem`/`Recipe`) models **do exist** in the local schema — so the fake-looking data found in Restaurant Admin's CRM/Inventory pages during the audit is most likely seeded into this same local store at provisioning time, not hand-coded into the frontend. Either way, it never updates from real transactions and never reaches the cloud.

### 1.4 The one-sentence summary for engineering leadership

> You built a real multi-tenant SaaS control plane and a real (if mislabeled and disconnected) local operational data model — but the bridge between them was stubbed out during development and never finished. Nearly every cross-app bug in the QA audit is downstream of that one missing bridge, not of dozens of unrelated defects.

---

## Part 2 — Flow Catalog (organized by business domain)

### 2.1 Identity, Access & Device Activation

| Flow | Status | Detail |
| :-- | :-- | :-- |
| Platform (Super Admin) login | 🟢 WORKS | Real, `PlatformUser` table, RBAC roles enforced. |
| Restaurant owner real login (email/password → Restaurant ID → device key) | 🟢 WORKS | Well-designed, multi-step, correctly requires context. |
| **Restaurant Admin auth bypass** (`admin`/`admin123` etc.) | 🔴 BROKEN — **P0** | Ships in production builds, zero backend calls, full owner access. BUG-007. |
| Device activation (Restaurant ID + owner creds + one-time key → device-bound token) | 🟢 WORKS | Correctly implemented for POS/Captain/Kiosk/Kiosk Admin/POS Admin. |
| **KDS device activation** | ⚪ MISSING | No activation/binding gate exists at all — the only one of the six client apps with none. |
| Staff PIN login (POS/Captain/KDS) | 🟢 WORKS | Real roster, correctly shared across apps that read it. |
| Edit Staff role change | 🟡 PARTIAL | Role dropdown defaults to Owner regardless of current role — a privilege-escalation trap (BUG-010). |
| Subscription Plans "Cloud" login | 🟡 PARTIAL | A second, separate login layered on top of an already-authenticated Restaurant Admin session — confusing, not broken. |

### 2.2 Menu & Catalog

| Flow | Status | Detail |
| :-- | :-- | :-- |
| Menu created at onboarding → visible in POS/Captain/Kiosk/Kiosk Admin | 🟢 WORKS | Correctly shared as a starter template. |
| **New menu item added post-onboarding → propagates to other apps** | 🔴 BROKEN | Restaurant Admin's own write never reaches POS/Captain/Kiosk Admin's menu view (BUG-011). |
| **Item marked "Sold Out" in Kiosk Admin → removed from real Kiosk ordering** | 🔴 BROKEN — new (Round 5) | The `is_available` flag exists in the schema; the real Kiosk simply doesn't query it. Customer can order and pay for an item the kitchen has flagged unavailable (BUG-021). |
| Master Menu Catalog → restaurant syndication | 🟢 WORKS | Real, platform-curated dish library, correctly separate feature from the restaurant's own menu. |
| Combos & Meal Deals | 🟢 WORKS | Real, correctly composed from real menu items. |
| Offers & Coupons | 🟢 WORKS | Real CRUD; usage-count authenticity not independently verified. |
| Kiosk Admin "Preview Kiosk" | 🟢 WORKS | Accurately mirrors the live menu. |

### 2.3 Order Lifecycle — the central broken flow

This is the highest-priority domain. Five apps each maintain an independent view of "what orders exist," and the layer that's supposed to unify them (Part 1.3) is a stub.

| Flow | Status | Detail |
| :-- | :-- | :-- |
| POS: build cart, add modifiers, discount | 🟢 WORKS | Every calculation (tax, round-off, discount) verified correct. |
| POS: **Hold Order** | 🔴 BROKEN — sharpened (Round 5) | Order is genuinely retained (a "Held Carts (N)" sidebar badge proves it) but the only UI entry point to reopen it does nothing when clicked. Data layer works; the click handler doesn't exist or is unwired (BUG-017). |
| POS: **SEND KOT** → kitchen ticket created | 🔴 BROKEN — **P0** | Verified with a freshly-sent order: never reaches the standalone KDS app. Root cause: KDS appears to receive tickets over a live connection with no persistence and no catch-up-on-reconnect, so an order only arrives if a KDS session happens to be open at the exact send moment (BUG-009). |
| POS: **SEND KOT double-click** | 🔴 BROKEN — new (Round 5) | Not debounced — one accidental double-tap creates two duplicate kitchen tickets and double-counts both the order count and today's revenue (BUG-022). |
| Captain: open table, add items, fire KOT | 🟢 WORKS (within Captain) | Real, correct running totals, correct local status tracking. |
| Captain KOT → KDS | 🔴 BROKEN | Same root cause as POS→KDS. |
| Captain → POS: bill-request notification | 🔴 BROKEN | Silently produces zero notification in POS (BUG-013). |
| Captain: cancel/void an item already sent to kitchen | ⚪ MISSING | No control exists in Captain at all — reasonable as a deliberate anti-fraud boundary, but no "request void from manager" alternative exists either. |
| Captain: settle/close a table | ⚪ MISSING (by design) | Only "Add More Dishes" and "Send Bill Request" exist at the final table stage; settlement is POS-only, with no visible confirmation loop back to Captain when POS does close it. |
| Captain: Diner Requests (guest service) | 🟢 WORKS (within Captain) | Real, full lifecycle (log → accept → mark done) tested and correct. |
| Captain: Messages (Floor & Kitchen Communications) | 🟡 PARTIAL | Real within Captain (sent, tracked, resolvable) — but a message addressed to "Kitchen" never reaches the actual KDS app. |
| Kiosk: customer order → KDS ("Order Sent to Kitchen ✓") | 🔴 BROKEN — worst instance | Same root cause as above, but the Kiosk actively displays a false success confirmation to the paying customer. |
| Kiosk: rapid double-click add-to-cart | 🟢 WORKS | Correctly resolves to quantity increment, not a duplicate line. |
| Kiosk: online-payment-unavailable fallback | 🟢 WORKS | Graceful, clear fallback to Cash at Counter — a genuinely well-handled failure path. |
| Kiosk: refresh mid-checkout | 🟢 WORKS (safe) | Resets cleanly to Welcome screen; no stuck/orphaned order left behind. |
| **KDS: own status ladder** (Cooking → Ready → Served) and station filters | 🟢 WORKS | Fully functional once a ticket exists — the defect is entirely upstream, not in KDS's own UI. |
| KDS → Captain: "food ready" notification | 🔴 BROKEN | Same root cause; never reaches Captain. |
| Restaurant Admin's own Kitchen/KOT view: status change ("Mark Ready") | 🟡 PARTIAL | Works within Restaurant Admin (proves the backend genuinely supports live KOT status changes) but does not propagate to POS's own Kitchen Orders view, which claims the same "live sync" (BUG-019) — two internal views of the same backend disagree. |
| POS's "Live Restaurant Orders" (unified QR/Counter/Kiosk/Captain feed) | 🟢 WORKS — best-built screen in the product | Proves real-time, multi-source order aggregation is architecturally achievable when actually wired — the strongest evidence that BUG-009/013/019 are wiring gaps, not fundamental limitations. |
| Refund / void a completed order | ⚪ MISSING | Confirmed absent after actively searching every plausible entry point in POS. |
| Chef Notes → custom free-text note → kitchen ticket | 🔴 BROKEN — new (Round 4) | Preset modifier-chip notes work; the separate free-text field (commonly used for allergy/dietary notes) silently never reaches the ticket, despite its own label promising it does (BUG-020). |

### 2.4 Tables & Floor Plan

| Flow | Status | Detail |
| :-- | :-- | :-- |
| Tables created in Restaurant Admin → visible in POS/Captain | 🟢 WORKS | Correctly shared as starter data. |
| Table occupancy: POS opens table → Captain sees it occupied (or vice versa) | 🔴 BROKEN | Each app tracks its own table state independently — no shared source of truth (BUG-013 family). |
| Reservations | 🟡 PARTIAL | Real feature, but at least one seeded reservation references a table that doesn't exist in the real 12-table floor plan (fake-seed data quality issue, not a functional bug). |

### 2.5 Financial: Payments, Billing, Cash Management

| Flow | Status | Detail |
| :-- | :-- | :-- |
| POS payment (cash/UPI/card/split) — calculation | 🟢 WORKS | Every mode and split-allocation verified mathematically correct. |
| POS payment → Restaurant Admin Dashboard "Today's Net Sales" | 🟡 PARTIAL — corrected (Round 4) | Originally looked permanently fake (frozen at ₹0); a controlled before/after test proved it's a **caching-lag bug**, not fabricated data — it does eventually catch up once enough real transactions accumulate. Materially better diagnosis than first assessed. |
| POS payment → Restaurant Admin **Payments & Split** page | 🔴 BROKEN | Summary tiles read ₹0 while the transaction table directly beneath them, on the same screen, lists 72 real-looking rows — an internal contradiction, not just a cross-app one (BUG-016). |
| POS payment → Restaurant Admin **Billing & Invoices** | 🔴 BROKEN | Real page, doesn't reflect real completed POS payments. |
| POS payment → **Customers CRM** (with customer explicitly attached) | 🔴 BROKEN — decisively confirmed | Completed a full real paid order with Attach Customer used; CRM's guest count and lifetime spend were byte-for-byte unchanged afterward. Proven, not inferred. |
| Shift & Cash Drawer (open/close, expected-vs-actual variance) | 🟡 PARTIAL | Well-designed feature, explicitly labelled "Local SQLite Ledger" in its own UI — the concrete on-screen evidence for the disconnect above. |
| Platform (SaaS) billing: Super Admin Invoices & Billing | 🟢 WORKS | Real, correctly tied to real tenants (this is the `cloud/api` `Invoice`/`Payment` model — genuinely wired). |
| Cashfree payment gateway connection (per-restaurant) | 🟢 WORKS (as designed) | Real onboarding form, real vendor status tracking — Phase 1 `PLATFORM_POOLED` model, cloud-side. |
| Super Admin **Reports & Analytics** (MRR, active restaurants, subscriptions) | 🔴 BROKEN | All-zero despite the same Super Admin app's own Restaurants/Billing/Applications pages showing real, non-zero data for the same tenants at the same time (BUG-018). |
| Kiosk Admin **Reports & Export** | 🔴 BROKEN | Same self-contradicting pattern as Payments & Split — third independent occurrence, strongly suggesting one shared root cause worth fixing once, not three separate patches. |

### 2.6 CRM, Inventory & Staff Operations

| Flow | Status | Detail |
| :-- | :-- | :-- |
| Customers CRM (segments, loyalty tiers, 360° view) | 🔴 BROKEN | Well-designed UI over fake-seed data; decisively proven disconnected from real transactions (see 2.5). |
| Inventory & Recipes (stock, BOM formulas) | 🔴 BROKEN | Same fake-seed pattern; Wastage Log is honestly empty, the one internally-consistent part. |
| Staff & Roles roster | 🟢 WORKS | Real, correctly shared PIN roster across POS/Captain/KDS. |

### 2.7 Sync, Backup & Device Health

| Flow | Status | Detail |
| :-- | :-- | :-- |
| Device → Cloud sync (any entity type) | 🔴 BROKEN — root cause | `SyncOutboxEngine.processOutbox()` is a stub with zero network calls (Part 1.3). Explains most of the domain gaps above. |
| Super Admin Sync & Conflict Monitor | 🟢 WORKS (honestly empty) | Real page, correctly shows 0 events because 0 real events are ever sent — a rare example of good empty-state UX in this product. |
| Device online/last-seen status | 🔴 BROKEN | Every app shows "0 Online" / stale heartbeats despite continuous real use throughout testing — no real heartbeat reaches the platform. |
| Restaurant Admin / Kiosk Admin "Backup & Restore" (local JSON export) | 🟢 WORKS (as a manual, local-only feature) | Genuinely exports real local state to a file — just never automatic, never off-device by default. |
| Cloud/off-device backup | ⚪ MISSING (openly aspirational) | The feature's own UI text says so. Confirmed at platform scale: 0 total snapshots across all 9 test-platform restaurants in Super Admin's Backups & Recovery. |
| QR Table Ordering (in-restaurant) → Super Admin QR Ordering Suite | 🔴 BROKEN | Real, detailed activity exists at the restaurant level; 0 usage ever reported at the platform level for the same restaurant, same day. |

### 2.8 Commercial Enforcement

| Flow | Status | Detail |
| :-- | :-- | :-- |
| Super Admin: Suspend Restaurant / Suspend Subscription | 🔴 BROKEN — **P0**, confirmed platform-wide | Own confirmation dialog promises immediate terminal lockout. Tested via real suspend+reactivate cycles against **all seven applications** (not just POS/Restaurant Admin, as earlier rounds had left unconfirmed) — every single one ignored it completely. This is the platform's core revenue-protection mechanism and it does not function anywhere (BUG-014). |
| Plan/entitlement changes → app access | Not independently re-verified this round | `ApplicationEntitlement` table is real and per-app; whether a live change is actually enforced by each client wasn't re-tested after the suspension finding made the pattern clear. |

### 2.9 Support & Platform Operations (Super Admin)

| Flow | Status | Detail |
| :-- | :-- | :-- |
| Restaurant/Owner/Branch management | 🟢 WORKS | All real, correctly cross-referenced. |
| Diagnostics & Support (tenant inspect, device list, impersonate) | 🟢 WORKS — genuinely strong | Correctly pulls real devices, real audit history matching this session's actual actions. |
| Support Tickets | 🟢 WORKS (honestly empty) | Real ticketing model, no fake seed data. |
| Audit Logs (platform-level) | 🟢 WORKS | Correctly recorded every real action taken during testing, including the suspend/reactivate cycle. |
| Restaurant Admin's own Audit Trail Logs | 🟡 PARTIAL | Genuinely real (proven — it correctly logged a real menu-item creation and login) but only instrumented for MENU and AUTH categories; ORDERS/PAYMENTS/STAFF/INVENTORY actions aren't logged at all despite many being taken during testing. |

---

## Part 3 — What "Organized Properly" Should Look Like

The flows above don't need 20 unrelated fixes. They need four structural changes, in priority order:

### 3.1 Build the real sync bridge (fixes the majority of 🔴 rows above)
Replace `SyncOutboxEngine.processOutbox()`'s simulated acknowledgment with a real client that:
1. Authenticates as the device (the `Device.deviceTokenHash` mechanism already exists in the cloud schema — use it).
2. POSTs queued `sync_events` to real `cloud/api` endpoints, scoped by `restaurantId`, landing in the *already-built* `SyncEventLog`/`SyncConflict` tables.
3. On (re)connect, does a **catch-up fetch** of anything the device missed — not just a live push. This single addition fixes BUG-009's specific failure mode (a KDS session only sees orders sent while it happened to be connected).
4. Extends beyond Orders to Menu availability, CRM, Inventory, and Payments — the same four domains found disconnected in the audit — rather than treating each as a separate one-off fix.

This is genuinely one piece of work, not five. The local schema already models everything needed; the cloud schema already has tables waiting to receive it; the missing piece is the ~60 lines of stub code in `outbox.ts` that need to become real HTTP calls.

### 3.2 Make tenant suspension a real gate
Once the sync bridge above exists, suspension enforcement is nearly free: every device-authenticated request already carries a `restaurantId`; add one middleware check against `Restaurant.status` in `cloud/api`, and have each local client refuse to operate (or drop to a hard read-only mode) when a sync round-trip reports `SUSPENDED`. This turns a currently-decorative DB flag into the real commercial lever it's supposed to be.

### 3.3 Fix the two precise, cheap, already-diagnosed bugs
Unlike the sync bridge, these don't require architecture work — just wiring what already exists:
- **Held Carts**: the count is already correct; add the missing click handler/route to open the list.
- **Kiosk Sold Out**: the `is_available` column already exists; make the Kiosk's menu query respect it.
- **SEND KOT debounce**: disable the button (or apply an idempotency key) on first click until the request round-trip completes — the same pattern should be applied to PAY and any other mutating action, not just this one instance.

### 3.4 IA / product cleanup
- Rename `pos-admin` → `restaurant-admin` in the codebase to match what the UI already calls itself; surface Kiosk Admin from inside it so owners discover it without a separate URL.
- Collapse the redundant "Cloud" login in Subscription Plans into the existing Restaurant Admin session.
- Add a consistent "DEMO DATA" badge convention for any screen not yet fed by the real sync bridge (CRM, Inventory) — cheap honesty while 3.1 is in progress.
- Extend Restaurant Admin's Audit Trail Logs beyond MENU/AUTH to ORDERS/PAYMENTS/STAFF/INVENTORY — the logging mechanism itself is proven real; it's just not instrumented everywhere.
- Add a per-restaurant JAMAN AI display toggle in Restaurant Settings, layered on top of (not replacing) the existing platform-level entitlement/monetization control found in Super Admin's JAMAN AI Engine.

---

## Part 4 — Suggested Implementation Order

1. **Sync bridge MVP** (3.1) — Orders domain only, POS↔KDS↔Captain. This alone fixes BUG-009, most of BUG-013, and BUG-019, and is the prerequisite for everything else.
2. **Suspension enforcement** (3.2) — small once 1 exists; highest business risk if shipped without it.
3. **Auth bypass removal** (BUG-007) — independent of the above, should happen in parallel; it's a one-line deletion, not an architecture change.
4. **SEND KOT / PAY idempotency + Held Carts wiring + Kiosk Sold Out wiring** (3.3) — cheap, high-visibility, can ship same sprint as 1-2.
5. **Extend sync bridge to CRM/Inventory/Payments** (3.1, phase 2) — same pattern as step 1, different tables.
6. **IA cleanup** (3.4) — ongoing, no sequencing dependency on the above.

---

*This document synthesizes findings from `FULL_ECOSYSTEM_QA_AUDIT_REPORT.md` (hands-on browser testing across all 7 applications, 5 rounds) with direct source-code inspection of `cloud/api/prisma/schema.prisma`, `packages/database/src/schema.ts`, `packages/database/src/db.ts`, and `packages/sync/src/outbox.ts`. No source code was modified in the production of either document.*

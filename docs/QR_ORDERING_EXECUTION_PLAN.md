# QR Ordering: Execution Plan

> **Status (2026-09-26): implemented.** Phases P0 to P14 were carried out; P15 (ordering over the restaurant LAN) was not built. What was done, what is verified and what remains is in `QR_ORDERING_IMPLEMENTATION_REPORT.md`. The plan below is kept unchanged as the design record.

Source specification: `docs/qr.implemtantion.md` (the file is spelled that way in the repository; 2,966 lines, 74 numbered sections, 51 KB). All 74 sections were read end to end. This document turns them into ordered phases. **No production code was changed while writing it.** Nothing here builds an EXE, APK, AAB or installer.

Every statement about the current code below was checked against the repository on 2026-09-26. Things I could not confirm by reading are marked **VERIFY** and are the first thing the owning phase must prove with a failing test.

---

## 1. What exists today (audit, spec section 2)

QR ordering is **not** a blank slate and **not** purely a demo. There is a real cloud path, wrapped in a lot of client-side and hardcoded behaviour.

### 1.1 Real, database-backed pieces (keep and build on)

| Area | Where | Notes |
|---|---|---|
| Token to table lookup | `QrTableLink` in `cloud/api/prisma/schema.prisma` (unique `qrToken`, `restaurantId`, nullable `branchId`, `tableId`, `tableNumber`, `isActive`) | One indexed read, no tenant scan. Kept in step by `EntitySyncService.syncQrTableLink` when the table is pushed. |
| Public guest API | `cloud/api/src/modules/qr-guest-ordering/` (`GET /api/v1/qr-guest/session`, `POST /api/v1/qr-guest/orders`, `GET /api/v1/qr-guest/orders/:id`) | No guard; token is the boundary; restaurant is never taken from the caller; throttled (`QrGuestReadThrottle`, `QrGuestOrderThrottle`). |
| Server pricing | `payments/pricing.util.ts` `priceCart`; guest service recomputes from synced menu | Client totals are ignored (spec 18, 58 partly met). |
| Idempotency | `externalOrderId = "qr-" + idempotencyKey`; second submit returns the existing order | Works (spec 21 partly met). |
| Order storage | Guest orders are written to `SyncedOrder`, the same table POS and Kiosk orders use | One order table already (good for spec 20, 69). |
| Entitlement primitives | `ApplicationEntitlement` with `AppCode.QR_ORDERING`; `Feature` catalog row `qrTableOrdering` bridged to `QR_ORDERING` (Phase 10); `ApplicationEntitlementsService.isAppEnabled/assertAppEnabled`; dependency graph | This is the centralized system spec 39 asks for. It exists. QR just does not use it exclusively. |
| Offline entitlement policy | `offline-policy` module, 7-day rule in devices and Branch Core | Reusable for spec 40. |
| Sequence cursor, SSE, exactly-once | `nextSyncSequence`, `RealtimeService.publish`, order sync protocol, Branch Core downlink | Reusable for spec 41-43. QR orders currently bypass it (see 1.3). |
| Menu versioning | `MenuPublication` (per restaurant `version`) | Reusable for spec 52. Guest menu does not use it yet. |
| Restaurant ID convention | `JM<phone>` `restaurantCode`, owner login and OTP reset (Phase 9) | Spec 6 largely met; verify only. |
| Super Admin QR pages | `cloud/super-admin-web/src/pages/QrOrdering/*` | Real API-backed, but drives a competing override store (see 1.3). |
| Existing tests | `cloud/api/test/qr-guest-ordering.e2e.spec.ts` (8), `qr-ordering.e2e.spec.ts` (4) | Cover token resolution, server pricing, refusal of unknown items, disabled table, regenerated token, CORE plan refused. |

### 1.2 Hardcoded, mock or demo behaviour found

| # | Finding | Location | Spec |
|---|---|---|---|
| H1 | **Platform-wide static modifier catalogue** (`PLATFORM_MODIFIER_GROUPS`: Spice Level, Portion Size, Add-Ons with fixed rupee deltas), maintained "BY HAND" against `seed.ts`. A restaurant's own modifiers never reach the guest. | `qr-guest-ordering.service.ts` | 16, 54 |
| H2 | **Hardcoded tax**: `DEFAULT_TAX_RATE_BASIS_POINTS = 500` for every restaurant. | same | 18, 54 |
| H3 | **Plan-tier check in the entitlement resolver**: `planTier === 'PRO'` decides QR access and table limits (`50` vs `15`); legacy `qrTableOrdering` JSON flag OR `ApplicationEntitlement`. Exactly the pattern the spec forbids. | `qr-ordering.service.ts` `resolveEntitlement` | 3, 5, 39 |
| H4 | **Competing override store**: QR overrides live in `PlatformSetting` rows (`qr.entitlement.<id>`), not in the license/feature-override architecture. Two ways to grant QR to one restaurant. | `qr-ordering.service.ts`, `QrEntitlementEditor.tsx` | 3, 38 |
| H5 | **Tier and price gates in Restaurant Admin UI**: `db.license?.tier !== 'PRO'`, copy says "JAMANVAAR PRO (₹7,000/month)", "CORE (₹5,000/mo)". Also wrong against the spec's example (QR is the third tier). | `pos-admin/App.tsx` (~895-936, 1462-1562), `QrOrderingModule.tsx` (~514-726) | 4, 5, 39, 49 |
| H6 | **Client-minted QR tokens**: `jv_qr_tbl_<tableNumber>_<suffix>` generated in the browser's local database, then pushed. The token embeds the table number, and the server does not mint, version or revoke it. | `packages/database/src/repositories.ts` (`QrOrderingRepository`), `db.ts:1337` (seed tokens derived from table ids) | 11, 12, 30, 31 |
| H7 | **Local guest-order simulator**: `QrOrderingRepository` creates QR orders in the device's local database with `qrNum = 1040 + count` (hardcoded start, count-based numbering, collides across devices). This is the "customer preview" and analytics source. | `repositories.ts` ~4425-5041 | 20, 23, 54, 69 |
| H8 | **Default guest base URL is `http://localhost:5176`** (`setGuestOrderBaseUrl`); QR URLs are `/?qrTable=<n>&token=<t>` on the Restaurant Admin origin. Not a public order domain. | `packages/database/src/qr_order_url.ts`, `QrCardDesignerModal.tsx` | 11, 54, 66 |
| H9 | **Cloud API base defaults to `http://localhost:4000`** in the guest client. | `pos-admin/src/cloud/qrGuestClient.ts` | 54 |
| H10 | **Client-reported QR metrics**: usage/revenue snapshots are computed by the admin app from local data and pushed with `reportUsage`. Not derived from cloud orders, so they can be wrong or fabricated. | `qr-ordering.service.ts` `reportUsage`, `qr_platform_sync.ts` | 8, 47 |
| H11 | Guest page **ships inside the Restaurant Admin bundle** (`GuestQrOrderingPage`, 1,237 lines, routed from `pos-admin/App.tsx:158`). A public customer downloads the entire admin application. | `pos-admin` | 15, 30, 50, 51, 66 |
| H12 | Guest order **status forced to `PREPARING`** at creation with no acceptance step. | guest service | 22, 35 |

### 1.3 Architecture that is wrong or missing

| # | Finding | Spec |
|---|---|---|
| A1 | **QR orders never get a sync `seq`, and no realtime event is published.** `syncedOrder.create` in the guest service omits `seq` and skips `RealtimeService.publish`. The cursor pull (`seq > afterSeq`) excludes rows with null `seq`. A POS on the sequence cursor **VERIFY: will not receive a QR order**; only the legacy timestamp pull returns it. The existing e2e test passes because it uses the legacy pull. This is the single most important defect. | 22, 24, 41, 42, 43, 70 |
| A2 | **Branch is not enforced.** `QrTableLink.branchId` is never set by `syncQrTableLink`, so it is always null; the pull filter `OR [{branchId: device.branchId}, {branchId: null}]` then hands a QR order to **every** branch's devices. **VERIFY** with a two-branch test. | 10, 29, 64 |
| A3 | **Possible cross-tenant token takeover** (**VERIFY**). `syncQrTableLink` upserts by `qrToken` and its `update` branch rewrites `restaurantId`. A tenant that pushes a table carrying another restaurant's token could re-point the token. Depends on whether the call runs under a tenant RLS context; must be proven with a test either way. Client-minted tokens make this worse. | 30 |
| A4 | **KOTs are created on every pulling device**, by `ensureKotsForOrder` in `packages/sync/src/outbox.ts`, numbered locally with `max(kotNumber) + 1` (`KOTRepository.generateKOT`). Two POS devices pulling the same QR order create two KOTs with colliding numbers. The spec forbids max+1 and requires one KOT per order round. | 23, 27, 44 |
| A5 | **Three sources of "is QR on"** (plan JSON key, `ApplicationEntitlement`, `PlatformSetting` override) plus the tier fallback. No single `EntitlementService.has(restaurantId, 'QR_ORDERING')` that everything calls. | 3, 39 |
| A6 | **No first-class order `source`.** Source is `meta.sourceType = 'QR_TABLE'` in JSON (and `orderType = 'QR_TABLE'` on the client). Not queryable or indexable; analytics scan JSON. | 20, 22, 69 |
| A7 | **No `QrCode` model semantics**: no status (ACTIVE/DISABLED/REVOKED), no `version`, `revokedAt`, `lastScannedAt`, no mode (TABLE_ORDER / MENU_ONLY), no per-restaurant settings, no scan/session events. Revoke and regenerate are implied by `isActive` flipping. | 12, 31, 33, 46, 47 |
| A8 | **Menu is the restaurant-wide `SyncedEntity` blob**, not branch-scoped, not versioned for the guest, no channel model beyond one `isQrOrderingEnabled` flag. No dedicated `GET .../menu` endpoint; menu rides inside the session response. | 16, 17, 51, 52 |
| A9 | **Tables are client-generated ids** inside `SyncedEntity DINING_TABLE`, with no cloud-side branch. Table ids are unique per restaurant by convention only. | 9, 10 |
| A10 | **Public order reference is client-chosen** (`qr-<idempotencyKey>`), used as the status URL id. No unguessable public order id. | 56 |
| A11 | **Order number is `max + 1` over today's QR orders** (`nextQrTokenNumber`), racy under concurrent submits. | 23, 44 |
| A12 | **No QR analytics events** (scan, menu view, cart, order started/failed). Metrics are the client snapshots in H10. | 47 |
| A13 | **Audit** covers only entitlement updates and usage reports; nothing for QR created/disabled/regenerated/revoked/settings changed. | 48 |
| A14 | **No Branch Core involvement**: the public path is cloud only. Orders reach a branch only through the cloud downlink (and, given A1, not by cursor). No documented decision on LAN QR. | 25, 26 |
| A15 | **Online payment for QR is unspecified**: `paymentMethod` is accepted from the guest and stored `PENDING`. No gateway verification path tied to a QR order. | 45 |

### 1.4 Conflicts between the specification and the current architecture

1. **Naming.** The spec's endpoints (`/public/qr/:token`, `/restaurant/qr/...`) differ from the codebase convention `/api/v1/...`. Decision: adopt `/api/v1/public/qr/...` and `/api/v1/restaurant/qr/...`, keep `/api/v1/qr-guest/*` as deprecated aliases until every issued QR and the old client are retired (spec 55 says adapt naming).
2. **`QrCode` model vs existing `QrTableLink`.** The spec proposes a new `QrCode` table. Creating it beside `QrTableLink` would be two token stores. Decision: **evolve `QrTableLink` into the spec's `QrCode`** by migration (rename/extend), not add a second table.
3. **Order domain.** The spec wants one canonical order with `source`. The codebase already has one (`SyncedOrder`), plus a legacy `Order` model used only for payment gateway orders (kiosk `externalOrderId` doubles as key). QR must use `SyncedOrder`; the legacy `Order` stays payment-only. Adding a `QrOrder` table is explicitly rejected.
4. **Tables.** The spec wants globally unique server ids and branch ownership. Tables are offline-created on devices, so ids must stay client-creatable. Decision: keep `DINING_TABLE` as the synced canonical entity, make the server assign and validate `branchId`, and give `QrCode` a server-generated id; a table's identity is `(restaurantId, tableExternalId)` and is never the display number.
5. **KOT authority.** Spec: one KOT, collision-safe numbers. Code: each device makes its own. Decision below (D5): deterministic KOT ids plus lease-based numbers, so every device derives the same KOT and none can collide.
6. **Where entitlement is decided for guests.** The spec requires backend authorization at scan. Today the check is in the guest service but through the divergent resolver (H3/H4/A5). Fixed by P1.
7. **`updatedAt` cursors.** Spec 42 forbids them as the only mechanism. The guest path is the offender via A1; legacy `since` pulls remain only for old app versions.

---

## 2. Architectural decisions (binding for every phase)

**D1. One order domain.** QR orders are `SyncedOrder` rows with a first-class `source` column (`POS | KIOSK | CAPTAIN | QR | ...`). Ingestion goes through **the same service method** the devices use (`OrderSyncService`), called with a server principal instead of a device. It therefore gets `seq`, `syncVersion`, per-order locks, item merge, realtime publish and Branch Core downlink for free. No `QrOrder`, no `QrSyncService`.

**D2. One entitlement service.** `EntitlementService.has(restaurantId, appCode | featureKey)` (extending `ApplicationEntitlementsService.isAppEnabled`) is the only place that answers "is X on". It reads the active subscription's `ApplicationEntitlement` rows and the existing license/feature override mechanism, and returns `{ enabled, reason, limits, source }`. QR limits (max active tables, max orders per day, live tracking, online payments) become **Feature limits** on the catalog, not JSON keys and not tier defaults. The tier fallback, the legacy JSON key read, and the `PlatformSetting` override store are removed after a data migration. Frontends receive the resolved result from an endpoint; they never compute it.

**D3. `QrCode` (evolved from `QrTableLink`).** Server mints the token (>= 128 bits from a CSPRNG, URL-safe, no table number inside, never sequential). Fields: `id`, `publicToken` (unique), `restaurantId`, `branchId` (required), `tableExternalId` (nullable for MENU_ONLY), `mode` (`TABLE_ORDER | MENU_ONLY`), `status` (`ACTIVE | DISABLED | REVOKED`), `version`, `createdAt`, `updatedAt`, `revokedAt`, `lastScannedAt`, `metadata`. Exactly one ACTIVE code per table; regenerate revokes the old one in the same transaction. RLS policy like the other tenant tables; public resolution runs as platform but through a single narrow query.

**D4. Public API contract.** `GET /api/v1/public/qr/:token`, `GET .../:token/menu`, `POST .../:token/orders`, `GET /api/v1/public/qr/orders/:publicOrderId`; restaurant side `GET|POST /api/v1/restaurant/qr/tables`, `POST .../:id/generate|regenerate|revoke`, `GET .../orders`, `GET|PUT .../settings`. Restaurant, branch and table always come from the token; any such field in a body is rejected (not ignored).

**D5. KOT authority.** KOT identity is deterministic: `kotId = f(orderExternalId, round)`. Numbers come from the existing **number lease** mechanism (cloud `number-leases`, Branch Core `leaseNumbers`), never `max + 1`. `ensureKotsForOrder` becomes idempotent by that id, so two POS devices pulling the same order converge on one KOT. An "accept/claim" transition (NEW to CONFIRMED) is a monotonic order status change resolved by the existing status-monotonic merge, so only the first wins.

**D6. Menu.** QR reads the canonical published menu for the QR's branch: categories, items, **modifier groups from the restaurant's own synced `MODIFIER_GROUP` entities**, tax from the restaurant's own `TaxGroup`, availability, and per-item `salesChannels` (`POS, KIOSK, QR, CAPTAIN`). Versioned by `MenuPublication.version`; the menu endpoint supports `If-None-Match`/version query.

**D7. Offline stance (spec 25).** Public cloud QR requires the internet, honestly. **Option A (supported now):** if the restaurant's internet is down, the QR page says ordering is unavailable. **Option B (designed, delivered in the last optional phase):** Branch Core serves the customer web app and the same public endpoints on the LAN using cached `QrCode` rows and its own entitlement snapshot, for phones on restaurant Wi-Fi. Never claim internet QR works offline.

**D8. Platform independence.** QR business logic lives in `cloud/api` (server) and a new framework-free client module; the customer app and Restaurant Admin call HTTP only. No Tauri or Android APIs anywhere near QR.

**D9. Analytics from facts.** Scans, menu views, carts and order events are recorded server-side as `QrEvent` rows; revenue and order counts are computed from `SyncedOrder` where `source = QR`. The client-reported usage snapshot (H10) is retired.

---

## 3. Phase overview and spec coverage

| Phase | Name | Spec sections |
|---|---|---|
| P0 | Baseline: prove current behaviour and the suspected defects | 2, 71 (process), 69-70 (constraints) |
| P1 | One entitlement service; QR_ORDERING through it | 3, 4, 5, 6 (verify), 36, 37, 38, 39, 40 |
| P2 | Data model: `QrCode`, QR settings, events, order `source`, table/branch integrity | 9, 10, 11, 12, 29, 46, 48 (model), 47 (model), 56 (column) |
| P3 | Restaurant QR management API and audit | 31, 32 (data), 46, 48, 55 (restaurant half), 30 (admin auth) |
| P4 | Public resolution and menu API | 13, 14, 16, 17, 33, 51, 52, 55 (public half), 58 (menu) |
| P5 | Canonical order ingestion: seq, branch, idempotency, public ref, payment | 18, 20, 21, 34 (server side), 35, 41, 42, 44, 45, 56, 58 |
| P6 | KOT, POS and KDS pipeline | 22, 23, 24, 27, 28 |
| P7 | Sync, Branch Core, realtime recovery, offline entitlement | 25, 26, 40, 41, 42, 43, 65 |
| P8 | Restaurant Admin UI | 7, 8, 9, 31, 32, 46, 49 |
| P9 | Customer QR web app (standalone) | 11 (URL), 15, 19, 33, 34, 35, 50, 66, 67 |
| P10 | Super Admin UI for plans, features, overrides | 4, 5, 38, 49 |
| P11 | Security, rate limiting, analytics | 30, 47, 57 |
| P12 | Hardcoding and duplicate-system removal | 54, 69, 70, 71 |
| P13 | Full test suites and E2E | 59, 60, 61, 62, 63, 64, 65 |
| P14 | Documentation, final audit, report | 53, 66, 68, 72, 73, 74 |
| P15 | Optional: LAN QR through Branch Core (Option B) | 25, 26 |

Section 1 (business flow) and 8 are the definition of the target; section 2 is satisfied by this document plus `QR_ORDERING_CURRENT_STATE.md` created in P0. Sections 69, 70, 71 apply to every phase as acceptance rules, not as work items.

The order is fixed by dependency: entitlements (P1) and the data model (P2) must exist before any endpoint; the restaurant admin API (P3) is needed to mint tokens before the public API (P4) can resolve real ones; the canonical order path (P5) precedes KOT/POS/KDS (P6) and the sync guarantees (P7); only then are UIs built (P8, P9, P10).

---

## 4. Phases

### P0. Baseline: prove current behaviour and the suspected defects

- **Objective.** Turn every **VERIFY** in section 1 into a failing or passing automated test before changing anything, and record a characterization of today's happy path so refactors cannot silently break it.
- **Spec sections.** 2, 71; constraints 69, 70.
- **Existing files.** `cloud/api/test/qr-guest-ordering.e2e.spec.ts`, `qr-ordering.e2e.spec.ts`, `order-sync-*` specs, `sync-chaos.e2e.spec.ts`, `helpers.ts`.
- **Database.** None.
- **Backend/API.** None.
- **Frontend.** None.
- **Entitlement/plan.** None.
- **Sync.** None.
- **Security.** None.
- **Tests required (new, may fail by design and are then tracked):**
  1. A QR order is returned to a device pulling with `afterSeq` (A1). Expected today: **fails**.
  2. A QR order for Branch A is not returned to a Branch B device (A2). Expected today: **fails**.
  3. Restaurant B pushing a table with Restaurant A's token cannot re-point it (A3).
  4. Two POS pulls of one QR order create one KOT with unique numbers (A4).
  5. Characterization tests for the current guest flow (kept green through the refactor).
- **Dependencies.** None.
- **Acceptance.** Each defect A1-A4 has a test with a recorded verdict (confirmed defect or disproved). `docs/QR_ORDERING_CURRENT_STATE.md` written from these results (14 headings required by spec 2).
- **Migration risks.** None (tests and docs only). Risk is only in mistaking a passing legacy-pull test for cursor delivery; the new tests must use `afterSeq`.

### P1. One entitlement service; QR_ORDERING through it

- **Objective.** A single authority for "is QR on for this restaurant", driven by plan, license/override and subscription state, with QR limits as feature limits. Remove every plan-name and price check.
- **Spec sections.** 3, 4, 5, 6 (verify onboarding and ID convention only), 36, 37, 38, 39, 40.
- **Existing files.** `application-entitlements/*`, `features/*` (Feature catalog, `qrTableOrdering` bridge), `plans/entitlements.ts`, `qr-ordering/qr-ordering.service.ts` (`resolveEntitlement`), `subscriptions`, `offline-policy`, `packages/business/src/license_entitlements.ts`, `packages/types/src/planFeatureCatalog.ts`, `devices` roster and heartbeat entitlement snapshot.
- **Database.** Feature limits for QR (max active tables, max orders per day, live tracking, online payments) as Feature/plan limit rows or the existing limits structure; a per-restaurant feature override table if the license architecture has none (**VERIFY**; reuse if `ApplicationEntitlement` overrides already cover it). Data migration: read every `PlatformSetting qr.entitlement.*` override and legacy `qrTableOrdering`/`qrMaxActiveTables` plan JSON value into the new structures; keep the old data until P12.
- **Backend/API.** `EntitlementService.has/limits/explain(restaurantId, key)`; `GET /api/v1/tenant/entitlements` returns the resolved snapshot (enabled, lock reason, source PLAN/OVERRIDE, limits, validUntil); guard/decorator `@RequiresFeature('QR_ORDERING')` for admin endpoints; the guest service calls the service, not its own resolver. Delete the tier fallback and the `PlatformSetting` override path behind a compatibility read until the migration is verified.
- **Frontend.** None in this phase except contract types; UI work is P8/P10.
- **Entitlement/plan.** Plans (₹5K/₹7K/₹9K examples) are pure data in the Plan/Feature tables; a test seeds three plans with different prices and proves behaviour follows the feature rows, not the price or name. Subscription end date and restaurant status are part of `has()`.
- **Sync.** Roster/heartbeat entitlement snapshot carries `QR_ORDERING` and its limits to devices and the Branch Core (already carries enabledApps; extend with limits and validUntil).
- **Security.** `tenant` endpoints derive the restaurant from the principal only; override changes require the platform permission and write an audit row.
- **Tests required.** Spec 59 items 9-13 (entitlement disabled rejected, enabled works, upgrade enables, downgrade disables new orders, override works); a renamed plan and a repriced plan behave identically; expired subscription and suspended restaurant deny; override revocation and restore; snapshot offline grace (spec 40): revoked feature does not stay enabled past the grace window (7-day policy reused); a static test that fails if `planTier ===`, `'PRO'` or a price literal appears in QR or entitlement code.
- **Dependencies.** None beyond P0.
- **Acceptance.** Exactly one code path answers the question; `grep` for tier/price checks in QR code is empty; the three example plans produce locked, locked, enabled with **no** code change between them.
- **Migration risks.** Restaurants currently entitled via the PRO-tier fallback or a `PlatformSetting` override would lose QR if the migration misses them. Mitigation: a dry-run report of every restaurant whose effective answer changes; deploy the compatibility read first, compare old and new answers in production logging, then cut over.

### P2. Data model: `QrCode`, settings, events, order `source`, table and branch integrity

- **Objective.** Give QR a proper, tenant-safe, branch-aware data model and make order source a first-class column.
- **Spec sections.** 9, 10, 11, 12, 29, 46, 47 and 48 (models), 56 (column), 33 (mode).
- **Existing files.** `QrTableLink` and its migration, `EntitySyncService.syncQrTableLink`, `SyncedOrder`, RLS policy scripts, `Branch`, `MenuPublication`.
- **Database.**
  - Evolve `QrTableLink` to `QrCode` as in D3 (add `status`, `version`, `mode`, `revokedAt`, `lastScannedAt`, `metadata`; make `branchId` required with backfill; server-generated token; unique partial index so one ACTIVE code per table; indexes on `restaurantId`, `branchId`, `tableExternalId`, `publicToken`). Old tokens (client-minted `jv_qr_tbl_...`) stay valid as `ACTIVE` until each table is regenerated, so printed stickers keep working.
  - `QrSettings` (per restaurant, optionally per branch): ordering on/off, table ordering, menu-only, customer notes, modifiers, cash, online payment, show status, customer fields required.
  - `QrEvent` (`QR_SCANNED`, `QR_MENU_VIEWED`, `QR_CART_CREATED`, `QR_ORDER_STARTED`, `QR_ORDER_PLACED`, `QR_ORDER_FAILED`) with restaurant, branch, code, session id (random, non-personal), time.
  - `SyncedOrder`: add `source` (enum-like string, indexed with `restaurantId, branchId, source, createdAt`), `publicOrderId` (unique, random), `qrCodeId` (nullable); backfill `source` from `meta.sourceType`/`orderType`.
  - Audit action names registered for spec 48.
  - RLS policies for every new table, tested like the existing ones.
- **Backend/API.** Prisma migration (hand-written, applied like earlier migrations), repositories/services for the models, no endpoints yet.
- **Frontend.** None.
- **Entitlement/plan.** `maxActiveTables` from P1 enforced at code creation in P3.
- **Sync.** `QrCode` is cloud-owned (spec 53), pushed to Branch Core roster/cache only in P15. `DINING_TABLE` payload gains `branchId` (device sets it from its activation; server validates against the device's branch). Table identity is never the display number.
- **Security.** Token entropy test; RLS cross-tenant read and write tests for every new table.
- **Tests required.** Spec 59 items 1-3, 16, 28-30 at model level; token uniqueness/entropy; one-active-per-table constraint; RLS isolation; backfill correctness on a copy of representative data; `source` backfill idempotent.
- **Dependencies.** P1 (limits and audit names).
- **Acceptance.** Migration applies forward on a database containing legacy links and orders with zero data loss; legacy tokens still resolve (through P4); constraints hold under concurrent inserts.
- **Migration risks.** (1) `branchId` backfill for links that were always null: a restaurant with several branches cannot be backfilled unambiguously; such codes are flagged `NEEDS_BRANCH` and refused for ordering until an admin assigns a branch, rather than guessing. (2) Renaming `QrTableLink` breaks any raw SQL and the entity-sync writer: change both in one release. (3) Backfilling `source` on a large `SyncedOrder` table needs batching.

### P3. Restaurant QR management API and audit

- **Objective.** Server-authoritative creation, generation, regeneration, revocation, settings and listing of QR codes by the restaurant, entitlement-guarded and audited.
- **Spec sections.** 31, 32 (print data), 46, 48, 55 (restaurant half), 30 (authorization).
- **Existing files.** `qr-ordering/qr-ordering.tenant.controller.ts`, `TenantAuthGuard`, `audit` module, `EntitySyncService` (stop letting it mint or rewrite tokens), `pos-admin` local QR repository (client mint is retired in P12).
- **Database.** Uses P2 tables.
- **Backend/API.** `GET|POST /api/v1/restaurant/qr/tables`, `POST .../:id/generate`, `.../regenerate`, `.../revoke`, `GET .../orders`, `GET|PUT .../settings`, `GET .../print-data` (restaurant name, logo, table label, URL; no internal ids). All under `TenantAuthGuard` + `@RequiresFeature('QR_ORDERING')` (read of the locked state stays available so the UI can show the lock). Table limits from P1 enforced. Regenerate: old code `REVOKED` and new code `ACTIVE` in one transaction. `syncQrTableLink` no longer accepts client tokens: it only mirrors table active/inactive and never writes `restaurantId`.
- **Frontend.** None yet (client wrapper only).
- **Entitlement/plan.** Creating or activating codes when not entitled returns 403 with the entitlement reason; existing codes and history remain readable (spec 36, 37).
- **Sync.** Table changes still flow through entity sync; QR state is cloud-authoritative and never derived from a device push.
- **Security.** Restaurant taken from the principal; branch must belong to the restaurant; role permission for QR management; audit rows `QR_CREATED`, `QR_DISABLED`, `QR_REGENERATED`, `QR_REVOKED`, `QR_SETTINGS_CHANGED` with actor, restaurant, branch, target, metadata; A3 closed.
- **Tests required.** Spec 59 items 30, 31, 36, 37, 38; cross-tenant and cross-branch admin attempts; limit enforcement; audit completeness; regenerate invalidates the old token atomically under concurrency; upgrade makes existing tables usable without recreation.
- **Dependencies.** P1, P2.
- **Acceptance.** A restaurant can create tables' codes entirely through the API; old client-minted tokens still work until regenerated; no endpoint accepts a restaurant id or token from the body.
- **Migration risks.** Restaurants relying on the admin app's local token minting must keep working during the transition: the admin app is switched to the API in P8, and until then `syncQrTableLink` keeps mirroring active state for legacy tokens only (feature-flagged, removed in P12).

### P4. Public resolution and menu API

- **Objective.** A public, unauthenticated, rate-limited API that resolves a token, enforces every precondition, and serves the correct branch's versioned, channel-filtered menu.
- **Spec sections.** 13, 14, 16, 17, 33, 51, 52, 55 (public half), 58 (menu), 29.
- **Existing files.** `qr-guest-ordering/*` (evolve, do not fork), `menu-publications`, `payments/pricing.util.ts`, `SyncedEntity` menu/category/modifier/tax entities.
- **Database.** Item `salesChannels` carried in the menu entity payload (schema for the payload documented and validated on entity push); `QrEvent` writes; `lastScannedAt` updates (throttled).
- **Backend/API.**
  - `GET /api/v1/public/qr/:token` checks, in order: token exists, code ACTIVE, restaurant exists and ACTIVE, branch exists and ACTIVE, subscription valid, `QR_ORDERING` enabled (via P1 only), table ACTIVE. Returns only safe public fields (name, logo, address if configured, branch name, table display number, ordering flags, menu version, settings). Unavailable states return distinct machine-readable reasons with the customer-safe message "QR Ordering is currently unavailable for this restaurant."
  - `GET .../:token/menu` returns the branch's published menu: categories, items, **restaurant-own modifier groups**, tax rates from the restaurant's tax configuration, availability, channel-filtered to `QR`; `ETag`/`menuVersion`; images as optimized URLs.
  - MENU_ONLY codes return the menu with no table and a flag requiring table or order-type selection at checkout.
  - Old `/api/v1/qr-guest/session` becomes a thin adapter over these services (deprecated).
  - `PLATFORM_MODIFIER_GROUPS` and the 500 bp tax constant are deleted here.
- **Frontend.** None yet.
- **Entitlement/plan.** Enforced server-side per request; nothing depends on the client.
- **Sync.** Reads canonical synced menu and publication version; no new sync path.
- **Security.** Token is the only input; response allow-list (a test asserts no forbidden field appears); constant-time-ish uniform "not found" for unknown vs malformed tokens where appropriate; per-token and per-IP throttling (finalized in P11).
- **Tests required.** Spec 59 items 1-10, 14, 15, 16, 39; menu of Restaurant A never contains B's items even with identical table numbers; branch A token never returns branch B menu; restaurant's own modifiers and tax used; disabled channel item hidden; menu version changes when the menu is republished; response field allow-list.
- **Dependencies.** P1, P2, P3.
- **Acceptance.** The guest session and menu come from the database and the real synced menu only; deleting the two hardcoded constants breaks nothing; branch isolation proven.
- **Migration risks.** Restaurants whose dishes reference the old global modifier group ids (`mod-spice-level` and so on) would lose those modifiers once the static catalogue is removed, unless the restaurant's own `MODIFIER_GROUP` entities already exist for them (**VERIFY**). Mitigation: a one-time backfill that materializes the three groups as that restaurant's own synced entities before removal. Restaurants with non-5% tax would now price differently: this is the correct behaviour and must be called out in release notes.

### P5. Canonical order ingestion: sequence, branch, idempotency, public reference, payment

- **Objective.** A QR order is created by the same code path as every other order, so it is sequenced, branch-scoped, idempotent, realtime-published and payment-safe.
- **Spec sections.** 18, 20, 21, 34 (server side), 35, 41, 42, 44, 45, 56, 58; 22 and 24 upstream half.
- **Existing files.** `order-sync.service.ts` (extract a shared `ingestOrder` used by devices and by the QR path), `qr-guest-ordering.service.ts` (`placeOrder`), `common/sync-sequence.ts`, `RealtimeService`, `payments` module and gateway webhook, `packages/database` order status types, Branch Core `ingestOrders`.
- **Database.** Uses P2 columns; a per-branch/day order-number counter (or the existing number-lease mechanism) replaces `max + 1`.
- **Backend/API.** `POST /api/v1/public/qr/:token/orders`: derive restaurant, branch, table from the token; **reject** any client-supplied restaurantId/branchId/tableId; validate items exist, belong to the restaurant, are available for channel QR, modifiers belong to the item, quantity bounds, notes length, payment method allowed by QR settings; price with `priceCart` using restaurant modifiers/tax (P4); create the order through the shared ingest with `source = QR`, `orderType = DINE_IN` (or the chosen type for MENU_ONLY), `qrCodeId`, status `NEW` (not forced to PREPARING; acceptance is P6), `paymentStatus = PENDING`; assign `seq` and publish the realtime `orders` event; idempotency key unique per QR and enforced by a database constraint (not only a read-then-write); return an unguessable `publicOrderId`. `GET /api/v1/public/qr/orders/:publicOrderId` returns customer-safe status using the canonical status system with a documented mapping to customer wording (spec 35). Online payment: order is marked paid only by the verified gateway webhook path already in `payments`; the client success callback never sets it; offline/unverified UPI is not claimed.
- **Frontend.** None.
- **Entitlement/plan.** Checked at order time (downgrade blocks new orders, history unaffected). Daily order limit from P1 limits, counted under the same transaction lock to avoid overshoot.
- **Sync.** Fixes A1: the order has `seq` and appears to cursor pullers and Branch Core downlink; realtime event published; duplicates are no-ops.
- **Security.** Server-authoritative totals; quantity abuse and price tampering rejected; duplicate submission and refresh safe; the status endpoint reveals nothing but the order's own customer-safe state.
- **Tests required.** Spec 59 items 17-21, 25, 32, 33, 34; retry after timeout returns the original order; double click race (two concurrent identical requests) creates one order; order visible to `afterSeq` pull, to the right branch only, and via realtime; replaying the same event twice at Branch Core adds nothing; entitlement removed between scan and submit blocks; payment tamper tests (client claims paid).
- **Dependencies.** P1-P4.
- **Acceptance.** No code path writes a QR order without `seq`; the ingest function is shared, not copied; A1 and A2 tests from P0 pass.
- **Migration risks.** Historical QR orders have null `seq`: a one-time backfill assigns sequence values in creation order so devices that reset their cursor do not miss them (must run inside the branch sequence counter, batch by restaurant). Changing default status from PREPARING to NEW changes what kitchens see: ship together with P6 and a setting for "auto-accept QR orders" so restaurants that relied on instant kitchen routing keep it.

### P6. KOT, POS and KDS pipeline

- **Objective.** A QR order becomes exactly one KOT per round, visible on every POS and the KDS through the existing pipeline, with collision-safe numbers and a single winner for accept/transition.
- **Spec sections.** 22, 23, 24, 27, 28.
- **Existing files.** `packages/sync/src/outbox.ts` (`ensureKotsForOrder`), `KOTRepository.generateKOT` in `packages/database/src/repositories.ts`, POS order feed and KOT screens, KDS app and `kds_db`, Kiosk and Captain consumers, Branch Core order rules (`rules.ts` item merge and status monotonic), number leases.
- **Database.** KOT number ranges from leases; KOT record carries `orderId`, `restaurantId`, `branchId`, `source`, deterministic id.
- **Backend/API.** Cloud and Branch Core expose the lease call (already present) to POS for KOT numbers; optional server-side "auto-accept" setting in QR settings (P2) that moves NEW to CONFIRMED with a KOT request event.
- **Frontend.** POS: a "NEW QR ORDER" entry (`#QR-…`, table, items, source badge) in the existing order feed, with Accept/Reject through the canonical status transition; KDS: source badge and table on the existing KOT card; Captain/Kiosk unaffected except source labels. No QR-only screens.
- **Entitlement/plan.** Devices hide QR-specific badges when the snapshot says QR is off but still process any QR order already in the system.
- **Sync.** `kotId` deterministic from `(orderExternalId, round)`; `ensureKotsForOrder` idempotent by that id so N devices converge on one KOT; numbers leased, never `max + 1`; status transitions monotonic through the existing merge; KOT reaches KDS by the same cursor/realtime path, and a missed realtime event is recovered by cursor.
- **Security.** Only authenticated device roles may accept/reject; branch checks on every transition.
- **Tests required.** Spec 59 items 22, 23, 24, 26, 27; two POS and one KDS pulling the same QR order produce one KOT, unique numbers under concurrency; only one accept wins; KDS disconnect then reconnect recovers via cursor; multiple kiosks and Captain devices coexist (spec 28); duplicate KOT event ignored at KDS and Branch Core.
- **Dependencies.** P5.
- **Acceptance.** No `max + 1` numbering remains on the QR path; A4 test passes; POS shows the QR order with the required fields.
- **Migration risks.** Existing KOT ids are not deterministic: old KOTs are untouched, the new rule applies to new rounds only, and the idempotency check must also match old KOTs by `(orderId, item coverage)` as `ensureKotsForOrder` does today. Changing KOT number sources needs the lease to be seeded above existing numbers to avoid collisions with printed history.

### P7. Sync, Branch Core, realtime recovery, offline entitlement

- **Objective.** Prove and document that QR sits on the shared sync architecture, including failure modes; decide and document offline behaviour honestly.
- **Spec sections.** 25, 26, 40, 41, 42, 43, 65.
- **Existing files.** `packages/branch-core/*` (downlink, roster, `applyRoster`), `packages/sync/*` (outbox, realtime client, endpoint resolver), `cloud/api` roster and offline-policy modules, `sync-observability`.
- **Database.** Roster payload extended with QR entitlement and limits (P1) and, for P15, active `QrCode` rows.
- **Backend/API.** Roster and heartbeat carry the QR entitlement snapshot with `validUntil`; the documented grace policy: cached for the existing 7-day offline window since last cloud contact; on expiry or revocation the local QR-management UI locks, while already-accepted orders continue to be processed.
- **Frontend.** None beyond locked-state rendering (P8).
- **Entitlement/plan.** Snapshot semantics documented: when cached, how long valid, expiry, unreachable server, revocation.
- **Sync.** No new sync system. Verify QR orders traverse: cloud ingest, seq, Branch Core downlink, POS pull, KDS pull, with exactly-once semantics, dead-letter and backoff as for any order.
- **Security.** Snapshot signed or fetched over the authenticated channel only.
- **Tests required.** Spec 59 items 25, 26, 40 and spec 65: QR order created while Branch Core is down is delivered when it returns; missed SSE recovered by cursor; duplicate downlink no duplicate; entitlement revoked while offline stops accepting new QR management after grace; extend the existing chaos harness to include QR-source orders.
- **Dependencies.** P5, P6.
- **Acceptance.** The offline document states Option A as supported and Option B as not yet supported until P15; no text claims internet QR works offline.
- **Migration risks.** Older Branch Core/app versions ignore new roster fields (additive, safe); ensure old devices that only do legacy pulls still see QR orders during rollout.

### P8. Restaurant Admin UI

- **Objective.** A real QR Ordering section driven only by the API and entitlement result, replacing the local simulator and tier gates.
- **Spec sections.** 7, 8, 9, 31, 32, 46, 49.
- **Existing files.** `apps/restaurant-system/pos-admin/src/components/qr/*` (`QrOrderingModule.tsx` 2,648 lines, `QrCardDesignerModal.tsx`, `QrDishConfigModal.tsx`, `CustomerQrExperienceModal.tsx`), `pos-admin/App.tsx` nav and lock modal, `qrGuestClient.ts`, `qr_platform_sync.ts`.
- **Database.** None.
- **Backend/API.** Consumes P3 and P8 read models (dashboard numbers computed server-side from real orders and events; endpoint added in P3/P11 as needed).
- **Frontend.** Sections: Overview, Tables & QR, QR Generator, QR Orders, QR Settings. States: enabled shows real tables, active codes, today's QR orders, pending/completed, QR revenue (all from the backend); not entitled shows "QR Ordering 🔒 Not included in your current plan" (or "Available in higher plan") with a **View Plan** action and no fake purchase flow; the sidebar entry stays visible. Print/download: PNG, PDF, print-all with clear contrast and error correction, no internal ids. Remove hardcoded plan names, prices and the `db.license?.tier` checks.
- **Entitlement/plan.** UI reads the resolved entitlement endpoint (P1). No tier or price literal in the UI.
- **Sync.** Table creation stays an offline-capable synced action; QR generation and settings require the cloud and say so when offline (no fake offline QR).
- **Security.** All calls authenticated; nothing trusts client-side flags.
- **Tests required.** Component/behaviour tests with the API mocked at the HTTP boundary only; a real-browser pass (Playwright) through locked and enabled states for the three example plans; a static test that no price/tier literal remains.
- **Dependencies.** P1, P3, P5 (orders list), P11 (metrics endpoint).
- **Acceptance.** Locked and enabled states verified in a real browser; numbers match database counts in a test fixture; printed layout matches spec 32.
- **Migration risks.** Restaurants with tables/tokens created locally keep them (legacy tokens valid) but the UI must offer "regenerate to upgrade" and never silently change printed codes.

### P9. Customer QR web app (standalone)

- **Objective.** A small, fast, mobile-first public web app, separate from Restaurant Admin, using only the public API.
- **Spec sections.** 11 (URL design), 15, 19, 33, 34, 35, 50, 66, 67.
- **Existing files.** `GuestQrOrderingPage.tsx` (source of UX to port, not to keep in the admin bundle), `qrGuestClient.ts`, `packages/ui` components where suitable.
- **Database.** None.
- **Backend/API.** Consumes P4/P5. Public base URL and API base URL come from build/runtime configuration and the restaurant/platform settings, never localhost defaults; QR URLs are `https://<order-domain>/q/<publicToken>`.
- **Frontend.** New app (for example `apps/qr-guest`): restaurant identity, table, search, categories, items, modifiers, notes, sticky cart, checkout (name/mobile only when the restaurant requires them), payment method per settings, order status page by `publicOrderId`, unavailable/revoked/disabled states with the exact required message, MENU_ONLY table/order-type chooser. Cart and session in the browser only; refresh is safe; a submitted order is never recreated (idempotency key persisted with the cart). Uses no admin code, no Tauri/Android APIs.
- **Entitlement/plan.** Shows unavailable when the API says so.
- **Sync.** Polls order status with backoff; no sync engine.
- **Security.** No secrets in the bundle; CSP; no third-party trackers; cart cannot influence prices.
- **Tests required.** Spec 59 items 32, 33; browser test on a phone-sized viewport for the E2E in P13; performance budget (first menu render, image sizes, request count) recorded (spec 51).
- **Dependencies.** P4, P5.
- **Acceptance.** Customer page works end to end against a real backend with no hardcoded restaurant data; the admin bundle no longer contains the guest page.
- **Migration risks.** Already-printed QR codes point at the old admin-origin URL. Mitigation: keep the old route as a redirect to the new app (token preserved) for a documented period; regenerating a code produces the new URL form.

### P10. Super Admin UI for plans, features, overrides

- **Objective.** Super Admin configures QR entitlement only through the existing plan/feature/override screens; remove the duplicate QR override editor.
- **Spec sections.** 4, 5, 38, 49.
- **Existing files.** `cloud/super-admin-web/src/pages/QrOrdering/*` (`QrEntitlementEditor` writes the competing store), Feature Catalog page (Phase 11 of the earlier effort), Plans pages, `RestaurantDetailPage`.
- **Database.** None (uses P1).
- **Backend/API.** Uses existing plan/feature endpoints; the QR-specific PATCH override endpoint is replaced by the standard feature override with audit.
- **Frontend.** Plan comparison shows QR Ordering as a real row with lock state per plan from data; restaurant detail shows effective entitlement with source (plan/override) and expiry; QR pages keep platform-wide metrics but computed from real orders.
- **Entitlement/plan.** Overrides sit on top of the plan and never modify the plan (spec 38).
- **Sync.** Roster refresh already propagates changes.
- **Security.** Platform permission required; every change audited (`QR_FEATURE_ENABLED`, `QR_FEATURE_DISABLED`).
- **Tests required.** API tests for override apply/revoke/restore; browser pass showing three plans; no price/tier literals.
- **Dependencies.** P1.
- **Acceptance.** Editing the feature row for a plan flips QR for its restaurants with no code change.
- **Migration risks.** Existing `PlatformSetting` overrides must be visible and editable in the new place before the old editor is removed.

### P11. Security, rate limiting, analytics

- **Objective.** Harden the public surface and compute honest analytics.
- **Spec sections.** 30, 47, 57.
- **Existing files.** `common/throttle.ts`, guest controller, `QrEvent` (P2), reports module.
- **Database.** `QrEvent` indexes and retention.
- **Backend/API.** Throttles per IP and per token for resolve, menu, order, status; brute-force detection on unknown tokens (progressive delay); quantity and payload bounds; CORS allow-list for the public order origin; analytics endpoints for scans, sessions, orders, revenue, average order value, orders by table/branch/time, computed from `QrEvent` and `SyncedOrder`; privacy: no IP or device fingerprints stored beyond throttling, session ids random and short-lived.
- **Frontend.** Analytics views in P8 consume these.
- **Entitlement/plan.** `qrAnalytics` is a feature limit from P1.
- **Sync.** None.
- **Security.** IDOR, token guessing, cross-restaurant and cross-branch, table manipulation, price/quantity abuse, unauthorized feature use each have a negative test.
- **Tests required.** Spec 59 items 35, 36, 37; token brute force is throttled; metrics equal database truth; no fabricated numbers when there is no data.
- **Dependencies.** P4, P5.
- **Acceptance.** All negative security tests pass; limits documented.
- **Migration risks.** Tight limits could block a busy restaurant's shared Wi-Fi (many phones share one IP): limits must be per token and per client session as well as per IP, and tuned from real traffic.

### P12. Hardcoding and duplicate-system removal

- **Objective.** Delete the leftovers that P1-P11 replaced.
- **Spec sections.** 54, 69, 70, 71.
- **Existing files.** `QrOrderingRepository` and its local simulator, client token minting (`jv_qr_tbl_`), `db.ts` seed tokens, `qr_order_url.ts` default, `qr_platform_sync.ts` usage reporting, `PlatformSetting` QR override rows, legacy `qrTableOrdering` JSON reads, `qr-guest` aliases, the `syncQrTableLink` compatibility mode.
- **Database.** Drop the compatibility columns/settings after a verified release.
- **Backend/API / Frontend.** Remove the deprecated endpoints after the sunset date; remove local QR order simulation and count-based numbers (`1040 + count`).
- **Entitlement/plan.** Remove tier/price literals everywhere QR touches.
- **Sync.** Confirm no QR-specific sync code remains.
- **Security.** Removal of client-minted tokens closes H6.
- **Tests required.** Static checks (CI) for `planTier ===`, price literals, `localhost` defaults in production code, `mock`/`demo`/`TODO` in QR paths; test that dev seed data is only reachable in development.
- **Dependencies.** P3-P11 shipped and verified.
- **Acceptance.** Spec 73 repository-wide search returns no production hits.
- **Migration risks.** Removing the aliases and legacy token acceptance breaks old printed QR codes: gate the removal on the count of scans still using legacy tokens dropping to zero (`QrEvent` shows this).

### P13. Full test suites and E2E

- **Objective.** Complete the automated proof required by the spec.
- **Spec sections.** 59, 60, 61, 62, 63, 64, 65.
- **Existing files.** `cloud/api/test/*` harness, `tests/` root suite, Playwright.
- **Tests required.** All 40 listed in spec 59 mapped to files in `QR_ORDERING_TEST_PLAN.md`; E2E (spec 60): Super Admin creates restaurant, branch, three example plans, table 12, menu (Paneer Pizza ₹249, Cold Coffee ₹120), generates QR; anonymous customer opens the URL, sees the restaurant, table and menu, orders 2 pizzas and 1 coffee; exactly one order; POS shows NEW QR ORDER; KOT created; KDS shows it; KDS PREPARING then READY; customer status updates. Negative E2E (spec 61): change to a plan without QR: page unavailable, direct POST returns 403. Second negative (spec 62): body `restaurantId` of another restaurant is rejected. Multi-restaurant (63) and multi-branch (64) with identical table numbers. Offline sync (65) with pending event, ack, no duplicates, using the durable local database rather than localStorage as the transactional source.
- **Dependencies.** P0-P12.
- **Acceptance.** Every item passes; failing tests are reported, never skipped.
- **Migration risks.** None beyond test data isolation; use a dedicated database as the existing e2e suite does.

### P14. Documentation, final audit, report

- **Objective.** Documents and honest final status.
- **Spec sections.** 53, 66, 68, 72, 73, 74.
- **Deliverables.** `QR_ORDERING_CURRENT_STATE.md` (from P0), `QR_ORDERING_ARCHITECTURE.md`, `_FLOW.md`, `_ENTITLEMENTS.md`, `_API.md`, `_SECURITY.md`, `_TEST_PLAN.md`, `_OFFLINE_BEHAVIOR.md` with the required diagrams (Super Admin to Plan to License to Entitlement to Restaurant to Branch to Table to QR Token to Customer to Order to Branch Core to POS to KOT to KDS) and the data-ownership table (cloud, Branch Core, device, customer browser); final audit run (typecheck, lint, unit, integration, API, entitlement, security, E2E, sync); repository-wide search from spec 73; `QR_ORDERING_IMPLEMENTATION_REPORT.md` with the 18 headings and the PASS/FAIL table where **PASS is written only for what a test proves**.
- **Dependencies.** P13.
- **Acceptance.** Definition of Done (spec 72) checklist, every box either verified with evidence or listed as a remaining issue. Packaging readiness is reported as architecture only; no EXE/APK/AAB/installer exists.
- **Migration risks.** Documentation of required migrations (P1 override migration, P2 branch backfill, P4 modifier backfill, P5 seq backfill, P6 KOT numbering, P9 old URL redirect, P12 alias removal) with an ordered runbook.

### P15 (optional, after P14). LAN QR through Branch Core (Option B)

- **Objective.** Let customers on restaurant Wi-Fi order when the internet is down, honestly and securely.
- **Spec sections.** 25, 26.
- **Existing files.** `packages/branch-core/src/server.ts` (already serves apps at `/apps/<name>/`, discovery, TLS option), roster/entitlement snapshot.
- **Backend/API.** Core exposes the same public endpoints from cached `QrCode` rows and its entitlement snapshot, serves the customer app from `/apps/qr/`, ingests QR orders through its normal `ingestOrders` (sequence, exactly-once, uplink to cloud). QR codes printed for LAN use a resolvable local hostname or a captive redirect (design decision needed: local DNS name vs. the cloud URL that redirects on the LAN).
- **Security.** Same allow-list and throttles; the local endpoint must never expose operational APIs; TLS with pinned certificate where practical.
- **Tests required.** Internet down + core up: customer on LAN orders; order reaches POS/KDS; reaches cloud once when the internet returns; entitlement snapshot expiry honored.
- **Dependencies.** P7, P9.
- **Acceptance.** Documented limits (customer must be on the restaurant network; a QR that points at the internet cannot work with no internet).
- **Migration risks.** Two URLs for one QR; certificate trust on customers' phones. Delivered only if the owner wants it.

---

## 5. Cross-phase rules

1. Each phase ships with its own tests and is not "done" while any of them fails or is skipped.
2. Every migration is written by hand, forward-only, applied to a copy of realistic data first, and documented with a rollback note.
3. No phase adds a second order store, sync mechanism, entitlement resolver, token store or menu store. A reviewer rejects any change that does.
4. Frontend flags are presentation only; every gate has a backend equivalent with a test that calls the API directly.
5. Dev seed data may exist only behind a development switch and is never read by production code paths.
6. No EXE, APK, AAB, Tauri or installer work at any point in this plan.

## 6. Recommended first step

**P0, then P1.** P0 is small and decides how bad A1-A3 really are. The most valuable single fix is A1 (QR orders missing from the sequence cursor), but it should not be patched in isolation: P5 fixes it properly through the shared ingest path after P1-P4 give it a sound entitlement check, token model and menu. If A1 or A3 is confirmed on the running system, a narrow hotfix (assign `seq`, publish the realtime event, and refuse token re-pointing) can be released ahead of P5 with tests, without changing the architecture.

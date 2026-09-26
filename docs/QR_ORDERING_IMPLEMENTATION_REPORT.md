# QR Ordering: Implementation Report

Date: 2026-09-26. Specification: `docs/qr.implemtantion.md`. Plan: `docs/QR_ORDERING_EXECUTION_PLAN.md`. No EXE, APK, AAB, Tauri package or installer was created.

## QR ORDERING STATUS

| Area | Status | Evidence |
|---|---|---|
| Entitlement | **PASS** | one server authority; three example plans, renamed/repriced plans, upgrade, downgrade, override, expiry, suspended restaurant, direct-POST bypass, all in `qr-ordering-saas.e2e.spec.ts` |
| QR Generation | **PASS** | server-minted 192-bit tokens; generate / regenerate / revoke / disable / enable; limits; audit; print data (tests). PNG/PDF drawing itself is browser code and was not exercised |
| Customer Ordering | **PASS** | API tests (pricing, tampering, idempotency, settings, menu-only, limits) **and a real-browser run** of the guest page against the real API (menu, required and optional modifiers, server quote, order placed, refresh) |
| POS Integration | **PASS for the pipeline; UI not browser-verified** | order reaches every POS of the branch by cursor with source QR; first-accept-wins claim; only the winner prints (cloud and Branch Core, `qr_order_desk`). The POS "New QR orders" inbox is type-checked but was not driven in a browser |
| KOT | **PASS** | deterministic ticket ids and numbers, identical on every device, add-on rounds, no duplicates (`qr_order_desk`) |
| KDS | **PARTIAL** | the KDS role is exactly a terminal pulling the order and deriving the tickets (tested); the KDS screen was not driven in a browser |
| Sync | **PASS** | shared ingest gives sequence, branch, realtime; missed wake-up recovered by cursor; replay changes nothing; Branch Core claim rule |
| Multi-Tenant | **PASS** | two restaurants with the same table number and different menus; row-level security on new tables; admin isolation |
| Multi-Branch | **PASS** | branch-scoped delivery, branch-restricted dishes, table-in-another-branch refused |
| Security | **PASS for the controls listed in `QR_ORDERING_SECURITY.md`** | tests for each; rate-limit counters are per API process |
| E2E | **PARTIAL** | full chain proven backend-to-device and guest page in a real browser; the chain "Restaurant Admin console → POS inbox → KDS screen" was not run in a browser |
| Packaging Readiness | **PASS** | no QR logic touches a browser-specific, Tauri or Android API; the customer app is a plain web app; nothing packaged |

Test results at the end of the work: root suite **158 files, 1,114 tests passing**. Cloud API suite **764 passing, 5 skipped, 2 failing**: the two failures are the same two that were failing before this work (`rbac.e2e` activation-code leakage check, and `restaurant-identity-sync.e2e` whose setup still uses the removed single-step login). Type-checks are clean for the cloud API, Super Admin, Restaurant Admin, POS, KDS, Captain, both Kiosk apps and the customer app.

## 1. Existing implementation

See `QR_ORDERING_CURRENT_STATE.md`.

## 2. Problems found

* QR orders were written without a sequence number or realtime event, so a device reading by cursor never received them (**confirmed**).
* QR orders were not branch-bound.
* A platform-wide static modifier list and a fixed 5% tax priced every restaurant's QR orders.
* Three competing sources for "is QR on", including a `planTier === 'PRO'` default, and tier/price checks and copy in Restaurant Admin.
* Tokens were minted in the browser and, for tables without one, derived from the table number and id (**predictable**).
* A local simulator produced QR orders and metrics inside the admin app; usage shown to Super Admin was self-reported.
* The guest page shipped inside the admin application; the base URL defaulted to localhost.
* Every pulling device made its own kitchen tickets with `max + 1` numbers; nothing printed a QR order's kitchen ticket.
* Suspected token takeover across restaurants: **disproved**.

## 3. Architecture changes

One order pipeline (shared ingest), one entitlement authority, `QrCode` evolved from `QrTableLink`, the restaurant's own menu/modifiers/tax, deterministic tickets and a first-accept claim, server-measured analytics, a standalone customer app. See `QR_ORDERING_ARCHITECTURE.md`.

## 4. Database changes

Migration `20260926100000_qr_ordering_saas` (already applied to the development database): `QrTableLink` → `QrCode` (`publicToken`, `status`, `mode`, `version`, `revokedAt`, `lastScannedAt`, `metadata`, nullable `tableId`, one active code per table, indexes); new `QrSettings` and `QrEvent` with row-level security; `SyncedOrder.source`, `publicOrderId`, `qrCodeId` with backfill; sequence numbers assigned to existing QR orders; per-restaurant QR overrides moved from `PlatformSetting` to `ApplicationEntitlement`; restaurants that had QR through the old PRO default keep it; guessable legacy tokens revoked. `TAX_GROUP` added as a syncable entity type (no schema change).

## 5. API changes

`/api/v1/public/qr/*` (describe, menu, quote, order, status), `/api/v1/restaurant/qr/*` (entitlement, overview, branches, tables, generate, menu-codes, regenerate, revoke, disable, enable, print-data, orders, settings), route-scoped CORS, per-code rate limiting. `/qr-guest/*` kept as a deprecated adapter. See `QR_ORDERING_API.md`.

## 6. Entitlement changes

`ApplicationEntitlementsService.resolve()` and `appsForPlan()`; QR granted only by the plan's feature flag; per-restaurant override on the subscription's row; the old resolver, tier default and `PlatformSetting` store removed; `FeatureGuard` replaces an unused guard that compared plan JSON and printed a price. See `QR_ORDERING_ENTITLEMENTS.md`.

## 7. Restaurant Admin changes

New QR console (Overview, Tables & QR, QR Orders, QR Settings) driven only by the API; locked state with **View Plan**; nav badge from the server's answer (cached 7 days offline); print and PNG download; old 2,648-line module, card designer, dish config, preview and in-admin guest page deleted; old printed links redirect to the ordering site.

## 8. Customer QR changes

New `apps/qr-guest`: mobile-first, restaurant/branch/table header, search and categories, item options with required/optional rules, cart, server quote, checkout (name/phone by setting, menu-only chooser), order status with live steps, refresh-safe. Configuration-only addresses.

## 9. POS integration

"New QR orders" inbox (Accept / Decline) in the POS order list; accept is a claim; the winner prints; the existing list already labels and filters QR orders.

## 10. KOT integration

Ticket id `kot-<order>-r<round>[-station]`, number `KOT-<order number>[-n][-R<round>]`; the dish's kitchen station travels with the order line, so a QR order splits into the right tickets on every device.

## 11. KDS integration

Through the same cursor pull; tickets identical to POS's; kitchen status flows back and appears on the guest's page (verified live through the API).

## 12. Sync changes

Shared ingest (sequence, log, realtime), `acceptedBy` first-claim in cloud and Branch Core, kitchen station on pulled lines, modifier and tax groups published with the menu.

## 13. Security changes

See `QR_ORDERING_SECURITY.md`.

## 14. Test results

See above and `QR_ORDERING_TEST_PLAN.md`.

## 15. Remaining issues

1. **Online payment for QR is not offered.** The API refuses it and the setting cannot be enabled; guests pay at the counter. Adding it needs a verified gateway path tied to the QR order.
2. **Ordering over the restaurant LAN when the internet is down (plan phase 15) is not built.** The documented behaviour is that public QR ordering needs the internet.
3. The Restaurant Admin console, the POS inbox and the KDS screen were type-checked and covered by logic tests but **not driven in a real browser**; PNG/PDF output likewise.
4. The rate-limit counters are per API process; several API instances need a shared store.
5. There is no editor yet for a dish's `salesChannels` / `branchIds` or for per-branch QR settings (the API and menu logic honour them; the existing per-dish QR switch still works).
6. Restaurants must **publish their menu together with modifier and tax groups**. A dish that names a tax group the restaurant never published is not offered to guests, and a menu with no orderable dish shows "not available yet". A restaurant that used QR before this work must open Restaurant Admin once so its groups sync.
7. Plan comparison marketing copy in `packages/types/src/planFeatureCatalog.ts` and `packages/business/src/license_entitlements.ts` still describes plans by tier; it is presentational and was outside this work.
8. `npm run start:prod` points at `dist/src/main.js`; the current build writes `dist/cloud/api/src/main.js` (the layout changed before this work because the API build pulls in `packages/*`). Not changed here.
9. The two cloud test failures noted above are unrelated and were failing before.

## 16. Packaging readiness

QR business logic is in the cloud API and a framework-free client; the customer app is web-only; Restaurant Admin and POS call HTTP. Nothing QR-related depends on Tauri, Android or a browser-specific device API. No package was built.

## 17. Exact files changed

Cloud API: `prisma/schema.prisma`, `prisma/migrations/20260926100000_qr_ordering_saas/migration.sql`, `src/app.module.ts`, `src/main.ts`, `src/common/cors.ts` (+ `cors.spec.ts`), `src/common/guards/entitlement.guard.ts`, `src/modules/application-entitlements/application-entitlements.service.ts`, `src/modules/subscriptions/subscriptions.service.ts`, `src/modules/entity-sync/{entity-sync.service.ts,dto/push-entity-sync.dto.ts}`, `src/modules/order-sync/{order-sync.service.ts,order-sync.module.ts,dto/push-order-sync.dto.ts}`, `src/modules/payments/pricing.util.ts`, `src/modules/qr/*` (new: `qr.module.ts`, `qr.controllers.ts`, `qr-legacy.controller.ts`, `qr-public.service.ts`, `qr-admin.service.ts`, `qr-menu.service.ts`, `qr-settings.service.ts`, `qr-rate-limit.ts`, `qr.support.ts`), `src/modules/qr-ordering/*` (rewritten), `src/modules/qr-guest-ordering/*` (deleted); tests `qr-ordering-saas`, `qr-legacy-compat`, `qr-ordering`, `_live_fixture` (tool).

Packages: `packages/database/src/{repositories.ts (local QR simulator removed), db.ts (predictable tokens removed), collection_sync.ts, kitchen_routing.ts, index.ts}`, `packages/sync/src/{outbox.ts, qr_order_desk.ts, menu_sync.ts, index.ts}`, `packages/branch-core/src/core.ts`, `packages/types/src/domain.ts`, `packages/business/src/index.ts`; deleted `qr_order_url.ts`, `qr_platform_sync.ts`.

Apps: `apps/qr-guest/*` (new), `apps/restaurant-system/pos-admin/src/{App.tsx, main.tsx, cloud/cloudClient.ts, cloud/qrAdminClient.ts, components/qrconsole/*}` (old `components/qr/*` and `cloud/qrGuestClient.ts` deleted), `apps/restaurant-system/pos/src/components/orders/{PosOrdersView.tsx, QrOrdersInbox.tsx}`, `cloud/super-admin-web/src/{api/types.ts, pages/QrOrdering/*}`, root `package.json`.

Tests: `tests/{qr_order_desk,qr_guest_cart}.test.ts` (new); four local-simulator tests and the QR block of `security_audit_remediation.test.ts` removed (their cases are enforced and tested on the server).

Docs: this set (`QR_ORDERING_*.md`).

## 18. Migration requirements

Deploy in this order:

1. **Apply the migration** (`prisma migrate deploy`). It is forward-only, keeps existing tokens that are safe, revokes predictable ones, gives existing QR orders sequence numbers, and preserves QR access for restaurants that had it through the old PRO default. Take a database backup first.
2. **Deploy the API.** Set `QR_ORDER_BASE_URL` (the ordering website address; required in production) and, if the site is on another origin than that address, `QR_ALLOWED_ORIGINS`.
3. **Deploy the customer app** (`apps/qr-guest`) with `VITE_CLOUD_API_BASE_URL`, at the ordering website address.
4. **Deploy Restaurant Admin / POS / KDS** with `VITE_QR_ORDER_URL` on Restaurant Admin so old printed links forward to the new site. Restaurants open Restaurant Admin once so their modifier and tax groups publish.
5. Restaurants **regenerate** codes at their convenience (old codes keep working until then, except predictable ones, which were revoked); remove the `/qr-guest` adapter when the count of scans through old codes reaches zero (`QrEvent` shows it).
6. Super Admin reviews restaurants that kept QR through the PRO default, and turns it off where the plan should not include it.

## Errata (added after the follow-up audit)

`docs/QR_ORDERING_AUDIT_RESTAURANT_CONTROL_AND_SCALE.md` re-checked this work against the restaurant-control and multi-customer requirements and found that parts of the statuses above are too generous:

* **Customer Ordering PASS** covers pricing, validation and delivery. It does **not** mean the restaurant controls what the customer sees: the customer's modifier data is read from the restaurant's records, but **no Restaurant Admin screen or API can create or edit a modifier group or option** (only seed data exists), items are not returned in their configured order, and publishing does not freeze the menu the guest reads.
* Section 15 item 5 understates a regression: the first QR work **deleted the only editor of the per-dish QR switch** with the old module.
* Orders do **not** yet preserve option prices, tax rate or menu version (only option names and the line's total), and a device that pulls the order shows the options as +₹0.
* **Multi-Branch PASS** covers isolation; there is no branch-specific price.
* **Sync / Security PASS** hold for correctness at small scale; the per-code order limit (12/min) would reject a 100-customer table, and no load test exists.

The addendum to `QR_ORDERING_EXECUTION_PLAN.md` plans the fixes. These statuses are not upgraded until they are verified.

## Restaurant control and scale: implementation status (added after the fixes)

Everything below was verified by running the tests named next to it. Cloud suite: only the two failures that existed before this work remain (`rbac.e2e` activation-code leakage, `restaurant-identity-sync.e2e` old single-step login). Root suite: 159 files, 1119 tests pass. Typechecks: `cloud/api`, `pos-admin`, `qr-guest` clean; the 18 `tests/` type errors in `tsc -b` were present before this work.

### Done and tested

| Plan item | What now exists | Evidence |
|---|---|---|
| R2 published menu | `MenuSnapshot` table; publish builds, validates and freezes the menu (422 with reasons when a price is invalid or a group is inconsistent); guests read only the latest snapshot; a restaurant that never pressed Publish gets its first snapshot automatically; `GET /api/v1/menu/draft-status`; snapshots are immutable and cached by version | `qr-menu-control.e2e` (draft invisible until publish, unpublishable menu keeps the last good one live), `qr-ordering-saas.e2e` |
| R4 deterministic menu | Categories, dishes, groups and options come in the restaurant's configured order, then name, then id; menu etag is derived from the snapshot | `qr-menu-control.e2e` ("restaurant's own order") |
| R5 order-time snapshot | Each line keeps option id/name/group/price, base price, tax group, tax rate, inclusive flag, line tax and menu version; `SyncedOrder.menuVersion`; a device push without the snapshot cannot erase it; the device shows real option prices | `qr-menu-control.e2e` (price rise after ordering changes nothing), `packages/sync` mapping |
| R2/R7 stale menu | The guest sends the menu version; if a newer publish changed what they would pay, the order is refused with `409 MENU_CHANGED`; if not, it goes through | `qr-menu-control.e2e` |
| R3 (partly) authoring | Restaurant Admin: **Customisations & Tax** screen (modifier groups with priced, orderable, default-able options; tax groups; deletion safety), per-dish tax group, QR switch, position, min/max quantity, cooking-note switch; new dishes no longer get every group or a guessed GST; `Publish to guests` panel with draft status, blocking errors and warnings | `tests/menu_authoring.test.ts` (5), typecheck; the screens themselves were **not** exercised in a browser |
| R6 images | Pictures typed into the menu are validated (real PNG/JPEG/WebP/GIF, ≤ 1 MB, no SVG), stored once by SHA-256, referenced as `img:<hash>` in the snapshot and served with a one-year immutable cache; bad pictures are dropped with a warning and the dish stays | `qr-menu-control.e2e` (pictures, pure snapshot test) |
| R8 preview | `GET /api/v1/menu/preview?branchId=` returns what a branch guest would see from the draft and why each other dish is hidden; shown in the publish panel | `qr-menu-control.e2e` |
| R9 branch overrides | `PUT/GET /api/v1/menu/branch-overrides` (console only): per-branch price and availability, draft until published, priced into orders; UI in Customisations & Tax (shown when the restaurant has 2+ branches) | `qr-menu-control.e2e` |
| R7 (partly) guest app | Honours restaurant rules: pre-selected options, group help text, "Choose 1 to 3" wording, quantity limits, per-dish cooking-note switch, version sent with the order, MENU_CHANGED handling, picture addresses | typecheck only; **no browser test** |
| S2 sessions/privacy | `POST /public/qr/session` issues a stateless HMAC-signed session; a made-up or altered session is ignored; order references are 26 random characters (~128 bits), old 8-character references still resolve | `qr-ordering-saas.e2e`, `qr-scale.e2e` |
| S3 durability | Bounded jittered retry of transient database errors (safe because every order has an idempotency key); admission control with a wait limit that answers `503 BUSY` + `Retry-After` | `qr-scale.e2e` (unit-level plus 50 identical concurrent retries = one order) |
| S4 caches (menu only) | Built menus cached per `menu:{restaurant}:{branch}:{version}` (immutable, so never stale, tenant in the key) | covered by the menu tests |
| S5 pool | `DB_POOL_SIZE`, `DB_POOL_TIMEOUT_SECONDS`, `DB_TX_MAX_WAIT_MS`, `DB_TX_TIMEOUT_MS` | `qr-scale.e2e` (config functions) |
| S6 counters (no Redis) | Rate limits live in PostgreSQL (`RateCounter`, one atomic upsert per request); two API instances enforce one shared limit; if the counter store is unreachable the guest is let through | `qr-scale.e2e` (two real app instances), fail-open test |
| S7 limits | Defaults raised so a 100-guest table works (per code 60 orders/min, per address 1200/min); per-session limit counts only server-issued sessions; picture requests are not counted | `qr-ordering-saas.e2e`, `qr-scale.e2e` |
| S8 (partly) | `X-Request-Id` on every response, and HTTP logs never contain a QR token or order reference | `qr-scale.e2e` (pure functions); **not** exercised through `main.ts` |
| S9 (partly) acceptance | 100 concurrent orders on one table (all stored once, unique numbers, unique cursor positions, ~2.2 s on the test machine); 50 identical concurrent retries; 20 tables and two restaurants in parallel with no cross-restaurant or cross-branch landing; 500 menu reads in waves of 100 (~1.4 s) | `qr-scale.e2e` |
| S1 (partly) | Table ids can no longer collide; tables carry an optional `branchId` that syncs and is never erased by a copy without it; `GET /restaurant/qr/tables/:tableId/orders` | `qr-menu-control.e2e`; types |

The timing figures were measured against a local PostgreSQL on a development machine. They show the design does not serialise or lose orders under 100-way concurrency; they are **not** a production capacity claim.

### Not done (do not treat as complete)

* **R1** strict schemas for menu entities on entity-sync (the snapshot builder validates on publish, but entity push is still free-form).
* **R3** category editor fields (image, description, QR visibility, reorder), dish-level instructions text and option images/descriptions in the editor, moving the tax-group editor out of Kiosk Admin (Restaurant Admin now has its own, Kiosk Admin's is unchanged).
* **R7** restaurant-configurable copy, currency and a branding block; a real-browser walkthrough of the guest app and of the new Restaurant Admin screens.
* **R10** a full propagation matrix (edit in Restaurant Admin → publish → guest → POS/KDS) across every device app.
* **S0** a standalone load harness (only the in-suite acceptance tests exist).
* **S1** table state machine, table management inside the QR console (create/edit/enable/disable), print selected.
* **S4** resolution and entitlement caches (each scan still runs about eight small transactions).
* **S5** index review against `EXPLAIN` output.
* **S6** cross-instance realtime (the realtime bus is still in-process; only the counters are shared).
* **S8** a metrics endpoint (admission statistics exist in memory only).
* **S9** failure-injection beyond the counter store, 1000 concurrent resolutions, multi-hour soak.
* Legacy table fields `qrToken/qrCodeUrl/qrShortCode` still sync between devices (they are no longer used for ordering).

## Second pass: the previously "not done" items

Verification at this point: cloud suite has only the two failures that predate this work; root suite 160 files / 1122 tests pass; `cloud/api`, `pos-admin` and `qr-guest` typecheck clean. Migrations `…0927000000_qr_indexes`, `…010000_revoke_demo_qr_tokens`, `…020000_qr_branding` (and the earlier four) are applied to the dev and test databases. No EXE, APK or installer was built.

| Item | Now | Evidence |
|---|---|---|
| R1 | Menu records are validated when pushed (item price/quantity/channels, category, modifier group and options, tax percentages, table number/status); a bad record is refused with the reason, an older device's price-less dish is stored but blocks publishing | `qr-menu-control.e2e` |
| R3 | Category editor: picture, description, hide-from-QR, reorder (◀ ▶), edit button on the category chips; option notes in the group editor; `createCategory` no longer ignores "inactive" | `tests/menu_authoring.test.ts` (6); typecheck |
| R7 | Restaurant-set heading, welcome and footer text, order-button text, brand colour, logo (`QrBranding`), and the restaurant's own currency on the guest page; form in QR Settings | `qr-menu-control.e2e` (branding), **guest flow driven in a real browser** (below) |
| S0 | `cloud/api/scripts/qr-load.ts` load harness (CLI and library) | `qr-scale.e2e` (120 orders, 60 guests, 0 duplicates, ~128 orders/s on the dev machine) |
| S1 | Table state machine in the device repository; server validates table records; console can add, rename, switch on/off a table; print selected; open orders per table | `tests/table_state.test.ts`, `qr-menu-control.e2e` (table management) |
| S4 | Short-lived resolution cache (`QR_RESOLVE_CACHE_MS`, default 2 s) with immediate cross-instance invalidation on revoke/disable/regenerate/settings/table change | `qr-scale.e2e` (revoke and settings change on one instance stop another instance at once) |
| S5 | Two indexes added from reading the hot paths (`restaurantId+source+createdAt`, `restaurantId+tableId+status`); `EXPLAIN` on a near-empty test table is not conclusive, so this is analysis, not measured gain | `EXPLAIN` run, migration |
| S6 | Cross-instance realtime through PostgreSQL LISTEN/NOTIFY (no Redis): a wake-up raised on one API instance reaches devices on another; reconnects on loss | `qr-scale.e2e` (two live app instances) |
| S8 | Platform-only `GET /api/v1/qr-ordering/runtime` (outcomes, latency percentiles, admission and cache statistics; no tokens) | `qr-scale.e2e` |
| S9 | 1000 resolutions (cross-restaurant check), transient-failure retry ends in exactly one order, harness run | `qr-scale.e2e` |
| Legacy | Demo-data QR tokens that were public in the repository are removed from starter data, refused by the mirror, revoked by migration; devices no longer sync the retired table QR fields | `qr-menu-control.e2e` |

**Browser verification (Playwright, real API + Vite dev server):** the guest page loaded the published menu, showed the required "Size – Choose 1 (required)" and "Extras – Choose up to 2" rules with the Add button disabled until a size was chosen, priced Large + Extra cheese at ₹344, and placed the order: QR-1, ₹361.20 (₹344 + 5%), status screen shown.

### Third pass: closing the remaining list

* **Rate limits are now sliding**, not fixed buckets: a burst that straddles a minute boundary is counted together (`qr-scale.e2e`, clock-pinned test).
* **Plan, subscription, application-entitlement, restaurant/branch and platform QR changes flush the resolution cache on every instance immediately** (`qr-scale.e2e`: entitlement switched off by platform staff stops a cached instance at once).
* **Realtime relay gaps heal themselves**: after the PostgreSQL relay reconnects, every connected device is told once to pull orders, inventory and menu, so a gap costs one extra pull and never a missed change (`qr-scale.e2e`).
* **Device end of the QR path** (R10): a cloud-created QR order arrives on a device with real option prices, groups, tax and menu-version snapshot, and a later kitchen-status push carries them back intact (`tests/qr_order_propagation.test.ts`).
* **Restaurant Admin screens driven in a real browser** (real API, Vite dev server, owner sign-in, device activation): Customisations & Tax lists the synced groups and taxes; a new group was created and **published through the UI** (version 1, "Up to date"); branch prices list both branches; a table was added through the QR console (multi-branch guard asked for a branch first), its QR generated, and the branding form saved (verified on the server); the category editor opens with picture, description and QR-visibility controls.
* **The two failures that predated this work were test bugs and are fixed**: `rbac.e2e` created rows outside row-level security; `restaurant-identity-sync.e2e` used the old one-step platform login. Cloud suite is now fully green: 98 files, 807 tests (1 skipped by design). Root suite 161 files, 1124 tests.

### What remains, stated plainly

* Timing figures are development-machine measurements, not production capacity; the design (shared counters, admission control, retry, caches) is what scales, and the harness (`cloud/api/scripts/qr-load.ts`) is how to measure a real deployment.
* Not exercised in a browser: dragging through every field of every new Restaurant Admin form (dish tax/QR/quantity fields, per-option notes, logo upload, branch price edits). Their logic and endpoints are covered by tests; the screens render and the flows above were driven end to end.
* The realtime relay and rate counters depend on PostgreSQL being reachable; both degrade safely (local delivery only; guests let through) rather than failing requests.
* Starter data still seeds a "Restaurant Standard GST (5%)" tax group on a new device; it is now visible and deletable in Customisations & Tax.

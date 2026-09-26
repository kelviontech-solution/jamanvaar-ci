# QR Ordering: Current State (audit, before the work)

Written from the repository as it stood on 2026-09-26, before any QR change. It is kept as the record of what was found. What changed is in `QR_ORDERING_IMPLEMENTATION_REPORT.md`.

## 1. What already existed

* Cloud: `QrTableLink` (token → restaurant/table), public guest endpoints `/api/v1/qr-guest/*`, a Super Admin QR module (`qr-ordering`) with a per-restaurant entitlement projection and usage, server-side pricing (`priceCart`), orders written to `SyncedOrder`.
* Entitlements: `ApplicationEntitlement` with an `AppCode.QR_ORDERING` row per subscription; a Feature catalog bridging `qrTableOrdering` to that application; `isAppEnabled` / `assertAppEnabled`; an offline-policy module.
* Restaurant Admin: a 2,648-line QR module with a card designer, dish configuration, a customer preview, and a 1,237-line guest ordering page **served inside the admin application**.
* Super Admin: QR pages (restaurant list, detail, entitlement editor).
* Devices: a local database model of QR tables, tokens and orders; sync of `DINING_TABLE` (with `qrToken`) to the cloud.

## 2. What worked

Token lookup, server-side pricing, idempotency by the client's key, refusal of unknown items and options, a disabled or superseded token, and a CORE plan being refused (8 + 4 tests). Orders went into the same `SyncedOrder` table POS and Kiosk use.

## 3. What was hardcoded

* A platform-wide **static modifier catalogue** (Spice Level, Portion Size, Add-Ons with fixed prices) in the guest service.
* A fixed **5% tax** for every restaurant.
* `planTier === 'PRO'` in the entitlement resolver (and table limits 50 / 15 by tier); `db.license?.tier !== 'PRO'` and "₹7,000 / ₹5,000" copy in Restaurant Admin.
* Tokens **minted in the browser** and, for tables without one, **derived from the table number and id** (predictable).
* `http://localhost:5176` as the guest base URL; `http://localhost:4000` as the guest API default.
* Local order numbers starting at `1040 + count`; a name-based kitchen-station heuristic (naan → Tandoor).

## 4. What was mocked

The customer preview and the guest flow in Restaurant Admin ran against a **local simulator** (`QrOrderingRepository`, ~840 lines) that created QR orders in the device's own database. QR usage shown to Super Admin was whatever the admin app reported about itself.

## 5. What was missing

Sequence numbers and realtime events for QR orders; branch enforcement; a first-class `source` column; QR settings; scan/order analytics events; audit of QR administration; a public order reference; a menu endpoint and menu version for guests; menu-only codes; a standalone customer app; a single entitlement authority; a documented offline stance; deterministic kitchen tickets and a single-terminal accept.

## 6. APIs that existed

`GET /qr-guest/session?token`, `POST /qr-guest/orders`, `GET /qr-guest/orders/:externalOrderId?token`; platform `qr-ordering/*`; tenant `qr-ordering/entitlement`, `qr-ordering/usage`.

## 7. Database entities that existed

`QrTableLink`, `SyncedOrder` (no source, sequence missing for QR rows), `SyncedEntity` (menu, categories, tables), `ApplicationEntitlement`, `PlatformSetting` (QR overrides and usage), `MenuPublication`, `Feature`.

## 8. Frontend routes that existed

Restaurant Admin `/?qrTable=&token=` → the guest page; the QR module tab; Super Admin QR pages. No standalone customer site.

## 9. Authentication that existed

Guest: the token only. Restaurant Admin: device credential. Super Admin: platform login.

## 10. Plan entitlement system that existed

A central service existed but QR bypassed it: three sources (plan JSON flag, `ApplicationEntitlement`, a `PlatformSetting` override) plus a tier default.

## 11. POS integration that existed

The order reached POS only through the legacy timestamp pull. Every pulling device created its own kitchen tickets with `max + 1` numbers.

## 12. KDS integration that existed

Through the same device pull and locally created tickets; no QR-specific handling.

## 13. Synchronization that existed

Shared order sync (event ids, gapless sequence, realtime, Branch Core) existed, and QR orders **bypassed it**: written without a sequence number and without a wake-up.

## 14. What had to be redesigned

Entitlement (one authority); code storage and minting (server); order creation (shared ingest); the customer menu (restaurant's own modifiers and taxes); kitchen tickets and acceptance; analytics; the customer page (out of the admin bundle); the local simulator (removed).

## Findings verified against the running system

| Suspected | Verdict |
|---|---|
| QR orders missing from the sequence-cursor pull | **Confirmed** (fixed) |
| QR order visible to devices of other branches | Confirmed by design of the pull filter with a null branch (fixed: branch is required) |
| Another restaurant re-pointing a token by pushing a table | **Disproved**: the tenant boundary and unique index prevent it; a regression test keeps it that way |
| Predictable tokens for tables without one | **Confirmed** (fixed: refused and revoked) |

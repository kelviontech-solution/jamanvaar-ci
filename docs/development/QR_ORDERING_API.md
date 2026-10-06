# QR Ordering: API Contract

Base: `/api/v1`. All money in responses is in rupees; all identifiers a guest can see are random references. Every error body is `{ statusCode, message, code? }`.

## Public (customer) API: no login

Authentication is the token in the path. Restaurant, branch and table are derived from it on the server; **a body naming any of them is rejected (400), not ignored**. CORS: only the ordering website's origin, without credentials. Optional header `X-QR-Session` (8–64 random characters) groups analytics events.

| Method & path | Purpose | Success |
|---|---|---|
| `GET /public/qr/:token` | Who is this code | `{ restaurant:{name,address?,city?}, branch:{name}, mode, table:{displayNumber,capacity?}\|null, ordering:{enabled, menuReady, menuVersion, settings:{allowCustomerNotes, allowModifiers, allowCash, allowOnlinePayment, showOrderStatus, requireCustomerName, requireCustomerPhone}} }` |
| `GET /public/qr/:token/menu` | The branch's menu | `{ menuVersion, etag, categories[], items[], modifierGroups[] }`, `ETag`; `304` when `If-None-Match` matches |
| `POST /public/qr/:token/quote` | Server price, nothing created | body `{ items:[{itemId, quantity, optionIds[], note?}] }` → `{ lines[], subtotal, tax, total }` |
| `POST /public/qr/:token/orders` | Place an order | body `{ items[], paymentMethod:'CASH_AT_COUNTER', customerName?, customerPhone?, orderNotes?, orderType?, tableNumber?, idempotencyKey }` → `201 { publicOrderId, orderNumber, status, total, table, placedAt }` |
| `GET /public/qr/orders/:publicOrderId` | Customer-safe status | `{ publicOrderId, orderNumber, status: RECEIVED\|PREPARING\|READY\|COMPLETED\|CANCELLED, total, table, placedAt }` |

Order body rules: `items` 1–50 lines, quantity 1–50, `optionIds` ≤ 30, notes ≤ 500, `idempotencyKey` 8–80. `orderType` and `tableNumber` are only for MENU_ONLY codes (`DINE_IN` needs a table number). Unknown keys → 400.

### Refusals

| Status | `code` | Meaning |
|---|---|---|
| 400 | `INVALID_QR` | malformed token |
| 404 | `QR_NOT_FOUND` | no such code (also counts toward the address's failed-lookup limit) |
| 410 | `QR_REVOKED`, `QR_DISABLED` | "This QR code is no longer valid." |
| 410 | `QR_BRANCH_MISSING`, `RESTAURANT_INACTIVE`, `BRANCH_INACTIVE`, `TABLE_INACTIVE`, `ORDERING_OFF`, `MODE_OFF`, `MENU_NOT_PUBLISHED` | "QR Ordering is currently unavailable for this restaurant." |
| 403 | `ENTITLEMENT_REQUIRED` | the plan does not include QR ordering |
| 400 | (validation) | unknown/unavailable item, bad option, missing required choice, quantity, settings (notes/modifiers off, name/phone required) |
| 410 | (limit) | daily QR order limit reached |
| 429 | `RATE_LIMITED` | see the security document |

## Restaurant API: Restaurant Admin console only

Authenticated as the restaurant's own Restaurant Admin device (`Authorization: Bearer <device token>`). The restaurant is the device's; there is no restaurant id in any request. Other device types get 403. Reads work when QR is locked (so the screen can explain); changes need the entitlement (403 `ENTITLEMENT_REQUIRED` otherwise).

| Method & path | Purpose |
|---|---|
| `GET /restaurant/qr/entitlement` | `{ enabled, reason, source, limits, validUntil, planName, lockedMessage }` |
| `GET /restaurant/qr/overview` | tables, active codes, today's scans, orders (placed / pending / completed), sales, paid sales, average order, orders by table, failed attempts, whether the ordering site address is configured |
| `GET /restaurant/qr/branches` | branches for the code branch picker |
| `GET /restaurant/qr/tables` | every table with its current code `{status, version, branchName, lastScannedAt, url}` |
| `POST /restaurant/qr/tables/:tableId/generate` | body `{ branchId?, mode? }` → the new code. 409 if the table already has an active code |
| `POST /restaurant/qr/menu-codes` | body `{ branchId, label }`: a MENU_ONLY code |
| `POST /restaurant/qr/codes/:id/regenerate` | revoke and replace atomically (`version + 1`) |
| `POST /restaurant/qr/codes/:id/revoke` \| `disable` \| `enable` | state changes (revoked codes cannot be changed) |
| `GET /restaurant/qr/codes/:id/print-data` | what the card prints: restaurant name, branch, table label, address, tagline; no internal ids |
| `GET /restaurant/qr/orders?branchId=&limit=` | QR orders, newest first |
| `GET /restaurant/qr/settings`, `PUT /restaurant/qr/settings?branchId=` | the settings (below). `allowOnlinePayment: true` → 409 |

**Tables are created through the existing Floor / Tables screen (an offline-capable synced action), not by this API.** The specification's `POST /restaurant/qr/tables` is therefore intentionally absent: a table has to be creatable with no internet, and QR is a cloud feature layered on the table that already exists.

### Settings

`orderingEnabled`, `tableOrderingEnabled`, `menuOnlyEnabled`, `allowCustomerNotes`, `allowModifiers`, `allowCash`, `allowOnlinePayment` (cannot be enabled yet), `showOrderStatus`, `autoAccept` (send straight to the kitchen), `requireCustomerName`, `requireCustomerPhone`. Restaurant-wide, with an optional per-branch override.

## Platform (Super Admin)

`GET /qr-ordering/restaurants`, `/metrics`, `/restaurants/:id`, `/:id/usage`, `/:id/audit`; `PATCH /qr-ordering/restaurants/:id/entitlement` writes the restaurant's override onto its subscription's entitlement row (`qrEntitled`/`qrOrderingEnabled`, `maxActiveTables`, `maxOrdersPerDay`, feature flags). Usage is computed from real orders and codes.

## Deprecated

`GET /qr-guest/session`, `POST /qr-guest/orders`, `GET /qr-guest/orders/:id`: an adapter over the services above, for the guest page that older printed codes open (`/?qrTable=&token=` on the admin origin, now a redirect to the ordering site). It adds no logic of its own and is removed when no active code uses it. `POST /tenant/qr-ordering/usage` still exists for older Restaurant Admin builds; it ignores its body and answers with what the server measures.

# QR Ordering: Security

The customer endpoints are public and unauthenticated, so the controls below are on the server and each has a test in `cloud/api/test/qr-ordering-saas.e2e.spec.ts` unless noted.

## Identity and isolation

| Threat | Control |
|---|---|
| **Token guessing** | 192-bit random tokens (URL-safe, 32 characters); no table number, restaurant or sequence inside. Failed lookups per address are limited (30/min); further requests from that address get 429 until the window passes. Uniform message for every unavailable state. |
| **Guessable legacy tokens** | The old client derived a token from table number + id for tables that had none (`jv_qr_tbl_<n>_<id>`), a predictable value. The migration revokes them and the server refuses to mirror them (`qr-legacy-compat` spec). Only randomly generated legacy tokens (144 bits of hex) keep working, until regenerated. |
| **Cross-restaurant / cross-branch access (IDOR)** | Restaurant, branch and table come only from the token. A body naming them is rejected. The menu, the modifiers, the tax groups and the order are all read and written under the token's restaurant (row-level security), branch-scoped. A table that claims another branch cannot be opened through this code. |
| **Token takeover** | Terminals cannot mint, change or re-point a code. The legacy mirror is `INSERT … ON CONFLICT DO NOTHING`, so it can never overwrite a token, whoever owns it (proven not exploitable, `qr-legacy-compat`). |
| **Revoked / regenerated codes** | Checked on every request; regenerate revokes the old code in the same transaction. |
| **Tenant boundary of the admin API** | Restaurant Admin device only; the restaurant is the device's; another restaurant's code id is a 404; a POS terminal gets 403. |

## Integrity of orders

| Threat | Control |
|---|---|
| **Price / total tampering** | The client sends identifiers and choices only. The server prices every line from the restaurant's own data (paise, its own tax groups, tax-inclusive handled). A price, total, or unknown field in the body is a 400. |
| **Invalid items** | Unknown, other-restaurant, sold-out, POS-only (channel), branch-restricted, or unpriceable (unpublished tax group) dishes are refused. Options must belong to that dish; required choices and min/max are enforced. |
| **Quantity abuse** | 1–50 per line, ≤ 50 lines, notes ≤ 500. |
| **Duplicate submission** | Idempotency key scoped to the restaurant and code; per-order lock and unique index; verified with a double submit and four concurrent identical requests. |
| **Daily limit overshoot** | Counted inside the order's transaction under a restaurant lock. |
| **Fake payment** | Orders are created unpaid, cash at counter only. Online payment cannot be requested (400) or enabled (409). The status shown to guests never says "paid". |
| **Unauthorized feature use** | Entitlement is asked of the server on every request, including a direct POST that bypasses the page (403). |

## Abuse protection (`qr-rate-limit.ts`)

Per address (all requests 600/min, failed lookups 30/min), per code (300 requests/min, 12 orders/min), per browser session (6 orders/min), per order (120 status polls/min). Limits are per code and session, not one blunt per-address number, so a restaurant's guests sharing one router are not blocked together. Counters are in the API process; several API instances each limit on their own (a shared store is the next step for a multi-instance deployment).

## Privacy

Public responses contain no restaurant/branch/table/order internal ids, no device or staff data, no secrets (asserted by test). Analytics store event type, code, branch, time and a random per-tab session id; no address, device fingerprint or personal data. The order's customer name and phone are stored on the order (they are the restaurant's data) and never returned to the public API.

## Transport and browser

* CORS: the public routes accept only the ordering website's origin, without credentials; the credentialed console API never accepts it (`cors.spec.ts`).
* The customer app holds no secrets and calls only the public API; it is separate from Restaurant Admin, so a guest never downloads the admin application.
* The API base and the ordering site address are configuration (`VITE_CLOUD_API_BASE_URL`, `QR_ORDER_BASE_URL`); there is no built-in production address.

## Audit

`QR_CREATED`, `QR_REGENERATED`, `QR_REVOKED`, `QR_DISABLED`, `QR_ENABLED`, `QR_SETTINGS_CHANGED`, `QR_FEATURE_ENABLED`, `QR_FEATURE_DISABLED` with actor, restaurant, target and details.

## Known limits

* Rate-limit counters are per process.
* The ordering site must be served over HTTPS in production (a deployment matter).
* Cash-only means an abusive guest can place an unpaid order; the per-code, per-session and daily limits, and the counter's Decline, are the controls.

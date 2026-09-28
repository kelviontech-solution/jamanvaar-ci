# Cashfree — APIs this system actually uses

Verified against Cashfree's public documentation while building the integration. Only endpoints that `cloud/api/src/modules/payments/cashfree-gateway.service.ts` calls are listed. Nothing here is assumed from older Easy Split behaviour.

## Authentication and environment

- Headers on every call: `x-client-id`, `x-client-secret`, `x-api-version` (default `2025-01-01`, overridable via `CASHFREE_API_VERSION`), `Content-Type: application/json`.
- Base URL: `https://sandbox.cashfree.com/pg` when `CASHFREE_ENVIRONMENT` is not `production`, else `https://api.cashfree.com/pg`. The environment is one server-side setting, so sandbox and production credentials can never be mixed by a client.
- All credentials are server-side environment variables: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_ENVIRONMENT`, `CASHFREE_API_VERSION`, `CASHFREE_WEBHOOK_NOTIFY_URL`. Unconfigured means every gateway method throws `ServiceUnavailableException` naming the missing variable; the app still boots.
- Cashfree's newer docs show `x-api-version: 2026-01-01` on some split endpoints. The default here is still `2025-01-01`; set `CASHFREE_API_VERSION` when you want to move, and re-run the sandbox tests first.

## Endpoints

| Purpose | Method + path | Used by | Notes |
|---|---|---|---|
| Create order | `POST /orders` | `createOrder` | Sends `order_id`, `order_amount` (rupees, from integer paise), `customer_details`, optional `order_meta.notify_url`, and **`order_splits: [{ vendor_id, percentage }]`** when the restaurant has a vendor. Without `order_splits` Cashfree settles 100% to the platform master account. |
| Get order | `GET /orders/{order_id}` | `getOrderStatus` | Provider-side status verification. |
| Create refund | `POST /orders/{order_id}/refunds` | `createRefund` | `refund_id` is our own `Refund.id`. Cashfree reverses the vendor's share proportionally to the original split, whether the vendor has already been settled or not, so no split-aware refund code is needed here. |
| Create vendor | `POST /easy-split/vendors` | `createVendor` | `vendor_id` must be alphanumeric/underscore, so it is derived as `rest_<restaurantId without hyphens>`. Requires `kyc_details.account_type` and `pan`; exactly one of `bank` or `upi`. |
| Update vendor | `PATCH /easy-split/vendors/{vendor_id}` | `updateVendor` | Used on every re-approval after the first; `vendor_id` is in the path, never the body. |
| Get vendor | `GET /easy-split/vendors/{vendor_id}` | `getVendorStatus` | Cashfree's own async verification state (`IN_BENE_CREATION`, `ACTIVE`, `ACTION_REQUIRED`), stored separately from our own connection status. |
| Split and settlement details | `GET /easy-split/orders/{order_id}/split` | `getOrderSplitDetails` | Used by the reconciliation job. Response is read as `splits[].vendor_id` and `splits[].status`. |

## Known limits and open items

- `business_type` has no authoritative enum in the docs found; it is passed through verbatim and Cashfree validates it.
- The Cashfree response shape for `GET .../split` was read defensively (`splits` array, `vendor_id`, `status`). Confirm real field names against a sandbox response and adjust `getOrderSplitDetails` if they differ. Reconciliation only treats `SETTLED`, `PENDING`, `PROCESSING` as known-good, so an unfamiliar status shows up as an exception rather than being silently accepted.
- Per-restaurant independent merchant accounts (instead of one platform merchant with vendors) need Cashfree Partner approval, which JAMANVAAR does not have. The connection model has `connectionType` so this can be added without a schema rewrite.
- Settlement timing (instant vs T+1) is decided by Cashfree per vendor schedule; this system does not control it.

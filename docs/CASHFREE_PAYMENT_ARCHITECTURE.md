# Cashfree payment architecture

The backend is the only authority on payment state. No kiosk, POS, or browser can mark anything paid.

```
Customer -> Kiosk -> POST /api/v1/payments/orders (device token)
                       |  server prices the cart from MenuSnapshotItem (never trusts a client amount)
                       |  resolves commission (restaurant override -> platform default -> 0), snapshots it
                       |  creates Order + PaymentTransaction (CREATED)
                       |  POST Cashfree /orders with order_splits -> paymentSessionId
                       v
Kiosk -> POST /payments/:id/qr  (only after the cart is placed and the order exists)
                       |  server calls Cashfree /orders/sessions with channel "qrcode"
                       |  returns the QR image payload; the kiosk only renders it (3 minute window)
                       v
                 Customer scans the QR with any UPI app -> pays
                       v
Cashfree -> POST /api/v1/payments/cashfree/webhook
                       |  verify HMAC signature over raw body + 5-minute freshness
                       |  dedupe on providerEventKey (unique)
                       |  cross-check amount / currency / restaurant
                       |  PaymentTransaction -> SUCCESS, Order -> PAID (write-once terminal states)
                       v
Kiosk polls GET /payments/:id/status every 2 s (reflects what the webhook recorded, never decides)
Kiosk sees SUCCESS -> creates the token and prints the KOT locally
Kiosk -> POST /payments/:id/fulfilled   (server stamps fulfilledAt; this closes the loop)
POS / KDS receive the order through the existing order-sync path
                       v
Cashfree settles vendor share; JAMANVAAR keeps the commission portion
                       v
Job 'payment-reconciliation' (every 15 min) compares recent SUCCESS payments with Cashfree's split records
                       v
Super Admin / Kiosk Admin / Restaurant Admin dashboards read the ledger
```

## Where each hop lives

| Hop | Code |
|---|---|
| Order + payment creation, commission snapshot | `payments.service.ts` `createOrGetPaymentOrder`, `createCashfreeAttempt` |
| Cashfree HTTP client | `cashfree-gateway.service.ts` |
| Webhook intake | `cashfree-webhook.controller.ts` -> `PaymentsService.processCashfreeWebhook` |
| QR, fulfilment, recent payments | `PaymentsService.createUpiQr`, `markFulfilled`, `tenantRecent` |
| Refunds | `PaymentsService.createRefund`: POS, POS Admin and Kiosk Admin devices, and Super Admin via `PlatformPaymentsService.adminRefund` (password re-entry) |
| Day statement | `payment-statement.util.ts` `buildDayStatement`; `GET /payments/tenant-statement` (Kiosk Admin) and `GET /payments/statement` (Super Admin) |
| Needs-attention list, mark handled | `GET /payments/attention`, `POST /payments/:id/admin-fulfilled` |
| Settle now | `PaymentConnectionsService.settleNow` -> `CashfreeGatewayService.settleVendorOnDemand` |
| Vendor onboarding | `payment-connections.service.ts` |
| Commission config | `platform-payments.service.ts`, `payment-connections.service.ts`, `commission.util.ts` |
| Reconciliation | `payment-reconciliation.service.ts`, scheduled by `modules/jobs/jobs.service.ts` |
| Platform dashboard | `GET /api/v1/payments/platform-summary` |
| Kiosk Admin / POS Admin revenue | `GET /api/v1/payments/tenant-summary` |

## Key data

- `PaymentTransaction`: `amount`, `status`, `providerOrderId` (unique with provider), `providerPaymentId`, and the immutable snapshot `commissionBps`, `platformAmount`, `restaurantAmount`.
- `Order` and `PaymentTransaction` are separate records linked by `orderId`; the order carries `PAID` only after a verified webhook.
- `fulfilledAt` / `fulfilledByDeviceId`: set when the kiosk confirms it produced the token and KOT. A paid payment with no `fulfilledAt` after 3 minutes is "needs attention" (the customer paid but may not have received a token). Late payments are never cancelled by the server.
- Money is integer paise everywhere. Commission is integer basis points (0-10000).
- `ReconciliationException` records mismatches; nothing about a payment is ever auto-corrected.

## Kiosk crash recovery

While a QR is on screen the kiosk persists the pending payment (payment id, order, and a KOT-ready copy of the cart). On restart it resumes polling for up to 6 minutes: if the payment turned out to be SUCCESS it prints the token and KOT from the saved order and acknowledges fulfilment. Cash at the counter stays available as a fallback only; online payment is accepted only through the kiosk QR.

## Environment

All keys live in `cloud/api/.env` (template: `cloud/api/.env.example`): `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_ENVIRONMENT` (`sandbox` or `production`), `CASHFREE_WEBHOOK_NOTIFY_URL` (public HTTPS), `PAYMENT_CREDENTIAL_ENCRYPTION_KEY`. `CASHFREE_BASE_URL_OVERRIDE` points Cashfree calls at a local stand-in for rehearsals; it is ignored when `CASHFREE_ENVIRONMENT=production`. No secret ever reaches a kiosk, POS, or browser.

## Idempotency

- Order creation: unique `(restaurantId, externalOrderId)`; a retry returns the existing attempt. If every prior attempt is terminally failed, a fresh attempt is opened against the same validated total.
- Webhooks: unique `(provider, providerEventKey)`; duplicates are recorded as ignored, and terminal payment states never move again.

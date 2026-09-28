# Cashfree payment architecture

The backend is the only authority on payment state. No kiosk, POS, or browser can mark anything paid.

```
Customer -> Kiosk -> POST /api/v1/payments/orders (device token)
                       |  server prices the cart from MenuSnapshotItem (never trusts a client amount)
                       |  resolves commission (restaurant override -> platform default -> 0), snapshots it
                       |  creates Order + PaymentTransaction (CREATED)
                       |  POST Cashfree /orders with order_splits -> paymentSessionId
                       v
                 Cashfree hosted checkout  -> customer pays
                       v
Cashfree -> POST /api/v1/payments/cashfree/webhook
                       |  verify HMAC signature over raw body + 5-minute freshness
                       |  dedupe on providerEventKey (unique)
                       |  cross-check amount / currency / restaurant
                       |  PaymentTransaction -> SUCCESS, Order -> PAID (write-once terminal states)
                       v
Kiosk polls GET /payments/:id/status (reflects what the webhook recorded, never decides)
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
| Refunds | `PaymentsService.createRefund` (POS / POS Admin devices only) |
| Vendor onboarding | `payment-connections.service.ts` |
| Commission config | `platform-payments.service.ts`, `payment-connections.service.ts`, `commission.util.ts` |
| Reconciliation | `payment-reconciliation.service.ts`, scheduled by `modules/jobs/jobs.service.ts` |
| Platform dashboard | `GET /api/v1/payments/platform-summary` |
| Kiosk Admin / POS Admin revenue | `GET /api/v1/payments/tenant-summary` |

## Key data

- `PaymentTransaction`: `amount`, `status`, `providerOrderId` (unique with provider), `providerPaymentId`, and the immutable snapshot `commissionBps`, `platformAmount`, `restaurantAmount`.
- `Order` and `PaymentTransaction` are separate records linked by `orderId`; the order carries `PAID` only after a verified webhook.
- Money is integer paise everywhere. Commission is integer basis points (0-10000).
- `ReconciliationException` records mismatches; nothing about a payment is ever auto-corrected.

## Idempotency

- Order creation: unique `(restaurantId, externalOrderId)`; a retry returns the existing attempt. If every prior attempt is terminally failed, a fresh attempt is opened against the same validated total.
- Webhooks: unique `(provider, providerEventKey)`; duplicates are recorded as ignored, and terminal payment states never move again.

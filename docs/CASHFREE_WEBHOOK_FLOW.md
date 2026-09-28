# Cashfree webhook flow

Endpoint: `POST /api/v1/payments/cashfree/webhook` (public, unauthenticated by design; Cashfree calls it). It is exempt from the global rate limiter so a real delivery is never answered with 429.

## Steps (`PaymentsService.processCashfreeWebhook`)

1. `main.ts` registers a path-scoped raw-body parser, so the handler has the exact bytes Cashfree signed.
2. Read `x-webhook-signature` and `x-webhook-timestamp`.
3. Verify `base64(HMAC-SHA256(timestamp + rawBody, CASHFREE_WEBHOOK_SECRET))` with a constant-time comparison. A timestamp more than five minutes from now is refused as a replay, even if the signature is valid. An unconfigured secret is a clean 503, never a 500.
4. Only after verification, parse the body. A malformed body is recorded, not thrown.
5. Store a `WebhookEvent` with a derived key (`<type>:<cf_payment_id>`); a unique constraint on `(provider, providerEventKey)` makes a repeat delivery a no-op recorded as ignored-duplicate.
6. Resolve the `PaymentTransaction` by `providerOrderId` and cross-check amount, currency, and restaurant. A mismatch marks the event `FAILED` with a message and touches nothing else.
7. Apply the transition. `SUCCESS`, `FAILED`, and `USER_DROPPED` are terminal and write-once; a later event cannot move them.
8. Update the connection's `lastWebhookAt` / `lastPaymentAt`, and set the order to `PAID` on success.
9. Answer 200 once the event is durably recorded.

## Event types handled

| Event | Effect |
|---|---|
| `PAYMENT_SUCCESS_WEBHOOK` | payment `SUCCESS`, order `PAID` |
| `PAYMENT_FAILED_WEBHOOK` | payment `FAILED` |
| `PAYMENT_USER_DROPPED_WEBHOOK` | payment `USER_DROPPED` |
| `REFUND_STATUS_WEBHOOK` | matches the `Refund` by provider refund id, cross-checks the amount, moves it to `SUCCESS`/`FAILED`, and sets the payment and order to `PARTIALLY_REFUNDED` or `REFUNDED` |

Any other event type is recorded and ignored.

## If webhooks stop arriving

The kiosk keeps polling the status endpoint for up to five minutes, staff at the POS check real payment status before accepting cash for an unconfirmed UPI order, and the reconciliation job compares recent successful payments with Cashfree's records. None of these can mark a payment successful on their own; only a verified webhook does.

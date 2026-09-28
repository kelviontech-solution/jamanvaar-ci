# Cashfree test plan

## Automated (run on every change)

`cd cloud/api && npx vitest run` (payments files: `payments-orders`, `payments-webhook`, `payments-refund`, `payments-refund-webhook`, `payment-connections`, `platform-payments`, `payment-reconciliation`, plus `cashfree-gateway.service.spec.ts` and `step-up.util.spec.ts`). Cashfree itself is mocked, so these never spend money.

They cover: server-side pricing and tamper resistance, order idempotency, webhook signature/replay/duplicate/amount-mismatch handling, refund limits, tenant isolation, commission resolution and immutable snapshot, `order_splits` in the Cashfree request (including a 0% restaurant and the retry path), role boundaries (FINANCE_ADMIN, READ_ONLY, SUPPORT_ADMIN), step-up password on protected actions and its deliberate absence on reactivate/refresh-status, reconciliation (missing split, no duplicate exceptions, matching split, pre-migration rows), and the summary endpoints.

Known unrelated flake: `feature-catalog-model.e2e.spec.ts` "re-running the seed is idempotent" can hit its 30 s limit because it spawns `ts-node`; it does not touch payments.

## Manual sandbox checklist (needs your Cashfree sandbox keys)

Set `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_ENVIRONMENT=sandbox`, `PAYMENT_CREDENTIAL_ENCRYPTION_KEY`, and a public `CASHFREE_WEBHOOK_NOTIFY_URL`; register the same URL in the Cashfree dashboard.

1. Submit settlement details from Kiosk Admin, approve in Super Admin with your password. Confirm a vendor appears in the Cashfree dashboard and `cashfreeVendorStatus` moves to `ACTIVE` after Refresh.
2. Set the platform default to a non-zero value and a different override on one restaurant. Place a kiosk UPI order for each; confirm the Cashfree order shows the expected `order_splits` percentage and the payment row's `commissionBps` matches.
3. Pay successfully, then let a second order expire, then abandon a third: expect `SUCCESS`, `FAILED`/pending, and `USER_DROPPED` respectively, with the order `PAID` only for the first.
4. Resend a webhook (Cashfree dashboard) and confirm nothing changes. Send one with a bad signature and confirm it is rejected.
5. Refund part of a payment from POS, then the rest; confirm `PARTIALLY_REFUNDED` then `REFUNDED`, and try refunding more than remains (must be refused).
6. Run the `payment-reconciliation` job from Super Admin: expect no exceptions for healthy payments. **Compare one real `GET .../split` response with `getOrderSplitDetails`'s assumed fields (`splits[].vendor_id`, `splits[].status`) and fix the mapping if they differ.**
7. Kill the network on a kiosk mid-payment and confirm it recovers the status from the server without creating a second charge.
8. Confirm the Super Admin platform page, Kiosk Admin card, and POS Admin Reports card show the figures you just created.

## Before production

Production credentials set separately from sandbox, HTTPS on the API, webhook URL registered, real bank details reviewed for at least one restaurant, and the manual checklist repeated against production with a small real amount.

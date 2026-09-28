# Cashfree test plan

## Automated (run on every change)

`cd cloud/api && npx vitest run` (payments files: `payments-orders`, `payments-webhook`, `payments-refund`, `payments-refund-webhook`, `payment-connections`, `platform-payments`, `payment-reconciliation`, plus `cashfree-gateway.service.spec.ts` and `step-up.util.spec.ts`). Cashfree itself is mocked, so these never spend money.

They cover: server-side pricing and tamper resistance, order idempotency, webhook signature/replay/duplicate/amount-mismatch handling, refund limits, tenant isolation, commission resolution and immutable snapshot, `order_splits` in the Cashfree request (including a 0% restaurant and the retry path), role boundaries (FINANCE_ADMIN, READ_ONLY, SUPPORT_ADMIN), step-up password on protected actions and its deliberate absence on reactivate/refresh-status, reconciliation (missing split, no duplicate exceptions, matching split, pre-migration rows), and the summary endpoints.

The kiosk QR flow has its own file, `payments-kiosk-flow.e2e.spec.ts` (17 tests): QR creation and its 503 when Cashfree returns no payload, fulfilment acknowledgement, the needs-attention list (grace period, mark handled), refunds from Kiosk Admin / POS / Super Admin (step-up password required for Super Admin, RBAC, over-refund refusal), the day statement arithmetic including refunds, settle-now (step-up, minimum, idempotency key, inactive connection), and cross-restaurant isolation. Gateway calls for the QR and on-demand settlement are covered in `cashfree-gateway.service.spec.ts`.

Tests clear `CASHFREE_*` secrets and ignore `.env` (`test/setup.ts`, `app.module.ts`), so they pass whether or not you have filled real keys in `.env`.

Known unrelated flake: `feature-catalog-model.e2e.spec.ts` "re-running the seed is idempotent" can hit its 30 s limit because it spawns `ts-node`; it does not touch payments.

## Manual sandbox checklist (needs your Cashfree sandbox keys)

Set `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_ENVIRONMENT=sandbox`, `PAYMENT_CREDENTIAL_ENCRYPTION_KEY`, and a public `CASHFREE_WEBHOOK_NOTIFY_URL`; register the same URL in the Cashfree dashboard.

1. Submit settlement details from Kiosk Admin, approve in Super Admin with your password. Confirm a vendor appears in the Cashfree dashboard and `cashfreeVendorStatus` moves to `ACTIVE` after Refresh.
2. Set the platform default to a non-zero value and a different override on one restaurant. Place a kiosk UPI order for each; confirm the Cashfree order shows the expected `order_splits` percentage and the payment row's `commissionBps` matches.
3. Pay successfully, then let a second order expire, then abandon a third: expect `SUCCESS`, `FAILED`/pending, and `USER_DROPPED` respectively, with the order `PAID` only for the first.
4. Resend a webhook (Cashfree dashboard) and confirm nothing changes. Send one with a bad signature and confirm it is rejected.
5. Refund part of a payment from POS, then the rest; confirm `PARTIALLY_REFUNDED` then `REFUNDED`, and try refunding more than remains (must be refused).
6. Run the `payment-reconciliation` job from Super Admin: expect no exceptions for healthy payments. **Compare one real `GET .../split` response with `getOrderSplitDetails`'s assumed fields (`splits[].vendor_id`, `splits[].status`) and fix the mapping if they differ.**
6a. **Confirm the QR response:** in the kiosk, press UPI QR Payment and check that a scannable QR appears. If it shows an error, Easy Split / UPI QR (`channel: "qrcode"`) may not be enabled on your Cashfree account, or the response field names (`data.payload`, `data.content_type`) differ from what `createUpiQr` reads; fix the mapping in `cashfree-gateway.service.ts`. Scan with a UPI app in sandbox and confirm the token and KOT print by themselves.
6b. Close the kiosk browser while a QR is showing, pay, reopen it within 6 minutes: it should print the token and KOT. Pay and keep the kiosk offline for over 3 minutes: the payment must appear in Super Admin "needs attention".
6c. **Settle now:** press it for a small amount on a sandbox restaurant and confirm Cashfree accepts it. The request uses `transfer_from: "VENDOR"`; if Cashfree rejects the direction, adjust `settleVendorOnDemand`.
7. Kill the network on a kiosk mid-payment and confirm it recovers the status from the server without creating a second charge.
8. Confirm the Super Admin platform page, Kiosk Admin card, and POS Admin Reports card show the figures you just created.

## Before production

Production credentials set separately from sandbox, HTTPS on the API, webhook URL registered, real bank details reviewed for at least one restaurant, and the manual checklist repeated against production with a small real amount.

## If Cashfree answers `s2s_enabled_not_approved`

The server-to-server Order Pay API (the UPI `qrcode` channel) must be approved by Cashfree on the merchant account; it is not a dashboard switch. Until it is approved the kiosk falls back automatically: `POST /payments/:id/qr` returns `method: "CHECKOUT_PAGE"` and a `qrPayload` that is the address of our page `GET /api/v1/pay/:paymentId`. The kiosk draws that address as a QR; the guest scans it with the phone camera; the page (restaurant name and amount only) opens Cashfree's own checkout with the payment session. Payment, webhook, split and refund handling are unchanged. It needs a public HTTPS address (`PAYMENT_PAGE_BASE_URL`, or the origin of `CASHFREE_WEBHOOK_NOTIFY_URL`); with neither, the QR request stays a 503 and the kiosk offers cash. Once Cashfree approves the feature, the kiosk shows the direct UPI QR again with no change.

Checked live on 28 Sept 2026 with production keys: order created, QR shown, page opened on a phone-sized browser and handed over to `api.cashfree.com/checkout` showing the amount and UPI options (nothing was paid).

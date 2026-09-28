# Kiosk QR payment flow, crash-safe fulfilment, refunds, day statement, settle-now

Decisions (from the user): cash-at-counter stays as fallback only; refunds from Kiosk Admin, Super Admin and POS; one Cashfree vendor per restaurant; Cashfree auto-settles (default next day 11:00) plus a JAMANVAAR day statement and a Super Admin "Settle now".

## Flow
1. Kiosk creates a pending local order and `POST /payments/orders` (server prices, splits, snapshots commission). Nothing reaches KDS and no token is shown yet.
2. Kiosk calls `POST /payments/:id/qr`. Server calls Cashfree Order Pay (`payment_method.upi.channel = "qrcode"`, 180 s expiry) and returns the QR. Kiosk renders it with countdown and Cancel. A suspended connection is refused.
3. Customer pays; verified webhook marks payment SUCCESS / order PAID (unchanged). Kiosk polls every 2 s.
4. Kiosk creates token + KOT + receipt from the saved local order, then calls `POST /payments/:id/fulfilled`.
5. The pending payment id is persisted on the kiosk; on start-up or reconnect it is resumed (status check, KOT if paid).
6. Server-side safety net: a SUCCESS payment with no `fulfilledAt` after 3 minutes is "needs attention" (Kiosk Admin list, Super Admin list). Staff mark it fulfilled or refund it. Late payments (after the QR expired) land here rather than being lost. A payment is never cancelled server-side while a QR may still be paid.

## Backend
- Gateway: `createUpiQr`, `settleVendorOnDemand` (`POST /easy-split/vendors/{id}/transfer`, ON_DEMAND, idempotency key).
- Schema: `PaymentTransaction.fulfilledAt`, `fulfilledByDeviceId` (existing SUCCESS rows backfilled).
- Device endpoints: `POST :id/qr`, `POST :id/fulfilled`, `GET tenant-recent`, `GET tenant-statement`; refund route also allows `KIOSK_ADMIN`.
- Platform endpoints: `GET attention`, `GET statement`, `POST :id/admin-refund` (step-up password), `POST /restaurants/:id/payment-connection/settle-now` (step-up password, audit).
- Statement (IST business day): gross, refunds, commission, restaurant gross, refund impact on restaurant share (proportional to the original split, as Cashfree reverses it), net payable, rows.

## Frontends
- kiosk-user: QR screen replaces the hosted-checkout popup; persisted pending payment + resume; fulfilled acknowledgement; cash fallback unchanged.
- kiosk-admin: "Online payments" panel: recent payments, needs-attention, Mark fulfilled, Refund, day statement + CSV.
- super-admin-web: attention list with Refund/Mark fulfilled, statement + CSV, Settle now on Payment Gateways.

## Tests
Backend e2e for every endpoint (roles, restaurant isolation, wrong state, over-refund, step-up, statement maths with commission and partial refund, idempotency); gateway unit tests; typecheck all frontends; browser check of the kiosk QR screen against the mocked/sandbox API where possible.

# Settlement, commission, and refunds

## How money is routed

Every Cashfree order created for a restaurant with a vendor declares `order_splits: [{ vendor_id, percentage }]`. The restaurant's vendor receives that percentage; the remainder stays in JAMANVAAR's merchant account as the platform commission. If no split is declared Cashfree settles everything to the platform account, so a restaurant at 0% commission still gets an explicit `percentage: 100` split.

## Commission

- Unit: integer basis points (0 to 10000; 200 = 2%).
- Resolution at order creation: the restaurant's `commissionOverrideBps` if set, else the platform default (`PlatformSetting` key `PAYMENT_DEFAULT_COMMISSION_BPS`), else 0.
- Configured by Super Admin on the Payment Gateways page (default at the top, override per restaurant row). Both changes require the admin's password and write a `COMMISSION_CHANGED` audit entry with old and new values.
- Snapshot: `PaymentTransaction.commissionBps`, `platformAmount`, and `restaurantAmount` are written once when the order is created and never recomputed. Changing a rate later affects only future orders. `platformAmount + restaurantAmount = amount`.
- Rows created before this feature have null snapshot fields, which honestly reflects that no split was declared for them; reconciliation skips them.

## Definitions used in dashboards

| Term | Meaning |
|---|---|
| Gross volume | Sum of `amount` over payments in `SUCCESS`, `PARTIALLY_REFUNDED`, `REFUNDED` |
| Platform commission | Sum of `platformAmount` over the same payments |
| Restaurant share | Sum of `restaurantAmount` over the same payments |
| Refunded | Sum of `Refund.amount` where the refund succeeded |

Gross volume is not profit and is not settlement; do not add or compare these with the local cash and card figures in POS Admin (they come from a different source).

## Refunds

Refunds can be started from three places: Kiosk Admin and POS / POS Admin (a device request; the POS asks for a manager approval on the terminal, the server itself only checks the device type and the refundable balance), and Super Admin (Platform Payments page, requires the admin's password and is audited as `REFUND_REQUESTED` with actor type `PLATFORM`). The server checks the remaining refundable balance (pending refunds reserve their amount), creates a `Refund`, calls Cashfree, and treats the webhook as the confirmation. Cashfree reverses the vendor's share proportionally to the original split whether or not it has already settled, so no split-specific code exists on the refund path.

## End-of-day settlement

1. Cashfree settles each vendor automatically the next business day (default T+1, about 11:00 AM) for the vendor's share of that day's payments.
2. JAMANVAAR provides a day statement for any IST calendar day (Kiosk Admin "Online payments" panel, and Super Admin Platform Payments with CSV export): payment and refund counts, gross volume, refunded amount, platform commission, commission reversed on refunds, restaurant gross, restaurant refund impact, and **net payable to the restaurant**. Refund impact is `round(refund x restaurantAmount / amount)`, matching Cashfree's proportional reversal. Rows are capped at 500 per statement with a `rowsTruncated` flag.
3. Compare the statement's net payable with the amount Cashfree settles. A difference is a reconciliation question, not something the app corrects.
4. Super Admin can press "Settle now" on an active restaurant (Payment Gateways page) to trigger an on-demand vendor transfer of a chosen amount (minimum Rs 10). It requires the admin's password, uses an idempotency key, and is audited as `PAYMENT_SETTLE_NOW`. Cashfree must have on-demand vendor settlement enabled for the account.

## Who sees what

- Super Admin: platform-wide summary (`/platform-payments`), per-restaurant transactions, reconciliation exceptions, the needs-attention list (paid but no token confirmed after 3 minutes), refund, mark handled, day statement, and Settle now.
- Kiosk Admin: gross, successful, failed, refunded for its own restaurant on its Payment Gateway card, plus the Online payments panel (recent payments, refund, mark handled, day statement).
- POS Admin: the same figures on the Reports page, labelled separately from local sales.

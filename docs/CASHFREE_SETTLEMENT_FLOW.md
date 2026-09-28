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

Only POS and POS Admin devices can refund, with a manager approval on the terminal. The server checks the remaining refundable balance (pending refunds reserve their amount), creates a `Refund`, calls Cashfree, and treats the webhook as the confirmation. Cashfree reverses the vendor's share proportionally to the original split whether or not it has already settled, so no split-specific code exists on the refund path.

## Who sees what

- Super Admin: platform-wide summary (`/platform-payments`), per-restaurant transactions and reconciliation exceptions.
- Kiosk Admin: gross, successful, failed, refunded for its own restaurant on its Payment Gateway card.
- POS Admin: the same figures on the Reports page, labelled separately from local sales.

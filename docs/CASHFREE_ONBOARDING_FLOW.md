# Restaurant onboarding to Cashfree

Each restaurant is a Cashfree **Easy Split vendor** under JAMANVAAR's single merchant account. A restaurant is payment-enabled only when its connection is `ACTIVE`; a flag on the restaurant is never enough.

## States (`RestaurantPaymentConnection.status`)

```
NOT_CONNECTED --submit--> PENDING_VERIFICATION --approve--> ACTIVE <--reactivate-- SUSPENDED
                                   ^                          |  \--suspend-------->/
                                   |                          v
                                   +---- resubmit ------- DISCONNECTED  (disconnect from ACTIVE, SUSPENDED, or PENDING_VERIFICATION)
```

| Transition | Who | Cashfree call | Step-up password |
|---|---|---|---|
| Submit / resubmit | Restaurant OWNER or MANAGER (Kiosk Admin) | none | n/a |
| Approve | Super Admin (billing write) | `POST /easy-split/vendors` the first time, `PATCH` on every later approval | yes |
| Suspend | Super Admin | none (internal gate only) | yes |
| Reactivate | Super Admin | none | no |
| Disconnect | Super Admin | none | yes |
| Refresh status | Super Admin | `GET /easy-split/vendors/{id}` | no |

Submission is refused while `ACTIVE` or `SUSPENDED`, so a restaurant cannot silently rewrite live settlement details.

## What gets collected

Account type (BUSINESS or INDIVIDUAL), PAN, contact name/email/phone, optional business type/GST/CIN/Aadhaar, and exactly one settlement destination: bank (account holder, account number, IFSC) or UPI VPA. The account number is encrypted at rest.

## Approval details

`approve` runs in three phases so no database transaction is held open across the Cashfree network call: read and validate, call Cashfree, then re-check the status before writing. If the status changed during the call (for example a concurrent disconnect), the write is refused. On a Cashfree error the connection stays `PENDING_VERIFICATION` and the error is shown to the admin.

The vendor id is `rest_<restaurantId without hyphens>` and is reused across disconnect/resubmit/re-approve cycles.

## Two separate statuses

`status` is JAMANVAAR's own gate, checked before every order is created. `cashfreeVendorStatus` is Cashfree's asynchronous verification result (`IN_BENE_CREATION`, `ACTIVE`, `ACTION_REQUIRED`). They are stored and shown separately; refreshing Cashfree's status never changes ours.

## Commission

After approval, Super Admin can set a per-restaurant commission override on the Payment Gateways page; blank means "use the platform default". See `CASHFREE_SETTLEMENT_FLOW.md`.

# Reconciliation

A scheduled job compares JAMANVAAR's payment records with what Cashfree recorded, and turns disagreements into exceptions for a person to look at. It never edits a payment.

## The job

- Name `payment-reconciliation`, registered in `modules/jobs/jobs.service.ts`, runs every 15 minutes with the other platform jobs (it can also be run from Super Admin's jobs endpoint).
- Scope: payments in `SUCCESS`, `PARTIALLY_REFUNDED`, or `REFUNDED` created in the last 7 days that have a commission snapshot (`commissionBps` not null). Older rows and rows created before splits existed are skipped, not flagged.
- For each payment it calls `GET /easy-split/orders/{providerOrderId}/split` and looks for the restaurant's `cashfreeVendorId`.
- A failure for one payment (for example Cashfree rate-limiting) is logged and the run continues with the rest.

## Exception types

| Type | Meaning | What to do |
|---|---|---|
| `MISSING_AT_CASHFREE` | Cashfree has no split for this vendor on this order | Check the order in the Cashfree dashboard; the vendor may not have been in the split |
| `UNEXPECTED_STATUS` | The split exists with a status other than `SETTLED`, `PENDING`, `PROCESSING` | Read the status stored in the exception details and check with Cashfree |
| `AMOUNT_MISMATCH`, `SPLIT_MISMATCH` | Reserved; not raised yet | Requires confirmed amount fields on Cashfree's split response |

A payment that already has an `OPEN` exception of a given type does not get a second one on the next run.

## Working an exception

Super Admin opens the restaurant, then the Payments tab. Open exceptions are listed below the transactions with the type, details, and time. "Acknowledge" marks it `ACKNOWLEDGED` (records who and when) and removes it from the open list. `RESOLVED` exists in the schema for a future workflow after the underlying money issue is fixed outside this system; nothing sets it yet.

The platform dashboard shows the count of open exceptions across all restaurants.

## Limits

- Only the presence and status of the split are compared today. Amount and percentage comparison waits on confirming Cashfree's response fields in a sandbox run.
- Refund reconciliation and settlement-payout matching are not implemented; the Cashfree dashboard remains the provider-side source of truth for payouts.

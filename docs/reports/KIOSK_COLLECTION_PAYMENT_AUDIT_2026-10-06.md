# Kiosk collection and settlement audit - 6 October 2026

## Current implementation and database

Customer payments already use the platform Razorpay account, with server-side pricing, signed device requests, verified webhooks, frozen integer-paise commission snapshots, unique provider payment IDs and tenant isolation. `Order.source` separates KIOSK and WHATSAPP. POS/Captain cash transactions use a separate sync pipeline.

`RestaurantPaymentConnection` already stores encrypted settlement bank numbers, platform-controlled bank verification and per-restaurant commission overrides. The platform default commission is already editable by authorized Super Admin users and defaults to 300 basis points (3%).

`PaymentTransaction` is the collection ledger. `RestaurantPayout` stores manual EOD batches, payment membership, UTR, paid-at and paid-by. Route is not implemented as an active settlement provider. The user confirmed Route is pending: selecting direct settlement must remain a request rather than silently switching the destination of customer money.

## Findings and proposed changes

1. The shared payment helper also charges commission on WhatsApp payment links. Limit new fee-bearing attempts to kiosk QR payments; preserve existing snapshots and customer payment amounts.
2. Add a persisted direct-settlement request, default off. The effective collection account remains Jamanvaar and payout mode remains MANUAL until a separately verified Route integration exists.
3. Allow owners/managers to provide or update settlement bank details independently of gateway approval. Keep account numbers encrypted and masked; reset bank verification after changes. Serialize bank changes against payout creation and prevent changing destinations while an unpaid batch exists.
4. Show Gross Collection, Jamanvaar Fee, Net Payable, Paid and Pending. Include unbatched earnings in Pending immediately; customer capture must never mean the restaurant received a bank transfer.
5. Exclude refunded or refund-pending collections from normal payables and recheck batch eligibility before marking PAID. Retain gross capture history and show withheld payables explicitly; do not assume a refund-fee reversal policy.
6. Preserve existing authenticated Super Admin commission controls, label their kiosk-only scope, and expose the effective rate read-only to Restaurant Admin.

## Files and migration

Changes are limited to payment connection/controller/DTO/service, commission allocation, payout summary and validation, restaurant payment components/client types, Super Admin labels, and payment regressions. A new migration adds the request flag and optional bank name/account-type metadata; historical migrations and historical payment splits are unchanged.

## Security and provider boundaries

Restaurant identity comes from the authenticated tenant session. Only OWNER/MANAGER can change the request or bank details. Only authorized platform users can verify banks, change rates, or mark payouts PAID. A request cannot set bank verification or activate Route. No automatic transfer is claimed or initiated.

Razorpay Route requires linked-account onboarding and actual transfer integration; entering a bank account or flipping a UI toggle cannot provide that by itself. See [Razorpay Route](https://razorpay.com/route/).

The production QR delay, live gateway credentials/configuration, Razorpay dashboard 2FA and team access cannot be marked verified from local mocks. Keep those as deployment/account-owner checks. Existing structured payment lifecycle logs and request deadlines remain in place.

## Implemented behavior

- Restaurant Settings now contains kiosk payment settings and the online ledger when the merged Restaurant Admin has the KIOSK_ADMIN entitlement. Kiosk-only plans do not need the POS payment tab.
- Jamanvaar collection is the default. An owner/manager can request platform payment activation without supplying bank details first; Super Admin approval remains required. Bank verification is still required for manual payouts.
- The direct settlement toggle requires a saved bank account and persists a request only. Both APIs and screens continue to identify Jamanvaar collection, MANUAL payouts and PENDING Route. No transfer API is called by the toggle.
- Bank holder name, bank name, account type, account number and IFSC can be submitted independently of payment activation. Account numbers are encrypted at rest, masked in responses and excluded from audit details. An edit clears bank verification and verification timestamps. Unpaid payout batches block destination changes, including legacy resubmissions.
- New kiosk QR payments use the configured fee (3% by default). New WhatsApp payment links use zero Jamanvaar commission. POS/Captain/cash pipelines are unchanged. Existing payment snapshots remain unchanged after rate edits. Kiosk retries cannot reuse a WhatsApp order ID.
- Gross Collection, recorded Jamanvaar Fee, Net Payable after holds, Paid and Pending are distinct. Pending includes eligible captures before the EOD batch. Today/date statements use server amounts and no longer assume a fixed 3% display rate or a proportional refund-fee reversal.
- Historical captures with no saved split are shown separately as collections needing split review. They are never silently treated as zero-fee restaurant earnings or backfilled using today's commission rate.
- Restaurant payment amounts display both paise digits and Indian number grouping. The prior whole-rupee formatter could round a small fee to zero. Late responses from earlier refreshes/date selections are discarded.
- Bank edits, EOD claims and refund reservations share a restaurant-level transaction lock. Summaries read a consistent database snapshot, avoiding double counting while collections move into a batch.
- Pending/successful refunds exclude unbatched shares from ordinary payables. A refund initiated after batching automatically holds the unpaid batch and records an audit event. Mark-paid checks the bank verification and the batch's payment/refund eligibility again. Concurrent mark-paid calls cannot overwrite the winning transfer reference. An ON_HOLD payout must be released before marking paid; unresolved refunds block release.
- Super Admin retains default and restaurant-specific commission controls with password confirmation. These controls identify kiosk QR scope; existing server policy requires a rate of at least 2%. Rates affect newly created attempts, not historical snapshots.
- Manual payout confirmation requires an explicit UI confirmation of a completed bank transfer, plus the existing UTR and password. Recording PAID does not initiate a bank transfer.

## Deployment and remaining external work

The additive migration `20261006060000_kiosk_settlement_request` was applied to the local development and dedicated test databases, and the Prisma client was regenerated. The production database was not accessed. Deploy this migration before the matching API and Restaurant Admin/Super Admin bundles.

Direct settlement activation remains future work until Route is activated, linked accounts are onboarded/verified, and actual transfer integration is implemented and tested. This is the explicitly requested pending-Route flow.

Refund fee treatment and recovery after a payout was already transferred require an agreed financial policy. The implementation retains the original ledger and holds unresolved unpaid exposure for review; it does not invent fee reversals or silently rewrite a frozen payout. A successfully refunded batch cannot simply be released at its original amount.

Local verification does not establish AWS latency, live QR availability, effective gateway configuration, or bank transfer completion. Those require the deployed environment/provider account. See the separate production synchronization report for deployment checks and measured local real-time flows.

## Validation

- Payment regressions: **99 passed across 5 files**, against an isolated local PostgreSQL database using the non-superuser application role. Gateway requests were mocked; no real payment or transfer was made.
- Remaining backend regressions: **980 passed across 121 files**, with 2 existing skipped files/tests. Combined backend verification: **1,079 passed across 126 files**. This includes authentication, refunds/webhooks, tenant/branch isolation, merged-admin entitlements, offline/reconnect, and real-time streams.
- Frontend/runtime regressions: **1,374 passed across 187 files**.
- Root and backend TypeScript checks passed. Backend, Restaurant Admin and Super Admin production builds passed; existing bundle-size warnings remain.
- Browser smoke check passed for the configured fee, default platform collection, missing-bank validation, bank form/masked response, direct request on/off, and continued manual payout mode.
- Browser ledger checks passed for both amounts: INR 25,000 gross / 750 fee / 24,250 net and pending / zero transferred, and INR 1.00 gross / 0.03 fee / 0.97 net and pending. Customer-paid and payout-pending labels remained distinct. Changing the date loaded the selected statement.
- The new migration applied successfully to local development, dedicated test, and freshly created isolated test databases. Broader backend checks use the repository's seed catalog/plans in an isolated database to avoid unrelated fixture collisions. Temporary databases are removed after each verification run.

The isolated real-time integration trace measured Captain creation at 20 ms, the committed DB read at 2 ms, KDS visibility at 32 ms, and READY returning to Captain/POS at 82 ms. These are local test measurements, not AWS timings.

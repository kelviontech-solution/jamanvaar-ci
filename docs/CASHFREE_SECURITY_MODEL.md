# Cashfree payment security model

A map for a security reviewer: what protects the payment module and where the code is.

## Secrets

- Cashfree credentials and the webhook secret are server environment variables only. They are never returned by any API, never stored in the database, and never sent to any frontend, kiosk, POS, or APK.
- Restaurant settlement bank account numbers are encrypted at rest with AES-256-GCM (`common/security/credential-encryption.util.ts`, key `PAYMENT_CREDENTIAL_ENCRYPTION_KEY`). Platform views show only the last four characters of account numbers, PAN, GST, CIN, Aadhaar, and UPI VPA; a restaurant's own view omits the account number and masks the identity fields.
- Payment responses stored on `PaymentTransaction.providerResponse` are sanitized. Audit `details` carry identifiers and values only, never passwords or secrets.

## Who can do what

**Platform (Super Admin) access is role-based and deny-by-default.** `PlatformAuthGuard` checks every request against `common/rbac/access.ts`. All payment routes (`/api/v1/payments*`, `/api/v1/payment-connections*`, `/api/v1/restaurants/:id/payment-connection*`) belong to the `billing` area:

| Role | Billing access |
|---|---|
| PLATFORM_OWNER, SUPER_ADMIN | read + write |
| FINANCE_ADMIN | read + write |
| READ_ONLY | read only |
| PLATFORM_OPS, SUPPORT_ADMIN | none (403 even for reads) |

This is proven for the commission routes by e2e tests, not just assumed from the table.

**Step-up re-authentication.** On top of the role check, these actions require the acting user to re-enter their own password (`common/security/step-up.util.ts`, bcrypt against the user's real hash): approve, suspend, and disconnect a payment connection; set the platform default commission; set a restaurant's commission override. A missing and a wrong password both return 403. `reactivate` and `refresh-status` are deliberately excluded (reactivate only restores a state that already required step-up to leave; refresh-status changes nothing of consequence).

**Devices.** Kiosk, POS, POS Admin, and Kiosk Admin authenticate with device tokens; the restaurant is always derived from the token, never from the request body. Only `KIOSK`/`KIOSK_ADMIN` can create payment orders, only `POS`/`POS_ADMIN` can refund, only `KIOSK_ADMIN`/`POS_ADMIN` can read the revenue summary.

**Tenant staff.** Kiosk Admin's payment-connection screens require an OWNER or MANAGER session; STAFF is rejected.

## Integrity controls

- Amount is server-computed from the synced menu snapshot; the client sends only item ids, quantities, and options.
- Webhooks: HMAC-SHA256 signature over timestamp plus raw body, constant-time comparison, replay window of five minutes, unique event key, amount/currency/restaurant cross-check.
- Terminal payment states are write-once; a refund cannot exceed the remaining refundable amount (pending refunds reserve their amount).
- Tenant isolation: every payment table has Postgres row-level security keyed on `app.current_restaurant_id`, and the platform reads under an explicit platform context.
- Rate limiting: a global throttler covers payment routes; only the Cashfree webhook is exempt so a legitimate delivery is never answered with 429.
- Audit: connection approvals/suspensions/disconnects/submissions and every commission change (`COMMISSION_CHANGED`, with old and new values) are written to `AuditLog`.

## Known limits

- Reconciliation detects missing or oddly-statused splits; it does not yet compare amounts or split percentages because Cashfree's amount fields on the split-details response were not confirmed (see `CASHFREE_RECONCILIATION.md`).
- Production readiness still needs the operator to set real credentials, configure the webhook URL in Cashfree, serve over HTTPS, and run the sandbox test plan (`CASHFREE_TEST_PLAN.md`).

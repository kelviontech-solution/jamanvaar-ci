# QR online payment activation and 2% commission

Implemented locally on 21 October 2026. The hosted deployment was not changed, and no live payment or bank transfer was performed.

## Owner flow

1. Open **QR Admin → All tools & setup → Payment Settings** (`/qr/admin?tab=PAYMENTS`). Restaurant Admin uses the same QR payment workspace.
2. Use **Allow online payment**. If collection needs activation, the page explains the 2% commission and lets the owner send a request directly. It creates a real support ticket rather than sending the user to an empty support page.
3. Add the restaurant's payout bank on this page. Account numbers use the existing encrypted backend storage and are displayed masked. QR-only owners no longer need a Kiosk Admin licence to submit their payout bank.
4. While approval is pending, the page displays the ticket number and checks status every 20 seconds while visible, and when the window regains focus. **Check payment status** provides a manual refresh. The switch is a saved preference; the page separately states whether customers can actually pay.
5. After collection approval, online checkout is available when the switch is on and QR payment access remains included. Turning the switch off stops new online checkouts; it does not erase existing payment attempts. An owner can opt out while a request is pending.

Payment instructions retain their unsaved text when the online switch changes or activation status refreshes. Failed saves preserve the confirmed switch state. Bank save failures retain the entered form; successful saves clear the plaintext account number from the form. Bank edits have the existing unsaved-navigation protection.

## Super Admin flow

1. Open **Support tasks** (`/tickets`) and the **Enable QR online payments…** ticket.
2. The ticket contains **Activate QR online payments**, including the restaurant, collection status, bank status and 2% calculation.
3. Review QR plan/branch access and server gateway setup. Missing entitlement, missing gateway credentials, suspended/disconnected collection, or a closed unapproved ticket blocks approval with a next action.
4. A platform user with **support write and billing write** confirms the review and their password, then selects **Approve QR payments & resolve request**.
5. Approval activates collection, resolves the ticket, adds a customer-visible comment and records audit/history events atomically. Concurrent approvals produce one activation event. Repeated requests reuse an existing pending request, or its completed approval while collection remains active.
6. Open **Payment connections** (`/payment-connections`) to verify the payout bank after the normal bank review. Verified bank accounts participate in the existing manual payout process. Collection approval never marks a bank verified or fabricates a bank transfer.

The ticket links directly to this restaurant's **QR Ordering Suite → Entitlement → Online payments**, as well as Products & access for purchased products and branch restrictions. The existing Online payments entitlement switch now explains that collection approval is also required. Payment approval does not silently grant an unpurchased product or bypass a branch restriction. Support-only users can inspect requests but cannot activate collection.

## Money handling

- New QR online payment attempts freeze **200 basis points (2%)** as the Jamanvaar platform share. A ₹100 bill records ₹2 platform commission and ₹98 restaurant share. The guest's bill is still ₹100.
- The split is computed server-side in integer paise, using the existing rounding rule. Browser-supplied prices or rates cannot determine the fee.
- Standard Checkout and hosted payment-link checkout use this same QR payment creation path.
- Reopening an older attempt keeps its original provider reference and commission snapshot, including historical 0% attempts. This change does not rewrite prior transactions.
- Existing captured-payment verification, signed webhook checks, idempotency, refunds and payout holds remain authoritative. Payment detail records in Super Admin expose the stored split.
- Manual payout batches sum the stored restaurant shares and platform fees, including QR collections. Retries do not claim a collection twice. Refunded or disputed shares follow the existing holds/reconciliation policy.
- Kiosk commission configuration remains separate; WhatsApp commission behavior is unchanged. Super Admin's commission controls are explicitly labelled **Kiosk commission** so they do not imply changing QR's fixed rate.
- **2% is gross platform commission, not guaranteed net earnings.** Existing statements subtract their gateway-fee estimate from platform commission. At the existing 2% gateway estimate, a 2% gross QR commission leaves no estimated platform margin before any additional provider costs/taxes. No extra guest surcharge, new provider pricing assumption or new refund fee policy was introduced.

## Verification

| Check | Result |
| --- | --- |
| QR module integration | 58 passed |
| Hosted QR mobile payments | 22 passed |
| Payment connections / encrypted bank handling | 32 passed |
| Restaurant payouts | 14 passed |
| Platform payments | 20 passed |
| Refunds | 11 passed |
| Console resource authorization | 20 passed |
| Commission rounding | 4 passed |
| **API tests in combined run** | **181 passed, 8 files** |
| Root payment/QR regression checks | **28 passed, 7 files** |
| Root, API and Super Admin TypeScript checks | Passed |
| QR/Restaurant Admin and Super Admin production bundles | Passed; existing large-bundle/printer chunk warnings remain |
| Nest production compilation | Passed using an isolated output directory to avoid the existing running process's locked API `dist` |
| Chrome at 390px and 1440px | Passed; no page exceptions or horizontal overflow |

The API integration tests use the guarded test database and real auth, entitlement resolution, transactions, persisted financial records and HMAC verification. External gateway transport is mocked; these were not real provider charges. Coverage includes parallel requests and approval, owner consent, plan denial, missing gateway setup, step-up password, insufficient platform permissions, QR-only payout bank access, lossless commission rounding, persisted captured splits, historical fee preservation and repeat-safe payout claims.

The browser checks mount the real payment editor, payout bank editor, auth provider, Super Admin ticket modal and QR Ordering Suite in an isolated Vite fixture with simulated HTTP responses. They cover activation consent, pending opt-out, approval, failed request/save/read recovery, masked bank display, unsaved instruction preservation, permission restrictions and mobile layout. The ticket's access-review link opens the correct restaurant's Entitlement editor, can save its Online payments setting, and closes without reopening unexpectedly. They are component workflow checks, not a claim that the hosted production provider was exercised.

Re-run the browser checks with `node docs/reports/qr-online-payments-2026-10-21/browser-check.cjs`. Results are in [browser-results.json](./browser-results.json); mobile and desktop screenshots are saved alongside this report.

## Deployment requirements

Deploy the API, Restaurant/QR Admin frontend and Super Admin frontend together. This change adds no database schema migration. Existing unrelated pending migrations still follow the project's normal deployment process.

The payment server needs valid Razorpay key ID, key secret and webhook secret, with the existing signed payment webhook configured. Bank submission needs the existing payment credential encryption key. Missing provider configuration, a restricted plan or suspended collection prevents online checkout. An unverified bank holds restaurant payouts separately; it does not imply that collection approval verified the bank.

Restaurant shares continue through **verified-bank manual payouts**. Automatic provider split transfers/Route were not implemented or claimed. The local changes do not activate collection on the hosted server by themselves.

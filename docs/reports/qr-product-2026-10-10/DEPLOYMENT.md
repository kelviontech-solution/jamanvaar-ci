# Deploying the QR product entry and operations

This task changed the local repository and isolated QA database. It did not deploy, alter production DNS, charge a payment or push a commit.

## Application rollout

1. Back up the production database and use the repository's existing release process. Confirm preceding QR advanced/order-ledger migrations are already deployed or included in this release.
2. Build/deploy `backend`, `pos-admin`, `qr-guest`, `pos`, `captain` and `kds`. The backend entrypoint runs `npm run prisma:deploy` before starting. The new migration is `20261010180000_qr_operations_features`, which adds feature catalog rows and three partial retrieval indexes. Allow the normal maintenance window for index creation on existing tables. Do not use a schema reset or run development seeding over restaurant data.
3. Supply the actual HTTPS origin through `PUBLIC_ORIGIN` for frontend builds and `QR_ORDER_BASE_URL` for the API, as the existing compose file does. Production guest artifacts must not point to QA `http://localhost:5288`.
4. Deploy the updated Restaurant Admin container nginx configuration. `/qr-app/` serves the second `qr.html` entry; `/qr-app/assets/` serves existing assets. QR HTML is `no-store`; hashed assets retain immutable caching. The original `index.html` entry remains available for Restaurant Admin.
5. Install the updated `nginx/system.kelviontech.in.conf` in the existing shared HTTPS nginx container. It routes `/qr/` to the Restaurant Admin container's `/qr-app/` location and redirects `/qr` to `/qr/`. Keep `/q/`, `/kiosk/`, `/restaurant-admin/` and the existing API/realtime routes intact. Run the real container's nginx configuration test before reloading it. Do not reload an unrelated host nginx service.
6. Verify fresh and refreshed deep links: `/qr/`, `/qr/login/`, `/qr/activate/`, `/qr/recover/`, `/qr/admin/` and an actual `/q/<token>`. Verify the QR favicon/logo/chunks load from their own paths and an unknown QR route has a useful not-found state.

There is no separate QR container, password store, QR device enum or new order/payment service to provision. QR-only management uses the existing management-device key policy and a licensed `QR_ORDERING` subscription. An activation key connects a device; it does not buy a plan or allow public self-registration.

## Restaurant configuration

Super Admin should grant `QR_ORDERING` and desired optional catalog features through the existing plan/subscription controls:

- Service requests: `QR_SERVICE_REQUESTS` / `qrServiceRequests`.
- Scheduled pickup: `QR_SCHEDULED_PICKUP` / `qrScheduledPickup`.
- Item analytics: `QR_MENU_ANALYTICS` / `qrMenuAnalytics`.
- Extended branding: `QR_BRANDING` / `qrBranding`.

Then the owner signs in at `/qr/login/` or connects a new console at `/qr/activate/`. Existing owner Restaurant ID/password or manager email/password is required. Branch creation, account/license reassignment and device revocation remain controlled by Super Admin. Full activation keys are not shown after connection.

For each branch:

1. Select the branch, review and publish its shared menu, and check availability overrides.
2. Review QR setup health. Enable ordering, create/select tables, generate correctly mapped codes and print/preview them.
3. Enable counter payment and/or a ready merchant integration. Verify actual Razorpay credentials/webhooks and email recovery transport with the deployment's configured integrations; local tests use substitutes.
4. Configure service request labels, enabled types, cooldown, expiry, overdue threshold and quiet hours if licensed. Open QR Admin/POS/Captain service inboxes and test request acknowledgement/completion from a second device.
5. For takeaway scheduling, enable menu-only ordering and scheduled pickup, confirm the branch's IANA timezone, set pickup/ordering hours, lead/cutoff/capacity/closures and generate a menu-only QR. Table QR ordering keeps its fixed dine-in context.
6. Preview branding, save deliberately, reload the real guest page and test both card and compact presentation.
7. Submit a small actual test order. Verify payment before confirmation, branch-correct POS/KDS/Captain routing, pickup/preparation times, readiness/completion tracking and cash settlement exactly once.

Online payment-pending drafts count against pickup capacity while payable. Canonical cancellation releases accepted unpaid counter reservations. Do not manually free or delete a pending online order until its provider outcome is reconciled; blind expiry could permit both an overbooked slot and a later successful payment.

## Data and reporting

Operations configuration and service requests live in server-owned RLS entities. Ordinary device entity-sync cannot write them. Orders remain `SyncedOrder`; money remains the existing payment attempt/confirmed allocation/refund ledger. Pickup metadata is protected from stale device writes.

Menu reports use UTC calendar-date order cohorts and selected branch scope. Net item collections allocate confirmed collections and refunds proportionally, with integer-paise remainder conservation. Cost/profit stays unavailable without historical cost snapshots. Missing historical category names show Unclassified. Exports contain menu metrics rather than customer contact data and escape spreadsheet formula prefixes.

Custom domains need a separate verified-DNS/TLS/mapping deployment workflow. No arbitrary entered domain is trusted. New service/pickup alerts are in-app; external channel delivery must use an actually configured, consent-appropriate provider.

## Rollback

Disable new optional feature grants/settings first, then redeploy the previous application versions if required. Restore the previous public proxy block if rolling back the new QR entry. Keep orders, confirmed money entries, requests and catalog/history data. The older applications ignore the new private entity types. Do not drop ledger rows, reset customer balances or delete production orders as a rollback shortcut.

The QA database received the additive SQL directly to align its existing test schema. Its historical migration warning is not a production migration result. Production must use its own migration history and the normal `prisma migrate deploy` release process.

# QR product website and restaurant operations

Implemented locally from both supplied briefs. The public product website, administrator workspace and customer QR entry are separate experiences built on the existing platform. Production deployment has not been performed in this task.

## Entry points

| Route | Experience |
| --- | --- |
| `/qr/` | Branded product website, feature explanations and interactive demo |
| `/qr/login/` | Existing owner Restaurant ID/password or manager email/password |
| `/qr/activate/` | Authenticate, then connect an existing licensed restaurant using its management activation key |
| `/qr/recover/` | Existing owner email-code password recovery |
| `/qr/admin/` | Real QR console, branch scope, setup health and operations |
| `/q/<token>` | Existing customer menu, checkout and order status |

The QR entry is a second Vite entry in Restaurant Admin, served by its existing container. It does not create a second password database, order engine, payment ledger or licensing system. `/q/`, `/kiosk/` and the original Restaurant Admin entry keep their own routes. The public demo has no order, payment or administrative API calls; its sample cart is local state.

Owner and manager roles are checked on the server. QR product preference is signed into the activation session and checked again against the current account, key, branch and license before redemption. Single-use redemption and quota locks remain canonical. QR-only management uses an existing `POS_ADMIN` device record and the `QR_ORDERING` entitlement; unrelated inventory/customer resources remain inaccessible. The fresh-browser activation test confirms that the activation key is absent from both rendered content and local storage after activation.

Owners can select restaurant-wide QR scope or an existing branch. Managers remain restricted to their assigned branch. Restaurant-wide requests require a current owner token bound to the same device. Creating/deactivating branches and license/device reassignment remain Super Admin operations under the existing policy. Account recovery reuses the existing owner email OTP service; managers should use their existing administrator-assisted account recovery.

## Functionality

**Standalone workspace and setup.** The existing QR console supplies codes/table mapping, nine print designs, bulk generation/export, canonical orders, payment controls, ordering rules, analytics and existing advanced capabilities. New sections add service requests, pickup scheduling, menu performance and branding. The setup checklist checks the license, active branch, published dishes, valid QR mappings, usable payment method, online readiness, order routing and public URL. Restaurant-wide checks explicitly ask the owner to verify each branch separately. It checks configuration; a small actual order remains the final delivery check.

**Shared menu editing.** QR-only owners can add/edit/delete draft dishes, create/edit/remove empty categories, choose taxes and existing option groups, preview/import CSV variants and add-ons, and publish the shared menu. Import writes option groups before dish records in batches of 50, checks every acknowledgement and reports partial draft failures. Existing SKU/name duplicates are preserved. Saving is a draft operation; publishing is explicit. Existing menus, price snapshots, photos and branch availability remain authoritative.

**Service requests.** Customers with a signed anonymous session can request configured services from a validated table QR and follow their own status. Restaurant, branch and table are derived server-side. Notes are bounded, repeated requests are deduplicated, table cooldowns/open-request limits are enforced under a transaction lock, and other browsers cannot read private notes. Staff in QR Admin, POS and Captain see a shared durable inbox with search, filters, overdue indicators, assignment, activity history and status actions. Transitions and versions are enforced on the server, recorded in history/audit and published through the existing realtime bus. The UI recovers state every five seconds, including after reconnection. New-request notices are deduplicated and respect each branch's quiet hours. An owner acting across branches is recorded as the actor without incorrectly assigning their physical console to another branch's request.

**Scheduled pickup.** Menu-only QR customers selecting takeaway can choose ASAP or valid scheduled slots according to branch configuration. Settings include pickup hours, lead time, cutoff, slot length/capacity, booking horizon, closure dates and instructions. Slots use the branch's configured timezone, including fractional offsets and DST overlaps. Checkout revalidates time and capacity inside canonical order admission. Concurrent requests cannot take the last slot twice. The requested time, timezone and instructions travel in protected order metadata, customer confirmation, staff order lists and shared kitchen tickets. KDS shows pickup and preparation-start times; future orders do not become overdue merely because they were placed early. Repeat sync does not create extra tickets.

**Payment boundary.** Online drafts reserve slot capacity while their payment can still succeed. Unresolved secure checkout attempts cannot be casually cancelled or silently released by a timer. Accepted unpaid counter orders release capacity after canonical cancellation. Existing payment retry, verification, collection and refund flows are reused. Fulfillment and payment remain separate; paid order completion and customer tracking still use the canonical state machine.

**Menu analytics.** Reporting uses real QR orders, integer-paise confirmed collections/refunds and deduplicated session events. It includes item quantity/order count, ordered value, allocated discounts, collected/refunded/net collected money, views/add taps, conversion, completion, categories, ordering modes, branches, daily trend, UTC hour distribution, service activity and CSV export. Reports use the selected branch and UTC date cohort. Financial allocations conserve rounding remainders; full legacy refunds show zero net collection. Cancelled dishes and unpaid online drafts are excluded from accepted item sales. Historical category gaps are labelled Unclassified. Queries page through the database and reject oversized ranges rather than silently truncate them. Profit and cost remain unavailable because orders do not contain reliable historical ingredient-cost snapshots. No inferred margins or automatic menu/price changes are introduced.

**Branding.** Owners can edit their welcome heading/message, footer/button text, logo, cover, accent, safe light background, contact message and card/compact menu presentation. Mobile/desktop style previews cover menu, cart and checkout and cannot submit an order. Save, discard and reset are explicit. Inline raster uploads reuse secure validation/hash storage, reject executable SVG and enforce size limits. Bright accents receive readable foreground text. Extra branding fields are returned only when licensed/configured so the original basic branding response remains compatible.

## Licensing, storage and security

The additive migration `20261010180000_qr_operations_features` registers four optional features in the existing `QR_ADVANCED` catalog:

| Feature | Existing configuration flag |
| --- | --- |
| `QR_SERVICE_REQUESTS` | `qrServiceRequests` |
| `QR_SCHEDULED_PICKUP` | `qrScheduledPickup` |
| `QR_MENU_ANALYTICS` | `qrMenuAnalytics` |
| `QR_BRANDING` | `qrBranding` |

Features require active QR Ordering and are off unless granted. Service and scheduled pickup also require the owner to enable their settings. Existing restaurants keep ordinary ordering when these optional features are disabled.

Private operations settings, requests and extra branding use the existing tenant-RLS entity store, outside device-writable sync types. Pickup reservations use canonical orders rather than another order/reservation ledger. The migration adds scoped request/session and pickup-capacity indexes; no restaurant/order/payment resets or new credentials are required.

New public endpoints are under `/api/v1/public/qr/:token/operations` for options, slots and signed-session request creation/retrieval. New administrator endpoints are under `/api/v1/restaurant/qr/operations` for versioned settings, health, analytics and authorized request actions. Branding extends the existing QR branding endpoint; menu editing uses the existing entity-sync and publication endpoints.

## Verification

- 137 API tests across seven regression suites passed: QR module, operations, authentication, mobile payments, menu control and live availability. The final operations run passed 16 tests, including the additional older-backlog case and assignment/audit checks.
- 48 shared/client/KDS tests across eight suites passed, including pickup projection, future-ticket timing, ticket service permissions, checkout SDK, cart behavior, print decoding, counter settlement and QR licensing.
- 14 compiled-app browser flows passed with no page errors. These cover original ordering/payment retry/verification/collection/status flows plus the new website/demo, owner login, durable requests, branding/CSV, QR-only shared menu/variant import, pickup and fresh activation/logout.
- The final product-only recheck passed all seven browser flows. A separate public-page check passed at widths 320, 390, 768, 1440 and 1920: ordinary scrolling, working mobile navigation, no horizontal overflow, no API requests and no page errors.
- API, Restaurant Admin/QR entry, QR Guest, POS, Captain and KDS builds passed. Existing device/admin large-chunk warnings remain. Public QR entry plus its shared React chunk is approximately 51 KB gzip; administrator code loads on demand.
- The migration catalog and indexes were applied and validated only against the isolated QA database. The guest build was restored to the workspace's normal API origin after browser QA. `git diff --check` passed.

Tests exercise real authentication, RLS, transactions and canonical records in an isolated database. Gateway/SMTP transports are simulated; no real money, customer messages or production data were used. Docker/nginx executables are unavailable in this workspace, so production nginx syntax/reload validation remains a deployment step.

Evidence: [new browser flows](BROWSER_RESULTS.json), [combined browser regression](BROWSER_REGRESSION_RESULTS.json), [public layout checks](PUBLIC_LAYOUT_RESULTS.json), [VERIFICATION.json](VERIFICATION.json), [public website](evidence/qr-product-hero.png), [branded customer menu](evidence/qr-branded-guest.png), [scheduled confirmation](evidence/qr-scheduled-pickup-mobile.png). See [DEPLOYMENT.md](DEPLOYMENT.md) for rollout/configuration.

## Explicit boundaries

Custom domains require verified DNS ownership, restaurant-domain mapping, certificate provisioning and routing isolation; the current shared-domain deployment does not implement that infrastructure. No unverified domain field is presented as functional.

New service/pickup notifications are in-app. This task does not promise delivery through SMS, WhatsApp or browser notifications without a configured transport and consent flow. Safe automatic expiry/release of a potentially payable Standard Checkout reservation needs provider-supported reconciliation; pending reservations remain held until that is resolved. Analytics cannot reconstruct historical ingredient costs or past stock-unavailability periods that were never recorded. These limitations are visible in the product/report rather than represented by fabricated metrics.

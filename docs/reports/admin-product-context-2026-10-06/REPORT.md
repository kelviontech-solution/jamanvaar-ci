# Owner login, separate admin workspaces and kiosk feature recovery

Date: 2026-10-06. Scope: simplify the existing owner console, restore full Kiosk Admin on kiosk-only and combined plans, preserve shared data and enforce actual product permissions. The investigation preceded implementation; see [analysis and history](ANALYSIS_AND_PLAN.md). Owner instructions are in [OWNER_FLOW.md](OWNER_FLOW.md).

## Result and owner journey

One owner account signs into the shared console. Restaurant Admin and Kiosk Admin now have separate names, dashboards, navigation, settings and URLs. This does not create an additional commercial product or standalone application server.

1. Use Restaurant ID and owner password. A new account sets its password from the welcome email.
2. Connect a new device with its existing admin activation key, on the same sign-in form or the subsequent connection prompt. Normal refresh and logout/login reuse the connected device.
3. A Kiosk Admin key selects Kiosk Admin. A sole enabled product opens automatically. Combined plans can switch applications in the header; an undecided first visit offers a chooser.
4. Each tenant remembers each application's last page. Explicit deep links take precedence. Refresh, token restoration, browser back/forward and reopening the browser preserve the workspace. Unlicensed or invalid routes show an explicit gate.
5. Kiosk onboarding links lead through templates/menu, appearance, payments and terminals. Everyday tasks have their own navigation entries rather than being buried in Restaurant Settings.

The local URLs are `http://localhost:5176/restaurant-admin/dashboard` and `http://localhost:5176/kiosk-admin/dashboard`. The root and existing `/pos-admin/` entry remain supported.

## Confirmed problems and fixes

| Severity | Evidence / root cause | Affected flow | Fix and expected impact |
|---|---|---|---|
| High | `02f2451` deleted the standalone Kiosk Admin. Earlier commits moved individual modules into a single Restaurant Admin shell with POS-specific navigation gates. | Kiosk-only and combined-plan owners | Recover existing modules in a distinct Kiosk Admin workspace; full kiosk navigation is available in both plan cases. |
| High | App.tsx used one identity/nav registry, no product route resolver. `6ef32d8` stored one unscoped tab preference. | Login, switching, refresh, deep links | Central product/page registry, URL/history handling and tenant-scoped per-product preferences prevent the wrong dashboard or page from returning. |
| High | A valid merged console is physically POS_ADMIN. That identity was being used as resource authority even when the subscription enabled only KIOSK_ADMIN. | Cloud API, fleet, Local Core | Server subscription checks govern product-specific resources and kiosk-only device controls. Browser preferences do not grant permissions. |
| High | Background sync ran before owner login and requested inventory/customer/shift/reservation resources on kiosk-only plans; an independent inventory heartbeat could restart that work. | Owner console synchronization | Start sync after login and entitlement resolution; gate POS-specific work and clear its transport when unavailable. Shared menu/config/order work remains available. |
| High | Browser repetition produced HTTP 429 on `/tenant-auth/refresh`; legitimate devices shared the public-auth 20/min/IP bucket. | Refresh and cross-device session restoration | Separate refresh bucket keyed by a hashed refresh credential, with an IP ceiling. Password login and activation retain public-auth protection. API tests rotate valid credentials 22 times successfully. |
| High | Branch roster marked physical POS_ADMIN disabled for kiosk-only subscriptions; its uplink still requested POS-only resources. | Local Core authentication and sync | Roster accepts either admin entitlement for the shared physical console. Uplink skips unlicensed resources, resumes them on plan upgrade and preserves pending records. Local HTTP and fleet checks apply the same product boundaries. |
| Medium | First-login labels hardcoded Restaurant Admin and confused account password setup with device activation. A remember checkbox did not implement a preference. | Owner onboarding | Neutral Owner Sign-in, an optional inline activation key and clear connection wording. Remove the ineffective checkbox. |
| Medium | New product paths were absent from proxies and built relative assets would resolve against nested page URLs. | Deployment/deep-link refresh | Add aliases to the existing console service and set the asset base by product root. Built JavaScript/CSS load successfully on all three route roots. |

These are code/history findings and observed local QA outcomes. They are not measurements of AWS latency.

## Recovered Kiosk Admin functionality

Kiosk Admin has **23 registered destinations**, including its dashboard. Browser QA mounted every non-dashboard destination, including the templates dialog.

| Owner task | Available functionality / destination |
|---|---|
| Get started | Kiosk dashboard with real terminal/menu counts, onboarding links and payout summary |
| Build the menu | Categories, item prices/images, selective niche templates, variants/add-ons/tax, priced combos and coupons |
| Design the customer screen | Existing appearance/welcome editor, logo/colours/images/texts; languages, keyboard, idle and token settings |
| Manage service | Orders, live kitchen, tables and staff using the existing shared modules |
| Manage money | Existing Razorpay payment records and settlement setup; gross collection, platform fee, net payable and pending payout |
| Print | Existing receipt editor, printer routing and queue modules |
| Manage terminals | Real device/branch identifiers, last seen/sync metadata, supported sync/diagnostic/lock/logout commands |
| Operate and support | Feedback, relevant reports, sync status, settings, subscription, audit, backup and support |

Restaurant Admin keeps restaurant operations, inventory, CRM, shifts, billing, floor and related reports in its own workspace. Its header does not mix kiosk tasks into POS actions. Kiosk navigation hides restaurant-only CRM, inventory and shift/EOD actions. Shared menu, staff, table, receipt and order records remain shared.

Feature recovery was based on the actual deleted Kiosk Admin and relocation commits, not invented controls. Cashfree was deliberately removed in `883a9cc`; it is not restored. Unsupported font/orientation controls, automatic updates and owner reset/removal APIs are not represented as working features. Remote logout uses the existing command/acknowledgement contract and preserves order history. Razorpay Route remains pending: direct settlement is a request until platform verification/activation, and existing manual payout behaviour remains effective.

## Shared state and synchronization

Verified cross-app chain: load Garlic Bread through the shared menu template, edit its price to 155 in Restaurant Admin, observe 155 in Kiosk Admin and in a separately opened customer Kiosk. Kiosk Admin welcome-heading and receipt-footer edits also reached the customer Kiosk's actual state without reloading it.

Existing entity sync, realtime invalidations and periodic reconciliation remain responsible for publication. Switching applications neither duplicates menu records nor starts an independent data model. Local unpublished edits retain their pending state if publication fails. Local Core keeps branch filtering and the existing offline grace policy; entitlement changes take effect after its next authoritative roster refresh, including after reconnect. Immediate cloud revocation cannot reach a disconnected core, so the existing bounded offline policy remains relevant.

The existing KIOSK_CONFIGURATION record atomically contains shared branding, welcome/display and receipt/printer information. Both licensed owner consoles retain access to this record so Restaurant Admin can publish shared receipts. Customer kiosks retain pull-only configuration access. This change does not claim separate field-level authorization inside that shared record.

## APIs, files and data

Changed API paths/contracts: owner/device activation returns an optional `activatedProduct` hint; `/tenant-auth/refresh` has a separate throttle; `/devices/me/roster` identifies the shared console correctly; `/entity-sync/:entityType`, `/inventory/*`, `/tenant/payment-connection*` and `/devices/me/fleet/*/commands` enforce applicable subscription/tenant boundaries. Existing menu-snapshot authoring accepts the physical POS_ADMIN alias as well as legacy KIOSK_ADMIN.

Main frontend files: `pos-admin/src/adminProducts.ts`, `hooks/useAdminProduct.ts`, `hooks/useEntitlements.ts`, `App.tsx`, `navSections.ts`, `components/kiosk/KioskDashboard.tsx`, header/search/reports components, `cloud/cloudClient.ts`, `main.tsx`, `index.html` and shared `JamanvaarAuthLayout.tsx`.

Main backend/runtime files: `common/security/admin-product-access.ts`, device/tenant guards, refresh throttle and AppModule, tenant-auth service/controller, device commands/devices services, menu-sync controller, Branch Core core/server/uplink, both nginx configs and local_service.cjs. QA adds product-context, cloud API, Branch Core, actual browser and built-route tests.

**No Prisma schema, database migration, subscription AppCode, key format or terminal binding was replaced.** Existing activation expiry/quota, owner-password checks, tenant binding and command acknowledgements remain in force. Remembered workspace state is tenant-scoped and validated against the current server entitlements. Logout clears the access token immediately, preventing an old asynchronous logout response from erasing a newly signed-in token.

## Verification

| Check | Final result | Evidence |
|---|---|---|
| Product context and related runtime tests | 58 passed, 0 failed | `logs/admin-products-runtime-final.json` |
| Cloud product/resource/fleet/entity/device regression | 60 passed, 0 failed, 0 skipped | `logs/admin-products-api-tests.json`, `admin-products-api-tests-complete.log` |
| Branch Core product/configuration/HTTP tests | 39 passed, 0 failed | `logs/admin-products-core-tests.json` |
| Branch Core operations/outage/chaos regression | 36 passed, 0 failed | `logs/admin-products-core-regression.json` |
| Actual Playwright owner and cross-app journeys | 10 passed, 0 failed | [browser-results.json](browser-results.json), screenshots and test-matrix.jsonl |
| Built bundle deep-link routes | 3 passed, no page errors; assets HTTP 200 with correct MIME | [built-route-assets.json](built-route-assets.json) |
| Root TypeScript, Restaurant Admin build, API build | Passed | `logs/admin-products-typecheck-complete.log`, `admin-products-admin-build-final.log`, `admin-products-api-build-complete.log` |

Earlier failed browser attempts remain in the raw matrix: they exposed the real refresh throttle issue and outdated selectors; the final ten journeys passed. During the final API run, the new fixture initially omitted a registered mobile/public restaurant code and failed setup. It now signs in using the supported internal restaurant ID; all six product-authority tests and the other 54 API tests ran and passed. The actual browser suite independently verified owner login using the public restaurant code. QA used isolated test tenants and a dedicated test database, with external payment/email side effects blocked. Test secrets remain in private ignored state, not the report.

## Deployment and remaining verification

Deploy the updated API, owner-console bundle and nginx aliases together. Update/restart the deployed Branch Core through its normal controlled process so it loads the new roster/uplink rules. This work did not stop or restart the user's running backend or Local Core.

The built-route test used a local proxy-equivalent static server; it does not establish that production nginx has been applied or that `nginx -t` passed on AWS. Production load/latency, real Razorpay captures/transfers, physical printers and all-role end-to-end order/payment/refund journeys were not re-certified in this task. The current evidence supports the repaired owner/workspace/sync flows, not a blanket 10/10 production score.

# Kiosk setup: request a key, activate the right device, confirm connection

Implemented and locally verified on 16 October 2026. No GitHub push or production deployment performed.

## Problems found

1. **Request Activation Key did not request a key.** It navigated from Kiosk Terminals to a generic Help & Support list and displayed a toast telling the owner to create a ticket. It supplied no request form, branch context or return path.
2. **Admin access and terminal activation were confused.** The owner already had access to kiosk management inside Restaurant Admin, but the page did not explain that the key belongs in the customer-facing kiosk application.
3. **Fleet failures looked like an empty installation.** The polling hook swallowed errors and exposed only an empty array, producing “No Kiosk Terminals” during failed requests.
4. **The kiosk could activate a different restaurant than the typed ID.** It resolved the typed ID, then redeemed the key without enforcing that relationship and displayed a mismatch note after connecting. The guided branch handoff also needed to reject a key for another branch.
5. **New restaurants without a mobile number could receive an unusable ID.** Their random ID could start with digits 1–5, while kiosk/lookup validation accepts 6–9. The generator now produces IDs accepted by those validators. Existing stored IDs are not rewritten.

## New owner flow

Open **Restaurant Admin → Kiosk Terminals**, or the same Terminals page in Kiosk Admin.

The page explicitly says **Kiosk management is ready**: the owner uses the current admin login, with the existing plan-controlled kiosk menu, appearance and welcome-screen tools. No additional admin-console key is required for those tools.

Three visible steps provide the next actions:

1. **Get a kiosk key.** Request one directly on this page. The form asks for a terminal name and optional notes; the existing tenant support API attaches the restaurant, branch and current admin device. It creates a real ONBOARDING request and displays its ticket number. It does not issue a key or activate a device. Existing open requests survive reload and can be opened, read and replied to without leaving kiosk setup. An additional kiosk can have its own request after explicit confirmation that it is separate from the existing request; older requests remain accessible.
2. **Enter it on the kiosk.** “I already have a key” opens and focuses a specific guide. The page displays the real Restaurant ID, with a copy action, a customer-kiosk link and an app-download shortcut. On the actual touchscreen, open **Customer Kiosk → Activate Your Kiosk**, enter **Restaurant ID + KIOSK activation key**, then activate. The page explains when to copy the link to a different physical device.
3. **Check the connection.** Keep Admin open and use Check for connected kiosks. The roster also refreshes every 30 seconds and on window focus. Appearance and menu shortcuts use the existing admin session.

The request form preserves entered details on failure and rechecks request history before another submission. Request-history failures prevent a blind repeat submission. This is interface-level duplicate protection; the generic support API is not a new idempotent key-issuance engine.

## Activation and access

- The setup link contains only Restaurant ID and branch ID. It never carries an activation key, password or session credential. Incoming query/fragment data is removed when constructing the link.
- The kiosk pre-fills the Restaurant ID and asks for the key locally on that device.
- Optional `expectedRestaurantId` and `expectedBranchId` constraints are checked by the existing redemption transaction. A mismatch rejects activation and leaves the key unused. Existing clients that omit these constraints retain compatibility; a key's existing tenant, product, device-quota and licensing checks remain authoritative.
- Wrong-app and wrong-branch errors have safe, actionable copy. Raw server details are not displayed.
- The new owner/manager-only `GET /api/v1/tenant/me/kiosk-setup` returns only the authenticated restaurant's name, Restaurant ID and configured public kiosk URL. A device credential alone cannot access it.
- Support list responses include their existing branch ID so the page can distinguish same-restaurant requests belonging to different branches.
- Fleet data/loading are reset on branch changes. Errors are shown with Retry; failed loads no longer claim there are no terminals. Existing data may remain visible with a failure warning.

Keys remain issued by the existing authorized platform workflow. A support request does not bypass plan limits or create an admin entitlement.

## Verification

| Check | Result |
| --- | --- |
| Real Chrome browser scenarios | **10/10 passed**: clear setup/default access; failed request retains fields; actual branch request and reload recovery; in-page replies/back; safe kiosk link and pre-filled ID; wrong-app/branch rejection; actual key activation and fleet discovery; fleet failure/retry; welcome-screen shortcut and mobile guide in viewport; acknowledged additional-kiosk request |
| API integration | **31 passed**, three suites: activation redemption, kiosk management and support tickets. Added assertions cover setup endpoint authorization/response minimization, branch-scoped request persistence, no key issuance from a request, generated ID format and mismatch rollback before successful activation. Existing concurrent redemption and remote logout tests passed. |
| Client tests | **43 passed**, four files: six setup/link/error tests, fleet-client regression, welcome and configuration regressions |
| TypeScript | Restaurant Admin and Kiosk passed |
| Production builds | API, Restaurant Admin and Kiosk passed. Existing Vite large-chunk/mixed printer-import warnings remain. |

Browser tests use real authentication, API support records, a platform-issued QA key, actual kiosk activation and the real branch fleet. They run on an isolated test database with external transports blocked/captured. No production customer message, order, payment or device activation was performed. Physical touchscreen/EXE/APK acceptance was not performed.

Evidence: [browser results](evidence/browser-results.json), [desktop setup](evidence/request-pending-after-reload.png), [mobile key-entry guide](evidence/setup-mobile.png), [connected terminal](evidence/connected-terminal.png).

Reproduce with the existing isolated local QA API/static servers:

```powershell
node docs/reports/kiosk-setup-flow-2026-10-16/verify.cjs
node docs/reports/kiosk-setup-flow-2026-10-16/browser.cjs
node node_modules/vitest/vitest.mjs run tests/kiosk_setup_flow.test.ts tests/pos_admin_kiosk_fleet_client.test.ts tests/kiosk_welcome.test.ts tests/kiosk_configuration.test.ts --maxWorkers=1
```

## Deployment/configuration

Deploy the **API, Restaurant Admin/Kiosk Admin bundle and Customer Kiosk bundle together**. No database migration is needed for these changes.

- Default public kiosk address comes from the existing `QR_ORDER_BASE_URL` origin at `/kiosk/`.
- Optional backend `KIOSK_WEB_URL` supports a separate kiosk host/path; Compose now forwards it. No credentials belong in this URL.
- Optional frontend `VITE_KIOSK_WEB_URL` overrides the launch address for a custom build or local QA. Vite development otherwise uses this repository's kiosk dev server on port 5174. The QA build used port 5314.
- If no valid public URL is configured, the page still explains how to activate the installed kiosk app and exposes App Downloads; it does not invent a production link.
- Any Restaurant ID generated with an invalid leading digit by an older deployment needs a separate reviewed data repair. This change fixes new creation and does not silently change existing restaurant identities.

## Changed source files

- `apps/restaurant-system/pos-admin/src/components/kiosk/KioskSetupPanel.tsx`
- `apps/restaurant-system/pos-admin/src/components/kiosk/kioskSetup.ts`
- `apps/restaurant-system/pos-admin/src/hooks/useKioskFleetPolling.ts`
- `apps/restaurant-system/pos-admin/src/components/support/SupportTicketsModule.tsx`
- `apps/restaurant-system/pos-admin/src/App.tsx` and `src/cloud/cloudClient.ts`
- `apps/kiosk-system/kiosk-user/src/{App.tsx,activationErrors.ts,cloud/cloudClient.ts}`
- `cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts`
- `cloud/api/src/modules/support-tickets/tenant-support-tickets.service.ts`
- `cloud/api/src/modules/activation-keys/{activation-keys.service.ts,dto/activation-key.dto.ts}`
- `cloud/api/src/modules/restaurants/restaurants.service.ts`
- `cloud/api/test/activation-redeem.e2e.spec.ts`, `tests/kiosk_setup_flow.test.ts`
- `docker-compose.yml`

Existing unrelated functionality was preserved; this work does not introduce another admin login or change signing identities.

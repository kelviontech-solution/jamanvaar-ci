# Merged Restaurant Admin kiosk management — 6 October 2026

The kiosk-only plan can use the merged Restaurant Admin console with a KIOSK_ADMIN activation key. Its kiosk controls are available without granting POS billing or other POS-only features. Kiosk content, receipts and generic combos now have dedicated editing and publication paths. Restaurant Admin can request a safe remote kiosk logout.

## Confirmed causes and changes

| Severity | Confirmed problem / evidence | Main files | Change and expected effect |
| --- | --- | --- | --- |
| High | The merged console used POS_ADMIN device identity while the restaurant had only KIOSK_ADMIN entitlement; the guard rejected that valid merged use. Eight merged-access API regressions cover this contract. | `cloud/api/src/common/guards/device-auth.guard.ts`, `application-entitlements.service.ts` | Accept either valid console entitlement for the merged console, including device-quota accounting; keep plan-specific features gated. |
| High | Kiosk-only navigation hid menu authoring, and the console lacked generic customer wording/appearance and combo editing. | `pos-admin/src/navSections.ts`, `hooks/useEntitlements.ts`, `KioskContentPanel.tsx`, `KioskComboPanel.tsx` | Expose shared menu/modifier/tax editing plus kiosk-specific appearance, content and combo panels. |
| High | Presentation and receipt changes were local settings without a complete branch-scoped cloud-to-kiosk publication contract. | `packages/database/src/kiosk_configuration.ts`, `packages/sync/src/kiosk_configuration.ts`, cloud `entity-sync`, Branch Core `core.ts` / `uplink.ts` | Publish one validated branch configuration, apply settings together, reject stale/foreign-branch data, preserve unpublished edits, reset on tenant change. Kiosks remain read-only authors. |
| High | The console command client used the wrong fleet endpoint/body, and a Branch Core connection could hide cloud-issued commands. | `pos-admin/src/cloud/cloudClient.ts`, `packages/sync/src/heartbeat.ts`, cloud `device-commands.service.ts` | Use the tenant fleet endpoint and commandType; check cloud commands on the existing heartbeat cycle while retaining LAN command verification. |
| High | A destructive logout could lose active payment state or unsent orders if performed before acknowledgement. | Kiosk `App.tsx`, `packages/sync/src/device_commands.ts`, cloud `device-commands.service.ts` | Refuse logout during payment/fulfilment or with remaining unsent work. Freeze new checkout while preparing logout; acknowledge before clearing activation. Retain saved orders. Failed acknowledgement releases the UI and rechecks safety on redelivery. |
| Critical | Browser testing found that the old token could still return HTTP 200 after a successful logout because of the authentication cache. A concurrent old ACTIVE lookup could repopulate an invalidated cache. | cloud `device-commands.service.ts`, `common/guards/device-auth.guard.ts` | Revoke kiosk credentials and refresh tokens transactionally on successful acknowledgement; publish invalidation after commit; suppress caching a lookup spanning an invalidation. Browser result now HTTP 401; cache and concurrency API regressions pass. |
| High | Editable promotional bundles needed a real priced menu item; otherwise checkout and advertised amounts could diverge. | `packages/database/src/kiosk_combo_authoring.ts`, `repositories.ts`, Kiosk `App.tsx` | Create/update a backing MENU_ITEM with the bundle price/tax, validate components, propagate availability and preserve allergens/dietary classification. Shared menu edits update the linked advertised combo. |
| Medium | Cloud-generated receipt PDFs did not consistently consume the branch's published receipt settings. | cloud `notifications/receipt-email.service.ts`, `receipt-pdf.util.ts`, `receipts.controller.ts` | Read validated branch configuration, honour email enablement, use edited footer/thank-you text and tax visibility while retaining server-derived identity and totals. |

Paths in the table are relative to the repository; shortened frontend paths belong under `apps/restaurant-system/pos-admin/src`, and Kiosk App belongs under `apps/kiosk-system/kiosk-user/src`.

## Where to manage the kiosk

- **Menu & Categories:** items, categories, images, prices, availability and existing menu controls.
- **Customisations & Tax:** modifiers and applicable tax setup.
- **Kiosk Appearance & Content:** logo URL/upload, accent colour, welcome heading/subtitle/button/support text, background image, promotion banner, artwork visibility, idle warning/reset timing, and customer wording overrides in seven supported languages. This includes checkout/payment/confirmation/help labels and chat suggestions.
- **Kiosk Combos & Deals:** create or edit bundles from the restaurant's own items; price, tax group, image, description, translated name/description, availability and featured promotion. New bundles use authoritative priced menu items.
- **Receipt & E-Bill:** receipt preview, 58/80mm size, logo, footer, thank-you message, tax/token/customer detail visibility and delivery controls. Restaurant legal details continue through restaurant settings.
- **Kiosk Terminals:** select **Log out kiosk**, confirm, and inspect the command result. An offline kiosk receives an unexpired request after reconnect. A busy kiosk refuses the request with an explanation; issue another request after completing the payment.

These controls edit supported customer content and receipt options within the existing layouts. This is not an arbitrary page-layout builder. Gateway QR content, payment amounts, security checks and provider-controlled screens remain derived from their authoritative services.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Actual Chromium/Playwright merged Admin → customer Kiosk | **8 passed, 0 failed** | `browser-results.json`, screenshots under `evidence/`; harness `tooling/qa/browser-kiosk-management.cjs` |
| API regressions, including merged activation, branch/auth enforcement, receipt PDF and command revocation | **38 passed, 0 failed** | `logs/kiosk-management-api-tests.json` |
| Full runtime suite at the broader regression checkpoint | **1,416 passed, 0 failed** | `logs/kiosk-management-final-runtime.json` |
| Final focused runtime checks including subsequent combo and Branch Core isolation changes | **47 passed, 0 failed** | `logs/kiosk-management-final-focused.json`; overlaps the full suite and is not additive |
| Root TypeScript check | Passed | `logs/kiosk-management-final-typecheck.log` |
| API / Restaurant Admin / Kiosk builds | Passed | `logs/kiosk-management-api-build.log`, `kiosk-management-admin-build.log`, `kiosk-management-final-kiosk-build.log` |

Browser coverage:

1. Kiosk-only merged navigation, menu and receipt access; POS billing absent.
2. Real KIOSK activation and device authentication (HTTP 201).
3. Publish appearance, welcome, promotion and language-screen wording; receive without kiosk refresh.
4. Publish receipt footer, thank-you text and 58mm configuration; apply on the kiosk.
5. Reload and retain published appearance/wording.
6. Author a generic ₹90 combo through the console; verify its cloud menu price.
7. **Simulated** customer payment: refuse logout while busy, render the edited paid receipt, verify exactly one synced paid order at **9,000 paise**.
8. Queue logout while kiosk offline, reconnect, acknowledge, return to activation and reject the old credential with **HTTP 401**.

Measured publication-to-visible kiosk update: **253 ms** in the final local browser run. The reconnect/logout case took approximately **16.2 seconds for the whole scenario**, including disconnect, request and heartbeat wait; it is not a production latency measurement. The existing 15-second reconciliation/heartbeat path remains the fallback when the realtime wakeup is missed. Network or backend downtime can make propagation longer; pending saves remain dirty for later publication. Cloud commands expire after 24 hours by default.

Tests used an isolated QA database, authenticated restaurant/device sessions and a simulated gateway. They did not transfer real funds, deliver real email/SMS/WhatsApp, alter the user's restaurant data, or measure AWS. API receipt tests capture and inspect generated PDFs. Raster PNG/JPEG inline logos can be embedded in PDFs; remote URL/WebP PDF logo rendering is not implemented, and the server does not fetch arbitrary image URLs. Physical printing and provider delivery need configured hardware/services. Builds retain existing bundle-size warnings.

`test-matrix.jsonl` and network/console evidence preserve earlier attempts, including harness corrections and the original auth-cache failure. `browser-results.json` identifies the final eight successful checks; the report does not count earlier failures as passing.

## Local Core runtime and remaining verification

The Local Core source/pairing fixes and isolated browser verification are recorded in `../local-core-connection-2026-10-06/REPORT.md`. A running cloud API is separate from a paired LAN relay. At the final listener check, API port **4000** was listening and relay port **5178** was not. The current Local Core badge cannot show Connected until that service runs and the activated device is paired with its PIN.

Automatic approval review previously rejected restarting the user's existing Local Core process, without a detailed reason. No restart was performed. Start/restart Local Core manually with `npm run dev:sync`; refresh the activated app and pair using the console PIN. The running user backend must also load the updated API code before these backend changes take effect; QA used its own updated server. No production deployment was performed.

Still requires external verification: AWS/ALB/Nginx timing, real gateway callbacks/Route settlement, production multi-instance invalidation, actual printer output and configured email/SMS/WhatsApp delivery. Razorpay Route remains pending, as requested earlier; this task does not activate direct settlement or change commission policy. Passing local checks does not establish a universal 10/10 production score.

# Simpler restaurant administration

Scope: the seven improvements and five additions in the 16 October flow review. Changes are local; this work does not deploy or push to GitHub.

## Owner workflows

- Full-suite restaurants continue to use one owner console. Kiosk-only accounts keep the smaller Kiosk Admin console; old welcome and appearance URLs remain valid.
- Today has one **Launch & handover** workspace alongside the business dashboard. Kiosk-only owners see launch steps first; full-suite owners keep urgent business tasks first. The former stacked kiosk dashboard, onboarding card and menu-launch card are no longer mounted there.
- **Customer experience** groups Welcome & language, Menu & checkout, Payments, Receipt, effective menu review and a private guest rehearsal. The sidebar points at this workspace instead of separate welcome/appearance entries.
- Super Admin restaurant details start with a six-step setup guide. Primary tabs cover overview, products, branches, devices, owner access and support. Occasional configuration, finance and history remain under an expandable advanced section; existing deep links remain supported.

## Requested improvements

| Request | Implementation |
|---|---|
| Understandable licensing | Readiness shows restaurant access, branch access, configuration and verification separately, with the actual entitlement reason and next task. A configured screen or recorded test cannot grant access. |
| Protect unfinished kiosk edits | Welcome, language, appearance/wording and receipt editors offer Keep editing, Discard and Save draft. Drafts are scoped to restaurant, branch, signed-in owner/manager and editor/terminal. Restoring a draft loads a preview; publishing remains explicit. Navigation, browser Back and branch changes use the existing asynchronous leave contract. Refresh saves a presentation draft and triggers the browser's native leave warning. Payment credentials and activation keys are excluded. |
| Prefill branch license edits | The form selects the currently effective, non-cancelled allocation, preserving enablement, quota, expiry and disabled features. Future revisions do not overwrite the current form. A replacement gets a fresh effective time; existing review/hash, impact acknowledgement and revision checks remain required. |
| Branch-aware device previews | A read-only platform endpoint computes restaurant and selected-branch counts/caps using the same service as activation. Switching branches reloads the preview and ignores stale responses. QR consoles preview their actual POS_ADMIN device identity. New keys are checked at issuance and again during redemption; replacement keys retain the existing seat-exchange flow. |
| Conditional launch checklist | Branch-scoped, audited service choices let takeaway restaurants omit table setup and paperless restaurants omit printer guidance. Choices are versioned and reject stale writes. They do not change actual order or receipt settings. Channel tests reuse existing paid/completed-order acceptance evidence. |
| Unified design controls | The Customer experience workspace mounts the existing editors and preserves their publication, image-entitlement and terminal-scope checks. Merchant-account changes have an explicit restaurant scope explanation. |
| Published versus received | The summary distinguishes published menu/configuration versions from device-reported menu versions and successful configuration command acknowledgements. Offline, waiting, expired and failed delivery remain visible, with a route to kiosk sync/retry controls. |

## Requested additions

| Addition | Implementation |
|---|---|
| Why unavailable? | Product rows show entitlement or setup/test reasons and link to Subscription, Menu, Devices or Channel acceptance. Effective-menu review lists hidden dishes with channel, category, branch, tax, archive or stock reasons. |
| Issue a key from its request | New requests carry a typed kiosk request event. Super Admin can issue a seven-day branch-scoped key from the ticket after review. The transaction checks device-provisioning permission, products and capacity, serializes concurrent retries and records only the key ID in the ticket/audit. A retry returns the existing issuance without minting another key. The bearer code is shown to the authorized issuer, never inserted into the restaurant's thread. Existing branch-scoped kiosk request tickets remain supported. |
| What customers can order | An authenticated, branch-scoped POS/Kiosk/QR preview uses the published snapshot, shared channel rules and live availability exclusions. It is available from Launch & handover, including for POS-only owners, and from Customer experience. It identifies its source and menu version. Offline terminals can retain an older local menu until synchronization; this preview is not proof of terminal receipt. |
| Launch and handover summary | Both consoles read the same branch readiness service. The owner summary combines product stages, service choices, channel acceptance, kiosk delivery and existing receiving-user handovers. Existing Operations acceptance/handover actions remain authoritative. |
| Private kiosk journey | A local rehearsal uses the welcome/language renderers and published kiosk dishes, then cart, simulated payment cancellation/success/counter choice and receipt entry with the shared touch keyboard. It creates no real order, payment or message. It is clearly labelled simulation and does not replace real payment, printer or receipt-provider acceptance. |

## Additional defects corrected during implementation

- Channel acceptance now respects branch product allocations rather than listing every restaurant-wide channel.
- Setup preference controls update visibly while saving and recover their previous state on failure.
- A valid acceptance record is checked against its paid, completed order directly, so recording more than 100 subsequent orders does not erase older valid launch evidence.
- Configuration receipt checks search the published version directly, so later unrelated sync commands cannot hide a valid acknowledgement.
- Restored drafts are checked for compatible shape; an older publication version triggers a review warning.
- Operations shortcuts preserve their requested task when entering the Operations hub.
- Channel preview does not incorrectly apply QR category visibility to POS or Kiosk; kiosk-only visibility and archived dishes are respected.
- Customer-menu image references resolve against the configured API host.
- The touch keyboard close control has an accessible name.

## Data and security

No schema migration or signing/package change is introduced by these changes. Existing `SyncedEntity` operations records hold server-owned launch preferences; existing ticket events hold request/issuance metadata. Tenant endpoints require an owner/manager session and an authorized active branch. Platform routes retain their existing area permissions. Ticket issuance additionally checks device-write permission. No new guest ordering or payment authorization path is introduced.

## Verification

Final local results:

| Check | Result |
|---|---|
| Browser acceptance | **12/12 passed** in real Chrome, using the actual API and built apps |
| API regressions | **35/35 passed** across four files, including the new branch/launch/issuance tests |
| Client regression set | **72/72 passed** across seven files; the standalone fleet-client test also passed (**1/1**) |
| Final draft/router/delivery controls | **9/9 passed**, included in the client set above |
| API release build | Passed |
| Restaurant/Kiosk Admin, Customer Kiosk and Super Admin Vite builds | Passed |
| Restaurant/Kiosk Admin and Super Admin TypeScript checks | Passed |
| Whitespace check | `git diff --check` passed |

One combined client run timed out while importing the existing fleet client's full application dependency graph; its isolated rerun passed. Navigation authorization was extracted into a pure module so those checks no longer load the cloud/database stack. Build warnings remain for existing large chunks and the printer module's mixed static/dynamic imports; the builds succeeded. The isolated API warns about its pre-existing migration-history mismatch because its test schema has been prepared separately. This run did not inspect or modify the production database.

The browser run covers the full-suite owner, conditional takeaway/paperless setup, welcome draft save/restore/discard, appearance departure protection, receipts in Customer experience, empty and published channel preview, payment cancellation with cart preservation, touch receipt entry, mobile layout after sidebar transition, Super Admin setup and branch selection, scoped request-to-key issuance, direct Operations handover navigation, saved branch allocation prefilling, branch quota refresh, and the kiosk-only console.

Readiness records show configuration and recorded channel evidence. Device connectivity/delivery are reported separately. A green recorded test is not a guarantee that an external payment or printer provider is currently healthy.

Reproducible entry points:

- `node docs/reports/admin-flow-implementation-2026-10-16/verify.cjs` — isolated-database API regression tests; reads existing ignored QA configuration without printing credentials.
- `tests/admin_flow_controls.test.tsx` — actual allocation selection, channel filtering and draft leave/recovery behavior.
- `tests/admin_product_context.test.ts` and `tests/pos_admin_nav_gating_real_data.test.ts` — product routes and sidebar authorization.
- `browser.cjs` — real Chrome against local built owner/Super Admin applications and isolated API. Screenshots/results are under `evidence/`.

Real payment-app return, physical touchscreen/printer behavior and offline device catch-up still require acceptance on the restaurant's actual devices. The rehearsal deliberately cannot verify those integrations.

No production deployment or GitHub push was performed.

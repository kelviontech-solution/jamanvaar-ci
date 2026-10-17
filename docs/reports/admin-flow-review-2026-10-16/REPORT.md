# Super Admin, Restaurant Admin and Kiosk Admin flow review

16 October 2026. Source baseline: `1fbe9342`, plus current working-tree changes.

This is an analysis and recommendation report. Application code was not changed for this review. Evidence comes from the current source and recent local browser acceptance results, including the 10 kiosk-setup scenarios. This is not a new all-page browser audit, production acceptance, or an observation study with restaurant staff. Source-based risks below need focused browser reproduction before being reported as newly verified runtime defects.

## Overall recommendation

Keep the existing unified restaurant-owner console. A restaurant buying POS, Captain, KDS, Kiosk and QR should manage its purchased modules with one owner account. Kiosk-only customers can retain the smaller Kiosk Admin workspace; standalone QR customers can retain QR Admin. Products remain independently licensed, and operational POS/Captain/KDS/customer-kiosk apps remain separate.

The main remaining friction is completing one job across several pages, overlapping setup checklists, and unclear distinctions between purchased, configured, published, delivered and ready. More dashboard pages would increase this friction.

## What already exists

Do not reimplement these as if missing:

- Unified owner routing with Restaurant Admin/Kiosk Admin components and product-aware navigation: `adminProducts.ts`, `navSections.ts`.
- Resumable Super Admin onboarding, device provisioning and welcome kit: `OnboardRestaurantPage.tsx`.
- Branch product restrictions, effective times, limits, review and impact preview: `BranchLicensing.tsx`.
- Actionable unpaid-bill, delayed-order, unavailable-dish and device tasks: `AttentionTasks.tsx`.
- Plan-aware launch checklist and a real paid/completed-order attestation: `PlanOnboarding.tsx`.
- Operations tools for recovery, payment exceptions, recurring menus, approvals, checklists, handovers, configuration restore, transfers and more: `OperationsConsole.tsx`.
- Kiosk welcome/language backgrounds, preview, terminal overrides and configuration acknowledgements.
- QR restaurant-page designs, publishing, mobile preview, branch scope and landing-page plan controls.
- Direct kiosk activation requests, in-page replies, correct-device instructions and fleet recovery from the latest setup fix.

## Recommended Super Admin flow

**Choose restaurant → Products & plan → Branch setup → Device setup → Readiness → Owner handover.**

Global pages remain available for platform-wide work, but the restaurant workspace should be the default place to complete a customer task.

| ID | Priority | Finding / current friction | Recommendation and acceptance condition |
| --- | --- | --- | --- |
| S01 | High | A restaurant detail has separate Subscription, Applications, Plan Quotas and Feature Entitlements tabs, with QR/AI controls also available in product-level pages. Understanding effective access requires several concepts. | Present one **Products & plan** view with Purchased, Branch-enabled, Configured and Ready states. Explain a locked feature with its actual cause and exact authorized fix. Retain advanced controls under one expandable section. An operator should answer “why is this branch's page builder locked?” from this view. |
| S02 | High | Branch licensing exists, but its form uses an always-checked enable checkbox, blank quota and current-time defaults rather than pre-filling the selected allocation. The preview/acknowledgement mitigates final writes, but editing can start from misleading values. | Load the selected product's current effective allocation into controlled fields. Separate **Edit override** from **Return to restaurant defaults**. Product switching must not carry unrelated edits forward or silently reset limits/features. Verify a disabled product and a limited branch can be opened and reviewed without proposing changes. |
| S03 | High | Activation-key quota preview counts the restaurant's devices by type and uses application/plan limits. The refresh effect depends on restaurant and device type, not selected branch. It can disagree with effective branch limits. | Obtain a server-computed branch/product quota preview and refresh it when branch, application or replacement target changes. Explain registered devices versus reserved/pending keys if reservation is implemented. A quota warning must match the backend's actual admission decision. This finding is about misleading preview, not a proven backend quota bypass. |
| S04 | Medium | Onboarding has seven stages and provisions a list of device types, one iteration per selected type. Several counters/screens of the same type require further provisioning work. Partial provisioning can finish with warnings; recovery controls already exist. | Offer **Quick setup** and **Custom setup** over the same backend. Allow a branch/device matrix, e.g. 3 POS, 2 KDS and 2 kiosks, with readable terminal names. End with **Account created / Setup incomplete / Ready for handover**, preserving partial progress and existing retry safety. |
| S05 | Medium | A kiosk activation request is still a generic onboarding ticket. The platform ticket modal can open the restaurant, change status and reply, but has no request-specific fulfillment action. | Add typed requests and a scoped **Issue kiosk key** action in the ticket. Pre-fill restaurant, branch and requested terminal, check effective entitlement/quota, issue through the existing key service, deliver through an approved secure channel and record fulfillment. Support staff without issuance permission must hand off rather than gaining permission through the button. |
| S06 | Medium | The global navigation contains many separate business, SaaS, fleet, payment and support destinations. Role filtering exists, but task context is still distributed. | Prioritize Restaurants, Requests, Devices, Billing and Alerts for daily work. Keep catalog/release/policy configuration under Platform setup. Preserve selected restaurant and branch when following related actions, with a clear Back to restaurant action. |

Evidence: `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx` (tabs near lines 85–127); `pages/Branches/BranchLicensing.tsx` (form near lines 80–135); `pages/ActivationKeys/GenerateActivationKeyModal.tsx` (quota effect near lines 60–86); `pages/Onboarding/OnboardRestaurantPage.tsx` (steps near line 77 and provisioning near line 510); `pages/Tickets/TicketDetailModal.tsx`; `layout/ProtectedLayout.tsx` (navigation near line 126).

## Recommended Restaurant Admin flow

**Today → Resolve urgent work → Orders / Menu / Customers / Devices → Occasional setup.**

Preserve the current daily sidebar and actionable dashboard. Improve how existing modules connect rather than introducing a second owner dashboard.

| ID | Priority | Finding / current friction | Recommendation and acceptance condition |
| --- | --- | --- | --- |
| R01 | High | Setup guidance is spread among the business dashboard, Plan Onboarding, Menu Launch Check, QR setup and kiosk-specific setup. A kiosk-only home can render an additional Kiosk Dashboard underneath the business dashboard. | Use one **Launch setup** record per branch, with channel sections. Show only incomplete/changed checks after launch. The daily home should contain urgent tasks first, a compact setup reminder when needed, and optional business summaries. Completing a check elsewhere must update this same status. |
| R02 | High | Plan onboarding treats tables, staff and printer setup as required whenever POS_ADMIN is included. A takeaway-only or paperless business can receive irrelevant steps. Its final test is one paid/completed order rather than a complete channel-specific summary. | Ask about service modes and receipt/payment choices. Make irrelevant steps Not required, not permanently incomplete. Reuse existing channel acceptance checks; distinguish POS, Captain, Kiosk and QR routing, online payment and receipt delivery. An informational restaurant page should not require a paid order merely to publish contact information. |
| R03 | High | QR editing has explicit unsaved-navigation handling. Kiosk welcome editing protects a scope switch, but the inspected page-navigation handlers protect QR specifically. Kiosk content/welcome drafts live in component state. | Add a shared draft/leave mechanism across editable settings: Save draft, Publish, Discard and Keep editing. Recover non-sensitive drafts after refresh where appropriate. Verify editing a welcome message then clicking Orders, browser Back, or changing branch cannot silently discard work. Do not autosave passwords or activation keys. This risk is source-derived and was not reproduced in a fresh browser test during this review. |
| R04 | Medium | Menu data are shared, while availability and publication differ by branch/channel. Existing scope notices explain this, but the owner must mentally combine draft, published menu and terminal state. | Add **What guests can order**: choose branch and channel, inspect the effective menu, prices, photos, modifiers and unavailability reasons. Show the reviewed publication differences and affected devices before applying. Use canonical publication/availability rules rather than a separate preview calculation. |
| R05 | Medium | Role differences have begun: managers get operational emphasis and some Operations tasks are owner-only. Many tools still sit together in the broader admin workspace. | Extend existing role rules into a focused home: owner gets collections/outstanding amounts and business results; manager gets service/recovery; the responsible staff member gets assigned actions. Preserve permissions on the server. Do not create a new role system merely to change layouts. |
| R06 | Medium | Financial pages cover sales, confirmed collections, unpaid balances and merchant payouts. These are different business questions and should not be blended into one revenue number. | Use consistent captions and drilldowns: **Sales**, **Money collected**, **Customers still owe**, **Provider settlement pending**. Every amount should show period/date basis, branch and source. Reuse the existing ledger and exception tools; this recommendation is about comprehension and reconciliation, not evidence that every current financial calculation is wrong. |

Evidence: `apps/restaurant-system/pos-admin/src/App.tsx` (dashboard composition near lines 821–823; QR-only navigation guard near line 234); `components/dashboard/{PlanOnboarding,MenuLaunchCheck,AttentionTasks,BranchBusinessDashboard}.tsx`; `components/settings/{SettingsScopeNotice,KioskContentPanel,KioskWelcomeScreenPanel}.tsx`; `components/operations/OperationsConsole.tsx`.

## Recommended Kiosk Admin flow

**Launch setup → Menu → Customer experience → Payments → Connect device → Test the journey → Daily operations.**

| ID | Priority | Finding / current friction | Recommendation and acceptance condition |
| --- | --- | --- | --- |
| K01 | High | Customer-facing presentation is split among Welcome screens, Appearance & Content, payment settings and receipts. Owners must know which editor controls each screen. | Create one **Customer experience** workspace with tabs for Welcome, Language, Menu, Checkout, Payment, Confirmation and Receipt. Reuse existing editors/renderers. Keep global theme, branch settings and terminal overrides labelled. A user should find a field by the screen on which it appears. |
| K02 | Medium | The Kiosk Dashboard's design shortcut opens Appearance, while welcome/language backgrounds live in another editor. Its available-item count filters local items by `isAvailable`, without demonstrating the effective published kiosk menu. | Route the design shortcut to the combined experience workspace. Replace ambiguous availability counts with **Published and orderable on kiosks**, derived from the same effective menu as the kiosk. Explain unpublished, hidden, out-of-stock and unsynced items separately. |
| K03 | High | Welcome publishing already shows server publication and per-terminal acknowledgements. Equivalent cross-screen delivery status is not presented as one cohesive branch rollout. | Extend the existing delivery mechanism into a compact **Changes reaching devices** panel: server version, expected devices, acknowledged version, failure/retry and offline devices awaiting connection. Do not describe Published as proof that every kiosk has received the change. |
| K04 | Medium | Device setup now gives a direct activation path, but activation alone cannot establish printer/payment/menu readiness. | Add a short **Ready to serve** check per device: actual menu received, photo availability, chosen payment readiness, applicable printer test and a real routed test order. Keep manual attestations distinct from server/device evidence. Link every failure to its exact recovery action. |
| K05 | Medium | An owner can preview welcome/language presentation, but testing the complete customer journey still requires moving among tools or using the live terminal. | Add a private **Customer journey rehearsal** for all kiosk screens and languages, including long dish names, empty categories, cash-at-counter, payment dismissal and receipt entry. Clearly mark simulated behavior. It must not create production orders, collections or loyalty points. Extend existing training/preview tools instead of inventing another order engine. |

Evidence: `components/kiosk/KioskDashboard.tsx` (setup shortcuts and item count near lines 16–28); `components/settings/KioskWelcomeScreenPanel.tsx` (scope, preview, publication and delivery); `components/settings/KioskContentPanel.tsx`; `components/kiosk/KioskSetupPanel.tsx`.

## Features worth adding or extending

These are prioritized capabilities, not a request to create six more sidebar pages:

1. **Effective-access explanation.** One human-readable answer to why a product is unavailable: plan exclusion, restaurant override, branch restriction, expired license, rollout, device quota or incomplete setup. Offer the correct authorized next action.
2. **Typed request fulfillment.** Extend support into tracked key issuance, device replacement and access requests. Preserve existing authorization, one-time-secret handling and audit trails.
3. **Unified branch launch/handover.** Combine existing readiness checks and channel acceptance into one launch summary. Record what was tested, when and against which configuration; invalidate only the checks affected by later changes.
4. **Protected drafts across editors.** Consistent leave/recover/review behavior, scoped by restaurant, branch, user and target device where relevant. Avoid storing credentials in drafts.
5. **Effective customer-menu preview.** Show exactly why one dish appears on POS but is hidden or unavailable on QR/Kiosk for a selected branch.
6. **Unified configuration delivery.** Expose published versus device-received versions and safe retries across appearance, menu and receipt settings using current transport and acknowledgement mechanisms.

Useful later extensions: delegated, expiring setup access for an installer; acknowledgement-based owner handover; precise setup search such as “change language background”; and failure explanations paired with pre-filled diagnostics. Existing task search, role checks and diagnostics should be reused. Installer access must not become a shared owner password or reusable unrestricted token.

## Suggested implementation order

**First: prevent mistakes and lost work**

- Pre-fill branch licensing forms accurately.
- Correct branch-aware quota previews.
- Protect unsaved editor changes.
- Make terminology consistent: purchased, configured, published, received, ready.

**Second: shorten onboarding**

- One restaurant Products & plan view.
- One conditional branch launch checklist.
- Device quantity/name matrix and typed activation-request fulfillment.

**Third: make daily work calmer**

- One task-first home, with completed setup guidance collapsed.
- Combined kiosk customer-experience workspace.
- Effective-menu preview and unified delivery status.

## How to validate the redesign

Use a restaurant owner unfamiliar with the system, plus a platform support operator and a branch manager. Record wrong turns, retries, help requests and whether each task is completed correctly; do not infer usability only from attractive screenshots or passing component tests.

Required tasks:

- Onboard a POS-only takeaway restaurant without requiring tables or a printer it does not use.
- Onboard Kiosk-only and QR-only restaurants; add a landing page through the plan and publish it.
- Configure one restaurant with five different branch setups, without granting an unpurchased product.
- Add two kiosks to the same branch; request/issue/activate each key on its correct physical device.
- Explain and resolve a blocked optional feature from a single contextual view.
- Open an existing restricted branch allocation and save no changes without changing effective access.
- Edit kiosk content, navigate away and refresh without losing an intended draft.
- Publish a menu/appearance change while one kiosk is offline; distinguish server publication from device receipt.
- Explain why a dish differs between POS, QR and Kiosk using effective rules and versions.
- Resolve a payment/printing/routing failure while preserving the original order/payment references.
- Complete owner handover using recorded checks rather than a generic green Account active badge.

No new overall score is assigned: the review identifies concrete flow changes, and new usability scores would require defined criteria and fresh representative-user testing.

## Important non-finding

The Templates route initially renders a heading in `App.tsx`, but the same file also opens `PrebuiltMenuModal` whenever that route is selected. It is **not** classified as a missing templates feature based on the heading alone. Similarly, branch licensing, recovery, approvals and checklists are present and should be extended, not rebuilt as supposedly absent features.

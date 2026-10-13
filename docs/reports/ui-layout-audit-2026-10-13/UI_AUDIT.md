# JAMANVAAR — UI layout, consistency and usability audit

Date: 13 October 2026. Baseline commit: `81ec7d8d27a6ef9b8d57d8b1b258cd8c2214f4ab`.

**Implementation follow-up:** see [IMPLEMENTATION.md](IMPLEMENTATION.md) for the changes, disposition of all 27 entries, final verification and rollout limits. The assessment below is retained as the original audit evidence.

The main remaining problems are the narrow-screen POS workspace, Captain's fixed sticky-header offset, notification positioning, inconsistent button contrast, small operational text and controls, and incomplete keyboard access to some actions. These should be addressed before another visual redesign.

This document contains **27 prioritized findings and recommendations**. They are not 27 browser-proven bugs: the evidence labels below distinguish measured issues, source findings, improvements and verification risks. Application UI was not changed as part of this audit.

## Evidence and limits

- **B — Browser measured:** reproduced in a local browser capture of an existing compiled web build.
- **S — Source confirmed:** the implementation or CSS condition is present in the current working tree; authenticated browser reproduction remains necessary where stated.
- **I — Improvement:** a usability/design recommendation, not a claim that the current feature is broken.
- **V — Verify:** a plausible layout risk requiring a specific browser/device scenario before calling it a defect.
- **P1:** address before broad phone/tablet rollout or the next accessibility pass. **P2:** next UI consistency pass. **P3:** refinement after operational layouts work.

The scan covered **330 TSX/CSS files** across the seven frontend applications and shared UI package. It produced 2,312 search candidates and 421 distinct literal colors. Those are search statistics, **not defect counts**. Input placeholders are not unfinished features; a `max-width` is not inherently an overflow; some confirmation calls use an existing custom dialog; some apparent icon-only buttons contain accessible text. Findings below were selected after reviewing their surrounding code.

Public entry routes were captured at **1366×768 and 390×844**, using headless Chrome, fresh browser contexts and locally served existing `dist` artifacts. The final pass produced **18 captures**, with no detected document-level horizontal overflow or JavaScript page errors. **16 were populated public forms/marketing pages; the two QR customer requests stayed on loading** with the backend unavailable. This verifies public presentation only, not live payments, synchronization, authentication or tenant data. A loading or unavailable-backend state is not evidence of a production failure. Off-screen lazy images can have `loaded: false` before scrolling; that flag alone is not a broken-image finding.

The working tree contains pre-existing Super Admin/API edits. The source audit includes the working tree; existing compiled artifacts can be older. Protected pages were examined through targeted source review, not a completed authenticated browser tour. An isolated component harness encountered dependency/cold-compilation problems; its blank/error captures are **excluded** from product findings. Windows/Android native shells, TV viewing distance, screen readers, 200% zoom and live restaurant data were not accepted end to end.

## Application coverage

| Application / workspace | Source areas examined or scanned | Browser coverage | Remaining verification |
| --- | --- | --- | --- |
| Restaurant Admin | Shell/navigation; menu; invoices/orders; reports; staff; shared dialogs; settings and operational module inventory | Owner sign-in, desktop and phone | Authenticated navigation, long/large datasets, all edit dialogs and exports |
| Kiosk Admin | Display, welcome backgrounds, terminal configuration, combos and receipt settings within the admin application | No authenticated workspace capture | Multiple terminals, live preview, image upload failures and entitlement states |
| POS | Shell, sidebar, catalog/cart, customers, payment/report dialogs, operational view inventory | Activation entry, desktop and phone | Cashier's complete sale, customer/reward selection, tablet cart and settlement |
| Captain | Header/navigation; floor/order workspace; requests; ready food; messages; shift views | Activation/login entry, desktop and phone | Long names, busy tables, sticky navigation while scrolling and safe areas |
| KDS | Board/card CSS, ticket component and application shell | Activation entry, desktop and phone | Authenticated boards at tablet/TV sizes and long multi-dish tickets |
| Customer Kiosk | Menu card, menu grid, receipt keyboard, startup/activation and notification positioning | Activation entry, desktop and phone | Paired welcome/menu/cart/receipt, portrait touchscreen and multiple terminals |
| QR product / QR Admin | Product/login styles, workspace/sidebar and QR console module organization | Marketing and administrator login, desktop and phone | Protected console sections, drawer navigation, preview and setup errors |
| QR customer | Menu/checkout/status/receipt source and stylesheet | Invalid-link request remained in a loading state with backend unavailable | Valid table link, real menu, modifiers, payment states and receipt printing |
| Super Admin | Route inventory, layout/shared controls and representative source styles | Login, desktop and phone | Protected pages, current unbuilt changes, light/dark and populated dashboards |

Super Admin route inventory includes dashboard, restaurant health, restaurants/onboarding/detail, owners, branches, SaaS/plans, QR/WhatsApp/AI, catalog, subscriptions, billing, entitlements, feature catalog, reports, applications, activation keys, payment connections, platform payments, payouts, devices, sync, backups, sandboxes, offline policy, team, support/tickets, notifications, audit logs, system health, platform settings and profile. This inventories coverage; it does not certify every route visually.

## Findings register

| ID | Priority / evidence | Application and page | Finding or recommendation |
| --- | --- | --- | --- |
| UI-01 | P1 / S | POS — Billing/Menu | Fixed cart and sidebar widths cannot fit a narrow viewport together. |
| UI-02 | P1 / S | Captain — header/navigation | Sticky navigation assumes a 53px header even though the header can wrap. |
| UI-03 | P1 / S | Shared operational notifications | Right-aligned full-width toast container extends past the left edge on phones. |
| UI-04 | P1 / S | POS buttons; some custom report actions | Small white text on bright orange has weaker contrast than the shared primary button. |
| UI-05 | P1 / S | Admin — report preview, audit search, rider actions | Several icon actions have no accessible name. |
| UI-06 | P1 / S | Kiosk — dish details | Clickable dish-card container has no keyboard equivalent for opening details. |
| UI-07 | P2 / S | QR customer — receipt printing | Print stylesheet does not isolate the receipt or hide all interactive actions. |
| UI-08 | P2 / S | Admin — hourly report | Displayed time window disagrees with the generated hourly buckets. |
| UI-09 | P2 / S | POS cart, Admin reports/staff, QR guest | Important operational labels use very small type. |
| UI-10 | P2 / S | Shared dialogs; staff actions; Super Admin controls | Several frequently used controls are smaller than a comfortable touch target. |
| UI-11 | P2 / B+S | Public sign-in — Local Core setup | Pair link measures 34×24px and sits inside a compact status badge. |
| UI-12 | P2 / B+S | QR administrator login and marketing navigation | Recovery/activation links measure about 17px high; small link text is difficult to tap. |
| UI-13 | P2 / S | Shared authentication footer | “100% Secure” is an absolute assurance rather than useful product status. |
| UI-14 | P2 / V | Kiosk — email keyboard | Ten-key rows may become too narrow on small viewports despite adequate key height. |
| UI-15 | P2 / V | Super Admin — mobile shell | Fixed `100vh` shell needs testing with browser chrome and the on-screen keyboard. |
| UI-16 | P2 / I | All admin/payment/report dialogs | Align visual hierarchy, close controls and footer placement across dialog families. |
| UI-17 | P2 / I | Admin/POS — invoices and orders | Provide a mobile presentation instead of relying only on wide scrollable tables. |
| UI-18 | P2 / I | Admin/POS — document preview | Simplify dense toolbar groups and separate on-screen controls from printed typography. |
| UI-19 | P2 / I | Restaurant Admin — navigation | Group daily work and setup more clearly; keep the owner on task. |
| UI-20 | P2 / I | QR Admin — all sections | Organize the existing sidebar around setup, daily service and advanced configuration. |
| UI-21 | P2 / I | Kiosk Admin — welcome/display settings | Make restaurant-wide defaults and terminal-specific overrides visually explicit. |
| UI-22 | P2 / I | KDS — board/cards | Preserve responsive cards; improve viewing-distance validation and status hierarchy. |
| UI-23 | P2 / I | Captain — table workspace | Give the four frequent service actions a clearer, larger touch hierarchy. |
| UI-24 | P2 / I | Shared UI and all applications | Consolidate semantic colors, spacing and typography without merging app workspaces. |
| UI-25 | P2 / I | Menu/category images across applications | Add a visual asset acceptance pass with truthful, customer-safe fallbacks. |
| UI-26 | P2 / I | Operational and settings pages | Standardize loading, empty, unavailable, unsaved and error states. |
| UI-27 | P3 / I | QR/kiosk customer branding | Apply imagery and brand accents to customer journeys without overwhelming operational pages. |

## Confirmed implementation issues and measured controls

### UI-01 — POS cart cannot fit narrow screens

**Evidence:** `apps/restaurant-system/pos/src/components/cart/PosCart.tsx:119` specifies `w-96`, `md:w-[26rem]`, `lg:w-[28rem]`, `min-w-[380px]` and `shrink-0`. `apps/restaurant-system/pos/src/components/layout/PosSidebar.tsx:93` specifies a non-shrinking 112px base width. `apps/restaurant-system/pos/src/App.tsx:410` uses a viewport-sized, overflow-hidden shell, and lines 418–432 place sidebar, catalog and cart side by side without a narrow-screen cart alternative.

**Impact:** at 390px, the cart's 380px minimum plus the sidebar already exceeds the viewport before catalog, gaps and padding. Hiding document overflow does not make the content usable. This is a source-confirmed constraint, not an authenticated screenshot assertion.

**Fix:** keep the desktop workspace; below a content-driven breakpoint, use a collapsible category navigation and a cart sheet/drawer with a sticky total and Pay button. Switching views must retain the order, customer, table, discounts and modifiers.

**Acceptance:** at 390, 768, 1024 and 1366px, a cashier can search/add a dish, inspect the complete cart, change quantity, choose a customer and reach payment without clipped controls. Verify portrait and landscape with an open keyboard.

### UI-02 — Captain sticky offset assumes the wrong header height

**Evidence:** `apps/restaurant-system/captain/src/components/layout/CaptainNavigation.tsx:65` uses `sticky top-[53px]`; `CaptainHeader.tsx:48–49` uses an auto-height sticky header and a wrapping flex container.

**Impact:** a long restaurant/staff name, translated controls or a constrained tablet width can increase header height while navigation still sticks 53px down. The top navigation can slide underneath the header.

**Fix:** place header and navigation in one sticky wrapper, or measure the header and expose its actual height as a CSS variable. Do not replace 53px with another guessed constant.

**Acceptance:** scroll the floor/orders view at 768 and 1024px with long names, supported languages and increased text size. All navigation labels and actions remain visible. Mobile bottom navigation already includes safe-area padding; retain it.

### UI-03 — Shared notification container can extend off-screen

**Evidence:** `packages/ui/src/NotificationToastContainer.tsx:51` combines `fixed right-4 w-full max-w-sm`. With the default 384px maximum, a 390px viewport places the left edge at approximately −10px; below 384px, a full viewport width plus the right offset extends 16px left.

**Impact:** visible alerts/cards can lose their left edge. Fixed bottom placement also deserves testing against each application's footer, basket and AI control; those additional collisions are not yet reproduced.

**Fix:** use two-sided gutters or a viewport-relative maximum, for example a width capped at `calc(100vw - 32px)`. Define safe bottom offsets per shell and allow critical toasts to remain readable above mobile navigation.

**Acceptance:** show one and several long notifications at 320/390/768px. Both edges, dismiss control and text remain within the viewport; payment and navigation remain operable.

### UI-04 — Primary action contrast is inconsistent

**Evidence:** `apps/restaurant-system/pos/src/components/customers/PosCustomersView.tsx:62` uses small white text on `bg-jaman-saffron`, changing to `bg-jaman-orange` on hover. POS `tailwind.config.js` defines these as `#E66817` and `#F97316`. Locally calculated white-text contrast is approximately **3.30:1** and **2.80:1**, respectively. The shared darker `#BF540F` button is approximately **4.68:1**. `ReportPreviewModal.tsx` also has a print-button hover color of `#EA580C` (~3.56:1).

**Impact:** nominally equivalent primary actions have different readability, including a poorer hover state. This calculation concerns these specific solid colors, not all gradients, icons or custom restaurant themes.

**Fix:** use a semantic primary-action token with tested text contrast in default, hover and pressed states. Keep bright saffron for decoration and suitable non-text accents. The shared button's corrected contrast should be preserved.

**Acceptance:** verify computed foreground/background in every state, including disabled and custom branding. Use a normal-text contrast target of at least 4.5:1; do not assume a 3:1 icon target is sufficient for a small button label.

### UI-05 — Some icon buttons have no accessible name

**Evidence:** `ReportPreviewModal.tsx:237` has an X-only close button without `aria-label` or title; `components/audit/AuditTrailModule.tsx:81` has an X-only clear-search button; `components/staff/StaffRolesModule.tsx:392–395` has rider edit/delete icon actions without names. Paths are relative to `apps/restaurant-system/pos-admin/src/`.

**Fix:** add task-specific accessible names such as “Close report preview”, “Clear audit search” and “Edit rider <name>”. Keep visible focus indication and adequate hit areas. A tooltip alone should not be the only cue on touch screens.

**Acceptance:** traverse with a keyboard and inspect the accessibility tree. Every actionable icon has a meaningful name and distinguishable focus. The scan's 446 icon candidates are not 446 confirmed missing labels.

### UI-06 — Kiosk dish details are pointer-only

**Evidence:** `apps/kiosk-system/kiosk-user/src/KioskProductCard.tsx:31–35` opens details through a `div` click handler without a role, tab stop or keyboard handler. Name and description are limited to two lines at lines 50/55.

**Impact:** keyboard/switch users cannot open the same full details as a pointer user. Truncated names/descriptions make that alternate access especially important.

**Fix:** provide an actual dish-details button/link or equivalent keyboard-accessible card interaction. Avoid nesting buttons inside another button. Preserve the existing, correctly named 48×48px Add button and separate customization action.

**Acceptance:** open details with Tab + Enter/Space, read the complete name/description and required options, return focus to the source card, then add the dish. Verify long translated names.

### UI-07 — QR receipt print mode does not isolate the document

**Evidence:** `apps/qr-guest/src/App.tsx:596` calls `window.print()` within the order receipt. `src/styles.css:208` hides several decorative elements but does not hide all buttons/status actions or isolate the receipt. “Order more” remains in the surrounding status section.

**Impact:** unrelated customer controls can appear on the print/PDF. This is a print-CSS omission identified in source; an actual PDF has not been generated in this audit.

**Fix:** introduce a receipt print target, hide the rest of the interface in print mode, expand the receipt content and define page breaks. Keep restaurant/branch identity, reference, date, items, taxes, total and collection status.

**Acceptance:** preview/print paid and counter-payment receipts to A4 and PDF. No navigation, Retry, Refresh or Order more controls appear; long receipts paginate without losing totals.

### UI-08 — Hourly chart label disagrees with its data

**Evidence:** `apps/restaurant-system/pos-admin/src/components/reports/ReportPreviewModal.tsx:366` labels the chart “10 AM - 11 PM”. `reportDataEngine.ts:585` generates buckets from **9 through 23**, and ignores hours outside that range.

**Impact:** the chart's visible interval is misleading. Restaurants open before 9 AM or after 11 PM can also lose hours from this view; that behavior needs business-rule review rather than a cosmetic label change alone.

**Fix:** derive the label and buckets from one business-day/hour-range definition. Include applicable overnight trading hours. Keep local timezone and business-day rules explicit.

**Acceptance:** place sample sales at 8 AM, 9 AM, 10 AM, 11 PM and midnight. The displayed interval and totals match the configured trading day without silent exclusions.

### UI-09 — Important text is too small for rapid operational use

**Evidence:** POS cart includes 11px subdued staff/cart information (`PosCart.tsx:128` and later cart sections). Admin staff summaries/attendance use 11px labels. Admin report chart labels use 8px (`ReportPreviewModal.tsx:378/392`). QR guest uses 9px dietary badges, 10px journey labels and 11px payment explanations (`styles.css:112/126/154`).

**Fix:** distinguish printed-document typography from interactive UI. Establish approximately 14–16px operational body text and 12–13px secondary labels, with larger kitchen/guest-facing text. Keep amounts, allergens, payment state and actionable errors particularly legible. These sizes are design targets, not a claim that every 11px label violates an accessibility standard.

**Acceptance:** validate at actual cashier/tablet/phone viewing distances and with increased text size. Important text should not require zoom, hover or inference from color.

### UI-10 — Several controls are undersized for touch

**Evidence:** shared Modal close control is 36×36px (`packages/ui/src/Modal.tsx:80`); shared small Button has no minimum touch height (`Button.tsx:35`). Staff attendance actions use small icons with `p-1.5` (`StaffRolesModule.tsx:324/331`). Super Admin uses 38px default and 32px small buttons (`cloud/super-admin-web/src/components/ui.css:7/26`), while `CopyButton.tsx:61` overrides height with compact padding and 11px text.

**Fix:** add an explicit touch-friendly density with 44–48px targets and sufficient separation. Desktop financial grids can retain a compact mode. Increase the clickable area as well as the icon where needed.

**Acceptance:** touch-only use on tablet, including Close, Copy, Edit, Clock in/out and destructive actions. No accidental adjacent activation. The 44–48px recommendation is a usability target, not a blanket assertion about mandatory AA dimensions.

### UI-11/UI-12 — Public setup/recovery links are small

**Browser evidence:** public sign-in Pair links measured 34×24px at both sizes. QR login activation/recovery links measured roughly 17px high; the top Login link measured 20px high. Screenshots and measurements are in `evidence/public/`.

**Source:** `packages/ui/src/JamanvaarAuthLayout.tsx:360` uses `min-h-[24px]` for Pair/Setup. `apps/restaurant-system/pos-admin/src/qr/product.css:607` defines the auth links at 11px without a larger hit area.

**Fix:** expose a clear setup action with a larger target; make activation/recovery secondary buttons or generously padded links. Keep their priority below Sign in, and avoid expanding every status badge into a large competing primary action.

**Acceptance:** on a 390px phone, users can reach setup, activation and recovery comfortably with a thumb. Desktop and phone public layouts currently show no horizontal document overflow; preserve that result.

### UI-13 — Replace the absolute security claim

**Evidence:** `packages/ui/src/JamanvaarAuthLayout.tsx:542` and several application footer props display “100% Secure”.

**Fix:** use factual, relevant wording such as “Role-based access” or an accurate connection/security status. Avoid replacing it with another unverified assurance. This is a copy/trust issue, not a penetration-test finding.

## Layout risks requiring targeted verification

### UI-14 — Email keyboard on small screens

`apps/kiosk-system/kiosk-user/src/KioskReceiptDeliveryDialog.tsx:80/131–140` has ten-key flex rows, modal padding and spacing. Heights are 44–56px, but at narrow widths individual keys can be much narrower. The numeric keypad already uses three columns; the email keyboard, sending/result states and explicit next-customer action already exist.

Test 390, 600, 768 and 1080px, portrait and short landscape. If narrow keys are reproduced, adapt row layout/padding or present a wider/full-screen keyboard. Keep the send result visible and do not clear an unfinished address during a layout change. **Do not treat the earlier missing-keyboard issue as still unfixed.**

### UI-15 — Super Admin viewport height

`cloud/super-admin-web/src/layout/layout.css:29–30/44` uses `100vh` for a bounded shell. Test login, search and edit dialogs on Android/iOS browser chrome with the software keyboard open. Prefer dynamic viewport units where appropriate, with independently scrollable content and a reachable footer. A mobile sidebar implementation already exists; this is not a missing-mobile-menu finding.

## Recommended improvements by application

### UI-16 — A consistent dialog system

Shared Modal, POS payment/report overlays, Admin report preview and Super Admin confirmation dialogs have different corner radii, density, close placement and scroll/height rules. Standardize title/description spacing, neutral Cancel versus primary action, keyboard behavior, error placement and footer positioning. Keep a full-screen presentation where the task needs it.

Preserve existing focus management in shared Modal; do not replace a working focus trap with a styling-only overlay. Accept a long dialog at 390px and a short 768px-high screen with the final action visible or predictably reachable.

### UI-17 — Mobile invoice/order presentation

Admin invoice/order tables explicitly use `overflow-x-auto` (`BillingInvoicesModule.tsx:906/978`, `OrdersModule.tsx:779`). That is intentional scrolling, not proof of a broken page. However, owners on phones must move sideways to correlate identity, amount, payment state and actions.

Offer summary cards or priority columns on phones: reference/time, source/table, total, collected/outstanding, status and View. Keep the full ledger and column controls on desktop. The same record and filters must drive both presentations; do not create a separate hardcoded mobile dataset.

### UI-18 — Report preview clarity

Admin `ReportPreviewModal.tsx:164–244` wraps toolbar groups, but several groups remain internally wide and contain document format, design, CSV, Print and Close together. POS has a separate report preview implementation. The concern is density and internal group fit, not an assertion that `max-w` alone causes overflow.

Make Print/Save PDF the clear primary action, retain a visible Back/Close, and move infrequent formatting options behind a menu. Keep the print canvas independently zoomable without shrinking UI controls. Test long report titles and all document formats at 390/768px before changing paper styles.

### UI-19 — Restaurant Admin navigation

Group navigation by tasks: **Today** (dashboard/orders/collections), **Menu**, **People**, **Devices**, **Reports**, **Setup**. Keep branch and active application visible. Use contextual next steps on empty pages and searchable navigation for infrequent work. Preserve product entitlements and separate POS/Kiosk/QR workspaces; shared styling must not make every app become Restaurant Admin.

Acceptance: a new owner can import a menu, verify a table QR and check today's outstanding collections without understanding internal platform terminology. Verify the existing mobile navigation/logout instead of assuming desktop-only controls are unreachable.

### UI-20 — QR Admin section organization

Current `src/qr/workspace.css` and QR console code already provide a desktop sidebar and an off-canvas menu below 1100px. The old screenshot showing only a crowded row of tabs is not sufficient evidence against this current implementation.

Use groups such as **Launch setup**, **Live operations**, **Menu & guests**, **Branding**, and **Advanced**. Keep setup health actionable with links to the specific failing setting. For rule/payment forms, describe the customer outcome before implementation details. Retain branch context and expose unsaved changes clearly.

Acceptance: desktop sidebar and phone drawer reach every licensed section; Save feedback is visible; changing branch does not silently save settings to the wrong branch. This audit does not certify those behaviors end to end.

### UI-21 — Kiosk Admin scope and preview

In display/welcome/receipt settings, distinguish **restaurant default**, **branch override**, and **this terminal override** with plain scope labels. Show which kiosk will receive a change, a live portrait/landscape preview, and a clear Reset to default action. Separate access to a design from the choice of an active background.

Acceptance: two terminals can have different backgrounds/messages, and editing one does not visually imply changing both. Super Admin design access remains separate from owner selection. These are presentation recommendations; existing configuration capabilities were not exhaustively exercised here.

### UI-22 — KDS readability and status hierarchy

Current KDS CSS already has responsive auto-fill columns, constrained card widths, wrapping dish names, internally scrollable dish lists and a TV density with 56px buttons (`apps/restaurant-system/kds/src/index.css:21–43`). Preserve those fixes.

Validate a complete board at 768×1024, 1366×768, 1920×1080 and 2560×1440, including 1/8/20 dishes, allergy notes and long names. Token, table/station, elapsed time and next action should dominate; cancellation and urgency need text/icon cues as well as color. Check short screens and real TV distance before increasing all text indiscriminately.

Priority/search/reprint should be discoverable without competing with Ready/Served. Do not describe them as missing based on historical requests without checking current controls. No current authenticated KDS card screenshot was accepted in this audit.

### UI-23 — Captain's table workspace

Give **Add dishes**, **Send to kitchen**, **Food ready/serve**, and **Request bill** a consistent hierarchy. Put transfer, history and administrative operations in a secondary menu. Increase seat/course targets and allow long guest/allergy notes to expand.

The existing `components/tables/CaptainTableWorkspaceModal.tsx` contains responsive layout and mobile cart handling; preserve those patterns. Acceptance should use a busy table with multiple seats, unsent changes, ready food and a bill request, not only an empty floor.

### UI-24 — Design tokens and component reuse

The code uses shared components plus several local palettes and repeated CSS overrides. QR guest's stylesheet redefines selectors such as `.top`, `.item`, `.primary` and `.cartbar` across base, redesign and responsive sections. Repeated selectors are not inherently defects, but make later fixes difficult to reason about.

Create semantic tokens for action/hover/pressed, text/muted text, surfaces, borders, danger/success, spacing, radius and touch density. Reuse field, badge, empty-state and dialog primitives. Keep appropriate differences: guest imagery, cashier speed, kitchen readability and platform administration should not have identical page density.

Acceptance: a brand or contrast correction propagates without editing dozens of unrelated literals; disabled/error/selected/focus states remain distinct in each application and in supported themes.

### UI-25 — Image and category acceptance

Current customer cards use shared `CachedImg`, dish context and a fallback path. The public marketing/auth captures loaded visible bundled food/brand images. This does **not** establish that every production menu upload or template photograph works.

Check every template/category manifest, actual uploaded-image URL, cache behavior and API origin. Test missing, failed, slow and cached images; use consistent aspect ratios and avoid customer-facing instructions aimed at restaurant staff. Keep category icons attractive and recognizable when no category photo exists. Image choice should represent the dish accurately rather than repeatedly substituting unrelated stock food.

Acceptance: owner preview, POS, kiosk and QR display the same intended image; a failed photo preserves the card layout and a truthful neutral fallback. This is a verification recommendation, not a claim that production currently has broken images everywhere.

### UI-26 — State and feedback consistency

Use consistent states for loading, genuinely empty data, no search matches, disabled entitlement, unavailable backend and unsaved form changes. Give errors a task-specific explanation and recovery action; put field errors beside fields and global errors beside the affected task. Technical gateway exceptions should not be the primary customer-facing instruction.

Acceptance: interrupt menu loading, fail a save, search for a nonexistent order and disable a feature. Each state explains what happened, retains recoverable input and offers a meaningful next action. Audit live behavior before calling a current feature hardcoded or nonfunctional.

### UI-27 — Branded imagery without visual overload

The current QR marketing page has a rich food/phone composition, clear calls to action and a responsive mobile layout. Preserve this stronger direction. Continue appropriate food imagery and restaurant identity through menu, details and receipt/status screens, using a clean center and readable text.

Keep operational data pages quieter. On POS/KDS, useful hierarchy and consistent alignment matter more than large decorative images. Customer branding should not change payment amounts, status meaning or the minimum readability of the interface.

## Existing improvements to preserve

- Public desktop/phone pages checked here did not show document-level horizontal overflow. This does not certify protected workspaces.
- QR Admin already has a sidebar and a mobile drawer; it should be refined, not recreated from the old tab screenshot.
- KDS already contains responsive card sizing, wrapping and TV density.
- Kiosk receipt delivery already includes themed email/phone entry, sending/result states and an explicit next-customer action.
- Kiosk Add buttons already have dish-specific accessible names and 48px targets.
- Captain bottom navigation and QR guest cart/sheets already include safe-area handling.
- Shared Modal already has focus management; shared primary Button already uses a darker text-safe action color.
- Staff's active list filters inactive accounts; its literal Active badge is not evidence that inactive staff are mislabelled.

## Implementation order and acceptance matrix

1. **Fix constrained layouts and access:** UI-01–06; test cart preservation, sticky bars, notifications and keyboard access before changing decoration.
2. **Correct document and text issues:** UI-07–13; verify print output, chart hours, text contrast, touch controls and public recovery/setup targets.
3. **Run the two targeted device risks:** UI-14/15, plus real KDS TV/tablet and customer-kiosk portrait checks.
4. **Unify visual primitives and task hierarchy:** UI-16–24, in small per-app changes with existing behavior preserved.
5. **Finish image/state/brand acceptance:** UI-25–27, including actual production assets and authenticated workflows.

| Persona | Must complete | Devices / data variations |
| --- | --- | --- |
| Owner | Sign in, choose branch/app, publish menu, configure QR, review collections | Phone/tablet/desktop; new restaurant; 100+ dishes; long branch names |
| Cashier | Select table/customer, add/customize, redeem or skip reward, discount, collect and receipt | 768/1024/1366px; large cart; split payment; software keyboard |
| Captain | Open table, add dishes, send KOT, serve ready dishes, request bill | Phone/tablet; several seats; long notes; translations; safe areas |
| Kitchen | Identify ticket/station, see allergies, prioritize, ready/served, reprint | Tablet/TV; many tickets; long names; cancelled and urgent states |
| Kiosk guest | Start, browse, customize, pay, enter contact and see receipt result | 1080×1920 and landscape; small tablet; touch-only; slow images |
| QR guest | Valid scan, find dishes, modifiers, checkout, payment recovery, receipt | 360/390/430px; Android/iOS; verified/pending/failed/counter states |
| Platform operator | Onboard, inspect devices/payments, edit entitlements, resolve alerts | Desktop/tablet; light/dark; long populated tables; current source build |

Every acceptance pass should include no-data and realistic populated states; keyboard/focus; long text; supported languages; 200% zoom; error/loading feedback; and no clipped primary actions. Use synthetic/test-tenant orders and payment-provider test mode where appropriate. Browser evidence of a UI does not prove a financial or authorization transition.

## Reproducible evidence

- [Source scan](evidence/SOURCE_SCAN.json) — source-file inventory and raw candidates.
- [Public browser measurements](evidence/public/RESULTS.json) — viewport, text, image load state, control dimensions and page errors.
- [Public screenshot directory](evidence/public/) — per-app desktop/phone captures.
- [Source scanner](scan-ui.cjs) and [public capture script](browser-public-build.cjs).
- `browser-ui.cjs` is an experimental isolated component harness. Its failed/blank outputs in the parent evidence directory are not acceptance evidence; do not use them to assert application failures.

The public script serves existing local builds and blocks backend/external traffic. It can be rerun with `node docs/reports/ui-layout-audit-2026-10-13/browser-public-build.cjs`. Build the relevant app first when checking a source fix. For protected and native screens, use an authorized test tenant and the acceptance matrix above; this report does not claim all UI errors have been found.

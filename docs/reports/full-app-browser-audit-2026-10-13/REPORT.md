# JAMANVAAR — browser, workflow and data-flow audit

Date: 13 October 2026. Repository baseline: `857b80018ef92db78b43fa63e281b90f2ec8dbe9`, with the existing working-tree changes present when the audit builds were generated. Other edits continued to appear in the workspace during this audit; this is evidence about those audit builds, not certification of every later editor change.

**Implementation follow-up:** [Fixes and verification — 14 October 2026](IMPLEMENTATION.md). The findings below describe the original audit; the follow-up records code changes, retests and remaining provider/hardware acceptance.

The principal problems found are inconsistent financial summaries, misleading payment wording on unpaid kiosk receipts, broken Super Admin deep links, residual demo information and interruptions during staff workflows. The tested menu, cash-collection and kitchen flows do synchronize; there is no evidence here that all synchronization is broken.

## What was actually checked

Chrome was opened through Playwright against production-mode frontend builds and the compiled Nest API. The walkthrough followed Restaurant Admin → Kiosk Admin → POS → customer Kiosk → Captain → KDS → Super Admin, followed by cross-app scenarios. Additional QR Admin/customer checks were included because QR orders share these operational flows.

| Experience | Coverage |
| --- | --- |
| Restaurant Admin | All 28 registered product pages; desktop and phone captures; toolbar/dialog sampling; CSV import, search, table creation, staff creation and revocation verified against the backend |
| Kiosk Admin | All 25 registered product pages; desktop and phone captures; settings/design/template dialogs inspected; fleet/configuration mutation coverage remains limited |
| POS | Billing plus all 10 other navigation screens; desktop and phone captures; manual discount, customer drawer, collection, cash settlement and instant billing exercised |
| Customer Kiosk | Welcome, language, order type, menu/filter/combos/help, cart, payment, cash confirmation, receipt and touch-keyboard states; portrait and tablet receipt captures |
| Captain | Tables, active orders, food ready, messages, kitchen tickets, guest requests and shift performance; ready-food delivery tested |
| KDS | Active, cooking, ready, served and expo views; station sign-in, search, priority, reprint and kitchen transitions exercised |
| Super Admin | 43 route targets inventoried. Owner detail had no fixture ID; six nested targets initially went blank on direct load and were subsequently rendered through SPA navigation. Forms/actions were sampled, not all privileged changes committed |
| QR Admin | 14 navigation targets checked: nine available under the test plan; five absent/gated. Absence under this plan is not proof that their implementation is missing |
| QR customer | Imported menu, cart, checkout, counter order, refresh/status recovery, completed preparation and simulated online checkout |

See [PAGE_MATRIX.md](PAGE_MATRIX.md) and [BUTTON_MATRIX.md](BUTTON_MATRIX.md). Button inventory, opening a dialog and completing a business operation are different levels of evidence. Thousands of repeated dish/navigation/button observations do **not** mean thousands of independent workflows passed. Controls marked `INVENTORIED` or `NOT_EXERCISED` were not fully functionally verified.

Desktop was normally 1440×960, phone 390×844. Kiosk email entry was additionally checked at 1080×1920 and 1024×768. Live KDS tickets were additionally captured at 1920?1080, 1024?768 and 390?844. These checks do not establish suitability for every physical tablet, TV, browser, zoom level or native APK/EXE.

The audit used two fresh restaurants and four branches in an isolated PostgreSQL database. Existing restaurant/production data was not edited. Email transport was captured locally. Razorpay provider calls and SDK interaction were simulated, while application authentication, entitlement gates and payment-signature verification remained real. Real UPI app selection, bank collection, SMTP/WhatsApp delivery, printers and native updates are not verified by this run.

## Confirmed defects and reproducible usability gaps

Priority: P1 affects financial correctness or blocks an essential workflow; P2 materially confuses or slows staff; P3 is a smaller usability/accessibility problem. “UX” means the interaction works but is needlessly difficult. “Local runtime” means production impact still needs deployment verification.

| ID | Priority / type | App/page | Finding, reproduction and impact | Recommended correction | Evidence |
| --- | --- | --- | --- | --- | --- |
| F01 | P1 / bug | Restaurant Admin / dashboard | With one INR 101 collected kiosk order, an INR 102 accepted QR counter order and an INR 100 unpaid kiosk draft, the dashboard reports **INR 202 awaiting payment / two unpaid orders**. Billing correctly reports INR 102 / one pending order. The dashboard counts an unconfirmed draft as collectible debt | Derive both views from one accepted-order/outstanding-balance policy; exclude unconfirmed online drafts and cancelled orders. Verify identical counts after retries, payment and refunds | [Dashboard](evidence/owner-after-settlement-dashboard.json), [Billing](evidence/owner-after-settlement-billing.json), [Canonical records](evidence/canonical-orders.json) |
| F02 | P1 / bug | Kiosk / cash receipt | Confirm “Cash at Counter” without collecting cash. The printed-screen receipt says **“PAID VIA: CASH”**, although the order is pending collection in POS. This can convince a customer or cashier that cash was already received | Print `Payment due at counter`, amount collected, balance due and settlement state. Use paid wording only after collection is verified | [Receipt and email state](evidence/kiosk-email-send-acknowledgement.json), [Pending collection](evidence/pos-kiosk-collection.json) |
| F03 | P1 / bug | Super Admin / nested routes | Directly open or refresh restaurant detail, onboarding, branch detail, plan detail, device detail or `/settings/platform`. The build requests assets below `/restaurants/assets/`, `/plans/assets/`, etc. The screen is blank. Root navigation works | Resolve static assets from the deployed application base, independently of route depth; retain root/subpath deployment support. Test direct links and refreshes through the actual Nginx configuration | [Browser MIME evidence](evidence/SUPER_DEEP_LINK.log), [Blank capture](evidence/super-deep-link-diagnostic.png), `cloud/super-admin-web/vite.config.ts`, `cloud/super-admin-web/nginx.conf` |
| F04 | P2 / bug | Both admins / header and welcome settings | The selected branch is `UI Audit Restaurant A — Main Branch`, but the header and welcome-screen target description still say **Ahmedabad Flagship Store**. The mismatch persists after branch selection and reload | Adopt the authoritative branch identity when entering/restoring a scoped workspace. Apply it to the header, previews, receipts and delivery targets | [Welcome screen](evidence/kiosk-admin-welcome-screen-stable-desktop.png), [Branch names](evidence/kiosk-admin-welcome-screen-stable-desktop.json) |
| F05 | P2 / bug | Restaurant Admin and Kiosk Admin / kitchen | “Average Cook Time” is always **14 Min** and “Optimal kitchen pacing”, including a fresh branch with zero tickets | Calculate completed-ticket durations for the selected branch/date; show `No completed tickets` when no measurement exists | [Empty kitchen](evidence/restaurant-admin-kitchen-stable-desktop.json), `KitchenKotModule.tsx:155` |
| F06 | P2 / bug | Captain / shift performance | With one real table UI01 and zero assigned tables, the screen claims **“Tables 1-6, 12, 14 in Zone A”** | Render actual assignments and zones, or a truthful unassigned state | [Captain shift](evidence/captain-Shift---Performance-desktop.json), `CaptainShiftStatsView.tsx:118` |
| F07 | P2 / bug | POS / report document | The report label is hardcoded **“GST & Taxes (5%)”**, even for the imported test dishes with no tax group | Render applicable tax rates or the neutral `GST & taxes` label; support zero/mixed rates | [POS report](evidence/pos-POS-Reports-desktop.json), `PosReportDocument.tsx` |
| F08 | P2 / bug | POS / report document | **“100% RECONCILED”** is unconditional. It is displayed before a register reconciliation has occurred | Show a computed reconciliation state with the relevant shift and variance; distinguish a balanced tender sum from a counted cash drawer | [POS report](evidence/pos-POS-Reports-desktop.json), `PosReportDocument.tsx:190` |
| F09 | P2 / UX | Staff app sign-in/startup | “Local Core: Unreachable” appears alongside **“Local Engine Active”, “Core Engine Ready”** and “Database Initialized”. Decorative startup labels appear to certify actual service health | Separate local storage readiness, cloud connectivity and optional Branch Core connectivity. Use measured status instead of timed success labels | [Fresh admin sign-in](evidence/fresh-admin-diagnostic.json), `JAMANVAARStartup.tsx` |
| F10 | P2 / UX | Kiosk / menu filters | There are two **All Menu** buttons. The sidebar resets category only; the top control resets dietary filter only. Jain → combos → sidebar All Menu can leave 100 available dishes hidden | Use `All categories` and `All diets`, visible active-filter chips and one `Clear filters` action, or make All Menu clear both | [Filtered menu](evidence/kiosk-all-menu-still-filtered.json), [Observation](evidence/observations.jsonl), kiosk `App.tsx` |
| F11 | P2 / UX | POS, Captain and Admin / guest assistance | A kiosk help request produces a full-screen modal above the active workflow. It blocked payment/admin navigation during the audit. Older help alerts also appeared again in later sessions | Keep urgent help prominent in an action strip; offer assign/accept/snooze and deduplicate resolved requests. Do not take focus from payment entry. Investigate acknowledgement persistence separately | [Captain ready screen with old alert](evidence/captain-qr-food-ready.json), [Blocked interaction](evidence/QR_ADMIN.log), `UrgentGuestAlertModal.tsx` |
| F12 | P2 / UI | Both admins / phone header | At 390px the product badge, `APP` label and application switch occupy overlapping/tight rows; the badge is visually crowded into the selector | Use one compact app identity/switch row; hide redundant badges at small widths and test long names | [Phone billing header](evidence/restaurant-admin-billing-stable-phone.png) |
| F13 | P2 / UX | Kiosk Admin / appearance and content | The page exposes a very long list of technical translation keys such as `screen_...`, mixed with payment, receipt, chat and screen text. It is difficult for an owner to identify which customer screen will change | Group editable copy by customer screen, hide implementation keys in advanced mode, and offer a preview/search/filter for that screen | [Appearance content inventory](evidence/kiosk-admin-appearance-stable-desktop.json) |
| F14 | P2 / UX | Both admins / settings | Owners encounter raw Local Core/Branch Core addresses, pairing PINs, sync and tenant concepts across several pages. These are useful technical controls but poor first-run guidance | Provide a guided connection wizard with detected devices, one connection summary and an advanced diagnostics section | [Sync settings](evidence/restaurant-admin-sync-stable-desktop.json), [POS settings](evidence/pos-Settings-desktop.json) |
| F15 | P3 / accessibility | Admin / branch-required screen | Header and branch-required prompt render the same selector ID `admin-branch-workspace` and label twice | Use unique IDs and label the inline branch picker distinctly; one component instance should own active scope | Recorded strict-selector failure in early walkthrough; both `AdminBranchWorkspace` instances in admin `App.tsx` |
| F16 | P3 / accessibility | POS / print queue | Close is an icon-only button without an accessible name. Escape did not close the queue in the tested flow | Label close, support Escape, trap/restore focus, and provide an actual dialog role | [Queue controls](evidence/pos-Floor---Tables-Print-Queue.json) |
| F17 | P3 / accessibility | Admin / kitchen | Two visible icon-only controls have no text, title or accessible label in kitchen views | Name each control for its action; include the ticket identifier when repeated | [Stable page diagnostics](evidence/stable-pages.jsonl) |
| F18 | P3 / accessibility | POS / settings and phone screens; KDS header; Kiosk navigation | Further visible unnamed buttons are recorded. Unlabeled icons force guessing and are inaccessible to assistive technology | Audit every icon-only control for name, role, focus and touch size; use the DOM inventories to locate exact elements | [Page diagnostics](evidence/pages.jsonl), individual `*-desktop.json` / `*-phone.json` files |
| F19 | P3 / UX | POS / Customers CRM | The fresh customer directory is largely blank under search; it does not explain why there are no guests or how to attach/create one | Add a purposeful empty state with create customer, guest checkout and loyalty setup guidance | [POS CRM](evidence/pos-Customers-CRM-desktop.json) |
| F20 | P3 / UX | Admin / purchasing | No stock items produces a text instruction to visit Inventory & Recipes, without a direct action | Add `Add stock items` and retain a return link to the receiving workflow | [Purchasing empty state](evidence/restaurant-admin-purchasing-stable-desktop.json) |
| F21 | P3 / UX | Admin / coupons | An empty coupons page presents a heading and add button with a large blank area | Explain eligible discount types, a short example, and the channels where a coupon will apply | [Coupons](evidence/restaurant-admin-coupons-stable-desktop.png) |
| F22 | P3 / UX | Kiosk / empty combos | No combos uses generic “No dishes found / try search or category” wording | Explain `No deals available` and offer `Browse dishes`; avoid implying a search mistake | [Empty combos](evidence/kiosk-Combos---Deals-desktop.json) |
| F23 | P3 / UX | Kiosk Admin / background collection | The first ten distinct backgrounds share the same broad `Indian Dining` description. This makes the collection harder to scan | Describe each design’s palette, contrast, cuisine and image placement; show portrait/landscape together | [Collection descriptions](evidence/kiosk-admin-welcome-screen-stable-desktop.json) |
| F24 | P3 / UX | Admin / downloads | Seeded application version `v1.0.0` is displayed even when a downloadable release is “Not yet available”, while running apps report other versions | Say `No published release`; show release metadata only when an installable artifact exists, with platform/architecture/channel | [Downloads](evidence/restaurant-admin-downloads-stable-desktop.json) |
| F25 | P3 / UX | QR Admin / analytics and payments | Date filters say **From (UTC) / To (UTC)** while the owner works in restaurant business time | Default to restaurant timezone/business date; expose UTC as an export/advanced option with explicit boundaries | [QR analytics](evidence/qr-admin-Analytics-desktop.json) |
| F26 | P3 / UX | Super Admin / notification type filter | Three different choices are all labeled **Ticket** | Give them distinct labels such as new ticket, ticket reply and ticket status change | [Notification options](evidence/super--notifications-desktop.json) |
| F27 | P2 / operational UX | POS / settlement | A cashier with **No Shift** successfully collected kiosk cash and performed instant billing. The owner header also reported no open shift | Make shift policy explicit: require opening a drawer, or clearly identify unassigned collections and provide reconciliation/reassignment. Do not silently imply every collection updated an active shift | [Settlement](evidence/pos-cash-settled-receipt.json), [Instant bill](evidence/pos-instant-bill-confirmation.json), [Owner view](evidence/owner-after-settlement-billing.json) |
| F28 | P1 / local runtime | Kiosk / email bill | Touch entry reached `/api/v1/receipts/email`, which returned **500**. The UI retained the popup with “Invoice email not sent — Internal server error”. The local backend could not resolve PDFKit’s `standard-fonts/Helvetica.cjs` | Verify PDF dependencies in a clean locked install and final container/artifact; exercise receipt generation before enabling email delivery. Do not assume this local packaging failure is deployed in production | [Email error](evidence/kiosk-email-send-acknowledgement.json), [Sanitized server reason](evidence/EMAIL_FAILURE_REASON.txt), [HTTP result](evidence/http-errors.jsonl) |

### Financial issues should be fixed first

F01 and F02 need a shared definition of draft, accepted, served, collected and refunded. “Kitchen complete” does not mean “paid”. A canonical sync record can retain `READY` while its line says `SERVED`; checking only the top-level enum produces a misleading test failure. The served kiosk line subsequently reached every branch device and collection moved its financial state to `COMPLETED` / `SUCCESS`.

The test CSV deliberately had no images and used an unsupported `gst_rate` column. The supported template uses `tax_rate`. Therefore zero tax in these fixtures is **not** evidence of a tax synchronization bug. An import warning for unknown columns is recommended below.

## Successful flows worth preserving

| Scenario | Verified result / evidence |
| --- | --- |
| Owner imports 100 menu dishes | Preview/import/publish succeeded; the last dish was found in authoritative entity sync. [Admin feature log](evidence/ADMIN_FEATURES.log) |
| Menu reaches guest/staff apps | POS, kiosk and QR exposed the first and last imported dishes; QR did not remain on “menu unavailable”. [POS](evidence/pos-billing-desktop.json), [QR log](evidence/QR_GUEST.log) |
| Staff setup and deletion | Cashier/Captain/Kitchen/Manager PINs issued; terminal sign-in exercised; unused Manager access removed and synchronized. [Revocation](evidence/STAFF_DELETE.log) |
| Manual percentage discount | Typed 10% into the POS dialog; INR 100 cart became INR 90. [Applied result](evidence/pos-manual-discount-applied.json) |
| Kiosk counter order | Exactly one matching INR 101 pending order reached the backend and POS collection inbox; it was not auto-cancelled during observation. [Cross flow](evidence/CROSS_FLOW.log) |
| KDS ready and served | Ready ticket rendered; served kitchen line persisted. Priority used the actual select control, not the option text as a button. The final idle reprint check preserved the complete order-ID set. Concurrent new orders made an earlier count comparison inconclusive. [KDS evidence](evidence/kds-ticket-ready.json), [Idle reprint](evidence/KDS_FINAL.log), [Canonical state](evidence/canonical-orders.json) |
| Cash collection | POS settled the INR 101 kiosk order. All four branch terminal tokens subsequently returned the same total, successful payment and served dish. [Cross-device verification](evidence/OWNER_COLLECTION.log) |
| Owner billing | INR 203 accepted order value, INR 101 collected and INR 102 outstanding reconciled for the controlled two-order checkpoint. The dashboard draft issue is listed separately. [Billing](evidence/owner-after-settlement-billing.json) |
| POS source order | Cash instant bill created a distinct paid POS-source order. [POS order test](evidence/POS_ORDER.log) |
| QR → kitchen → Captain | Counter QR order reached KDS; priority and ready actions worked; Captain received the ready-food action and served the dish. [Ready](evidence/CAPTAIN_QR.log), [Served](evidence/CAPTAIN_SERVE.log) |
| QR completed status | Explicit `#status` restored completed preparation while still showing INR 102 due at the counter. Normal menu re-entry after completion is intentional route behavior, not a failure to persist service. [Status check](evidence/QR_STATUS_LINK.log) |
| Online QR payment, simulated | Approval exposed online checkout. Unpaid order remained DRAFT/PENDING; opening payment preceded confirmation. A valid simulated captured payment and real server HMAC verification produced confirmation with INR 103 collected / zero balance. [Final verified run](evidence/QR_ONLINE_FINAL.log), [Confirmation](evidence/qr-online-verified-confirmation.json) |
| Restaurant isolation | Restaurant B returned no A menu/staff/tables/customers/shifts/orders despite tenant-query tampering; owner token was denied platform administration. [Isolation](evidence/ISOLATION.log) |
| Branch isolation | A second-branch POS device received all 100 restaurant-wide dishes, while first-branch tables and orders remained inaccessible despite branch-query tampering. [Isolation](evidence/ISOLATION.log) |
| Kiosk touch keyboard | Email field is read-only to the OS keyboard and supports actual touch keys, symbols and domain shortcuts. Portrait/tablet layout fits; the failed email send remains visible rather than silently redirecting. [Tablet capture](evidence/kiosk-email-keyboard-tablet.png) |

These are specific assertions, not a promise of zero bugs in the entire order engine.

## Simplify the product for the people using it

| Persona | Recommended everyday flow | What should move out of their way |
| --- | --- | --- |
| Restaurant owner | Choose branch → Today / Orders / Menu / Team / Reports. First-run checklist links directly to each unfinished step | Device credentials, network addresses, internal enum names, duplicate menu-authoring entry points and unrelated products |
| Kiosk operator | Terminals → select device → welcome/menu/payment preview → publish → delivery acknowledgement | Hundreds of translation keys and restaurant-wide settings disguised as per-device changes |
| Cashier | Open shift → choose table/takeaway → dishes → optional customer/reward/discount → collect → receipt | Full-screen unrelated help alerts, ambiguous payment labels and hidden operational navigation |
| Customer | Start → language/order type only when needed → clear menu filters → cart → payment → token/receipt | Duplicate filter labels, staff-facing setup wording, technical errors and claims of payment before collection |
| Captain | My floor → take/continue order → send dishes → deliver ready food → request bill → handover | Static assignment examples, unclear ownership and interruptions without an assigned responder |
| Cook | Station → prioritized tickets → item ready → pass/served according to service policy | Unmeasured performance claims and configuration controls mixed into rush-hour actions |
| Platform operator | Restaurant workspace → products/branches/devices/payments/releases → actionable alerts | Re-entering opaque IDs, broken detail deep links and repeated labels for different incident types |

## Recommended additions and improvements

These are proposed changes, **not claims that every underlying capability is absent**. Several capabilities already exist but need a clearer entry point, better scope or stronger verification.

| ID | Priority | Improvement and acceptance criteria |
| --- | --- | --- |
| R01 | P1 | One financial summary policy shared by dashboard, billing, POS footer and exports. Show accepted value, collected money, outstanding accepted debt and refunds separately |
| R02 | P1 | One payment-state receipt renderer for every app; an unpaid receipt must never say paid |
| R03 | P1 | A complete order audit timeline: source, branch, items, kitchen events, payment attempts, collections and refund events. Link every app’s order detail to the same record |
| R04 | P1 | Sync acceptance displayed per device and menu/config version, including last applied time, pending queue and retry reason. Preserve existing diagnostics and make them understandable |
| R05 | P1 | Explicit drawer/shift policy with an unassigned-cash report and recovery path |
| R06 | P1 | Payment setup acceptance checklist that tests credentials, collection approval, callback/webhook routing and actual merchant methods without exposing credentials |
| R07 | P1 | A clean-install/container smoke test that generates one receipt PDF and one backup PDF before release |
| R08 | P1 | A release browser test that refreshes every nested route under both root and configured proxy prefixes |
| R09 | P2 | Owner onboarding task list with direct actions, progress by branch and the ability to resume. Keep advanced settings optional |
| R10 | P2 | Retain last valid operating branch, explain restaurant overview, and offer a clear one-tap branch picker when opening a scoped page |
| R11 | P2 | Publish settings as a reviewable draft with before/after preview, explicit scope and acknowledgements from selected terminals |
| R12 | P2 | Multi-kiosk configuration comparison, per-device overrides, last-delivered version and safe rollout/revert; verify that changing one override cannot change another terminal |
| R13 | P2 | Screen-based kiosk content editor: welcome, menu, cart, payment, receipt and assistance, with language preview |
| R14 | P2 | CSV import schema validation for unknown columns, explicit tax mapping, invalid/missing photos and duplicate SKUs; prevent silent assumptions |
| R15 | P2 | Menu publication summary showing actual public visibility, out-of-stock exceptions and terminal delivery, with links to a real customer preview |
| R16 | P2 | Customer reward choice in the checkout flow with point cost, benefit, remaining balance and earning estimate. Retest configured active/paused rewards and refund reversal; opening a customer drawer does not verify loyalty |
| R17 | P2 | Search and selection for long modifier, category, combo and staff lists; test real menus with variants/add-ons, not only plain CSV dishes |
| R18 | P2 | Keep quick Billing / Orders / Tables / Collect navigation and explain optional “More tools”; do not hide essential cash tasks in advanced menus |
| R19 | P2 | Non-blocking service-request inbox with responder ownership, acknowledgement, escalation and deduplication |
| R20 | P2 | Label every icon, implement keyboard/focus handling in every dialog and use consistent touch targets |
| R21 | P2 | KDS density presets, long-ticket scrolling, TV-safe contrast and font sizes validated at actual screen/zoom settings. Existing layout controls are present; verify them under a peak queue |
| R22 | P2 | Truthful measured kitchen durations, including missing-data states and per-station workload |
| R23 | P2 | Captain assignment/handover view with actual zones and tables; show guest requests alongside an uninterrupted ordering workflow |
| R24 | P2 | QR receipt/history recovery after completion with visible outstanding balance. The explicit status deep link works; the ordinary menu route deliberately does not reopen completed orders |
| R25 | P2 | Restaurant-time analytics with a visible business-date boundary and equivalent CSV/PDF periods |
| R26 | P2 | Distinguish a disabled licensed feature, a not-configured feature and a service error. Show a useful next action for each |
| R27 | P2 | A unified scoped settings summary: business identity, tax, payments, receipts, devices and products. Separate restaurant defaults from branch/device overrides |
| R28 | P2 | Platform deployment health should include frontend route loading and artifact availability, not only backend reachability |
| R29 | P3 | Purposeful empty states and direct next steps for CRM, purchasing, coupons, combos, reports and downloads |
| R30 | P3 | A compact mobile header with one app switch and one branch selector; consistent dialog/action placement across products |
| R31 | P3 | Better background design names, palette/contrast tags and side-by-side portrait/landscape previews |
| R32 | P3 | Consistent human-readable labels for internal payment/order/device states; retain technical codes only in diagnostic detail |
| R33 | P3 | Show published artifact versions, platform, architecture and update channel rather than seeded placeholder versions |
| R34 | P3 | Support ticket links that attach the current branch, device and sanitized diagnostic context automatically |

## Remaining verification gaps

| Area | What is still needed |
| --- | --- |
| Every button / every state | `BUTTON_MATRIX.md` lists which actions were merely inventoried. CRUD permutations, validation boundaries and all nested form tabs remain to be committed and checked individually. Dialog-open PASS is not business-flow PASS |
| Kiosk Admin fleet | Activate two kiosk devices, save different backgrounds, compare applied versions, test remote logout/lock/restart with acknowledgements and reconnect. One kiosk fixture does not prove multi-device configuration correctness |
| CRM / loyalty | Configure active rewards, grant points, redeem/decline reward, repeated paid visits, duplicate sync, cancellation, refund and concurrent redemptions. This run verified manual discount/customer entry but not that complete ledger |
| Captain orders | A QR table delivery was verified; creation of a brand-new Captain-source order, subsequent rounds, table transfer, merge/split and full handover were not all verified |
| Offline / LAN | Real Branch Core pairing, internet loss, simultaneous devices, queued writes, reconnect and conflict recovery. No Local Core was running in this isolated environment |
| Optional QR modules | Stock reservations, group sessions, pickup, translations, history, promotions and feedback require appropriate test entitlements. The base plan’s gated state was inspected; premium operational flows were not all exercised |
| Payments | Real Razorpay test merchant/browser SDK, Android/iOS UPI chooser/return, interrupted payments, double taps, counter switch, signature mismatch, partial refunds and payout reconciliation |
| Messages / receipts | Clean PDF dependency packaging; actual SMTP, WhatsApp and SMS delivery; attachment integrity and retry/deduplication. Email failed locally before transport |
| Reports | Downloaded CSV contents and generated PDF pagination/branding should be verified after the financial fixes. Some downloads were observed then cancelled during toolbar sampling |
| Hardware/native | Real printers, paper widths, reprint routing, barcode/touch devices, APK/EXE install/update, native SQLite migration and data persistence |
| Scale | Five branches with differing products, multiple POS/KDS/Captain devices, hundreds of live orders and large inventories/customers |
| Super Admin | Owner-detail route lacked a known fixture ID; privileged plan/release/device/payment mutations and complete onboarding wizard were not all committed. Six detail/configuration pages were rendered through client navigation, but direct-load failure remains |
| Production | Same-origin HTTPS, proxy prefixes, service-worker upgrade behavior, production configuration and current deployed artifacts must be checked separately. No production deployment or bank charge was performed |

## How to use the evidence

`stable-pages.jsonl` contains settled admin layout captures. Earlier screenshots can include splash/transition frames; these were rechecked and are not reported as persistent layout failures. `tests.jsonl` is a raw execution log and includes harness failures, stale selector names, a malformed simulated payment ID, initial branch/session setup problems and assertions that expected `PAID` where canonical collection uses `SUCCESS`. Consult [TEST_CLASSIFICATION.md](TEST_CLASSIFICATION.md) and the corrected final logs before treating these as product defects.

Expected 401s before cookie restoration, deliberate authorization denials, unlicensed optional-feature 403s, requests aborted during navigation, unconfigured printers and lazy thumbnails below the viewport are **not** counted as new production bugs.

No application source fixes were made as part of this audit. The new files are audit scripts, reports and evidence. Existing workspace edits were preserved. The next implementation order should be F01/F02/F03, then identity/metrics, interruptions and shift policy, then the settings and accessibility improvements.

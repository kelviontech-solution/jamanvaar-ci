# JAMANVAAR: usability, hardcoded behavior and unused-code assessment

Date: 12 October 2026. Baseline HEAD: `8a6a402eb17409dc2e0c4737ae1204fa20d9df43`.

Follow-up: implementation was subsequently authorized. See [changes and verification](IMPLEMENTATION.md) and [current backlog status](BACKLOG.md). This document retains the original audit findings and baseline counts.

## Assessment

The platform is feature-rich, but its daily workflows are not yet consistently easy for a new restaurant owner or member of staff. The highest-value next work is clearer financial behavior, fewer navigation decisions, and setup checks that verify the customer-facing result. Adding more pages would increase training effort before solving those problems.

Keep **shared platform, separate applications**. Owners need a management workspace; cashiers need billing and collection; captains need table tasks; kitchen staff need cooking tasks; guests need ordering. A shared login, menu, order engine and payment ledger should connect these experiences without turning every product into Restaurant Admin.

This is an audit and recommendation deliverable. No application code was changed, deleted, deployed or pushed during this assessment. The working tree already contained unrelated order-sync/report changes; it is not an immutable clean-checkout audit.

## Coverage and evidence limits

- Reviewed the seven frontend source trees, the additional QR product entry point, API source, and shared TypeScript/JavaScript packages. Restaurant Admin and Kiosk Admin are distinct product configurations in one frontend. Desktop/mobile builds reuse relevant frontend experiences.
- Automated scans cover **881 source files**, including tests located under `src`. Nine app/API entry points reach 832 of those files through the resolved import graph.
- TypeScript analysis recorded **881 unused-declaration/import/parameter diagnostics**. This is not a count of dead features or 881 broken files.
- Public browser probing is **incomplete**. Six preliminary desktop/mobile captures were produced for owner login, QR marketing and QR login. The first harness had a Tailwind configuration warning; the corrected rerun did not complete. Those captures are not visual acceptance evidence. Authenticated POS, Captain, KDS, Kiosk and QR ordering were not exercised end to end in this audit.
- Financial findings below are traced source paths, not demonstrations with real money. No production customer records, orders, payments or credentials were used.

Reproduction scripts and JSON evidence are in this directory. See [browser coverage](evidence/BROWSER_COVERAGE.json), [source scan](evidence/SOURCE_SCAN.json), [compiler unused declarations](evidence/UNUSED_DECLARATIONS.json), [resolved browser dialogs](evidence/NATIVE_DIALOGS.json), and [reachability classification](evidence/CANDIDATE_CLASSIFICATION.json).

## Findings that should be addressed first

### U01 — Day closing creates cash and identities the cashier did not enter

**High operational risk; source-confirmed.** The active close-day modal calls `BusinessDayService.closeBusinessDay`. That service opens the next business day with ₹2,000, then creates a shift using `POS-01`, `usr-cashier-1` and ₹2,000 opening/expected cash. Recovery repeats fixed defaults. An operator can therefore finish today's work and cause tomorrow's shift to appear open with a synthetic identity and float.

Sources: [close-day caller](../../../apps/restaurant-system/pos/src/components/days/PosCloseDayModal.tsx), [business-day service, around lines 194–210 and 304–310](../../../packages/business/src/business_day_service.ts).

Separately, `openingCash || 2000` in accounting, assistant and mesh handling replaces a legitimate zero with ₹2,000. The POS opening-float input also defaults to ₹2,000, but that editable suggestion is different from a forced accounting rule.

Sources: [accounting_service.ts:196](../../../packages/database/src/accounting_service.ts), [pos_assistant.ts:404](../../../packages/business/src/pos_assistant.ts), [lan_mesh_sync.ts:600](../../../packages/sync/src/lan_mesh_sync.ts), [PosShiftModal](../../../apps/restaurant-system/pos/src/components/shift/PosShiftModal.tsx).

Recommendation: close the actual register, count cash, reconcile differences and finish its shift. Opening the branch's next business date must not invent an employee shift or counted money. Start the next register shift with its authenticated cashier, activated device and explicitly entered/configured float. Preserve zero values. Treat branch business dates and individual register shifts separately.

Acceptance: start with ₹0 and ₹750, close/reopen, and verify both amounts remain correct; use two registers with different cashiers/floats; verify closure does not create an unrequested shift or change another till.

### U02 — Releasing a table can complete an unpaid order

**High operational risk; source-confirmed.** Captain's Free table confirmation says it will mark the bill “paid/completed without collecting it.” The store actually changes `orderStatus` to `COMPLETED`; it does **not** set payment success or create a collection. This wording is misleading.

The shared `isUnpaidOpenOrder` helper returns false for a completed order even when payment is pending. `BusinessDayRepository.recalculateMetrics` uses that helper when deciding whether to exclude unpaid orders from sales. This creates a concrete path where service completion and payment treatment disagree. POS's pending-counter-payment condition still includes completed pending orders, so it would be inaccurate to say the receivable disappears everywhere.

Sources: [Captain table workspace:568](../../../apps/restaurant-system/captain/src/components/tables/CaptainTableWorkspaceModal.tsx), [captainStore.ts:712](../../../apps/restaurant-system/captain/src/store/captainStore.ts), [repositories.ts:518 and 4453](../../../packages/database/src/repositories.ts), [POS Orders:321](../../../apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx).

Recommendation: separate **food delivered**, **table released**, **payment collected**, and **manager-authorized write-off**. A released table may leave a clearly visible outstanding bill. “Already paid” must reference a real tender/collection; a walkout needs an authorized reason and audit record. Revenue and collections can differ, but must have explicit labels and consistent rules.

Acceptance: release an unpaid table and verify the bill remains outstanding in POS, reconciliation and reporting; settle it once and verify collection once; distinguish a genuine write-off from payment.

### U03 — Manual UPI acknowledgement is presented as verified payment

**High clarity/reconciliation risk; source-confirmed.** POS's “Mark UPI Paid” button sets local confirmation state and displays “UPI Verified.” That interaction is a cashier acknowledgement, not Razorpay verification. The QR gateway path is separate and should not be described as equally manual.

Source: [PosPaymentModal.tsx:880 and 1019](../../../apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx).

Recommendation: display **Cashier-confirmed UPI** for manual collection and **Gateway verified** only for server-confirmed payment. Record who confirmed it, time, amount and reference where available. Make a common collection queue easy to reach for kiosk/QR/captain bills and distinguish pending attempts from collected money.

### U04 — Device names and local mesh identities are fixed in several clients

**Medium operational risk; source-confirmed.** POS registers with local mesh as `POS-01`, KDS as `KDS-01`, and Captain as `CAPTAIN-01`. Captain/KDS session fields also use those literals. Local peer maps keyed by these identifiers can collide when multiple same-type clients share the supported browser transport.

Sources: [POS App:134](../../../apps/restaurant-system/pos/src/App.tsx), [KDS App:268 and 396](../../../apps/restaurant-system/kds/src/App.tsx), [captainStore:411 and 1391](../../../apps/restaurant-system/captain/src/store/captainStore.ts), [mesh engine](../../../packages/sync/src/lan_mesh_sync.ts).

This does **not** establish that cloud activation IDs are fixed: cloud sync has real persisted device identities. Kiosk also resolves its activated ID before using a fallback. BroadcastChannel/localStorage transport is not proof of communication across different computers on the restaurant LAN.

Recommendation: use the activated identity everywhere an identity is required, and a configurable friendly name such as “Front counter 2” for staff. Explain actual connection states in everyday language: local billing available, cloud disconnected, pending sync, printer unavailable.

### U05 — Owner setup says “published” when only menu items exist

**Medium onboarding risk; source-confirmed.** The owner checklist labels its menu task “Add and publish your menu” but marks it done from `menuItems.length > 0`. Table/staff/printer checks similarly test existence. A separate, real **Publish to QR / Kiosk** action exists; the checklist does not verify that result.

Sources: [Admin App:1275–1279](../../../apps/restaurant-system/pos-admin/src/App.tsx), [menu publish action:236](../../../apps/restaurant-system/pos-admin/src/components/menu/MenuCategoriesModule.tsx).

Recommendation: one branch launch checklist should verify the current published menu version, active table QR mappings, payment readiness, product entitlement and order routing. Reuse the existing QR health checks rather than creating another disconnected checklist. Present “Guests can order” only after those checks pass, with actionable failures and a customer preview.

### U06 — POS hides navigation during its busiest task

**Medium usability friction; source-confirmed.** In billing, dish categories replace the main navigation. Switching to orders, tables or bills requires opening the navigation again. At narrower sizes category names become the first three characters, which can make similar categories indistinguishable.

Source: [PosSidebar.tsx:91 and 141](../../../apps/restaurant-system/pos/src/components/layout/PosSidebar.tsx).

Recommendation: keep Billing, Orders, Tables and Cash reachable without abandoning the cart. Put dish categories in a separate rail/picker and show readable labels. Maintain the existing touch-first direction; do not restore the decommissioned shortcut-help UI.

## App-by-app recommendations

| Experience | What already helps | What is still hard | Recommended everyday flow |
|---|---|---|---|
| Restaurant Admin | Grouped navigation, separate products, branch aggregation, menu templates/publication, CRM and reports | Many operational entry points, labels such as RBAC/KOT, setup checks based on existence, branch-selection detours | Today → Orders & Bills → Menu → Tables → Team → Settings. Keep advanced tools grouped and searchable. Auto-select the only branch; retain explicit scope for multiple branches. |
| Kiosk Admin | Per-terminal welcome settings, design access controls, receipt/device settings and remote logout already exist | Owners must understand terminal scope versus restaurant settings and which changes reached devices | Select terminal(s) → edit/preview → apply → show delivery/acknowledgement status. Separate shared defaults from terminal overrides with a clear reset-to-default action. |
| POS | Customer attachment, optional loyalty rewards, discounts, split tender, pending counter collection and print queue exist | Navigation changes during billing; payment vocabulary; register/day complexity; reward discovery | Build cart → optional customer/reward → payment → receipt. Keep collection tasks prominent and manager-only tools out of the cashier's normal path. |
| Captain | Tables, ready food, bill requests, course firing, service requests, transfer/merge and priority actions exist | Tasks are distributed between attention strip, tabs and More; Free table mixes service and finance | My floor task feed → table → add/fire dishes → deliver ready food → request/settle bill → release table. Add structured handover with pending tasks and acceptance. |
| KDS | Search, urgency ordering, reprint, undo, stations, allergies, per-dish status and expo already exist | Several status concepts and varying card lengths; readable density differs between tablet and distant TV | New → Cooking → Ready; optional expo. Let floor staff record table delivery when configured. Provide compact/comfortable/TV presets and configurable station timing. |
| Customer Kiosk | Branded welcome, languages, live menu/cart, online/counter checkout, touch receipt keyboard and reset exist | Start always leads through language selection; order-type UI always offers dine-in and takeaway; dine-in adds table selection | Skip a language screen when only one language is enabled. Make supported modes configurable and skip single-choice screens. For a known table/device binding, prefill table context visibly. Preserve receipt/payment completion and privacy reset. |
| Customer QR | Live menu, cart, checkout, payment attempts, order status and receipt; demo is separate from production | Payment/kitchen progress can be cognitively confusing; errors and retries need a consistent concise explanation | Scan → browse → cart → pay/choose counter → verified result → food status. Show payment and preparation as separate states; never call pending payment “paid.” |
| QR Admin | Grouped sidebar, setup health, live branding preview, menu publishing, orders/payments, service/pickup/analytics | Fourteen destinations plus advanced subsections; related configuration lives in multiple places | Orders → Menu → Tables → Payments → Guest Experience → Settings. Use presets for table pay-now, table pay-at-counter and pickup; retain advanced functions inside these areas. |
| Super Admin | Seven-step resumable onboarding, plans/modules/devices and welcome kit flow | Platform staff must configure a large matrix; owners inherit activation vocabulary | Start with product presets, then explicit branch/product/device assignment. Validate the setup and deliver safe direct links/instructions for the appropriate app. Keep licensing mechanics here. |

Evidence for navigation: [adminProducts](../../../apps/restaurant-system/pos-admin/src/adminProducts.ts), [admin nav sections](../../../apps/restaurant-system/pos-admin/src/navSections.ts), [QR navigation](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts), [Captain App](../../../apps/restaurant-system/captain/src/App.tsx), [KDS App](../../../apps/restaurant-system/kds/src/App.tsx), [Kiosk steps:440–453 and 2440–2579](../../../apps/kiosk-system/kiosk-user/src/App.tsx), [Super Admin onboarding](../../../cloud/super-admin-web/src/pages/Onboarding/OnboardRestaurantPage.tsx).

These are proposed task groupings, not permission shortcuts. Keep backend roles, plan entitlements, branch isolation and audit controls authoritative. Do not expose Branch B's data to simplify Branch A's navigation.

## Features worth adding or completing

Prioritize capability gaps over more standalone pages:

1. **One launch assistant across purchased products.** Verify publication, payments, QR/table mappings, printers and device routing; show the next action rather than raw technical configuration.
2. **An obvious collection/reconciliation inbox.** Existing pending-order settlement should become a clear task queue with source filters, outstanding balance, gateway/manual provenance and protection against duplicate collection.
3. **Per-register shift lifecycle and guided floor handover.** Resolve U01/U04 first; then guide counted cash, outstanding bills, ready dishes and the receiving employee. A logout warning is not a handover.
4. **Role-specific home screens.** Owner: sales, unpaid bills, menu availability and alerts. Cashier: billing and collection. Captain: tasks for assigned tables. Kitchen: cook/ready tasks. Defaults should reduce decisions without hiding licensed tools permanently.
5. **Gujarati/Hindi staff interfaces.** Customer multilingual features exist, but no shared language-selection/i18n mechanism was found in the POS/Captain/KDS sources reviewed. Prioritize core staff actions and error messages rather than translating every advanced setting first.
6. **Clear publication and connection outcomes.** Show which devices received a menu/settings version, how many sync actions are pending, and the recovery action. Status must describe observed acknowledgements, not simply that a configuration row exists.

The handover and staff-language recommendations are gaps not found in the reviewed flows; absence from static inspection is not proof that no external integration provides them.

Do not classify these as missing: loyalty redemption, customer points, kiosk receipt keyboard, remote kiosk logout, KDS search/priority/reprint, QR demo, QR setup checks, QR branding preview, or separate Kiosk Admin. They are present in the current sources. Improve discoverability and verify their real workflows instead of duplicating them.

For example, [PosLoyaltyRewards](../../../apps/restaurant-system/pos/src/components/customers/PosLoyaltyRewards.tsx) already presents “Use loyalty rewards,” affordability/paused states and the option to retain points. Make that choice visible when attaching a customer and on settlement; do not replace it with automatic redemption.

## Hardcoded values: business rules versus reasonable defaults

| Value or behavior | Evidence | Assessment |
|---|---|---|
| ₹2,000 cash and fixed next-shift identity | U01 sources | Forced behavior should change; editable suggested float may remain configurable. Zero must be valid. |
| `POS-01`, `KDS-01`, `CAPTAIN-01` identities | U04 sources | Use actual identity for records/transport; friendly defaults can remain display names. |
| Manager approval above 25% or ₹500 discount | [posStore.ts:302–307](../../../apps/restaurant-system/pos/src/store/posStore.ts) | Real fixed approval policy, not fake discount data. Make it an authorized restaurant policy while preserving server enforcement. |
| KDS fallback 10 minutes, clamped to 4–60 minutes | [kdsLogic.ts:39–43](../../../apps/restaurant-system/kds/src/kdsLogic.ts) | Item prep times already affect timing. Configure the fallback/bounds by station if restaurants need longer/shorter work; do not claim all tickets use 10 minutes. |
| Language step and both kiosk service modes | [Kiosk App:453, 2487, 2519](../../../apps/kiosk-system/kiosk-user/src/App.tsx) | Real fixed flow decisions; use configured available choices and skip one-choice screens. |
| QR sample/demo menu | [QrProduct](../../../apps/restaurant-system/pos-admin/src/qr/QrProduct.tsx) | Intentional isolated demo content, not production hardcoding. Keep explicit demo labeling. |
| Brand palette, icon constants and default labels | Frontend presentation | Usually legitimate design defaults. Allow restaurant overrides where product settings support them; avoid turning every visual constant into a complex setting. |

## Dead code and maintainability

### Confirmed unused declarations

The compiler found 881 unused declaration/import/parameter diagnostics. Kiosk App has 39; Admin App 32; POS Shift & Cash 24; Admin EOD document and Orders module 23 each. Some diagnostics cover an entire import declaration, so this is a compiler-warning count, not an exact count of individual symbols.

Remove unused icons/imports and abandoned state after checking side effects and callback contracts. Avoid blindly removing parameters that document or implement an interface. Enable gradual no-unused enforcement for touched modules rather than creating one large risky cleanup.

### Whole-file candidates, with false positives excluded

The graph found 49 files outside the nine runtime roots:

| Classification | Count | Action |
|---|---:|---|
| Tests | 30 | Keep; they are not app runtime modules. |
| Separate branch-core service | 11 | Keep; this service has its own entry point. |
| Durable database drivers/worker | 3 | Check runtime loading/build packaging; do not delete. |
| Seed CLI helper | 1 | Keep if seed tooling uses it. |
| Public validation exports | 2 | Review package/external consumers before changing the public API. |
| Review candidates | 2 | Inspect the cases below. |

- [ShortcutsHelpModal](../../../apps/restaurant-system/pos/src/components/common/ShortcutsHelpModal.tsx) is deliberately decommissioned and returns `null`; it retains unused imports. The touch-first test still references the file. Clean the imports or remove the file together with the appropriate test update, preserving the no-shortcut-help design.
- [FeatureGuard/RequiresFeature](../../../cloud/api/src/common/guards/entitlement.guard.ts) has no other references in the searched API source/tests. Treat it as a possible unused guard or unfinished migration. Other authorization/entitlement controls exist; this finding is **not** proof that the API lacks licensing enforcement. Confirm intended ownership before removing or wiring it.

The 86 unresolved import-graph entries include CSS and TypeScript/JavaScript resolution cases; they are not 86 verified broken imports.

### Architectural complexity affects UX fixes

The database repository file has 4,868 lines; Kiosk App 4,353; Admin App 2,087; POS store 1,911; Super Admin onboarding 1,811. These concentrations make it harder to change one workflow without side effects. Split by domain and workflow boundary: payment collection, cart, table service, menu publication, device activation, register shifts and business dates. Preserve one authoritative order/payment contract across apps.

The scan found 519 explicit `any` keywords and 1,398 source lines containing 8–11px text classes. These are review signals, not security bugs or rendered readability scores. Narrow types around order/payment transitions first. Audit core operational text at actual tablet and TV distances; captions can remain smaller where readable.

Symbol resolution found 12 browser-native dialog calls. Several are fallback paths where custom confirmation can be supplied, so they are not 12 always-visible browser popups. Unify active confirmation flows around the themed dialog system and avoid exposing browser-native confirmation on touch-only tasks. The shared modal focus support already exists; do not repeat older claims that it is absent.

## Implementation order and human verification

1. **P0: accurate cash, order completion and payment provenance.** Implement U01–U04 with regression coverage for zero float, two tills, unpaid table release, manual UPI and duplicate retries. Keep existing SQLite data and offline billing.
2. **P1: shorten everyday work.** Persistent POS navigation, verified menu launch checklist, single-choice kiosk skipping, role-specific task homes, collection inbox and guided handover.
3. **P2: polish and cleanup.** Configurable station display/timing, staff language, consistent text/actions/statuses, reviewed unused-code cleanup and smaller domain modules.

Use realistic branch-scoped fixtures and ask representative users to complete these tasks without instruction: owner loads/publishes a menu and confirms it on QR; cashier makes a sale and collects a kiosk bill; captain delivers food, requests payment and releases a table; kitchen staff locate/prioritize/ready a ticket; customer completes payment and receives a bill. Measure successful completion, wrong actions, help requests and retries before/after. Include offline/reconnect and a second branch/device so simpler UI does not weaken isolation.

No new numerical “perfect” score is assigned. Static review can identify concrete friction and correctness risks, but ease of use and release acceptance require those operational browser/device tests.

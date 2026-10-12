# Further workflow gaps and owner experience

Follow-up fixes and newly found gaps: [NEXT_GAPS_IMPLEMENTATION.md](NEXT_GAPS_IMPLEMENTATION.md). This review is retained as historical evidence; "No app code was changed" below describes the review, not the subsequent implementation.

Reviewed 12 October 2026 against the current working tree, after the usability implementation pass. Baseline Git HEAD remains `8a6a402eb17409dc2e0c4737ae1204fa20d9df43`; application edits are still uncommitted.

This is a follow-up assessment, not another claim that everything is broken. Findings distinguish source-confirmed control flow from proposed experience improvements. No new authenticated browser session, physical-device test or payment-provider transaction was run for this review. No app code was changed.

## Assessment

The apps are easier than before, but a first-time owner still has to understand too many separate concepts: account login, device activation, branch context, local connection, menu draft, publication, terminal delivery, register shifts and branch closing. Experienced staff can learn these; the product should guide a new operator through them.

The hardest remaining journeys are opening a newly onboarded restaurant, understanding why a dish is absent from a customer menu, resolving a collection/status discrepancy, handing over unfinished floor work and closing several registers. The biggest opportunity is to connect existing functions into clear tasks with visible outcomes.

## Correctness gaps to address before more feature work

| ID / priority | Evidence and operator consequence | Change and acceptance |
|---|---|---|
| F01 / P0 | `PosCloseDayModal.tsx:57` substitutes expected cash when the actual-count field is blank. Finalization only disables for processing. An owner can record a balanced drawer without entering a count, despite a separate explicit use-expected button being available. | Require an entered count, including valid zero, or explicit documented acceptance of an uncounted balance. Test blank, zero, variance and manager approval; do not silently equate expected with counted. |
| F02 / P0 | The same modal returns early for `!isOpen` before calling two `usePosStore` hooks. `PosDayHistoryView.tsx:362` retains it while `selectedDay` exists and changes `isOpen`. This is a source-confirmed hook-order defect with a path that can produce a React render error. Not browser-reproduced in this review. | Move all hooks before the return. Render closed → open → closed through Day History and verify no hook-count exception or blank screen. |
| F03 / P0 | QR `StatusScreen` stops polling for `COMPLETED`, regardless of unpaid counter balance. Its manual payment-status button is offered only for `PENDING_PAYMENT`. Food can be completed first, then paid at POS, leaving the customer's open page showing old payment information. | Track service and money independently. Continue bounded payment refresh while money is outstanding; offer explicit refresh for counter orders. Test KDS served → counter collection → customer receipt updates without reload. |
| F04 / P0 | Captain More's sign-out calls `logout()` directly; the store clears `cartItems`. The new handover refuses unsent carts, but ordinary logout bypasses that protection. | Before signing out, offer save draft, return to order or validated handover. Test that accidental sign-out cannot silently discard unsent dishes. Keep actual collection separate. |
| F05 / P1 | KDS station filtering falls back from exact matching to name heuristics: a station containing “main” can receive tickets containing “curry” or “kitchen” when no exact ticket matches. This can unexpectedly broaden a cook's queue. | Use stable station identifiers and explicit configured legacy aliases. Test similar names, an empty station queue and several screens; no automatic widening of station responsibility. |
| F06 / P1 | KDS cancellation alerts expire using the ticket's creation time (`createdAt`) and a 12-hour cutoff. A long-open ticket cancelled now can receive no cancellation warning. | Base alert lifetime on cancellation time, or retain until acknowledgement with a bounded explicit retention policy. Test a 14-hour-old ticket cancelled now. |
| F07 / P1 | Menu Manager says a version is published to “connected terminals” immediately after publishing. Sync Health correctly tells the owner to check acknowledgements. These messages imply different delivery guarantees. | Show separate states: saved draft, server published, devices acknowledged. An offline kiosk must be shown as awaiting delivery, not updated. |

Sources: [close-day modal](../../../apps/restaurant-system/pos/src/components/days/PosCloseDayModal.tsx), [Day History caller](../../../apps/restaurant-system/pos/src/components/days/PosDayHistoryView.tsx), [QR customer status](../../../apps/qr-guest/src/App.tsx), [Captain sign-out](../../../apps/restaurant-system/captain/src/components/modals/CaptainMoreDrawer.tsx), [Captain store](../../../apps/restaurant-system/captain/src/store/captainStore.ts), [KDS filtering and cancellation](../../../apps/restaurant-system/kds/src/App.tsx), [menu publication](../../../apps/restaurant-system/pos-admin/src/components/menu/MenuCategoriesModule.tsx), [sync acknowledgement wording](../../../apps/restaurant-system/pos-admin/src/components/sync/SyncHealthPanel.tsx).

## Experience improvements backed by the current flow

| ID / priority | Current friction | Recommended experience |
|---|---|---|
| F08 / P1 | POS now has four persistent tasks, but its secondary navigation still presents eleven pages without consulting `currentUser`/role in `PosSidebar`. This is a presentation issue, not proof of missing backend authorization. | Cashier defaults: Bill, Collect, Tables, Customers, My register. Put reports, inventory and configuration under an authorized More area. Manager keeps the full toolset. |
| F09 / P1 | Owner dashboard shows awaiting money, device health, alerts and recent orders, but those cards/rows have no drill-through action. Owners must find the matching page manually. | “₹250 awaiting payment → View unpaid bills”; “Kiosk 2 behind → Check device”; recent order → full timeline. Preserve branch/date/source context in the destination. |
| F10 / P1 | Owner menu readiness and QR health exist, but a successful server publication still leaves the owner to manually inspect a guest page and test staff delivery. | A guided launch session: choose branch, check published/available counts, open guest preview, create a clearly identified test order, verify its delivery and void it through an auditable process. Use isolated training data or an explicitly authorized test order. |
| F11 / P1 | Multi-register day closure is now protected, but the close UI does not guide the owner through each participating till before the final guard rejects closure. | A close checklist listing register, cashier, outstanding balance and counted state, with direct actions. Close each till, review branch totals, then close the day. |
| F12 / P1 | Captain “My Tables” counts `tables.length`, and “Active Orders” counts occupied/bill-requested tables rather than order records. The floor's actual My Tables selector is more precise. | Use the same ownership selector and actual order definitions for page and badge. Three orders on one table must not be displayed as one order. Label branch-wide counts explicitly. |
| F13 / P1 | Captain desktop tab text uses `t()`, while mobile tab text is built from raw English labels. Drawer descriptions, several errors and guest payment messages remain inconsistent across languages/terminology. | Translate mobile and desktop from the same keys. Share simple status vocabulary: received, cooking, ready, delivered; unpaid, partly paid, paid, refunded. Differentiate manual collection from gateway verification. |
| F14 / P2 | POS loyalty works but eligible rewards are inside a collapsed details panel. A cashier sees a points balance without knowing whether it buys a useful reward until opening it. | After customer attachment, show “Eligible: ₹100 off — Use / Keep points” based on actual configured rewards. Do not redeem automatically. Preserve stacking and approval rules. |
| F15 / P2 | QR Admin has 14 pages plus advanced sections. Languages, promotions, collections and license tools are separated from related everyday setup. The sidebar is improved, but first-time configuration still crosses several destinations. | Add a first-time setup path and Basic/Advanced presentation. Keep payment methods with payment readiness, service hours with pickup rules, and guest appearance/language together. Retain all licensed functions and deep links. |
| F16 / P1 | Owner sign-in asks for Restaurant ID; the help says to find it in Super Admin, which a restaurant owner normally cannot access. Recovery exists, but this instruction is aimed at platform staff. | Send an owner-specific welcome link/card with Restaurant ID and direct product links. Offer a secure “Find my restaurant” flow through a verified account, respecting tenant isolation and preventing enumeration. Device activation remains explicit and one-time. |
| F17 / P2 | The QR guest unavailable-menu message asks the guest to have staff “publish it from Menu & Catalog.” That is an admin instruction inside a customer experience. | Tell guests what they can do: retry, ask staff or order at the counter. Put technical reason and direct fix in owner/admin diagnostics. |

Sources: [POS navigation](../../../apps/restaurant-system/pos/src/components/layout/PosSidebar.tsx), [owner dashboard](../../../apps/restaurant-system/pos-admin/src/components/dashboard/BranchBusinessDashboard.tsx), [launch check](../../../apps/restaurant-system/pos-admin/src/components/dashboard/MenuLaunchCheck.tsx), [Captain navigation](../../../apps/restaurant-system/captain/src/components/layout/CaptainNavigation.tsx), [ownership selector](../../../apps/restaurant-system/captain/src/store/captainStore.ts), [loyalty panel](../../../apps/restaurant-system/pos/src/components/customers/PosLoyaltyRewards.tsx), [QR navigation](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts), [owner login](../../../apps/restaurant-system/pos-admin/src/App.tsx), [QR guest error wording](../../../apps/qr-guest/src/App.tsx).

## Useful features to add or connect

These are proposed enhancements, not proven missing backend infrastructure.

1. **Daily owner task list.** Reuse existing alerts, outstanding bills, stock and device health. Each item needs an owner, severity, a clear next action and acknowledgement. Start with “Open for service” and “Close today,” rather than another analytics page.
2. **Explain why a dish is missing.** From any admin menu item, show branch scope, draft/publication version, availability, category visibility, service hours and terminal acknowledgement. For an import, show how many items are imported, published and currently orderable, with reasons for differences.
3. **Staff practice mode.** A platform sandbox and QR demo already exist, but no staff-facing practice journey was found in the POS/Captain/KDS review. Reuse isolated infrastructure for a practice sale, table order, kitchen ticket and till count. Training orders must never touch live stock, customer points, tax invoices or collections.
4. **Reusable operating profiles.** Example: counter takeaway, table service, food court and kiosk-only. Apply safe defaults to the selected branch, preview changes and show overrides. Reuse current product presets and per-terminal configuration; never copy signing keys, staff credentials or payment-provider secrets.
5. **Actionable disruption guide.** Explain operational capability rather than one vague online/offline badge: “Billing works; online payments unavailable; 12 changes waiting; reconnect this terminal.” Reuse actual health and queue state, with role-appropriate recovery actions.
6. **Guest-request acknowledgement.** Kiosk already sends real service requests and reports delivery failure. Extend the customer experience, where supported, from “request sent” to “accepted by staff” to “resolved.” Request delivery is not proof someone is coming.

## Intended daily flows by application

| Experience | Simple default journey |
|---|---|
| Restaurant owner | Today → act on open tasks → update/publish menu when needed → check collections → close registers/day. |
| Cashier / POS | Staff PIN → open my till → bill → optional customer/reward → collect → receipt. Existing Kiosk/QR/Captain bills go through Collect. |
| Captain | PIN → my tasks/tables → take order → send kitchen → deliver ready dishes → request collection → release table → safe handover/sign-out. |
| KDS | Assigned station → new/cooking tickets → mark dishes ready → pass/delivery state according to the branch's operating mode. |
| Kiosk guest | Start → skip single choices → browse → optional customisation → pay/counter choice → token/receipt → clear session for next guest. Keep lengthy tracking off the shared terminal. |
| Kiosk Admin | Terminals → choose terminal or branch defaults → preview welcome/menu → apply → confirm acknowledgement. |
| QR guest | Scan → browse → cart → payment choice → confirmed payment/service states → receipt or another order. |
| QR Admin | Setup checklist initially; then Orders/Service as the daily home. Menu, Tables and Payments are direct tasks; advanced setup is secondary. |
| Super Admin | Choose deployment profile → validate branch/product/device setup → send the owner clear links/instructions → monitor provisioning exceptions. |

## What already exists

Do not rebuild features already present: optional loyalty redemption, menu import preview, menu templates, KDS search/priority/reprint/undo, QR live payment/status APIs, QR demo and setup health, Captain handover, kiosk receipt touch keyboard, kiosk accessibility controls, remote logout, per-terminal welcome/ordering settings, branch dashboards and sync acknowledgements.

The recommendation is to make these discoverable and consistent, and fix the concrete edge cases above.

## Acceptance and implementation order

First fix F01–F07 and the Captain count definitions. Then implement owner action links, role-focused POS presentation, guided open/close and menu delivery diagnostics. Follow with localization consistency, reward discovery and training/profile enhancements.

Measure usability with a new owner, cashier and captain using a test restaurant. Ask them to set up a menu, make a first sale, collect an older kiosk bill, deliver a table order, respond to a request and close two tills without coaching. Record wrong actions, help requests, failed retries and steps required. Repeat after the changes, including offline/reconnect and a second branch. Static analysis and build passes cannot establish that every app is easy for an untrained human, so no perfect score is assigned.

# KDS and Captain operational controls — 7 October 2026

This change adds the requested kitchen search, manual urgency and KOT copies, and repairs the Captain controls that were missing or disconnected. It builds on the earlier Kiosk/KDS lifecycle fixes; it does not make a new sale, settle a payment or recreate an order when printing or changing urgency.

## Confirmed gaps and repairs

| Area | Finding before this change | Severity | Implementation and expected impact |
| --- | --- | --- | --- |
| KDS search | No usable token/table/KOT search | Medium | Optional search across token, table, KOT/order number, station, cashier and dish. `#101` matches the exact token; ordinary text matches partial details. Clear restores the board. Search also works on served tickets and the pass. |
| KDS manual priority | Sorting only reflected age and status | Medium | Each open ticket offers Normal/Urgent. Urgency belongs to the order and reaches every station/device. Cancellation alerts remain first; urgency promotes cooking tickets ahead of normal tickets, then FIFO applies. A local FIFO view is also available. Fully ready orders still lead the pass. |
| Priority sync | A UI-only priority would be lost on another device or reload | High | Persist the three priority fields on the order; send them through the existing outbox/API metadata. Increasing revision and deterministic change-ID comparison resist stale snapshots and converge simultaneous edits. Backend accepts changes from KDS, POS and Restaurant Admin devices; customer Kiosk and Captain devices cannot forge priority. |
| KOT reprint | No KDS or Captain copy action | Medium | Existing ticket opens an 80 mm print document labelled `REPRINT — EXISTING KOT COPY`; retains station, token, table, KOT/order number, quantities, modifiers, course/seat and notes. Cancelled tickets/dishes explicitly say do not cook. Restaurant text is HTML escaped. Audit records identify the operator. |
| Captain Live KOT | Search state had no input; no Ready view; token absent from search | Medium | Search input, exact-token search and Ready-to-serve filter. Reprint and visible urgency, line status, modifiers and special/order notes make the monitor useful during service. |
| Captain premature serving | Mark Served was offered for cooking/cancelled tickets; repeated taps could increase shift counts | High | Entire-ticket delivery requires READY. Single-dish delivery rechecks live ticket/line readiness, including a kitchen Undo that arrived before the ready list refreshed. Repeated taps do not increment served quantities. Bulk delivery counts successful updates. |
| Captain Active Orders | KOT selection used the table number and included tickets from an earlier dining session | High | Derive service status from the table's current order only. Partial ready dishes are visible. Search also accepts token, order number and customer name. |
| Captain dietary menu | Jain state existed but was not applied and had no selectable menu control | Medium | Visible Jain button and an actual dietary predicate. Vegetarian view includes Jain/Vegan items; the Jain view is specifically Jain. A menu item without a SKU cannot crash search. |
| Captain order progression | Workspace milestone completion was hardcoded | Medium | Milestones derive from submitted dishes and real kitchen states. No READY/SERVED assertion is made from a static step index. |
| Captain transfer access | Workspace received a transfer/merge callback but never exposed it | Medium | Permission-aware transfer/merge button in the workspace. Destination selection resets when opening a different session; confirmation stays disabled until a destination is selected. |
| Transfer across apps | A cloud pull updated item/payment state but left existing order and KOT table destinations unchanged | High | Applying an accepted remote order version updates the existing order/tickets to the transferred table. It preserves KOT IDs/numbers, so reprints and kitchen delivery use the correct destination without duplicate tickets. |
| Captain Food Ready | No practical table/token/dish/station search | Medium | Search filters the ready list. Delivery of shown items affects only those matching ready dishes and uses the guarded serving actions. |
| Kitchen notification routing | Counter bill requests targeted ALL roles and appeared over kitchen action buttons on small screens | Medium | Bill collection alerts target POS and Restaurant Admin; KDS retains kitchen messages rather than displaying cashier collection prompts. |
| KDS compact screens | Added controls could consume the long-ticket dish viewport at 360×740 | Medium | Keep search and ordering in one compact row, and place the timer beside priority/reprint. Long dish lists retain a scrollable viewport while actions remain reachable. |

## What Captain already has

Real staff PIN sign-in, table seating and guest counts, course firing, held dishes, seat assignment, menu customisation, manager-protected dish cancellation, ready-food delivery, table transfer/merge, kitchen messages, guest requests, bill and split-bill requests, shift statistics and retained sessions were already present. They were retained. Actual cashier payment settlement remains in POS.

## Tested flow

The browser runner drives compiled applications against a dedicated local API and database with disposable restaurant/device fixtures:

1. Kiosk submits an unpaid counter order; KDS receives its ticket.
2. Captain activates through the actual key screen, signs in with a real fixture PIN, seats TN2, filters Jain dishes, adds Coffee and sends KOT.
3. Captain transfers TN2 → TN3 → TN2. Existing KDS tickets and the POS order follow the destination.
4. KDS searches, marks the Captain order urgent, and a second independently activated KDS screen observes shared urgency and changed ordering. Captain observes the urgent badge.
5. FIFO switches only the second screen's presentation. A forged Kiosk priority cannot override kitchen urgency. Offline priority changes are retained until reconnection.
6. Both KDS and Captain open labelled KOT copies while order count, line state, payment status and amounts remain unchanged.
7. KDS marks the order ready. Captain's filtered Food Ready delivery sends SERVED back to the database and POS while payment remains pending.
8. Captain requests the bill. POS receives the same order's bill request and handles collection.
9. KDS card overflow, font sizing, scrolling and reachable actions are checked at seven tablet/TV/browser sizes, 360×740 through 2560×1440.

Search at the pass retains all stations of each matching order. Searching for one dish cannot hide another station's unfinished food and falsely enable whole-order serving.

## Main files

- `apps/restaurant-system/kds/src/App.tsx`, `KdsTicketCard.tsx`, `kdsLogic.ts`
- `apps/restaurant-system/captain/src/captainWorkflow.ts`, the Live KOT/Food Ready/Active Orders/table workspace components and `store/captainStore.ts`
- `packages/database/src/kitchen_priority.ts`, `packages/types/src/domain.ts`, `packages/sync/src/outbox.ts`
- `cloud/api/src/modules/order-sync/kitchen-priority.ts`, `order-sync.service.ts`, `dto/push-order-sync.dto.ts`
- `packages/ui/src/ThermalReceiptView.tsx`
- `tests/kitchen_controls_and_captain.test.ts`, `tests/captain_store_service.test.ts`
- `tooling/qa/browser-kds-captain-controls.cjs`

## Verification and limits

**136 regression tests across 11 files and 18 Playwright checks passed**, with zero browser page errors. API, KDS, Captain and POS builds passed; Captain/KDS typechecks passed and POS typechecks as part of its build. The existing Vite bundle-size advisory remains.

The measured urgent-priority change reached the database, second KDS device and Captain in **132.96 ms** in this isolated local run. This is local measurement, not an AWS production latency claim.

Machine-readable [browser results](BROWSER_RESULTS.json) and [verification counts](VERIFICATION_RESULTS.json) are recorded beside this report. Evidence includes tablet/TV screenshots, Captain mobile screens and actual generated KOT HTML. Fixtures are deleted and only the runner's isolated processes are stopped.

Manual ordering currently means Normal/Urgent with FIFO within each group, rather than arbitrary drag ordering. Reprints use the browser's 80 mm KOT document; the shared formatter also validates 58 mm output in regression tests.

There is no database schema migration for urgency: it uses existing synced-order metadata. API, KDS and Captain releases must include the matching metadata support; older clients omit it and the server retains existing urgency. Existing cancelled orders are not revived.

Local checks do not establish AWS latency, physical printer connectivity, automatic printer selection, Android/iOS background push delivery or real TV hardware behavior. Reprint opens the operating system/browser print dialog; a printer must be selected/configured on the device. This change is not deployed to AWS.

Optional future Captain capabilities include dedicated background push notifications and configurable station/staff workload analytics. Those require separate product requirements/device verification; they are not claimed as implemented here.

# Kiosk order cancellation, kitchen delivery and KDS layout

Date: 2026-10-07. Scope: shared customer Kiosk, KDS, and order updates received by POS. Changes are in the working tree; production deployment has not been performed.

## Confirmed problems and fixes

| Severity | Problem and evidence | Affected files / APIs | Implemented fix and expected impact |
|---|---|---|---|
| Critical | `handleFullSessionReset` called an abandonment function that cancelled every `PENDING` payment. A submitted cash-at-counter order legitimately remains unpaid. Confirmation returned to Welcome after printing/speech plus 3.5 seconds, and that reset sent `CANCELLED` through sync. KDS correctly projected the cancellation into its red alarm. | Kiosk `App.tsx`; database `OrderRepository.updateOrderStatus` and `KOTRepository.reconcileWithOrders`; `POST /api/v1/orders/sync` | Reset and checkout cancellation abandon only an unpaid, unsubmitted `DRAFT` with no KOT. Accepted cash orders survive automatic reset, manual New Order and the next customer. Payment remains pending until a cashier actually collects it. |
| High | Cash submission had no immediate outbox push. The confirmation path explicitly processed the outbox only when `paymentId` existed, while the Kiosk background interval was 15 seconds. Existing SSE can wake KDS only after the source has sent the order. KDS also retains a 3-second fallback pull. | Kiosk `proceedToConfirmation`; `packages/sync/src/outbox.ts`; `GET /api/v1/realtime/stream`, `POST/GET /api/v1/orders/sync` | Start the existing outbox processing immediately after KOT creation for both payment paths, before printer/voice work. The paid fulfilment acknowledgement uses the same processing promise. Delivery uses the existing authenticated SSE and cursor pull. |
| High | The tracking page listened to `KdsMeshService.subscribeToOrders`. That service is a process-local JavaScript listener set, not a transport between Kiosk and KDS browsers. Actual cloud pulls update the persisted database without notifying that listener. The page used conditional status rendering, but its data subscription was disconnected. | Kiosk `App.tsx`; `packages/api/src/kds.ts` | Remove the shared-kiosk Track Order button, step and page as requested. Keep token, receipt, New Order and automatic return. Confirmation follows the persisted order; mobile QR tracking remains available. |
| Medium | Cash confirmation discarded `OrderRepository.updateOrder`'s returned object and passed the previous draft object into confirmation. That repository replaces the stored object rather than mutating the old reference. | Kiosk `handleGetToken`; `packages/database/src/repositories.ts` | Confirm cash through `confirmKioskCashOrder`, then use the confirmed stored object. Repeated confirmation cannot create another admission for the same draft. |
| High | Kiosk KOT lines had unrelated generated IDs and omitted `orderItemId`. The repository's legacy fallback matches by `menuItemId`, which can conflate distinct variants or instructions of the same dish. | Kiosk KOT generation; `KOTRepository.linesForKotItem` | Add the originating order-line ID to each ticket line and derive its local ID from that line. Kitchen changes can target the exact ordered line. This mapping is code-verified; the new browser scenario exercises single-line kiosk orders, not every modifier combination. |
| Medium | Card fonts grew at the global `2xl` breakpoint despite narrow columns. Long tickets put footer actions below the available screen area; fixed Undo notices could overlap phone actions, and Undo buttons could shrink until their label wrapped. | KDS `App.tsx`, `KdsTicketCard.tsx`, `index.css` | Use a minimum-width adaptive grid, card-width typography, available-board-height bounds, scrollable dish lists, non-shrinking secondary actions, and an Undo bar in normal layout. Header/station controls reflow. Card actions remain visible and clickable on the tested tablet/TV sizes. |

Affected applications: Kiosk and KDS directly; POS and other order consumers receive the preserved order and authoritative item statuses. Cash payment settlement and kitchen service remain separate: serving food does not claim that cash was collected.

## Browser verification

The reproducible runner is `tooling/qa/browser-kiosk-kds-lifecycle.cjs`. It starts an isolated test API/database, provisions a disposable restaurant and authenticated devices, serves the compiled apps, logs into actual KDS and POS, and operates actual Kiosk checkout controls. It preserves existing local servers and removes its own fixtures/processes afterward.

Final browser run: all 13 checks passed with no uncaught browser exceptions. In the isolated local environment, cash confirmation reached the visible KDS ticket in **222.53 ms** and **187.88 ms** for two orders. Ready reached backend/POS in **179.67 ms**; Served reached backend/POS/Kiosk state in **232.94 ms**. These are observed functional-test samples, not AWS measurements or a latency SLA.

`BROWSER_RESULTS.json` records assertions and network boundaries. Checks include:

- Cash order submission -> backend persisted order -> KDS ticket, with payment still pending.
- Automatic Welcome reset and manual New Order preserve the accepted order.
- Shared terminal has no Track Order button and the next customer can order.
- KDS Ready -> backend and POS; Served -> backend, POS and Kiosk persisted state, without cancelling or falsely settling cash.
- Offline KDS retains a kitchen change, then sends it on reconnect.
- Long 18-line tickets at 360x740, 768x1024, 910x1020, 1024x768, 1366x768, 1920x1080 and 2560x1440. Checks cover document/card overflow, readable type, bounded height, scroll access to the final dish, and actual pointer access to the footer action. PNG evidence is in `evidence/`.

Payment-provider HTTP is simulated. No real payment or production order is created. These checks do not certify physical printer, UPI app switching or every modifier combination.

Root regression checks: 40 passed across eight files (checkout lifecycle, kiosk KOT routing, KDS logic, sync fidelity/flagging, POS integration, shared suite routing and dine-in table sync). Kiosk and KDS production builds passed. Logs are under `logs/kiosk-kds-*`.

## Likely contributors to the reported live delay

Missing immediate cash dispatch accounts for an avoidable sender wait. A dropped or buffered SSE connection adds receiver fallback-poll delay. The reported 4?5 seconds cannot be attributed completely to AWS from screenshots: the exact position in the sender timer, API/database latency and event-stream health were not recorded live.

The checked-in production Nginx configurations already include the realtime stream location, disabled proxy buffering and a long stream read timeout. This task does not change those settings. Whether the deployed proxy uses those configurations still requires verification.

## Further verification / deployment

Deploy the changed Kiosk and KDS bundles and refresh any older cached application shell. Verify production with a new cash-at-counter order: it remains active after the shared Kiosk returns to Welcome, appears once per kitchen station, then sends Ready/Served to the same order across apps. One token appearing on several station tickets is intentional station routing.

Existing cancelled orders are not automatically revived; staff should review them and acknowledge legitimate cancellation alarms. Live AWS/ALB performance, actual installed frontend version, cross-instance SSE delivery and physical TV/tablet viewing distance were not verified in this local test.

## KDS functionality audit

Existing functionality includes station filtering/assignment, Active/Cooking/Ready/Served views, per-dish readiness, full-ticket Ready/Served, undo/recall, allergy and preparation notes, age warnings, grouped preparation totals, multi-station progress and an expo/pass view, new-ticket/cancellation sounds, cancellation acknowledgement, connection warnings, resume/reconnect catch-up and wake-lock support.

Optional controls still absent from the KDS workspace: token/table search, manual urgency/reprioritisation, and a KDS ticket reprint button. Current ordering is FIFO within status groups. These are separate product additions; they are not prerequisites for the order cancellation/synchronisation fixes above.

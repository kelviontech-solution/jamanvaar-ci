# Persistent attention centre on QR Orders

Implemented locally on 20 October 2026. Not deployed to the hosted server.

## Problem

The service inbox polled for requests only while mounted. An administrator staying on QR Orders had no persistent indication of new table requests and had to discover them by opening Service Requests.

## New behaviour

**QR Orders now contains a sticky “Needs attention” panel.** It stays visible below the admin header while scrolling through orders. It is part of the shared QR console, covering standalone QR Admin and the QR Orders section inside the integrated admin.

- Checks live server state every five seconds while the page is visible; immediately checks again when the window regains focus.
- Displays pending task count, service request count, urgent count, last successful check time and up to three initial tasks. “View all” expands a scrollable list.
- Shows service request table, label, guest note, branch, elapsed time and status. Existing configured overdue/escalation state determines urgency.
- **Acknowledge** records the existing server action with its version check. Acknowledged requests stay visible until finished or expired.
- **Open requests / Service inbox** opens the existing service workflow in a modal on the order page. Staff can start, assign, escalate, complete or cancel requests without switching away from orders.
- Completing a request removes it on the next successful check. Quiet hours suppress sounds, not the visual indication.
- Other attention items: new orders awaiting acceptance, kitchen delays, ready/completed bills with a remaining balance, and failed/stalled checkout attempts.
- **Open order** retrieves that exact canonical order in the current branch and opens its detail dialog, independently of current search/date/pagination filters.
- Shows a visible connection warning and keeps the last checked tasks on a polling failure. It does not replace an unsuccessful check with an empty “all clear.”

## Sound

- Optional **Sound alerts** preference persists on this browser/device.
- Enabling the control or pressing **Test sound** provides the browser gesture needed to start Web Audio.
- Incoming service/urgent issues produce a chime; identical polls do not continually retrigger arrival sounds. Existing new-order sound remains a separate control.
- Open, unacknowledged service requests receive reminder checks, with at least 30 seconds between sounds. Acknowledging stops those reminder tones without hiding unfinished service work.
- Quiet requests do not produce arrival/reminder sounds. Visual notices remain active.
- Browser sound restrictions or unavailable audio show an instruction instead of breaking the order page. Timers/listeners/audio contexts are cleaned up when the panel unmounts.

## Backend and permissions

- New authenticated route: `GET /api/v1/restaurant/qr/operations/attention`, optionally scoped by `branchId`.
- Requires console access and active QR Ordering. The core attention centre does not depend on the optional customer-notifications add-on.
- Service request data remains subject to the service-request capability and existing staff authorisation. The new panel does not enable an unpurchased service feature.
- A branch-bound console cannot request another branch. Owner-authorised broader access continues through the existing device guard.
- Uses durable canonical order records, service request status and payment ledger entries. No new notification/order/payment store is created.
- Kitchen delay uses the branch's configured QR preparation time, with a default of 20 minutes; future scheduled pickup windows are accounted for.
- Stalled checkout threshold is 10 minutes. A pending payment is a request to verify the existing attempt, never an instruction to automatically charge again.
- Remaining balance comes from confirmed ledger allocations, with the existing legacy collected-status fallback. Paid/cancelled bills are not presented as unpaid.
- Responses are private and `no-store`. Query bounds produce an explicit error for oversized backlogs rather than silently reporting partial results as complete.

## Verification

- Root TypeScript and API TypeScript checks passed.
- API production build passed.
- Restaurant/QR Admin production build passed; existing large-bundle and printer-import warnings remain.
- Root QR regression tests: **35 files / 150 tests passed**.
- QR module and operations API tests: **2 files / 65 tests passed** against the dedicated test database.
- Added integration coverage for live pending requests, overdue urgency, completed/expired exclusion, acknowledgement/completion, branch restrictions, unauthenticated access, kitchen delay, partial payment balance and independence from the notifications add-on.
- Chrome checks at **390 px and 1440 px** verify automatic request discovery without clicking Refresh, arrival sound scheduling, sticky positioning under the header, acknowledgement, completion, service modal, exact-order detail, connection recovery and branch changes. No horizontal overflow or browser runtime errors were observed.
- Native Chrome Web Audio check confirms that the audio context reaches `running` and a real oscillator is scheduled after enabling sound. This verifies the browser audio path, not the user's speaker volume or output hardware.
- Additional browser clock checks verify quiet-hour suppression, reminder tones for unacknowledged requests and stopping those reminders after acknowledgement.

The browser harness renders the real QR Orders component and attention centre with isolated API fixtures. Actual database state transitions and access controls are separately verified by API integration tests. No live restaurant requests or payments were created.

Evidence: [browser results](browser-results.json), [mobile screenshot](orders-attention-390.png), [desktop screenshot](orders-attention-1440.png).

Run the browser check with `node docs/reports/qr-order-attention-2026-10-20/browser-check.cjs`.

## Changed files

- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrOrderAttention.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/qr-order-attention.css`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced.tsx`
- `cloud/api/src/modules/qr/qr-attention.service.ts`
- `cloud/api/src/modules/qr/qr-operations.controller.ts`
- `cloud/api/src/modules/qr/qr.module.ts`
- `cloud/api/test/qr-operations.e2e.spec.ts`
- This report directory contains the isolated browser fixture, check script and evidence.

## Deployment and practical limits

Deploy the **API and Restaurant/QR Admin frontend**, then reload QR Orders. No database migration is needed. Enable Sound alerts and use Test sound once on the staff device.

The visible order screen checks every five seconds; this is not an operating-system push notification. Browsers can suspend hidden tabs and closed applications. On return, the panel refetches durable state. Physical sound output and real-device background behaviour require acceptance on the restaurant's devices.

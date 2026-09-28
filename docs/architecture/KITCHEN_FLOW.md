# Kitchen flow: Captain, POS and KDS

How an order travels from the person taking it to the cook, and back, and the rules that keep every screen in agreement.

## The path of an order

```
Captain / POS  ->  outbox push (immediately)  ->  cloud API  ->  realtime stream  ->  KDS pull  ->  ticket + beep
     ^                                                                                          |
     +------ realtime stream <- cloud API <- outbox push (immediately) <-------- cook taps ------+
```

- Every action that changes an order pushes at once (`SyncOutboxEngine.flush()`); nothing waits for a timer.
- The cloud announces a change on the realtime stream (`/api/v1/realtime/stream`). The first announcement of a burst wakes a device immediately; more within 50 ms collapse into one follow-up wake (`RealtimeClient.wake`).
- The 3 to 4 second polling loops stay as the safety net if the stream is down.
- A screen that wakes, regains focus or comes back online pulls immediately (`onAppResume`), so no screen needs a manual refresh.
- Measured with a real Captain and KDS against the local API: order to KDS 0.26 to 0.6 s (it was 4.1 s), dish ready or cancelled back to the Captain 0.26 to 0.4 s, KDS reconnect after being offline 0.13 s.

Two rules make quick taps safe:
- A change made while a push is in flight stays queued and is sent right after (`runAgain`; the completed push no longer overwrites the "needs sending" mark).
- Number leases are requested one refill at a time.

## Kitchen status of one dish

Every dish is its own order line. Its status is `PENDING < PREPARING < READY < SERVED < CANCELLED`, plus a revision number `statusRev`.

The same merge rule runs on every device (`packages/database/src/kitchen_status.ts`) and on the server (`cloud/api/src/modules/order-sync/order-merge.ts`):

1. A copy with a higher `statusRev` wins, even if that moves the dish backwards (an undo).
2. At the same revision, the further-along status wins.

So a delayed or stale copy can never un-ready a dish, and a deliberate undo cannot be undone by an old copy. The order's own status is never moved backwards (the server refuses that); recall only rewinds dishes.

A kitchen ticket is local to each device and is built from the synced order. Each ticket line stores `orderItemId`, the exact order line it cooks, so two lines of the same dish are independent. Older tickets without it are matched by dish and only ever move forward.

## What a cook can do (KDS)

| Action | Result |
| --- | --- |
| Tap a dish | Cooking to ready. Tap again to undo. The ticket becomes ready with its last dish. |
| All dishes ready | Marks every live dish ready. |
| Undo (ready ticket) / Recall (served ticket) | Brings the dishes back to cooking. Refused once the order is paid or cancelled. |
| Dismiss (red ticket) | Acknowledges a cancelled ticket. It stays until dismissed, for 12 hours at most. |

Also on the screen: course labels, allergy and diet notes in red, lateness measured against each dish's own prep time (warn at the prep time, late at 1.5 times), a "to cook" strip that sums dishes across tickets, "n of m of the order ready" across stations, oldest ticket first, the real cook's name in the audit log, and a connection bar when the server stops answering (slow after 12 s, lost after 30 s or when the browser is offline).

## What a waiter can do (Captain)

- Fire by course: dishes carry a course (1st starters, 2nd mains, 3rd dessert). "Send now" or "Send Starters (2)" sends one course; the rest stay held. Held dishes are kept per table (`jamanvaar_captain_held_v1`), survive closing the workspace or a reload, move with a table transfer or merge, and are dropped when the table is closed or freshly seated.
- Cancel a sent dish (`cancelDish`): needs a reason and a manager (a manager's PIN, or a signed-in manager). The line stays on the order at no charge, marked `CANCELLED` with the reason, so the bill, the kitchen and the audit log agree. The order is re-priced from the live lines. If every dish is cancelled the order is cancelled and the table freed.
- Mark one dish served (not the whole table).

## Screen sizes

The Captain is phone-first: the table workspace is full screen on a phone, the cart is a bar at the bottom (tap to open), the menu keeps its space, and every control a thumb presses is at least 40 px. The KDS runs from a phone to a wall display: the header wraps, station pills and tabs scroll sideways, the ticket grid goes from 1 to 5 columns, and ticket text grows on very large screens.

## Tests

`tests/kitchen_item_status.test.ts`, `tests/kds_logic.test.ts`, `tests/captain_courses_and_cancel.test.ts`, `tests/order_reaches_kitchen_fast.test.ts`, `tests/realtime_client.test.ts`, `cloud/api/test/order-merge.unit.spec.ts` and the per-dish cases in `cloud/api/test/order-sync-payload.e2e.spec.ts`.

## Known limits

- POS still builds its own tickets by dish name; per-dish precision applies to tickets the Captain creates and to every ticket a KDS builds from a synced order.
- A held (unsent) dish lives on the tablet that took it, not in the cloud; another device does not see it until it is sent.
- A cancelled dish stays on the order as a line at no charge. Reports that list or count order lines may show it (at zero) unless they filter on the line's status; this was not checked report by report.

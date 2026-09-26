# QR Ordering: Offline Behavior

**A guest's phone needs a connection to reach the ordering page.** JAMANVAAR does not pretend otherwise.

## Supported behaviour (Option A)

| Situation | What happens |
|---|---|
| Restaurant internet **up** | Full flow: guest → cloud → Branch Core → POS / KDS. |
| Restaurant internet **down**, guest on mobile data | The guest can still reach the cloud and order. The order waits in the cloud. Devices receive it as soon as they (or their Branch Core) reach the cloud again, by cursor, once each. |
| Restaurant internet **down**, guest on the restaurant Wi-Fi | The Wi-Fi has no internet, so the public page cannot load: **QR ordering is unavailable** and the guest should order at the counter. |
| Branch Core down, internet up | Devices talk to the cloud directly; the order arrives the same way. |
| Both down | Nothing new can arrive; every terminal keeps working on its own local database. |

**Option B, ordering over the restaurant LAN through the Branch Core, is designed but not built.** It would need the core to serve the customer app and the same public endpoints from cached codes and its entitlement snapshot, and a way for the printed QR to resolve on the local network. Until then, no text in the product claims QR ordering works without a connection.

## What the restaurant's devices do offline

* POS, KDS, Captain, Kiosk keep every local function on their SQLite databases. A QR order already received is a normal local order: it can be accepted, prepared, printed and settled with no internet.
* Accepting works offline: the terminal accepts and prints; the claim is sent when a server is reachable. Two terminals working alone with no path between them could both accept; the first claim to reach the server or core wins and the loser's ticket is the only duplicate risk (see the desk tests).
* Kitchen tickets are derived from the order, so they are identical on every device even when nothing could be coordinated.
* Cash is the only tender for QR orders, so nothing here depends on a payment gateway.

## Recovery

| Failure | Recovery |
|---|---|
| Live wake-up missed | The next cursor pull returns the order; re-reading changes nothing |
| Device restart mid-sync | Pending events are in the device's SQLite outbox; the cursor never advances past an unapplied item |
| Duplicate delivery (same event twice) | Exactly-once by event id at the cloud and at the Branch Core; deterministic tickets are idempotent by id |

## Entitlement while offline

Restaurant Admin draws the QR screen from the last known answer for up to **7 days** since it was fetched, then asks for a connection. Devices and the Branch Core authorize by the enabled applications in their cached roster under the platform's offline policy. Every QR administration action (generate, regenerate, revoke, settings) is a cloud action and requires a connection; it says so instead of pretending to work.

| Question | Answer |
|---|---|
| When is it cached? | Every successful check (every five minutes while the screen is open) |
| How long is it valid? | 7 days from that check for drawing the screen; the server decides every action |
| Subscription expires? | The server refuses QR orders and changes immediately; a screen may show the last answer until it next checks or the window ends |
| Server unreachable? | Last answer within 7 days, otherwise "connect to check your plan" |
| Feature revoked? | Server refuses at once; a screen cannot stay enabled past the 7-day window |

# Market gap analysis: Captain, KDS, POS and Restaurant Admin (28 Sept 2026)

Method: five web searches on what leading restaurant systems offer (Toast, Square, Petpooja and India-focused peers, plus captain-app and KDS feature guides), then a search of this codebase for each feature. "Not found" means a code search found nothing; it does not mean it was tested and fails.

## What the market treats as standard, and where we stand

| Feature the market expects | What we found | Verdict |
| --- | --- | --- |
| Order from the table, KOT to the kitchen within seconds | Captain to KDS in 0.3 to 0.6 s (measured) | Meets it |
| Per-dish kitchen status, recall, allergy flags, order aging, expo view | Per-dish, undo, recall, allergy highlight, aging by prep time all built. No expo (pass) screen | Mostly meets; expo missing |
| Course firing (hold and fire) | Built (per-course send, held dishes kept per table) | Meets it |
| Cancel or void needs a manager PIN and is audited | Built for sent dishes, with reason and audit entry | Meets it |
| Alert the waiter when food is ready | Was missing entirely (no sound, no vibration). Built today | Now meets it |
| Installable phone app that opens offline | Was missing (no manifest, no service worker). Built today for Captain and KDS | Now meets it (needs HTTPS to install in production) |
| Offline operation | Local database plus outbox, queued and sent when back | Meets it |
| Table management: transfer, merge, zones, QR codes | Present. Bulk add was missing. Built today | Meets it |
| Split bill (by item, seat, percent) | Split payments exist; by-item and by-seat splitting from the Captain not found | Verify, likely gap |
| Aggregator orders (Zomato, Swiggy) into POS and KDS | Not found (only a suggestion string in the AI assistant) | Gap, and the biggest one for India |
| Inventory auto-deduct and low-stock alert | Present (recipes, low stock) | Meets it |
| Auto-86 a dish when stock runs out, live on every screen | Sold-out flag syncs; automatic 86 from stock not confirmed | Verify |
| Owner mobile dashboard with alerts on voids, discounts, cancellations | Admin was unusable on a phone (fixed today). No cancellation and loss report or push alerts | Partial |
| Staff scheduling, attendance, labour cost | Not found beyond a few mentions | Gap |
| Loyalty, feedback, WhatsApp bill | Present | Meets it |
| Reservations | Present; automatic table hold before arrival not confirmed | Verify |
| GST reports and day-end (Z) report | Present | Meets it |

## Fixed in this pass

1. Tables vanishing on reload. A device with an empty local table list used to push "deleted" for every table it no longer had, wiping the floor for every device (a wiped copy, a re-activation). Deletions are now only recorded when a person deletes a table (or a backup restore drops one). Creating or deleting a table also stops the demo tables from returning. The earlier re-activation fixes (cursors and table state reset) stay.
2. Captain alerts: sound and vibration for food ready (own or unassigned tables), messages and guest help, with on/off switches.
3. Captain connection badge and "Kitchen and counter link" now show the real server link (it used to read the same-browser mesh and often said "not detected").
4. Captain and KDS install to the home screen and open with no signal.
5. Restaurant Admin on a phone: the menu is a slide-in drawer; the header fits; the content uses the full width.
6. Add several tables at once (first number, how many, prefix; existing numbers are skipped and reported).
7. Small: "TT1" label, "Order details syncing…" shown for a table with no order.

## Recommended next, in order

1. Aggregator orders (Zomato, Swiggy) into POS and KDS through a partner such as UrbanPiper. Highest value for Indian restaurants; needs partner access, so start the paperwork now.
2. Split bill by item and by seat, with the Captain able to request it and the POS to settle it.
3. Owner "loss and cancellations" report and a daily WhatsApp summary (cancelled dishes, voids, discounts by staff member). The data is now recorded.
4. KDS expo screen (one view of a whole table across stations) and prep-time report per dish (per-dish ready times are now stored).
5. Automatic 86 from inventory, pushed live to Captain, POS and QR menu.
6. Staff attendance and shift roster with labour cost against sales.
7. Guided first-run: a setup wizard that ends with a test order across Captain, KDS and POS.

## Sources searched

G2 (best restaurant POS 2026), Petpooja pricing and feature pages, Techjockey, DineOpen comparison, Petpooja "What is captain ordering", QRCrave and Ritaya captain apps, Quantic and Fresh KDS feature guides, GoAudits, Operandio and Restaurant365 owner-app roundups.

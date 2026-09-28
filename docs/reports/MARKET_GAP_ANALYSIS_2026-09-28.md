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
| Split bill (by item, seat, percent) | Two-method split payment existed. Split by seat, by dish or equally now built (Captain notes the seat, POS settles) | Now meets it |
| Aggregator orders (Zomato, Swiggy) into POS and KDS | Not found (only a suggestion string in the AI assistant) | Gap, and the biggest one for India |
| Inventory auto-deduct and low-stock alert | Present (recipes, low stock) | Meets it |
| Auto-86 a dish when stock runs out, live on every screen | Already built for POS and Captain (stock hits zero: dish switches itself off, and back on when restocked). The QR menu read a frozen snapshot, so it kept offering the dish; now live | Now meets it |
| Owner mobile dashboard with alerts on voids, discounts, cancellations | Admin fits a phone. Losses and cancellations report and a one-tap owner summary built. Automatic push at day end is not built | Mostly meets; push missing |
| Staff scheduling, attendance, labour cost | Rota, clock in and out and attendance already existed (the first search missed them). Labour cost against sales now built | Now meets it |
| Loyalty, feedback, WhatsApp bill | Present | Meets it |
| Reservations | Present. There was no table hold and bookings never left the Admin computer. Now synced; the table shows Reserved from 30 minutes before, and a no-show frees it | Now meets it |
| GST reports and day-end (Z) report | Present | Meets it |

## Fixed in this pass

1. Tables vanishing on reload. A device with an empty local table list used to push "deleted" for every table it no longer had, wiping the floor for every device (a wiped copy, a re-activation). Deletions are now only recorded when a person deletes a table (or a backup restore drops one). Creating or deleting a table also stops the demo tables from returning. The earlier re-activation fixes (cursors and table state reset) stay.
2. Captain alerts: sound and vibration for food ready (own or unassigned tables), messages and guest help, with on/off switches.
3. Captain connection badge and "Kitchen and counter link" now show the real server link (it used to read the same-browser mesh and often said "not detected").
4. Captain and KDS install to the home screen and open with no signal.
5. Restaurant Admin on a phone: the menu is a slide-in drawer; the header fits; the content uses the full width.
6. Add several tables at once (first number, how many, prefix; existing numbers are skipped and reported).
7. Small: "TT1" label, "Order details syncing…" shown for a table with no order.

## Second pass (same day): what was built for the remaining items

| Item | What now exists | Where |
| --- | --- | --- |
| Split bill | Captain gives each dish a seat and can request a split bill; POS splits by seat, equally or by picking dishes. Shares add up to the bill to the paisa, a shared dish is divided, each guest pays cash, UPI or card | `packages/business/src/split_bill.ts`, POS payment screen, Captain table screen |
| Losses and cancellations | Report of cancelled dishes (with what they were worth, who, why), voided bills, discounts and refunds, by staff and by reason, with "worth a look" flags. A cancelled dish now keeps its value, canceller and time on the order line | Restaurant Admin, Reports, Financial |
| Owner summary | The day in a few lines with the loss figures; opens WhatsApp with the message ready (no key needed) | Restaurant Admin, Reports, Owner Summary |
| KDS pass (expo) | New Pass tab: one card per table across every station, what each station still owes, "All ready: send out" | Kitchen screen |
| Prep time per dish | Average, 9-in-10, slowest and on-time share against the menu's target, per dish and per station. The real send and done times are kept on each order line so every device agrees | Restaurant Admin, Reports, Operations |
| Auto-86 | Verified; the QR menu now follows it within seconds and refuses an order for a dish that ran out | Cloud API, QR menu |
| Labour cost | Hourly pay per person (kept on that computer only, never synced) and a report of hours, cost, cost as a share of sales, and sales per labour hour | Staff, Reports, Operations |
| Reservation hold | Bookings sync to Captain and POS; a free table shows "Reserved 8:30 PM: Sharma (4)" from 30 minutes before; 20 minutes after the time the booking becomes a no-show (or seated, if the table already has an order) | Floor screens |
| First-run wizard | Checklist now guides step by step, with a "Next step" hint, through menu, tables, printer, team, a practice Captain order, seeing it on the kitchen screen, and the first payment. It watches real activity, so no fake order is created | Restaurant Admin dashboard |

### Still not built
- **Zomato and Swiggy** (design only): see `docs/integrations/URBANPIPER_ZOMATO_SWIGGY_FLOW.md`.
- **Automatic daily WhatsApp message.** The message and a one-tap send exist; sending it by itself at day end needs a WhatsApp business key and a server job. See `docs/integrations/WHATSAPP_ORDERING_PLAN_AND_PROMPT.md`.
- **Phone push alerts** for a void or a big discount as it happens.
- Split shares are settled through the counter's existing payment screen, so the receipt is one bill, not one per guest.

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

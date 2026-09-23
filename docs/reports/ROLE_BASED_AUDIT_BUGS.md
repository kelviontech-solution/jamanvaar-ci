# Role-Based Full Audit — Bug List

Live, hands-on testing of all 7 apps with Playwright, done in character as the person who
actually uses each app day to day: a SaaS owner running Super Admin, a restaurant owner running
Restaurant Admin, a manager/cashier running POS, a captain running the Captain app, kitchen staff
running KDS, restaurant staff running Kiosk Admin, and a walk-up customer running the self-order
Kiosk. Every page, every button, and the server log for each real action is checked. Numbering
continues from `BUG_LIST.md` (last entry there is BUG-143). Fixes for every entry are recorded in
`BUG_CHECKLIST.md` (Group AB); the ones not fully closed are listed there with the reason.

Test environment used for this pass: a dedicated throwaway restaurant ("Full Audit Diner",
`audit-owner@example.com`), separate from any restaurant used in earlier bug-hunting sessions, with
its own activation key for every device type (POS, POS_ADMIN/Restaurant Admin, CAPTAIN, KDS, KIOSK,
KIOSK_ADMIN). All 7 apps' dev servers and the cloud API were run locally and their terminal output
was read alongside the UI for each action to confirm what the server actually did (not just what
the screen showed).

Status legend: 🔴 confirmed broken/missing · 🟡 confirmed but minor/cosmetic · ⚪ needs your
clarification before it can be called a bug.

---

## Status table

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 144 | Applications & Ecosystem page shows the wrong port for 4 of 6 apps | 🔴 | Fixed |
| 145 | A terminal whose device credential is rejected shows no lock screen or warning at all — it silently fails every sync call forever and keeps displaying stale local data | 🔴 | Fixed |
| 146 | Right after "Load Default Items" loads a starter menu, the dish grid shows "No Dishes Match Filters" for all 135 dishes until the page is reloaded | 🔴 | Fixed |
| 147 | A staff member's correct PIN is rejected as "Incorrect PIN" on KDS/Captain when their role can't use that screen — the codebase already has the right message ("This PIN belongs to a Cashier and can't open the kitchen screen") but only POS actually shows it | 🔴 | Fixed |
| 148 | Captain's "DELIVER FOOD" button doesn't mark food delivered — it just opens the table workspace, which has no delivery/serve action anywhere, so a table stuck on "Food Ready" never clears | 🔴 | Fixed |
| 149 | Edits and deletes made on one device never reach the others; a deleted dish comes back within ~30 s (every device re-uploads its own stale copy before it downloads) | 🔴 | Fixed in part (see checklist) |
| 150 | Restaurant Admin menu grid keeps showing the old value after Save, and editing again from that stale form silently undoes the first edit (widens BUG-146) | 🔴 | Fixed |
| 151 | An unpaid, bill-requested table order is counted as completed sales and cash collected on the POS footer and Restaurant Admin dashboard/orders | 🔴 | Fixed |
| 152 | Restaurant Admin order status stays PREPARING after the kitchen marked the food ready | 🟡 | Fixed |
| 153 | POS "Instant Bill" saves the sale as DINE_IN with no table, no cashier, and a different guest name than a normal order | 🔴 | Fixed |
| 154 | POS offers to "restore" an order that was already sent to the kitchen, and the settle screen calls a saved order "NEW ORDER - NOT YET SAVED" | 🔴 | Fixed |
| 155 | Super Admin: Sync Monitor says 0 reporting terminals while Devices shows 5 online; every terminal is "No branch assigned"; device names inconsistent | 🟡 | Fixed |
| 156 | Every terminal polls the local LAN relay (:5178) and gets 401 forever - the offline LAN fallback never works | 🟡 | Fixed in part (see checklist) |
| 157 | Small inconsistencies: "Rs.294" vs "₹294", three different IDs for one order, "Captain:" label showing a cashier, React setState-in-render warning in POS header | 🟡 | Fixed in part (see checklist) |
| 158 | New restaurants show made-up details: Kiosk Admin fake identity/licence/counts/empty staff; Restaurant Settings previews another business's GSTIN/address/phone; "Lifetime Licence" vs monthly billing | 🔴 | Fixed |
| 159 | Customers registered on POS never reach Restaurant Admin CRM; no app syncs inventory or payments at all | 🔴 | Fixed in part (see checklist) |
| 160 | Two different orders get the same token number (#101) on the same day (each terminal counts from 101) | 🔴 | Fixed |
| 161 | Cash-at-counter Kiosk order recorded as UPI and counted as collected; cash recorded with no shift open (re-confirms BUG-134) | 🔴 | Fixed |
| 162 | Opening Kiosk Admin "Receipt & E-Bill" blanks the whole app including the sidebar (extends BUG-135) | 🔴 | Fixed |
| 163 | Small mismatches: duplicate 401s on every Super Admin page load, fixed "Beverage Offer" tile, "Connect this device to cloud" shown on an activated device | 🟡 | Fixed |

---

## As a SaaS owner — Super Admin (`localhost:5180`)

### BUG-144 — The "Applications & Ecosystem" page shows the wrong port for 4 of its 6 apps 🔴

- **Where:** Super Admin → SaaS Management → Applications & Releases (`/applications`)
- **What I saw:** every app card shows a "PORT XXXX" badge. Cross-checked against the real dev ports (Kiosk Admin=5173, Kiosk User=5174, POS=5175, Restaurant Admin=5176, Captain=5177, KDS=5179):

  | Card | Shown port | Real port | Correct? |
  |---|---|---|---|
  | Counter POS & Fast Billing | 5173 | 5175 | ❌ (shows Kiosk Admin's port) |
  | Restaurant Admin Portal | 5176 | 5176 | ✅ |
  | Captain App (Table-Side) | 5174 | 5177 | ❌ (shows Kiosk User's port) |
  | Kitchen Display System (KDS) | 5175 | 5179 | ❌ (shows POS's port) |
  | Self-Ordering Kiosk | 5178 | 5174 | ❌ (5178 isn't even an app — it's the local LAN sync relay) |
  | Kiosk Terminal Admin | 5177 | 5173 | ❌ (shows Captain's port) |

- **Confirmed by reading:** `cloud/api/src/modules/applications/applications.service.ts` lines 21-81 — the `APP_CATALOG` array's hard-coded `defaultPort` field is scrambled across entries (each app effectively shows a different real app's port, one position off). This is the same shape of bug as **BUG-141** (the seed's `downloadUrl`s are also scrambled) but lives in different code — `defaultPort` here isn't read from the seed, it's a separate hard-coded table — so fixing BUG-141's seed data would not fix this.
- **Expected:** each card's port badge should match that app's own real port.

---

## As a restaurant owner — Restaurant Admin (`localhost:5176`)

### BUG-145 — A terminal with a rejected device credential shows no lock screen or warning — it fails every sync call forever, silently, and keeps showing stale local data 🔴

- **What I saw:** opening Restaurant Admin with a device token left over from a restaurant that no longer exists (the ordinary real-world equivalent: a deleted/suspended restaurant, a device removed from Super Admin's Device Fleet outside the normal "revoke" action, or simply a corrupted stored token), the dashboard rendered a fully normal-looking "live" screen — real-looking sales figures, order counts, GST totals — while every single network call it made failed:
  - `GET /api/v1/entity-sync/MENU_ITEM` → 401
  - `GET /api/v1/entity-sync/MENU_CATEGORY` → 401
  - `GET /api/v1/entity-sync/DINING_TABLE` → 401
  - `GET /api/v1/entity-sync/STAFF_USER` → 401
  - `GET /api/v1/entity-sync/SERVICE_MESSAGE` → 401
  - `GET /api/v1/orders/sync` → 401
  - `GET /api/v1/devices/me/heartbeat` → 401
  - `GET /api/v1/devices/me/ai-config` → 401
  - None of this is visible anywhere in the UI — no banner, no lock screen, no "reconnect" prompt, nothing in the console a normal user would ever see. The header still shows a calm "LOCAL-FIRST" badge as if everything is fine.
- **Confirmed by reading:** `cloud/api/src/common/guards/device-auth.guard.ts` — every one of those calls is refused with `code: 'INVALID_DEVICE_CREDENTIAL'` (thrown for a missing token, a token that matches no device, or a device that isn't `ACTIVE`). But `packages/sync/src/device_gate.ts`'s `CLOUD_LOCK_CODES` list (line 44) — the only codes that are allowed to trigger the lock screen — is:
  ```
  DEVICE_REVOKED, RESTAURANT_SUSPENDED, RESTAURANT_INACTIVE,
  SUBSCRIPTION_INACTIVE, APP_DISABLED, BRANCH_INACTIVE, DEVICE_LOCKED
  ```
  `INVALID_DEVICE_CREDENTIAL` is not in that list, so `DeviceGate.observe()` (line 191-205) silently returns without locking anything whenever this specific code comes back — every other kind of rejection shows a lock screen, this one shows nothing at all, forever.
- **Why this matters for a real restaurant, not just a stale test:** this is the exact code path a terminal hits whenever its stored credential simply stops being valid — most plausibly after `Device.deviceTokenHash` no longer matches anything (a device removed from the fleet other than through "revoke", a database restore, or migration) — not just the artificial scenario I hit. An owner or cashier would have no way to know the register in front of them has stopped talking to the cloud at all.
- **Expected:** `INVALID_DEVICE_CREDENTIAL` should show the same kind of lock/reconnect screen as the other refusal codes (with a message like "This device's credential is no longer valid — please re-activate it"), not fail silently.

### BUG-146 — Right after "Load Default Items", the menu grid shows "No Dishes Match Filters" for every dish until the page is reloaded 🔴

- **Where:** Restaurant Admin → Menu & Categories, on a brand-new restaurant with no menu yet.
- **What I did (as a first-time restaurant owner setting up my menu):** clicked "Load Default Items" to get a starter catalog instead of building one dish at a time.
- **What happened:** the header correctly updated to "135 ITEMS" and every category chip showed its correct dish count (Tandoori Starters & Kebabs 11, Royal Paneer Curries 28, etc.), but the dish grid itself rendered **"No Dishes Match Filters" / "No menu dishes found matching the current search, category, or dietary filter."** — with the search box empty and no filter visibly active. Clicking the page's own "Clear Filters" button did not fix it.
- **Only a full page reload (F5 / re-navigating to `localhost:5176/`) fixed it** — after reloading, all 135 dishes render normally in the grid.
- **Expected:** the dish grid should show the dishes immediately after they're bulk-loaded, without needing a reload — a restaurant owner setting up their menu for the first time would reasonably conclude the "Load Default Items" button is broken or that the dishes were lost.

---

## As a manager/cashier — POS (`localhost:5175`) and kitchen staff — KDS (`localhost:5179`)

### BUG-147 — A staff member's own, correct PIN is rejected as "Incorrect PIN" on KDS and Captain when their role isn't allowed on that screen — the codebase already has the right message, it's just not used 🔴

- **What I did:** as the restaurant owner, created a new "Priya Cashier" employee (role: Cashier / Billing Staff) from Restaurant Admin → Staff & Roles. The success screen explicitly said: *"This PIN logs Priya Cashier into POS, Captain, KDS and Kiosk. It can be reset any time from here."* Then, as the cashier: her PIN worked correctly on POS. On KDS, entering the exact same PIN (retried twice, digit by digit, to rule out a mis-click) is rejected every time with **"Incorrect PIN. Please try again."**
- **Confirmed by reading:** this is not actually a wrong-PIN case — it's a deliberate role restriction working as designed, just with the wrong message:
  - `apps/restaurant-system/kds/src/App.tsx` line 240-242: `StaffRepository.verifyPin(next)` finds the user fine, but `StaffRepository.canUseTerminal(candidate.roleId, 'KDS')` returns false for a Cashier role, so `matchedUser` is `undefined` and the code falls straight to the generic `setKdsPinError(true)` → "Incorrect PIN. Please try again."
  - The codebase already has the exact right message for this: `packages/database/src/repositories.ts` line 3103-3106, `StaffRepository.terminalDeniedMessage(roleId, terminal)`, which returns e.g. *"This PIN belongs to a Cashier and can't open the kitchen screen."*
  - Only **POS** actually calls it (`apps/restaurant-system/pos/src/store/posStore.ts:448`). **KDS** (`apps/restaurant-system/kds/src/App.tsx`) and **Captain** (`apps/restaurant-system/captain/src/store/captainStore.ts:317-319`) both run the identical `verifyPin` → `canUseTerminal` check but throw the result away and show the same generic "incorrect PIN" as an actual typo would produce.
- **Why this matters:** a cashier (or any staff member) who tries the wrong screen has no way to tell "I mistyped my PIN" from "I'm not allowed to be here" — they'll assume they forgot their own PIN and either keep retrying or bother the owner to reset it, when nothing is actually wrong with their PIN.
- **Expected:** KDS and Captain should show `StaffRepository.terminalDeniedMessage(...)` (already written, already used by POS) instead of the generic incorrect-PIN message whenever the PIN is valid but the role isn't permitted on that screen.

---

## As a captain — Captain (`localhost:5177`)

### BUG-148 — "DELIVER FOOD" doesn't mark food delivered; it just opens the table, and nothing anywhere marks a ready item as served — the table is stuck on "Food Ready" forever 🔴

- **What I did:** placed a real order from POS for Table 1 (Paneer Tikka Angara), sent the KOT, marked it ready from KDS as the kitchen chef. Then, logged into Captain as "Sunil Captain" (Captain / Waiter role) to close the loop the way a real captain would — the table correctly showed up with a bouncing green **"DELIVER FOOD (1)"** button, exactly as expected for an order the kitchen has finished.
- **What happened when I tapped it:** nothing on the table card changes — it keeps showing "FOOD READY" / "DELIVER FOOD (1)" no matter how many times it's tapped, and no network request is ever sent (confirmed: watched the full request log across several taps, dispatched raw pointerdown/mousedown/mouseup/click events directly to rule out a click-detection problem — never once did a request fire).
- **Confirmed by reading:** `apps/restaurant-system/captain/src/components/tables/CaptainTableCard.tsx` line 161 wires the button as `onClick={() => onDeliverFood(table)}`, but in `apps/restaurant-system/captain/src/App.tsx` line 613, the prop passed in is `onDeliverFood={handleOpenWorkspaceFromTable}` — **the same handler used to just open the table's order workspace**, not a handler that marks anything delivered. So the button's label and flame icon promise an action it doesn't perform; it's functionally identical to tapping the table itself.
  - I then opened that workspace directly (Current Order & Bill) to see if the real "mark delivered" control lives there instead — it doesn't. The ready item shows a plain, non-interactive **"🔔 Ready to serve"** label next to it, and the only buttons in the whole workspace are "Add More Dishes to Order" and "Send Bill Request to Counter POS". There is no serve/deliver action anywhere in the Captain app.
- **Why this matters:** every order a kitchen finishes will sit as "Food Ready" on a permanently bouncing, attention-grabbing button forever — a captain has no way to ever clear it, and it will keep re-appearing in the "Priority Actions: Food Ready" counter at the top of the screen for the rest of the shift.
- **Expected:** tapping "DELIVER FOOD" (or a real "Mark Served" control inside the workspace) should transition the order/item to "Served" and clear it from the Food Ready queue.

## Cross-app data flow — does what one app changes reach the others?

Tested live with all apps running against one restaurant. **Worked correctly:** staff created in Restaurant Admin
appear on POS/Captain/KDS login; a table created in Restaurant Admin appears on POS and Captain; dishes bulk-loaded in
Restaurant Admin appear on POS/Captain; a POS KOT appears on KDS; KDS "food ready" appears on Captain; Captain's
"Request Bill" appears as a notification on POS and turns the POS table to "Bill Requested"; settling on POS clears
the table on Captain, moves the KDS ticket to Served and marks the order COMPLETED in Restaurant Admin;
Super Admin shows the 5 activated terminals and the sync events. **Not working — below.**

### BUG-149 — Edits and deletes never propagate, and a deleted dish comes back within ~30 seconds 🔴

- **Live proof (three parts):**
  1. In Restaurant Admin I changed *Hara Bhara Kebab* 220 → 230, *Tandoori Stuffed Mushroom* 260 → 265 and renamed *Paneer Tikka Angara* → "…X". The **cloud copy has all three** (read with the POS's own device token: 230 / 265 / "X"). The **POS never applied them** — after more than three minutes, after reloading the POS, and after leaving and re-opening its menu screen it still showed 220 / 260 / the old name; the POS's in-memory `db.menuItems` and its saved local copy both still say 220.
  2. In Restaurant Admin I deleted *Veg Seekh Kebab Mughlai* (count went 135 → 134). About 30 seconds later, after a reload, **the dish was back (135)** and stayed back.
  3. New records do propagate (that is why first-day setup looks fine) — only changes to records that already exist are lost.
- **Cause (confirmed by reading + watching the network):** `apps/restaurant-system/pos/src/App.tsx` lines 137-193 (same shape for tables, staff, customers, categories, inventory): each 15-second sync tick runs `pushSnapshot(...)` — uploading the device's **entire local list**, stale values included — and only *then* `catchUp(...)`. So a device overwrites the cloud's newer edit with its own old copy and then downloads its own copy back; every device only ever reads back what it just wrote. Menu items also carry no `updatedAt`, so nothing lets the server keep the newest edit. Deleted rows are re-uploaded by whichever device still has them, so they resurrect.
  - Side effect in the same trace: every device re-uploads all 135 dishes every 15 s (the server `syncVersion` of one dish reached 319 in under two hours) — constant write traffic even when nothing changed.
- **Why it matters to the owner:** price changes, renamed dishes, "out of stock" toggles and deletions made in Restaurant Admin silently do not reach the counter POS, Captain or Kiosk; customers can be billed the old price.
- **Expected:** last-edit-wins per record using an `updatedAt`/version, pull before push (or push only changed records), and real tombstones for deletes. Not individually verified for tables/staff/customers/inventory — the code pattern is identical; treat as the same bug until checked.

### BUG-150 — Restaurant Admin's menu grid keeps showing the old value after Save, and a second edit silently undoes the first 🔴

- **Live:** edited a dish price to 300 → toast said "updated!" but the card still showed ₹280. I then edited the same dish's name; the form re-opened with the stale 280 and saved 280 + the new name, so **the 300 was lost**. After a full page reload the saved values appear. Same "grid doesn't refresh" family as **BUG-146** (Load Default Items shows "No Dishes Match Filters"), just on edit — the list is remembered against an array that is changed in place.
- **Expected:** the grid updates immediately after Save/Load/Delete, and the edit form always opens with the true current values.

### BUG-151 — An unpaid table order is counted as completed sales and cash collected 🔴

- **Live:** Table 1's order was sent to the kitchen and the bill was only *requested* by the captain — nothing was paid. At that point:
  - POS footer: **Today Sales ₹588, Orders 2** (one real Instant Bill ₹294 + this unpaid ₹294).
  - Restaurant Admin dashboard: **Total Billed ₹588, Completed Orders 2, Total Collections Cash ₹588**.
  - Restaurant Admin Orders: that order shows **Payment = CASH** although no payment exists.
  - After I actually settled it on POS the totals did not change (still ₹588) — proving it had been counted at KOT time.
- Also inconsistent on the same screens: dashboard hourly chart says "Total Today ₹294" while the headline says ₹588; Orders page shows **"GROSS SALES ₹560" and "NET TOTAL SALES ₹588"** (net greater than gross).
- **Expected:** revenue and cash collected only after payment; open orders shown as open/unpaid; payment method blank until paid.

### BUG-152 — Restaurant Admin order status stays PREPARING after the kitchen marked it ready 🟡

- KDS showed the ticket Ready and Captain showed "Food Ready", but Restaurant Admin → Orders showed the same order as **PREPARING** (its status filter even has a "Ready" option). It only changed to COMPLETED after payment.

### BUG-153 — POS "Instant Bill" saves a DINE_IN sale with no table, no cashier and a different guest name 🔴

- POS says Instant Bill is for "quick takeaway sales", but the order type stays on the default Dine-In. Restaurant Admin then lists it as **DINE_IN, table "—", Customer "Walk-in Guest", Cashier "—"** (a normal POS order shows "Walk-in" and the cashier's name). Result: dashboard "2 dine-in • 0 takeaway", and Reports show **"Unassigned cashier"** and **"Unassigned captain"** rows even though Priya rang the sale.
- **Expected:** Instant Bill = TAKEAWAY (or asks), records the logged-in cashier, uses the same guest label as other orders.

### BUG-154 — POS offers to restore an order that is already in the kitchen; the settle screen says "NEW ORDER — NOT YET SAVED" 🔴

- After Send KOT the POS keeps an auto-saved draft. On the next load it shows **"Unfinished Order Detected: 1 items (₹294) on Table #1 — Restore Order / Discard"**. Restoring puts the same dish back in the cart with SEND KOT enabled — a cashier can send the same dish to the kitchen twice.
- The payment screen for the already-saved order (ORD-56890710, token #102) is headed **"NEW ORDER — NOT YET SAVED"** (it did correctly settle the existing order; no duplicate was created).
- **Expected:** clear the draft when the KOT is sent; label the settle screen with the real order number.

### BUG-155 — Super Admin monitoring disagrees with itself, and devices have no branch 🟡

- Sync & Conflict Monitor: **"ACTIVE REPORTING TERMINALS 0"** while Device Fleet shows **5 online** and Reports shows 5 registered, 0 offline.
- Device Fleet: all 5 terminals say **"No branch assigned"** although the restaurant has 1 branch — so "deactivate a branch to stop its terminals" (which relies on the device's branch) can never apply to them.
- Terminal names are inconsistent: POS and KDS show the activation-key label ("POS audit", "KDS audit"); Restaurant Admin, Captain and Kiosk Admin show "Unnamed terminal".

### BUG-156 — The local LAN relay (:5178) returns 401 to every terminal, forever 🟡

- POS, Captain and Restaurant Admin all poll `localhost:5178/api/sync`, `/api/events`, `/api/orders` on a loop and get **401 Unauthorized** every time (visible in every app's console and network log). Nothing pairs the terminals with the relay, so the "works without the cloud on the same Wi-Fi" mode advertised in the UI ("Local Core: Connected") does not actually work.

### BUG-157 — Small inconsistencies 🟡

- POS floor card shows **"Rs.294"**; everywhere else "₹294".
- One order has three IDs on different screens: `ORD-56890710` (Restaurant Admin/POS), `#102` (KDS/POS token), `#0710` (Captain).
- KDS ticket labels the person who rang the order **"Captain: Priya Cashier"** even for a POS order by a cashier.
- POS console: React warning *"Cannot update a component (PosHeader) while rendering a different component"* (`PosHeader.tsx:55`).
- Kiosk User still opens on a restaurant that no longer exists ("Quick Verify Diner") with no warning — same silent-failure family as BUG-145.

---

### More things that worked correctly (so you know what NOT to worry about)

- **Super Admin → terminals:** locking a device from Super Admin shows a "Terminal locked — Reason: …" screen on that terminal within about 3 seconds and unlocking clears it; suspending the restaurant locked Restaurant Admin, POS, Captain and KDS within 4 seconds and Kiosk Admin within 24 seconds, and reactivating cleared them.
- **Self-order Kiosk → kitchen/counter/admin:** a takeaway order placed on the Kiosk reached KDS as a ticket, POS "Live Orders" (labelled "Self-Order Kiosk") and Restaurant Admin Orders (CONFIRMED) within about 25 seconds. A Kiosk that is activated fresh also shows the *latest* menu (Hara Bhara ₹230, renamed "…Angara X") — which, next to the POS still showing ₹220, is the clearest proof of BUG-149: **two terminals of the same restaurant are showing two different prices right now.**
- Captain "Send Msg" to Kitchen is saved to the cloud (recipient KITCHEN) and KDS polls for it — but see the ⚪ item at the end.

### BUG-158 — Restaurant Admin/Kiosk Admin show made-up business details for a brand-new restaurant 🔴

- **Kiosk Admin** (restaurant "Full Audit Diner", 1 kiosk activated, 1 table, 135 dishes, 3 staff, 1 real order): header says **"JAMANVAAR RESTAURANT — Ahmedabad Flagship Store"**; dashboard says **"0 of 12 tables"**; Menu says **"6 Categories • 12 Dishes • 2 Combos"** with demo dish codes; Table Layout shows a demo "T-1, capacity 2"; Staff & Roles is **empty** although 3 staff exist; Orders/Reports/Sync Center all **0** although a real kiosk order exists. **License & Entitlement** shows a fabricated **"License Key JAMAN-PRO-2026-AHM-8842-X", "Valid Until 01 Jan 2028", "Active Kiosks 2 / 5"** — the real plan (Super Admin) expires 20 Sept 2027 and 1 kiosk is active. Its own header contradicts itself: **"Kiosk Terminals (0/0)"** and **"KIOSK: 1/1 ONLINE"** and License **"2 / 5"** on the same screen.
- **Restaurant Admin → Restaurant Settings:** the "Live document header preview" (what prints on bills and EOD reports) shows **another business's details** next to the new restaurant's name: *Sindhu Bhavan Road, Bodakdev, Ahmedabad 380054 · GSTIN 24ABCDE1234F1Z5 · FSSAI 10722001000452 · Phone +91 79 4890 1234 · hello@jamanvaar.com*, while the edit fields below are empty. Meanwhile Super Admin's own restaurant profile (city/state entered at onboarding, GSTIN/address blank) never reaches Restaurant Admin — the two profiles are not connected.
- **Restaurant Admin → Subscription Plans** says **"Lifetime License • No Monthly Commissions"**, while Super Admin bills this restaurant **₹7,000 per month** (invoice ₹8,260 issued).
- **Expected:** a new restaurant should show its own real name/address/GSTIN/plan/expiry everywhere (from the cloud profile), or blank — never demo values that could be printed on a legal tax invoice.

### BUG-159 — Customers never reach Restaurant Admin's CRM; inventory and payments are never synced by any app 🔴

- **Live:** on POS I registered customer "Meera Guest" (9876500011) and attached her to an order. The **cloud has her** (`CUSTOMER` row), but **Restaurant Admin → Customers CRM stays at "0 Profiles"** through two reloads over 60+ seconds.
- **Confirmed by reading — who syncs what** (search of `apps/`): `CUSTOMER` is pushed/pulled **only by POS** (`pos/src/App.tsx:137-149`) — Restaurant Admin, Captain, KDS and both Kiosk apps never read it, so the owner's CRM, loyalty and marketing screens cannot show real guests. `INVENTORY_ITEM` and `PAYMENT_TRANSACTION` exist on the server but **no app references them at all** — stock items/recipes and payment records live on one device only, so POS sales cannot deduct Restaurant Admin's stock and "Payments & Split" is built from that device's local orders. (Live check of inventory was inconclusive — Restaurant Admin's own list did not show the new item straight away; the code search is the evidence.)
- Also: the POS customer-pull only *creates* missing customers (`createCustomer`), so an existing guest's loyalty points changed elsewhere would not update either.

### BUG-160 — Two different orders get the same token number (#101) on the same day 🔴

- The POS Instant Bill got **#101** (04:25 pm); the Kiosk order a couple of hours later also got **#101**. Restaurant Admin Orders lists two orders both "Token #101", and KDS shows a **#101** ticket while an older **#101** sale exists. Every terminal counts tokens from 101 on its own, so customers waiting for "token 101" are ambiguous and the kitchen cannot tell them apart.
- **Expected:** one token sequence per restaurant per day (or a device prefix such as K-101 / P-101).

### BUG-161 — A cash-at-counter Kiosk order is recorded as UPI and counted as money collected 🔴 (re-confirmed BUG-134)

- Customer chose **Cash at Counter** ("pay at Counter 1"). Restaurant Admin Orders shows **Payment = UPI**, and the Payments page shows **Total Collections ₹830 / Cash in drawer ₹588 / UPI ₹242** — the unpaid kiosk order counted as UPI money. Same failure mode as BUG-151 for table orders.
- Also on the Payments page: "cash in drawer ₹588" while Shift & Cash says **"No Active Register Shift"** (and POS says "No Shift") — cash is recorded with no shift open.

### BUG-162 — Opening "Receipt & E-Bill" in Kiosk Admin kills the whole app, not just that page 🔴 (extends BUG-135)

- After clicking **Receipt & E-Bill** (`Cannot read properties of undefined (reading 'tokenNumber')`, thrown 3 times), the **entire Kiosk Admin — sidebar included — is blank**; the next 8 tabs I tried (Hardware & Diagnostics, Customer Feedback, Reports & Export, Staff & Roles, Sync Center, Audit Activity Logs, License & Entitlement, Settings & Backup) had nothing to click. There is no error boundary, so one bad tab requires a full reload.

### BUG-163 — Terminal names, and other small mismatches found while sweeping every page 🟡

- Every Super Admin page load fires `platform/system-health` and `platform/me` twice, both **401**, before the session refresh succeeds (visible in the console on every navigation).
- The Kiosk's two top tiles "Gujarati Heritage Thali · Chef Signature" and "Cold Coffee with Ice Cream · **Beverage Offer**" are fixed marketing tiles from the language file (`en.ts:26-30`) — the "offer" is just a normal-priced dish and the owner cannot change or hide the tiles.
- Restaurant Admin → Help & Support, Restaurant Settings (screen size) and Backup all say **"Connect this device to JAMANVAAR Cloud … sign in"** even though the device is already activated and the owner has already signed in — the Subscription Plans page then asks for the same owner login a second time.

### ⚪ Needs your call (not logged as bugs yet)

- **Captain → "Send Msg" to Kitchen:** the message is saved (`recipient: KITCHEN`) and KDS polls for it, but ~20 seconds later I could not find it anywhere on the KDS screen (no bell/inbox). It may be a short-lived toast I missed — worth a look with a person watching the KDS.
- **Super Admin "Platform Settings" is read-only** for a user whose role is SUPER_ADMIN ("You have read-only access to this area"). If only PLATFORM_OWNER should edit platform settings that is by design; if not, it is a permissions bug.
- **Super Admin restaurant "More actions" (⋮) menu** did not open on my very first click on a freshly loaded page and opened fine on the next attempt — could not reproduce reliably, so not logged.

---

---

## Notes

- This file is intentionally separate from `BUG_LIST.md`/`BUG_CHECKLIST.md` per your instruction —
  once you're ready to triage/fix, these can be merged in or kept side by side.
- The audit itself changed no application code; the fixes came afterwards (see `BUG_CHECKLIST.md`, Group AB).

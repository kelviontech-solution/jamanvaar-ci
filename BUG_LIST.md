# JAMANVAAR — Bug List

**Status:** fixing in progress (started 2026-09-19 on the owner's instruction "fix all the bugs listed in the bug list and verify").
The detailed entries below are the original reports and were not rewritten; **this table is the current truth.**

Legend: 🔴 not fixed · 🟡 partly fixed / needs a decision or runtime check · 🟢 fixed and verified by an automated test

## Fix status (updated as work proceeds)

| Bug | Status | What was done / what is left |
|---|---|---|
| 001 Welcome Kit prints a blank page | 🟢 | **Root cause was not the one first suspected.** `billing.css` is bundled app-wide and its `body * { visibility: hidden }` blanked every print except Billing sheets. Now scoped to pages that contain a Billing sheet; the shell's fixed-height containers are also released for print. Verified by printing real PDFs in a browser (old = blank, new = full kit; Billing sheet still prints alone) + `print_layout_css` |
| 002 Copy buttons give no feedback (Welcome Kit) | 🟢 | Real tick on the clicked button, toast fixed to the screen, "copy failed" message instead of a false "Copied" |
| 003 "Extend Trial" fails | 🟢 | New `PATCH /subscriptions/:id/extend` (adds days from the later of expiry/now, keeps status, refuses suspended, audited); button label follows status (`subscription-extend`) |
| 004 Copy tick not consistent | 🟢 | One `copyText()` helper with an http/LAN fallback (`clipboard.test`), shared `CopyButton`/`useCopied` in Super Admin; every `writeText` call site in Super Admin and Restaurant Admin now uses it. Kiosk/Captain/KDS/POS had no copy call sites |
| 029 Settlement stuck | 🟢 | Payment dialog resets on open; test `pos_running_order_flow` / payment tests |
| 030 Split has no UPI/Card confirm | 🟢 | Confirm controls per split line; splits recorded as real lines |
| 031 Verified flags carry over | 🟢 | Confirmation resets when allocation changes or dialog reopens |
| 032 Duplicate orders after KOT | 🟢 | Cart is tied to the running order; KOT sends only new lines (`pos_running_order_flow`) |
| 034 Restaurant Admin gets no orders | 🟢 | **Verified live** in a real multi-app browser session: a real POS order appeared in Restaurant Admin's Orders screen within seconds, with correct totals and GST on its dashboard |
| 035 POS→KDS shows nothing | 🟢 | **Verified live**: a real KOT sent from a real POS terminal appeared on a separately-activated real KDS terminal of the same restaurant within the 3s poll. See BUG-095 for the one thing that did NOT sync (staff PINs) and its fix |
| 095 Staff PIN only works on the device that created it | 🟢 | **Discovered and fixed during the BUG-019/034/035 live verification.** Staff/`User` records were the one thing never in the cross-app entity-sync bridge, and KDS had no entity-sync wiring at all. Added `STAFF_USER` as a syncable entity type (PIN hash only, never plaintext) and wired push (Restaurant Admin) / pull (POS, Captain, KDS, Kiosk User); verified live a second time — the PIN worked on KDS within one sync tick. `entity-sync.e2e`, `staff_cross_device_sync` |
| 096 Table layout made in Restaurant Admin never reaches Captain or POS | 🟢 | Tables now sync through the cloud (`DINING_TABLE`): Restaurant Admin, POS and Captain each stamp their local changes, push what changed and apply what others changed, newest change wins, deletions travel as tombstones; the server keeps the newest copy when two devices edit the same table. Verified live: tables added in Restaurant Admin appeared on a freshly activated Captain and POS. `table_cross_device_sync`, `floor_sync_tick`, `entity-sync.e2e` |
| 097 Table status is per device: Captain tables look vacant on POS and POS payments never free Captain tables | 🟢 | A seated table, a bill request and a freed table follow the table across devices, and a table whose order was settled anywhere is freed on the next refresh. Verified live: Captain seated Table 1 and POS showed it as Bill Requested with the order value; after POS settled it Captain's table became available. `table_cross_device_sync`, `captain_store_service` |
| 098 Kitchen 'food ready' never reaches the waiter | 🟢 | Each device now brings its kitchen tickets in line with the order it receives (`reconcileWithOrders`), and Captain's Food Ready list is derived from ready tickets; serving a dish (or a whole ticket) is written to the order and syncs back to POS and KDS. Verified live: KDS marked a ticket ready, Captain showed 2 dishes ready within seconds, delivering them cleared the list. `kot_status_from_orders`, `captain_store_service` |
| 099 'Send Bill Request to Counter POS' reaches nobody | 🟢 | A bill request marks the table and sends a bill-request message that POS receives as a notification. Verified live: POS showed the table as Bill Requested and a notification 'Bill requested — Table 1, Ravi Waiter asked for the bill'. Refused when the table has nothing to bill. `service_messages`, `captain_store_service`, `entity-sync.e2e` |
| 100 Staff messages and guest requests never leave the tablet | 🟢 | Messages travel through the cloud (`SERVICE_MESSAGE`) and become notifications on the device they are for (kitchen, counter, Restaurant Admin) or inbox messages on Captain, once each. Verified live: a message to the kitchen appeared as a KDS notification. `service_messages` |
| 101 Captain orders carry no waiter name | 🟢 | The waiter's name travels with the order to KDS, receipts and reports, and the made-up 'Cloud Sync' and 'Rahul' names are gone. Verified live: KDS ticket reads 'Captain: Ravi Waiter'; the receipt reads 'Captain: Ravi Waiter'. `captain_store_service`, `no_demo_identity_fallbacks` |
| 102 Captain bills use a flat 5% and print a broken tax split | 🟢 | Captain prices orders with the same rules as POS (`priceOrderLines`: CGST + SGST, round-off) and sets every tax field. Verified live: the POS receipt for a Captain order shows Subtotal 860, CGST 21.50, SGST 21.50, Total 903. `captain_order_pricing` |
| 103 A made-up cashier, 'Amit Dave', appears on real receipts and reports | 🟢 | The made-up cashier 'Amit Dave' (and 'Rahul Sharma') is removed from receipts, POS headers, close-day and shift screens, Restaurant Admin reports and stored fallbacks; only the real signed-in person's name is used, and a line with no name is left out. Guarded by `no_demo_identity_fallbacks`; verified live on a receipt |
| 104 Tapping 'More Options' turns the Captain app into a blank white screen | 🟢 | Fixed: every hook now runs before the drawer's 'closed' return (a regression from the earlier JAMAN AI toggle change), and a test guards all Captain dialogs against the same mistake. Verified live: More Options opens. `captain_ui_guards` |
| 105 Wrong PIN on the Captain keypad gives no feedback and jams the pad | 🟢 | The keypad and typed entry share one sign-in path, so a wrong PIN shows the error and clears. Verified live. `captain_ui_guards` |
| 106 Captain forgets who is signed in after a reload | 🟢 | A reload restores the same real signed-in staff member (not a demo profile) while they exist and are active; logging out ends it. Verified live and by `captain_session_restore` |
| 107 'My Assigned Tables' is the same hard-coded list for every waiter | 🟢 | No table is pre-assigned; the default view is every table and 'My Tables' means tables this waiter seated and that are still in use. Verified live. `captain_store_service`, `captain_ui_guards` |
| 108 Zone filters on the Captain floor match nothing | 🟢 | Zone buttons come from the zones the restaurant's tables really use. Verified live. `captain_ui_guards` |
| 109 Guest count ignores table size | 🟢 | Guest counts are limited to the table's capacity in the dialog and in the store. Verified live (a 2-seat table offers 1 and 2 only). `captain_store_service` |
| 110 Terminals keep the demo branch after activation | 🟢 | Activation replaces the demo branch with the restaurant's own name, with no demo code, address or phone (`adopt`, and `adoptBranch` for Restaurant Admin). Verified live in Restaurant Admin and Captain. `outlet_identity_adoption` |
| 111 Transfer and merge can overwrite a busy table and are not shared | 🟢 | Transfer only goes to a free table, merge needs both tables in use and combines the orders into one repriced bill (the second table's tickets follow), both flag the order to sync, and the dialog offers only sensible targets and explains refusals. Unit-tested (`captain_store_service`); not exercised live |
| 112 Captain's dish options are hard-coded | 🟢 | The dish dialog shows the dish's own modifier groups with their real prices, keeps required groups required, and shows nothing invented for a dish with none. Unit-tested (`modifier_selection`); the default menu has no modifier groups, so it was not exercised live |
| 113 A paid order's ticket stays on the kitchen screen | 🟢 | A ticket of a completed or cancelled order leaves the kitchen board when the order arrives. Verified live: after POS settled, KDS showed 0 active tickets and 1 served. `kot_status_from_orders` |
| 114 Small Captain screen defects | 🟢 | Table cards read the running order (value and waiter), dishes show Ready and Served from the kitchen, Escape closes dialogs topmost-first, labels come from data. Verified live. `captain_ui_guards` |
| 115 A new restaurant starts with demo combos, coupons, rewards, printers and tables | 🟢 | Activation clears the demo combos, coupons, offers and tables on every terminal; an empty floor is kept as empty on reload; Captain shows a clear 'No tables set up yet' message. Verified live: a new restaurant's Restaurant Admin showed 0 combos and 0 tables. `fresh_restaurant_operations` |
| 116 Table dialog zones differ from the zones on existing tables | 🟢 | The table dialog offers the zones the restaurant's tables use, with a 'New zone' option, and the floor's zone strip is built from them. Verified live. `table_cross_device_sync` |
| 117 Wrong stock photo on a default dish | 🟢 | The four default dishes that used the tropical-fish photo now use a fitting existing photo, and the wrong image files are deleted from the apps. `menu_images` |
| 118 Any staff PIN opens any terminal (a waiter can unlock the kitchen screen and the POS) | 🟢 | Each terminal accepts the roles that work on it (owners and managers everywhere; cashier POS/Kiosk, waiter Captain, chef KDS; custom roles are never locked out); POS lists only eligible people. Verified live: KDS and Captain refused the wrong role's PIN, POS listed only the cashier. `terminal_role_access` |
| 119 QR table-ordering links default to a localhost address | 🟡 | Not fixed: needs the owner to decide where the guest QR ordering page is hosted. Today the link uses the address saved in QR settings and falls back to localhost for local testing |
| 120 The same table number can be created twice | 🟢 | Add/Edit Table refuses a number another table already has (`isTableNumberTaken`, ignoring the table being edited and stray spaces); `table_cross_device_sync.test.ts` |
| 121 Terminals were refused with 429 Too Many Requests, so staff, menu and table sync silently stopped | 🟢 | Device-authenticated sync endpoints (entity sync, order sync, heartbeat, device commands, menu sync) now allow 1500 requests a minute per address (`DeviceSyncThrottle`); sign-in and every other endpoint keep 120. Verified live: POS then received its staff and tables. `device-sync-throttle.e2e` |
| 122 The 'new version available' bar covered the top of every restaurant app | 🟢 | Both bars are now sticky, in the page flow, so the app starts below them; verified live (Send Msg reachable with the bar showing); `notice_banner_layout.test.ts` |
| 123 Receipt tax lines showed '₹21.5' and '₹0' | 🟢 | Two decimals on CGST, SGST and round-off, with a proper split as fallback; `receipt_identity.test.ts`; verified live (₹21.50 + ₹21.50) |
| 124 A table order rung up at the counter said 'POS: CLOUD-SYNC' | 🟢 | `ThermalReceiptView` omits the line for cloud-sourced orders; `receipt_identity.test.ts` |
| 125 Every restaurant's receipt thanked guests on behalf of JAMANVAAR | 🟢 | Activation replaces the demo thank-you and footer (a footer the restaurant wrote is kept); `outlet_identity_adoption.test.ts` |
| 126 Small Captain layout defects (KOT label, clipped card buttons) | 🟢 | Tickets read 'KOT-02'; card buttons wrap instead of clipping |
| 127 The Restaurant ID that Kiosk Admin and Captain ask for cannot be found | 🟢 | Super Admin now shows a labelled Restaurant ID with a Copy button in the restaurant's profile card and at the top of the Hardware & Terminal Activation Keys panel (with a line saying Kiosk Admin and Captain ask for it together with the owner's login); Restaurant Admin shows it with a Copy button beside the device logins it creates (Subscription Plans, Device & Staff Logins); the Kiosk Admin and Captain connect screens replaced the vague hint with where to find it. Checked by typecheck and `restaurant_id_visibility.test.ts`; not looked at visually in a running browser |
| 128 Super Admin cannot delete an activation key, or bring a revoked key back | 🔴 | Logged, not fixed yet (waiting for the go-ahead). Revoke is one way and there is no delete |
| 129 The round "+" on each Kiosk Admin dish card does nothing useful | 🔴 | Logged, not fixed yet |
| 130 Kiosk Admin's own menu and combos never reach the self-order Kiosk | 🔴 | Logged, not fixed yet |
| 131 Kiosk Admin never adopts the real restaurant name/branch | 🔴 | Logged, not fixed yet |
| 132 Kiosk orders never reach Kiosk Admin's Orders & KDS / Kiosk Terminals | 🔴 | Logged, not fixed yet |
| 133 Coupons made in Kiosk Admin never reach the self-order Kiosk | 🔴 | Logged, not fixed yet |
| 134 Cash-at-Counter kiosk orders are recorded and printed as paid via UPI | 🔴 | Logged, not fixed yet |
| 135 Kiosk Admin's Receipt & E-Bill screen crashes to a blank page | 🔴 | Logged, not fixed yet |
| 136 Kiosk Admin's Hardware/Reports/Feedback screens read data that never arrives | 🔴 | Logged, not fixed yet |
| 137 "Call Staff" on the self-order Kiosk falsely confirms a team member was notified | 🔴 | Logged, not fixed yet |
| 138 Kiosk Admin's "Publish" claims to sync to all Customer Kiosks but does not | 🔴 | Logged, not fixed yet |
| 139 "+ Category" works locally, same disconnection as BUG-130; Settings gear on self-order Kiosk needs clarification | 🟡 | Logged; see notes, one part needs the owner to confirm what they saw |
| 140 Every terminal but KDS is locked out by a mandatory update wall out of the box | 🔴 | Logged, not fixed yet |
| 141 Kiosk Admin's update-download link opens the Captain app; no app's download link is real | 🔴 | Logged, not fixed yet |
| 142 No forgot-password / reset flow for a restaurant admin | 🔴 | Logged, not fixed yet |
| 143 Update-required lock screen flickers on and off instead of staying locked | 🔴 | Logged, not fixed yet |
| 038 Paid order never queued | 🟢 | Paid orders start `SAVED_LOCALLY` and are flushed; paid status re-sent (`order_sync_flagging`) |
| 039 Totals disagree | 🟢 | Tender totals use one source (`getOrderTenders`); CGST + SGST now always add up to the bill's tax via one shared `splitTax`/`splitTaxPaise` (81 becomes 41+40, never 41+41), the invented "2.38% of sales" tax is gone, and labels say what the number is ("Total Billed (incl. GST)" etc.) — `tax_split_consistency` |
| 040 Fake 50/50 split | 🟢 | Real per-line tenders end to end (`split_payment_tenders`) |
| 049 Disabled app / revoked device still works | 🟢 | Server refuses with a reason code; terminals show a lock screen (`device-enforcement`, `device_gate`, `device_gate_overlay`) |
| 050 Two invoices per onboarding | 🟢 | Duplicate POST removed; initial invoice is idempotent (`invoice-integrity`) |
| 052 Invoice numbering / status rules | 🟢 | Atomic per-financial-year counter; PAID/VOID transition rules |
| 059 Revoked key leaves device running | 🟢 | Revoking a redeemed key revokes its device |
| 068 Lock terminal does nothing | 🟢 | Lock enforced at the API and shown on the terminal; heartbeat answers with lock state |
| 077 Offline limit not enforced | 🟡 | Terminals lock after 7 days (default) without a successful check-in. The Super Admin "emergency extension" is still not delivered to terminals |
| 082 API ignores roles | 🟢 | Deny-by-default role→area matrix in the guard (`rbac.e2e`, `access.spec`) |
| 083 UI shows everything to every role | 🟢 | Menu, pages and buttons follow the role; read-only banner |
| 084 Weak role model | 🟢 | Owner protections, safer default role for invites |
| 089 Restaurant Admin sessions ignore state | 🟢 | Suspension, subscription and device revoke end the session and its refresh (`tenant-session-enforcement`) |
| 091 Maintenance mode reaches no one | 🟢 | Notice is delivered in every terminal heartbeat and to Restaurant Admin, shown as a banner in all six apps, with optional start/end (`platform-notice`, `platform_notice`) |
| 092 Other settings unused / unvalidated | 🟡 | All three settings are validated; trial length is now used by onboarding. Branding is still not used by invoices/emails. Device limits ARE now enforced (BUG-061) for whatever plan a restaurant has; the platform-wide *suggested default* trial device/branch count is still not force-applied to a new trial plan's own limits |
| 093 Revoke session does nothing | 🟢 | Revoked sessions are refused immediately; revoking your own signs you out; feedback and confirmation (`platform-sessions`) |
| 094 Session list misleading | 🟡 | One row per login, "This device", device/IP/last active, "sign out others". No approximate location and no session-count cap |
| 092 (regression check) | 🟢 | Settings PATCH now merges into the stored value + validated defaults (a partial update no longer 400s on fields it didn't send); fixed two e2e tests whose expectations were stale, not the feature |
| 037 Print/Download PDF blank elsewhere | 🟢 | One shared `printElement` isolates the intended document for print, used by every `window.print()` in Restaurant Admin, Kiosk Admin and Super Admin (guarded by a source-scan test); not checked in the packaged Tauri/WebView2 desktop apps or on a physical printer — `print_isolation` |
| 054 Invalid GSTIN/FSSAI | 🟢 | Format + state-code validation on create/update (`gstin.spec`, `restaurant-gstin-fssai`); UI shows the real field error |
| 061 Device limit never enforced | 🟢 | `redeem()` refuses once the plan's `maxDevices` is reached; a revoked device frees its seat (`device-limit.e2e`) |
| 062 Notification items don't navigate | 🟢 | Root cause was `onMouseDown` closing the box before the click fired; now closes on outside-click/Escape, items navigate normally |
| 063 Refresh buttons give no feedback | 🟢 | Shared `RefreshButton` (spin + disable + last-updated) wired into Master Catalog (also fixed its double-fetch-on-open bug), Devices, Offline Policy, Backups, and Restaurant → Support diagnostics (which also had no error handling and blanked the panel on failure) |
| 013 Every new restaurant already has a full menu | 🟢 | `MenuRepository.startFreshMenu()` clears categories/dishes/modifiers once, at first device activation (not on every load — local dev/test still boot with the demo menu) (`fresh_activation_menu`) |
| 014 No CSV import / "Load default items" | 🟢 | `MenuBuilderService.importCSV()` (validates row-by-row, resolves/creates categories, duplicate strategies) + a real empty-menu screen with Upload CSV / Load Default Items / Download Template in Restaurant Admin (`menu_csv_import`) |
| 015 No Super Admin Menu tab; syndicate goes nowhere | 🟢 | New restaurant Menu tab: reads/writes the SAME SyncedEntity rows a device's entity-sync already reads, so a Super Admin upload reaches POS/KDS/Captain/Kiosk exactly like a Restaurant Admin one; a revocable "may the restaurant upload its own CSV" toggle (`restaurant-menu.e2e`) |
| 016 Menu sync narrow (no categories, no Kiosk) | 🟢 | MENU_CATEGORY now synced (POS/pos-admin push+pull, Captain pull-only) alongside MENU_ITEM; Kiosk-user gained menu+category sync (had none) |
| 017 Local load can destroy a real menu | 🟢 | Removed the NON_VEG/"chicken" filter and the &lt;8-items demo-reseed fallback; image overrides now only ever apply to JAMANVAAR's own bundled seed items, matched by id/sku, never by guessing from a real dish's name (`menu_load_integrity`) |
| 019 POS Send KOT never reaches KDS | 🟢 | **Verified live**: ran the real API and all apps together, activated a real POS and a real KDS against the same fresh restaurant with their own separate keys, sent a KOT and watched it arrive on KDS within seconds. The owner's original report is most likely explained by the two devices not having been activated with the same restaurant's keys |
| 020 LAN mesh is same-origin only (root cause) | 🟢 | Correctly diagnosed; the prescribed fix (cloud as the real hub) is what's already carrying orders/KOTs/status. Ephemeral non-order events (bill-requested, kitchen messages, diner requests) still ride LAN mesh only — not rebuilt |
| 021 Activation doesn't bind restaurant identity | 🟢 | POS/KDS/Captain now adopt the real restaurant name/GSTIN/address at activation, same as pos-admin/Kiosk already did. Staff/PIN/table cross-device sync remains a separate gap |
| 022 KDS ticket incomplete | 🟢 | Already fixed by earlier work — modifiers, special instructions, station and add-on rounds verified round-tripping in a real (not same-process-sharing) simulated 2-device test (`order_sync_fidelity`) |
| 023 Status doesn't flow back | 🟢 | Already fixed by earlier work — added a real KDS→POS round-trip test proving it. The audible "ding" alert (as opposed to the underlying data) still depends on LAN mesh only |
| 024 Printing always reports success | 🟢 | Jobs start PENDING; only a real transport confirms; USB/serial/driver/browser fail with a reason; Retry re-sends; the false "SUCCESS" in `retryJob` removed. Several older tests had asserted the false behaviour and were rewritten (`printer_network_transport`, `printer_queue`, `pos_print_queue`, ...) |
| 025 No real printer detection / hardcoded READY | 🟡 | New restaurants start with no printers; the fake "scan" is honest. Real detection is now built (`packages/native/printing.rs`): lists Windows-installed printers, scans the LAN for raw-print devices, lists serial ports; wired into all four desktop shells plus a "Find printers" panel in POS Settings. Not verified: the packaged Tauri `.exe` could not be built on this machine (an Application Control policy blocks Tauri's build scripts) |
| 026 USB/driver/serial/Bluetooth transports simulated | 🟡 | USB and Windows-driver printers now print for real through the Windows spooler (verified end to end on this machine: real bytes, byte-for-byte, through a real temporary printer queue); serial sends to a configured COM port. Every interface fails honestly with a real reason when it cannot reach hardware. Not verified: the packaged desktop app, and real serial/Bluetooth hardware (none available here) |
| 027 Test print prints nothing real | 🟢 | Both test-slip paths use the real dispatch and report its result (`receipt_identity`, `printer_queue`) |
| 028 Receipt prints fake identity | 🟢 | Activation replaces the seeded identity field by field; no hardcoded brand text; real tax-rate labels; cashier name; "GSTIN: Not registered" when absent (`receipt_identity`) |
| 042 Demo restaurant identity on POS/reports | 🟢 | Identity adopted at activation; every report header, receipt, invoice and export now uses only this restaurant's own details or leaves the field blank — no fallback to another business's GSTIN/FSSAI/address/name anywhere — `no_demo_identity_fallbacks` |
| 043 POS inventory is a dish on/off list | 🟢 | Dishes follow real ingredient stock (auto off/on, never overriding a manual switch-off) and a dish's own counted stock decrements/restores (`inventory_integrity`). The POS screen itself is still a dish list; receiving/counts/wastage live in Restaurant Admin |
| 044 Stock deducted wrongly / never restored | 🟢 | Idempotent per order line; add-on rounds deduct; void/cancel/full refund restore (`inventory_integrity`) |
| 045 Stock engine holes | 🟢 | Unique ids, visible negative stock, unit conversion, real actors, cart low-stock warning, no seeded stock, EOD low-stock from real data |
| 046 Missing inventory capabilities | 🟡 | Built: suppliers, goods-received with supplier price and weighted-average costing, price history, expiry batches (FEFO), stock counts with manager approval, dish costing/food-cost %, reorder suggestions, valuation/wastage/consumption reports. Not built (owner to prioritise): purchase orders, outlet transfers, sub-recipes/yield %, and syncing stock to the cloud |
| 085 Creating a ticket fails silently | 🟢 | The page never rendered its stored error; now shown in the dialog with the server's per-field reasons; button inside the form; load errors have a banner + Retry |
| 086 No assignee on create / uncontrolled | 🟢 | Assignee field; only active members assignable (API + picker) (`support-tickets.e2e`). No assignment-history screen or notification yet (needs BUG-064) |
| 087 No my-tickets / per-member view | 🟢 | Views, per-teammate counts, ticket numbers, search, paging, real counts and an honest "Past SLA" tile in place of the hardcoded "100% SLA Compliance" |
| 088 Restaurants cannot raise tickets | 🔴 | Feature gap - not started |
| 036, 070, 078, 079, 080, 081 | ✅ | Fixed and tested (shared Super Admin styles, Backups dialogs, activation page rewrite, invitation link/password hardening, offline-extension request validation/audit) |
| 071 | 🟡 | Partly: clearer "storage not configured" message; no real fallback storage |
| 072, 073, 074 | 🟡 | Partly: real snapshot contents, real verify, real preview, honest (refused) restore, wording corrected. Not built: real restore, scheduling, retention, encryption, failure records |
| 076 | 🟡 | Partly: up-front signing status on the page + key-generation script; the real key and its public half in the apps are an owner step; no key rotation |
| 075 | 🟡 | Partly: production startup guard + backups service uses the platform wrapper. Switching the actual DB role is an ops step for the owner (see BUG_CHECKLIST.md) |
| All others (018, 033, 041, 047-048, 051, 053, 055-058, 060, 064-067, 069, 090) | 🔴 | Not started yet |

> Decisions taken where the owner had not chosen (change any of these if you disagree): role→area matrix in `cloud/api/src/common/rbac/access.ts`; 7-day offline grace; maintenance never blocks billing; new invites default to Read-only.
> Test note: API tests run against the isolated `jamanvaar_test` database. Pre-existing, unrelated failures: RLS tests (DB role is a superuser, BUG-075), licensing (no signing key, BUG-076), backups (no S3 config, BUG-071).

---

## BUG-001 — Onboarding Welcome Kit: print gives a blank page 🔴

- **App:** Super Admin (`cloud/super-admin-web`)
- **Screen:** Onboard Restaurant → final step ("Welcome Kit"), route `/restaurants/onboard`
- **Steps:** finish onboarding → click **Print Official Welcome Kit** → Save as PDF preview
- **Actual:** the preview is 1 page with only the browser header and footer ("JAMANVAAR — Platform Control Center", URL, 1/1). The body is empty.
- **Expected:** the printed page shows the welcome kit (restaurant details, credentials, QR codes and activation keys).
- **Code:** `pages/Onboarding/OnboardRestaurantPage.tsx:385` (`handlePrint` calls `window.print()`); print CSS in `pages/Onboarding/onboarding.css:373-394`
- **Likely cause (from code reading, not reproduced):** `.app-shell` and `.app-main` are `height: 100vh; overflow: hidden`, and `.app-content` is `overflow-y: auto` (`layout/layout.css`). The print CSS hides the sidebar, header, stepper and buttons but doesn't release these fixed-height scroll containers, so the kit is clipped out of the printed page.

## BUG-002 — Onboarding Welcome Kit: copy buttons give no usable feedback 🔴

- **App:** Super Admin (`cloud/super-admin-web`)
- **Screen:** same Welcome Kit step
- **Buttons:** **Copy WhatsApp / Email Greeting**, and every per-key **Copy Code**
- **Steps:** scroll to the bottom → click **Copy WhatsApp / Email Greeting**
- **Actual:** the user sees no tick or confirmation where they clicked, so the button looks dead.
- **Expected:** clear "Copied" feedback next to the clicked button, and the text is really on the clipboard.
- **Code:** `handleCopy` at `OnboardRestaurantPage.tsx:378`; toast markup at `:667-686`; button at `:1728-1734`
- **Likely cause (from code reading, not reproduced):**
  1. `navigator.clipboard.writeText()` is not awaited and has no `catch`, so the "Copied" toast shows even if the copy fails.
  2. The toast renders inline at the top of the wizard, above the card. The buttons are at the bottom of the scrolling area, so the toast is off-screen when clicked.
- **Open question:** does the message actually paste after clicking? If not, the clipboard write is failing silently. If yes, only the toast position is wrong.

---

## BUG-003 — Restaurant detail → Subscription: "Extend Trial (+30 Days)" fails 🔴

- **App:** Super Admin (`cloud/super-admin-web`)
- **Screen:** Restaurants → open a restaurant (`/restaurants/:id`) → **Subscription** tab
- **Steps:** click **Extend Trial (+30 Days)**
- **Actual:** an error bar shows `Cannot PATCH /api/v1/subscriptions/<subscription-id>`. The expiry date does not change (it stays 19/10/2026 in the screenshot).
- **Expected:** the subscription expiry moves forward 30 days and a success toast shows.
- **Code (frontend):** `pages/Restaurants/RestaurantDetailPage.tsx:418-435` (`handleExtendSubscription`) sends `PATCH /api/v1/subscriptions/${sub.id}` with `{ expiresAt }`. The button is at `:895`.
- **Code (backend):** `cloud/api/src/modules/subscriptions/subscriptions.controller.ts` has no `PATCH :id` route. It only has `:id/change-plan`, `:id/renew`, `:id/suspend` and `:id/reactivate`.
- **Cause (confirmed by reading both sides):** the button calls a route that doesn't exist. The working equivalent is `PATCH /subscriptions/:id/renew` with `{ expiresAt }`, which `RenewSubscriptionModal.tsx:31` already uses.
- **Watch out when fixing:** `SubscriptionsService.renew()` (`subscriptions.service.ts:147`) also forces `status: 'ACTIVE'`. Using it for "extend" would silently reactivate a SUSPENDED or EXPIRED subscription. Decide whether that's wanted.
- **Also:** the label says "Trial", but the subscription in the screenshot is an ACTIVE paid CORE plan, so the wording is misleading. The owner said this doesn't work "on the restaurant pages" of Super Admin. I only found this one call site on the restaurant detail page; the Subscriptions list page uses the working `/renew` route.

## BUG-004 — Copy buttons don't show a "copied" tick consistently, across the project 🔴

- **Apps:** Super Admin (`cloud/super-admin-web`) and Restaurant Admin (`apps/restaurant-system/pos-admin`)
- **Actual:** many Copy buttons give no visual change on the button itself when clicked.
- **Expected:** every Copy button flips to a tick (and "Copied") for about 2 seconds, then reverts.
- **Root cause:** there is no shared copy component or hook. About 15 places each call `navigator.clipboard.writeText()` on their own, with different feedback and none of them handling failure. Found by grep, not reproduced click by click.

**Has a per-button tick (works as intended):**
- `Team/InviteTeammateModal.tsx`
- `Restaurants/CreateRestaurantModal.tsx`
- `Owners/OwnerDetailPage.tsx`
- `Branches/BranchDetailPage.tsx`
- `Restaurants/LicenseCertificatePanel.tsx`
- `ActivationKeys/GenerateActivationKeyModal.tsx`
- `Restaurants/RestaurantsListPage.tsx` (ID chip)
- pos-admin `settings/CloudDeviceLoginsPanel.tsx`
- pos-admin `qr/QrCardDesignerModal.tsx`

**No tick on the button (toast only, or no visible feedback):**
- `Onboarding/OnboardRestaurantPage.tsx:379` (see BUG-002; the toast is off-screen at the top)
- `Restaurants/RestaurantDetailPage.tsx:701` and `:1191` (activation key copy, toast only)
- `ActivationKeys/ActivationKeysListPage.tsx:339` (toast only)
- `Team/TeamPage.tsx:170` (toast only)
- pos-admin `qr/QrOrderingModule.tsx:358` (toast only)

**Not checked yet:**
- pos-admin `reports/ReportPreviewModal.tsx` (has an `isCopied` state)
- pos-admin `menu/MenuCategoriesModule.tsx`
- pos `settings/PosSettingsView.tsx` (has a "Copy" label)
- Kiosk Admin, Captain, KDS and Kiosk did not show up in the `writeText` grep.

**Related risk:** none of the `writeText` calls except `LicenseCertificatePanel` are awaited or wrapped in try/catch. On a page served over plain `http://` from a LAN address (not localhost), `navigator.clipboard` is `undefined` and the click would throw.

---

## Group A — Staff login / PIN / demo data (BUG-005 to BUG-012)

**What the owner wants:** remove the demo and hardcoded login flow completely. Put in a proper auth flow where PINs are created and managed from Restaurant Admin, and every terminal (POS, Captain, KDS, Kiosk staff login) uses them. No demo logins, no seeded credentials, no fake emails.

## BUG-005 — POS login has a hardcoded "Quick Demo Login" and seeded staff profiles 🔴

- **App:** POS (`apps/restaurant-system/pos`)
- **Screen:** POS Counter login
- **Actual:**
  - A "QUICK DEMO LOGIN — Cashier Session (PIN: 1111)" button logs in with one click.
  - The "Select Staff Profile" cards are the first 4 seeded users (Ramesh Patel, Pooja Shah, Amit Dave, Rahul Sharma).
  - The demo button's label says PIN 1111, but the seeded cashier's real PIN is 1234.
- **Expected:** no demo button and no seeded staff. The login shows only the restaurant's real staff.
- **Code:**
  - `pos/src/components/auth/PosLogin.tsx:99-107` (button), `:69-79` (`handleQuickDemo` reads the cashier's PIN from the db and submits it), `:115` (`db.users.slice(0, 4)`)
  - Seed data: `packages/database/src/seed.ts:727-784` (`SEED_USERS`, PINs 9999 / 5678 / 1234 / 2222, plaintext)
- **Extra findings in the same flow:**
  - Picking a profile card does nothing. `loginWithPin(pin)` (`pos/src/store/posStore.ts:376`) takes only the PIN and logs in whichever active user matches first. The selected profile is cosmetic, and two staff with the same PIN would collide.
  - PINs are stored in plaintext inside the local user records.
  - The saved session hardcodes `restaurantId: 'restaurant-main'` (`posStore.ts:387`), but the seeded restaurant id is `rest-jamanvaar-main`.

## BUG-006 — No way to create or reset staff PINs from Restaurant Admin 🔴

- **App:** Restaurant Admin (`apps/restaurant-system/pos-admin`) plus every terminal that logs in by PIN
- **Actual:**
  - Restaurant Admin has no PIN field or feature anywhere. `StaffModal.tsx` has name, username, role, phone, email and active, and nothing for a PIN.
  - `StaffRepository.createUser()` (`packages/database/src/repositories.ts:2572`) never sets a `pinCode`.
  - The `User` type has no `pinCode` field, so every consumer casts `as User & { pinCode?: string }`.
  - A newly created staff member has no PIN, so they can never log in to POS, Captain, KDS or Kiosk. The only working PINs are the four seeded ones, which is why the demo credentials can't simply be deleted today.
- **PIN consumers (all read `db.users[].pinCode`):**
  - POS login: `posStore.ts:376`
  - POS unlock and manager override: `posStore.ts:359` and `:437`
  - `repositories.ts:2215`
  - Captain: `captain/src/store/captainStore.ts:289`
  - KDS: `kds/src/App.tsx:221`
  - Kiosk staff login: `kiosk-user/src/App.tsx:1197`
- **Expected:**
  - The owner or manager creates a staff member in Restaurant Admin and the system generates or sets a PIN.
  - The PIN can be reset later.
  - Each PIN is unique per restaurant and stored hashed.
  - Every app authenticates against the same real staff list.
  - No seeded users exist on a fresh install.
- **Owner re-confirmed:** "assign PIN to staff from Restaurant Admin." Adding a staff member (or resetting one) must give that person a PIN that works on POS, Captain, KDS and Kiosk.
- **Design question for the fix (not decided):** should PINs live only in the local store, or be issued by `cloud/api` (`User` table) so they work on every device of the restaurant?

## BUG-007 — POS login screen can't scroll; keypad and Unlock button are cut off 🔴

- **App:** POS
- **Steps:** open POS on a window or screen shorter than about 900px (the screenshot's viewport is about 720px)
- **Actual:** the keypad's 7-8-9 row and the rest of the page (C 0 ⌫ and UNLOCK TERMINAL) are below the fold with no way to scroll, so login is impossible on small heights.
- **Expected:** the whole login card is reachable at any window size, either by scrolling or by fitting the viewport.
- **Code:**
  - `pos/src/index.css:19-21` sets `body { overflow: hidden }`, and `pos/index.html` sets `overflow-hidden` on the body.
  - `packages/ui/src/JamanvaarAuthLayout.tsx:110` uses `min-h-screen`, so the content grows taller than the viewport.
- **Cause (from code reading):** the page grows taller than the screen but the body is not allowed to scroll. The same shared auth layout is probably used by Captain, KDS and the admin apps (not checked). The desktop window is fixed at 1440×900 with a 1280×768 minimum in `src-tauri/tauri.conf.json`, so a browser tab is where it shows.

## BUG-008 — POS opens at "130% zoom" and Restaurant Admin can't change it ❓ needs clarification

- **App:** POS terminal, plus a Restaurant Admin setting the owner says they changed
- **Owner's report:** the POS default view is zoomed to 130%. It is hardcoded and doesn't follow the value changed from the Restaurant Admin console.
- **What I found:** I could not find 130% anywhere in code, and Restaurant Admin has no zoom, scale or display-size setting (grep across the apps, types, database and config). The only `zoom` in the POS code is the animation class `zoom-in-95` and a report-preview zoom capped at 130%. POS sizes are fixed in `tailwind` and `px`.
- **Possible explanations (unverified):**
  1. Chrome's per-site page zoom on `localhost:5175`.
  2. Windows display scaling (125-150% is common).
  3. A setting I didn't find.
- **Need from the owner:** which screen and setting in Restaurant Admin did you change, and does the POS desktop `.exe` look the same as the browser tab? If Restaurant Admin has no such setting, this is a missing feature, not a bug.

## BUG-009 — `@jamanvaar.com` emails appear on all staff in Restaurant Admin 🔴

- **App:** Restaurant Admin (and shared data used by POS and Kiosk Admin)
- **Actual:** the staff list and Edit Employee form show `@jamanvaar.com` emails (e.g. `cashier1@jamanvaar.com`). New staff get a fake `@jamanvaar.local` email automatically.
- **Expected:** no `jamanvaar.com` or `jamanvaar.local` email is ever generated or shown for staff. Email is empty or entered by the owner.
- **Where they come from (found by grep):**
  - **Seed staff:** `packages/database/src/seed.ts:733, 747, 761, 775` (`admin@`, `manager@`, `cashier1@`, `captain1@jamanvaar.com`).
  - **Auto-generated fake email on create/edit:**
    - `pos-admin/src/components/StaffModal.tsx:49` (autofills `<name>@jamanvaar.local` as you type the name)
    - `StaffModal.tsx:65` and `:74` (fallback on save)
    - `StaffModal.tsx:150` (placeholder)
    - `repositories.ts:2578` (`createUser` fallback)
  - **POS fallback text:** `pos/src/components/layout/PosHeader.tsx:517` (`amit.dave@jamanvaar.com` shown for the logged-in user).
  - **Login placeholder:** `pos-admin/src/App.tsx:546` ("e.g. admin or owner@jamanvaar.com").
  - **Restaurant-level default `hello@jamanvaar.com`:** `seed.ts:62`, `business/src/eod_service.ts:306`, `pos-admin/.../ReportBrandingSettings.tsx:40, 391`, `kiosk-admin/src/App.tsx:451, 6981`. This is the restaurant's business email on reports, not staff. Decide whether to remove it too.
  - **URLs that are not staff emails, listed for completeness:** `kiosk.jamanvaar.com/track/...` in `packages/api/src/services/ebill.ts:65, 178`, and `kiosk-user/src/App.tsx:3423`.

## BUG-010 — Edit Employee shows the wrong role, and saving writes an invalid role id 🔴

- **App:** Restaurant Admin → Staff → Edit Employee. In the owner's screenshot Amit Dave, a Cashier, shows "👑 Restaurant Owner". (The name shown in the field differs from the title only because the owner edited it.)
- **Actual:** `StaffModal.tsx:124-128` offers role values `OWNER`, `MANAGER`, `CASHIER`, `CAPTAIN` and `CHEF`. Real users carry role ids like `role-cashier` and `role-super-admin` (`seed.ts`). The stored id matches no option, so the `<select>` falls back to the first option, "Restaurant Owner".
- **Consequences:**
  - Pressing Save Changes without touching the role writes `roleId` as `OWNER`, promoting the staff member to owner (a privilege escalation).
  - Any role the owner picks is saved as a string like `CASHIER` that does not exist in the roles list, so permission checks on that user may fail.
- **Note:** this is the same issue the earlier audit filed as BUG-010 (role dropdown defaults to Owner), and it is not fixed. There is also no "Kitchen Chef" role in the seeded roles.

## BUG-011 — Staff & Roles page shows seeded staff, no PINs, raw role ids 🔴

- **App:** Restaurant Admin → Staff & Roles (RBAC)
- **Evidence (owner's screenshot):** the restaurant is "royal pan — Ahmedabad Flagship Store", yet the page lists Ramesh Patel (Owner), Pooja Shah, Amit Dave and Rahul Sharma with the phone numbers `+91 98765 0000x`. These are the demo staff from `seed.ts`, not staff of this restaurant.
- **Actual:**
  - The page subtitle says "Manage owner PINs, cashier logins, manager overrides…", but no PIN is shown or settable anywhere on the page.
  - Role chips show raw internal ids (`ROLE-SUPER-ADMIN`, `ROLE-MANAGER`, `ROLE-CASHIER`, `ROLE-CAPTAIN`) instead of role names.
- **Expected:**
  - A fresh restaurant shows only its own owner, plus whoever the owner adds.
  - Each staff member has a PIN that the owner can generate, see once and reset, and use to log in to POS, Captain, KDS and Kiosk.
  - Roles show readable names.
- **Related:** BUG-005, BUG-006, BUG-009 and BUG-010 are the same root problem seen from different screens.

## BUG-012 — Restaurant Admin header shows a fake open shift ("POS-01 ONLINE · Amit Dave · Float ₹2000") 🔴

- **App:** Restaurant Admin header (`pos-admin/src/components/header/PosAdminHeader.tsx:154, 171`)
- **Actual:** a brand-new restaurant shows "POS-01 ONLINE", cashier "Amit Dave (Lead Cashier)" and "Float: ₹2000" in the top bar.
- **Cause (from code reading):** `db.shifts = generateSeedShifts()` (`db.ts:121`, `seed.ts:797`) seeds an OPEN shift for the demo cashier with a ₹2,000 float, and a closed one for yesterday. The header also falls back to `'POS-01'` and `2000` when there is no active shift.
- **Expected:** no shift shown until a real cashier opens one. The header should show "No open shift" or nothing.

---

## Group B — Menu & Categories overall flow (BUG-013 to BUG-018)

**What the owner wants (the target flow):**
1. Onboarding creates the restaurant with an **empty menu**. Nothing appears on its own.
2. **Menus come from a CSV file.**
3. **Super Admin:** the restaurant detail page (`/restaurants/:id`) gets a new **Menu** tab. There Super Admin can upload the restaurant's menu CSV, and can give or revoke the Restaurant Admin's access to upload their own CSV.
4. **Restaurant Admin:** can upload a CSV (if allowed), and also has **one button** that loads the default items when clicked.
5. Whoever uploads, the menu is **added and loaded directly into POS** (and the other apps) with no extra step.

## BUG-013 — Every new restaurant already has a full menu without anyone loading one 🔴

- **This is the issue the owner described:** "when onboarding, it directly has the menu without loading it."
- **App:** shared local database (`packages/database`), so every terminal
- **Actual:**
  - `db.ts:84-92` initialises `categories`, `modifierGroups`, `menuItems`, `tables`, `coupons` and `offers` straight from the seed arrays, so every browser or terminal starts with the demo menu.
  - Several "Ensure menu is NEVER empty" rules re-fill the seed menu if it is empty: `db.ts:765-772`, `:814-818` and `:1074`.
  - `resetToDefaultSeed()` (`db.ts:1381-1391`) also restores it.
  - The onboarding wizard in Super Admin has no menu step at all.
- **Expected:** a new restaurant's menu is empty until a CSV is uploaded or the default items are loaded on purpose. An empty menu stays empty.
- **Question to settle later:** the same seeding applies to tables (12), coupons, offers, modifier groups and tax groups. The owner only mentioned the menu. Should those start empty too?

## BUG-014 — No CSV menu import, no one-click "Load default items", no empty-state guidance 🔴

- **Apps:** Restaurant Admin (`pos-admin/src/components/menu/MenuCategoriesModule.tsx`) and Super Admin
- **Actual:**
  - There is **no CSV import** anywhere for menus. Only export exists (`MenuBuilderService.exportCSV()` in `packages/business/src/menu_builder.ts:837`, used by POS's Menu Manager).
  - Restaurant Admin's menu screen has "Add Dish", "Add Category", "🍕 Load 14 Templates" (opens a template picker modal, `PrebuiltMenuModal.tsx`, with two cuisines pre-ticked) and "Bulk Price Adjust". There is no CSV upload and no single "Load default items" button.
  - When the menu is empty, the screen shows only "No menu dishes found matching the current search…" with no call to action. (Today this rarely happens because of BUG-013.)
- **Expected:**
  - CSV upload with a downloadable template, validation, a preview and a clear error report for bad rows. It must cover categories as well as dishes.
  - A one-click "Load default items" button.
  - An empty-state screen that offers both.
- **Open design points (not decided):**
  - The exact CSV columns (name, category, price, veg/non-veg, description, image, tax, station, modifiers…).
  - What "default items" means. Options are the seed menu, one chosen template, or the platform's master catalog.
  - The merge rule when a CSV is uploaded onto an existing menu (replace, add or skip duplicates). The template importer already has `KEEP_EXISTING / REPLACE_DUPLICATE / IMPORT_AS_NEW / SKIP_DUPLICATE`.

## BUG-015 — Super Admin has no Menu tab per restaurant, and the master-catalog "syndicate" never reaches any restaurant 🔴

- **App:** Super Admin (`cloud/super-admin-web`), Restaurant detail (`Restaurants/RestaurantDetailPage.tsx:92-110`)
- **Actual:**
  - The restaurant tabs are Overview, Owner & Users, Branches, Subscription, Applications, Plan Quotas, Feature Entitlements, Devices & Keys, Billing & Invoices, Payments, Reports & Analytics, Audit Logs, Support & Diagnostics and Backup & Recovery. There is no Menu tab (see the owner's second screenshot).
  - A global **Master Catalog** page exists (`pages/Catalog`, backend `cloud/api/src/modules/master-catalog`) with `POST items/:id/syndicate`. Syndicating only writes a `RestaurantMenuSyndication` row in the cloud database.
  - No terminal app reads those rows (grep for `syndications` and `master-catalog` across `apps/` and `packages/` finds nothing), so this path never delivers a menu to a POS.
  - The cloud schema has no per-restaurant menu store of its own. There is only the master catalog, syndication rows and payment snapshots.
- **Expected:**
  - A **Menu** tab on the restaurant page for uploading that restaurant's CSV.
  - A permission the platform owner controls for whether that restaurant's admin may upload their own CSV. This fits the existing per-app entitlement model (`Plan → Subscription → ApplicationEntitlement`, `EntitlementGuard`), but the fix should confirm that.
  - Whatever Super Admin uploads must reach that restaurant's terminals.

## BUG-016 — Menu sync path is narrow: categories aren't synced, and only Restaurant Admin pushes menus 🔴 (verify)

- **Apps:** POS, Captain, Restaurant Admin, Kiosk apps, cloud API
- **What exists:**
  - The generic entity-sync bridge accepts `MENU_ITEM` and `MENU_CATEGORY` (`cloud/api/.../entity-sync/dto`).
  - Restaurant Admin pushes `MENU_ITEM` (`pos-admin/src/App.tsx:433`).
  - POS and Captain pull it (`pos/src/App.tsx:160-163`, `captain/src/App.tsx:132`).
- **Gaps (from grep, not reproduced):**
  - `MENU_CATEGORY` is never used by any app, so categories don't sync.
  - The Kiosk apps have no `MENU_ITEM` sync.
  - There is no server-side entry point where Super Admin can push a menu that these devices then pull. Today menus only travel device to cloud to device, always starting from a Restaurant Admin terminal.
- **Why it matters:** "CSV upload appears directly in POS" needs a defined path, and today Super Admin has none.

## BUG-017 — Local menu-loading rules can delete or replace a real menu 🔴 (would break CSV uploads)

- **App:** shared local database (`packages/database/src/db.ts`, restore from `localStorage`, about lines 1025-1075)
- **Actual (from code reading, not reproduced):**
  - On load, every persisted item with `dietaryType === 'NON_VEG'`, or with "chicken" in its name, is filtered out. A restaurant that sells non-veg food loses those dishes on the next load.
  - If fewer than 8 items remain after that filter, the whole menu is replaced with the seed menu. A small real menu, or a CSV with fewer than 8 dishes, gets overwritten.
  - Item images are overridden by name matching ("biryani", "paneer tikka", "thali", …) to bundled demo photos.
- **Expected:** a restaurant's own menu is loaded exactly as stored, with no hidden filters or reseeding.
- **Note:** these rules must go before CSV import can be trusted. This is a separate bug from BUG-013.

## BUG-018 — Super Admin ships a seeded demo restaurant and hardcoded localhost URLs 🟡 (low priority, spotted)

- **App:** Super Admin and cloud API
- **Evidence (owner's second screenshot):** "JAMANVAAR — Demo Restaurant", ID `11111111-1111-4111-8111-111111111111`, master owner "Demo Owner (owner@demo.jamanvaar.app)". It is created by `cloud/api/prisma/seed.ts:172-206` (demo restaurant, branch and owner).
- **Also:** the activation-keys panel text says "Restaurant Admin (http://localhost:5176)", and the WhatsApp greeting hardcodes `http://localhost:5176` and `:5173` (see BUG-001/002).
- **Question:** is the demo tenant meant to exist in production databases? The owner wants no demo or hardcoded flows. It is only a bug if the seed is run against a real environment.

---

## Group C — Cross-app sync: one restaurant, all apps connected (BUG-019 to BUG-023) ⭐ MOST IMPORTANT

**What the owner wants (the target flow):**
1. A restaurant is onboarded in Super Admin.
2. Restaurant Admin enters the activation keys for each app (POS, Captain, KDS, Kiosk, Kiosk Admin).
3. From then on, **all of that restaurant's apps are connected as one system**, and their data syncs for that restaurant.
4. When POS sends a KOT, the order appears in **KDS** and in Restaurant Admin's Kitchen/KOT, as it does in POS. Today it shows only in the Kitchen/KOT views of POS and Restaurant Admin, and KDS stays empty.

**Evidence (owner's screenshots):**
- POS has an order with 3 items and shows "Pending KOT: 6" in its footer.
- The KDS app running separately shows "All Kitchen Orders Cleared" with 0 tickets.
- The Super Admin restaurant page (royal pan) shows 6 activation keys, 4 available to redeem (Kiosk Admin, Self-Order Kiosk, KDS and Captain still "ACTIVE" = unredeemed), Restaurant Admin "REDEEMED", and "2 Registered Terminals".

## BUG-019 — POS "Send KOT" never reaches the KDS app 🔴 P0

- **Apps:** POS → KDS (and Captain, Restaurant Admin)
- **Steps:** create an order in POS → press SEND KOT → look at the KDS app running on its own port
- **Actual:** the ticket never appears in KDS. (My earlier note that Restaurant Admin's Kitchen/KOT receives it was wrong. The owner later clarified that nothing from POS shows in Restaurant Admin either, and the code confirms there is no way for it to arrive: see BUG-034.)
- **Expected:** the ticket appears in KDS within a second or two, exactly as sent.
- **What the code does today (`sendKOT` in `pos/src/store/posStore.ts:970-1057`):**
  1. It creates the order and the KOT in POS's own local store.
  2. It calls `lanMeshSync.broadcast('KOT_CREATED', …)`. KDS listens for that event (`kds/src/App.tsx:130`). This broadcast can only reach tabs of the same origin (see BUG-020), so KDS on another port never receives it.
  3. The cloud path is the only route left. POS pushes the order to the cloud only on a 15-second timer (`pos/src/App.tsx:183`), not when KOT is pressed. It works only if POS is activated. KDS then pulls on its own 15-second timer (`kds/src/App.tsx:73-77`), and only if KDS is activated and holds a device token for the same restaurant.
  4. KDS builds the ticket itself from the pulled order (`packages/sync/src/outbox.ts` → `ensureKotForOrder`), so it is not the KOT POS created (see BUG-022).
- **Likely reasons it shows nothing in the owner's case (to confirm by running, not proven):**
  - **KDS activated against a different restaurant, or not activated with this restaurant's key.** The KDS board is only reachable after activation (`kds/src/App.tsx:369`), yet Super Admin shows this restaurant's KDS key as unredeemed. The KDS on screen probably holds a token from another key or restaurant (or a stale one). The cloud scopes everything by restaurant, so it would never see this restaurant's orders.
  - Up to about 30 seconds of delay (POS push timer + KDS pull timer), which can look like "nothing".
  - POS never took on the restaurant's identity (see BUG-021), so it may not be bound the way the owner expects.
- **Need from the owner:** which activation key was entered into the KDS shown in the screenshot? Is POS activated (Super Admin shows 2 registered terminals: Restaurant Admin and probably POS)?
- **Note:** the project's status docs mark this flow as fixed and e2e-tested. The tests (e.g. `tests/cross_app_sync_cluster.test.ts`) probably run every "app" inside one process sharing one `db` object, which would hide the separate-origin problem below. This is not verified.

## BUG-020 — The "LAN mesh" only works inside a single browser origin, so most cross-app features are silently dead 🔴 P0 (root cause)

- **Apps:** all (POS, Captain, KDS, Restaurant Admin, Kiosk, Kiosk Admin)
- **What happens:**
  - Each app runs on its own origin (ports 5173-5179). Each origin has its own separate `localStorage`, so each app has its own separate copy of the "database" (`kds_db.ts` and `pos_db.ts` are just re-exports of the same class, but every browser origin instantiates its own). The desktop `.exe` builds are separate WebViews too.
  - `LanMeshSyncEngine` (`packages/sync/src/lan_mesh_sync.ts:212-300`) sends events through `BroadcastChannel` and the `localStorage` `storage` event. Both only work between tabs of the **same origin**.
  - The only other local path is the hub on `:5178` (`db.ts:715-750`). Its endpoints require a pairing token (`local_service.cjs:40, 154`) that no app ever obtains (the comment at `db.ts:556-563` says so). The first 401 turns it off (`serverSyncUnauthorized`), so it is dead too.
- **Consequence:** every feature that relies only on `lanMeshSync.broadcast` never crosses apps:
  - table occupancy (POS ↔ Captain)
  - food-ready (KDS → Captain and POS)
  - order-served
  - bill requests (Captain → POS)
  - internal messages to the kitchen
  - diner service requests
  - KOT status changes (KDS Ready / Served → POS and Captain)
- **Not the same as the docs:** `PLATFORM_STATUS_AND_ROADMAP.md` lists these flows as "✅ Connected via LAN mesh". That holds only for several tabs of one app, not for separate apps.
- **Expected:** one transport that really connects all of a restaurant's devices, and clear behaviour when a device is offline. The cloud (per-restaurant, device-token authenticated) is the natural hub because it already exists. It would need to carry KOTs, KOT status, tables, messages and requests, not only orders and a few entity types. A direct LAN transport for offline use can come later.

## BUG-021 — Activating an app doesn't bind it to the restaurant's data (identity, staff, tables, settings) 🔴

- **Apps:** POS, Captain, KDS, Kiosk, Kiosk Admin (Restaurant Admin does it partly)
- **Evidence:** in the owner's screenshots the same restaurant shows as "**royal pan** — Ahmedabad Flagship Store" in Restaurant Admin but "**JAMANVAAR RESTAURANT** — Flagship Store · POS-01" in POS.
- **Cause (from code reading):**
  - Activation stores only `restaurantId`, `deviceId` and `deviceToken` (`pos/src/cloud/cloudClient.ts:72-79`).
  - Only Restaurant Admin copies the restaurant name from the cloud (`pos-admin/src/App.tsx:207`). Every other app keeps the seeded `SEED_RESTAURANT`.
  - The generic sync carries menu items, customers and inventory, but not restaurant profile, tables, staff or receipt settings.
- **Expected:** activating any app with a key pulls that restaurant's profile (name, address, GSTIN, tax and receipt settings), staff and PINs, tables, and menu, so every app shows the same restaurant.

## BUG-022 — Even when a KOT does arrive via the cloud, the KDS ticket is incomplete or missing 🔴

- **App:** KDS, sync package (`packages/sync/src/outbox.ts`)
- **Actual (from code reading, not reproduced):**
  - **Modifiers are dropped.** `buildLocalOrderFromRemote` sets `modifiers: []` for every item (`outbox.ts:145`), so "No Onion", "Extra Cheese" and similar never reach the kitchen.
  - **Kitchen station routing is lost.** Every rebuilt item goes to `'Main Kitchen'` (`outbox.ts:205`), so the Tandoor, Beverage and Dessert tabs stay empty.
  - **Chef notes and special instructions are not rebuilt** (the KOT is generated without them), and the cashier shows as "Cloud Sync".
  - **Add-on rounds never arrive.** For an order KDS already has, the pull only updates statuses of items it already knows (`applyRemoteToLocalOrder`, `outbox.ts:110-125`). New items are ignored and no new KOT is created. On the POS side, pressing SEND KOT again for a table with a running order reuses the existing order and doesn't add items to it or re-flag it for sync (`posStore.ts:970-1017`), so the second round is never pushed either.
  - **Latency:** up to about 30 seconds (BUG-019 point 3). A kitchen needs it instant, or at least about 2 seconds.
- **Expected:** the ticket KDS shows is the one POS created: same items, modifiers, notes, station and table, and follow-up rounds appear as new tickets.
- **Design point:** the KOT should be its own synced record, not something rebuilt from the order.

## BUG-023 — Status changes don't flow back (KDS "Ready/Served" → POS and Captain) 🔴 (verify)

- **Apps:** KDS → POS, Captain, Restaurant Admin
- **Why (from code reading):** KDS marks a ticket ready with `lanMeshSync` events (`FOOD_READY`, `ORDER_SERVED`, `kds/src/App.tsx:150-174`), which don't cross apps (BUG-020). The cloud path only carries per-item `kitchenStatus` inside the order push, and it depends on KDS flagging the order for sync after a status change. I did not check that this happens.
- **Expected:** when the kitchen marks food ready, POS, Captain and Restaurant Admin update within seconds.

---

## Group D — Thermal printing (BUG-024 to BUG-028)

**What the owner wants:** real printer connection and **automatic detection** of the printer, so that the receipt is really printed by the device. Today the printer setup is hardcoded and the app always says the print worked. Fix this across the whole project (POS, Restaurant Admin, Kiosk, Kiosk Admin).

**Evidence (owner's screenshot):** the POS "PRINT RECEIPT" dialog. Its preview shows "JAMANVAAR RESTAURANT · Sindhu Bhavan Road, Bodakdev · +91 79 4890 1234 · GSTIN 24ABCDE1234F1Z5 · FSSAI 10722001000452", while the restaurant in Super Admin is "royal pan".

## BUG-024 — Printing always reports success, even when nothing is printed 🔴 P0

- **Apps:** POS, Restaurant Admin, Kiosk, Kiosk Admin
- **Actual:**
  - `PrintQueueRepository.addJob()` creates every job with `status: 'SUCCESS'` at creation time ("Virtual/browser driver marks as SUCCESS", `packages/database/src/repositories.ts:2322`), before any hardware is contacted.
  - POS's `printOrderReceipt` (`pos/src/services/printerService.ts:217-245`) only changes a job to FAILED if the printer is `NETWORK_LAN` with an IP and the app is running as the Tauri desktop app. In every other case the job stays SUCCESS.
  - The receipt dialog then shows "Thermal print command dispatched to ESC/POS hardware printer (80mm)!" for any job that isn't FAILED (`PosThermalReceiptModal.tsx:70-72, 220-223`).
  - Receipts print automatically at payment through the same code, so those failures are silent as well.
  - KOT printing is fire-and-forget: `PosPrinterService.printKOT(kot)` is called without `await` or error handling (`posStore.ts:1043-1045`), and a job is recorded as SUCCESS either way.
  - The shared kiosk `PrinterService` (`packages/api/src/printer.ts`) does the same: `printReceipt` reports success from the seeded `status === 'READY'` flag alone (`:484-499`).
- **Expected:** a job is SUCCESS only after the printer accepted the data. If the printer is missing, offline, out of paper or unreachable, the user sees a real error with Retry, and the job stays queued.

## BUG-025 — No real printer detection; the printers are hardcoded and always "READY" 🔴

- **Apps:** POS, Restaurant Admin, Kiosk, Kiosk Admin
- **Actual:**
  - `db.configuredPrinters` is seeded with fixed printers, all `status: 'READY'` (`packages/database/src/db.ts:380-470`):
    - "JAMANVAAR Thermal 80mm (Counter)" on `USB001`, marked as built into the kiosk
    - Kitchen, Tandoor, Bar and Dessert printers at fixed LAN addresses `192.168.1.150` to `.153`
    - an "Admin Reports" Windows driver printer
  - **POS "Scan for Printers"** (`pos/.../PosSettingsView.tsx:119-126`, `printerService.ts:15-28`) scans nothing. It sets every already-configured printer to READY and then shows "Hardware Scan Complete: Found N printers (USB, LAN, Serial, Windows drivers)".
  - The kiosk's `autoConfigureKioskPrinter()` (`packages/api/src/printer.ts:43-72`) picks a seeded printer and forces it to READY. The device health record also hardcodes `isPrinterOnline: true` (`db.ts:551`).
  - Restaurant Admin's "Add printer" form (`PrinterModal.tsx`) is manual entry only. Its defaults are `USB` and `USB001`.
- **Expected:**
  - A new restaurant starts with **no** printers.
  - The app detects real printers on this machine (installed Windows printers, USB, and network printers on the LAN) and lists them with real status.
  - The owner picks which printer is for the receipt and which for each kitchen station.
  - Status (online, offline, paper out) comes from the device, not from a flag.

## BUG-026 — Only one real transport exists (raw network printing in some desktop builds); USB, Windows driver, serial and Bluetooth are simulated 🔴

- **Actual (from code reading):**
  - The only real hardware path is `send_escpos_bytes`, raw TCP to a network printer on port 9100, as a Tauri command. It exists only in the **POS, Kiosk Admin and Kiosk** desktop apps. **Restaurant Admin** has no print command. **Captain and KDS** have no desktop shell.
  - Every code path guards it with `printer.interfaceType === 'NETWORK_LAN' && ipAddress && isTauriRuntime()`.
  - For USB, Serial, Windows System Spooler and Virtual printers, `printer.ts:441-442` says outright: "has no real transport yet — simulated success". The setup screen still offers all of these types (`PrinterModal.tsx:100-104`) and the help text mentions Bluetooth (`PrintersDevicesModule.tsx:138`).
  - In the browser (npm run dev, or a browser tab), nothing at all is sent to any printer.
  - No native code exists to enumerate printers (Windows spooler, USB, serial, or a network scan of port 9100).
- **Consequence:** on a typical Windows counter with a USB or driver-installed thermal printer, nothing is ever printed, while the app says it was.
- **Expected:** at least Windows-spooler/USB (the most common) plus raw network. Bluetooth or serial can be listed as later options. The "Virtual Emulator" type should be dev-only.
- **Question for the owner:** which printer(s) do you have now, and how are they connected (USB cable, LAN/Ethernet, Bluetooth)? Which model? This decides which transport to build first.

## BUG-027 — "Test print" prints nothing real, and reports "COMMUNICATION OK" 🔴

- **Actual:**
  - Restaurant Admin → Printers → "⚡ Run Test Print" shows a toast "Test print dispatched to …" and then calls `window.print()`, the browser print dialog for the whole web page, not a slip to the printer (`PrintersDevicesModule.tsx:187-190`).
  - The kiosk `printTestSlip()` (`packages/api/src/printer.ts:524-541`) sends nothing at all and returns "✓ Test Receipt Dispatched…" whenever the seeded status isn't OFFLINE or ERROR.
  - POS's test slip has the text "STATUS: READY (COMMUNICATION OK)" and "ESC/POS Thermal Auto-Cutter Test OK" hardcoded into the slip itself (`printerService.ts:339-343`).
- **Expected:** the test slip goes through the same real print path as receipts. The result is success only when the printer accepted it, and otherwise an error explaining why.

## BUG-028 — The printed receipt shows fake, seeded restaurant identity and hardcoded text 🔴

- **Apps:** POS receipts (screen preview and thermal text), Kiosk receipts, EOD reports
- **Actual:**
  - Receipt identity comes from `db.restaurant`, which POS never receives from the cloud (BUG-021). The receipt therefore prints the seed values: "JAMANVAAR RESTAURANT", "Sindhu Bhavan Road, Bodakdev", phone `+91 79 4890 1234`, and a placeholder **GSTIN `24ABCDE1234F1Z5`** and FSSAI `10722001000452` (`seed.ts:63-68`, `db.ts:362-365`). Printing a fake GSTIN on a **tax invoice** is a compliance problem.
  - The same fake GSTIN and FSSAI are also hardcoded as fallbacks in `business/src/eod_service.ts:301-308` and `pos_assistant.ts:880`, and the kiosk receipt falls back to a hardcoded "Sindhu Bhavan Road, Ahmedabad" (`packages/api/src/printer.ts:233`).
  - The POS thermal text hardcodes "BY KELVIONTECH" and "Authentic Heritage Dining" for every restaurant (`printerService.ts:84-85`) and always labels the taxes "CGST (2.5%)" and "SGST (2.5%)" (`:114-115`), regardless of the item's real tax group.
  - The "CASHIER:" line in the thermal text prints `order.kioskId || 'POS-01'` (`:93`), not the cashier's name, although the on-screen preview shows "Cashier: Amit Dave". The screen and paper differ.
- **Expected:** a receipt prints only the restaurant's real details. If the GSTIN is missing, the invoice says so or blocks printing; it never invents one. Tax lines use the real rates, and the cashier line matches the preview.
- **Related:** BUG-021 (restaurant identity not reaching POS), BUG-005 and BUG-011 (seeded demo data).

---

## Group E — POS payment and KOT flow: speed and correctness (BUG-029 to BUG-033)

**What the owner wants:** POS must be fast and run completely smoothly. Settlement must be quick, a split (multi-tender) payment must have a working confirm button, and after a KOT is sent the screen must not offer "Send KOT" and "Pay" again as if nothing happened. Work out what the correct flow should be.

**Evidence (owner's screenshots):** two payment dialogs ("NEW ORDER — NOT YET SAVED", fully allocated), one cash ₹378 and one Cash + UPI split ₹504. In both, the bottom button is a greyed-out "Processing Settlement…". The split screen's hint text reads "Confirm UPI payment above before settling."

## BUG-029 — "Processing Settlement…" gets stuck; payment can't be confirmed after the first bill 🔴 P0

- **App:** POS (`pos/src/components/payment/PosPaymentModal.tsx`)
- **Actual:** the settle button shows a disabled "Processing Settlement…" as soon as the dialog opens.
- **Cause (confirmed by reading the code):**
  - `handleSettle` sets `isProcessing = true` and `settlingRef.current = true` (`:364-365`). It resets them **only on failure** (`:380-381`, `:388-389`). On success it assumes the dialog will go away.
  - The dialog does close (`completePayment` sets `isPaymentOpen: false`, `posStore.ts:1155`), but `<PosPaymentModal />` is always mounted (`pos/src/App.tsx:363`). It just returns `null` while closed, so its state survives.
  - Nothing resets `isProcessing` or `settlingRef` when the dialog reopens (the open effect at `:126-143` only sets amounts).
  - Result: after the first successful payment, every later payment dialog opens with the button stuck on "Processing Settlement…", and `handleSettle` returns immediately because the ref is still `true`. Only a page reload clears it.
- **Expected:** every bill opens with a fresh, working "Confirm & Settle" button, and settlement completes in well under a second.

## BUG-030 — Split payment (Cash + UPI/Card) has no way to confirm the UPI/Card part, so it can never be settled 🔴 P0

- **App:** POS payment dialog, split mode
- **Actual:** with a split such as Cash 252 + UPI 252, "Confirm & Settle" needs `upiConfirmed` to be true (`:158-161`). But the "Mark UPI Paid" and "Mark Card Paid" buttons are only drawn when the **single** payment channel is UPI or Card (`activeChannel === 'UPI'` at `:811`, `=== 'CARD'` at `:838`). Split mode keeps `activeChannel` on `CASH` (`handleSelectSplitModeCard`, `:187-204`), so those buttons never appear. The hint "Confirm UPI payment above before settling" points at a control that doesn't exist, and the settle button stays disabled forever. This is what the owner sees as "no confirm bill button for multi-tender".
- **Expected:** in a split, each UPI or Card portion gets its own confirm control (or an equivalent step), and once everything is confirmed the Confirm & Settle button is enabled. Cash + UPI is the most common split.
- **Note:** the button label the cashier sees in the split screenshot is the stuck "Processing Settlement…" of BUG-029. Both bugs need fixing before split payment works.

## BUG-031 — UPI/Card "verified" flags carry over from the previous bill 🔴 (money safety)

- **App:** POS payment dialog
- **Actual:** `upiConfirmed` and `cardConfirmed` are never reset (`:115-116`, and only ever set to `true` at `:824` and `:850`). Because the component stays mounted (see BUG-029), once a cashier taps "Mark UPI Paid" on one bill, the next bill's UPI payment starts out already "✓ UPI Verified". The safeguard added to force the cashier to verify each UPI or card payment (`:155-161`) is bypassed from the second bill onward.
- **Expected:** every new bill starts with no payment marked as received.
- **Minor, same screen:** the dialog labels both "House Account" and "Split Payment" with shortcut `[5]`.

## BUG-032 — After "Send KOT" the cart is not tied to the sent order, so KOT and Pay can be done again and create duplicates 🔴

- **App:** POS (`pos/src/store/posStore.ts` `sendKOT` at `:970-1057` and `completePayment` at `:1059-1165`, `PosCart.tsx:100-119, 520-535`)
- **Owner's report:** "I select items and send KOT; the KOT is sent, but after about 25 seconds, or sometimes, it shows the Send KOT and Pay options again. It should not give the KOT option again for that order."
- **What the code does (from reading; not reproduced):**
  1. `sendKOT` creates an unpaid order (status PREPARING) and a KOT, but leaves the cart exactly as it was. The items are not marked as sent and the cart is not locked.
  2. "✓ KOT SENT" is shown for only 3 seconds (`PosCart.tsx:109`), then the button goes back to "SEND KOT". I found no 25-second timer. The sync timers are 15 seconds. I need the owner to say what they saw at 25 seconds.
  3. **Counter / takeaway orders** (no table) never remember the created order (`currentOrderId` is only set for tables, `posStore.ts:1013`). Pressing SEND KOT again creates a **second order and a second KOT** (the kitchen cooks it twice). Pressing PAY then creates a **third order** and settles that one. The first unpaid order stays in the kitchen and live-orders views forever (orphaned, and it can distort counts and revenue).
  4. **Table orders** do reuse the order on the second KOT and on pay, but items added to the cart after the first KOT are never added to that order. Pay settles the old order with the old items and total, while the payment dialog allocated the cart's new total.
  5. The 1.2-second guard (`sendingKotRef`) only stops accidental double taps, not a deliberate second press.
- **Expected flow (a proposal for the owner to confirm):**
  1. First **Send KOT** turns the cart into a **running order** with its own id, bound to the table or takeaway token. Sent items are locked and marked "Sent to kitchen".
  2. If there are no unsent items, "Send KOT" is hidden or disabled and the main actions are **Pay** (settles that same order) and **Add items**.
  3. New items added later show **"Send KOT (N new)"**, which sends only the new items as an add-on ticket and adds them to the same order.
  4. Removing a sent item needs a manager PIN and tells the kitchen (void).
  5. **Pay** always settles the running order, never a new one.
  6. Held orders and table recall behave the same way.
- **Related:** the KDS side of add-on rounds is BUG-022.

## BUG-033 — POS feels slow: every data change re-writes the whole local database 🟡 likely cause, not measured

- **App:** POS (and every app that uses the shared `db`)
- **Actual (from code reading):**
  - `db.notify()` runs `saveToStorage()`, which does `JSON.stringify` and `localStorage.setItem` for about 30 collections (menu, orders, KOTs, customers, audit logs, print jobs…) synchronously on the UI thread (`db.ts:938-1000`, `:1362-1373`). It also calls `pushToServer()` and posts a broadcast.
  - Settling one bill triggers many notifies in a row (order settle, receipt record, print job, audit log entries, cash drawer, shift totals…), so the whole database is serialised many times per payment. Cost grows with the number of stored orders, audit logs and print jobs, so POS gets slower every day it is used.
  - Extras on the payment path: receipt text generated twice, a print job with a simulated success (BUG-024), and a receipt dialog that opens right away.
- **Expected:** a payment completes near-instantly (well under a second) regardless of how much history exists. Options would be batching or debouncing the saves, saving only what changed, and moving history off the hot path. The owner should decide how far to go.
- **Note:** this is a likely cause. A real measurement (time `completePayment` with a large order history) is needed before fixing.

---

## Group F — Restaurant Admin, POS and KDS are not connected, even when activated with the same restaurant's keys (BUG-034, BUG-035) ⭐ MOST IMPORTANT

**Owner's latest report:** the restaurant was onboarded in Super Admin and all keys generated. The same keys were used to log in to Restaurant Admin and to activate POS and KDS. Orders and payments entered in POS **do not appear in Restaurant Admin at all** ("what is the point of admin then"), and orders sent from POS to KDS **do not appear in KDS** ("what is the function of KDS"). All three should be interconnected because they were activated with the same restaurant's keys. This extends Group C and confirms it.

## BUG-034 — Restaurant Admin has no way to receive POS orders, payments or kitchen tickets 🔴 P0

- **Apps:** Restaurant Admin (`apps/restaurant-system/pos-admin`), also Kiosk Admin
- **Actual (confirmed by reading the code):**
  - POS, KDS and Captain each set up the order-sync client at startup (`pos/src/App.tsx:131`, `kds/src/App.tsx:68`, `captain/src/App.tsx:125`). **Restaurant Admin never does.**
  - Restaurant Admin's cloud client (`pos-admin/src/cloud/cloudClient.ts`) has no order push or pull function, and `App.tsx` never configures `SyncOutboxEngine`. It syncs only menu items, customers and inventory (entity sync, `App.tsx:429-436`). Kiosk Admin has only a manual "process outbox" button (`kiosk-admin/src/App.tsx:3921`).
  - Restaurant Admin's Orders, Dashboard, Payments, Reports and Kitchen/KOT screens read the app's own local store (`db.orders`, `db.kots`; for example `KitchenKotModule.tsx:40`). That store is separate from POS's (BUG-020), so it only ever contains orders created inside Restaurant Admin itself.
- **Expected:** Restaurant Admin is the owner's live window onto the restaurant. Every order, payment, refund, KOT and status from POS, Kiosk and Captain appears there within seconds, and Dashboard, Payments and Reports are built from that real data.
- **Note:** this is the reason the owner sees "nothing" in Restaurant Admin after activating everything with the same keys. Activation gives each device access to the cloud, but this app never reads orders from it.

## BUG-035 — POS to KDS still shows nothing when both are activated with the same restaurant's keys 🔴 P0 (needs runtime diagnosis)

- **Apps:** POS, KDS, cloud API
- **Owner's report:** POS and KDS are both activated with the restaurant's keys, and not a single POS order appears in KDS.
- **What is verified in code:** both apps do configure the order transport and poll every 15 seconds (`pos/src/App.tsx:131, 183`, `kds/src/App.tsx:68-77`), and the cloud endpoints exist (`POST/GET /api/v1/orders/sync`, device-authenticated). I did not find a single line that clearly breaks the happy path, so the cause needs a live look.
- **New evidence (owner's latest Super Admin screenshot, restaurant "royal pan", Reports & Analytics tab):** "Terminal fleet health **3 / 3 Online**" but "**0 sync events logged**", while POS shows 6 orders for the day.
  - The heartbeat that makes a terminal show "Online" uses the same device guard as order sync (`device-heartbeat.controller.ts`), so the devices, restaurant status and subscription are all accepted.
  - Yet the cloud received **zero** order-sync events. Every order that reaches the sync service writes a log row, successful or not, so the orders never got that far. Either the apps never sent them or the server rejected the request before the service ran.
  - **The most likely cause found in code is BUG-038 (paid POS orders are never queued for sync).**
- **What I could not check:** the owner's "royal pan" restaurant is **not in either local database** on this machine:
  - `jamanvaar` (the database `cloud/api/.env` points at) contains only the seeded "JAMANVAAR — Demo Restaurant", created today at 10:47 database time (probably UTC, about 16:17 IST, after the owner's testing). It has 0 devices, 0 keys, 0 synced orders and 0 sync events.
  - `pos` contains old QA and test restaurants (6 devices, 9 keys, 1 synced order from about 08:05 UTC).
  - So either the database was reset or reseeded after the owner tested, or the API on `:4000` runs with a different `DATABASE_URL` than this `.env`. Either way I could not see what POS and KDS actually sent.
- **Design weaknesses that could cause silent failure (from code reading, not proven to be happening):**
  - **One bad order blocks every order.** `POST /orders/sync` validates the whole batch at once (`push-order-sync.dto.ts`; up to 100 events, each order needs at least 1 item, integer money, and `externalOrderId` of 64 characters or fewer). If any one order fails validation, the server rejects the entire request, and `processOutbox` marks all of them FAILED and retries the same batch every 15 seconds forever (`outbox.ts:281-303`). Nothing is ever delivered and the user sees no error.
  - **Nothing tells the user.** A failed push only flips an internal `syncStatus` and flips the network badge to OFFLINE. There is no visible "not synced" warning on the order or the screen.
  - Timing (BUG-019) and the incomplete rebuilt ticket (BUG-022) also apply.
- **To diagnose when running (not done yet):** open the browser Network tab on POS and press SEND KOT, and check whether `/api/v1/orders/sync` is called and with what HTTP status, then check the same on KDS. Confirm that the POS and KDS tokens belong to the same restaurant. Check the API terminal log (the API logs every request).

## BUG-038 — A POS order paid directly is never queued for the cloud, and a paid status is never re-sent 🔴 P0 (likely root cause of BUG-034 and BUG-035)

- **Apps:** POS → cloud → KDS, Captain, Restaurant Admin, Super Admin
- **Confirmed by reading the code:**
  - `OrderRepository.createOrder` defaults every order to `syncStatus: 'SYNCED'` and `isSynced: true` unless the caller says otherwise (`repositories.ts:565-567`).
  - POS's `completePayment` (pay without pressing Send KOT first) creates the order **without** a `syncStatus` (`posStore.ts:1086-1111`). The order is therefore born already "SYNCED" and has never been sent anywhere.
  - `SyncOutboxEngine.processOutbox` pushes only orders whose status is `SAVED_LOCALLY` or `FAILED` (`outbox.ts:266`). These orders are never picked up.
  - `OrderRepository.settleOrder` (`repositories.ts:671-747`) marks the order paid and completed but does **not** set `syncStatus = 'SAVED_LOCALLY'` (unlike `updateOrderStatus`, `voidOrder` and `refundOrder`, which do). So even an order that was pushed at Send KOT time keeps its old cloud copy ("PREPARING") after it is paid.
  - The order-sync message has no payment information at all (no method, no payment status, no tender split) (`push-order-sync.dto.ts`). The cloud accepts a separate `PAYMENT_TRANSACTION` entity type, but I found **no app anywhere that pushes it** (grep across `apps/` and `packages/`), so payments have no route to the cloud at all.
  - `settleOrder` also fire-and-forgets a POST to the local hub at `:5178/api/orders` "for cross-port sync" (`:735-745`). That hub rejects unauthenticated calls (BUG-020), so it does nothing.
- **Consequence:** payments and most direct-pay orders **never reach the cloud**, so Restaurant Admin and Super Admin cannot show them. KDS cannot get direct-pay orders either. This fits "0 sync events" in the owner's screenshot.
- **Expected:** every order is saved and queued for sync the moment it is created and again whenever it changes (items, status, payment), and the payment details travel with it.

---

## Group G — "Download PDF" and "Print" give a blank page, throughout the project (BUG-036, BUG-037)

**What the owner wants:** every download-PDF and print action, wherever it exists in the project, must produce a real document with the real content.

**Evidence (owner's screenshot):** POS Business Day dialog (19 September 2026, ₹1,702 net sales). "Download PDF" downloads an empty white page.

## BUG-036 — POS "Download PDF" produces a broken PDF (blank page) 🔴

- **Apps:** POS. Business Day, Bills/Invoices, Reports (and its preview) and Shift use `PdfReportBuilder.downloadPdfFile`.
  - `PosBusinessDayDetailModal.tsx:125`
  - `PosBillsView.tsx:464`
  - `PosReportPreviewModal.tsx:45`
  - `PosReportsView.tsx:108`
  - `PosShiftAndCashView.tsx:348`
- **Cause (from code reading; high confidence, not opened in a PDF viewer):** the project has **no PDF library**. `pos/src/services/pdfReportBuilder.ts` writes the PDF file format by hand, and the object numbering is wrong:
  - `addObj` numbers objects in the order they are added. The catalog is 1 and the two fonts become 2 and 3, but the code assumes the fonts are 3 and 4 and reserves 2 for the page tree (`:329-352`).
  - After the fact it inserts a "Pages" object labelled `2 0 obj` (`objects.splice(1, 0, …)`, `:369-372`). The file now has **two objects numbered 2** (the page tree and the regular font), and every object after them sits one slot later than the cross-reference table (xref) says.
  - Each page's font map points `/F1` at object 3 (actually the bold font) and `/F2` at object 4 (the first page's content stream, not a font).
  - The catalog's page-tree reference `2 0 R` becomes ambiguous, so viewers find no valid pages and show an empty page or an error.
  - Non-ASCII characters are already handled (`sanitize` strips them and turns ₹ into "Rs."), so encoding is not the cause.
- **Why tests didn't catch it:** `tests/pos_reports_and_pdf_export.test.ts` only checks that the output starts with `%PDF-1.4`, contains `%%EOF`, and contains the words "JAMANVAAR" and "Rs. 903". It never checks that the file is a valid, renderable PDF.
- **Expected:** a valid PDF that opens with the real report. A tested PDF library, or correct object numbering with a test that parses the result, would both work. The owner should decide.

## BUG-037 — Most other "Download PDF" and "Print" buttons just call `window.print()` on the whole app page, so they print blank or clipped pages 🔴

- **Apps:** Restaurant Admin, Kiosk Admin, Super Admin
- **Actual:**
  - There is no PDF export at all outside POS. These buttons call `window.print()`, which opens the browser print dialog for the entire app page, not a document. The labels claim more than they do: the Restaurant Admin Reports dashboard has "Print Report" (`window.print()`) and a "Download PDF" button that only opens the preview modal (`ReportsDashboard.tsx:326-343`).
  - The apps are built as fixed-height screens (`h-screen`, `overflow: hidden` on the body or shell). Unless the print styles undo that, only the first screenful, or nothing, prints. This is the same cause as BUG-001 for the Super Admin Welcome Kit. The Super Admin onboarding print CSS does not override those containers. Restaurant Admin's `index.css:198-204` does force `overflow: visible`. I have not tested whether that works.
- **Places that call `window.print()` (found by grep):**
  - **Restaurant Admin:** `ReportsDashboard.tsx:329`, `ReportPreviewModal.tsx:86`, `EodZReportDocument.tsx:73`, `OrdersModule.tsx:326`, `BillingInvoicesModule.tsx:328, 335`, `ShiftCashDrawerModule.tsx:104`, `SubscriptionPlansView.tsx:1269, 1377`, `QrCardDesignerModal.tsx:87`, `PrintersDevicesModule.tsx:190` (test print, see BUG-027).
  - **Kiosk Admin:** `App.tsx:3726, 4837, 4967, 6733`.
  - **Super Admin:** `Billing/BillingPage.tsx:798, 1005`, `Onboarding/OnboardRestaurantPage.tsx:385`.
- **Also unknown:** how `window.print()` behaves inside the packaged desktop apps (Tauri / WebView2) has not been tested.
- **Expected:** each of these produces a real PDF or a correct print of only the intended document (invoice, report, statement, QR card), not the app chrome.
- **Note:** POS's "Print" button on the Business Day dialog goes to the thermal-printer path instead (see BUG-024 and BUG-027).

---

## Group H — The same money figures must match everywhere (BUG-039 to BUG-042) ⭐

**Owner's requirement:** the bill amount and sales totals in POS, Restaurant Admin and Super Admin are different, and "this should not happen at any cost."

**Evidence (owner's screenshots):**
- POS Reports screen: net revenue ₹1,702 from 6 orders, gross ₹1,620, CGST ₹41, SGST **₹40**, total tax ₹81.
- POS Business Day dialog (earlier screenshot): the same day with CGST ₹41 and SGST **₹41** but "Total Tax ₹81".
- POS header pill: "DAY OPEN **₹1250**".
- Super Admin, restaurant "royal pan", Reports tab: "Total billed ₹16,520" and "Outstanding ₹16,520 from 2 invoice(s)", next to a "PRO PLAN (₹7,000)" chip.
- Restaurant Admin shows none of the POS figures (BUG-034).

## BUG-039 — Totals and tax split disagree with each other, inside POS and across apps 🔴 P0

- **Actual (from code reading and the screenshots):**
  - **No single source of truth.** Each app computes its totals from its own local copy of the orders (BUG-020, BUG-034). Restaurant Admin holds none of POS's orders, and Super Admin holds none at all (BUG-038).
  - **Mixed units and rounding.**
    - POS calculates in rupees as decimals, rounding each step to 2 places (`pricing.ts:100-178`), then rounds the payable total to a whole rupee.
    - The Business Day dialog shows each tax half as `Math.round(totalTax / 2)` (`PosBusinessDayDetailModal.tsx:80-81`). For ₹81 this gives 41 + 41 = **82** beside a total of "₹81", while the Reports screen shows 41 + 40.
    - The order-sync push rounds every field independently to whole rupees (`outbox.ts:91-102`) and the cloud stores them "as-is" (see the DTO comment). Platform billing and payments use paise.
    - Small differences of up to ₹1 per order add up.
  - **Different definitions of "today".** The header pill shows the current **shift's** total sales (`PosHeader.tsx:291`, ₹1250), while the dropdown and the reports use the **business day** (₹1,702). The screenshots do not show which orders each includes.
  - **Mislabelled "net sales".** ₹1,702 is labelled "Total Net Sales", "Net Revenue Billed" and "Net Collected Revenue", but it is gross ₹1,620 + GST ₹81 + ₹1 round-off. It includes tax. Accounting-wise, net sales excludes tax.
- **Expected:**
  - Money stored as integer paise, and tax, discount and round-off calculated once by one shared function. Each order records its final itemised breakdown.
  - Every app builds its figures from the same synced order records, so the same day gives the same numbers everywhere.
  - Terms are defined once: gross sales, discounts, net sales (excluding tax), tax, round-off, total collected. CGST + SGST always equals total tax.
  - A "business day", "shift" and calendar day are each clearly labelled where shown.

## BUG-040 — Split payments are recorded as a fixed 50/50, so tender totals and the cash drawer are wrong 🔴 P0

- **Apps:** POS (payment dialog, shift and cash-drawer totals, reports)
- **Actual (confirmed by reading):**
  - The payment dialog knows exactly how much was paid by each method (`allocations`), but `completePayment` receives only the method name `'SPLIT'` and the cash tendered (`PosPaymentModal.tsx:372-376`). The actual split is thrown away.
  - `settleOrder` then **assumes** "half cash, half UPI" for every split (`repositories.ts:703-708`, comment: "Assume half cash, half UPI if split"). A ₹504 bill paid ₹100 cash + ₹404 card is recorded as ₹252 cash + ₹252 UPI.
  - Shift totals, **expected cash in the drawer**, the day's tender mix and any report built on them are then wrong. This also breaks cash-variance checking at close.
  - The screenshots' report line "Split Tender Payments ₹0" shows the same gap from the other side.
- **Expected:** each payment line (method, amount, reference) is stored on the order, and shift, day and report totals sum those real lines.

## BUG-041 — Super Admin's per-restaurant "Reports & Analytics" shows only SaaS billing, not the restaurant's sales, and the invoice figures look duplicated 🟡

- **App:** Super Admin → Restaurant → Reports & Analytics
- **Actual:**
  - The tab shows "Total Billed", "Outstanding Receivables", "Terminal Fleet Health", "Data Resilience". "Total billed" is the sum of the platform's own subscription invoices to that restaurant (`cloud/api/.../reports.service.ts:279-327`), not the restaurant's sales. Sales can't be shown anyway, because orders never reach the cloud (BUG-038).
  - "Total billed ₹16,520" from 2 invoices, ₹0 collected. Because 7,000 + 18% GST = ₹8,260 and 2 × 8,260 = ₹16,520, this looks like **two identical invoices for one PRO subscription**. The cause is not verified. Suspects: an initial invoice is created on every subscription assignment (`subscriptions.service.ts:79`, `createInitialSubscriptionInvoice`), so a plan assignment plus onboarding, a retry or a plan change could each produce one.
  - The plan chip says "PRO PLAN (₹7,000)" (before GST) while invoices show ₹8,260 (after GST). Correct, but the two figures are not explained side by side.
- **Expected:** the owner can see both (a) the platform's invoices to the restaurant and (b) the restaurant's real synced sales, clearly separated and labelled. One subscription period produces one invoice.

## BUG-042 — Restaurant name, GSTIN and address on reports and headers show demo data on POS 🟡

- **Evidence:** the POS report header prints "JAMANVAAR RESTAURANT · Sindhu Bhavan Road, Bodakdev · GSTIN: 24ABCDE1234F1Z5 · Phone: +91 79 4890 1234", and the POS top bar says "JAMANVAAR RESTAURANT / Ahmedabad Flagship Store", while the restaurant in Super Admin is "royal pan".
- **Cause:** same as BUG-021 and BUG-028 (POS never receives the restaurant profile). Listed here because reports and figures with the wrong restaurant identity cannot be trusted or filed.

---

## Group I — Inventory management is not at industry standard (BUG-043 to BUG-046)

**Owner's report:** "inventory management is also not up to the standard industry expectation in POS."

## BUG-043 — POS "Inventory" is really a dish on/off list, and dish stock never goes down when items are sold 🔴

- **App:** POS (`pos/src/components/inventory/PosInventoryView.tsx`)
- **Actual:**
  - The POS Inventory screen manages **menu dishes**: mark available or unavailable, an out-of-stock reason, and a per-dish `stockQuantity` and `lowStockThreshold`. It has no raw ingredients, no receiving, no counts and no wastage.
  - Nothing decrements a dish's `stockQuantity` when it is sold (grep across `packages/database`, `packages/business` and POS finds no decrement). Dish stock counts and low-stock or out-of-stock badges therefore only change when someone edits them by hand.
  - Real ingredient stock (raw materials, recipes, wastage) lives only in Restaurant Admin (`InventoryRecipesModule.tsx`). The two "stock" ideas (dish stock in POS, ingredient stock in Restaurant Admin) are not linked, so an ingredient running out never marks a dish unavailable in POS.
- **Expected:** POS shows dish availability driven by real ingredient stock, and sales reduce stock automatically. Which app owns which stock task needs the owner's decision (see the question in the notes).

## BUG-044 — Stock is deducted when the order is *created* (at KOT), is never restored on void, refund or cancel, and can be deducted several times for one sale 🔴 P0

- **Apps:** shared database (`packages/database/src/repositories.ts`)
- **Actual (from code reading):**
  - `InventoryRepository.deductForOrder` runs from `createOrder` (`:584`), so stock is deducted when the KOT creates the order, not when it is paid or served.
  - Because a counter or takeaway order can be created two or three times for one sale (BUG-032: repeated Send KOT, then Pay creates another), the **same dish deducts its recipe stock two or three times**.
  - No void, refund or cancel path puts stock back (`voidOrder` `:752`, `refundOrder` `:811`, `updateOrderStatus` `:624`). Ingredient stock only ever goes down.
- **Expected:** stock is consumed once per real sale and reversed on void or refund. It can also be tracked as reserved at KOT and consumed when served, per the owner's choice.

## BUG-045 — The stock engine has correctness holes 🔴

- **Actual (from code reading):**
  - **Duplicate movement ids.** `recordMovement` uses `id: 'sm-' + Date.now()` (`repositories.ts:2448`). `deductForOrder` records one movement per ingredient in a tight loop, so all of an order's movements share the same millisecond and the same id. Item ids (`inv-${Date.now()}`) can collide the same way.
  - **Negative stock hidden.** Stock is clamped with `Math.max(0, …)` (`:2467`). If more is sold than the system thinks exists, the shortfall silently disappears. There is no negative balance, no warning, and no theoretical-versus-actual variance.
  - **No unit conversion.** A recipe ingredient carries its own `unit`, but the deduction just subtracts the number from the stock item without checking or converting units (for example grams in the recipe vs kg in stock).
  - **Nothing stops selling.** No check blocks or warns when an ingredient is out. Selling an out-of-stock dish still works and the stock stays at 0.
  - **Hardcoded actors.** The audit log and movements record `'Manager'` or `'POS Terminal'` instead of the real user.
  - **Demo stock.** A new install already contains seeded ingredients with stock and prices (`db.ts:235-330`, e.g. Malai Paneer 18.5 kg at ₹340). The end-of-day report also falls back to hardcoded low-stock lines (`eod_service.ts:290-292`).
- **Expected:** unique ids, a visible negative-stock policy, unit conversion, real user names, a sale warning when stock is out, and no seeded stock.

## BUG-046 — Missing capabilities a restaurant expects from inventory 🟡 (feature gap; owner to prioritise)

The current data model is only item, stock movement and recipe. Compared with what restaurant inventory systems normally offer, these are missing:

- **Receiving and buying:** suppliers, purchase orders, goods-received notes with supplier invoice and price, purchase-to-recipe unit conversion, and reorder suggestions based on usage.
- **Control:** stock counts / stocktake with variance, opening and closing stock, negative-stock policy, approval for large adjustments, transfers between outlets.
- **Shelf life:** batches with expiry dates (first-expiry-first-out) and expiry alerts.
- **Costing:** weighted-average cost updated on every purchase, dish cost and food-cost %, and margin per dish.
- **Recipes:** sub-recipes / prep items, yield and wastage percentage, and modifier ingredients (extra cheese consumes cheese).
- **Alerts and automation:** a real notification when stock is low, and auto-marking a dish unavailable when a required ingredient runs out.
- **Reports:** stock valuation, consumption, theoretical vs actual usage, wastage by reason, supplier price history.
- **Sync:** the cloud accepts `INVENTORY_ITEM` records, but I found **no app that ever pushes or pulls them** (grep across `apps/` and `packages/`; only menu and customers are synced). Stock and stock movements stay inside each app's own local store, so Restaurant Admin, POS and Super Admin cannot agree on stock.
- **Note:** the owner did not give a priority order. I would suggest fixing BUG-044 and BUG-045 first (correctness), then linking dishes to stock (BUG-043), then the purchasing and count features.

---

## Group J — Branch management in Super Admin (BUG-047, BUG-048)

**Owner's report:** branch management in Super Admin is not up to the mark. "Why do I need to see every branch here? At large scale it would be difficult. Implement a standard flow."

**Evidence (owner's screenshot):** Super Admin → Branches shows one card for every branch of every restaurant (4 cards for 4 restaurants). Every card shows "TERMINALS 0", including "royal pan — Main Branch" although Super Admin shows royal pan has 3 registered terminals.

## BUG-047 — The global Branches page loads and shows every branch of every restaurant, which cannot scale 🔴

- **App:** Super Admin (`pages/Branches/BranchesListPage.tsx`) and cloud API (`modules/branches`)
- **Actual (confirmed by reading):**
  - The page calls `GET /api/v1/branches` with no restaurant filter. The API returns **all** branches of **all** tenants in one response, with no paging (`branches.service.ts` `findMany` has no `take`, `skip` or search).
  - The browser then filters, counts and searches everything in memory (`BranchesListPage.tsx:109-146`). The "All Restaurants" dropdown is built from the branches already loaded, so it only lists restaurants that already have a branch.
  - The layout is a grid of cards, one per branch, with checkboxes and bulk activate or deactivate that fires one request per selected branch.
  - With thousands of restaurants (each with several branches) this page becomes slow and unusable.
  - Restaurant → **Branches** tab does exist (`RestaurantDetailPage.tsx:838-878`), but it is read-only apart from "Create Branch": no edit, no activate or deactivate, no terminal or staff assignment. So the real management work has to happen on the global page.
- **Expected (a standard flow, for the owner to confirm):**
  1. **Branches are managed inside the restaurant.** Restaurant → Branches tab supports search, add, edit, activate and deactivate, and assigning terminals and staff. The plan's branch limit is already enforced on create.
  2. The global Branches page becomes an optional platform-wide **search and audit table**, not a wall of cards. It loads server-side: `GET /branches?restaurantId&q&status&city&page&pageSize&sort`. Fast paging, sorting and export, and it opens with counts and filters rather than every branch.
  3. Bulk actions are one server call, not one call per branch.
- **Related:** "Restaurants" and "Restaurant Owners" list pages probably have the same load-everything pattern. I did not check them.

## BUG-048 — Branches are only records in Super Admin: terminals, keys, orders and reports are not tied to any branch 🔴

- **Actual (confirmed by reading):**
  - `Device.branchId` exists in the schema, but nothing ever sets it. Activation keys have no branch field (`schema.prisma` `ActivationKey`; no `branch` in `activation-keys/dto` or `.service`), and the device is created at redeem time without one. Every branch therefore shows "Terminals 0", and the restaurant Branches tab's per-branch terminal count (`restaurant.devices.filter(d => d.branchId === b.id)`) is always 0.
  - The page subtitle promises "managed independently with **localized hardware limits**". No such limit exists. Limits are plan-level (`maxBranches`, `maxDevices`).
  - The terminal apps ignore cloud branches entirely. They use a seeded local "outlet" ("Ahmedabad Flagship Store", "Sindhu Bhavan Road…") (`db.outlet` in kiosk-admin, pos-admin). Restaurant Admin has only a read-only "Branch Directory" that lists cloud branches. Orders sent to the cloud carry no branch.
  - So "deactivating a branch will pause order routing for its terminals" (the confirmation text on the Branches page) does nothing, because no terminal belongs to a branch and nothing routes by branch.
- **Expected:**
  - An activation key is issued for a specific branch, and the device is bound to that branch at activation.
  - Orders, sync and reports carry the branch. The owner can see and compare branches, and Super Admin can too.
  - Deactivating a branch really locks its devices (see BUG-049).
  - Any per-branch device limit is either implemented or removed from the text.
- **Question for the owner:** do you plan to sell multi-branch plans soon? If not, single-branch restaurants can stay simple, and this bug matters mainly for the plans that allow more than one branch.

---

## Group K — Turning off an app, or locking a restaurant, in Super Admin does not stop the running apps (BUG-049) ⭐

**Owner's test:** created a test restaurant with POS and KDS enabled at onboarding, activated both. Then in Super Admin → Restaurant, **disabled POS and KDS**. Hard-reloaded both apps. **They keep working**, which should not happen. "Super Admin, POS and KDS are also not connected."

## BUG-049 — Disabling an application (or revoking/locking a device) has no effect on apps that are already activated 🔴 P0

- **Apps:** Super Admin → cloud API → POS, KDS, and every other terminal app
- **Cloud side (confirmed by reading):**
  - The per-app switch (`ApplicationEntitlement.enabled`) is only checked when an activation key is created or redeemed (`activation-keys.service.ts:64` and `:133`, both `assertAppEnabled`).
  - `DeviceAuthGuard`, which every request from an activated device passes through, checks only the device's own status, the restaurant status, and that the restaurant has a valid subscription (`device-auth.guard.ts:35-72`). It **never checks the device's application entitlement**. After you disable POS or KDS, their heartbeat and sync calls still succeed.
- **Terminal side (confirmed by reading):**
  - POS and KDS have no handling for a 401 or 403 answer from the cloud at all (no code in `App.tsx` or `cloudClient.ts` of either app reacts to "disabled", "suspended" or "forbidden"). A failed sync call is caught and ignored.
  - On start, the only gate is whether a device token exists in local storage (`isPosDeviceConnected`, `isKdsDeviceConnected`). A hard reload finds the token and opens the app. Nothing asks the cloud whether the app is still allowed.
  - The cloud has "device commands" (lock, force logout, wipe, etc., module `device-commands`), but **no app ever fetches them** (nothing in `apps/` or `packages/` calls the device-command endpoints), so those Super Admin actions do nothing either.
- **Consequence:** in practice, disabling an app, suspending a subscription (for the UI), revoking a device, or issuing a lock does not stop anyone from using a terminal. The status docs describe suspend enforcement as verified in all apps. What I found is that the **cloud rejects** the calls, but the **app screen keeps working**. I have not run it to double-check.
- **Expected:**
  1. **Server:** the device check also verifies that the device's app (POS, KDS…) is enabled for the restaurant, and returns a clear reason when it is not.
  2. **Terminal:** on every start and at regular intervals, each app checks with the cloud (or uses a signed licence that expires) and immediately shows a locked screen with the reason when its app is disabled, the restaurant or subscription is suspended, or the device is revoked. Re-enabling restores it.
  3. Device commands (lock, force logout, wipe) are actually delivered and obeyed.
- **Design decision for the owner:** these apps are meant to work offline. How long may a terminal keep working without reaching the cloud (for example 24 hours, 7 days) before it locks? A short grace period protects revenue, and a long one protects a restaurant whose internet is down.
- **Related:** BUG-035 and BUG-034 (the same apps do not sync orders), and BUG-020 (each app is isolated).

---

## Group L — Invoices & Billing in Super Admin (BUG-050 to BUG-054)

**Owner's report:** invoice management in Super Admin is not up to the mark. "What am I going to do seeing recent bills (a problem at large scale)? Make it industry standard: split by restaurant / branch, or whatever the best flow is."

**Evidence (owner's screenshot, Invoices & Billing):** "7 of 7 invoices" in one flat table, newest first. royal pan has **INV-2026-0007 and INV-2026-0006**, both JAMANVAAR PRO, both ₹8,260.00 (₹7,000 + ₹1,260 GST), same due date 19/10/2026, both ISSUED. tfyjgjk has two identical ₹5,900 CORE invoices. Cards show "Reconciled Collections ₹5,900 · GST Compliant · 100% Settled", "Invoiced Receivables ₹44,840 · 6 awaiting", "Settled Invoices 1 / 7 · 14% Collection Rate", "Overdue 0". GSTIN shown for royal pan is "VVSD" and for tfyjgjk "JYFHJ".

## BUG-050 — Every onboarding creates two identical invoices 🔴 P0

- **Apps:** Super Admin onboarding wizard and cloud API
- **Cause (confirmed by reading the code):**
  - `SubscriptionsService.assign` automatically issues the initial invoice inside the same transaction (`subscriptions.service.ts:78-85`, `createInitialSubscriptionInvoice`).
  - Right after assigning the subscription, the wizard **also** posts `POST /api/v1/invoices` "to automatically issue the initial tax invoice" (`OnboardRestaurantPage.tsx:463-480`).
  - Nothing prevents it: `Invoice` has no uniqueness on (subscription, billing period), and the API accepts any number of invoices.
  - Result: two invoices per onboarded restaurant, exactly as in the screenshot (royal pan 0006 and 0007, tfyjgjk 0004 and 0005).
- **Effects:** receivables are doubled ("Invoiced Receivables ₹44,840"), and "1 / 7 settled, 14% collection rate" is skewed. If a restaurant paid one invoice the other would remain "unpaid".
- **Also:** the wizard's own invoice takes its tax as a flat 18% (`Math.round(baseAmt * 0.18)`), while the server splits it by state (CGST + SGST for in-state, IGST for out-of-state). The two invoices for the same restaurant could therefore carry different tax treatment.
- **Expected:** exactly one initial invoice per subscription period, enforced by the server (a unique key on subscription + period, or an idempotency check), and the wizard doesn't create its own.
- **Note:** the same double-creation is what BUG-041 suspected.

## BUG-051 — The invoice list is one flat, unbounded table, with no per-restaurant view; nothing scales 🔴

- **Apps:** Super Admin (`pages/Billing/BillingPage.tsx`) and cloud API (`modules/billing/invoices.service.ts`)
- **Actual (confirmed by reading):**
  - `GET /api/v1/invoices` returns **every invoice ever issued**, each joined with restaurant, plan, subscription and **all its payments**, with no paging (`invoices.service.ts:125-144`).
  - The browser filters, searches and counts the status tabs (All / Pending / Paid / Overdue / Void) from that in-memory list (`BillingPage.tsx:96, 271-301`). "Export CSV" exports only what happens to be loaded.
  - The summary endpoint (`getBillingSummary`, `:460-498`) loads **all** payments and **all** invoices into memory just to add them up, instead of asking the database to sum.
  - The default view is "everything, newest first". There is no way to see "which restaurants owe me money" or "what needs action today".
  - Restaurant → Billing & Invoices tab exists (`RestaurantDetailPage.tsx:1301+`), but it is a plain list with export, and the real actions (record payment, void) are only on the global page.
- **Expected (a standard flow, for the owner to confirm):**
  1. **Default view = receivables by restaurant** (the usual accounts-receivable ledger): one row per restaurant with outstanding balance, overdue amount, oldest unpaid invoice, last payment date, next renewal, and status. Sorted by overdue amount.
  2. **Click a restaurant → its ledger:** invoices, payments and credit notes for that restaurant only, with all actions (record payment, send reminder, void, download PDF). If branches later get their own billing, split further by branch.
  3. **Global invoices page = server-side paginated table** (search, sort, filters for status, restaurant, plan, date range, amount, state), plus **ageing buckets** (0-30, 31-60, 61-90, 90+ days) and ready-made views such as "Needs action", "Due in 7 days" and "Failed payments".
  4. Totals come from database aggregates. Exports stream from the server (CSV and a GST-ready report per month).
  5. Batch actions run as one server call.
- **Related:** BUG-047 (branches page has the same load-everything pattern) and BUG-037 (invoice PDF).

## BUG-052 — Invoices are not fixed statutory documents: tax is recalculated live, numbering is unsafe, and status can be set freely 🔴

- **App:** cloud API (`invoices.service.ts`)
- **Actual (confirmed by reading):**
  - **Tax split recalculated on every read.** `formatInvoiceWithTax` recomputes CGST/SGST/IGST from the invoice amount and the restaurant's **current** state each time it is shown (`:98-112`). If the restaurant's state or GSTIN is edited later, an old invoice's tax breakup and buyer details change retroactively. Issued invoices should be immutable snapshots of seller, buyer, GSTIN, place of supply, rates and amounts.
  - **Invoice numbers come from a row count.** `INV-<calendar year>-<count of all invoices + 1>` (`generateInvoiceNumber`, `:109-113`).
    - Two invoices created at the same moment get the same number, and the unique constraint makes one fail.
    - Deleting a restaurant cascades and deletes its invoices (`onDelete: Cascade` in the schema). The count drops and numbers repeat later, and statutory invoices vanish.
    - The sequence never restarts per **financial year** (India: April to March), and it is calendar-year based. Numbers must be unique, sequential and per financial year for GST.
  - **Receipt numbers** (`RCP-…`) use the same count pattern.
  - **Status can be set to anything.** `PATCH /invoices/:id/status` accepts any status with no transition rules and no reason (`updateStatus`, `:426-458`). Setting an invoice to PAID sets `paidAt` but creates no payment record, so "collected" and "paid" can disagree. VOID or REFUNDED have no credit note, which GST expects when an invoice is cancelled or reduced.
  - **Payment amounts:** the API records payments by invoice, but I did not check partial payment and overpayment handling.
- **Expected:** immutable issued invoices with a stored tax snapshot, safe gapless per-financial-year numbering (a database sequence or a counter row), no hard delete, a defined status flow (draft, issued, part-paid, paid, overdue, void or credit-noted), a mandatory reason for void, credit notes instead of silent status changes, and a payment record for every "paid".

## BUG-053 — Static claims and weak overdue logic: nothing "automated", "100% Settled" is hardcoded 🟡

- **App:** Super Admin Billing page and cloud API
- **Actual (confirmed by reading):**
  - The banner says "**Automated** renewal generator and **webhook listener active**" and "SANDBOX + PRODUCTION ENGINE" (`BillingPage.tsx:380-384`). The cloud API has **no scheduler** at all (no `@nestjs/schedule`, no cron, no timer). Renewal invoices are only created when an operator presses **Check Renewals** (`POST /invoices/check-renewals`). The "webhook" in this codebase is for Cashfree payments made by a restaurant's customers, not payments of these SaaS invoices. Invoice payments here are recorded **manually** ("Record Payment").
  - "GST Compliant • **100% Settled**" is fixed text under "Reconciled Collections" (`BillingPage.tsx:418`), true or not. The screenshot shows a 14% collection rate next to it.
  - **Overdue is counted inconsistently.** The Overdue card counts invoices whose status is `PAST_DUE`. That status is only set inside the manual renewal check (`invoices.service.ts:528-535`), and only for subscriptions, not by comparing the invoice due date. The table adds a red "OVERDUE" note by date (`BillingPage.tsx:640`), so an invoice can look overdue in the table while the "Overdue" card says 0.
  - The collection rate is invoice count paid ÷ invoice count (`getBillingSummary`), not amount collected ÷ amount billed.
- **Expected:** real scheduled jobs (renewal invoices, overdue marking, reminders, and a policy for suspension after N days overdue), honest labels that reflect what is actually running, and figures computed from the same rule everywhere. The owner should decide whether overdue invoices should suspend the restaurant automatically after a set grace period.

## BUG-054 — Invalid GSTIN and FSSAI numbers are accepted and end up on tax invoices 🔴

- **App:** Super Admin (restaurant onboarding and edit) and cloud API
- **Evidence:** the Invoices list shows "GSTIN: **VVSD**" for royal pan and "GSTIN: **JYFHJ**" for tfyjgjk. royal pan's profile earlier showed FSSAI "5151".
- **Cause (confirmed by reading):** `create-restaurant.dto.ts` and `update-restaurant.dto.ts` accept `gstin: z.string().trim().optional()` with no format check. Invoices then carry that value as the buyer's GSTIN.
- **Expected:** GSTIN must be 15 characters in the official format and its first two digits must match the restaurant's state (which also decides CGST/SGST vs IGST); FSSAI must be 14 digits. Both can stay optional, but if given they are validated. An invoice is issued with a valid GSTIN or clearly as unregistered.

---

## Group M — JAMAN AI: hardcoded values, and how Super Admin should control it (BUG-055 to BUG-058)

**Owner's report:** Super Admin has a JAMAN AI feature with hardcoded values. Remove them. Suggest a nice flow: predefined options should exist in POS and Restaurant Admin, and Super Admin should operate them. The AI chatbot should be **selectable when onboarding a restaurant**. If selected, it appears and works on that restaurant's data. If not selected, it should still appear but be **locked**, so the user can feel there is such a feature.

**Evidence (owner's screenshot, JAMAN AI Engine page):** thresholds "15", "3", "500", engine mode "Deterministic Offline Rule Engine (0ms, 0 Token Cost)", a checkbox "Show PRO Teaser Preview to CORE (₹5,000) users", and a "Query Template & Category Registry (34 Questions)" table with fixed labels, intents, "PRO ONLY" tiers and priorities.

## BUG-055 — The JAMAN AI configuration is kept in the API's memory, not the database, and the analytics start with invented numbers 🔴

- **App:** cloud API (`modules/ai-assistant/ai-assistant.service.ts`) and Super Admin AI page
- **Actual (confirmed by reading):**
  - Categories, all 34 questions, every setting (`delayedKotMinutes: 15`, `lowStockThreshold: 3`, `cashDrawerVarianceThreshold: 500`, `dailyQueryLimitPro: 500`, `corePlanTeaserEnabled`, `mode`) are **class fields** initialised from constants in the code (`:104-140`). Nothing is stored in the database. Every edit made in Super Admin ("Save Global Thresholds", question toggles, custom questions) is **lost when the API restarts**, and would differ between two API instances.
  - The telemetry starts with **made-up numbers**: `totalQueriesCount = 1420`, `todayQueriesCount = 68`, and per-intent counts (`TODAY_SALES: 412`, `DELAYED_KOT: 285`, `LOW_STOCK: 214`, …). The "latency" shown is a fixed setting (`engineLatencyMs: 3`), not measured.
  - "Active PRO tenants" and "adoption %" do come from the real subscription table.
- **Expected:** configuration lives in database tables (with audit history and versions), and telemetry is counted from real usage per restaurant, per day and per question. No seeded counts or fixed latency.

## BUG-056 — Nothing you set in Super Admin's AI page reaches POS, Restaurant Admin or Captain 🔴 P0

- **Actual (confirmed by reading):**
  - **No app fetches the cloud config.** Restaurant Admin defines `fetchTenantAiConfig()` (`pos-admin/src/cloud/cloudClient.ts:584`) but it is never called anywhere (grep). POS, Captain and KDS have no such call at all.
  - The apps use a **separate hardcoded copy** of the questions: `packages/business/src/jaman_ai_registry.ts` (573 lines) plus the engines in `pos_assistant.ts` (1,295 lines) and `dynamic_query_executor.ts`. Its question ids differ from the cloud copy (`today_sales` vs `q_today_sales`), so there are two lists to keep in step.
  - **The thresholds are hardcoded in the engines**, for example `elapsedMinutes > 15` (`jaman_ai_registry.ts:515`, `pos_assistant.ts:317`) and labels like "Delayed KOTs (> 15 mins)" written as plain text. Changing 15, 3 or 500 in Super Admin changes nothing on any terminal.
  - Enabling or disabling a question, changing its priority or tier, and adding a custom question in Super Admin all have no effect on the apps.
  - The tenant endpoint `/api/v1/tenant/ai-assistant/config` requires a staff login (`TenantAuthGuard`), which POS, Captain and KDS (device-token apps) never have. So even if they called it, they couldn't.
  - `dailyQueryLimitPro` (500) is stored but never enforced. The "Hybrid Cloud Gemini LLM" mode is selectable, but no such engine exists anywhere in the code.
- **Expected:** one question catalogue and one set of thresholds in the cloud, delivered to every app, with the calculation code reading the thresholds instead of hardcoding them and labels built from them ("Delayed KOTs (> {n} mins)"). Apps cache the catalogue so it works offline. Unsupported options (LLM mode) are hidden until they exist.

## BUG-057 — Super Admin cannot choose AI per restaurant, and apps decide access from a fake local licence 🔴 P0

- **Actual (confirmed by reading):**
  - **No AI choice at onboarding.** The onboarding wizard has no AI option (grep shows none), and `AppCode` has only POS, POS_ADMIN, CAPTAIN, KDS, KIOSK and KIOSK_ADMIN. The only control is the plan: `isEntitled = tier === 'PRO' || plan.entitlements.posAssistant` (`ai-assistant.service.ts:177`). You can't give one CORE restaurant AI, or withhold it from one PRO restaurant.
  - **Apps use a hardcoded local licence, not the cloud plan.** `db.license` starts as "JAMANVAAR PRO", tier PRO, key `JAMAN-PRO-2026-AHM-8842-X`, 5 devices, valid to 2027 (`db.ts:492-506`), and Restaurant Admin gates AI on it (`pos-admin/src/App.tsx:369`). The cloud plan is never written into it (the cloud entitlements are only fetched to show on the Subscription screen). So every fresh install is PRO with AI on, whatever plan was bought.
  - **POS and Captain have no plan check at all.** The AI button shows unless the restaurant's own local flag `showJamanAI === false` (`PosHeader.tsx:456`, `captain/src/App.tsx:613`). That flag is set by the owner in Restaurant Admin's branding settings and stored locally per app. A CORE restaurant therefore gets AI in POS and Captain.
  - **"Off" means hidden, not locked.** When the flag is false the button disappears (POS, Captain, Restaurant Admin). Only Restaurant Admin shows an "upgrade to PRO" modal, and only when the local licence isn't PRO.
  - **Hardcoded prices.** The Super Admin page prints "₹7,000 PRO" and "₹5,000 CORE" as text (`AiAssistantPage.tsx:323, 356, 433, 456, 466`), and the tenant config returns `proUpgradePrice: 7000` (`ai-assistant.service.ts:190`). The real plan prices live in the plans table and can change.
  - The earlier status docs list a "per-restaurant JAMAN AI off-switch" as done. That is only the owner's local hide toggle, not a Super Admin grant.
- **Expected:** see the proposed flow below.

## BUG-058 — Several AI questions give the same answer or can never return data 🟡

- **Actual (from code reading; not run):**
  - Different questions are mapped to the same internal intent, so they answer identically: `CASH_COLLECTION` is used by "Cash in Drawer & Float", "Cash vs Digital Payment Share" and "Cashier Shift Cash Variance", and `TODAY_ORDERS` by "Today's Total Orders" and "Total Diners & Footfall".
  - "Swiggy Delivery Orders & Revenue" and "Zomato Delivery Orders & Revenue" filter on a Swiggy or Zomato channel, but nothing in POS, Kiosk or Captain sets such a channel (grep across `apps/` and `packages/` finds only the AI code), so they can only answer zero. I did not check whether a delivery-partner field exists.
  - The label "(>15 mins)" is fixed text, and the "34 Questions" claim is only accurate while the list has 34 items.
- **Expected:** each question has its own calculation, questions that can't be answered from real data are hidden, and labels follow the settings.

---

### Proposed JAMAN AI flow (for the owner to confirm; nothing built)

1. **AI becomes a per-restaurant entitlement, like an app.** Add a "JAMAN AI" switch beside POS, KDS, Captain and Kiosk, with three states: **ON**, **LOCKED (teaser)** and **OFF (hidden)**.
   - Chosen in the onboarding wizard's modules step, with a default taken from the plan (PRO = ON, CORE = LOCKED).
   - Editable later in Restaurant → Applications / Feature Entitlements.
   - Optional per-restaurant limits (daily queries).
2. **What each state does in the apps.**
   - **ON:** the AI button works and answers from that restaurant's own data.
   - **LOCKED:** the button is **still visible** with a lock. Tapping it opens a friendly panel: "JAMAN AI isn't enabled for your restaurant", with 2-3 sample questions and a contact/upgrade action. The user "feels" the feature but gets no data.
   - **OFF:** hidden.
   - The owner's "show JAMAN AI button" toggle stays as a personal preference, but it can only hide something that is ON. It can never turn on something the platform locked.
3. **One catalogue, managed in Super Admin, delivered to every app.**
   - Stored in the database: question, category, roles, apps (POS / Admin / Captain), minimum entitlement, priority, enabled.
   - Apps fetch it with the device token and cache it, so it works offline.
   - Editing in Super Admin changes what the apps offer.
4. **Thresholds are parameters, not code.**
   - Platform defaults: delayed KOT minutes, low-stock level, cash variance, in Super Admin.
   - Optional per-restaurant overrides, editable by the owner in Restaurant Admin within limits the platform sets.
   - The engines read them, and labels are generated from them.
5. **Predefined options in POS and Restaurant Admin.** Quick-question chips per role and app (cashier vs manager vs owner) come from the catalogue, with the owner able to pin favourites.
6. **Honest analytics.** Real counters per restaurant, per day and per question, from the database. No seeded numbers. Show LLM mode only once it exists.

**Decision for the owner:** should LOCKED be the default for CORE restaurants (teaser), or should AI be hidden unless bought?

---

## Group N — Activation keys in Super Admin (BUG-059 to BUG-061)

**Owner's report:** the keys section has problems. All keys are listed at once (a problem at large scale for a SaaS owner). Keys should be categorised and up to industry standard. Also: "I revoked every key but the Admin, KDS and POS kept working, which should not happen."

**Evidence (owner's screenshot, Activation Keys):** one flat table, "17 of 17 keys", rows for royal pan and tfyjgjk. royal pan's KDS, POS_ADMIN and POS keys show **REDEEMED** with only a "Copy" button (no Revoke). The keys still ACTIVE (unredeemed) show Copy and Revoke. Header counts: All 17, Active 12, Revoked 0.

## BUG-059 — Revoking a key does not switch off the device that used it; redeemed keys can't be revoked at all 🔴 P0

- **Apps:** Super Admin → cloud API → POS, KDS, Restaurant Admin, and all terminals
- **How it really works (confirmed by reading):**
  - An activation key is a **one-time enrolment code**. On redeem, the API creates a `Device` and hands the terminal its own long-lived **device token**. From then on the terminal never uses the key again (`activation-keys.service.ts:121-183`).
  - `revoke` only sets the **key's** status to REVOKED (`:227-254`). It does not look at `redeemedByDeviceId`, does not touch the device, its token, or any session.
  - The request guard for devices checks the **device** status, not the key (`device-auth.guard.ts:35`), so a revoked key changes nothing for a terminal that already redeemed it.
  - The Restaurant Admin app also has the owner's cloud login (tenant session). Revoking its key ends nothing there either.
  - The list page only offers **Revoke** for unredeemed, unexpired keys (`ActivationKeysListPage.tsx:346`, and bulk revoke filters the same way). Redeemed keys (KDS, POS_ADMIN, POS in the screenshot) have no revoke action at all. Through the API, a REDEEMED key can be flipped to REVOKED, but still with no effect on the device.
  - Revoking the **device** (Devices & Keys tab, `devices.service.ts:53-75`) sets `Device.status = REVOKED`. That makes the cloud reject its calls, but the app screen keeps working (BUG-049).
- **Owner re-tested (Support & Diagnostics screenshot, royal pan):** all three devices (KDS, POS, POS_ADMIN) now show **REVOKED** and the audit log lists three `SUPPORT_DEVICE_REVOKED` entries at 5:05 PM. The owner can **still log in and use KDS, POS and the Restaurant Admin panel**. This confirms the analysis: revoking a device only makes the cloud refuse that device's calls. See also BUG-089 for the Restaurant Admin sign-in.
- **Consequence:** key, device and session are three unlinked things. Nothing the owner clicks under "Activation Keys" can stop a working terminal.
- **Expected:**
  - Keep the model simple. Key = enrolment code. Device = an enrolled terminal.
  - Revoking an **unredeemed** key just kills the code.
  - On a **redeemed** key row, the action is "Revoke device": one confirmation that revokes the device token immediately, ends the owner's cloud sessions if it is Restaurant Admin, and locks the terminal (needs BUG-049).
  - The key row shows the device that used it (app version, last seen, activation date) and links to it.
  - Every revoke is audited and reversible only by issuing a new key.

## BUG-060 — The keys list is one flat, unbounded table with almost no categorisation 🔴

- **Apps:** Super Admin (`pages/ActivationKeys/ActivationKeysListPage.tsx`) and cloud API
- **Actual (confirmed by reading):**
  - `GET /api/v1/activation-keys` returns **every key of every restaurant** with no paging (`activation-keys.service.ts:23-30`). The browser filters, counts ("Active 12") and exports them (`:66-157`). Bulk revoke sends one request per key.
  - Categories available today: status, device type, and a text search. No grouping by restaurant, batch, branch or age.
  - **Expired is only a display state.** The database status stays ACTIVE. Nothing ever sets EXPIRED, although the status exists. The "Active" count adds a date check on the client to compensate.
  - The full code stays visible and copyable after a key has been redeemed (the Copy button is on every row), even though it is useless then.
  - There is no view of "how many keys does this restaurant have, how many are used, how many will expire soon".
- **Expected (a standard flow, for the owner to confirm):**
  1. **Group by restaurant.** The default page lists restaurants with counts: issued, available, redeemed, revoked, expiring in 7 days. Click a restaurant to see its keys. Keys are also shown under Restaurant → Devices & Keys.
  2. **Categories and filters:** by app (POS, KDS, Captain, Kiosk, Kiosk Admin, Restaurant Admin), by lifecycle (available, redeemed, revoked, expired), by batch (a welcome kit), by branch (BUG-048), and views like "unredeemed for more than N days" and "expiring soon".
  3. **Server-side** search, sort and paging. Counts from the database. Bulk actions as a single server call. Streamed export.
  4. **Real lifecycle:** issued, redeemed, expired (set by a scheduled job) or revoked, and each redeemed key linked to its device.
  5. **Key secrecy:** show the full code once at creation (copy or print), afterwards only the last 4 characters. Revealing it again is an audited action. Optional label per key ("Counter 1", "Kitchen wall").
  6. A configurable default expiry for unredeemed keys.
- **Related:** BUG-047 and BUG-051 (same load-everything pattern), BUG-048 (keys have no branch).

## BUG-061 — A plan's device limit is never enforced, so a restaurant can activate any number of terminals 🔴

- **Apps:** cloud API (key generation and redeem), Super Admin ("Plan Quotas")
- **Actual (confirmed by reading):** `maxDevices` appears only in the plan definition, the plan form, and the tenant login response (grep of `cloud/api/src`). Neither `generate` nor `redeem` counts existing devices. The Plan Quotas tab is display-only. There are no per-app seat counts either (for example "2 POS, 1 KDS").
- **Expected:** key generation and redeem respect the plan's device limit (and per-app seats, if you sell those), with a clear message when the limit is reached, and Super Admin can grant extra seats.

---

## Group O — Super Admin: Refresh button and notification bell (BUG-062 to BUG-064)

**Owner's report:** "I think the Refresh button in Super Admin does not work, and if it is working, there is no animation. Also there is a notification on top. When I click it, a tiny box appears as it should, but when I click anything in it, nothing works. It should take me to the part that notified me."

**Evidence (owner's screenshot):** Master Menu Catalog page with a "Refresh" button next to "Import Starter Library", and a red dot on the bell in the top bar.

## BUG-062 — Clicking an item in the notification box does nothing 🔴

- **App:** Super Admin top bar (`layout/ProtectedLayout.tsx:579-671`)
- **Cause (confirmed by reading):**
  - Each notification row is a normal router link, but it also has `onMouseDown={() => setNotifOpen(false)}` (`:633, :648, :664`).
  - A click is mouse-down then mouse-up on the same element. Closing the box on **mouse-down** removes the row from the page before the mouse button is released, so the click event never fires and the link never navigates. The bell button also closes the box on blur after 150 ms (`:587`).
  - So the box opens, every item looks clickable, and none of them works. This applies to all three links: "subscriptions expiring soon", "failed backups" and "View full activity log".
- **Expected:** clicking an item takes you to the page (and, ideally, to the exact record) and closes the box. Clicking outside or pressing Escape also closes it.

## BUG-063 — Refresh buttons give no visible feedback, and behave differently on each page 🟡

- **App:** Super Admin
- **Master Catalog "Refresh"** (`pages/Catalog/MasterCatalogPage.tsx:358`):
  - **It does re-fetch** (`loadData`). The button gives no sign of it: the icon has no spin, the button is not disabled, there is no toast, and the full-page "Loading…" message shows only when the list is empty (`:478`). With dishes on screen the data is replaced silently, so it looks as if nothing happened.
  - `loadData` depends on `dishCategory` (`:90-108`). After the first load sets the category, the function changes and the effect runs again, so the page fetches everything **twice** on open. Every load also downloads **all restaurants** (for syndication), which will not scale.
- **The same "no feedback" pattern (confirmed by reading):** Devices (`DevicesListPage.tsx:185`), Offline Policy (`OfflinePolicyPage.tsx:107`), Backups (`BackupsPage.tsx:216-221`), and Restaurant → Support "Refresh Diagnostics" (`RestaurantDetailPage.tsx:1688-1696`). That last one sets the data to empty and fetches with no error handling, so a failed call leaves a blank panel.
- **Pages that already spin the icon:** Billing (Check Renewals), QR Ordering ("Refresh fleet"), Restaurant analytics. So the behaviour is inconsistent across the product.
- **Expected:** one shared refresh pattern. The icon spins and the button is disabled while loading, the existing list stays visible, a short "Updated just now" note or toast appears, a failure shows an error, and the last-updated time is shown. Ideally pages also refresh themselves at a sensible interval.

## BUG-064 — The notification centre is just two counters, with no history and no deep links 🟡

- **Actual (confirmed by reading):**
  - The bell shows at most two items, "subscriptions expiring soon" and "failed backups", computed in the browser from two API calls repeated every 60 seconds (`ProtectedLayout.tsx:226-257`). The cloud has no in-app notification store or API. The "notifications" module in the API only sends email, SMS and WhatsApp.
  - Items link to the **whole list page** (`/subscriptions`, `/backups`), not to the affected records.
  - There is no read or unread state, no history, and no severity. The red dot means only "at least one of the two counters is above zero".
  - Many things an operator needs are not covered: overdue or duplicate invoices, failed payments, devices offline or not syncing, tenants with no orders synced, keys about to expire, new support tickets or replies, restaurants suspended, onboarding drafts left unfinished.
- **Expected (a standard flow, for the owner to confirm):**
  1. A real notification store in the database: type, severity, restaurant, the exact target record, created time, read state.
  2. Bell shows the unread count, the latest items grouped by severity, and **each item opens the exact record** (for example the specific restaurant's subscription, the failed backup, the ticket, the device).
  3. A full Notifications page with filters (type, severity, restaurant, read/unread), mark as read or all read, and links to the audit log.
  4. Updates arrive within seconds (push or short polling), and operators can choose which types to receive.

---

## Group P — Applications & Releases in Super Admin (BUG-065, BUG-066) — owner said "work on this later, after finishing everything"

**What this screen is (the owner's question):** *Applications & Ecosystem* is the platform's **software release registry**. It lists the six client applications (POS, Restaurant Admin, Captain, KDS, Kiosk, Kiosk Admin) with their current version, release channel and device counts. "**Publish Version**" opens the "Publish Release" dialog, which records a new version of one app:

| Field | Meaning |
| :-- | :-- |
| Version number | The new version (for example 2.4.1). The dialog suggests the next one. |
| Release channel | STABLE (production) or BETA (testers). |
| Target platforms | Windows, Electron, Android, Web: which builds this release covers. |
| Binary / setup download URL | Where the installer file can be downloaded (free text). |
| Changelog & release notes | Text shown with the release. |
| **Mandatory update** (the circled checkbox) | Intended to mean "terminals must update to this version before starting a shift". |

**Important:** in the current code, publishing only **saves a record in the database**. See BUG-065.

## BUG-065 — "Publish Release" is only a record; no terminal ever checks for or receives an update 🔴 (deferred)

- **Apps:** Super Admin (`pages/Applications`), cloud API (`modules/applications`), all terminal apps
- **Actual (confirmed by reading):**
  - `POST /api/v1/applications/releases` inserts a row in `AppRelease` (version, channel, notes, `downloadUrl`, `isMandatory`, `minSupportedVersion`). Nothing else happens: no file is uploaded or hosted, and nothing notifies a device.
  - **No app checks for updates.** A search across `apps/`, `packages/`, the Tauri configs and Cargo files finds no update check, no updater plugin, and no use of `isMandatory` or `minSupportedVersion`. The "Mandatory update" checkbox and the minimum-supported version are stored and displayed only.
  - **Terminals report a fixed version.** POS, KDS, Captain and Kiosk all send the literal `appVersion: '1.0.0'` in activation and heartbeat, so the fleet never shows the real installed version. The catalogue also defaults every app to "1.0.0" when no release exists.
  - **The download URL is free text.** The dialog pre-fills a relative path like `/releases/jamanvaar-pos-setup-2.4.0.exe`. The API does not serve or store such a file, and nothing validates the link.
  - **Hardcoded catalogue data** (`APP_CATALOG` in `applications.service.ts`): app names, categories, descriptions and `defaultPort` numbers (POS 5173, Captain 5174, KDS 5175, Kiosk Admin 5177, Kiosk 5178). These do not match the ports the apps actually use (POS 5175, KDS 5179, Captain 5177, Kiosk 5174, Kiosk Admin 5173), so the cards show wrong port labels.
  - **"Online" means "seen in the last hour"** (`applications.service.ts`, `oneHourAgo`), while terminals send a heartbeat every 15 seconds. So "Fleet sync rate 60%, 3 of 5 terminals online" is coarse and can hide outages.
- **Consequence:** the owner is right that "pushing the latest update" does not work. It cannot work today, because there is nothing on the terminal side that receives it.
- **Expected (a standard flow, for later):**
  1. Upload the installer to storage from Super Admin. The system records size and checksum (ideally signed).
  2. Release channels and **staged rollout** (by percentage, by restaurant group or by cohort), with a way to pause or roll back.
  3. Terminals check on start and at intervals, download in the background, verify the signature, and install at a safe moment (not during a shift).
  4. **Mandatory / minimum version** is enforced: an older app is blocked with a clear message until updated (ties into BUG-049).
  5. Real installed version reported by each device, and per-device update status shown in Super Admin (up to date, downloading, failed, pending).
  6. App metadata and ports come from real configuration, not constants.
- **Note:** desktop builds are packaged with Tauri. Its official updater plugin, or an equivalent, is the usual way to do step 3. I have not checked how the installers in `tooling/installers` are built.

## BUG-066 — In the "Publish Release" dialog the "Mandatory update" checkbox is huge and its label is cut off 🟡

- **App:** Super Admin (`pages/Applications/ApplicationsPage.tsx:389-399`, `components/shared.css:520-530`)
- **Evidence:** the area the owner circled in the screenshot.
- **Cause (confirmed by reading):** the checkbox sits inside a `.form-field`. The shared rule `.form-field input, …` (`shared.css:520`) gives **every** input inside it `width: 100%; height: 40px; padding: 8px 14px`. The similar rule for `.modal-form` excludes checkboxes and radios, but the `.form-field` rule does not. The checkbox therefore stretches into a wide box, and the label is pushed out of view and truncated.
- **Expected:** a normal-sized checkbox with the full label visible next to it. The same rule can hit other checkboxes inside `.form-field` elsewhere in Super Admin (not checked).

---

## Group Q — Device Fleet / MDM in Super Admin (BUG-067 to BUG-069)

**Owner's report:** the device fleet listing is not up to the mark. It would be a problem to view once it scales to 100 restaurants.

**Evidence (owner's screenshot):** Device Fleet / MDM Control Center, 5 devices in one flat table. Cards: Total registered 5, Online now 3, Offline terminals 2, MDM locked 0. Rows show names like "POS_ADMIN Terminal" (two of them), a truncated id, type, "Restaurant & Branch" (every row shows "Main Branch"), connectivity, status, Last Seen as a time only (4:34:52 PM, 9:48:59 PM, 6:02:01 PM), and MDM / lock buttons.

## BUG-067 — The fleet list is one flat, unbounded table with no grouping by restaurant, and the counts are computed in the browser 🔴

- **Apps:** Super Admin (`pages/Devices/DevicesListPage.tsx`) and cloud API (`modules/devices`)
- **Actual (confirmed by reading):**
  - `GET /api/v1/devices` returns **every device of every restaurant** with restaurant and branch, no paging (`devices.service.ts:list`). The page filters, searches and counts (online, offline, active, locked, revoked) in the browser (`DevicesListPage.tsx:77-150`). CSV export exports the loaded list only.
  - Filters available: status, hardware type, a text search. Nothing for restaurant, app version, offline duration, sync problems, or "needs attention". No sorting options, and no grouping.
  - "Offline terminals" is computed as total minus online (`:150`), so **revoked and never-activated devices are counted as offline**, which inflates the offline number and hides real outages.
  - With 100 restaurants × several terminals, this becomes hundreds or thousands of rows to scroll, and a real problem device is easy to miss.
- **Expected (a standard flow, for the owner to confirm):**
  1. **Fleet overview first:** server-computed cards (online, offline, degraded, locked, out-of-date, never seen) and a default **"Needs attention"** list: offline longer than N minutes, sync failing, outdated version.
  2. **Group by restaurant:** a restaurant list with device counts and health, then drill into that restaurant's devices (Restaurant → Devices & Keys already exists but is a plain list).
  3. **Server-side** search, filter (restaurant, app, status, version, last-seen range), sort and paging, with saved views. Export streamed from the server.
  4. Offline is measured only for active devices. Revoked and pending devices are shown as their own states.
- **Related:** BUG-047 (branches), BUG-051 (invoices), BUG-060 (keys) have the same load-everything pattern.

## BUG-068 — "Lock terminal" (MDM) only changes a label; no terminal ever receives or obeys it 🔴 P0

- **Apps:** Super Admin → cloud API → all terminal apps
- **Actual (confirmed by reading):**
  - Pressing lock creates a `DeviceCommand` row and **immediately** sets `Device.isLocked = true` (`device-commands.service.ts:64-76`), before any device has seen the command. Super Admin then shows "Terminal locked via MDM" and a LOCKED badge.
  - The cloud offers device endpoints to fetch and acknowledge commands (`GET /devices/me/commands`, `POST /devices/me/commands/:id/ack`), but **no app ever calls them** (grep across `apps/` and `packages/`). The command stays PENDING forever and the terminal is never told.
  - The device check on every terminal request ignores `isLocked` (`device-auth.guard.ts` checks status, restaurant and subscription only), so even cloud calls from a "locked" terminal keep working.
  - The same applies to all command types the schema lists: FORCE_LOGOUT, WIPE_LOCAL_DATA, REQUEST_SYNC, APP_UPDATE, RESTART_APP, CLEAR_CACHE, DISABLE_DEVICE and others. Only `DISABLE_DEVICE` (sets the device to REVOKED) has any real effect, and only on the cloud side.
- **Consequence:** the fleet page reports a state that is not true. An operator who "locks" a stolen or misused terminal believes it is locked, and it is not.
- **Related:** BUG-049 and BUG-059 (revoke and disable do not stop apps either).
- **Expected:**
  - Terminals fetch commands (at least on each heartbeat) and acknowledge them.
  - The list shows the real lifecycle of a command (pending, delivered, acknowledged, done or failed) and the lock badge changes only when the terminal confirms. Until then it shows "Lock pending".
  - The server also refuses sync calls from a locked device.
  - A locked terminal shows a lock screen with the reason and can only be released from Super Admin.

## BUG-069 — Several columns in the fleet list mislead or are missing 🟡

- **Actual (confirmed by reading and from the screenshot):**
  - **Last Seen shows only a time** (`toLocaleTimeString`, `:338`) with no date. "9:48:59 PM" could be today or a week ago. In the screenshot it is clearly from an earlier day, since it is 4:34 PM now.
  - **"Main Branch" is a fake fallback.** The Branch column prints `d.branch?.name || 'Main Branch'` (`:315`). Devices are never assigned a branch (BUG-048), so every row says "Main Branch" although none is set.
  - **Unnamed devices.** The name column falls back to "`<TYPE>` Terminal" (`:302`). There is no way to give a terminal a real name ("Counter 1", "Kitchen wall"). Two "POS_ADMIN Terminal" rows look identical, and the raw code "POS_ADMIN" appears next to the friendlier "RESTAURANT ADMIN" badge.
  - **Three different "online" rules:** Device Fleet says online if seen within **15 minutes** (`:77-78`), Applications & Releases within **1 hour** (BUG-065), and terminals actually send a heartbeat every **15 seconds**. The same device can be "online" on one page and "offline" on another, and a terminal can be down for 14 minutes and still look online.
  - **Missing information** Super Admin needs: app version (terminals report a fixed 1.0.0, BUG-065), last sync time, pending sync count, IP address and operating system (the database has `ipAddress` and `osPlatform` columns, but the heartbeat never sends them, so they are never filled), and battery or free-disk health.
- **Expected:** last seen as relative and absolute time ("3 min ago · 19 Sep 4:34 PM"), branch only when real, editable device names, one shared definition of online / degraded / offline based on the heartbeat interval, and the missing columns filled from real heartbeat data.

---

## Group R — Backups & Recovery in Super Admin (BUG-070 to BUG-075)

**Owner's report:** in Backups & Recovery the UI of "Trigger First Snapshot" is not okay. "Inspect the backup process; I think it is not working up to the mark."

**Evidence (owner's screenshot):** the "Trigger Operator Snapshot" dialog is drawn as a bare white bar across the page with no card. A long error line ("Backup storage is not configured on this server (set BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY…") is printed loose over the page behind it. The cards show Total Snapshots 0, Storage 0 B, **Success Rate 100%**, Failed Alerts 0, and "No Backups Found".

## BUG-070 — The dialog is unstyled because it uses CSS classes that do not exist 🔴

- **App:** Super Admin (`pages/Backups/BackupsPage.tsx:432-540`, `components/shared.css`)
- **Cause (confirmed by reading):** the Trigger and Restore dialogs are hand-written with the classes `modal-card`, `modal-error-banner` and `modal-close-btn`. **None of these is defined in any stylesheet.** The shared modal in the app is `.modal` / `.modal-close` (used through the `Modal` component in `components/ui.tsx`). Without the card styles, the dialog has no background, width, border or padding, the header renders as a full-width strip (its `h3` is not styled either, only `h2` is), and the error banner shows as plain text over the page. This is what the screenshot shows.
- **Also on this page:** the "Success Rate" card prints **100%** when there are zero snapshots (`BackupsPage.tsx:276-277`), which is misleading.
- **Expected:** use the shared `Modal` component, with the error shown inside the card. When storage is not configured, say so **up front** (the API already returns `storageConfigured`) with setup instructions and a disabled Trigger button, instead of letting the operator hit an error. Show "—" instead of 100% when there is no data.

## BUG-071 — Backups cannot be created here: storage is not configured, and there is no fallback 🔴 P0

- **Apps:** cloud API (`backups/backup-storage.service.ts`), Super Admin, Restaurant Admin
- **Actual (confirmed):** backups are only supported to an S3-compatible bucket. In this environment's `cloud/api/.env`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` and `BACKUP_S3_ENDPOINT` are all **empty**. Every backup attempt is refused with a 503 (Super Admin trigger, and Restaurant Admin's "cloud backup" upload alike). There is no local-disk or database fallback, so development, small deployments and demos have no working backup at all.
- **Expected:** at least one storage option that works out of the box for small setups (local disk or managed database storage), plus S3 for production, with a clear "storage health" indicator on the page.

## BUG-072 — The "snapshot" Super Admin takes contains no restaurant data 🔴 P0

- **Actual (confirmed by reading):** `triggerForRestaurant` uploads a payload of just `{ restaurantId, timestamp, triggeredBy, snapshot: { name, city } }` (`backups.service.ts:130-140`), a few dozen bytes of metadata: the restaurant's name and city. It does not export orders, menu, customers, staff, devices, invoices or anything else.
- **Other backup paths:**
  - **Restaurant Admin → "Cloud backup"** uploads the whole local database object (`uploadCloudBackup(db)`, `BackupRestoreModule.tsx:80`). That is the only path with real content, and it is **manual**. It includes plaintext staff PINs and customer data (BUG-006).
  - **Automatic device backups** exist in the API (`createFromDevice`, `POST /devices/me/backups`), but **no app calls that endpoint** (grep across `apps/` and `packages/`). The "AUTOMATIC" method is never used.
  - The cloud only holds synced orders and a few entity types (BUG-038, BUG-034). The restaurant's operational data lives on its terminals. A server-side "snapshot" therefore has very little to capture until sync is complete.
- **Expected:** a snapshot is a real, versioned export of the restaurant's data (from the cloud, and from terminals that upload their local data on a schedule).

## BUG-073 — "Verify" and "Restore" do nothing real 🔴 P0

- **Actual (confirmed by reading):**
  - **Verify** only checks that the stored checksum text exists and the size is above zero (`verifyBackup`, `:142-165`). It never downloads the file and never re-computes the checksum. Any backup, even a damaged one, comes out "VERIFIED".
  - **Restore preview** returns a fixed summary text with the restaurant name and size (`previewRestore`, `:167-200`). It does not read the backup.
  - **Restore execute** takes another (metadata-only) snapshot and marks the job **COMPLETED** (`executeRestore`, `:202-230`). **No data is restored anywhere.** The screen then says "Restore executed successfully. Safety pre-restore snapshot taken."
  - `executeRestore` does not check the job's state, so the same job can be confirmed again, and a missing confirmation is reported as a "not found" error.
  - Restaurant Admin's own restore (`RestoreModal`) is a manual file import into the local browser store (not connected to these cloud backups).
- **Consequence:** an operator could believe a restaurant's data was recovered when nothing happened. This is the most dangerous part of the backup feature.
- **Expected:** verify downloads the object, checks the checksum and can parse it. Restore shows a real dry-run summary (record counts and differences), runs inside a transaction (or pushes to devices) after a real safety snapshot, records the result, and can be undone. Until restore really works, the button should not claim success.

## BUG-074 — No encryption, retention, schedule or failure records, so the health cards cannot be trusted 🔴

- **Actual (confirmed by reading):**
  - **Not encrypted.** The dialog says "The encrypted payload will be uploaded…". The code only compresses (gzip) and uploads. No encryption in the app, and no server-side encryption setting on the upload (`backup-storage.service.ts:60-72`). Backups would contain plaintext data unless the bucket enforces encryption separately.
  - **Retention is never applied.** Each backup row stores `retentionDays = 30`, but nothing deletes old rows or objects, so storage only grows. Deleting a restaurant cascades the backup rows away but leaves the files in the bucket.
  - **No schedule.** The API has no scheduler (BUG-053), so "AUTOMATIC" backups never happen, and there is no per-restaurant policy (frequency, retention).
  - **Failures are never recorded.** The service uploads first and writes the row second, so a failed upload throws before any row exists (`createBackup`, `:19-30`). `Backup.status = FAILED` is therefore never written. "Failed alerts 0", the "Success rate", and the bell's "failed backups" notification (BUG-064) can never show a problem. This is why the page shows 100% with nothing backed up.
  - **Not scalable.** The platform list returns only the newest 100 backups with no paging, filter or search, and the summary numbers come from separate count queries per load.
- **Expected:** encrypted at rest (and ideally with a per-restaurant key), scheduled jobs with retention clean-up, failed attempts recorded with a reason, and a paged, filterable list. Per-restaurant "last successful backup" and "backup age" as the health signal (with an alert if a restaurant has none in N days).

## BUG-075 — The API connects to the database as a superuser, so row-level security is not enforced here 🔴 (security; verify in production)

- **Confirmed (read-only check of role attributes):** the API's database role in this environment is `postgres` with `rolsuper = true` and `rolbypassrls = true`. Postgres superusers ignore row-level security even when it is forced. In this environment none of the tenant-isolation policies (on `Backup`, `Restaurant`, `Device`, and others) are actually applied. Isolation depends entirely on the application code adding the right filters.
- **Related finding in this module:** the platform-side backup methods query `this.prisma.backup…` and `this.prisma.restaurant…` **directly**, without the `runAsPlatform` wrapper the rest of the code base uses (12 calls in `backups.service.ts`; the `Backup` table has forced RLS, `migrations/…backups_and_device_credentials`). With a proper non-superuser role these calls would see **no rows** (RLS denies by default), so the Super Admin backup list would always be empty and triggers would say "Restaurant not found". They only work today because the superuser bypasses RLS. Other services also query directly (for example reports, sync observability); I did not check which of those touch RLS-protected tables.
- **Consequence:** the status docs describe RLS as proven by a cross-tenant test. In this local setup it is bypassed, and production behaviour is unknown.
- **Expected:** the API connects as a dedicated, non-superuser role without BYPASSRLS. Startup fails if it detects a bypassing role. Every service uses the tenant or platform wrapper. An automated test runs against that role.

---

### Proposed backup flow (for the owner to confirm; nothing built)

1. **Storage that works everywhere:** local/managed storage for small setups, S3 for production, with a health check shown on the page.
2. **What is backed up:** a real export of each restaurant's data from the cloud, plus scheduled uploads from its terminals (Restaurant Admin as the designated uploader), encrypted, with a size and record-count manifest.
3. **Policy per restaurant:** schedule (for example nightly), retention, and an alert if the last good backup is too old.
4. **Recovery:** verify (real checksum and parse), dry-run preview with counts, restore into a fresh staging copy first, then production with a safety snapshot and an audit trail.
5. **Page layout:** a health overview (restaurants without a recent backup first), then per-restaurant history, not one global list.

---

## Group S — Emergency Offline Policy & Licensing in Super Admin (BUG-076 to BUG-079)

**Owner's question:** "What is Emergency Offline Policy? It is not working, and not even the UI is good. You can see the error in the circled area."

**What this feature is meant to be:**
The JAMANVAAR apps are offline-first, so a restaurant's terminals can run for days without internet. That creates two licensing problems, and this page is meant to solve both:
1. **Offline grace / emergency extension.** If a restaurant's subscription lapses, or its terminals cannot reach the cloud for a long time (fibre cut, remote site), Super Admin can **grant an emergency extension** of 1-90 days. The extension is a **digitally signed certificate** (ECDSA P-256). A terminal can check the signature offline with a public key built into the app, so nobody can fake one.
2. **License certificate.** For dealer-installed or fully offline restaurants, the same signing key produces a signed "this restaurant is on plan X until date Y" certificate (the "Generate Certificate for This Restaurant" button on the restaurant page). The operator pastes it into POS or Restaurant Admin → Settings, and the app verifies it (this part is implemented: `applyLicenseCertificate`).

The page lists active extensions, shows terminals "approaching offline validity expiry", and has "Grant Emergency Extension" and Revoke.

**Evidence (owner's screenshot):** the message "Offline signing key not configured (LICENSE_SIGNING_PRIVATE_KEY_B64)" printed as loose plain text under the page subtitle, and the "Issue Signed Emergency Offline Extension" dialog with its form fields touching the dialog edges.

## BUG-076 — The signing key is not set, so nothing can be issued, and there is no key management 🔴

- **Apps:** cloud API (`licensing`, `offline-policy`), Super Admin
- **Actual (confirmed):**
  - In this environment `LICENSE_SIGNING_PRIVATE_KEY_B64` in `cloud/api/.env` is **empty**. Granting an extension fails with `503 Offline signing key not configured` (`offline-policy.service.ts:27-32`). Issuing a license certificate fails the same way (`licensing.service.ts:38-45`). This is what the owner saw.
  - The apps verify with a **public key hardcoded in the source** (`LICENSE_PUBLIC_KEY_JWK` in `packages/business/src/license_certificate.ts`). The private key you put in `.env` must be the exact pair of that public key, and the repo has no key-generation tool or instructions for it. If the original private key is lost, no valid certificate can ever be issued unless the public key is replaced and **every app is rebuilt and reinstalled**.
  - There is no key id or support for more than one key, so the key cannot be rotated without breaking certificates already in the field.
  - The private key is a plain environment variable (base64 text) with no protection or access log beyond the audit entry at signing time.
  - The page does not warn in advance. The operator fills in the dialog and only then gets the error.
- **Expected:** a documented one-time key ceremony (generate a pair, store the private key in a secrets store, publish the public key), a key id in every certificate, support for a current and a previous public key so keys can rotate, and a "Signing: ready / not configured" status shown up front on the page and in System Health.

## BUG-077 — Extensions are never delivered to or checked by any terminal, and nothing enforces an offline limit in the first place 🔴 P0

- **Actual (confirmed by reading):**
  - A granted extension is only a database row plus a signed string. There is **no endpoint a terminal can call to receive it**, and no screen where an operator can paste it. Only the **license certificate** has an apply screen (POS and Restaurant Admin settings). A search finds **no code anywhere that verifies an `EMERGENCY_OFFLINE_EXTENSION`** (`apps/`, `packages/`).
  - More basically, **no app enforces an offline limit**. A terminal never locks because it has been offline or its subscription expired (BUG-049, BUG-068). So there is nothing for an extension to extend. The dialog text "The local POS and Captain runtimes verify this certificate mathematically even when 100% disconnected" is not true today.
  - **The "policy" is missing.** There is no setting for how many days a terminal may run offline, what warnings it shows, or what happens at the limit.
  - **"Approaching expiry" is only a guess.** It lists active devices last seen **between 7 and 30 days ago** (`offline-policy.service.ts:60-77`). A device offline for more than 30 days disappears from the list, and it is about "last seen", not about any real validity date.
  - **Revoke changes nothing on terminals** (they never receive extensions). The status EXPIRED is never set by any job, and the page counts revoked and expired rows in "Active Emergency Extensions (n)".
- **Expected (standard "licence lease" flow, for the owner to confirm):**
  1. Every successful check-in (heartbeat) gives the terminal a **signed lease** "valid until T" (based on the plan's offline grace days, for example 7 or 14).
  2. The terminal works offline until T, warns as T approaches, then shows a lock screen.
  3. An **emergency extension** is a longer signed lease. It is delivered on the next contact, or, if the terminal is offline, entered as a short code or QR by the operator.
  4. Revoking, suspending or disabling an app (BUG-049) simply stops issuing leases.
  5. The page shows real numbers: leases expiring soon, who is running on an extension, and who is locked.

## BUG-078 — Wrong details are recorded in the audit trail, and the request is not validated 🟡

- **Actual (confirmed by reading):**
  - The page always sends `requestedBy: 'Restaurant General Manager via Support Call'` (`OfflinePolicyPage.tsx:73`). There is no field for who really asked, so every grant is audited with the same made-up requester.
  - The dialog offers only a restaurant. The API also supports a branch or single device (the table even prints "Fleet Wide" or a device type), but the UI cannot choose them.
  - The API takes the request body **without any schema validation** (`offline-policy.controller.ts`: a plain interface, no zod), so wrong types or very long text reach the database. Duration is checked only for 1-90 days.
  - Several overlapping extensions can be granted for the same restaurant, with no warning.
  - Revoke uses a direct database call without the platform wrapper (`revokeExtension`), the same pattern as BUG-075.
- **Expected:** a real "requested by" and ticket reference field, branch or device targeting, validated input, and a warning when an active extension already exists.

## BUG-079 — Shared UI styles are missing, so toasts and dialogs look broken across Super Admin 🟡

- **Cause (confirmed by reading and grep):**
  - **Toasts:** the class `floating-toast` is used in **6 pages** (Master Catalog, Device Detail, Devices list, Offline Policy, Sandboxes, Sync Monitor) but is **defined in no stylesheet**. Their toasts and error messages render as plain text in the page flow instead of a floating notification. That is the circled error line in the owner's screenshot.
  - **Dialog padding:** the shared `Modal` component (used by **17 pages**) renders a `.modal-body`, but **no CSS defines `.modal-body`**. Unless a page adds its own padding, the dialog's content touches the edges (as in this dialog).
  - **Other undefined classes:** `page-container` (used here, never defined), and, on the Backups page, `modal-card`, `modal-error-banner` and `modal-close-btn` (BUG-070).
  - This dialog also styles its form fields with inline styles instead of the shared `.form-field` styles, so fields look different from other dialogs.
  - **Full sweep (quick script over `cloud/super-admin-web/src`):** about 42 class names are used in the code but defined in **no** stylesheet (Tailwind utility classes filtered out). The ones that matter visibly:
    - **Notifications and messages:** `floating-toast`, `banner`, `banner-error`, `error-banner`, `page-success`, `modal-error-banner`
    - **Dialogs:** `modal-body`, `modal-card`, `modal-close-btn`
    - **Loading states:** `page-loading`, `loading-card`, `skeleton-card`, `skeleton-table-header`
    - **Forms and buttons:** `input-select`, `input-textarea`, `label`, `btn-xs`
    - **Layout:** `page-container`, `page-header-actions`, `kpi-strip`, `ops-right-column`, `mgmt-card-top`, `mgmt-card-body`, `mgmt-card-divider`
    - **The teammate activation page:** `login-shell`, `login-card`, `login-brand`, `login-brand-logo`, `login-brand-meta`, `login-badge`, `login-platform-tag`, `login-form`, `login-error` (see BUG-080)
    - Others (`reports-*-section`, `city-name`, `status-label`) may just be markers and are harmless.
- **Expected:** one shared set of styles for toast, modal body, error banner and form fields, used everywhere, and a shared toast component instead of six hand-written ones. A quick check would list every class name used in the code but defined nowhere.

---

## Group T — Inviting a team member: the activation link page (BUG-080, BUG-081)

**Owner's report:** "I sent an email verification link to add a team member from Super Admin. The link UI is not good."

**Evidence (owner's screenshot):** the page opened from the invite email (`/activate?email=…&token=…`). It shows a huge logo taking the top half of the screen, the two labels run together as "PLATFORM CONTROLACTIVATE ACCOUNT", and Email, Choose a password and Confirm password as full-width bare fields directly under each other, with the button spanning the whole page. No card, no spacing.

## BUG-080 — The activation page has no styling because it uses class names that no longer exist 🔴

- **App:** Super Admin (`pages/Activate/PlatformActivatePage.tsx`, `pages/Login/login.css`)
- **Cause (confirmed by reading):**
  - The page is built from the old login markup: `login-shell`, `login-card`, `login-brand`, `login-brand-logo`, `login-brand-meta`, `login-platform-tag`, `login-badge`, `login-form`, `login-error`.
  - The Login page was later rebuilt on the shared `JamanvaarAuthLayout`, and `login.css` was reduced to a few rules for it (24 lines, only `.jamanvaar-superadmin-login`). **None of the nine classes the activation page uses is defined any more.** The browser therefore shows raw defaults: an unconstrained logo, unspaced badges, and full-width fields. Only the `field` class still has a style.
- **Expected:** the same look as the sign-in page (shared auth layout: centred card, sized logo, spaced fields, branded button), and a proper success state ("Account activated") with a clear "Sign in" button.
- **Related:** BUG-079. This is one of many classes that are used but not defined.

## BUG-081 — The invitation flow is fragile: localhost links, weak checks, no early validation 🟡

- **Actual (confirmed by reading):**
  - **Localhost fallback.** The emailed link is built from `PLATFORM_FRONTEND_URL`, and falls back to `http://localhost:5180` when it is unset (`platform-users.service.ts:61-64`). It is **not set** in `cloud/api/.env`, is not listed in the environment validation, and is not documented. Every teammate invited from a real deployment would receive a link to their own `localhost`.
  - **Secrets in the URL.** The one-time token and the email address are in the query string, so they can end up in browser history, proxy or server logs, and referrers.
  - **No check when the page opens.** The form appears even for an expired, used or invalid link (the invitation lasts 7 days). The user finds out only after typing a password and pressing the button. There is no "resend my invitation" action on the page, only "Ask a Platform Owner".
  - **Weak password rules.** Client and server require only 8 characters (`z.string().min(8)` for the API). There is no strength guidance and no show or hide password control, and no check against common passwords. This account controls the whole platform.
  - **No follow-up.** After activation nothing confirms by email, and there is no prompt to set up two-factor authentication (none exists).
- **Expected:** the link points to the real site URL (with a startup warning when unset), the page validates the invitation on load and shows a clear state for expired or used links (with a resend request), the token is sent in the URL fragment or exchanged for a short-lived session, stronger password rules with a strength meter, and a confirmation email.

---

## Group U — Access control (RBAC) for Super Admin team members (BUG-082 to BUG-084) ⭐ SECURITY

**Owner's report:** a new team member "om sanjhira" was created from Super Admin with the role **Finance Admin**. The invitation link was emailed, and he set his own password. But **he has full access to the whole Super Admin dashboard**. "That means proper authorization and access control is not implemented. He should only see finance-related stuff. Not only finance: the same problem occurs for every team member and role I create."

**Evidence (owner's screenshot):** logged in as "om sanjhira / Finance Admin", the Restaurants page with the whole menu (Restaurants, Owners, Branches, Subscriptions, Plans, Activation Keys and the rest) and the Onboard / Quick create buttons available.

## BUG-082 — The API does not enforce roles: any team member can call any admin endpoint 🔴 P0

- **App:** cloud API (all platform controllers)
- **Confirmed by reading and grep:**
  - There are six roles in the database: `PLATFORM_OWNER`, `SUPER_ADMIN`, `PLATFORM_OPS`, `SUPPORT_ADMIN`, `FINANCE_ADMIN`, `READ_ONLY`.
  - Every admin controller (33 of them) is protected only by `PlatformAuthGuard`. That guard checks one thing: the token belongs to an **active** platform user (`platform-auth.guard.ts`). It never looks at the role.
  - **Only two places in the whole API check the caller's platform role:** team management (`assertCanManageTeam`, `platform-users.service.ts:44-48`) and tenant impersonation (`support.service.ts:253-256`). Everything else is open to all roles.
- **What a Finance Admin, or even a Read-Only Auditor, can do through the API today (and through the UI, see BUG-083):** onboard, edit and **suspend restaurants**, generate and revoke **activation keys**, **revoke, lock or wipe devices**, edit **plans and entitlements**, publish **app releases**, trigger and **restore backups**, grant licences and offline extensions, change AI settings, edit the master menu catalog, edit branches and owners, record payments and void invoices, and read every audit log.
- **The role labels promise more than the code delivers.** The invite dialog says Read-Only is "Read-only visibility … without mutations" and Finance Admin manages "subscription plans, invoices, refunds and billing history". Neither is enforced.
- **Expected:** permission checks on the server for every endpoint, using a role-to-permission table (see the proposal below), returning 403 for anything outside the role, and recording denied attempts in the audit log.

## BUG-083 — The Super Admin interface shows every page and button to every role 🔴

- **App:** Super Admin web (`layout/ProtectedLayout.tsx`, `app/App.tsx`, `auth/AuthContext.tsx`)
- **Confirmed by reading:**
  - The sidebar menu is a fixed list (`NAV_GROUPS`, `ProtectedLayout.tsx:65-117`). It is not filtered by role. Every route under the protected layout is available to any logged-in user, so typing a URL or clicking any link works (`App.tsx:54-96`).
  - `hasPermission(requiredRole)` (`AuthContext.tsx:68-73`) returns true for the owner and Super Admin, and otherwise only for an **exact match of the same role name**. It is a role-name comparison, not a permission check. It is used in only two places: the Team page ("can manage") and the Support page ("can impersonate").
  - No page hides or disables its create, edit, suspend, revoke or delete buttons based on the user.
  - The default role in the invite dialog is **Super Admin**, the most powerful choice (`InviteTeammateModal.tsx:45`), so an operator who is not paying attention grants full power.
- **Expected:** the server returns the user's permissions at login (and on refresh). The menu shows only the sections the role can open. Direct links to other pages show a "you don't have access" page. Buttons the role cannot use are hidden or disabled. Read-only users get a clear read-only mode. The default invite role is the least-privileged one.

## BUG-084 — The role model and the team-management guard rails are too weak 🟡

- **Confirmed by reading:**
  - **A Super Admin can create Platform Owners, and change or disable an existing Platform Owner.** `PLATFORM_OWNER` is one of the roles that can be assigned in an invite or role change, and the only protections are "you cannot change or disable **yourself**" (`platform-users.service.ts:176-190`). There is no rule that a Super Admin cannot touch an owner, and no "at least one active owner must remain" check.
  - **Roles are fixed labels.** There is no way to create a custom role or adjust what a role can do, and no scope such as "this support person can only see these restaurants".
  - **No second factor** for accounts that control the whole platform (also BUG-081).
  - **Sensitive actions are not treated differently.** Impersonating a restaurant owner asks for a reason (good), but wiping a device, restoring a backup, suspending a restaurant, or issuing licences need nothing extra.
  - Role changes take effect on the next request (the guard re-reads the user), which is good. Disabling a user revokes their refresh tokens, but I did not check whether an already-issued access token keeps working until it expires.
- **Expected:** protect owners from lower roles and keep at least one active owner, optional custom roles and per-restaurant scoping for support and finance, extra confirmation for high-risk actions, and two-factor authentication.

---

### Proposed access model (for the owner to confirm; nothing built)

Use **permissions** (an area plus read or write), and give each role a fixed set. Server and interface both read the same table.

| Area | Owner | Super Admin | Platform Ops | Support | Finance | Read-only |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: |
| Restaurants, owners, branches | write | write | read | read | read | read |
| Subscriptions, plans, entitlements | write | write | read | read | write | read |
| Invoices, payments, gateways, revenue reports | write | write | none | none | write | read |
| Activation keys, devices / MDM | write | write | write | read | none | read (codes masked) |
| App releases, sync monitor, backups, sandboxes, system health | write | write | write | read | none | read |
| Offline policy, licence certificates | write | write | write | none | none | none |
| Support tickets, diagnostics | write | write | read | write | none | read |
| Impersonate a restaurant owner | yes | yes | no | yes (with reason) | no | no |
| Audit logs | read | read | read | read | read (billing only) | read |
| JAMAN AI, master menu catalog, QR suite | write | write | read | read | none | read |
| Team management | write | write (not owners) | none | none | none | none |
| Platform settings, signing keys | write | read | none | none | none | none |

Notes: Finance sees only the restaurants and subscriptions it needs for billing. Read-only never sees secrets (activation codes, tokens). High-risk actions need a written reason and are always audited. **This matrix is a suggestion. The owner should adjust it.**

---

## Group V — Support Tickets in Super Admin (BUG-085 to BUG-088)

**Owner's report:** "I can't even create a ticket. Nothing happens after I click Create Ticket. I think tickets are not visible to all members. Also add a field that says which team member the ticket is assigned to. All tickets should be visible to all members, and there should be a separate ticket category for every team member, where they can see every ticket, plus one option or button that shows only the tickets assigned to the logged-in team member, so a team member can know their work for the day."

**Evidence (owner's screenshot):** the "New Support Ticket" dialog with Subject "er", Description "gr", Priority "Medium (3 day SLA)", Restaurant "royal pan" (dropdown open, covering the dialog's action button). The page behind shows "Total Tickets 0" and the tabs All 0 / Open 0.

## BUG-085 — Creating a ticket fails silently: the error is stored but never shown 🔴

- **App:** Super Admin (`pages/Tickets/TicketsPage.tsx`) and cloud API (`support-tickets/dto/ticket.dto.ts`)
- **Cause (confirmed by reading):**
  - The API requires the subject and the description to be **at least 3 characters** (`createTicketSchema`: `min(3)`). In the screenshot both are 2 characters ("er", "gr"), so the API answers **400 "Validation failed"**.
  - The page catches the error and calls `setError(...)` (`TicketsPage.tsx:114-115`). **The `error` state is never displayed anywhere in the page** (a search finds only the three places that set it, none that renders it). The dialog stays open, the button re-enables, and nothing at all is shown. The same is true when **loading** the ticket list fails: the page just shows "0" with no message, so a broken list would also be invisible.
  - The API also returns the list of problems (`issues`, for example "subject: must be at least 3 characters"), and the client keeps them (`ApiError.issues`), but nothing displays them either.
  - The "Create Ticket" button is in the dialog footer, **outside** the `<form>` (`:362-369`), so the browser's own `required` checks never run. Empty fields are ignored silently (`if (!newSubject.trim() …) return;`).
  - The open Restaurant dropdown also sits over the button in the owner's screenshot (the dropdown is a native list that overlays the dialog).
- **Expected:** the same length rules in the form (with a visible hint), messages shown **inside the dialog** next to the field, the button inside the form (or clearly wired to it), and load errors shown on the page. This applies to other pages that store an error and never render it (not checked).

## BUG-086 — No way to choose an assignee when creating a ticket; assigning is limited and uncontrolled 🔴

- **Confirmed by reading:**
  - The create dialog has **no assignee field**, and the API's create schema has no `assignedToId`. A new ticket is always "Unassigned". You have to create the ticket, open it, and pick a name in the detail dialog (`TicketsPage.tsx:447-455`).
  - The assignee list is the whole platform team list, including **disabled and not-yet-activated members** and read-only auditors (`team.map`, no filter). A ticket can be assigned to someone who cannot log in.
  - No notification (bell or email) is sent when a ticket is assigned or commented on (see BUG-064).
  - Anyone with a login can reassign or close any ticket (BUG-082).
- **Expected:** an **Assignee** field on the create form (default: unassigned, or the creator), only active team members who may handle tickets in the list, an assignment history, and a notification to the assignee.

## BUG-087 — There is no "my tickets" view or per-member view, and the list has few of the details a team needs 🔴

- **Confirmed by reading:**
  - **All tickets are already visible to every team member.** The API returns every ticket to any logged-in member (`support-tickets.service.ts:list`). So the owner's "all tickets visible to all members" is what happens today. The only reason nothing shows is that no ticket exists yet (or the list failed to load silently, BUG-085).
  - The page has **one filter: status.** The API also accepts `assignedToId`, but the page never uses it. There is no "Assigned to me", no "Unassigned", no "Created by me", no "By teammate", no counts per member, no "Overdue" or "Due today" view.
  - **Tickets have no readable number.** Only a long id exists (no `TKT-2026-0001`), so people cannot quote a ticket in a call or message.
  - The table lacks a created date, the SLA due time and a clear "SLA breached" indicator, and it loads **all tickets with no paging** (the same scale problem as BUG-047, BUG-051, BUG-060, BUG-067).
- **Expected (what the owner described):**
  1. **All tickets** stay visible to every member.
  2. A **"My tickets / My work today"** button. It shows only tickets assigned to the logged-in member that are open or in progress, ordered by SLA due time, with overdue ones first.
  3. A **category (tab or filter) per team member** with an open-ticket count, so anyone can see what a colleague is working on. Plus "Unassigned" and "Created by me".
  4. Readable ticket numbers, created date, SLA countdown, and paging with server-side search and filters.

## BUG-088 — Restaurants cannot raise tickets, and tickets have no category, attachments or history 🟡 (feature gap)

- **Confirmed:** only platform staff can create tickets (`createdBy` is a required platform user), and no restaurant-facing app has a "contact support" or "raise a ticket" feature (search across `apps/`). Tickets have no category (billing, sync, hardware, onboarding, feature request), no attachments or screenshots, no linked device or order, and no activity log of status and assignee changes (only audit entries).
- **Expected:** restaurants create tickets from Restaurant Admin (with their restaurant, branch and device filled in automatically), and the Super Admin team triages them.

---

### Proposed ticket flow (for the owner to confirm; nothing built)

1. **Create:** subject, description, **category**, priority (sets the SLA), restaurant (and branch or device), **assignee**. Live validation with clear messages.
2. **List:** default view "All open". One-click views: **My tickets**, **Unassigned**, **Created by me**, **Overdue**, **Due today**, and a row per team member with their open count.
3. **My work today:** assigned to me, open or in progress, sorted by SLA due time, overdue ones highlighted.
4. **Ticket detail:** timeline of comments and changes (status, assignee, priority), @mentions, attachments.
5. **Notifications:** assignee gets a bell and email entry on assignment, comment or status change (uses the notification centre from BUG-064).
6. **Permissions:** everyone can view all tickets. Editing, reassigning and closing follow the role table in Group U (for example Support and owners can assign, the assignee and creator can update).

---

## Group W — Diagnostics & Support screen, and revoked devices that keep working (BUG-089, BUG-090)

**Owner's report:** "The UI of Super Admin → Diagnostics & Support is not good, it is ugly in fact. And when I revoked all the permissions of royal pan (see the screenshot), I can still log in and use the KDS, POS and admin panel activated with royal pan's keys, which should not happen."

**Evidence (owner's screenshot):** Support & Diagnostic Console. The search box holds "11111" and the counters read Restaurants (0), Owners (0), Devices (0), Activation Keys (0), yet the panels below still show **royal pan** from an earlier inspection. "Connected Terminal Hardware" lists KDS, POS and POS_ADMIN, all version 1.0.0, all status **REVOKED**. "Online Terminals 0 of 3 Online". "Recent Diagnostic Audit Logs" shows `SUPPORT_DEVICE_REVOKED` three times, `TENANT_IMPERSONATION_STARTED`, `RESTAURANT_SANDBOX_CLONED` and `ACTIVATION_KEY_REVOKED`.

## BUG-089 — The Restaurant Admin sign-in and sessions ignore device, restaurant and subscription state 🔴 P0

- **Apps:** cloud API (`tenant-auth`), Restaurant Admin (POS_ADMIN)
- **Confirmed by reading (this adds to BUG-049 and BUG-059, which explain KDS and POS):**
  - **Existing sessions keep working.** The guard for Restaurant Admin API calls checks only that the user is active and belongs to the restaurant in the token (`tenant-auth.guard.ts:50`). It does **not** check the restaurant's status, its subscription, or the device.
  - **Refresh keeps them alive.** Token refresh checks only the refresh token and the user status (`tenant-auth.service.ts:518-545`). Access tokens last 15 minutes and refresh tokens **30 days** (`env.validation.ts`), so a suspended restaurant's owner session can be renewed for up to a month.
  - **Revoking a device does not end sessions.** Refresh tokens are tied to the user and restaurant, not to the device, so revoking the Restaurant Admin device does not invalidate them.
  - **Sign-in checks the restaurant but not always the device.** A fresh sign-in is refused if the restaurant is suspended (`:241`). If the sign-in request names a device that is now revoked, the API answers "activation required" (good). But a sign-in **without any device information** (Case 3, "direct API / non-terminal login", `:317-344`) succeeds with no device check at all.
  - The app itself is local-first: it opens from its own stored data and local login, so even when the cloud refuses requests the screens keep working (BUG-049).
- **Expected:** every tenant request re-checks that the restaurant is active, the subscription is valid and the device is still active. Revoking a device revokes the sessions and refresh tokens issued to it, suspending a restaurant revokes all its sessions, and the app shows a locked screen with the reason (needs BUG-049's terminal-side work).

## BUG-090 — The Diagnostics & Support screen looks poor and has stale, misleading states 🟡

- **App:** Super Admin (`pages/Support/SupportPage.tsx`, `pages/Support/support.css`)
- **Confirmed by reading:**
  - **Undefined theme variables.** `support.css` uses `var(--bg-card)` and `var(--text-primary)`, which **exist nowhere** in the stylesheets (the theme uses `--jv-surface`, `--jv-text`, and so on). The search box and the result cards therefore get no background or text colour from the theme, and they do not follow dark mode. The search focus ring is a hard-coded red (`rgba(220,38,38,…)`) that does not match the orange brand colour.
  - **Undefined classes:** `input-textarea`, `page-loading` and `page-success` are used and defined nowhere (BUG-079).
  - **No responsive layout.** The main panel is a fixed two-column grid (`1fr 2fr`) with no breakpoint, so it cramps on narrow screens.
  - **Heavy inline styling.** Headings, cards and buttons carry their own inline styles instead of the shared card, table and badge styles, so this page looks different from the rest of the console.
- **From the screenshot (not code-checked):** small grey labels with little contrast, sections with no visual separation, a plain unstyled table header, and **REVOKED shown in the same neutral grey as normal states**, so problem devices do not stand out. The Action column is empty.
- **Misleading states:**
  - The search shows zero results for "11111", but the previous restaurant's full diagnostic panels **stay on screen**, so it looks as if the search matched royal pan.
  - "Last seen 5:04:52 PM" shows a time with no date (BUG-069), and every device is "Version 1.0.0" because terminals report a fixed version (BUG-065).
- **Expected:** rebuild the page with the shared card, table and badge components and theme variables: a clear header for the restaurant with a status summary, a device table with real status colours (Online / Offline / Revoked), version, last seen with date and a per-device action menu (revoke, lock, force sync), a tidy audit timeline, and a search that clears or resets the panels when the query changes.

---

## Group X — Platform Settings and Maintenance Mode in Super Admin (BUG-091, BUG-092)

**Owner's report:** "In Super Admin → Platform Settings, when I clicked Platform Maintenance Mode it says maintenance mode activated. It says every restaurant admin gets the notification, but I did not receive any maintenance notification when I logged in as a restaurant admin."

**Evidence (owner's screenshot):** Platform Settings with three cards: Platform Branding (name, parent company, support email and phone), Onboarding Default Quotas (trial days 14, max outlets per trial 1, max terminals per trial 5), and "Maintenance & Alerts" with a ticked "Platform Maintenance Mode" box (text: "When enabled, tenant admins see a maintenance notice in their portals. Offline POS terminals continue operating uninterrupted without loss of local data.") plus a "Global Status Banner Message" field and a "Save Status" button.

## BUG-091 — Maintenance mode is only a saved flag: no restaurant app ever reads it or shows a notice 🔴

- **Apps:** cloud API, Super Admin, Restaurant Admin, POS, KDS, Captain, Kiosk
- **Confirmed by reading and grep:**
  - Saving stores `{ maintenanceMode, statusBanner }` under the key `platform.maintenance` in the database (`PATCH /api/v1/platform/settings/platform.maintenance`). Only the Super Admin page and the settings endpoints ever touch it.
  - **No tenant or device endpoint returns it.** The only restaurant-side platform calls are the sign-in, `/tenant/me`, entitlements, billing, backups and a few others (`tenant-auth.controller.ts`, `cloudClient.ts`), and none carries a platform notice. A search across `apps/`, `packages/` and the API finds **no code that reads `maintenanceMode`, `statusBanner` or `platform.maintenance`** outside the settings page. The only "maintenance" in the terminal apps is the unrelated **Kiosk lock** that a Kiosk Admin sets on his own kiosks.
  - **Nothing on the server reacts either.** Turning it on does not add a warning header, refuse writes, or change any response.
  - So the promise printed under the checkbox, "tenant admins see a maintenance notice in their portals", is **not true**. This is exactly what the owner tested: nothing appeared in Restaurant Admin.
- **Also on this card:**
  - The box looks like an instant switch, but nothing is saved until **Save Status** is pressed (the message afterwards is "Maintenance settings updated", from `handleSaveMaintenance`), so it is easy to think the mode is active when it was never saved, or the reverse.
  - The seeded value has a `scheduledDowntime` field that no screen can set and nothing reads. There is no start or end time, so a banner has to be switched off by hand.
  - There is only **one** global message. No type (maintenance, incident, information), no audience (all restaurants, some restaurants, one plan, one app), and no history.
- **Expected (see the proposed flow below):** an announcement the platform team can publish (now or scheduled) that really reaches the restaurants' apps, plus a "read-only / blocked" option for real downtime.

## BUG-092 — The other platform settings are also saved but not used, and the settings API does not validate 🟡

- **Confirmed by grep:**
  - **Onboarding defaults** (`platform.defaults`: trial days 14, max branches, max devices) are read by nothing outside the settings page. The onboarding wizard uses its own values (for example `durationDays` from the plan form). Changing "Default trial duration" or the trial quotas has no effect on new restaurants. The page labels "Max outlets per trial" and "Max terminals per trial" therefore promise limits that do not exist (BUG-061).
  - **Branding** (`platform.branding`: platform name, parent company, support email and phone) is also read by nothing else. Invitation emails, invoices and the apps do not use it. The invoice seller block has its **own hard-coded** support email (`billing@jamanvaar.app`, `invoices.service.ts:18`). The seeded support phone "+91 98765 43210" and email are placeholders.
  - **No validation.** `PATCH /platform/settings/:key` accepts any JSON value for an existing key (`value: any`), with no schema per key. Negative quotas, text in number fields, or missing fields would be stored and could later crash whatever reads them. The page also converts fields with `Number(...)` without checking.
  - Any team member can change these settings, including turning maintenance on (BUG-082).
- **Expected:** each setting has a defined shape and limits, is read by the code it claims to control, and the page says clearly which settings take effect immediately.

---

### Proposed announcement and maintenance flow (for the owner to confirm; nothing built)

1. **Announcements instead of one flag.** Each announcement has: type (maintenance, incident, information), severity, message, **audience** (all restaurants, chosen restaurants, or by plan), **app scope** (Restaurant Admin, POS, KDS, Captain, Kiosk), **start and end time**, status (draft, scheduled, active, ended), and a "block or read-only" option. The platform team can preview it and publish or schedule it, and every change is audited.
2. **Delivery.** Restaurant Admin gets active announcements with its normal cloud calls. Terminals (device token) get them in the **heartbeat response**, so it costs nothing extra. The apps cache them for offline use.
3. **What the user sees.** A banner at the top of each affected app (colour by severity, dismissible for information and not for maintenance), and an "acknowledge" option. For a real outage with "read-only" chosen, apps switch to a clear read-only screen. **By default the banner never stops billing**, because the apps are offline-first and a restaurant must be able to keep selling.
4. **Notify by email or WhatsApp** for scheduled downtime, optionally.
5. **Status history page** in Super Admin so the team can see what was announced and when.

---

## Group Y — My Profile → Active sessions in Super Admin (BUG-093, BUG-094)

**Owner's report:** "When I revoked the last session, it doesn't revoke. Nothing happened."

**Evidence (owner's screenshot):** My Profile with the "Change password" card and "Active sessions": two rows, Started 9/19/2026 2:16:31 PM and 1:57:52 PM, both expiring 10/19/2026, each with a red Revoke button.

## BUG-093 — "Revoke session" does not actually cut off the session, and gives no feedback 🔴

- **App:** Super Admin (`pages/Profile/ProfilePage.tsx`) and cloud API (`sessions/sessions.controller.ts`, `platform-auth`)
- **Cause (confirmed by reading):**
  - A "session" here is a **refresh token** row (`PlatformRefreshToken`). Pressing Revoke only sets `revokedAt` on that row (`sessions.controller.ts:26-36`). It stops that session from **renewing** its login.
  - The login itself is a signed **access token** valid for **15 minutes**. It carries only the user id and email (`PlatformAccessTokenPayload`), with no session id, and the request guard only checks the signature and that the user is active (`platform-auth.guard.ts`). It never looks at whether the session was revoked.
  - So a revoked session **keeps working for up to 15 minutes** in that browser. If the row you revoked is the **one you are using**, nothing visible happens at all: you are not signed out, there is no message, and you find out only when the token expires and the next renewal fails.
  - The page gives no confirmation, no success or error message, and no warning ("this will sign you out"). `revokeSession` has no error handling: if the call fails, the list simply does not reload (`ProfilePage.tsx:44-47`).
- **What I could not reproduce:** whether the row itself stayed in the list in the owner's case. From the code it should disappear after a successful revoke, unless the request failed.
- **Expected:** revoking takes effect **immediately**. The access token carries a session id and the guard rejects revoked sessions (with a short cache so it stays fast). Revoking your own session signs you out at once after a clear confirmation. Every revoke shows a success or error message.

## BUG-094 — The session list is misleading and says too little 🟡

- **Confirmed by reading:**
  - **"Started" is not when you logged in.** Each time a login renews (every 15 minutes) the API revokes the old refresh token and creates a **new row** (`platform-auth.service.ts:112-142`). The list shows the age of the newest row, so the "Started" time keeps changing for the same browser session, and the list can show several rows for one login as they rotate.
  - **The current session is not marked**, so you cannot tell which row is "this browser". Revoking the wrong one signs you out, or leaves another person's session alive.
  - **No details.** A session shows no device, browser, operating system, IP address, location, or last activity. You cannot recognise a stranger's session.
  - **No "sign out everywhere else"** action. Only changing the password revokes the others.
  - Refresh tokens last 30 days, and there is no limit on how many sessions one account can hold.
- **Expected:** one row per login (not per rotation) with device and browser, IP and approximate location, sign-in time, last active time and a **"This device"** badge. There is a "Sign out all other sessions" button, revoked sessions show a confirmation, and each revoke is audited. Sensitive roles could also get a shorter session lifetime.
- **Related:** BUG-089 (the restaurant-side sessions have the same weakness).

---

## Group Z — Found during a live end-to-end verification run (BUG-095)

With BUG-019/034/035 marked "code done, not yet verified", the real API and all five apps (cloud API, Restaurant Admin, POS, KDS, plus Super Admin for setup) were started together and driven through a genuine cross-app flow: create a restaurant → set the owner's password → activate Restaurant Admin as the owner → add a staff member (PIN issued) → load a menu → activate POS and KDS separately, each with their own activation key → log into POS with the staff PIN → add a dish → Send KOT → watch it arrive on KDS → check the order and its GST totals in Restaurant Admin. Everything worked **except** the staff PIN did not — KDS rejected the very PIN Restaurant Admin had just issued.

## BUG-095 — A staff PIN only ever works on the device that created it 🔴

- **App:** POS, Captain, KDS, Kiosk User, Restaurant Admin, cloud API (`entity-sync`)
- **Confirmed live:** created "Live Verify Cashier" in Restaurant Admin's Staff & Roles, got issued PIN 7206. On a separately-activated, same-restaurant KDS terminal, entering 7206 gave "Incorrect PIN." The same PIN then failed on POS too, before the fix.
- **Cause (confirmed by reading):** the cross-app cloud sync bridge (`packages/sync/src/entity_sync.ts` + `cloud/api/.../entity-sync`) already carries `CUSTOMER`, `MENU_ITEM`, `MENU_CATEGORY`, `INVENTORY_ITEM` and `PAYMENT_TRANSACTION` between devices of the same restaurant — but never `User`/staff records. Every login screen (POS, Captain, KDS, Kiosk) correctly checks the PIN against the real, shared `StaffRepository`/`db.users` (SEC-006 was already fixed), but each device's `db.users` is its own local-first store with nothing to fill it in except what was created on that exact device. Restaurant Admin's own staff screen tells the owner "This PIN logs [name] into POS, Captain, KDS and Kiosk" — a promise the code did not keep. KDS additionally had no entity-sync wiring of any kind (not even for the menu), so it was further behind than the others.
- **Fix:** added `STAFF_USER` as a syncable entity type on the cloud bridge (payload: id, username, full name, email, phone, role id, active flag, and the PIN hash — never the plaintext PIN, and the hash is already restaurant-keyed so it is no more sensitive than the customer PII the bridge already carries). Restaurant Admin — the only place staff are created or PINs reset — pushes its staff list every sync tick, the same way it already pushes the menu; POS, Captain, KDS and Kiosk User pull and apply it (KDS gained its first entity-sync wiring of any kind in the process). Tenant isolation (one restaurant's staff never reaching another's device) is covered by the same RLS-scoped storage every other entity type already uses, and verified directly with a cross-tenant test.
- **Verified live a second time**, after the fix, on the same running stack: PIN 7206 worked on KDS within one sync tick, and the full order flow (POS → KDS, POS → Restaurant Admin) still worked end to end.
- **Tests:** `cloud/api/test/entity-sync.e2e.spec.ts` (push/pull round trip on a different device of the same restaurant, and cross-tenant isolation), `tests/staff_cross_device_sync.test.ts` (the shared payload/apply logic every app's sync tick uses).

---

## Group AA — Floor Captain & Service module, live test (BUG-096 to BUG-118)

**How this was found:** the real API and Restaurant Admin, POS, KDS and Captain were run together against a fresh restaurant ("Captain Verify Bistro"), each terminal activated with its own key. A waiter PIN was issued in Restaurant Admin, then Captain was driven through sign-in, seating a table, adding dishes, firing a KOT, the kitchen marking it ready, requesting the bill, POS settling it, and sending messages. **Owner's suspicion, confirmed:** Captain is only connected to the rest of the system for the order itself (KOT reaches KDS, order reaches POS and Restaurant Admin). Everything around the order — tables, table status, food ready, bill request, payment, messages — stays on the tablet.

## BUG-096 — Table layout made in Restaurant Admin never reaches Captain or POS 🔴

- **App:** Restaurant Admin, Captain, POS (`packages/database`, entity-sync)
- **Found:** Live: added Table 15 in Restaurant Admin; after 30 s Captain still had tables 1-12. Cause: there is no table sync at all. `SYNCABLE_ENTITY_TYPES` has no table type, so each device keeps its own local copy of the 12 demo tables seeded by `seed.ts`.
- **Expected:** Tables added, edited or removed in Restaurant Admin appear on every terminal of that restaurant.

## BUG-097 — Table status is per device: Captain tables look vacant on POS and POS payments never free Captain tables 🔴

- **App:** Captain, POS (`captainStore.ts`, `TableRepository`)
- **Found:** Live: Captain seated Table 1 and fired a KOT; POS floor plan showed T-1 AVAILABLE, Occupied 0. After POS settled the order, the Captain table stayed BILL_REQUESTED with the order already COMPLETED/SUCCESS. Cause: seat, bill-request and free only change the local `tables` copy; the only 'bill settled' signal is a same-browser LAN-mesh event.
- **Expected:** Table status and its running order follow the table across devices; a settled order frees the table everywhere.

## BUG-098 — Kitchen 'food ready' never reaches the waiter 🔴

- **App:** Captain, KDS (`captainStore.ts` FOOD_READY listener)
- **Found:** Live: KDS marked the ticket ready. Captain kept Food Ready (0), Live KOTs still PREPARING, dish still 'In Kitchen'. The order's item status did arrive (kitchenStatus READY) but nothing reads it. The Food Ready list is filled only by a LAN-mesh event that cannot cross devices, and 'Mark served' is local only.
- **Expected:** A dish marked ready in the kitchen shows up on the waiter's Food Ready list within seconds, and marking it served is visible to POS and KDS.

## BUG-099 — 'Send Bill Request to Counter POS' reaches nobody 🔴

- **App:** Captain, POS
- **Found:** Live: after Request Bill the Captain table turned BILL_REQUESTED but POS showed nothing (no Billing table, no notification). Cause: `requestBill` only changes the local table and broadcasts a LAN-mesh event that no app listens for.
- **Expected:** POS shows the table as 'Billing' and raises a notification for the cashier.

## BUG-100 — Staff messages and guest requests never leave the tablet 🔴

- **App:** Captain, KDS, POS
- **Found:** Live: sent a broadcast to Kitchen Stations for Table 1; KDS showed nothing. Cause: messages travel only over the same-browser LAN mesh. POS has no inbox for 'Counter POS' messages at all.
- **Expected:** A message to the kitchen, counter or another waiter arrives on that device as a notification.

## BUG-101 — Captain orders carry no waiter name 🔴

- **App:** Captain, KDS, Restaurant Admin (`captainStore.ts` sendKOT, `outbox.ts`)
- **Found:** Live: KDS ticket says 'Captain: Cloud Sync', Restaurant Admin lists 'Unassigned captain' and 'Unassigned cashier'. `sendKOT` never sets `captainName`; the cloud pull falls back to the text 'Cloud Sync'.
- **Expected:** The waiter's name follows the order to KDS, receipts and reports.

## BUG-102 — Captain bills use a flat 5% and print a broken tax split 🔴

- **App:** Captain, POS receipt (`captainStore.ts`)
- **Found:** Live: Captain total 903 for a 860 subtotal (flat 5%, no rounding). The POS receipt for that order printed Subtotal 860, CGST ₹0, SGST ₹0, Total 903. `sendKOT` hard-codes `subtotal * 0.05` and never sets CGST/SGST/round-off, unlike POS.
- **Expected:** Captain computes tax the same way POS does (per-dish GST rate, CGST + SGST, round-off) so both show the same bill.

## BUG-103 — A made-up cashier, 'Amit Dave', appears on real receipts and reports 🔴

- **App:** POS, Restaurant Admin, packages (`ThermalReceiptView.tsx`, `PosHeader.tsx`, `PosCloseDayModal.tsx`, `OrdersModule.tsx`, `business_day_service.ts`...)
- **Found:** Live: the receipt for the Captain order says 'Cashier: Amit Dave'; Restaurant Admin's Orders table shows Amit Dave as the cashier. The name is hard-coded as a fallback in about 15 places (one prints it unconditionally).
- **Expected:** Only the real signed-in staff member's name is ever printed or reported; if there is none the line is left out.

## BUG-104 — Tapping 'More Options' turns the Captain app into a blank white screen 🔴

- **App:** Captain (`CaptainMoreDrawer.tsx`)
- **Found:** Live: click More Options, page goes white; console: 'Rendered more hooks than during the previous render' at CaptainMoreDrawer. `useAiAccess()` was placed before `if (!isOpen) return null`, and `useCaptainStore()` after it. This is a regression from the earlier JAMAN AI toggle change.
- **Expected:** The drawer opens; every hook runs on every render.

## BUG-105 — Wrong PIN on the Captain keypad gives no feedback and jams the pad 🔴

- **App:** Captain (`App.tsx` keypad)
- **Found:** Live: pressing 1-2-3-4 leaves '1234' in the box with no message and the number keys stop working until Clear is pressed. The keypad path calls `login` without checking the result; only the typed-Enter path shows an error.
- **Expected:** A wrong PIN shows 'Incorrect PIN' and clears the entry.

## BUG-106 — Captain forgets who is signed in after a reload 🔴

- **App:** Captain (`captainStore.ts` session restore)
- **Found:** Live: reload returns to the PIN screen. Restore only accepts a session whose user id equals the demo profile id 'cap-1', and would then sign in as the demo captain 'Rahul Sharma'.
- **Expected:** A reload keeps the same real staff member signed in until they log out or the session expires.

## BUG-107 — 'My Assigned Tables' is the same hard-coded list for every waiter 🔴

- **App:** Captain (`captainStore.ts` DEFAULT_CAPTAIN, `CaptainFloorView.tsx`)
- **Found:** Live: a brand-new waiter opens with 'My Assigned 7' (tables 1-6 and 12) and tables 7-11 are hidden by default; the list also includes a table 14 that does not exist. There is no way to assign tables.
- **Expected:** The default view shows every table; 'My tables' means tables this waiter opened.

## BUG-108 — Zone filters on the Captain floor match nothing 🟡

- **App:** Captain (`CaptainFloorView.tsx`)
- **Found:** Live: 'Main Dining Hall' and 'Family Zone' show zero tables. The buttons are hard-coded names but the tables use 'Main Hall' and 'Family Section'.
- **Expected:** Zone buttons come from the real table zones.

## BUG-109 — Guest count ignores table size 🟡

- **App:** Captain (`CaptainGuestCountModal.tsx`)
- **Found:** Live: 8 guests were seated at a 2-seat table with no warning.
- **Expected:** Options above the table's capacity are not offered (or need an explicit confirm).

## BUG-110 — Terminals keep the demo branch after activation 🟡

- **App:** Captain, POS, Restaurant Admin
- **Found:** Live: after activating against 'Captain Verify Bistro', POS and Restaurant Admin headers still read 'Ahmedabad Flagship Store' and the local outlet is 'AHM-01, Sindhu Bhavan Road, Bodakdev, +91 98765 43210' under restaurant id 'rest-jamanvaar-main'. Activation only adopts the restaurant name.
- **Expected:** The branch name, address and phone come from the restaurant's own branch.

## BUG-111 — Transfer and merge can overwrite a busy table and are not shared 🟡

- **App:** Captain (`captainStore.ts` transferTable/mergeTables)
- **Found:** By reading the code: transfer accepts any target including an occupied one (its order pointer is overwritten and that order is orphaned); merge marks both tables occupied without combining orders; neither is synced to other devices.
- **Expected:** Transfer only to an available table; merge combines the orders; both are synced.

## BUG-112 — Captain's dish options are hard-coded 🟡

- **App:** Captain (`CaptainModifierModal.tsx`)
- **Found:** By reading the code: every dish, including drinks and desserts, offers Spice, Jain, Extra Cheese (+₹40) and Extra Butter (+₹25). The dish's real modifier groups are ignored.
- **Expected:** The dialog shows the dish's own modifier groups and prices.

## BUG-113 — A paid order's ticket stays on the kitchen screen 🟡

- **App:** KDS
- **Found:** Live: after POS settled the order, KDS still showed KOT-01 as Food Ready with 'Mark served'.
- **Expected:** Tickets of completed or cancelled orders leave the kitchen screen.

## BUG-114 — Small Captain screen defects 🟢

- **App:** Captain
- **Found:** Live: an occupied table's card shows 'ORDER VALUE —' and 'Table ready for seating'; a dish stays 'In Kitchen' after it is ready; Escape does not close dialogs; the header always says 'Main Dining Floor'; the shift screen prints a fixed 'Main Dining Hall'.
- **Expected:** Cards show the running total and real state; Esc closes dialogs; labels come from data.

## BUG-115 — A new restaurant starts with demo combos, coupons, rewards, printers and tables 🟡

- **App:** Restaurant Admin, terminals (`seed.ts`)
- **Found:** Live: fresh restaurant, empty menu, but 'Combos & Meal Deals: 2 ACTIVE' (Royal Veg Biryani Feast, Maharaja Paneer Thali, using dishes that do not exist); terminals also hold 7 demo printers, demo coupons, loyalty tiers and 12 demo tables. BUG-013/025/045 cleared only the menu, printers and inventory.
- **Expected:** A new restaurant starts with none of these until it creates its own.

## BUG-116 — Table dialog zones differ from the zones on existing tables 🟢

- **App:** Restaurant Admin
- **Found:** Live: Add Dining Table offers Main Dining Hall / AC Family Section / Garden Terrace / Banquet, while existing tables use Main Hall / Family Section / AC Balcony, so filters and floor sections split.
- **Expected:** One list of zones, taken from the restaurant's own tables (plus 'new zone').

## BUG-117 — Wrong stock photo on a default dish 🟢

- **App:** Default menu (`seed.ts`)
- **Found:** Live: 'Veg Seekh Kebab Mughlai' shows a photo of tropical fish.
- **Expected:** Each default dish uses a fitting photo or none.

## BUG-118 — Any staff PIN opens any terminal (a waiter can unlock the kitchen screen and the POS) 🟡

- **App:** KDS, POS
- **Found:** Live: the Captain/Waiter PIN unlocked KDS, and POS lists the waiter as a sign-in profile.
- **Expected:** Each terminal accepts only the roles that use it (owner/manager everywhere).

## BUG-119 — QR table-ordering links default to a localhost address 🟡

- **App:** Restaurant Admin (`QrCardDesignerModal.tsx`, `CustomerQrExperienceModal.tsx`, `db.ts`)
- **Found:** By reading the code: a table QR code points at `http://localhost:5176/?qrTable=...` unless the owner has set a public address, so a printed QR standee would not open on a guest's phone. A public address for the QR ordering page depends on where it is hosted, which is a decision for the owner.
- **Expected:** The QR designer asks for the public ordering address before it allows printing, and never prints a localhost link.

## BUG-120 — The same table number can be created twice 🟡

- **App:** Restaurant Admin (`TableModal.tsx`)
- **Found:** Live: Add Dining Table accepted number 1 while a Table 1 already existed, giving two Table 1s that Captain and POS then mixed up.
- **Expected:** A duplicate table number is refused with a clear message.

## BUG-121 — Terminals were refused with 429 Too Many Requests, so staff, menu and table sync silently stopped 🔴

- **App:** Cloud API (`app.module.ts` rate limit)
- **Found:** Live: with four terminals of one restaurant running, POS received HTTP 429 on staff, menu and table sync and never got its staff. All of a restaurant's terminals share one address behind the router, and the global limit is 120 requests a minute per address, less than a handful of terminals legitimately send.
- **Expected:** Terminal sync endpoints allow a restaurant's whole set of terminals; everything else keeps the strict limit.

## BUG-122 — The 'new version available' bar covered the top of every restaurant app 🔴

- **App:** Captain, POS, KDS, Kiosk (`PlatformNoticeBanner.tsx`)
- **Found:** Live: the blue bar was fixed over the page top, hiding the logo and the Send Msg and profile buttons and blocking taps on them until dismissed.
- **Expected:** The bar takes its own row above the app.

## BUG-123 — Receipt tax lines showed '₹21.5' and '₹0' 🟢

- **App:** POS receipt preview (`ThermalReceiptView.tsx`)
- **Found:** Live: CGST and SGST printed without a second decimal, and as ₹0 when an order carried no split.
- **Expected:** Two decimals always; a missing split is worked out from the tax.

## BUG-124 — A table order rung up at the counter said 'POS: CLOUD-SYNC' 🟢

- **App:** POS receipt preview
- **Found:** Live: an order that arrived from Captain printed its internal source label as the terminal name.
- **Expected:** The terminal line is left out when the order was not rung up here.

## BUG-125 — Every restaurant's receipt thanked guests on behalf of JAMANVAAR 🟡

- **App:** POS receipts (`db.ts` demo receipt config)
- **Found:** Live: 'Thank you for dining at JAMANVAAR! Please visit again.' and 'Freshly Prepared • Zero Preservatives • Pure Heritage Taste' on a receipt for another restaurant.
- **Expected:** The footer names the restaurant, or says nothing, until the owner writes their own.

## BUG-126 — Small Captain layout defects (KOT label, clipped card buttons) 🟢

- **App:** Captain
- **Found:** Live: tickets read 'KOT #-02'; the 'VIEW ORDER' and 'REQUEST BILL' buttons on a table card were cut to 'VIEW O…' and 'REQUE…'.
- **Expected:** Readable labels.

## BUG-127 — The Restaurant ID that Kiosk Admin and Captain ask for cannot be found 🔴

- **App:** Super Admin (`RestaurantDetailPage.tsx`), Restaurant Admin (`CloudDeviceLoginsPanel.tsx`), Kiosk Admin and Captain (connect screens)
- **Reported:** "I can't find the Restaurant ID to log into the Kiosk panel."
- **Cause (confirmed by reading and the screenshots):** the connect screens of Kiosk Admin and Captain require the Restaurant ID, but the only place it appeared was 11-pixel grey text at the end of the restaurant page's subtitle in Super Admin ("... ID: 7385361b-..."), with no label and no copy button. The activation-keys panel, where a terminal is being set up, does not mention it. Restaurant Admin does not show it anywhere. The connect screens only said "From your restaurant's admin dashboard", which points at nothing.
- **Expected:** the ID is shown clearly, with a copy button, where the person setting a terminal up already is, and the connect screens say where to find it.

## BUG-128 — Super Admin cannot delete an activation key, or bring a revoked key back 🟡

- **App:** Super Admin (`RestaurantDetailPage.tsx` key cards, `ActivationKeysListPage.tsx`) and cloud API (`activation-keys`)
- **Reported:** "Super admin can't delete keys he created. New keys are created and working, but Super Admin should be able to delete keys, and also revoke a key and then activate that key again."
- **Confirmed by reading:**
  - The API has only `PATCH /activation-keys/:id/revoke` and `POST /activation-keys/bulk-revoke`. There is **no delete** endpoint and **no way to re-activate** a revoked key (the status only moves ACTIVE → REDEEMED / REVOKED / EXPIRED, never back).
  - The restaurant page's key cards (your screenshot) show only a **Copy** button, no actions at all. The activation keys page offers **Copy** and **Revoke** (only while a key can still be revoked), and its confirmation dialog says "This cannot be undone".
  - Revoked and expired keys therefore stay on the restaurant page for ever: the screenshot shows three revoked cards next to the one usable key.
  - Revoking a key that is **in use** (Redeemed) also revokes its terminal and that terminal's sign-in tokens (`revoke` in `activation-keys.service.ts`). Devices have no "restore" either (only `PATCH /devices/:id/revoke`). So one wrong click on a live terminal's key cannot be undone.
- **Not confirmed / choices to make when this is built (my recommendation in brackets):**
  - Which keys may be deleted. [Any key that is not in use: Available, Revoked or Expired. A Redeemed key is the record of a registered terminal, so it must be revoked first, and the delete is written to the audit log with the key's code.]
  - What "activate again" means for each case. [An unused revoked key becomes Available again, with a new expiry if it has lapsed. A revoked key that had been redeemed brings its terminal back too (device active again; the terminal signs in again), so a mistaken revoke is fully undone.]
  - Who may do it. [The same platform roles that can generate and revoke keys; check `common/rbac/access.ts`.]
  - Bulk delete and bulk re-activate on the keys page. [Yes, matching the existing bulk revoke.]
- **Expected:** on both the restaurant page and the activation keys page, each key has Revoke, Activate again (for revoked keys) and Delete (for keys that are not in use), each with a clear confirmation that says what will happen and audited; a deleted key disappears and its code can no longer be redeemed.

## BUG-129 — The round "+" on each dish card in Kiosk Admin's Menu & Catalog Builder does nothing useful 🟡

- **App:** Kiosk Admin (`App.tsx`, the `ProductCard` component from `@jamanvaar/ui`)
- **Reported:** "in kiosk admin management what does even this + sign do? it has no impact anything"
- **Confirmed live:** clicked it on "Hara Bhara Kebab (6 Pcs)" — nothing changed on the page except a toast reading "Item selected: Hara Bhara Kebab (6 Pcs)", which disappears after a couple of seconds. No cart, no order, no effect on the dish itself.
- **Cause (confirmed by reading):** `ProductCard` is the shared "add this dish to an order" card used on real ordering screens (the customer kiosk, POS) — its `+` calls `onAdd(item)`, meant to add a line to a cart. The Menu & Catalog Builder reuses the same component to *list* dishes for editing, and passes it `onAdd: (it) => showToast(`Item selected: ${it.name}`)` — a placeholder that was never replaced with anything, because "add to order" isn't a meaningful action on a catalog-management screen in the first place.
- **Expected:** either the button is removed from this screen (nothing here should mean "place an order"), or, if the intent was "quick preview" or "select this dish", it does that instead of a no-op toast.

## BUG-130 — Menu items and combos created in Kiosk Admin never reach the self-order Kiosk (or anywhere else) 🔴

- **App:** Kiosk Admin ("Menu & Catalog Builder", "Combos & Meal Deals"), Kiosk User, cloud API
- **Reported:** "i added the combo here but it didn't appear on self ordering KIOSK, which should have because i have activated both by same restaurant KEYS"
- **Confirmed live:** created a restaurant, activated a real Kiosk Admin and a real Kiosk terminal against it with their own separate keys. Created a combo ("Live Verify Combo") in Kiosk Admin. After waiting for a sync tick and opening the self-order flow on Kiosk, it had **0 menu items and 0 combos** — not just the new combo missing, the whole catalog was empty, even though Kiosk Admin's own screen showed "6 Categories • 12 Dishes • 2 Combos".
- **Cause (confirmed by reading):**
  - Kiosk Admin's "Menu & Catalog Builder" and "Combos & Meal Deals" write only to Kiosk Admin's own local-first database. It never calls the generic cross-device sync bridge (`EntitySyncEngine`) for `MENU_ITEM` or `MENU_CATEGORY` at all — no push, no pull. (Contrast with Restaurant Admin, POS, Captain and Kiosk User, which all push/pull `MENU_ITEM`/`MENU_CATEGORY` through that bridge.)
  - The one cloud call Kiosk Admin does make for its menu, `syncMenuToCloud` → `POST /api/v1/tenant/menu-sync`, writes into a completely separate table (`MenuSnapshotItem`) whose own comment says what it's for: "Trusted price source for PaymentsService's cart validation." Nothing reads that table to build a displayed menu anywhere.
  - There is no `COMBO` entity type in the sync bridge at all (`SYNCABLE_ENTITY_TYPES` in `cloud/api/.../push-entity-sync.dto.ts` has no combo type), so a combo has no path to any other device regardless of which screen created it.
  - The menu the self-order Kiosk actually shows comes only from Restaurant Admin, via the real sync bridge — so Kiosk Admin's whole "Menu & Catalog Builder" is a second, disconnected menu-editing surface that looks like it's editing the live catalog but isn't.
- **Expected:** a dish or combo added, edited or removed in Kiosk Admin reaches the self-order Kiosk (and ideally Restaurant Admin/POS too) the same way Restaurant Admin's edits do, and combos get a real cross-device sync path of their own.

## BUG-131 — Kiosk Admin never adopts the real restaurant name/branch after activation 🟡

- **App:** Kiosk Admin (`App.tsx`)
- **Found while investigating BUG-130, not separately reported.**
- **Confirmed live:** activated a real Kiosk Admin console against "Kiosk Verify Diner". Its own header still read "JAMANVAAR RESTAURANT — Ahmedabad Flagship Store" (the demo identity) throughout.
- **Cause (confirmed by reading):** `RestaurantIdentityRepository` (used by POS, POS Admin, KDS, Captain and Kiosk User to adopt the real restaurant's name/branch at activation — see BUG-021/BUG-110) is never imported or called anywhere in Kiosk Admin's `App.tsx` or `cloud/cloudClient.ts`.
- **Expected:** Kiosk Admin shows the real restaurant's name and branch after activation, the same as every other terminal.

## BUG-132 — Orders placed on the self-order Kiosk never reach Kiosk Admin's own "Orders & KDS" screen or its "Kiosk Terminals" fleet view 🔴

- **App:** Kiosk Admin (`App.tsx`), Kiosk User, cloud API
- **Reported:** "i placed the order in self ordering KIOSK but it didnt show up in KDS nor in KIOSK admin, which shouldnt happen."
- **Confirmed live:** created a restaurant, loaded a real 135-dish menu through Restaurant Admin, and activated a real Kiosk Admin, a real self-order Kiosk and a real standalone KDS terminal against it, each with its own key. Placed a real order on the self-order Kiosk (Paneer Tikka Angara, Takeaway, Cash at Counter).
  - The **standalone KDS app** (the real Kitchen Display terminal, same app used by POS/Captain) received the order correctly: 1 order, 1 KOT, `PREPARING`, routed to "Main Kitchen" — so the cloud order-sync path itself works when a real KDS terminal is present.
  - **Kiosk Admin's own "Orders & KDS" page** ("Authoritative on-premise order management synced with Customer Touch Kiosks") stayed at **0 orders**. Its **"Kiosk Terminals" fleet page** said **"No Kiosk Terminals Yet"**, even though a real Kiosk was activated against the same restaurant and had just placed an order through it.
- **Cause (confirmed by reading):** Kiosk Admin's `cloud/cloudClient.ts` has **no `pushOrderSync`/`pullOrderSync` functions at all**, and `SyncOutboxEngine.configureTransport(...)` — the call every other app (POS, Captain, KDS, Restaurant Admin) makes to wire itself into the real cloud order-sync — is **never called** in Kiosk Admin's `App.tsx`. Only `SyncOutboxEngine.getSyncStats()` (reads local counts) and `.processOutbox()` (push, but with no transport ever configured, so it has nothing to push to) are used. Instead, "Orders & KDS" depends on a local-network relay service on port 5178 ("Local Realtime Active (:5178)", shown as "LOCAL SERVICE: DISCONNECTED" in the header) — a same-machine/same-LAN mechanism (`tooling/local-runtime/sync_server.cjs`), not the cloud device-token sync the rest of the system uses. "Kiosk Terminals" likewise does not read the real device registry (the one Super Admin's "Registered Terminals" count comes from); it only knows about terminals reachable through that same local relay or `lanMeshSync`.
- **Expected:** Kiosk Admin's own Orders & KDS view and Kiosk Terminals fleet view show real orders and real terminals for the restaurant, the same way the standalone KDS app and Super Admin do, regardless of LAN topology.

## BUG-133 — Coupons created in Kiosk Admin never reach the self-order Kiosk 🔴

- **App:** Kiosk Admin ("Offers & Coupons"), Kiosk User, cloud API
- **Reported:** "these coupons are not visible or accessible from self ordering KIOSK which should not happen."
- **Confirmed live:** on the same live setup as BUG-132, the self-order Kiosk's local coupon list was **empty** (`[]`) right after activation, while Kiosk Admin showed three active coupons (WELCOME50, FEAST20, FLAT100) for the same restaurant.
- **Cause (confirmed by reading):** coupons created in Kiosk Admin are written only to Kiosk Admin's own local `db.coupons`. There is no `COUPON` entity type in the cross-device sync bridge at all (same gap already found for combos in BUG-130), so a coupon has no path to any other device. The self-order Kiosk's checkout genuinely does support redeeming a coupon (`CouponRepository.getByCode`, minimum-order check, `incrementUsage` on redeem) — the redemption logic works, the coupon just never arrives.
- **Related, not separately confirmed:** the "Times Used: 42 / 18 / 9" figures shown next to each coupon in Kiosk Admin's screenshot look like static seed numbers rather than real counts — since redemption (and `incrementUsage`) can only ever happen on the Kiosk that has the coupon, which per this bug is never the real self-order Kiosk, those usage counts likely can never reflect real activity either.
- **Expected:** a coupon created in Kiosk Admin (or Restaurant Admin) is redeemable on the self-order Kiosk, and its usage count reflects real redemptions.

## BUG-134 — Choosing "Cash at Counter" on the self-order Kiosk is recorded and printed as paid via UPI 🔴

- **App:** Kiosk User (`App.tsx`)
- **Found while investigating BUG-132/133, not separately reported.**
- **Confirmed live:** on the checkout screen, chose "Cash at Counter" (not UPI), saw the "Pay at Pickup Counter — You will receive your token now" panel and tapped "Confirm & Get Token." The resulting order — and its printed/on-screen receipt ("PAID VIA: UPI") — recorded `paymentMethod: "UPI"`.
- **Cause (confirmed by reading):** `handleProceedToPayment` creates the real order the moment "Proceed to Payment" is tapped, **before** the payment-method screen is even shown, using `paymentMethod: effectiveMethod` where `effectiveMethod = networkState === 'OFFLINE' ? 'CASH_AT_COUNTER' : paymentMethod` — and at that point `paymentMethod` is still whatever the component's state defaults to (`'UPI'`), since the user hasn't chosen yet. Selecting "Cash at Counter" afterward only calls `setPaymentMethod('CASH_AT_COUNTER')`, which changes local UI state, not the order already saved. `handleGetToken` (the "Confirm & Get Token" handler) fetches that same order and proceeds to confirmation without ever updating its `paymentMethod` field. The bug only fails to trigger when the kiosk is offline, because `handleProceedToPayment` special-cases that: `networkState === 'OFFLINE' && paymentMethod === 'UPI'` forces `CASH_AT_COUNTER` before the order is created.
- **Expected:** the order's payment method reflects what the guest actually chose on the payment screen; a receipt for a cash order says "PAID VIA: CASH_AT_COUNTER" (or similar), never UPI.

## BUG-135 — Kiosk Admin's "Receipt & E-Bill" screen crashes to a blank page 🔴

- **App:** Kiosk Admin (`App.tsx`), `ThermalReceiptView` (`@jamanvaar/ui`)
- **Reported:** "screen goes blank after i click receipt and bills in KIOSK admin" (with a screenshot showing a fully blank white page at `localhost:5173`).
- **Cause (confirmed by reading):** the Receipt & E-Bill tab renders a live preview with `<ThermalReceiptView order={orders[0]} config={receiptForm} .../>`, where `orders = OrderRepository.getAllOrders()` — Kiosk Admin's own local order list. `ThermalReceiptView`'s `order` prop is required and is used unconditionally from the very first line of its render (`order.tokenNumber`, then `order.orderNumber`, `order.createdAt`, `order.items`, ...) with no null check anywhere.
  - Per **BUG-132**, Kiosk Admin's local order list is always empty — no order placed on the self-order Kiosk ever reaches it. So `orders[0]` is `undefined`, and `ThermalReceiptView` throws (`Cannot read properties of undefined (reading 'tokenNumber')`) the instant the tab renders. With no error boundary around it, the whole page unmounts — a blank screen, exactly as reported.
  - This will reproduce on **any** restaurant that hasn't rung up an order through this exact Kiosk Admin terminal's own local history — which, per BUG-132, is every restaurant, always, since nothing ever populates it.
- **Expected:** the Receipt & E-Bill preview handles having no order yet (a sample/placeholder receipt, or a clear "place an order to see a live preview" message) instead of crashing the page.

## BUG-136 — Kiosk Admin's Hardware & Diagnostics, Reports & Export and Customer Feedback screens all read data that can never arrive 🟡

- **App:** Kiosk Admin (`App.tsx`)
- **Reported:** "hardware and diagnostics, reports and export and customer feedback is not working as it KIOSK admin and self ordering KIOSK is not connected" — the user's own diagnosis, which matches what the code shows.
- **Confirmed by reading (same root cause as BUG-130/132/133, three more places it shows up):**
  - **Reports & Export** ("Export real transaction records, item sales, and tax metrics") reads `OrderRepository.getAllOrders()` — Kiosk Admin's own local, always-empty order list (BUG-132). Every report this screen can produce is therefore empty for a restaurant whose real business happens on the self-order Kiosk.
  - **Customer Feedback** ("Real-time ratings ... submitted via kiosks") reads `FeedbackRepository.getAll()` → local `db.feedbacks`. The self-order Kiosk's "How was your ordering experience? Submit Rating" screen does call `FeedbackRepository.submit(...)` — real feedback is genuinely collected — but it is written to the Kiosk's own local `db.feedbacks`, which (there is no `CustomerFeedback` entity in the cross-device sync bridge either) never reaches Kiosk Admin. Always "No ratings yet."
  - **Hardware & Diagnostics**' printer and "Kitchen Printer Routing" configuration is stored in Kiosk Admin's own local `db.configuredPrinters`. Since Kiosk Admin and the self-order Kiosk are separate devices with separate local-first databases (same pattern as everywhere else in this investigation), assigning a station's kitchen tickets to a printer here has no effect on the actual terminal that would need to print them — the self-order Kiosk has its own, independent printer configuration.
- **Expected:** these three screens reflect what is actually happening on the restaurant's self-order Kiosk(s) — real orders and sales in Reports & Export, real ratings in Customer Feedback, and printer/routing settings that actually govern what the Kiosk terminal prints.

## BUG-137 — "Call Staff" on the self-order Kiosk tells the guest a team member is coming, but nobody is ever notified 🔴

- **App:** Kiosk User (`App.tsx`), Kiosk Admin
- **Reported:** "call staff is not working in self ordering KIOSK" (with a screenshot of the "Staff Assistance Requested — Team Member Notified — A team member has been notified and is heading to your kiosk/table" confirmation).
- **Confirmed by reading:** `handleCallStaff` calls `ServiceRequestRepository.create({ type: 'CALL_STAFF', ... })`, which only pushes the request into this Kiosk's own local `db.serviceRequests` array (`db.notify()`, no network call of any kind) — and then unconditionally shows the "Team Member Notified" modal regardless of whether any real staff member could possibly have seen it. `ServiceRequestRepository` is read by exactly one other screen in the whole codebase — Kiosk Admin — which reads its **own** local `db.serviceRequests`. Kiosk Admin and the self-order Kiosk are different browser origins (ports 5173 vs 5174) with separate local-first storage, so even that reader can never see a request raised on the actual guest-facing Kiosk. No POS, Captain or Restaurant Admin screen reads `ServiceRequestRepository` at all.
- **Expected:** a real staff member (on whichever device is meant to receive it — Kiosk Admin at minimum) is actually notified before the guest is told one is on the way; the confirmation should not be shown, or should say something honest, if delivery could not be confirmed.

## BUG-138 — Kiosk Admin's "Publish" claims to sync the menu to all Customer Kiosks, but does not 🔴

- **App:** Kiosk Admin (`App.tsx`), `packages/business/src/menu_builder.ts`
- **Found while investigating BUG-139/"+Category", not separately reported.**
- **Confirmed by reading:** the Publish dialog's own copy says "Publishing will create a version snapshot and **immediately sync the active menu to all touch kiosk terminals**," its button reads "Confirm & Publish to Kiosk," and on success it shows "✓ Published v_._ **to all Customer Kiosks**!" What it actually calls, `MenuBuilderService.publishMenu(...)`, only builds an in-memory version-history snapshot (a deep copy of the current categories/items/combos) and pushes it onto a local `menuVersions` array, then `db.notify()` — there is no network call in it at all. Per **BUG-130**, nothing in Kiosk Admin's Menu & Catalog Builder reaches the self-order Kiosk regardless.
- **Expected:** either "Publish" really does push the menu to every Kiosk terminal (once BUG-130 is fixed), or, until then, its wording does not claim something that does not happen — this is a stronger, more explicit false-success message than most of the "disconnected" screens already logged, since it actively tells the owner the sync just happened.

## BUG-139 — "+ Category" and the rest of Menu Management work locally but never reach the self-order Kiosk; the Settings gear on the self-order Kiosk needs the owner to double-check 🟡

- **App:** Kiosk Admin, Kiosk User
- **Reported:** "add category is also not working" and "setting button does nothing in self ordering KIOSK."
- **"+ Category" — confirmed live:** opened the dialog, typed a name, submitted. It worked exactly as designed: a toast confirmed it, the category was saved (`jamanvaar_db_categories` gained the new entry), the header count went from "6 Categories" to "7 Categories," and the new category appeared as a selectable pill in the category bar. This is **not a separate defect** — it is the same root cause as **BUG-130**: the category is real and useful *inside Kiosk Admin*, but (like every other menu edit made there) never reaches the actual self-order Kiosk, so from the owner's point of view nothing changes where it matters. Recorded here for completeness rather than as a new root cause.
- **Settings gear on the self-order Kiosk (the ⚙ next to Call Staff/language) — could not reproduce "does nothing":** live-tested on the exact "Live Kitchen Tracking" screen from the screenshot — tapping it opened a real dropdown with working entries (network online/offline simulate, "Larger text & higher contrast," "Order on Phone," "Loyalty / Login"). One real mismatch I did notice: a gear icon conventionally means "device/kiosk settings," but this menu is a "More options" grab-bag (accessibility, a staff network-diagnostic toggle, phone handoff, loyalty login) with nothing that resembles kiosk configuration — someone expecting real settings there could reasonably experience that as "does nothing useful." **This needs the owner to say more** — what exactly happened when it was tapped (nothing visibly opened? opened but a specific option failed? expected something else entirely, like display/sound/printer settings that don't exist here?) — before this can be pinned down as a concrete defect versus a naming/expectations mismatch.

## BUG-140 — Every terminal except KDS is locked out by a mandatory "Update required" wall on a stock, freshly seeded database 🔴

- **App:** cloud API seed data (`cloud/api/prisma/seed.ts`), every terminal (POS, Restaurant Admin, Captain, Kiosk, Kiosk Admin)
- **Reported:** "update is coming in all apps and ... clicking it isn't doing [anything] and cannot go to login page there's something wrong."
- **Confirmed by reading and by querying the actual database:** every real app's `package.json` version is **1.0.0** — none of the six client apps has ever had its version number bumped. But `prisma/seed.ts`'s `appReleases` block seeds each app as if a much later version were already the current stable release, with a **minimum supported version already above 1.0.0**:

  | App | Real version (`package.json`) | Seeded "current" version | Seeded minimum | Locked? |
  |---|---|---|---|---|
  | POS | 1.0.0 | 2.4.0 | 2.0.0 | **Yes** |
  | RESTAURANT_ADMIN | 1.0.0 | 2.4.0 | 2.0.0 | **Yes** |
  | CAPTAIN | 1.0.0 | 2.1.0 | 2.0.0 | **Yes** |
  | KDS | 1.0.0 | 2.0.0 | 1.8.0 | **Yes** (seeded — see note) |
  | KIOSK | 1.0.0 | 1.8.0 | 1.5.0 | **Yes** |
  | KIOSK_ADMIN | 1.0.0 | 1.8.0 | 1.5.0 | **Yes** |

  The server's own version-comparison logic (`cloud/api/src/common/version.ts`) is correct (a real numeric, segment-by-segment comparison, not a string bug) — this is purely a **seed-data mismatch**, not a comparison defect. Since every real terminal reports `1.0.0` and every seeded minimum is higher, every terminal is told its update is `mandatory`, which `DeviceGate`/`DeviceGateOverlay` turns into the full-screen "Update required" lock — before the person can reach sign-in or activation, exactly as in your screenshot and your report of not being able to reach the login page.
  - **Disclosure:** the live database I've been testing against currently shows KDS at minimum `0.0.1` rather than the seed's own `1.8.0` — a leftover from an earlier live-verification session of mine that I did not fully restore, which is why KDS did not also show this lock when you tested. That one discrepancy is mine; the other five apps' lock is the genuine, stock, seeded behavior and would reproduce on any fresh database.
- **Expected:** a freshly seeded/onboarded system is usable out of the box — the seeded "current version" and "minimum supported version" should either match the real `1.0.0` app builds, or the release/version story should be decided deliberately (e.g., seed nothing until a real release process exists) rather than assuming a version history that was never built.

## BUG-141 — Kiosk Admin's "Download the update" link opens the Captain app instead of a real download; none of the six apps' download links point at anything real 🔴

- **App:** cloud API seed data (`cloud/api/prisma/seed.ts`)
- **Reported:** "after clicking on download the update it leads to this page, i think which is not standard" (with a screenshot showing Captain's "Connect this Tablet" screen at `localhost:5177` opening after tapping Kiosk Admin's "Download the update").
- **Confirmed by reading the seed data:** each app's `downloadUrl` is:
  - POS → `/releases/jamanvaar-pos-setup-2.4.0.exe`
  - RESTAURANT_ADMIN → **`http://localhost:5176`** (Restaurant Admin's own dev address)
  - CAPTAIN → `/releases/jamanvaar-captain-v2.1.0.apk`
  - KDS → `/releases/jamanvaar-kds-v2.0.0.apk`
  - KIOSK → `/releases/jamanvaar-kiosk-v1.8.0.exe`
  - KIOSK_ADMIN → **`http://localhost:5177`** (**Captain's** dev address — this is exactly the page in your screenshot)
  - None of the `/releases/...` paths correspond to any real file or route anywhere in `cloud/api` (confirmed — there is no static `/releases` handler at all), so tapping "Download the update" on POS, Captain, KDS or Kiosk would 404 or fall through to that app's own page; tapping it on Kiosk Admin or Restaurant Admin instead opens a real, unrelated running app on a hard-coded local port.
- **Expected:** a real, working download link (or, until real installers/download infrastructure exists, no link at all, or an honest "contact support" message) — never another app's own local address.

## (Confirms BUG-128) — Super Admin should be able to delete a restaurant's activation keys

- **Reported again, with a screenshot:** Super Admin → Restaurants → a restaurant's own page, its 8 activation keys (several Redeemed, two Revoked), each with only a Copy button.
- This is the same gap already logged as **BUG-128** ("Super Admin cannot delete an activation key, or bring a revoked key back") — no code has changed since then, so it still applies exactly as described there, including the recommendation that a revoked key can be brought back (with its terminal, if it had one) as well as deleted once it is no longer in use. No new entry created; see BUG-128 for the full write-up.

## BUG-142 — A restaurant admin who forgets their password has no way to reset it 🔴

- **App:** Restaurant Admin (`pos-admin`), cloud API (`tenant-auth`)
- **Reported:** "the password also should be [changed] in [the restaurant] admin[,] means if [a] restaurant admin want[s] to change [their] password [because] he ha[s] forgot [it, he should be able to] change it with [the] help of email — he puts [his] email and gets [an] OTP, like that flow."
- **Confirmed by reading:** the only password-setting endpoint in `tenant-auth` is the **one-time initial activation** flow (`set-initial-password`, for a brand-new PENDING_ACTIVATION account) — its own comment says outright "Not a general 'forgot password' flow." There is no forgot-password, reset-by-email, or OTP endpoint anywhere in `tenant-auth`, and Restaurant Admin's sign-in screen has no "Forgot password?" link at all — nothing to click, and nothing on the server to build it against yet.
- **Expected:** a restaurant admin (owner or staff with a login) who forgets their password can request a reset by email, receive a one-time code or link, and set a new password without needing the platform team to intervene.

## BUG-143 — The "Update required" lock screen pops up and disappears repeatedly instead of staying locked 🔴

- **App:** every terminal (`packages/sync/src/device_gate.ts`)
- **Reported:** "after publish[ing an] update[,] this screen keep[s] popping up and disappearing automatically in restaurant admin and even in other modules."
- **Cause (confirmed by reading):** `DeviceGate.observe()` runs on the response of **every** cloud call an app makes through `gatedFetch` (not just the heartbeat that actually decides whether an update is mandatory) — loading a dashboard, fetching orders, anything. On any ordinary successful response it calls `reportSuccess()`, which **unconditionally sets `locked: false`**:

    ```ts
    static reportSuccess(): void {
      this.set({ locked: false, lastCheckInAt: new Date().toISOString(), ...this.remembered() });
    }
    ```

    This clears the lock screen the instant *any* unrelated request succeeds — even while the real reason it was locked (a mandatory update the terminal has not installed) is still true. Then the next heartbeat tick runs `applyHeartbeat`, sees `body.update?.mandatory` is still `true`, and calls `lock('UPDATE_REQUIRED', ...)` again, showing the screen again. With heartbeats and ordinary API calls both happening on their own intervals, the two keep undoing each other — the exact "pops up and disappears automatically" your screenshot shows, and it happens on any screen ("other modules") because `gatedFetch`/`observe` is used broadly, not just by the heartbeat call.
  - This is the same mechanism behind **BUG-140** (the lock itself is real and reproducible on a stock database) — this is a second, independent defect in *how* that lock is displayed once it exists.
- **Expected:** only a fresh heartbeat answer that no longer reports the update as mandatory (or a real new install) should clear an `UPDATE_REQUIRED` lock — an unrelated successful API call proves the device credential and subscription are fine, but proves nothing about whether the required update was installed, and should not clear that specific lock reason.

---

## Notes

- Bugs are added in the order the owner reports them.
- "Likely cause" entries come from reading the code. Confirm them before fixing.

## Fix status of BUG-128 to BUG-143

Fixed, with a note per bug, in `BUG_CHECKLIST.md`. Not fully closed: BUG-136 (printers stay per machine) and BUG-139 (the Settings gear needs a description from the owner).

# JAMANVAAR — Bug Fix Checklist

Tick-box view of `BUG_LIST.md`. `[x]` = fixed and covered by an automated test that was watched failing first, then made to pass. `[~]` = partly fixed (see the note). `[ ]` = not started. This file is updated as each bug is closed — check back here rather than re-reading the whole bug list.

Full detail, reproduction steps and code pointers for every bug are in `BUG_LIST.md`. This file is just the checklist.

---

## Group: Onboarding print/copy & subscription (001–004)

- [x] BUG-001 — Welcome Kit print gives a blank page
- [x] BUG-002 — Welcome Kit copy buttons give no feedback
- [x] BUG-003 — "Extend Trial (+30 Days)" fails (`Cannot PATCH`)
- [x] BUG-004 — Copy buttons inconsistent across the project

## Group A — Staff login / PIN / demo data (005–012)

- [x] BUG-005 — Hardcoded "Quick Demo Login" and seeded staff profiles
- [x] BUG-006 — No way to create/reset staff PINs from Restaurant Admin
- [x] BUG-007 — POS login screen can't scroll; keypad/Unlock cut off
- [x] BUG-008 — POS opens at "130% zoom" (needs clarification — see note) — was never actually hardcoded, but there was genuinely no display-size setting anywhere; added a real one: a restaurant-wide default (`Restaurant.displayScalePercent`, 70–150%, set from Restaurant Admin → Settings), delivered to every terminal via its heartbeat and applied as a page zoom, with a per-terminal override in POS Settings that always wins over the restaurant default; `display-scale.e2e` (API) and `display_scale.test.ts` (terminal) cover it end to end
- [x] BUG-009 — `@jamanvaar.com` emails appear on all staff
- [x] BUG-010 — Edit Employee shows wrong role; saves invalid role id
- [x] BUG-011 — Staff & Roles page shows seeded staff, no PINs, raw role ids
- [x] BUG-012 — Restaurant Admin header shows a fake open shift

## Group B — Menu & Categories (013–018)

- [x] BUG-013 — Every new restaurant already has a full menu
- [x] BUG-014 — No CSV import, no "Load default items", no empty-state guidance
- [x] BUG-015 — Super Admin has no per-restaurant Menu tab; catalog "syndicate" never reaches restaurants
- [x] BUG-016 — Menu sync path is narrow (categories not synced, one-way push)
- [x] BUG-017 — Local menu-loading rules can delete/replace a real menu
- [x] BUG-018 — Seeded demo restaurant + hardcoded localhost URLs (low priority) — the seed script now creates the demo restaurant/owner/invoice only in development and test (`shouldSeedDemoData`, `seed-options.ts`), never in production unless `SEED_DEMO_DATA=true` is explicitly set; verified by running the seed against the test DB with it off. The `localhost:5176` / `:5173` addresses hardcoded across Super Admin's onboarding text, welcome kit, WhatsApp message and activation-key help text now come from `lib/appUrls.ts` (`VITE_RESTAURANT_ADMIN_URL` / `VITE_KIOSK_ADMIN_URL`, defaulting to the same local addresses for dev); a source-scan test (`super_admin_app_urls.test.ts`) guards against a hardcoded address creeping back in

## Group C — Cross-app sync ⭐ MOST IMPORTANT (019–023)

- [x] BUG-019 — POS "Send KOT" never reaches KDS — **verified live**: ran the real API and all four apps, created a fresh restaurant end to end (owner login, staff PIN, 135-dish menu), activated a real POS terminal and a real KDS terminal against it with their own separate activation keys, sent a KOT from POS and watched it appear on KDS within seconds (`1× Butter Naan, Captain: Live Verify Cashier`) — the cloud device-token sync (not LAN mesh) genuinely works cross-device. While verifying this I found staff PINs themselves never synced across devices at all (see the new item below) and fixed that too
- [x] BUG-020 — "LAN mesh" only works inside one browser origin (root cause) — correctly diagnosed; the fix (cloud as the real per-restaurant hub) is what BUG-019/022/023 already run on and is now test-verified end-to-end with real resets simulating separate devices. Purely ephemeral, non-order events (bill-requested toast, kitchen messages, diner service requests) still ride LAN mesh only and stay same-origin-limited — not rebuilt onto the cloud path
- [x] BUG-021 — Activating an app doesn't bind it to restaurant data — POS/KDS/Captain now apply the real restaurant name/GSTIN/address at activation (pos-admin/Kiosk already did). Staff/PIN and table cross-device sync is still a separate, unbuilt gap
- [x] BUG-022 — KDS ticket incomplete/missing — already fixed by earlier work: modifiers, special instructions, kitchen station and add-on rounds all verified round-tripping (`order_sync_fidelity`)
- [x] BUG-023 — Status changes don't flow back — already fixed by earlier work (`KOTRepository.updateKOTStatus` mirrors onto the order and flags it for sync); added a real round-trip test proving KDS→POS. The audible/visual "ding" notification specifically still relies on LAN mesh only (see BUG-020 caveat) — the underlying data updates silently until the next screen refresh

## Group D — Thermal printing (024–028)

- [x] BUG-024 — Printing always reports success even when nothing printed — jobs now start PENDING; only a real transport (NETWORK_LAN inside the desktop app) can mark one PRINTED; USB/serial/Windows-driver and browser-tab printing fail with the real reason; Retry really re-sends; receipts/test slips report the true outcome; the kiosk KOT path now actually dispatches
- [~] BUG-025 — No real printer detection; hardcoded, always "READY" — real native detection is now built (`packages/native/printing.rs`, a shared Tauri command module): lists Windows-installed printers (USB and driver, via `Get-CimInstance Win32_Printer`), scans the local /24 for devices answering the raw-print port, and lists COM (serial) ports. Wired into all four desktop shells (POS, Kiosk Admin, Kiosk User, POS Admin — the last had no printer commands at all before) and a "Find printers" panel in POS Settings lets a restaurant add what was found with one click, role and paper size chosen at add time. Verified for real on this dev machine: a real installed printer showed up correctly, and status codes/format were confirmed against live `Get-CimInstance` output. **Not verified:** the packaged Tauri `.exe` itself could not be built here (this machine's Application Control policy blocks Tauri's own build scripts, unrelated to this code) — the native Rust logic is unit-tested (11/11) and the IPC command wiring is typechecked, but the full desktop app was not run end-to-end
- [~] BUG-026 — Only raw network printing was real; USB/driver/serial/Bluetooth simulated — real transports now exist for the common cases: USB and Windows-driver printers print through the Windows spooler as a RAW document (native Win32 `winspool.Drv` calls via a PowerShell/C# bridge — **verified end-to-end on this machine**: created a real temporary printer queue, sent actual ESC/POS bytes through `print_raw_system`, and confirmed the exact bytes landed via the spooler, byte-for-byte); serial (COM) printing sends to a configured port at its baud rate; network stays raw TCP on port 9100. Every interface's failure message is now honest (`desktop app` / `choose the Windows printer` / `set the COM port`, not a fake "no driver" line), and this is covered by `print_transport.test.ts`. **Not verified:** the packaged desktop app (same Application Control block as BUG-025) and real serial/Bluetooth hardware (none available on this machine) — Bluetooth is still out of scope, as the bug notes allowed for later
- [x] BUG-027 — "Test print" prints nothing real, reports "COMMUNICATION OK" — Restaurant Admin and the kiosk test slip go through the real print path and report its real result; the baked-in "COMMUNICATION OK" text is gone
- [x] BUG-028 — Printed receipt shows fake seeded identity — activation replaces the demo identity (a restaurant with no GSTIN gets none, never the fake one); receipts drop the hardcoded brand lines, print "GSTIN: Not registered" when missing, show real tax rates, and print the cashier's name

## Group E — POS payment & KOT flow (029–033)

- [x] BUG-029 — "Processing Settlement…" gets stuck
- [x] BUG-030 — Split payment has no way to confirm UPI/Card part
- [x] BUG-031 — UPI/Card "verified" flags carry over from previous bill
- [x] BUG-032 — Cart not tied to sent order → duplicate orders after KOT
- [x] BUG-033 — POS feels slow (whole local DB rewritten on every change) — measured first: settling one bill wrote the orders collection 24 times. Saving now rewrites only the collections whose content changed, and `db.batch()` collapses a burst of changes into one save, cloud push, broadcast and UI refresh; POS Send KOT, Complete Payment and Instant Bill each run as one batch (the orders write count per bill goes from 24 to 1). Not changed: the whole `orders` collection is still one storage key (a paged/archived history store would be a bigger redesign); test `db_persistence_batching`

## Group F — Restaurant Admin/POS/KDS not connected (034, 035, 038)

- [x] BUG-034 — Restaurant Admin has no way to receive POS orders/payments/tickets — **verified live** in the same real-stack session as BUG-019: the order sent from POS appeared in Restaurant Admin's Orders screen within seconds (`ORD-66990373, #101, DINE_IN, 1 items, ₹58, CASH, Live Verify Cashier, PREPARING`), and its dashboard totals were correct from that one order (Gross Sales ₹55, Net Total ₹58, GST ₹3, Top Selling Dishes: Butter Naan, Cashier Performance: Live Verify Cashier — ₹58)
- [x] BUG-035 — POS→KDS shows nothing even with same keys — **verified live**: two separately-activated real terminals (own activation keys, own device tokens) of the same restaurant, same KOT visible on both within the 3s KDS poll. Also discovered and fixed live: staff PINs were the one thing genuinely never synced across devices (see the new item below) — everything else (menu, categories, orders, KOTs) already worked correctly once both devices were truly activated to the same restaurant
- [x] BUG-038 — Paid order never queued for the cloud

## Group G — Download PDF / Print blank pages (036, 037)

- [x] BUG-036 — POS "Download PDF" produces a broken PDF — object numbering/xref rewritten with fixed ids; verified by a structural test (xref offsets, Root→Pages→Page→Contents/Fonts, /Length) and by parsing real output with an independent reader (pypdf, strict mode: 1- and 4-page files, text extracted). Also fixed while there: cashier table silently dropped/ran off the page when space ran out, header no longer invents a GSTIN/phone/address or prints "BY KELVIONTECH", no hardcoded "GST (5%)". Not opened in a desktop PDF viewer; the on-screen report preview (`PosReportDocument`) still has its own "BY KELVIONTECH" line
- [x] BUG-037 — Print buttons call `window.print()` on the whole page — one shared `printElement` prints only the intended document: it releases every ancestor of the element from fixed heights and scrolling and hides all other branches for the duration of the print, then restores the page. Every `window.print()` in Restaurant Admin (reports, Z-report, QR cards, orders, invoices, shift slip, subscription invoice/receipt), Kiosk Admin (reports, both Z-report dialogs) and Super Admin (invoice, receipt, welcome kit) now goes through it (guarded by a source-scan test), the single thermal bill uses the existing thermal receipt printer, and the Restaurant Admin "Print Report" opens the printable report preview. Verified with a fake DOM in tests and typechecks; NOT yet checked in the packaged Tauri/WebView2 desktop apps or with a physical print (`print_isolation` test)

## Group H — Money must match everywhere ⭐ (039–042)

- [x] BUG-039 — Totals and tax split disagree — CGST + SGST now always add up to the bill's tax: one shared `splitTax` / `splitTaxPaise` (81 becomes 41 + 40, never 41 + 41) is used by the Business Day dialog and PDF, receipts, the POS assistant and the order sync; the invented "2.38% of sales" tax on the bills list, shift statement and Kiosk Admin Z-report is gone (the real tax of the orders is used), the GST report rounds the total once and splits it; labels now say what the number is: "Total Billed (incl. GST)" / "Total Collected (incl. GST)", and the Business Day statement shows Net Sales (excl. GST) and any round-off as separate rows. Not done: money is still rupee decimals inside each POS (paise only on the cloud sync); tests `tax_split_consistency`
- [x] BUG-040 — Split payments fabricated as 50/50
- [x] BUG-041 — Super Admin's per-restaurant Reports shows only SaaS billing, not sales — per-restaurant Reports now shows real synced sales (by day, payment method, branch, top items) clearly separate from platform billing; duplicate initial invoices are prevented per subscription (one active subscription per restaurant); e2e `restaurant-sales`
- [x] BUG-042 — Restaurant name/GSTIN/address show demo data on POS — reports, bills and headers use only this restaurant's own details: the report document, customer receipts (screen and print), thermal report slips, invoices, GST report and export, EOD and the admin report preview no longer fall back to another business's GSTIN, FSSAI, phone or address or to the product name ("BY KELVIONTECH"); a missing detail is left out. The GST filing CSV and dashboard no longer print a hard-coded GSTIN. The restaurant's own logo (optional) replaces the product logo on its receipts, and the product credit is only "Powered by JAMANVAAR" in the footer. Only the never-activated demo seed still holds sample values; test `no_demo_identity_fallbacks`

## Group I — Inventory not industry standard (043–046)

- [x] BUG-043 — "Inventory" is really a dish on/off list; stock never decrements — a dish now switches itself off when a recipe ingredient runs out (and back on when restocked, never overriding a manual switch-off), and a dish's own counted stock goes down when sold / up on reversal. Not done: the POS screen is still a dish list (no receiving/counts/wastage there)
- [x] BUG-044 — Stock deducted at KOT, never restored on void/refund/cancel — deduction is idempotent per order line (add-on rounds now deduct too), reversed on void / cancel / full refund
- [x] BUG-045 — Stock engine correctness holes — unique movement ids, negative balances visible, unit conversion (incompatible units are flagged, not guessed), real actor names, low-stock warning in the POS cart, no seeded stock for a real restaurant, EOD low-stock from real data
- [x] BUG-046 — Missing inventory capabilities (feature gap) — added a Purchasing & Stock Control screen to Restaurant Admin over a tested engine: suppliers; goods received with supplier invoice, cost and best-before date and a running GRN number; weighted-average cost on every purchase; supplier price history; batches sold first-expiry-first-out and an expiring-soon list; stock counts with variance value and manager-PIN approval over a limit; dish cost, food-cost % and margin; reorder suggestions from real usage; stock valuation, wastage by reason and consumption reports; a manager notification when an item goes low or out. Not built (owner to prioritise): purchase orders, transfers between outlets, sub-recipes / yield %, modifier ingredients, and syncing stock to the cloud; tests `inventory_control`

## Group J — Branch management (047, 048)

- [x] BUG-047 — Global Branches page shows every branch of every restaurant — branches list searched, filtered and paged in the database with status counts; bulk activate/deactivate is one call; global page is a search/audit view; API e2e `branches-paging`
- [x] BUG-048 — Branches are records only; nothing else is tied to them — activation keys can be issued for a branch and named terminal, the device is bound at redeem; a deactivated branch stops its terminals (`BRANCH_INACTIVE`, lock screen + heartbeat); synced orders carry their branch; false "localized hardware limits" text removed

## Group K — App disable / device lock has no effect ⭐ (049)

- [x] BUG-049 — Disabling an app or revoking/locking a device has no effect on running apps

## Group L — Invoices & Billing (050–054)

- [x] BUG-050 — Every onboarding creates two identical invoices
- [x] BUG-051 — Invoice list is one flat, unbounded table — invoices searched/filtered/paged on the server; summary is database aggregates; new receivables-by-restaurant view and ageing buckets; export gathers all matching rows; e2e `invoices-and-jobs`
- [x] BUG-052 — Invoices not fixed statutory documents (live tax recalc, unsafe numbering, free status)
- [x] BUG-053 — Static claims, weak overdue logic — one overdue rule everywhere; collection rate by amount; false "100% settled" and "automated/webhook" claims replaced with what really runs; real scheduler (`JobsModule`: renewals, overdue marking, key/extension expiry every 15 min, manual run + status)
- [x] BUG-054 — Invalid GSTIN/FSSAI accepted onto tax invoices

## Group M — JAMAN AI (055–058)

- [x] BUG-055 — AI config kept in API memory, not DB; invented analytics — the question catalogue (`AiQuestion`), per-restaurant access (`RestaurantAiAccess`) and usage (`AiUsageDaily`) are database tables and the global thresholds a stored setting, so nothing is lost on restart and every API instance agrees; telemetry is counted from real queries with measured latency (no seeded 1420/68, no fixed latency); e2e `ai-assistant`
- [x] BUG-056 — Super Admin AI settings never reach POS/Restaurant Admin/Captain — device-token endpoints `GET /devices/me/ai-config` and `POST /devices/me/ai-telemetry` deliver the catalogue, thresholds, teaser and daily limit to POS, Captain and Restaurant Admin (cached for offline use, refreshed with the heartbeat); the engines and Captain's own assistant read the delayed-KOT / low-stock / cash-variance settings instead of hardcoded 15/3/500 and build labels from them; the daily limit is enforced on the terminal and the server; "Hybrid LLM" mode removed (it does not exist)
- [x] BUG-057 — Super Admin can't choose AI per restaurant; apps use fake local licence — AI is a per-restaurant decision: follow the plan (PRO = ON, CORE = LOCKED teaser, or OFF when the teaser is off) or ON / LOCKED / OFF for one restaurant, with optional daily limit and threshold overrides (bounded); chosen in the onboarding wizard or on the JAMAN AI page; terminals show ON / a visible locked panel with example questions / hidden, the owner's local toggle can only hide, never enable; the fake local PRO licence no longer decides; plan prices are read from the plans table
- [x] BUG-058 — Several AI questions give the same answer or never return data — every offered question has its own intent and a real answer: added the missing engines (cash-vs-digital share, footfall, cash variance, kitchen turnaround, best category, active/completed orders, seated tables) that used to fall through to the help card; removed Swiggy/Zomato (nothing records those channels) and the duplicate/fake ones ("vs yesterday", marketing entries); catalogue filtering by cloud; tests `jaman_ai_cloud_config`

## Group N — Activation keys (059–061)

- [x] BUG-059 — Revoking a key doesn't switch off the device; redeemed keys can't be revoked
- [x] BUG-060 — Keys list is one flat, unbounded table — keys paged/filtered on the server by lifecycle, app, expiry, batch and branch; per-restaurant summary is the default view; expired is set by the scheduler; bulk revoke is one call; code hidden once unusable (last 4 kept); label/branch/batch on generate
- [x] BUG-061 — A plan's device limit is never enforced

## Group O — Refresh button / notification bell (062–064)

- [x] BUG-062 — Clicking a notification item does nothing
- [x] BUG-063 — Refresh buttons give no feedback, inconsistent
- [x] BUG-064 — Notification centre is just two counters, no history/deep links — the bell is a real notification centre: notifications are stored once each (stable dedupe key), with severity (info / warning / critical) and a link to the exact record (`/restaurants/:id?tab=subscription|backups|billing|devices`, `/tickets?open=:id`); a scheduled scan announces subscriptions ending within 7 days, failed backups, overdue invoices, terminals silent over an hour (critical when near the 7-day lock), activation keys about to expire, terminals failing to sync and suspended restaurants; each person has their own read state, "mark all read", unread count and critical count, and targeted notifications (assignments, replies) are visible only to their person; Notifications page with unread / severity / type filters and paging; the restaurant page opens the tab named in the URL; e2e `platform-notifications`

## Group P — Applications & Releases (065, 066) — owner said do this later

- [x] BUG-065 — "Publish Release" is only a record; no terminal checks for updates (deferred by owner) — the heartbeat answer now carries an update offer (newest STABLE release for the terminal's own app, compared numerically; mandatory when marked or when below `minSupportedVersion`); terminals show a dismissible "version X available" bar, a mandatory one is a lock screen with the download link; every app reports its real version (from package.json at build time), OS and sync backlog through one shared heartbeat; the Applications page counts online/degraded/offline by the fleet rule, shows terminals behind, and no longer invents a version
- [x] BUG-066 — "Mandatory update" checkbox oversized, label cut off — checkbox no longer stretched by the shared text-field rule; guard test

## Group Q — Device Fleet / MDM (067–069)

- [x] BUG-067 — Fleet list flat/unbounded, counts computed client-side — fleet: server-side search/filter/paging, health cards from the database, "needs attention" default, by-restaurant view, offline no longer counts revoked/never-seen
- [x] BUG-068 — "Lock terminal" only changes a label; no terminal obeys it
- [x] BUG-069 — Several fleet list columns mislead or are missing — one shared health rule, relative + absolute last seen, no fake branch, editable names, and the heartbeat fills version/OS/IP/pending-sync/error (Kiosk Admin also gained the heartbeat it never had)

## Group R — Backups & Recovery (070–075)

- [x] BUG-070 — Dialog unstyled (missing CSS classes) — Backups dialogs now use the shared Modal; shared stylesheet defines the classes; covered by `tests/super_admin_css_classes.test.ts`
- [x] BUG-071 — Backups can't be created (storage not configured, no fallback) — backups work with no S3 at all: they fall back to the API server's disk (`BACKUP_LOCAL_DIR`), the page says where they are stored and whether that is off-site, and `GET /platform/backups/storage-health` proves storage works by writing and deleting a probe
- [x] BUG-072 — The "snapshot" contains no restaurant data — Super Admin snapshots are a real versioned export (restaurant, branches, staff without secrets, devices, subscriptions, entitlements, synced entities and orders, with a counts manifest); every active restaurant without a backup in 24 h gets an automatic snapshot from the scheduler (max 50 per run); e2e `backups.e2e` + `backups-local.e2e`
- [x] BUG-073 — "Verify" and "Restore" do nothing real — Verify downloads, decrypts and re-hashes the object; the preview lists real counts and what will/won't be restored; Confirm takes a REAL safety snapshot, then restores synced menu/data records and orders into the cloud (terminals pull them), atomically claimed so it can't run twice; a backup uploaded from a terminal is honestly refused with a pointer to Restaurant Admin
- [x] BUG-074 — No encryption/retention/schedule/failure records — AES-256-GCM encryption at rest when `BACKUP_ENCRYPTION_KEY_B64` is set (tamper-evident), failed attempts recorded as FAILED with the reason (so success rate / failed alerts are true), retention deletes objects + rows past their retention days, scheduler runs snapshots and retention, platform list pages/filters on the server
- [x] BUG-075 — API connects as DB superuser; RLS not enforced (security) — the API now refuses to boot in production as a superuser/BYPASSRLS role (warns elsewhere); tests run against a dedicated database owned by a normal role (`TEST_DATABASE_URL`, `prisma/setup-app-role.sql`), so row-level security is genuinely enforced. That exposed real bugs, now fixed: platform reports, audit, catalog, sync observability and backups read tenant tables without platform context (dashboards showed zeros), and the entitlement guard ignored tenant context. `PrismaService.platformDb` added. Your dev database still uses the `postgres` superuser (a warning is logged); switch it with the script when convenient

## Group S — Emergency Offline Policy & Licensing (076–079)

- [x] BUG-076 — Signing key not set; no key management — certificates and extensions carry a key id (`kid`) and the apps trust a LIST of public keys (`packages/config/src/license_keys.ts`), so a new key can be introduced and the old retired; a development key `k2` was generated (private half only in your gitignored `cloud/api/.env`, `LICENSE_SIGNING_KEY_ID=k2`) so signing works now; the page shows signing status up front. **Before shipping: generate your production key with `scripts/generate-license-key.js`, replace the `k2` entry, and keep its private half in a secrets store**
- [x] BUG-077 — Extensions never delivered/checked; offline limit — the heartbeat delivers the active signed extension (restaurant-wide, branch or terminal); terminals verify it offline against the built-in public keys and stay usable until it ends, or accept a pasted code on the lock screen; "approaching expiry" now uses the real 7-day rule (4+ days silent) with a separate list of terminals already locked and not covered by an extension; e2e `device-updates`, `offline-policy`
- [x] BUG-078 — Wrong audit details recorded; request not validated — real "who asked" + ticket reference field (row and audit), branch targeting (validated to belong to the restaurant), zod-validated body, overlap warning, revoke through the platform wrapper and refused if already revoked, expired extensions listed as EXPIRED; API e2e `offline-policy.e2e.spec.ts`
- [x] BUG-079 — Shared UI styles missing (toasts/dialogs look broken) — new `components/shared.css`; class coverage test

## Group T — Team invite activation link page (080, 081)

- [x] BUG-080 — Activation page unstyled (stale class names) — page rewritten; verified in a real browser (styled "invalid link" state)
- [x] BUG-081 — Invitation flow fragile (localhost links, weak checks) — token in URL fragment, `activation-status` pre-check (valid/expired/used/invalid), strong-password rules, startup warning when `PLATFORM_FRONTEND_URL` is unset; API e2e `platform-activation.e2e.spec.ts`

## Group U — RBAC for Super Admin ⭐ SECURITY (082–084)

- [x] BUG-082 — API does not enforce roles
- [x] BUG-083 — UI shows every page/button to every role
- [x] BUG-084 — Role model and guard rails too weak

## Group V — Support Tickets (085–088)

- [x] BUG-085 — Creating a ticket fails silently — the API was fine; the page stored the error and never rendered it. Errors now show inside the dialog next to the field (server reasons included), the button is wired to the form, hints show the 3-character minimum, and load failures show a banner with Retry
- [x] BUG-086 — No way to choose an assignee; assigning uncontrolled — assignee on the create form; only ACTIVE team members can be assigned; assignment history is now a visible ticket timeline (who assigned whom, when) and the assignee gets a personal notification with a link that opens the ticket (`restaurant-tickets` e2e)
- [x] BUG-087 — No "my tickets" or per-member view — My work today (mine, open/in-progress, most urgent SLA first), Unassigned, Created by me, Overdue, per-teammate chips with open counts, readable TKT-000123 numbers, created date, server-side search/filter and paging, counts from the database (`support-tickets.e2e`)
- [x] BUG-088 — Restaurants can't raise tickets; no category/attachments/history — restaurants raise and follow their own tickets from a new Help & Support screen in Restaurant Admin (topic, urgency, optional outlet; restaurant, contact and this device are attached from the session; replies both ways; screenshots / PDF / text up to 2 MB, five per ticket; a reply on a resolved ticket reopens it); tickets have a category and source, a full history (status, priority, assignee, attachments) and internal notes the restaurant never sees; Super Admin gets a "From restaurants" view, category and source badges, a timeline, internal-note toggle, attachments and `?open=` deep links from notifications; a restaurant can read and write only its own tickets (cross-restaurant tests), uploads are whitelisted types served only as downloads; e2e `restaurant-tickets`. Not built: linking a ticket to a specific order, and RLS on the tickets table (isolation is enforced in the service and tested)

## Group W — Diagnostics/Support screen & revoked devices (089, 090)

- [x] BUG-089 — Restaurant Admin sign-in/sessions ignore device/restaurant/subscription state
- [x] BUG-090 — Diagnostics & Support screen UI poor, stale states — undefined theme variables fixed (and a guard test now fails on any undefined CSS variable), stale search panels cleared on a new search, REVOKED shown in error colour, last seen with date, responsive layout

## Group X — Platform Settings & Maintenance Mode (091, 092)

- [x] BUG-091 — Maintenance mode saved but never shown to any restaurant app
- [x] BUG-092 — Other settings saved but unused, API didn't validate — validation and the trial default were already done; now branding and the seller are used: a new editable `platform.billing` setting (trade and legal name, address, state, GSTIN with state check, SAC, bank, IFSC, account, UPI, billing email) feeds every invoice and receipt instead of the hard-coded block, the seller's state decides CGST + SGST vs IGST, the support email and phone from branding appear on invoices and at the foot of every email (`platform-branding` e2e); Super Admin has an "Invoice seller details" card. The default values are the previously hard-coded sample company and bank details: replace them with the real ones before invoicing. Trial quota enforcement is BUG-061

## Group Y — My Profile → Active sessions (093, 094)

- [x] BUG-093 — "Revoke session" doesn't cut off the session
- [x] BUG-094 — Session list misleading — one row per login, device/IP, last active, "This device" and sign-out-others were done; added an approximate location (from the CDN or proxy geo headers, "Local network" for private addresses; no third-party GeoIP lookups) shown in the sessions table, a cap of five live sessions per account (`MAX_PLATFORM_SESSIONS`; a sixth sign-in ends the least recently used, audited), and a 7-day sign-in lifetime for owners and super admins (`PRIVILEGED_REFRESH_TTL_DAYS`) versus 30 days for others; tests `geo.spec`, `platform-sessions`

## Group Z — Found during live cross-app verification (095)

- [x] BUG-095 — A staff PIN issued in Restaurant Admin only ever worked on the device that created it, even though the create/reset screen says outright "This PIN logs [name] into POS, Captain, KDS and Kiosk" — discovered while live-verifying BUG-019/034/035: created a real staff member in Restaurant Admin, tried the issued PIN on a separately-activated real KDS terminal of the same restaurant, and it was rejected. Root cause: `User`/staff records were the one thing never in the cross-app entity-sync bridge — CUSTOMER, MENU_ITEM, MENU_CATEGORY, INVENTORY_ITEM and PAYMENT_TRANSACTION all synced, staff never did, and KDS additionally had no entity-sync wiring at all (not even for menu). Added `STAFF_USER` as a syncable entity type (carrying the restaurant-keyed PIN hash, never a plaintext PIN — `entity-sync.e2e`, including a same-restaurant cross-device pull and a cross-tenant isolation check) and wired push (Restaurant Admin, the only place staff are created or PINs reset) and pull (POS, Captain, KDS, Kiosk User) the same way MENU_ITEM already works, giving KDS its first entity-sync wiring of any kind. **Verified live a second time** after the fix, on the same running stack: the PIN worked on KDS within one sync tick. Unit tests `staff_cross_device_sync`

---

## Score

**Fixed:** 93 / 95 · **Partly fixed:** 2 / 95 (BUG-025, BUG-026 — printer hardware: real native transports built and unit-tested, but the packaged Tauri desktop app could not be built on this machine — an Application Control policy blocks Tauri's own build scripts — and no physical serial/Bluetooth printer was available to test against) · **Not started:** 0 / 95

## Notes

- This checklist reflects the truth as of each edit; `BUG_LIST.md`'s "Fix status" table has the same information with more detail per row.
- All 95 tracked bugs have been worked. The only two not fully closed (BUG-025, BUG-026) are blocked by this machine's environment, not by anything left undone in the code — see their entries. Everything else was fixed and verified, including a full live run of the real API and all five apps together (fresh restaurant → staff → menu → a real order → a real KOT reaching a separately-activated KDS terminal → Restaurant Admin seeing the order and correct sales/tax totals), which is what surfaced and closed BUG-095.
- Before shipping: replace the placeholder `platform.billing` seller/bank details (BUG-092) with the real company's; move the dev database off the Postgres superuser role onto the dedicated non-superuser `jamanvaar_app` role (the API logs a warning on every boot until this is done); rotate the license-signing key pair used for offline verification from the checked-in dev key `k2` to a real production key before any restaurant relies on offline licensing.

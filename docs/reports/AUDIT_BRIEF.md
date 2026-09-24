# Audit brief (shared by all audit agents)

You are auditing the JAMANVAAR restaurant SaaS monorepo (`C:\Users\OM Sanjhira\OneDrive\Desktop\k2`) by **using the real apps in a browser like the person who uses them**, and logging bugs. **Analysis only: do NOT edit application code, do NOT run git, do NOT change the database schema, do NOT fix anything.** You may create test data through the app UI.

## Environment (already running)
| App | URL | Who uses it |
|---|---|---|
| Super Admin (cloud console) | http://localhost:5180 | SaaS owner |
| Restaurant Admin (`pos-admin`) | http://localhost:5176 | restaurant owner |
| POS | http://localhost:5175 | cashier/manager |
| Captain | http://localhost:5177 | waiter/captain |
| KDS | http://localhost:5179 | kitchen |
| Kiosk Admin | http://localhost:5173 | staff managing kiosks |
| Kiosk User (self-order) | http://localhost:5174 | walk-in customer |
| Cloud API | http://localhost:4000/api/v1 | — (log: NestJS, read code under `cloud/api/src`) |
| Local LAN relay | http://localhost:5178 | (returns 401 to everyone — known) |

Test restaurant: **Full Audit Diner**, id `60f278d3-3505-4ed5-b8b7-2696779509fd`, PRO plan, 135 dishes loaded, 1 table (T-1, Main Hall).
- **SECURITY NOTE (2026-09-22):** this file used to contain real plaintext credentials (a SUPER_ADMIN login, an owner login, staff PINs, and unredeemed activation keys) for the local dev/test database, committed to git. They have been redacted here and the one-off script that created the SUPER_ADMIN account (`cloud/api/prisma/_tmp_user.ts`) has been deleted. Treat every credential that was ever in this file as compromised — rotate/delete the corresponding accounts in any environment this file's setup was ever run against, do not restore the plaintext values here, and do not commit real credentials to this repo again (see `security-audit/FINDINGS.md` HIGH-06).
- Owner login (Restaurant Admin, Kiosk Admin, Captain connect screen): `<redacted — set your own via the seed script>`
- Super Admin login: `<redacted — set your own via SEED_SUPER_ADMIN_EMAIL/SEED_SUPER_ADMIN_PASSWORD>`
- Staff PINs: `<redacted>`
- Spare **unused** activation keys: `<redacted — generate fresh ones from Super Admin if needed>`
- The browser profile is persistent: every app is normally **already logged in / activated**. If a tab is missing, open it by URL. If an app shows a login/activation screen, use the credentials above.
- Super Admin can generate more keys (Restaurants → Full Audit Diner → Generate Key) if you need one.

## HOW to drive the browser (you are the ONLY agent using it right now)
1. Load the Playwright tools with ToolSearch (`select:mcp__plugin_playwright_playwright__browser_run_code_unsafe,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_type,mcp__plugin_playwright_playwright__browser_tabs,mcp__plugin_playwright_playwright__browser_navigate`). If a call fails with "Connection closed" or hangs, search for the tools again, list tabs, and continue where you stopped — do not wait on a hung call.
2. **Work on ONE app tab.** At the start close every other tab (`browser_tabs close`) — logins are stored in the browser profile, so nothing is lost. Open a second app's tab only when you verify a connection between apps, and close it afterwards. Too many open tabs (every terminal polls the cloud every 4 s) makes the browser sluggish and calls hang.
3. **Keep every call short: at most ~30 seconds and ~10–15 controls per call.** Long calls drop the Playwright connection. Print compact results (`innerText` slices, not full snapshots — snapshots of big pages are huge). Save findings to your report file every few pages so nothing is lost if the connection drops.
4. Helper harness (optional): `browser_run_code_unsafe` with `filename: ".playwright-mcp/h2.js"` defines `page.context().__H` with `H.get('ra'|'pos'|'kds'|'cap'|'ka'|'ku'|'sa')`, `H.nav(p,'Sidebar label')`, `H.go(key,'Sidebar label')` and `H.fuzz(p,{scope:'main',limit:12,reopen})` which clicks each button/select/checkbox on the visible page and reports MODAL / NAV / changed / NOOP / REQ / HTTP errors / PAGEERR. **Use limit ≤ 12 per call.** NOTE: it opens all 7 apps in tabs when loaded — close the ones you do not need immediately, or skip the harness and write your own small snippets. **NOOP means "clicked and nothing visibly happened" — verify each by hand; many are legitimate, some are dead buttons.** It skips destructive-looking labels — test those yourself on dummy data.
5. To read what a click did: dump `main.innerText`, listen to `page.on('response')` for status ≥ 400 and non-GET requests to `:4000`, `page.on('pageerror')`, console errors. Reload to check persistence. The cloud API can be queried with `fetch` from the page using the app's device token in `localStorage` (keys like `jamanvaar_pos_device_token`) to verify what the server really stored.
6. Screenshots: `await p.screenshot({path:'.playwright-mcp/<name>.png'})` then Read the file if you need to see layout.

## What "tested" means (no page may be skipped)
For **every** page/tab/screen/modal of your app, and every control on it:
- Click/toggle/select it; confirm the visible effect **and** the network call **and** persistence after reload. Dead buttons, buttons that show success but do nothing, wrong page opened, blank screens, crashes, console/page errors, 4xx/5xx responses are bugs.
- Forms: submit valid data, empty data (required-field validation), boundary/odd data (0, negative, very long, special characters, duplicates, wrong formats such as phone/GST/email). Check that saved data appears where it should.
- Lists/tables: search, filter, sort, pagination, export/download (open the downloaded file), row actions, empty states.
- Numbers: cross-check figures against data you know (orders you created, menu prices, GST 5%, totals, counts across screens). Wrong/inconsistent numbers are bugs.
- Text: demo/placeholder data shown as real, misleading labels, wrong currency formatting, untranslated strings, contradicting messages.
- Destructive actions (delete/clear/reset/void/refund/logout): only on records **you create yourself** for the test. **Never** delete/reset: the restaurant, the owner, staff Priya/Ravi/Sunil, the 135 dishes, or any device. Avoid "restore demo seed / factory reset / clear all data" — note them as "not executed (destructive)" and describe what you saw.
- Roles: where an app has roles/permissions, try the role-restricted paths too.
- If something truly cannot be tested (needs real hardware, real payment gateway, email, etc.), say so explicitly in the coverage table with the reason — do not silently skip.

## Already-known bugs (do not re-report as new; you may say "still reproduces")
Read `BUG_LIST.md` (BUG-001…BUG-143) and `ROLE_BASED_AUDIT_BUGS.md` (BUG-144…BUG-163) first — skim the headings. New findings are new IDs of the form `<APP>-NN` (e.g. `RA-01`).

## Output
1. Write your full report to `audit_reports/<app-key>.md` (create the folder). Sections: **Coverage table** (every page → controls/features tested → result: OK / bugs / not testable), then **Bugs** (each: ID, severity 🔴/🟡, page, exact steps, expected vs actual, evidence such as request+status or console error, and — when cheap — the file/line that causes it), then **Not tested & why**.
2. Return to the caller a summary under 350 words: number of pages and controls covered, bug count by severity, the 8 most important bugs (one line each), and coverage gaps. Do not paste the whole report.

Be honest: say exactly what you did and did not verify. Do not claim a page was tested if you only opened it.

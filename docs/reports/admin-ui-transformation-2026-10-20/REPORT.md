# Restaurant Admin UI audit and simplification — 2026-10-20

Scope: the Restaurant Admin application (`apps/restaurant-system/pos-admin`) and the shared UI it consumes. Functionality, routes, permissions and API contracts are unchanged.

## How it was verified

- **Authenticated session.** The project's isolated QA database and API (`tooling/qa/browser-audit-server.cjs`, port 4010) were started with a separate admin dev server, and a signed-in browser was driven with Playwright. Your own dev API (4000) and database were not contacted.
- **Every route in `PRODUCT_PAGES.POS_ADMIN` (35 pages)** was loaded at 1440, 1024, 768 and 390 px. Each was checked for horizontal overflow, script errors, unlabeled controls, small tap targets and title size.
- **Flows exercised in the signed-in app:** dashboard to Launch step, expandable sections, Refresh readiness, header search, Ctrl+K, EOD Report, Reconciliation, Notifications, Assistant, sidebar navigation and group expand, keyboard focus ring, Settings display preset, mobile drawer, logout.
- **Component fixture** (`browser-check.cjs`) renders the real header and Launch & handover at six widths, including reduced motion.

## Findings

| # | Sev | Finding | Where | Status |
|---|-----|---------|-------|--------|
| 1 | P1 | Ctrl+K is shown in the header but no handler existed, so the browser's own shortcut ran | App shell | Fixed |
| 2 | P1 | EOD Report, Reconciliation and Notifications overlays had no dialog role, `aria-modal` or name | 3 modals | Fixed |
| 3 | P1 | Printers & Peripheral Devices overflowed horizontally at 390 px (routing selects) | Printers | Fixed |
| 4 | P1 | Floating JAMAN AI badge covered the last content on every page | App shell | Fixed (bottom clearance) |
| 5 | P2 | Dashboard clutter: sentences restating the page heading, scope, filters and heartbeat rules; three identical "Nothing needs attention" cards stretched to the height of Device issues | Dashboard | Fixed |
| 6 | P2 | Settings repeated the same scope message in two blue banners; the top banner was full width while the page body was centered narrower | Settings and 7 other scoped pages | Fixed |
| 7 | P2 | Page titles used four sizes (20/24/28/30 px) | All module pages | Fixed (shared scale) |
| 8 | P2 | Unlabeled controls: header search field, KDS search, staff attendance selects and date, receipt form fields (labels not tied to inputs) | Several | Fixed |
| 9 | P2 | Undersized targets (24-28 px): KDS filter pills, staff selects and buttons, search fields | KDS, Staff | Fixed (36 px minimum) |
| 10 | P2 | Mixed button treatment: black dashboard Refresh, green Export CSV | Dashboard, Orders | Fixed |
| 11 | P2 | Header search squeezed to a few characters at laptop width; identity text overlapped it at tablet width | Header | Fixed |
| 12 | P3 | Jargon page titles ("Customer Relationship Management (CRM)", "Staff & Role-Based Access (RBAC)", "Inventory & Recipe Bill of Materials (BOM)") | 3 pages | Not changed |
| 13 | - | Template thumbnails broken in the long-running dev server on 5176 | Templates | Environment only: that server predates the Vite config change and returns HTML for `/restaurant-admin/assets/...`. Restart it. |

## Copy removed or consolidated

- Dashboard: "Confirmed sales, open payments and device health", "Live tasks for this branch scope...", "Nothing needs attention" (x3), the "{n} unpaid orders" and timezone fragments of the totals line, and the long heartbeat and subscription notes became tooltips or one short line.
- Branch bar: the permanent caption is now a tooltip on the selector; the message still shows when "All restaurant" is selected.
- Launch & handover: the instructional sentence is replaced by a derived status ("N of M checks verified"). The payment note moved inside the "Purchased → enabled..." section.
- Settings: the duplicate scope paragraph was removed; the notice is now one light line.

## Not verified / not done

- **Lint could not run.** `eslint`, `@eslint/js` and the plugins are declared in `package.json` but are not installed in this checkout's `node_modules`. `npm install` would fix it.
- Only one restaurant and branch exist in the QA data, so branch switching was not exercised. All pages were empty-data states, so populated tables and long names were not inspected.
- Create, edit and save flows in individual modules were not exercised end to end.
- Kiosk Admin pages (`/kiosk-admin/*`) and the QR console were not crawled.
- The sidebar, tablet and mobile views were inspected on a sample of pages, not every page by eye.
- Jargon page titles (finding 12) were left alone to avoid renaming business terms.

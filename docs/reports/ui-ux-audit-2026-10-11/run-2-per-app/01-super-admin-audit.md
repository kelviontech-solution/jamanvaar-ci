# 01 — Super Admin (Platform Control Center) audit

Run 2, 2026-10-11. Current source rendered via out-of-repo Vite config. No repository edits.

## 1. Purpose, personas, device
- **Users:** platform staff (Platform Owner / team) managing restaurants, owners, branches, plans, activation keys, payments, devices, backups.
- **Device:** desktop browser; dark console theme with its own CSS-variable system (`--jv-*`, `src/styles.css`), separate from the Tailwind `jaman.*` tokens used elsewhere.
- **Source:** `cloud/super-admin-web/src` — 107 files, React Router (`app/App.tsx`), sidebar in `layout/ProtectedLayout.tsx` (715 lines, collapsible groups + page search). Viewport meta has no zoom lock.

## 2. Build / access status
Starts from current source with the out-of-repo `qrcode` alias (the source file `packages/utils/src/qrcode.ts` is pulled in transitively) — the platform pages that show QR codes would display a stub square. Backend (`http://localhost:4000`) not running; no platform account → every protected route redirects to `/login` (observed).

## 3. Page inventory

| ID | Route | Page | Status |
|---|---|---|---|
| SUPER-001 | `/login` | Platform sign-in | **VISUALLY VERIFIED + INTERACTION TESTED** |
| SUPER-002 | `/activate` | Invitation activation (no token → invalid-link state) | **VISUALLY VERIFIED** (invalid state only) |
| SUPER-003 | any protected route | Route guard redirect | **INTERACTION TESTED** (`/restaurants` → `/login`) |
| SUPER-004 | `/` | Executive Dashboard | BLOCKED |
| SUPER-005 | `/restaurants` | Restaurants list (cards/table, filters, bulk, suspend dialog) | **SOURCE REVIEWED (states, dialogs, filters)** |
| SUPER-006 | `/restaurants/onboard` | Onboard restaurant (1,810-line wizard) | BLOCKED |
| SUPER-007 | `/restaurants/:id` | Restaurant detail (2,382 lines) | BLOCKED |
| SUPER-008 | `/owners` | Owners | BLOCKED |
| SUPER-009 | `/owners/:id` | Owner detail | BLOCKED |
| SUPER-010 | `/branches` | Branches | BLOCKED |
| SUPER-011 | `/branches/:id` | Branch detail | BLOCKED |
| SUPER-012 | `/saas-management` | SaaS overview | BLOCKED |
| SUPER-013 | `/plans` | Plans & Entitlements | BLOCKED |
| SUPER-014 | `/plans/:id` | Plan detail | BLOCKED |
| SUPER-015 | `/qr-ordering` | QR Ordering suite | BLOCKED |
| SUPER-016 | `/whatsapp-ordering` | WhatsApp ordering | BLOCKED |
| SUPER-017 | `/ai-assistant` | JAMAN AI engine | BLOCKED |
| SUPER-018 | `/catalog` | Master menu catalog | BLOCKED |
| SUPER-019 | `/subscriptions` | Subscriptions | BLOCKED |
| SUPER-020 | `/billing` | Invoices & Billing (1,451 lines) | BLOCKED |
| SUPER-021 | `/entitlements` | Entitlements (no sidebar entry found) | BLOCKED |
| SUPER-022 | `/feature-catalog` | Feature catalog | BLOCKED |
| SUPER-023 | `/reports` | Reports & Analytics | BLOCKED |
| SUPER-024 | `/applications` | Applications & Releases | BLOCKED |
| SUPER-025 | `/activation-keys` | Activation keys (+ generate modal) | BLOCKED |
| SUPER-026 | `/payment-connections` | Payment gateways | BLOCKED |
| SUPER-027 | `/platform-payments` | Platform payments | BLOCKED |
| SUPER-028 | `/payouts` | Restaurant payouts | BLOCKED |
| SUPER-029 | `/devices` | Device fleet / MDM | BLOCKED |
| SUPER-030 | `/devices/:id` | Device detail | BLOCKED |
| SUPER-031 | `/sync-monitor` | Sync & conflict monitor | BLOCKED |
| SUPER-032 | `/backups` | Backups & recovery | BLOCKED |
| SUPER-033 | `/sandboxes` | Staging sandboxes | BLOCKED |
| SUPER-034 | `/offline-policy` | Emergency offline policy | BLOCKED |
| SUPER-035 | `/team` | Platform team | BLOCKED |
| SUPER-036 | `/support` | Diagnostics & support | BLOCKED |
| SUPER-037 | `/tickets` | Support tickets | BLOCKED |
| SUPER-038 | `/notifications` | Notifications (no sidebar entry found) | BLOCKED |
| SUPER-039 | `/audit-logs` | Audit logs | BLOCKED |
| SUPER-040 | `/system-health` | System telemetry | BLOCKED |
| SUPER-041 | `/settings/platform` | Platform settings | BLOCKED |
| SUPER-042 | `/profile` | My profile | BLOCKED |

42 discovered · 3 verified/tested · 1 source-reviewed · 38 blocked · 0 not audited. (`/dashboard` is a redirect to `/` and is not counted.)

---

## 4. Page reports

### SUPER-001 — Platform sign-in

**Route:** `http://localhost:5180/login` · **Status:** VISUALLY VERIFIED + INTERACTION TESTED (current source)
**Intended user:** platform staff · **Primary task:** sign in with email + password
**Viewports:** 1366×768, 768×1024, 390×844, 1920×1080

**What works well**
- Dark theme is coherent and legible; labels, `*` markers, `autocomplete="username"/"current-password"`, `required`, `type=email`.
- **Best failure message of all apps:** with the API down and credentials typed, the form shows *"Cloud API is unreachable at http://localhost:4000. Please check your connection or that the backend is running."* — states cause and action ([evidence](evidence/super-admin/SUPER-001-network-failure-submit-1366x768.png)).
- Show/Hide password toggles to a text field and keeps the typed value ([evidence](evidence/super-admin/SUPER-001-show-password-1366x768.png)).
- Focus ring: orange outline on buttons and orange glow on inputs at every Tab stop.
- Route guard: visiting `/restaurants` while signed out lands on `/login` (SUPER-003).
- No overflow at any of the four viewports; `<main>` and one `<h1>`.

**Findings**
- **SH-010 (P4, confirmed VISUAL):** "Port 4000 • Live Cloud API" is printed under the password field (`pages/Login/LoginPage.tsx:214`, 11 px mono) and the status pill reads "Connected (Port 4000)" when healthy (`packages/ui/src/JamanvaarAuthLayout.tsx:372`). Developer detail on a production screen.
- **SH-009 (P3, confirmed VISUAL):** the raster logo carries a visible dithered rectangle on the dark background ([1920](evidence/super-admin/SUPER-001-initial-1920x1080.png)).
- **SH-011 (P4):** footer claims "Instant Offline Boot • 100% Secure" on a login screen.
- **SH-008-class (P3):** the "Remember session" checkbox is 13×13 (native control; probe `<24 px`), though its label is clickable.
- **SUPER-F1 (P4, AUTOMATED):** 2 React Router *future flag* warnings in the console on every load (`v7_startTransition`, `v7_relativeSplatPath`).
- **UX (observation):** an invalid email (`not-an-email`) produced **no in-page message** in the headless run — the browser's native validation bubble is not captured in screenshots, so whether a user sees feedback is **unverified**.

**Interactions tested:** empty submit; invalid-email submit; valid-format submit with API down; Show password; 8-stop Tab traversal.
**Unverified:** successful login, MFA/OTP step (`verify-otp` exists in source), lockout, session refresh.

| Visual | Usability | Interaction | A11y | Responsive | Consistency | **Weighted** | Conf. |
|---:|---:|---:|---:|---:|---:|---:|---|
| 8 | 7.5 | 7.5 | 6.5 | 8.5 | 8 | **7.6** | Medium |

0.25·7.5 + 0.20·8 + 0.20·7.5 + 0.15·8.5 + 0.15·6.5 + 0.05·8 = 7.63.
**Do not change:** the error copy, focus treatment, show-password behaviour.

### SUPER-002 — Activate invitation (invalid link)

**Route:** `/activate` without token · **Status:** VISUALLY VERIFIED (1366×768, 390×844). The valid-token form was **not** rendered.
**Works well:** plain explanation ("incomplete or replaced by a newer invitation… ask a Platform Owner to resend"), and a **"Go to sign in"** action.
**Findings:** **SUPER-F4 (P4, AUTOMATED)** no `<main>`/`<header>`/`<nav>` landmarks.
**Score:** 7.3 (visual 7.5, usability 7, responsive 8.5, a11y 6, consistency 8; interaction N/A). Confidence: Medium. **Do not change:** copy and recovery link.

### SUPER-003 — Protected route guard

**Tested:** navigating to `/restaurants` signed-out ended at `/login` (`location.pathname` evaluated). **Not scored** (behaviour, not a screen). Unverified: return-to-intended-route after login, expired-token handling.

### SUPER-005 — Restaurants list (source-reviewed)

**Status:** SOURCE REVIEWED (`Restaurants/RestaurantsListPage.tsx`, 924 lines) — not rendered.
**What works well (from code)**
- Distinct **loading skeletons**, **error banner with retry**, and **empty state** components.
- Search ("Search name, owner, city, ID…" prefilled from `?search=`), status/plan filters, sort, cards/table view, row selection with **bulk actions bar**.
- **High-impact action confirmation:** suspend/reactivate opens a dedicated dialog naming the restaurant and including an *impact box* (`confirmation-impact-box`), with a pending state and success toast — the model the other apps should copy.
**Findings**
- **SUPER-F2 (P3, suspected):** list is fetched whole and filtered/sorted in the browser (`useMemo` over `restaurants`; no page/limit state found). Fine at tens of tenants; a scale risk at hundreds. Unverified with data.
- Page uses heavy inline `style={{…}}` (e.g. header) alongside `styles.css` classes — consistency/maintenance only.
**Scores:** not scored.

## 5. Cross-cutting findings (source-level, whole app)
- **SUPER-F3 (P3, suspected):** money-related pages are spread across three sidebar groups — *Invoices & Billing* (Business Management), *Payment Gateways / Platform Payments / Restaurant Payouts* (SaaS Management). Operators looking for "where did this payout go" must know which group. Unverified in practice.
- **SH-003 (P2, confirmed in source):** the app's `Modal` (`components/ui.tsx:124-158`, 31 uses) has `modal-backdrop` + `modal` divs but **no `role="dialog"`/`aria-modal`**, no focus trap or restore, a `window` Escape listener, and a "×" close with `aria-label="Close"` (good). Ten pages also inline their own `modal-backdrop`.
- 26 `<div|span onClick>` handlers (mostly backdrop/stopPropagation; a few on cards) — keyboard operability unverified.
- Sidebar: six groups, collapsible, with page search (`ProtectedLayout.tsx:340-`). Positive for 30 destinations.
- `/entitlements` and `/notifications` are routes without a sidebar item; how users reach them was not traced.

## 6. Responsive results
Login at 1920/1366/768/390: no overflow; two-column hero collapses beneath the form on narrow widths. Authenticated layout, sidebar collapse and tables: **unverified**.

## 7. Accessibility results
Confirmed: labelled inputs, autocomplete tokens, visible focus, no zoom lock. Failures/risks: 13 px checkbox; missing landmarks on `/activate`; shared modal semantics (SH-003). Not tested: screen reader, authenticated keyboard flow, reduced motion (0 matches).

## 8. Application scorecard

| Metric | Value |
|---|---|
| Scored pages | 2 (SUPER-001 → 7.6, SUPER-002 → 7.3) |
| Visually verified | 2 / 42 |
| Interaction tested | 2 / 42 (login; guard) |
| Source reviewed only | 1 / 42 |
| Blocked | 38 / 42 |
| Product score | **Not assigned** |

## 9. Fix backlog (Super Admin only)
1. SH-003 — dialog semantics/focus for `ui.tsx` Modal and the 10 inline copies (M).
2. SH-010 — remove "Port 4000" copy (XS). SH-009 — dark-theme logo asset (S).
3. SUPER-F2 — server-side pagination/filter for restaurants (M, needs API).
4. SUPER-F3 — IA review of payments pages (S, product decision).
5. SUPER-F1 — adopt Router future flags (XS). SUPER-F4 — `<main>` on `/activate` (XS).
**Order:** 1 → 2 → 5 → 3/4 after a rendered authenticated pass.

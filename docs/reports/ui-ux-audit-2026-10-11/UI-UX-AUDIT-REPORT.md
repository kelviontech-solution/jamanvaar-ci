# JAMANVAAR Frontend UI/UX Audit — 2026-10-11

**Mode:** audit only. No application source, styles, configs or dependencies were edited (see Section P for the one unintended side-effect).
**Auditor note on honesty:** only the *pre-authentication* screens could be rendered. Everything behind a login is covered at **inventory + shared-component + pattern-search level only**. This report says so everywhere it matters and does **not** assign an overall product score.

---

## Section A — Executive Summary

| Item | Value |
|---|---|
| Overall frontend score | **Not assigned.** The 8 rendered pre-auth screens average **7.3 / 10** (rubric-derived, Section C). Coverage is ~7 %, so extrapolating to the product would be fabrication. |
| Confidence | Low for the product as a whole; Medium–High for the 8 rendered screens and for the shared-component findings. |
| Screens/routes discovered | **≈116** across 7 frontends (Section B) |
| Visually rendered | **8** (≈7 %) — all login / activation / invalid-link screens |
| Source-level only | ≈108 inventoried from route tables, tab unions and component trees. They were **not** read screen-by-screen; only repo-wide pattern searches and shared components (Modal, auth layout, tokens) were read in depth. |
| Inaccessible / unverified | All authenticated screens (no backend, no test accounts, no permission to run `npm install`) |
| Issues | 21 total: **0 Critical, 5 High (3 UI/UX + 2 build-environment), 8 Medium, 6 Low, 2 Informational** (Section D) |

**Top five findings**
1. **A11Y-001 / A11Y-002 (High)** – The shared `Modal` used across POS/Admin has no focus trap, no focus restore, an unnamed icon-only close button, and a window-level Escape handler that closes *every* open dialog. Every dialog in the product inherits this.
2. **UX-001 (High)** – The **guest-facing kiosk** uses blocking `alert()` for OTP and modifier validation (hard-coded English in a 7-language kiosk).
3. **A11Y-003 (Medium, confidence Medium)** – Pinch-zoom is disabled (`user-scalable=no`) in 4 of 7 apps and `maximum-scale=1.0` in a 5th.
4. **A11Y-004 (Medium)** – Several "muted" text colours used for real content fail 4.5:1 (2.5–2.9:1 calculated), often at 10–12 px.
5. **UX-002 (Medium)** – 57 native `confirm/alert/prompt` call sites guard destructive actions (void bill, delete dish, end shift) instead of the app's own modal.

**Biggest strengths:** a real token system and shared auth layout that makes 7 apps feel like one product; no horizontal overflow at any of 4 viewports on every rendered screen; honest connection-status badge logic (B2-006 comment); clear, friendly activation/invalid-link copy; heavy `aria-label` usage in admin (≈290).
**Biggest weaknesses:** accessibility of shared overlays, tiny type scale in POS/Admin (1,401 sub-12 px declarations), native dialogs for critical decisions, duplicated modal/token implementations, and 2–4 k-line monolithic screen files.
**Most valuable next step:** run `npm install`, resolve the merge conflicts, then re-run this audit against a seeded local environment with an owner, cashier, captain and super-admin session so the ~108 authenticated screens can actually be rendered.

---

## Section B — Application and Route Inventory

Evidence for counts: `cloud/super-admin-web/src/app/App.tsx` (react-router), `PosAdminTab` union in `apps/restaurant-system/pos-admin/src/App.tsx:163`, `CaptainNavigation.tsx:14`, `KioskStep` in `kiosk-user/src/App.tsx:176`, component trees for POS and QR guest. Only Super Admin uses a URL router; the other apps navigate by in-memory state.

| Application | Route / state id | Screen | Role | Visual | Source | Status |
|---|---|---|---|---|---|---|
| Super Admin (`:5180`) | `/login` | Platform sign-in | Public | ✅ 4 viewports | ✅ | Audited |
| Super Admin | `/activate` | Invitation activation (invalid-link state) | Public | ✅ 2 viewports | ✅ | Audited (invalid-link state only) |
| Super Admin | `/`, `/restaurants`, `/restaurants/onboard`, `/restaurants/:id`, `/owners`, `/owners/:id`, `/branches`, `/branches/:id`, `/saas-management`, `/plans`, `/plans/:id`, `/qr-ordering`, `/whatsapp-ordering`, `/ai-assistant`, `/catalog`, `/subscriptions`, `/billing`, `/entitlements`, `/feature-catalog`, `/reports`, `/applications`, `/activation-keys`, `/payment-connections`, `/platform-payments`, `/payouts`, `/devices`, `/devices/:id`, `/sync-monitor`, `/backups`, `/sandboxes`, `/offline-policy`, `/team`, `/support`, `/tickets`, `/notifications`, `/audit-logs`, `/system-health`, `/settings/platform`, `/profile` | 39 protected pages | Platform staff | ❌ | inventoried | Unverified (needs session) |
| Restaurant Admin (`:5176`) | pre-auth | Owner sign-in (+ Activate owner, Forgot password panels) | Owner | ✅ 4 vp (sign-in only) | ✅ | Audited |
| Restaurant Admin | 34 tab ids: DASHBOARD, QR_ORDERING, BILLING_SALES, ORDERS, LIVE_KDS, MENU, MENU_OPTIONS, TABLES, RESERVATIONS, KITCHEN_KOT, INVENTORY, CUSTOMERS, STAFF, PAYMENTS, REPORTS, SHIFTS, HARDWARE, SYNC, SETTINGS, LICENSE, AUDIT, BACKUP, SUPPORT, INVENTORY_CONTROL, KIOSK_DESIGN, KIOSK_WELCOME, KIOSK_COMBOS, KIOSKS, COUPONS, RECEIPTS, TEMPLATES, KIOSK_PAYMENTS, FEEDBACK, DOWNLOADS | Admin workspaces | Owner/manager | ❌ | inventoried | Unverified |
| Restaurant Admin | `qr/` entry (`QrProduct`, `QrWorkspace`) | QR product workspace | Owner | ❌ | inventoried | Unverified |
| POS Counter (`:5175`) | pre-auth | Terminal activation | Terminal | ✅ 4 vp | ✅ | Audited |
| POS Counter | ≈11 views from component tree: catalog/billing + cart, floor plan, orders, bills, KOT, customers, inventory, reports, day history, shift & cash, settings | Cashier workspaces | Cashier/manager | ❌ | inventoried (nav ids not confirmed) | Unverified |
| Captain (`:5177`) | pre-auth | Tablet activation | Terminal | ✅ 4 vp | ✅ | Audited |
| Captain | TABLES, ORDERS, FOOD_READY, KOTS, MESSAGES, REQUESTS, SHIFT, CUSTOMERS | 8 tabs | Captain | ❌ | inventoried | Unverified; **file has merge conflicts** |
| KDS (`:5179`) | pre-auth | Terminal activation | Terminal | ✅ 4 vp | ✅ | Audited |
| KDS | `KdsExpoBoard`, `KdsTicketCard` | Kitchen board | Kitchen | ❌ | inventoried | Unverified |
| Kiosk (`:5174`) | pre-auth | Kiosk activation | Terminal | ✅ 4 vp | ✅ | Audited |
| Kiosk | LANGUAGE_SELECT, WELCOME, ORDER_TYPE, TABLE_SELECT, MENU, CHECKOUT_PAYMENT, CONFIRMATION | 7 guest steps | Guest | ❌ | inventoried | Unverified |
| QR Guest (`:5190`) | `/` without token | "This QR code is not valid" | Guest | ✅ 3 vp | ✅ | Audited (error state only) |
| QR Guest | menu, group order, loyalty, operations, advanced (6 source files) | Guest ordering | Guest | ❌ | inventoried | Unverified |
| Kiosk Admin (`apps/kiosk-system/kiosk-admin`) | — | Only a `dist/` folder exists; per `RUN_SERVERS.md` it is a workspace inside Restaurant Admin | — | ❌ | n/a | Not a separate frontend |

**Exclusions:** 7 `src-tauri` shells, `cloud/api`, receipts/report documents rendered into print iframes (`ThermalReceiptView`, `*ReportDocument`) were not counted as screens.

---

## Section C — Screen-by-Screen Scorecard

Rubric weights: Visual 20 · Usability 25 · Responsive 15 · Accessibility 15 · Interaction 15 · Consistency/perf 10.
**Interaction is N/A for every row** (no backend; I did not submit forms), so totals are re-normalised over the remaining 85 %. Scores are my judgment per dimension; the weighted arithmetic is mechanical.

| Screen | Visual | Usab. | Resp. | A11y | Interact. | Consist./perf | Overall | Coverage |
|---|---:|---:|---:|---:|---|---:|---:|---|
| Super Admin `/login` | 8 | 7 | 8 | 6 | N/A | 7 | **7.2** | Visual 1366/768/390/1920 |
| Super Admin `/activate` (invalid) | 7 | 7 | 8 | 6 | N/A | 7 | **7.0** | Visual 1366/390 |
| Restaurant Admin sign-in | 8 | 8 | 7 | 5.5 | N/A | 7 | **7.3** | Visual 1366/390 viewed; 768/1920 probe + file only |
| POS activation | 8 | 8 | 7 | 5.5 | N/A | 7 | **7.3** | Visual 1366 viewed; others probe only |
| Captain activation | 8 | 8 | 7 | 5.5 | N/A | 7 | **7.3** | Visual 390 viewed |
| KDS activation | 8 | 8 | 7.5 | 5.5 | N/A | 7 | **7.4** | Visual 768 viewed |
| Kiosk activation | 8 | 8 | 7 | 5.5 | N/A | 7 | **7.3** | Visual 1366/390 viewed |
| QR Guest invalid code | 8 | 7 | 8 | 7 | N/A | 7 | **7.4** | Visual 390 viewed |

Short justifications:
- **Super Admin login** – coherent dark theme and clear fields; docked for exposing "Port 4000 · Live Cloud API" to users (UX-003), a noisy logo box on dark (UX-005), 11 px helper text.
- **Super Admin activate** – clear message, but no `<main>`/landmarks (A11Y-008) and a dead-end with only prose.
- **Restaurant Admin sign-in** – labels, helper text, forgot-password and activate paths all visible; docked for zoom lock (A11Y-003), 24 px "Pair" target (A11Y-006), cramped mobile header (UX-004).
- **POS / Captain / KDS / Kiosk activation** – one shared, well-explained pattern ("Don't have an activation key?" steps). Same a11y docks; kiosk has clipped script-tagline at 390 px (terminal, so low weight).
- **QR guest invalid** – friendly, `h1` + `main` present; offers no retry/contact action.

**Coverage metrics:** visually inspected 8 / ≈116 = **≈7 %**; source-inventoried ≈93 %; source-*read* in depth: shared `Modal`, `JamanvaarAuthLayout`, tailwind configs, super-admin `ui.tsx` modal, and the ~15 files cited in Section D.

---

## Section D — Detailed Issue Register

Verification labels: VISUAL, SOURCE, AUTOMATED (my DOM probe / grep counts), UNVERIFIED. "Calculated" means computed from source hex values, not measured on rendered pixels.

| ID | Issue | Screen/route | Category | Severity | Priority | Verification | Confidence | Evidence | User impact |
|---|---|---|---|---|---|---|---|---|---|
| A11Y-001 | Shared `Modal` has no focus management | Every dialog using `packages/ui` Modal (POS, Admin, Captain, Kiosk) | Accessibility | High | P1 | SOURCE | High | `packages/ui/src/Modal.tsx:36-98`: no focus move on open, no trap, no restore; `role="dialog"` present | Keyboard/switch/screen-reader users can tab behind the dialog and lose their place on close |
| A11Y-002 | Modal close button unnamed; Escape closes all stacked dialogs | same | Accessibility / Interaction | High | P1 | SOURCE | High | `Modal.tsx:76-84` icon-only `<button>` with no `aria-label`; `Modal.tsx:36-44` uses `window` keydown per instance | Screen reader announces "button"; Esc on a nested confirm also dismisses the parent form and loses input |
| A11Y-003 | Pinch-zoom disabled | kiosk-user, pos-admin, captain, kds (`user-scalable=no`); pos (`maximum-scale=1.0` + invalid `user-select=none` token) | Accessibility (WCAG 1.4.4) | Medium | P2 | AUTOMATED (DOM read of viewport meta) + SOURCE | Medium | Viewport strings in `probe-roots.json` | Low-vision users on phones/tablets cannot enlarge content. Possibly intentional for locked terminals — see Section N |
| A11Y-004 | Low-contrast muted text | Kiosk (`App.tsx:1934,2070,2356,2485`), shared auth layout (`#8CA0B3` on dark), admin/POS | Accessibility (1.4.3) | Medium | P2 | SOURCE (calculated) | Medium | `#8C9BAE` 2.83:1 on white / 2.69 on ivory; `#8CA0B3` 2.69:1; `#94A3B8` 2.56:1; `#E66817` text on ivory 3.14:1; white on `#E66817` button 3.30:1 (threshold 4.5 for body text, 3.0 only for ≥18.66 px bold) | Hard-to-read hints, captions and eyebrow labels, worst in bright restaurant lighting |
| A11Y-005 | Pervasive sub-12 px type | POS (453 decls), Admin (710), Captain (103), packages/ui (90), Kiosk (27) | Accessibility / Visual | Medium | P2 | SOURCE (count of `text-[8–11px]`) + AUTOMATED (11–23 text nodes <12 px even on login screens) | High (count) / Medium (impact) | grep totals 1,401 | Staff reading from arm's length on counter/tablet screens; cognitive strain |
| A11Y-006 | Undersized "Pair" control | Restaurant Admin & Captain pre-auth | Accessibility (2.5.8) | Low | P3 | AUTOMATED | High | `<button class="text-xs font-bold underline">Pair</button>` < 24 px tall in probe | Hard to hit on touch; sits next to a live status pill |
| A11Y-007 | Super Admin modal lacks dialog semantics; 10 inline copies | Super Admin | Accessibility | Medium | P2 | SOURCE | High | `cloud/super-admin-web/src/components/ui.tsx:145-160` (no `role`, no `aria-modal`, no trap); `className="modal-backdrop"` ×10 | Same as A11Y-001 for the platform console |
| A11Y-008 | Missing landmarks on stand-alone pages | Super Admin `/activate` | Accessibility (1.3.1 / 2.4.1) | Low | P3 | AUTOMATED | High | Probe: no `main/nav/header` | Screen-reader users have no landmark to jump to |
| A11Y-009 | Focus visibility risk | App-wide | Accessibility (2.4.7) | Medium | P2 | SOURCE (grep) / **UNVERIFIED at runtime** | Low | 232 `outline-none` vs 62 `focus-visible/focus:ring` matches | If not paired with a replacement style, keyboard users see no focus. Not keyboard-tested |
| UX-001 | Guest kiosk uses blocking `alert()` | Kiosk OTP + modifier validation | Feedback / UX | High | P1 | SOURCE | High | `kiosk-user/src/App.tsx:1208, 1871, 1886, 1892, 1911` — literal English strings | Unstyled OS dialog on a touch terminal, shows browser origin chrome, interrupts the flow, ignores chosen language |
| UX-002 | Destructive actions confirmed with native `confirm()`/`prompt()` | POS (`PosHeader.tsx:177,190`, `PosMenuManagerModal.tsx:400,442`, `QrOrdersInbox.tsx:33`), Admin (29 sites e.g. `OrdersModule.tsx:897` void bill, `MenuCategoriesModule.tsx:186`), Captain (`CaptainHeader.tsx:236`, `CaptainShiftStatsView.tsx:154`) | UX / consistency | Medium | P2 | SOURCE | High | 57 call sites; Admin already ships `ConfirmModal.tsx` | No impact summary, inconsistent look, and behaviour inside packaged Tauri/WebView builds is **unverified** |
| UX-003 | Infrastructure detail on a user screen | Super Admin `/login` | Content | Low | P3 | VISUAL | High | "Port 4000 • Live Cloud API" under password; `JamanvaarAuthLayout.tsx` also prints "Connected (Port 4000)" | Meaningless to platform staff; leaks topology |
| UX-004 | Cramped header on small screens | Admin / Captain / Super Admin login @390 | Responsive / Visual | Low | P3 | VISUAL | High | `pos-admin-root-390x844.png`, `captain-root-390x844.png` — 50 px logo + two wrapped pills | Looks broken; still functional |
| UX-005 | Raster logo shows a noisy box on dark theme | Super Admin login @1366/1920 | Visual | Low | P3 | VISUAL | High | `super-admin-login-1920x1080.png` | Reads as an asset defect on the first screen platform staff see |
| UX-006 | Unverifiable marketing claims on auth screens | All apps | Content | Low | P3 | VISUAL | Medium | "100 % Secure", "Instant Offline Boot" pills | Overpromise; legal/credibility risk |
| UX-007 | Emoji glyphs mixed with line icons | Kiosk header ("🍲 Delicious Food", "⚡ Faster Service", "👥 Happier Customers") | Visual consistency | Informational | P3 | VISUAL | Medium | Probe text; screenshot | Platform-dependent rendering vs lucide icons elsewhere |
| DS-001 | Four+ modal implementations | packages/ui `Modal`, super-admin `ui.tsx` Modal, 10 inline backdrops, admin `ConfirmModal`, per-feature modals | Design system | Medium | P2 | SOURCE | High | See A11Y-001/007 | Inconsistent a11y/behaviour; each fix must be made N times |
| DS-002 | Tokens exist but are bypassed | All Tailwind apps | Design system | Medium | P2 | SOURCE | High | 6 near-identical 27-line `tailwind.config.js` files; 1,012 `bg/text/border-[#hex]` utilities vs 4,506 `jaman-*` uses; 5 different "muted" greys (`#4A5568`, `#64748B`, `#718096`, `#8C9BAE`, `#8CA0B3`); Super Admin uses a separate `--jv-*` CSS-variable system | Drift between apps; contrast fixes cannot be made in one place |
| MNT-001 | Monolithic screen files | Kiosk `App.tsx` 4,325 lines; `RestaurantDetailPage.tsx` 2,382; `PosMenuManagerModal.tsx` 2,210; Admin `App.tsx` 2,074; `PosSettingsView.tsx` 2,065 | Maintainability | Informational | P3 | SOURCE | High | `wc -l` | Raises regression risk for every UX fix; not itself a user defect |
| ENV-001 | Dev servers cannot compile current source | pos, pos-admin, captain, kds, kiosk-user, super-admin (and qr-guest via shared utils) | Build/environment | High | P0 (dev) | AUTOMATED | High | `evidence/dev-server-resolve-errors-pos.txt`: unresolved `@jamanvaar/tauri-plugin-apk-updater` and `qrcode` | Nobody can run the post-pull UI until `npm install`; not a user-facing defect |
| ENV-002 | Captain/lockfile contain merge-conflict markers | 6 captain components + `package-lock.json` | Build/environment | High | P0 (dev) | SOURCE (`git status` `UU`) | High | See `git status` | Captain app will not build |

Severity counts (exact tally of the table): Critical 0 · High 5 (A11Y-001, A11Y-002, UX-001, ENV-001, ENV-002) · Medium 8 (A11Y-003, -004, -005, -007, -009, UX-002, DS-001, DS-002) · Low 6 (A11Y-006, -008, UX-003, -004, -005, -006) · Informational 2 (UX-007, MNT-001) = 21.

### Root causes & recommended direction (significant issues)

- **A11Y-001/002/007, DS-001** – one root cause: no shared, accessible dialog primitive. *Direction:* a single `Dialog` in `packages/ui` (focus trap, initial focus, restore, top-of-stack Escape, labelled close) consumed by Super Admin too; retire the inline `modal-backdrop` copies.
- **UX-001/002** – validation and confirmation were wired with the quickest primitive. *Direction:* route through the existing toast (kiosk already has `showToast`) and the Admin `ConfirmModal`, and localise the strings.
- **A11Y-004, DS-002** – ad-hoc hex values. *Direction:* promote one muted-text token that meets 4.5:1 on ivory and white (the codebase already uses `#52677A` at 5.58:1) and make the tokens the only source for Tailwind configs.
- **A11Y-003** – viewport meta copied between apps. *Direction:* decide per product (see Section N) and remove the zoom lock at least from Restaurant Admin and Super Admin.

---

## Section E — Visual Design Findings

- **Strong:** consistent brand lockup, orange/navy palette, 3-up capability tiles, generous whitespace; Super Admin dark theme is coherent (`super-admin-login-1920x1080.png`).
- **UX-004 / UX-005 / UX-007 / UX-006** (above).
- Wide desktop (1920): the two-column auth layout floats in the middle with large dead margins (`super-admin-login-1920x1080.png`). Acceptable for a login; if this layout is reused for in-app screens, check max-widths.
- Disabled "Activate" buttons use slate fill with an orange arrow that is visibly weak (not measured; disabled controls are exempt from 1.4.3 but the arrow is the only affordance that the button will later enable).
- Typography is a single family (Plus Jakarta Sans, with Inter fallback in Super Admin only) — consistent. The *size* scale is the problem (A11Y-005).

## Section F — UX and Workflow Findings

Verified only for activation flows (pre-auth). Observed good practice: each activation screen explains where the key comes from and what to do without one. Concerns that need authenticated verification before they can be called defects: a 34-item flat tab list in Restaurant Admin (7 are kiosk-specific: KIOSK_DESIGN, KIOSK_WELCOME, KIOSK_COMBOS, KIOSKS, KIOSK_PAYMENTS, FEEDBACK, DOWNLOADS-adjacent) — **UNVERIFIED**, the sidebar was never rendered, and `RUN_SERVERS.md` describes a product switcher that may already group them.
Confirmed by source: validation and confirmation feedback in the kiosk and POS is delivered through blocking native dialogs (UX-001/002).

## Section G — Responsive Findings

| Viewport | Observation | Evidence |
|---|---|---|
| 390×844 | No horizontal overflow on any rendered screen (`overflowX:false` in all 29 probe rows) | `probe-roots.json` |
| 390×844 | Header crowding (UX-004); kiosk script tagline clipped at top | `pos-admin-root-390x844.png`, `kiosk-user-root-390x844.png` |
| 768×1024, 1366×768 | Clean; form precedes hero on small screens | `kds-root-768x1024.png` |
| 1920×1080 | Content stays centred, large margins | `super-admin-login-1920x1080.png` |
| Authenticated screens | **Not tested at any viewport** | — |

Kiosk, POS and KDS are terminals; their 390 px results are informational.

## Section H — Accessibility Findings

**Confirmed failures (rendered or source-certain):** A11Y-002 (unnamed close button), A11Y-003 (zoom lock), A11Y-006, A11Y-008.
**Potential risks (source-level, runtime unverified):** A11Y-001, -004 (calculated), -005, -007, -009; 508 `<th>` with 0 `scope` attributes (modern browsers infer, low risk); 26 `div/span onClick` handlers in Super Admin (mostly backdrop/stop-propagation, a few card-level — verify keyboard operability); reduced-motion honoured in only 12 places and absent in POS/Captain/KDS despite `animate-fadeIn/scaleUp` on all modals.
**Not tested:** screen-reader output, full keyboard traversal, focus order, 200 % text resize, error-identification on submit, live-region announcements (152 `aria-live/role=alert|status` matches exist — a good sign, behaviour unverified).
No claim of WCAG 2.2 AA conformance is made or implied.

## Section I — Interaction and Frontend Findings

- No console errors or uncaught exceptions on any of the 29 rendered page loads.
- Failed requests: 1–3 per page, all to the absent backend/Google Fonts (expected in this environment); not defects.
- Status badge: source comment B2-006 documents that "Connected" used to be hard-coded; it now polls a health URL. Good. *Note:* POS/KDS showed "Local Core: Connected" **because my static file server answered the health URL with `index.html`** — a harness artifact, not an app bug.
- Not testable: form submission, duplicate-click protection, session expiry, offline behaviour.

## Section J — Design System Findings

See DS-001, DS-002, MNT-001. Additional specifics:
- Tokens live in `tailwind.config.js` (`jaman.navy/saffron/ivory/teal/border…`) and are copy-pasted into 6 apps instead of imported from a shared preset.
- `packages/ui` is the right home (Modal, Button, KpiCard, StatusBadge, StateFeedback, ScreenErrorBoundary already exist) but Super Admin re-implements Modal, Input, Skeleton in `components/ui.tsx`.
- A genuine, intentional difference: Super Admin's dark console vs light restaurant apps. Keep.

## Section K — Performance Findings

**Measured:** none. No Lighthouse, no trace; I did not collect metrics and report none.
**Source-level risks:** a 4,325-line kiosk `App.tsx` implies large single-chunk render trees; `Modal.tsx` comment already records a real GPU-lag issue with `backdrop-blur` that was fixed (good); 111 skeleton/pulse usages in Super Admin suggest loading states are handled there.

## Section L — Prioritized Improvement Plan

| Rank | Issue IDs | Proposed improvement | Expected user impact | Priority | Effort (approx.) | Dependencies |
|---:|---|---|---|---|---|---|
| 1 | ENV-001, ENV-002 | Resolve conflicts, `npm install`, re-establish a runnable tree | Unblocks all verification | P0 | S | User approval for install |
| 2 | A11Y-001, A11Y-002, A11Y-007, DS-001 | One accessible shared Dialog; adopt in Super Admin | Fixes every dialog at once | P1 | M | — |
| 3 | UX-001 | Replace kiosk `alert()` with in-app, localised inline errors | Guest-facing polish, language-correct | P1 | S | Existing `showToast` |
| 4 | UX-002 | Replace native confirms with `ConfirmModal`-style dialog | Safer destructive actions | P2 | M | #2 |
| 5 | A11Y-004, DS-002 | Single muted-text token ≥4.5:1; shared Tailwind preset | Readability + one place to tune | P2 | M | — |
| 6 | A11Y-005 | Set a 12 px floor for informational text in POS/Admin/Captain | Readability on terminals | P2 | L | Design review per screen |
| 7 | A11Y-003 | Remove zoom lock from admin consoles | Low-vision access | P2 | XS | Section N decision |
| 8 | A11Y-009 | Keyboard audit of `outline-none` sites | Focus visibility | P2 | M | Runnable env |
| 9 | UX-003/004/005/006/007, A11Y-006/008 | Copy, header and asset polish | Credibility | P3 | S | — |

## Section M — Quick Wins

1. Add `aria-label="Close"` to `Modal.tsx:76` (one line, fixes every dialog's close button name).
2. Drop `user-scalable=no, maximum-scale=1.0` from `pos-admin/index.html` and Super Admin.
3. Delete "Port 4000 · Live Cloud API" and "(Port 4000)" from the login/badge copy.
4. Swap `#8C9BAE`/`#8CA0B3` text for the existing `#52677A` token.
5. Replace the five kiosk `alert()` calls with the existing `showToast`.

## Section N — Decisions Requiring Clarification

- Is zoom intentionally locked on terminal builds (kiosk/POS/KDS)? If yes, A11Y-003 narrows to Restaurant Admin and browser-served Captain.
- Do packaged Tauri builds honour `window.confirm/alert/prompt`? If not, UX-002 is a functional bug, not just a style one.
- Should in-app screens reuse the marketing hero + capability tiles of the auth layout?
- Intended grouping of the 34 Restaurant Admin tabs per product (restaurant vs kiosk) and per role.
- Whether POS/Captain/KDS/Kiosk should support deep links/back-button, given they use state navigation.

## Section O — Positive Findings

- Cohesive brand and token vocabulary across seven separately deployed apps.
- Auth layout is reusable and well-documented in code, including the B2-006 "honest status" fix.
- Modal body scrolls inside a capped card with a pinned footer for primary actions (`Modal.tsx` `footer` prop).
- `ScreenErrorBoundary`, `StateFeedback`, 111 Super Admin skeleton usages: loading/error states are treated as first-class.
- 290+ `aria-label`s, 152 live-region attributes, `main` landmark and `h1` on the guest QR page.
- Friendly, actionable copy on activation and invalid-link screens.
- Zero horizontal overflow across 4 viewports on every rendered screen.

## Section P — Verification and Coverage Limitations

- **No backend, database, or sessions** were available; authentication was not bypassed. All authenticated screens are unverified.
- **Playwright / Lighthouse / axe are not installed**; no installs were performed. Rendering used the machine's Chrome via the DevTools protocol (`scratchpad/cdp.mjs`, not part of the repo).
- **Rendered builds are stale:** the apps were served from pre-existing `dist/` folders dated **2026-10-06** (77 commits behind `main`), because the current source does not compile (ENV-001) and Captain contains conflict markers (ENV-002). Visuals may differ from HEAD.
- My static server answers unknown paths with `index.html`; this made same-origin health checks read "Connected" on POS/KDS/Kiosk. Ignore those badges.
- Keyboard traversal, screen-reader behaviour, contrast on rendered pixels, text zoom, performance and animation were **not measured**.
- Viewports: all four were rendered for each app root; screenshots were *viewed* for the subset named in Section C.
- **Unintended side-effect (disclosed, not cleaned up):** starting `vite dev` for 7 apps made their Vite plugins rewrite 18 tracked files under `*/public/` (favicons, app icons, manifests). `git diff --numstat` and `--ignore-cr-at-eol` show **no content change**, only line-ending/mtime churn (`LF→CRLF` warnings). I did not revert them because the audit rules forbid cleanup actions that could discard your uncommitted work; `git checkout -- <those files>` would restore them if you want. Additionally, the earlier `git pull --rebase --autostash` left merge conflicts (this predates the audit).
- Artifacts created: `docs/reports/ui-ux-audit-2026-10-11/` (this report, `probe-roots.json`, `evidence/*.png`, `evidence/dev-server-resolve-errors-pos.txt`).

## Section Q — Final Recommendation

1. **First five changes:** unblock the build (ENV-001/002); one accessible Dialog (A11Y-001/002/007); remove kiosk `alert()` (UX-001); replace native confirms (UX-002); one compliant muted-text token (A11Y-004).
2. **Most attention:** Restaurant Admin (34 workspaces, 710 sub-12 px declarations, 29 native confirms), POS (453), and the Kiosk guest flow (4.3 k-line file with `alert()` validation) — *based on source patterns, not rendered evidence*.
3. **Leave largely alone:** the shared auth/activation layout and the Super Admin dark login — they are the most polished surfaces I could verify.
4. **Common root causes:** no shared accessible dialog; ad-hoc hex instead of tokens; copy-pasted viewport/Tailwind config; quickest-primitive feedback (`alert/confirm`).
5. **Redesign or targeted fixes?** Targeted fixes. Nothing observed suggests a structural redesign.
6. **Evidence:** consistent rendered quality on 8 screens, and the defects found trace to a handful of shared primitives rather than to per-screen layout failures. Caveat: this conclusion is only as strong as ~7 % visual coverage.
7. **Re-audit after changes:** every authenticated workspace with real seeded data at the four viewports; keyboard-only passes through all dialogs; a measured contrast sweep; the packaged Tauri builds for native-dialog behaviour; and Lighthouse on kiosk and POS.

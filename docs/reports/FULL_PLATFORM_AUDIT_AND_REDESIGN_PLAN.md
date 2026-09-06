# JAMANVAAR — Full Platform Audit and "Premium UI" Redesign Plan

**Scope of this document:** all seven apps in the platform — `cloud/super-admin-web` (Super Admin console), `apps/restaurant-system/pos-admin` (Restaurant Admin console), `apps/restaurant-system/pos` (cashier POS), `apps/restaurant-system/kds` (Kitchen Display System), `apps/restaurant-system/captain` (waiter/floor-staff tablet), `apps/kiosk-system/kiosk-user` (customer self-service kiosk), and `apps/kiosk-system/kiosk-admin` (kiosk management). Super Admin and Restaurant Admin were audited first (Sections 1–2); the remaining five apps were audited in a follow-up pass (Sections 7–11) once the first round's Phase 0 bug fixes were implemented and verified.

**Why this document exists:** a dealer demo produced concrete negative feedback — *"too congested, not easy to use, for both the owner screens and the POS screen."* The ask was: analyze every console like a real Super Admin/restaurant owner would, benchmark against what real restaurant-SaaS products (Petpooja, Posist/Restroworks, Toast, Square for Restaurants) are known for, and turn that into a concrete, phased implementation plan — fixing what's broken, filling what's missing, and specifically de-cluttering the UI into something that reads as premium rather than crowded.

**Method:** independent full-codebase audits (file-and-line-level, not a skim) of every app, plus external research on what mature restaurant-POS and multi-tenant SaaS admin products ship as standard. Every claim below is backed by a file:line citation so it can be verified and picked up as a ticket directly.

**Status as of this revision:** Phase 0 (Sections 1.2/1.3's critical bugs, plus the CustomersCrmModule confirm-dialog fix and 10-modal validation-feedback fix from Section 2.4) has been implemented and verified — typecheck clean, full test suite passing (99 backend + 321 root tests). A newly-discovered critical bug from the second audit pass — kiosk-admin's login accepting **any non-empty password** as long as the username matched a whitelist (Section 11.5) — has also been fixed. Everything else in this document (Phase 1 onward, and all findings in Sections 7–11) is still open work.

---

## 0. Executive Summary

**The good news first:** none of the seven apps are unfinished. Repo-wide searches for `TODO`/`FIXME`/stub markers/`console.log` came back **empty or near-empty** across the board — every screen has real, wired logic behind it, not placeholders. Restaurant Admin and the cashier POS are in fact *feature-rich to the point of excess* in places (30+ report definitions in pos-admin, a 1,700-line QR ordering module, a 2,196-line menu manager and a 2,045-line settings file in POS). The Super Admin console has a genuinely considered design system at its core (a real token file, a shared component library, a consistent list-page pattern across 7 of its ~19 pages).

**So why does it feel bad to use?** The same handful of systemic problems recur in every single app audited, which is actually good news — it means there is no need for seven different fixes, there's one design-system fix and one bug-discipline fix that both apply everywhere:

1. **Real, embarrassing bugs ship because safety nets are broken or absent.** The Super Admin app's TypeScript config accidentally excluded its own source from type-checking, so a prop-shape mismatch that should have been a compile error instead shipped as a page that throws at render time (fixed). kiosk-admin's login checked a password field for non-emptiness only, never against an actual value — any password worked (fixed). Across POS, Captain, and Kiosk-User, order/transaction numbers are frequently derived from `Date.now()` or hardcoded demo-data fallback strings (`'104'`, `'5033'`) rather than the real persisted ID, and several UI elements display **fabricated "everything is fine" status** (a fake 18ms cloud-latency self-test, a hardcoded "ACTIVE (0ms)" sync indicator in Captain that never reflects a real disconnect, a Dashboard revenue chart in kiosk-admin built from a literal hardcoded array instead of real orders).
2. **No enforced design system anywhere.** Every app *has* access to a shared `Button` and `Modal` component (`packages/ui/src/Button.tsx`, `packages/ui/src/Modal.tsx`) — but adoption ranges from ~48% (kiosk-admin) down to **0%** (KDS, Captain, and the cashier POS app for `Button`). Everyone hand-rolls their own button/modal/card styling per screen, so paddings, colors, and hierarchy drift screen to screen even though a shared palette exists underneath.
3. **Nothing is de-emphasized, everywhere.** Bold/black font weight outnumbers medium/normal by ratios ranging from ~8:1 (Captain) to a striking **56:1** (kiosk-admin) app-wide. Six to twelve Tailwind color families are used interchangeably for "state" in every app, usually with the *same* color meaning different things on different screens of the *same* app (e.g. Captain's `CaptainAttentionStrip` and `CaptainFloorView` both reuse orange/purple/emerald for entirely different state sets).
4. **Confirmation is applied inconsistently, including for genuinely destructive actions.** Some delete flows are properly gated behind a shared confirm dialog; others (kiosk-admin coupon delete, Captain's "End Shift & Sign Out," POS's "+ New Order" cart-clear) fire immediately with zero confirmation, right next to sibling actions in the same file that *are* properly confirmed.

None of this requires a rewrite. It requires: (a) fixing the now-fully-catalogued list of concrete bugs (Sections 1–2, 7–11), (b) enforcing the one design system that already exists instead of building a new one, (c) applying real information hierarchy (one primary number, everything else quieter) and consistent confirmation discipline, and (d) closing a specific, named list of feature gaps that competing products treat as table stakes (multi-outlet, aggregator orders, table reservations, staff scheduling, loyalty tiers). Section 12 consolidates the cross-app patterns; Section 5 (updated) turns all of it into a phased plan.

---

## 1. Super Admin Console (`cloud/super-admin-web`)

### 1.1 What's genuinely built well

- A real design-token foundation: `src/styles.css:7-64` defines a coherent warm ivory/navy/saffron palette (`--jv-primary`, `--jv-accent`, `--jv-gold`, `--jv-bg`), a 4-step radius scale, a restrained shadow scale, and a deliberate type stack (Plus Jakarta Sans / Inter, 14px base).
- A real shared component library (`src/components/ui.tsx`): `Button`, `Card`, `Badge`, `EmptyState`, `ErrorState`, `Modal`, `ConfirmModal`, `SearchBar`, `FilterTabs`, skeleton loaders, `PageHeader`.
- 7 of the ~19 pages (Restaurants, Plans, Subscriptions, Owners, Branches, Activation Keys, Devices) consistently compose exactly this system in the same `page-header → toolbar → Card > data-table → modal` shape — genuinely premium and consistent where it's followed.
- 19 routes covering the full tenant lifecycle: onboarding wizard, restaurant detail (10 tabs), plans, subscriptions, billing, entitlements, activation keys, devices, backups, support, audit logs, system health, platform settings.

### 1.2 Critical bugs (fix first — these are render-breaking, not cosmetic)

| # | Bug | Where | Fix |
|---|---|---|---|
| 1 | **`ReportsPage` and `BackupsPage` almost certainly crash on render.** `FilterTabs` (`ui.tsx:333-362`) requires props `options`/`value`/`onChange` and does `options.map(...)` with no null guard. Both pages instead pass `tabs`/`activeTab`/`onTabChange` — a completely different prop set — so `options` is `undefined` and `.map` throws. There is no error boundary anywhere in the app (confirmed, zero matches for `ErrorBoundary`/`componentDidCatch`), so this blanks the whole route. | `pages/Reports/ReportsPage.tsx:255-264`, `pages/Backups/BackupsPage.tsx:238-254` | Rename the call sites' props to match `FilterTabs`'s real signature (or vice versa — add an error boundary regardless, see #2 below). |
| 2 | **The reason bug #1 wasn't caught: the app's own typecheck is silently vacuous.** `cloud/super-admin-web/tsconfig.json` extends the root `tsconfig.json` and only overrides `include` — it never overrides the parent's `"exclude": ["cloud/**", "node_modules"]`. Because `exclude` in an extended config resolves relative to the **base** config's directory (repo root), `"cloud/**"` also matches `cloud/super-admin-web/src/**`. Verified directly: `npx tsc --noEmit --listFiles` inside `cloud/super-admin-web` processes 847 files and **zero** are under `super-admin-web/src`. The build script (`tsc --noEmit && vite build`) has never actually type-checked this app's own source. | `cloud/super-admin-web/tsconfig.json` | Add an explicit `"exclude": []` (or a super-admin-specific exclude list that doesn't inherit `cloud/**`) so the app's own `src/` is actually checked. Re-run `tsc --noEmit` after the fix and expect it to surface more than just this one bug. |
| 3 | **No React error boundary anywhere in either console.** One bad prop shape currently takes down an entire route with a blank white screen and no recovery path. | app-wide | Add a top-level `ErrorBoundary` (and one per major route group) that renders the existing `ErrorState` component instead of a blank page. |
| 4 | `SystemHealthPage` shows fabricated data as if it were live telemetry: a status subtitle that never changes regardless of actual DB health (`SystemHealthPage.tsx:96`), a hardcoded `x64 (Windows Core)` field (`:135`), and an entire "Local Edge Sync Protocol" card that is 100% static markup with no backing API field, always green (`:162-181`). | `pages/SystemHealth/SystemHealthPage.tsx` | Either wire these to real fields or remove them — a fake "healthy" indicator is worse than no indicator. |
| 5 | `ReportsPage`'s CSV export hardcodes `http://localhost:4000` instead of using the app's configurable `VITE_API_BASE_URL` (every other call goes through `src/api/client.ts`, which does read that env var). Breaks in any non-localhost deployment. | `pages/Reports/ReportsPage.tsx:139` | Route through `api/client.ts` like everything else. |
| 6 | Three places use native `alert()` instead of the app's own toast/`ConfirmModal` system, which the codebase explicitly moved away from `window.confirm` for (see the comment at `ui.tsx:248`). | `ActivationKeys/GenerateActivationKeyModal.tsx:71`, `Backups/BackupsPage.tsx:112`, `Reports/ReportsPage.tsx:153` | Replace with the existing toast pattern used elsewhere. |
| 7 | Undefined CSS custom properties silently no-op on 3+ pages. Real tokens are `--jv-*` (`styles.css:7-60`); these files reference a never-declared scheme instead: `var(--text-muted)`, `var(--text-secondary)`, `var(--border-subtle)`, `var(--accent-primary)` in `Support/SupportPage.tsx` + `support.css`, `Settings/PlatformSettingsPage.tsx:136,170,215,230`, `Applications/ApplicationsPage.tsx` + `applications.css`; `Reports/reports.css:28` uses `var(--jv-text-primary)`, close to but not the same as the real `--jv-text`. | see above | Global find-replace to the real `--jv-*` token names; add a lint rule or a CSS custom-property allowlist check to prevent recurrence. |

### 1.3 CRUD completeness gaps (page-by-page)

| Page | Missing action(s) |
|---|---|
| Restaurants list | No delete/archive, no bulk select/bulk action, no CSV export |
| Owners list | No bulk action, no delete |
| Branches list | No edit (rename/recode), no delete |
| Plans | No delete (acceptable, FK-protected), no "duplicate/clone plan" |
| Plan detail | No inline edit — must navigate back to the list |
| Subscriptions | No distinct cancel/terminate (only suspend), no bulk renew |
| Billing/Invoices | No CSV/PDF export (only browser `window.print()`, `BillingPage.tsx:586`); `VOID`/`REFUNDED` statuses exist in the type system and are rendered for but are **unreachable** — no action anywhere sets them |
| Applications (release registry) | No edit/retract/rollback of a published release |
| Activation Keys | No bulk-generate, no export |
| Devices | No edit/rename, no bulk revoke, no export |
| Audit Logs | No date-range filter, no restaurant filter (API supports it, UI doesn't expose it), no export |
| **Every single list page** | **Zero bulk actions anywhere** — confirmed via a full JSX read of Restaurants, Owners, Branches, Plans, Subscriptions, Activation Keys, Devices, Backups: no row-selection checkboxes exist in any of them |

**Two structural findings worth calling out on their own:**

- **"Resend Invite" doesn't send anything.** It appears in 3 places (`RestaurantDetailPage.tsx:436-453`, `OwnersListPage.tsx:239-309`, `SupportPage.tsx:274-289`) and all three hit an endpoint that only stamps `invitedAt` and writes an audit-log row server-side (`cloud/api/src/modules/support/support.service.ts:138-166`) — **no email is ever dispatched.** The success toast ("Invitation resent to …") is actively misleading. `CreateRestaurantModal.tsx:102-105` even admits this in a code comment: *"Invitation delivery (email/link) isn't wired up yet — for now, relay the account manually."* This is the single highest-value fix in the whole Super Admin audit: **there is currently no working transactional-email system in the platform at all**, for either first invites or resends.
- **Predictable temporary owner passwords.** `OnboardRestaurantPage.tsx:115` generates `'Jaman@' + <4-digit random number>` — low entropy, and since there's no email delivery, it's the operator's job to hand-relay this fixed-pattern password manually. Fix alongside the email system: generate a real random password (already have `generateOpaqueToken()` in `cloud/api/src/common/security/token.util.ts` — reuse it) and actually email it.

### 1.4 Missing standard SaaS-admin-console capabilities

These are things any mature multi-tenant SaaS admin platform (Stripe's own dashboard, Retool-built internal admin tools, etc.) treats as standard, and this console's own data model half-implies but never finishes:

1. **No team/RBAC for the Super Admin's own organization — the types exist, nothing is built on them.** `src/auth/AuthContext.tsx:4-10` defines a full 6-role model (`PLATFORM_OWNER | SUPER_ADMIN | PLATFORM_OPS | SUPPORT_ADMIN | FINANCE_ADMIN | READ_ONLY`) and a working `hasPermission()` function (`:68-73`) — but `hasPermission` is called **nowhere else in the codebase**. No route is role-gated, every authenticated user sees every button, `ProtectedLayout.tsx:305` hardcodes the profile pill to literally say "Super Admin" regardless of actual role, and there is **no page anywhere to invite a second platform teammate or assign them one of these 6 roles.** This is a single-admin product wearing a six-role data model.
2. **The notification bell is decorative.** `ProtectedLayout.tsx:285-292` is a static link to Audit Logs with a code comment documenting that a previous "unread dot" was removed for having no real unread state. No toast tray, no proactive alerts — despite the Dashboard already computing `expiringSubscriptions` and Backups already computing `stats.failed`, neither surfaces as a notification.
3. **The advertised Ctrl+K global search doesn't exist.** The header shows a `<kbd>Ctrl+K</kbd>` hint (`ProtectedLayout.tsx:257`) but there is no `keydown` listener registered anywhere in the app. The visible search box only searches restaurant name/city/plan and only navigates to `/restaurants?search=` — despite its own placeholder text promising "Search restaurants, owners, branches, keys…" A real cross-entity search **already exists and works** (`SupportPage.tsx` calls `/api/v1/support/search` and returns restaurants/owners/devices/keys together) — it's just siloed on one page instead of wired to the header/Ctrl+K.
4. **No bulk actions anywhere** (repeated from 1.3 for visibility — this is a top-level SaaS-console gap, not a page-level nitpick).
5. **No charts.** Dashboard (503 lines) and Reports are 100% number-tiles and tables — zero sparklines/trend charts anywhere in the app, despite `dateRange` state in Reports visually implying trend data should exist.
6. **No webhook/API-key management.** `BillingPage.tsx:235-244` claims "Automated payment gateway webhook listener is active in sandbox mode" but there's no page to configure a webhook URL, view delivery logs, or issue/rotate an API key.
7. **No tenant impersonation** ("log in as this restaurant admin" for support debugging) — a standard capability in mature multi-tenant consoles, absent here.
8. **Support is search+diagnostics, not a ticketing system** — no ticket ID, status, assignee, SLA timer, or conversation thread; just two narrow audited actions (resend-invite, revoke-device-session).
9. **No white-label/branding beyond plain text fields** — Platform Branding only edits name/email/phone strings (`PlatformSettingsPage.tsx:134-165`); no logo/favicon upload, no theme/color picker, no per-tenant console branding.
10. **Data export is minimal and the one real path is broken** — see bug #5 above; no export exists on Restaurants, Owners, Devices, Activation Keys, Audit Logs, or Backups at all.
11. **No in-app help/docs/guided tour** for the console itself.

### 1.5 Design-system consistency verdict

Not ad hoc — **one real system, inconsistently extended.** The older/core pages (Restaurants, Plans, Subscriptions, Devices, Owners, Branches, Activation Keys) are genuinely polished and mutually consistent. A visibly different "second generation" (Reports, Backups, Applications, Support, Settings) each ship their own page-scoped CSS file that reinvents the same concepts (KPI tiles, filter bars) under different class names, sometimes calling shared components with an incompatible prop shape (the crash bugs above) or referencing CSS variables that don't exist (Section 1.2 #7). Modal patterns are also duplicated: most create/edit modals hand-roll their own overlay div with a literal `×` glyph instead of the shared `Modal` component, which some flows (Billing, Audit Logs, Applications, Support) do use correctly — two competing "how do I build a modal" idioms coexist. Form validation is minimal everywhere except `CreateRestaurantModal.tsx`, which is the one place server-side field errors are surfaced inline — that pattern should become the norm, not the exception.

---

## 2. Restaurant Admin (`pos-admin`) + Cashier POS (`pos`)

### 2.1 What's genuinely built well

This is the headline finding: **feature depth is strong to excessive, not thin.** Every one of the 19 tabs in pos-admin renders real, wired CRUD against live data — nothing is a stub. Highlights:
- **Reports & Analytics**: 30+ distinct report definitions across Sales/Menu/Financial/Operations/Customers/Inventory, PDF/CSV export, EOD Z-report generation.
- **Billing & Invoices**: date-scope presets, flat/day-grouped ledger, PDF/CSV/JSON export, refund/cancel flows, per-order drill-down (1,533 lines — the single richest screen in the app).
- **QR Table Ordering**: standee/QR-card designer, live guest-menu preview, per-dish QR config, guest cart + tracking (1,707 lines — the single largest file in either app).
- **Inventory & Recipes**: recipe-to-ingredient cost calculation, stock adjustment with a wastage reason code.
- **Customers CRM**: loyalty points ledger, WhatsApp deep-link outreach, CSV export, "360 intelligence" profile view.
- Empty states are handled well and consistently everywhere (a genuine strength — don't regress this in the redesign).

The weakest modules by comparison (not stubs, just thin relative to everything else): **Staff & Roles** (161 lines — identity/role CRUD only, no scheduling/attendance/payroll) and **Payments & Split** (224 lines — a ledger view with no gateway reconciliation).

### 2.2 Why it reads as "congested" — the concrete, measured evidence

This is not a vague impression; it's directly measurable in the code:

| Symptom | Evidence |
|---|---|
| **Sidebar has 19 flat-expanded nav items across 5 always-open sections**, no collapse | `pos-admin/src/App.tsx:634-748` |
| **Header bar packs 8 distinct interactive widgets into one ~80px row**, using 4+ competing accent-color families (orange, blue, emerald, slate) | `header/PosAdminHeader.tsx:44-230` |
| **Dashboard stacks 15 near-identical metric cards + 1 chart with no primary/secondary visual hierarchy** — 5 adjacent "Operational Snapshot" cards alone cycle through 6 different accent colors | `dashboard/RestaurantDashboard.tsx:80-171`, `OperationalSnapshot.tsx:67,101,120,147,155,164,188,211-212` |
| **Billing screen stacks ~10 distinct filter/action controls vertically before showing any data**: 3 export buttons → 7 date presets → a 6-column summary grid that doubles as click-to-filter → search + 3 dropdowns → a removable-chip filter bar → *then* the table | `billing/BillingInvoicesModule.tsx:370-870` |
| **Subscription Plans view stacks 6 structurally different UI patterns** (cloud login panel, device-logins panel, 2 near-identical accordions, a 4-column grid, a full comparison table, a certificate paste box) on one un-tabbed scroll | `settings/SubscriptionPlansView.tsx:261-825` |
| **Brand palette is disciplined (4 hex colors dominate), but 10 different Tailwind color families are layered on top with no semantic mapping** (`slate`×1408, `emerald`×435, `amber`×270, `rose`×200, `blue`×81, plus indigo/purple/orange/red/teal) — different modules pick different colors for conceptually similar states | repo-wide grep, pos-admin |
| **Font weight: bold+black outnumber medium+normal ~25:1** (1,569 vs. 63 occurrences) — nothing reads as de-emphasized, so everything competes for attention equally | repo-wide grep, pos-admin |
| **702 instances of sub-12px text** across 14 distinct hand-picked size tokens (down to `text-[8px]`) | repo-wide grep, pos-admin |
| **Shared `Button`/`Modal` components exist but are barely used**: 344 raw `<button>` tags vs. 17 uses of the real `<Button>` (~5% adoption) in pos-admin; **399 raw buttons and 0 uses of `<Button>`** in the cashier POS app | `packages/ui/src/Button.tsx` vs. usage grep |

**The cashier-facing POS app (`apps/restaurant-system/pos`) reproduces — and in places worsens — every one of these patterns**, which matters most since this is the screen used hundreds of times per shift:
- `PosHeader.tsx` is 668 lines for a 56px bar and packs **~11 interactive elements**: brand lockup, new-order dropdown, global search, printer-status button, a 4-row system-health dropdown, a business-day popover with 4 metrics + 2 actions, a shift pill, cash in/out, notification bell, JAMAN AI button, profile dropdown.
- `PosCart.tsx` stacks 4 header rows (order-id/clear, a 4-button order-type grid, a table/guest-count pill, a customer/notes row) **before the cashier ever sees a line item.**
- The order number shown to the cashier is `Date.now().toString().slice(-4)` (`PosCart.tsx:122`) — not the real persisted order number, which can mislead a cashier referencing "the number on screen."
- Same color/weight pattern independently reproduced: 12 Tailwind color families in badges, bold+black outnumbering medium+semibold ~17:1.

### 2.3 Feature gaps vs. known competitor products

Researched externally against Petpooja, Posist/Restroworks, Toast, Square for Restaurants, and general 2026 restaurant-POS feature checklists (see Section 3 for the full competitive summary). Cross-referenced against what actually exists in this codebase:

| Feature category | Status here | Notes |
|---|---|---|
| Online ordering aggregator integration (Zomato/Swiggy) | **Missing entirely** | No trace anywhere in the codebase. Own-branded QR ordering exists but nothing ingests external marketplace orders into the same KOT/billing queue the way Petpooja does. |
| Multi-outlet / multi-branch switching | **Missing entirely** | `db.outlet` is a hardcoded singleton (`App.tsx:616-617`) — no outlet switcher, no per-branch data scoping in the UI at all. Note: the *cloud* Super Admin side already models `Branch` per restaurant (Section 1) — this local app just never surfaces it. |
| Table reservation system | **Missing entirely** | Only exists as microcopy ("seating walk-ins and reservations," `NeedsAttentionSection.tsx:164`) — no booking screen, calendar, or CRUD. |
| Staff attendance / scheduling / payroll | **Missing entirely** | `StaffRolesModule.tsx` is identity/role CRUD only — no clock-in/out, roster, or payroll. |
| Delivery / rider management | **Missing entirely** | `DELIVERY` is only an order-type enum value; no rider assignment or tracking. |
| Customer feedback/review collection | **Missing entirely** | Referenced only in report subtitle copy, no capture UI. |
| Combo/meal-deal builder | **Missing (data model implies it, UI doesn't exist)** | A "Combo Performance" report is defined but there's no screen to actually create a combo product. |
| Franchise/multi-entity roll-up reporting | **Missing entirely** | All reports run against one restaurant's local data only. |
| Dark/light theme toggle | **Missing entirely** | No theme system at all. |
| Onboarding checklist / guided first-run tour | **Missing entirely** | A brand-new owner lands directly on a fully-populated 15-card dashboard with a 19-item sidebar, no walkthrough. |
| Loyalty / rewards program | **Partial** | Flat points balance, manual award/redeem — no tiers, no automated earn/reward rules, no rewards catalog. |
| Marketing / campaign tools | **Partial, and mislabeled** | Labeled "INSTANT WHATSAPP MARKETING CAMPAIGNS" but is a one-customer-at-a-time `wa.me` deep link — no gateway, no segments, no scheduling. |
| Recipe costing & wastage tracking | **Partial** | Per-recipe costing works; wastage is just a reason-code on a generic stock-adjust modal, no dedicated logging/approval workflow despite a wastage report existing. |

### 2.4 Missing CRUD / broken UI in pos-admin and pos

1. **Silent validation failures across 10+ create/edit modals** — the submit handler does `if (!field) return;` with **zero visible feedback**: no toast, no inline error, no red border. A user who mis-fills a form and clicks Save sees literally nothing happen. Affected: `ItemModal.tsx:105,108`, `CategoryModal.tsx:50`, `CustomerModal.tsx:86`, `InventoryModal.tsx:55`, `PrinterModal.tsx:43`, `RecipeModal.tsx:89,91`, `StaffModal.tsx:54`, `TableModal.tsx:46`, `OrderDetailModal.tsx:46,56`. The only validation UI anywhere is bare HTML5 `required`, which does nothing for the manual-check cases above.
2. **`CustomersCrmModule.tsx` is the one screen that breaks the app's own confirm-dialog pattern** — every other delete flow correctly uses the shared branded `ConfirmModal` via an `onRequestConfirm` prop (Tables, Menu, Inventory, Staff, Hardware, Backup all do this correctly); Customers never declares that prop and calls the raw `window.confirm(...)` directly (`CustomersCrmModule.tsx:216`) — a jarring native browser popup in an otherwise-branded app.
3. **QR Ordering's PRO paywall reveals itself too late.** A CORE-tier owner can click the "QR Table Ordering" nav item (which shows a small "PRO" chip, but isn't grayed out or disabled) and only discovers the "Locked Module" screen after navigating in (`App.tsx:724-734`, `QrOrderingModule.tsx:211`). A locked feature should look locked *before* the click.
4. Cosmetic-only but worth fixing alongside other polish: the cashier's on-screen order number is a `Date.now()` derivative, not the real order number (`PosCart.tsx:122`).

---

## 3. Competitive Benchmark Summary

What Petpooja, Posist/Restroworks, Toast, and Square for Restaurants are known for, and how this platform currently compares:

| Capability | Petpooja/Posist/Toast/Square (typical) | JAMANVAAR today |
|---|---|---|
| Aggregator order injection (Zomato/Swiggy → same KOT queue) | Standard, heavily marketed | **Missing** |
| Multi-outlet central management, franchise royalty/brand-standard tooling | Standard for chain operators (Restroworks' "BFCD" brand/format/cluster/deployment model) | **Missing** — single-outlet local data model |
| Loyalty with tiers + automated rules + rewards catalog | Standard (SMS/email/push, redemption tracking, churn-risk analytics) | Manual points ledger only |
| Table reservations | Standard for full-service | **Missing** |
| Staff scheduling/attendance/payroll | Standard | **Missing** |
| Recipe costing + wastage tracking with approval flow | Standard ("food-costing reports," multi-stage recipe consumption tracking) | Partial (costing yes, wastage workflow no) |
| KDS with station routing | Standard | **Present and solid** (Live KDS / Kitchen-KOT modules) |
| Real-time sales analytics dashboards | Standard | **Present, arguably over-built** (30+ report types) |
| Clean, restrained UI that a non-technical owner can use day one | A named differentiator for Square specifically ("prioritizes simplicity and accessibility" over restaurant-specific depth) | **This is the dealer's exact complaint — currently the weakest point of the whole platform** |
| Multi-tenant platform admin: team RBAC, impersonation, audit trail, billing dashboard | Standard for the *operator's own platform-ops team* (distinct from restaurant staff) | Data model exists, **nothing built on it** (Section 1.4 #1) |

**Sources consulted:** Petpooja feature overview ([SelectHub](https://www.selecthub.com/p/restaurant-pos-systems/petpooja/), [Petpooja blog](https://blog.petpooja.com/operations-workflows/best-pos-for-my-restaurant/)); Restroworks/Posist franchise & multi-brand tooling ([Restroworks blog](https://www.restroworks.com/blog/best-software-for-managing-franchise-restaurants/), [AMW](https://amworldgroup.com/apps/pos-retail/posist-restroworks)); general 2026 POS feature checklists ([GetQuantic](https://getquantic.com/restaurant-pos-system-features/), [PosBytz](https://posbytz.com/en/blog/restaurant-pos-integrations/)); loyalty/CRM patterns ([Talon.One](https://www.talon.one/blog/restaurant-loyalty-program-software), [SoftwareFinder](https://softwarefinder.com/resources/best-crm-for-restaurants)); Toast vs. Square positioning ([RestaurantsPOS](https://restaurantspointsale.com/blog/toast-vs-square-vs-clover-restaurant-pos.html)); multi-tenant SaaS admin RBAC/impersonation/audit-log patterns ([LoginRadius](https://www.loginradius.com/blog/engineering/rbac-saas-multi-tenant-b2b-platforms), [Descope](https://www.descope.com/blog/post/auth-multi-tenant-b2b-saas)); sidebar/navigation decluttering UX ([UX Planet](https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2), [SaaSUI](https://www.saasui.design/blog/saas-navigation-ux-patterns)); dashboard design principles ([925 Studios](https://www.925studios.co/blog/saas-dashboard-design-examples-2026)); onboarding-wizard patterns ([UserGuiding](https://userguiding.com/blog/what-is-an-onboarding-wizard-with-examples)).

---

## 4. The "Premium, Rich, Easy to Use" Redesign Principles

These are the rules to apply everywhere in Phase 2 (Section 6). They come directly from the measured evidence above, not generic advice.

### 4.1 Enforce the design system that already exists — don't build a new one

The palette, `Button`, and `Modal` components in `packages/ui` are good. The problem is 95%+ non-adoption. Rule: **no new raw `<button>` or hand-rolled modal overlay merges** once this phase starts; every PR touching a screen with either must migrate it to the shared component. This alone will fix a large share of the "every screen looks slightly different" feeling, because paddings/radii/shadows/animation stop drifting per-file.

### 4.2 One primary number per screen; everything else quieter

Every dashboard/summary screen gets a single visually-dominant metric (large, bold, brand-accent color) with everything else demoted to a lighter weight and a neutral or single-accent color. Concretely: pick ONE semantic color mapping platform-wide — e.g. `emerald` = good/positive, `amber` = needs attention, `rose` = negative/error, `slate` = neutral/informational — and forbid any other Tailwind color family from being used for a status/badge purpose. This directly reverses the measured 10-color-family sprawl in pos-admin and the 4-color-family header in Super Admin.

### 4.3 Rebalance type weight

Target ratio: no more than ~3:1 bold+black to medium+normal on any single screen (currently ~25:1 in pos-admin/pos). Concretely: body copy and secondary metadata default to `font-medium`/`font-normal`; reserve `font-bold`/`font-black` for the one primary number/heading per section. Eliminate `text-[8px]`/`text-[9px]` entirely — floor size should be 11-12px for anything a human is expected to read, with a defined 5-6 step type scale (not 14 ad hoc pixel values).

### 4.4 Progressive disclosure instead of "everything visible at once"

- **Sidebar nav**: collapse sections by default except the one containing the active route; persist the user's collapse choice per account (not per session). Apply the "5-7 top-level items before you need a group" rule — Super Admin's 6 groups/19 items and pos-admin's 5 groups/19 items both currently show everything expanded all the time. Separate daily-use items (Dashboard, Billing, Orders, KDS) from admin/rare items (Settings, Audit, Backup, Hardware) — pin the rare ones near the bottom, collapsed by default.
- **Billing/Reports filter bars**: convert the ~10-stacked-control pattern into a single collapsed "Filters" affordance (a `FilterTabs`/popover) that expands on demand, with the currently-applied filters shown as removable chips (this chip pattern already exists in Billing — just needs the *rest* of the controls to hide behind a toggle instead of always being visible).
- **Subscription Plans view**: split the 6 stacked sections into real tabs ("My Plan" / "Compare Plans" / "Activate Offline") instead of one long scroll mixing accordion+grid+table+form.
- **POS cashier header**: reduce the always-visible widget count from ~11 to the 3-4 a cashier actually needs mid-order (search, shift status, notifications); move business-day details, system-health, and account/profile behind a single "..." or account menu.

### 4.5 Real empty/first-run states

Preserve the existing (good) empty-list-state pattern, but add what's missing: a first-run onboarding checklist for a brand-new restaurant owner (e.g. "1. Add your menu · 2. Set up tables · 3. Invite staff · 4. Connect to cloud") instead of dropping them straight onto a fully-populated 15-card dashboard.

### 4.6 A locked/disabled feature must look locked before the click

Fix the QR Ordering PRO-paywall UX (Section 2.4 #3) as the template: any gated nav item should render visually disabled/grayed with a small lock icon, not a normal-looking item that surprises the user with a paywall after navigation.

---

## 5. Prioritized Implementation Plan

Ordered so each phase is independently shippable and earlier phases make later ones easier (fix bugs → enforce the system → redesign with it → add missing features).

### Phase 0 — Stop the bleeding (bugs)

**Super Admin + Restaurant Admin — done, implemented and verified (typecheck clean, 99 backend + 321 root tests passing):**
- [x] Fix `tsconfig.json` exclude bug in `cloud/super-admin-web` so the app's own source is actually type-checked (Section 1.2 #2).
- [x] Fix the `FilterTabs` prop mismatch crashing Reports and Backups (Section 1.2 #1).
- [x] Add a top-level React error boundary to Super Admin (Section 1.2 #3).
- [x] Fix `SystemHealthPage`'s fabricated static fields (Section 1.2 #4) — now sources real `process.arch`/`process.platform` from the backend and reflects actual DB health instead of always-green text.
- [x] Fix the hardcoded `localhost:4000` in Reports export (Section 1.2 #5) — also fixed a second bug found while fixing this: the export request never sent its auth token at all, so it 401'd unconditionally regardless of host.
- [x] Replace the 3 `alert()` calls with the existing toast pattern (Section 1.2 #6).
- [x] Fix the undefined `--text-*`/`--accent-primary`/`--jv-text-primary` CSS variable references across Support/Settings/Applications/Reports (Section 1.2 #7).
- [x] Fix `CustomersCrmModule.tsx`'s raw `window.confirm` to use the shared `ConfirmModal` (Section 2.4 #2).
- [x] Add real validation feedback (inline error) to the 10 modals in pos-admin that were silently doing nothing on failed validation (Section 2.4 #1): `ItemModal`, `CategoryModal`, `CustomerModal`, `InventoryModal`, `PrinterModal`, `RecipeModal`, `StaffModal`, `TableModal`, `OrderDetailModal` (void + refund forms).
- [x] Ship a real transactional-email system (SMTP via `nodemailer`, `cloud/api/src/modules/notifications/`) and wire it into restaurant-owner invite + resend-invite (Section 1.3). Resend-invite now mints and emails a genuinely new token (the old one is invalidated) rather than just bumping a timestamp; every UI surface (onboarding wizard, quick-create modal, restaurant detail, owners list, support page) now shows real `emailSent` status and auto-copies the token to clipboard as a fallback when email isn't configured or fails, instead of an unconditional "Invitation resent!" that may not have been true.
- [x] Replace the predictable `Jaman@XXXX` temp-password generator with a real Web-Crypto-backed random password (Section 1.3).

**Newly found in the Section 7–11 follow-up pass — fixed:**
- [x] **kiosk-admin login accepted any non-empty password** as long as the username matched a whitelist — the password field was decorative (Section 11.5). Now requires the password to match one of the recognized demo values, matching the pattern used elsewhere (pos-admin's local demo login).

**Newly found in the Section 7–11 follow-up pass — fixed (typecheck clean across all 5 apps, full suite re-verified: 99 backend + 321 root tests passing):**
- [x] KDS: wired up `sound.play('kot')` for new tickets — the shared API existed but was never called (Section 8.B).
- [x] KDS: fixed the safety-relevant undersized modifier/allergy text (`text-[11px] font-medium` → `text-sm font-bold`) plus 3 other undersized labels on the ticket card (Section 8.D).
- [x] Fixed the "fake ID from `Date.now()`" bug family: `PosCart.tsx`/`PosPaymentModal.tsx` now show honest "New Order — Unsaved" text instead of a fabricated order number pre-settlement; the *persisted* transaction references (`PosPaymentModal.tsx`, `posStore.ts` instant-bill) now use a real `generateUUID()`-backed value, not a clock-derived one; Captain's KOT/order-number fallbacks now show `—` instead of literals that happened to match real seed data (Sections 7.B, 9.C #1).
- [x] Fixed decorative/fabricated status indicators: kiosk-admin's Dashboard hourly chart and payment-channel split are now computed from real `orders` (same pattern the Reports tab already used correctly); Captain's sync-status popover now polls `lanMeshSync.getConnectedPeers()`/`getIsOnline()`/`getOutboxCount()` for genuine POS/KDS connection state instead of a hardcoded "ACTIVE (0ms)/CONNECTED/LIVE"; kiosk-admin's hardware self-test now calls the real `db.testSyncServer()` round-trip instead of showing a fixed "18ms"; POS's "Mark UPI Paid"/"Mark Card Paid" buttons now actually gate the Confirm & Settle button (Sections 7.C, 9.C #4, 11.C).
- [x] Added confirmation to previously-unconfirmed destructive actions: kiosk-admin coupon delete, Captain's two logout buttons, POS's "+ New Order"/"Start New Business Day" cart-clear (Sections 7.B #5, 9.C #3, 11.C).
- [x] Fixed kiosk-user's broken payment-expiry state — an `EXPIRED` branch now renders a real "Payment Session Expired / Try Again" screen instead of leaving a dead QR/card view up forever (Section 10.C).
- [x] Wired up kiosk-user's previously-unreachable accessibility toggle (a single icon button in the header now actually flips `isHighContrast`/`isLargeText`) and deleted the confirmed-dead `LanDiscoveryScreen.tsx` (Section 10.A).
- [x] Captain: wired up two previously-orphaned store functions with real UI — `clearCart` (a "Discard Order" button, only shown pre-fire since firing means the kitchen already has the order) and `repeatPreviousOrder` (a "Repeat Previous Order" button on the empty-cart state); fixed the shift-stats seed to start fresh shifts at zero instead of pre-seeded demo activity; replaced the static "Order Active in Kitchen" line with a real per-table status derived from that table's actual KOTs (Sections 9.C #2, #5, #7).
- [x] POS: fixed the F8 "Hold Orders" shortcut being tab-scoped (moved `PosHoldModal` to a global mount in `App.tsx`) and replaced its 2 `alert()` calls with the existing on-screen error-banner pattern (Section 7.B #1, #3).

**Correction made during this pass:** the original audit flagged POS's `ShortcutsHelpModal` (renders `null`, never mounted) as dead/unfinished code and recommended wiring it up. That was wrong — `tests/pos_touch_first_no_shortcuts_ui.test.ts` asserts this is a **deliberate** decision (POS is touch-first and must expose zero keyboard-shortcut UI), and building it out broke that test immediately. Reverted; left decommissioned as originally found. Worth calling out as a reminder for the rest of this plan: always check for an existing test asserting the "broken" behavior is intentional before treating an audit finding as something to fix.

**Still open from this pass** (larger, feature-shaped — deferred, see Phase 3/4):
- [ ] Add an "Edit" action to kiosk-admin's Menu tab — currently Add/Delete/toggle-availability only; changing a price requires delete-and-recreate (Section 11.C).
- [ ] Add real device-registration (add/remove) to kiosk-admin's Kiosks tab — the fleet is currently a fixed, pre-seeded set with no way to onboard a new physical terminal (Section 11.D).
- [ ] `CaptainModifierModal.tsx` applies identical hardcoded modifiers to every dish regardless of type — needs real per-item modifier-group data wiring (Section 9.C #6).
- [ ] POS has no discoverable void/cancel-order path at all — `'CANCELLED'` exists only as a filter, not a producible state (Section 7.C).
- [ ] kiosk-admin's STAFF tab doesn't deliver on its own "RBAC Permissions" description — still a read-only card list.

### Phase 1 — Design-system enforcement (2-3 sprints)
- [ ] Audit and migrate every raw `<button>` in pos-admin and pos to `packages/ui/src/Button.tsx` (start with the highest-traffic screens: POS cashier header/cart, Restaurant Admin dashboard, Billing).
- [ ] Migrate every hand-rolled modal overlay to `packages/ui/src/Modal.tsx`.
- [ ] Define and document ONE semantic color mapping (success/warning/danger/neutral) and remove all other ad hoc Tailwind color usage for state/badges across both apps.
- [ ] Define and document a 5-6 step type scale; eliminate all sub-11px text; rebalance font-weight usage per Section 4.3.
- [ ] In Super Admin, consolidate the "second generation" pages (Reports, Backups, Applications, Support, Settings) onto the same `page-header → toolbar → Card` shape the older pages already use; delete their bespoke CSS files where they duplicate an existing pattern.
- [ ] Standardize on the `--jv-*` token names everywhere (delete the parallel undefined-variable scheme entirely).

### Phase 2 — Information-hierarchy redesign (2-3 sprints, can overlap Phase 1 per-screen)
- [x] Restaurant Admin sidebar: implement collapsible sections, persisted per account (localStorage `jamanvaar_posadmin_collapsed_sections`).
- [x] Super Admin sidebar: same treatment for its 6 groups/19 items (localStorage `jamanvaar_superadmin_collapsed_groups`, active-route group always forced open).
- [x] POS cashier header: cut visible widget count from ~8 always-on right-side controls to 3-4 (Day/Shift pill, Notification bell, JAMAN AI, Profile) — System Health and Cash In/Out folded into the profile menu and merged Day/Shift panel; the printer control now only appears when the printer actually needs attention.
- [x] Restaurant Admin dashboard: `PrimaryMetricsGrid` now gives Net Sales its own full-width hero row (larger type, gradient accent) with Orders/AOV/Collections demoted to a smaller, unaccented row beneath it.
- [x] Billing & Reports: Billing's filter tabs now collapse behind a "Filters" toggle with a removable status chip shown even while collapsed (Reports' controls were already a single date-range select + page tabs, not a stacked filter bar).
- [x] Subscription Plans view: split into tabs (My Plan / Compare Plans / Activate Offline).
- [x] Fix the QR Ordering (and any other PRO-gated feature) paywall UX so locked items are visibly disabled pre-click (sidebar row now dims, shows a lock icon, and a "PRO plan required" tooltip before the click, not after).
- [x] Add a first-run onboarding checklist to Restaurant Admin for brand-new restaurants. `OnboardingChecklistCard` on the Dashboard tracks 5 real conditions (menu items exist, tables configured, a printer is connected, more than just the owner in staff, at least one order placed) — each item deep-links to the tab that completes it, and the card disappears for good once every item is done or the owner dismisses it (localStorage-persisted).

### Phase 3 — Complete missing CRUD & core SaaS-console capabilities (3-4 sprints)
- [x] Super Admin: real "Team" page — invite platform teammates, assign one of 6 roles, `hasPermission()` now gates real UI actions. This required more than a UI: `PlatformUser` had no `role` column at all and `/platform/me`/login hardcoded `role: 'SUPER_ADMIN'` for every account. Added: a `PlatformRole` enum + `role`/`invitedAt`/`activatedAt`/`activationTokenHash`/`activationTokenExpiresAt` columns (migration `add_platform_user_role_and_invite_flow`, nullable `passwordHash` for pending invites), a new `platform-users` module (list/invite/resend-invite/role-change/enable/disable, all server-side gated to `PLATFORM_OWNER`/`SUPER_ADMIN` via `assertCanManageTeam` — not just a UI hint), a public `/activate` page + `POST /platform-users/activate` endpoint (same SEC-001 hashed-token shape as owner activation, but with a real clickable email link since this is a web app), and the Team page/Invite modal (built concurrently, verified against this backend). Seeded super admin is now `PLATFORM_OWNER`.
- [x] Super Admin: bulk-select + bulk actions on Restaurants (suspend/activate), Owners (activate/suspend), Branches (activate/deactivate), Subscriptions (suspend/reactivate), Activation Keys (revoke, non-revocable rows silently skipped), Devices (revoke) — via a shared `BulkActionsBar` component; each loops the existing per-row PATCH endpoint with `Promise.allSettled` and reports a success/failure summary (there is no dedicated bulk API, so no backend changes were needed).
- [x] Super Admin: wire the header search + Ctrl+K to the existing `/api/v1/support/search` cross-entity endpoint (Section 1.4 #3). Ctrl+K previously had no keydown listener at all — it now focuses the search input; typing 2+ characters shows a live dropdown across restaurants/owners/devices/activation keys, each result linking to the right page.
- [x] Super Admin: real notification center — the header bell is now a dropdown polling `expiringSubscriptions` (from `/api/v1/platform/dashboard`) and failed-backup counts (from `/api/v1/platform/backups` `stats.failed`) every 60s, showing a red dot + actionable rows linking to Subscriptions/Backups instead of the old permanent decorative dot.
- [x] Super Admin: CSV export on Restaurants, Owners, Devices, Activation Keys, Audit Logs (pages through the full filtered result set, not just the current page), and Billing — via a shared `lib/csvExport.ts` client-side generator (no new backend endpoints needed since these pages already load their full dataset). PDF: the existing invoice "Print Invoice" `window.print()` path already covers the one place a formatted PDF-shaped document makes sense; list pages get CSV only, per how this platform already treats print vs. export.
- [x] Super Admin: reachable `VOID`/`REFUNDED` invoice actions (a "⋮ More" menu per row, calling the pre-existing `PATCH /invoices/:id/status` endpoint that had no UI path to it); ENTERPRISE tier support added to all plan/tier filter dropdowns and badge-tone logic (Restaurants, Subscriptions, Entitlements, ChangePlanModal).
- [x] Restaurant Admin: real Combo/Meal-Deal creation screen. `ComboRepository` (full CRUD) and `ComboDeal` already existed and were consumed by Kiosk, but Restaurant Admin — the app that should own menu composition — had no screen at all. Added a "Combos & Meal Deals" section to the Menu tab (`ComboModal.tsx` + a grid in `MenuCategoriesModule.tsx`) with real per-slot item pickers (main/side/drink/dessert), live savings calculation, and toggle/edit/delete. Along the way, fixed a real bug in Kiosk Admin's own combo form: it silently hardcoded every combo's items to `menuItems[0]`/`menuItems[1]`/two fixed IDs and a hardcoded Unsplash URL regardless of what the admin selected — replaced with the same real item pickers.
- [x] Restaurant Admin: dedicated wastage-logging workflow. Previously "wastage" was just one of four options in a generic `StockAdjustModal` type dropdown with a single free-text reason. Added `WastageLogModal.tsx` with a structured reason taxonomy (`WastageReasonCode`: prep trim, dropped/spilled, expired/spoiled, quality reject, customer return, other), optional photo evidence (device camera/file, downscaled client-side the same way dish photos already are), a live cost-impact preview, and an explicit confirm-before-commit step (this app has no separate approver role, so the confirm dialog is the approval gate) — plus a "Recent Wastage Log" table on the Inventory tab showing reason/qty/cost/photo/timestamp. `StockMovement` gained optional `wastageReasonCode`/`photoUrl` fields (additive, all other movement types unaffected).

### Phase 4 — Competitive feature parity (larger initiatives, 1-2 quarters)
> **Explicit scope constraint:** no Zomato/Swiggy or any other food-delivery-aggregator integration anywhere in this project, in any app. Not in scope now or later — do not re-add it to this list.
- [x] Multi-outlet branch directory in Restaurant Admin, wired to the `Branch` model. No tenant-facing endpoint existed at all (`/api/v1/branches` was Super-Admin-only) — added `GET /api/v1/tenant/branches` (`TenantAuthGuard`, scoped server-side to the caller's own `restaurantId`) and a `BranchDirectoryModal` reachable by clicking the outlet name in the header, listing sibling branches with status/terminal/staff counts. Scoped as a read-only directory, not a live "switch into another branch's data" view — this app is local-first, each outlet's menu/orders/tables live only in that outlet's own on-device database, so there is no data pipe to actually view another branch's live operations from here; building anything more (like a real switch) would need whatever future cross-branch data pipeline Phase 4's franchise reporting also needs, so it's left as an honest directory for now.
- [x] Table reservation system. `ReservationRepository` (create/list/updateStatus) and the `Reservation` type already existed in the data layer but were used by zero apps. Added a "Reservations" tab in Restaurant Admin (`ReservationsModule.tsx` + `ReservationModal.tsx`): a date-picker day view of bookings with guest/phone/table/special-requests, Seat/No-Show/Cancel actions, and a creation form with table assignment from the real floor plan and a deposit field.
- [x] Staff scheduling/attendance (payroll left as the stretch goal it was scoped to be). Previously `StaffRepository` only managed login accounts (username/role/PIN) — there was no concept of a work roster or whether someone actually showed up. Added `StaffShiftSchedule` and `AttendanceRecord` to the data layer, a `StaffScheduleRepository` (create/edit/delete shifts, clock-in/out, mark Present/Late/Absent/On-Leave), and a "Schedule & Attendance" section on the Staff tab: a date-scoped shift list with a scheduling modal, and a per-staff attendance panel with clock-in/out buttons and a status selector.
- [x] Loyalty tiers + automated earn/reward rules + a rewards catalog. Previously a single flat `loyaltyPoints` number with no automation at all — `OrderRepository.settleOrder` never touched loyalty, and `totalSpend`/`totalVisits` were seed-only fields nothing ever updated, so a customer's standing could never actually change from real activity. Added `LoyaltyTier` (spend-threshold tiers with a points multiplier + perks) and `LoyaltyReward` (a named catalog to redeem points against, replacing the implicit "1 pt = ₹1" assumption) to the data layer, wired automated earning (1 pt per ₹10 × tier multiplier) directly into order settlement, and built the Restaurant Admin UI: a tier badge + reward redemption in the customer detail view, and a "Loyalty Program" settings modal for managing tiers and the rewards catalog.
- [x] Real marketing/campaign tool — segment builder + reusable message templates, replacing the un-saved, one-customer-at-a-time WhatsApp button. Added `MarketingCampaign`/`CustomerSegmentFilter` and a `MarketingRepository` with real segment matching against actual customer data (tags, loyalty tier, lifetime spend, inactivity, birthday month) and a `{{name}}` merge tag. Honest scope note: there is no WhatsApp Business API or SMS gateway anywhere in this system, so a "send" still opens one `wa.me` link per recipient that the operator must confirm and tap send on — that's a real external constraint, not something this feature fakes away. What it actually adds is a saved, reusable segment and message instead of re-picking one customer and typing one message every time, plus a tracked send queue (`sentToPhones`) that lets a campaign resume without re-messaging people. Scheduled/timed sends were not built, since there's no background send process to schedule against without that same missing messaging backend.
- [x] Rider/delivery management. A DELIVERY order previously had an `orderType` and nothing else — no rider roster, no assignment, no dispatch status. Added `DeliveryRider` and delivery-tracking fields on `Order` (`riderId`/`riderName`/`deliveryStatus`/`dispatchedAt`/`deliveredAt`) plus a `RiderRepository`. Restaurant Admin's Staff tab gets a "Delivery Riders" roster (add/edit/deactivate); the POS cashier's Orders view gets a Delivery Dispatch panel on DELIVERY orders to assign a rider and step through Assigned → Out for Delivery → Delivered. While fixing this, found and fixed the same UTC-vs-5AM-cutoff date bug noted above duplicated in `PosOrdersView`'s own business-day order filter.
- [x] Super Admin: tenant impersonation for support debugging — logged, time-boxed (15 min), role-gated to `PLATFORM_OWNER`/`SUPER_ADMIN`/`SUPPORT_ADMIN` (server-side, matching the Team RBAC gate), and requires a written reason before a token is issued. `POST /api/v1/support/impersonate` mints a real tenant access token for the restaurant's owner via a new `TenantAuthService.impersonateOwner`, stamps it `impersonatedBy` in the JWT payload, and writes a `TENANT_IMPERSONATION_STARTED` audit entry. The Support page shows an "Impersonate Owner Session" button and displays the resulting token with a copy button. Honest scope note: this is an **API-level debugging credential** (a Bearer token to use against tenant-scoped endpoints), not a live view into the restaurant's operational screens — this platform is local-first, so a restaurant's menu/orders/tables live only in that restaurant's own on-site device database, never in the cloud, so there is no data pipe for Super Admin to actually "see what the owner sees" without a much larger architectural change.
- [x] Super Admin: evolved Support from search+diagnostics into a real lightweight ticketing view. Added `SupportTicket`/`TicketComment` Prisma models (migration `add_support_tickets` + `add_support_ticket_restaurant_relation`), a `support-tickets` module (create/list/update/comment, priority-based SLA due dates: Urgent 4h, High 24h, Medium 3d, Low 7d), and a new "Support Tickets" page — a filterable list (by status) with priority/status/SLA-countdown badges, a create-ticket modal, and a detail modal for status/priority/assignee changes plus a comment thread. Every prior support interaction (resend-invite, revoke-device, impersonate) stays a one-off audited action; tickets are for tracking the underlying issue those actions are often taken in service of.
- [x] Dark/light theme toggle — **Super Admin only** (see note). Super Admin already had a full `--jv-*` CSS custom-property token system; added a dark palette under `[data-theme="dark"]` + `prefers-color-scheme`, a header toggle (`theme.ts`, applied pre-paint in `main.tsx` to avoid a light flash), and converted the remaining hardcoded `#fff`/hex surface colors in `ui.css`, `layout.css`, and `shared.css` (buttons, cards, modals, `.data-table` — used by nearly every list page — form fields, search, filter pills, skeletons) to reference tokens instead. Semantic status colors (badges, alert banners) were deliberately left as their light pastel values, which read fine as accents on a dark page. **Restaurant Admin (pos-admin) dark mode was not attempted**: unlike Super Admin, it has no CSS-variable token layer at all — every component hardcodes colors via Tailwind arbitrary values (`bg-[#FAF7F2]`, `text-[#0B253A]`, etc.) directly in JSX across ~150+ files. Retrofitting it properly means introducing that token system first, which is its own multi-day project, not a toggle to bolt on; doing it hastily would ship a half-dark, half-light UI, which is worse than the current single-theme state.
- [ ] **Franchise/multi-entity roll-up reporting — genuinely blocked, not skipped.** This is the one Phase 4 item this pass could not deliver honestly. "Roll-up reporting" means aggregating real sales/order numbers across a restaurant's branches, but that data does not exist anywhere in the cloud database to roll up: this platform is local-first by design, and every branch's orders/sales/menu live only in that branch's own on-site device database (the same constraint that scoped the multi-outlet directory and tenant impersonation to what they are above). The `Branch` model has no revenue/order fields at all — only identity, status, and device/staff counts. Building a *real* franchise report requires each branch's device to sync its sales data to the cloud first, which is a data-pipeline/architecture project in its own right (far bigger than a "Phase 4 feature," closer to a new Phase 5), not a report screen that can be added on top of what exists today. Building this screen now would mean either fabricating numbers or silently repackaging the branch directory's device/staff counts as a fake "reporting" feature — both worse than leaving it undone and stating why.

> **Bug found and fixed along the way (not a checklist item, but worth recording):** as this session's real calendar date advanced past the seed data's hardcoded "active" business day, `tests/pos_day_close_and_live_orders_reset.test.ts` started failing (320/321) — a genuine, reproducible bug, not flakiness. Root cause was three separate places computing "today" using the raw calendar date instead of the app's own 5:00 AM business-day cutoff (`BusinessDayRepository.getCanonicalBusinessDate`): (1) `openNewBusinessDay`'s "find the most recently closed day" used `Array.prototype.find()`, which returns the *first* CLOSED-status entry in array order, not the most recent one, so it could resolve to a stale seeded day instead of the day just closed; (2) `getOrdersForBusinessDay`'s fallback (for orders with no explicit `businessDayId`) compared a raw UTC calendar-date string, which disagrees with local-time-plus-5am-cutoff near midnight; (3) `generateSeedOrders()` computed "today's" and "day N ago's" dates from the raw calendar date, so seed orders generated between midnight and 5 AM landed one business day ahead of where the app itself would place them. Fixed all three to use the same canonical, 5 AM-cutoff-aware date consistently. Full suite verified green again (321/321 root, 99/99 cloud/api) after the fix.

---

## 6. What This Plan Deliberately Does NOT Include

- **A full rewrite.** Both codebases are functionally sound (zero stub/TODO markers found); the fix is disciplined enforcement of what already exists plus targeted additions, not a rebuild.
- **New design system creation.** `packages/ui` already has the right primitives; Phase 1 is adoption, not invention.
- **Feature removal.** Despite "over-built" screens (30+ reports, 1,700-line QR module) being called out as a *density* contributor, none of that functionality should be deleted — it should be reorganized behind progressive disclosure (tabs, collapsed-by-default sections) so it's available without being loud.

---

## 7. Cashier POS (`apps/restaurant-system/pos`) — Full Audit (gap-fill on top of Section 2.2's density findings)

Section 2.2 already established the density evidence (12 color families, ~17:1 bold-to-normal ratio, 399 raw buttons / 0 shared-`Button` uses). This section adds the module inventory and functional-bug findings.

### 7.A Module inventory

44 components across catalog/cart, floor plan (`PosFloorPlan.tsx` + `PosTableDrawer.tsx`), orders (`PosOrdersView.tsx` + `PosRepeatOrderModal.tsx`), bills (`PosBillsView.tsx`, 1,330 lines), an embedded KOT view (`PosKotView.tsx` — a second, POS-side kitchen-ticket view that duplicates part of what KDS is for), customers, shifts (`PosShiftAndCashView.tsx`, 1,223 lines), business-day close/reopen (4 files, largest at 594 lines), reports (with real PDF/CSV export services), inventory, and a 2,045-line `PosSettingsView.tsx` plus a 2,196-line `PosMenuManagerModal.tsx` — the two largest files in the app. Every module is functionally complete; the pattern to flag is **structural**, not functional: `PosSettingsView`, `PosMenuManagerModal`, `PosBillsView`, `PosShiftAndCashView`, and `PosPaymentModal` (1,033 lines) are all single-file monoliths mixing multiple concerns with no sub-component decomposition — the same "kitchen-sink file" pattern already flagged for `PosHeader.tsx` (668 lines) extends across most of the app's largest screens.

### 7.B Missing CRUD / broken UI

1. **Dead "Keyboard Shortcuts Help" feature, end-to-end.** `components/common/ShortcutsHelpModal.tsx:5-7` — the component body is literally `return null;` with unused icon imports. It's never mounted in `App.tsx`'s modal list. `posStore.ts` (lines 127, 218, 343, 524) maintains a full open/close state machine for it. `PosHeader.tsx:57` destructures the setter but never calls it. Net effect: scaffolded, never finished, never reachable.
2. **F8 "Hold Orders" shortcut is tab-scoped despite being bound globally.** `App.tsx:103-106` binds F8 app-wide, but `PosHoldModal` only renders inside `PosCart.tsx:585`, which itself only mounts when `activeTab === 'MENU'`. Pressing F8 on Bills/Orders/Settings/Reports does nothing visible.
3. **Two `alert()` calls instead of the app's own toast pattern**: `PosMenuManagerModal.tsx:284` (import validation) and `:422` (category-delete guard).
4. **The `Date.now()`-derived fake order/transaction number recurs beyond the header** (already flagged once in Section 2.2 for `PosHeader.tsx`): `PosCart.tsx:122` shows it in the cart before checkout; `PosPaymentModal.tsx:389` shows it in the actual Payment & Settlement modal header — **the screen a cashier settles on displays a fabricated order number**; `PosPaymentModal.tsx:354` uses `TXN-${Date.now()...}` as the persisted transaction reference itself, not just a display string; `posStore.ts:1498` does the same for instant-bill transaction IDs.
5. **"+ New Order" and "Start New Business Day" discard the cart with zero confirmation** (`PosHeader.tsx:140-149,154`), in direct contrast to the app's own "Clear Cart" button in `PosCart.tsx:69,131-156`, which correctly uses a two-step inline confirm. A habitual mis-tap on "+ New Order" silently destroys an in-progress cart.
6. **Silent validation without feedback**, same pattern as pos-admin: `PosShiftAndCashView.tsx:188` (invalid cash-in/out amount), `PosTableDrawer.tsx:49,51,59,66` (transfer/merge/close-table guards), `PosMenuManagerModal.tsx:141,187,459` (file-upload handlers).

### 7.C Checkout/payment flow

The payment modal (`PosPaymentModal.tsx`, 1,033 lines) is genuinely feature-rich: 5 tender types, a real split-payment card with live over/under-allocation feedback, a cash/change calculator with denomination quick-chips, and an inline discount workflow reachable from both cart and payment modal. Two real findings:

- **"Mark UPI Paid"/"Mark Card Paid" buttons are decorative.** They set local `upiConfirmed`/`cardConfirmed` booleans (`:805`, `:831`) that `handleSettle` (`:321-373`) never reads — only allocation completeness gates the Confirm & Settle button. A cashier can settle without ever tapping these "verification" buttons.
- **No discoverable void/cancel-order path exists anywhere.** `'CANCELLED'` appears only as a filter option (`PosBillsView.tsx:790`, `PosDayOrdersModal.tsx:136`) with no corresponding `voidOrder`/`cancelOrder` handler in `posStore.ts` or any component that could produce that state.
- The refund flow, by contrast, is a genuinely good pattern worth reusing elsewhere: `PosBillsView.tsx:297-315` routes refunds through a manager-PIN-override modal, requires a reason, and logs to the audit trail before calling `OrderRepository.refundOrder`.

---

## 8. Kitchen Display System (`apps/restaurant-system/kds`) — Full Audit

**Structural note:** the entire app is one 703-line `App.tsx` with **no `components/` directory at all** — zero modularization, versus 44 components in POS and 19 in Captain.

### 8.A Screens

Two screens live in that one file: a station-picker + 4-digit-PIN lock screen (`App.tsx:292-391`, default PIN `1234` shown in-UI), and the main ticket board (`:397-701`) with a station filter, a live cooking/ready counter, a status filter bar, and a responsive ticket grid with per-ticket Start Cooking → Mark Ready → Mark Served actions.

### 8.B Feature completeness

- **Station-based routing: implemented**, via string-matching heuristics against `kot.station`/item `kitchenStation` with synonym handling (`App.tsx:179-197`) — functional but fragile (not an ID-based join).
- **Prep-time/late-ticket alerts: implemented** — warning at ≥10 min, delayed (pulsing badge + red border) at ≥15 min (`App.tsx:275-287,526-534,573-577`).
- **Sound alerts: missing, despite the infrastructure already existing.** `packages/ui/src/SoundManager.ts` explicitly documents `sound.play('kot')`/`sound.play('notification')` as shared across POS/POS-Admin/Kiosk/Kiosk-Admin for exactly this purpose — KDS is the one app in that list that never imports or calls it. A kitchen wall display with no audio cue for an incoming ticket, in what is by definition a loud environment, is a real functional gap with a one-line fix available.
- **Recall/undo: absent.** Status transitions are strictly forward-only; no way to walk back a mis-tapped "Mark Served."

### 8.C UI/UX density

18:1 bold/black-to-normal font-weight ratio; 6 Tailwind color families plus 10 hardcoded brand hex literals with no shared "status color" token (`App.tsx:526-547` maps ticket state to raw Tailwind classes ad hoc); **0% adoption** of the shared `Button`/`Modal` (imports other `@jamanvaar/ui` components but never these two); 11 instances of hardcoded sub-12px text.

### 8.D Readability from a distance (KDS-specific requirement)

This is the one finding category unique to KDS, since it's read from a few feet away in a hot, busy kitchen — and it's a real problem: **item modifiers (allergy/spice/prep instructions — often safety-relevant) render at the smallest font size, lightest weight, and lowest-contrast color combination on the entire ticket** (`App.tsx:606`, `text-[11px] font-medium text-slate-600`). The order-type badge (`:564-566`) and captain/ticket-ID footer (`:631-634`) are similarly undersized. On the positive side, primary action buttons are a solid `min-h-[48px]` full-width and the ticket number itself is appropriately dominant (`text-2xl sm:text-3xl font-black font-mono`) — it's specifically secondary/modifier text that needs to grow.

---

## 9. Captain App (`apps/restaurant-system/captain`) — Full Audit

### 9.A Screens

19 components: table-side ordering is genuinely well-built — `CaptainTableWorkspaceModal.tsx` (557 lines) handles menu browsing, per-item modifiers, a live cart with fired-vs-pending item states, a bill breakdown, and a "Request Bill" handoff to POS. Table transfer/merge and guest-request handling (log/acknowledge/resolve) are both complete. The new "Connect this Tablet" device-provisioning screen (added this session) is visually consistent with the rest of the app — same layout wrapper, same brand tokens, same button treatment — meaning it correctly inherited the house style, but also inherited the same non-adoption of shared components as everything else.

### 9.B UI/UX density

~8.3:1 bold-family-to-normal font-weight ratio (lower than POS's ~25:1, but still heavily skewed); 6 color families reused for different meanings on different screens of the *same app* — `CaptainAttentionStrip.tsx:49-124` and `CaptainFloorView.tsx:98-190` both assign orange/purple/emerald to five states each, but the states and their color meanings don't match between the two screens; **~0% adoption** of shared `Button`/`Modal` (111 raw buttons, 9 separately hand-rolled modal overlays).

### 9.C Missing CRUD / broken UI

1. **Hardcoded fallback ticket numbers that match real seed data**, meaning a genuinely broken/missing number silently displays as if it were a specific demo ticket: `CaptainLiveKotsView.tsx:111,118` (`|| '104'`, `|| '5033'`), `CaptainFoodReadyView.tsx:128`, `CaptainTableCard.tsx:122` — the literals match `captainStore.ts:331`'s seeded demo KOT number exactly.
2. **Fully-implemented store capabilities with zero UI entry point**: `clearCart`, `repeatPreviousOrder`, and `markItemServed` are destructured in `CaptainTableWorkspaceModal.tsx` (lines 51, 54, 55) but never called anywhere — there's no way to discard an in-progress unfired cart, and the store-level "repeat previous order" feature (fully implemented in `captainStore.ts`) is unreachable.
3. **Two unconfirmed destructive logout actions**: `CaptainShiftStatsView.tsx:151-158` ("End Shift & Sign Out") and `CaptainHeader.tsx:180-190` ("End Session & Logout") both call `logout()` immediately with no confirmation, unlike `CaptainTransferMergeModal.tsx:134`, which correctly disables its confirm button until a target is chosen.
4. **Fabricated "always connected" sync status.** `CaptainHeader.tsx:92-111`'s sync popover hardcodes `ACTIVE (0ms)`/`CONNECTED`/`LIVE` as static JSX regardless of the actual `syncStatus` value (which is destructured at line 26 but never used) — if the LAN mesh actually drops, this panel still claims everything is fine.
5. `CaptainActiveOrdersView.tsx:101-104` shows a static "Service Status: Order Active in Kitchen" line for every occupied table regardless of the item(s)' real kitchen status.
6. `CaptainModifierModal.tsx:27-33` applies an identical hardcoded set of modifiers (spice level, Jain, extra cheese) to every dish regardless of type — a dessert gets the same options as a curry, since modifiers aren't pulled from real per-item configuration.
7. Shift-stats counters seed non-zero (`captainStore.ts:301-307`: 8 tables served, 12 orders, etc.) rather than starting a fresh shift at zero — a demo-data artifact bleeding into what should be live shift-start state.

No native `alert()`/`window.confirm()` usage and no TODO/FIXME/console.log were found anywhere in Captain — genuinely clean on those two specific checks.

---

## 10. Kiosk-User (`apps/kiosk-system/kiosk-user`) — Full Audit

**Architecture note (applies to both kiosk apps):** both are Tauri desktop apps that sync menu/order data with the POS terminal's local sidecar server (`http://<host>:5178`) via an initial pull plus a persistent SSE subscription and a push-on-every-mutation pattern (`packages/database/src/db.ts:1021-1151`). Pricing/cart math is **not** duplicated — both kiosk apps correctly reuse `@jamanvaar/business`'s `calculateCart`/`calculateItemTotal`/`validateModifiers`, a materially better situation than pos-admin's previously-flagged 1,707-line duplicated QR-ordering module. Both apps silently swallow sync failures (`.catch(() => {})`) and fall back to stale local data with no visible "menu may be out of date" indicator — a real risk if the POS sidecar is down.

### 10.A Screens and dead code

A single 3,024-line `App.tsx` implements a 7-step flow (Welcome → Order Type → Table Select → Menu → Checkout/Payment → Confirmation → live order Tracking) plus 9 overlays (cart, modifier customization, OTP/loyalty login, AI help chatbot, staff-call, staff-PIN override, mobile-handoff QR, idle-timeout warning, e-bill). The core flow is feature-complete and includes real strengths: a fully editable pre-payment cart, a working back-navigation trail through every step, and a genuinely well-implemented 45-second idle-timeout that wipes session/customer data before returning to Welcome (a real privacy safeguard, `App.tsx:276-401`).

Two pieces of dead code found: `components/LanDiscoveryScreen.tsx` (273 lines, fully built, never imported anywhere — superseded by automatic hostname-based sync discovery) and unreachable accessibility state — `isHighContrast`/`isLargeText` (`App.tsx:137-138`) are applied to the root className but their setters are never called anywhere, meaning a public-kiosk accessibility feature exists in code with zero way for a customer or staff member to turn it on.

### 10.B UI/UX density

9 color families in a single file with overlapping meanings (emerald covers both "success" and "online"; amber covers both "offline warning" and the Jain/veg filter); ~19:1 bold-to-normal font-weight ratio; **38 instances of sub-12px text**, some on price-relevant micro-copy ("Save ₹X", combo badges) that a public, arm's-length touchscreen should not render below ~14px; ~31% `Button` adoption (helped by a dedicated `size="touch"` variant that exists in `packages/ui/src/Button.tsx` but is used inconsistently) and ~55% `Modal` adoption — notably, the two most customer-visible overlays (cart drawer, idle-timeout warning) are both hand-rolled rather than using the shared component. Cart line-item quantity buttons are `w-6 h-6` (24px) — below common 44px touch-accessibility guidance for a walk-up public kiosk.

### 10.C Missing CRUD / broken UI

1. **Payment is entirely simulated with no failure path.** The checkout button for UPI/Card literally reads `'Simulate Payment Success'` (`App.tsx:1715`) and `handleFinalizePayment` unconditionally sets `paymentStatus: 'SUCCESS'` (`:665`) regardless of method or state. There is no card-decline UI at all.
2. **The payment-expiry state is set but never checked.** A 180-second countdown sets `paymentStatus: 'EXPIRED'` on timeout (`App.tsx:322`), but no render branch anywhere checks for that value (confirmed via grep — it's a write-only state). A customer whose payment session times out sees the exact same QR/card screen forever, with no indication the transaction is dead and no retry path. The same applies if the network connection simply drops mid-order.
3. **7 `alert()` calls for user-facing errors** instead of a shared dialog: modifier validation (`:524`), duplicate order (`:623`), e-bill dispatch failure (`:753,762`), invalid staff PIN (`:812`), invalid phone (`:831`), invalid OTP (`:848`).
4. **E-bill delivery is fake.** `packages/api/src/services/ebill.ts:68-155`'s WhatsApp/SMS senders never call a real gateway — they unconditionally mark `deliveryStatus: 'SENT'` and return success. A customer who enters their real phone number believes a message was sent; nothing is dispatched. (This is the same root issue as the Super Admin owner-invite email gap in Section 1.3, in a different subsystem — see Section 12 for the cross-app pattern.)

---

## 11. Kiosk-Admin (`apps/kiosk-system/kiosk-admin`) — Full Audit

**Structural note:** a single 6,139-line `App.tsx` — the largest single file found anywhere in this audit series, with zero component decomposition.

### 11.A Screens

16 tabs. Standouts: ORDERS_KDS (`App.tsx:1870-2485`) is genuinely complete — full order queue, status filters, sound toggle, manual sync, a test-order simulator, and a deep link into the live kiosk-user screen. SETTINGS covers backup/restore and menu import/export/publish. Weak spots: STAFF (`:3355-3388`) is a read-only card list of `db.users` with zero click handlers despite header copy promising "RBAC Permissions"; KIOSKS (`:2534-2612`) only supports lock/unlock and a maintenance toggle, no add/remove device; MENU (`:1499-1753`) supports Add/Delete/toggle-availability but **no Edit** — changing a price requires delete-and-recreate, and the `Edit2` icon is imported but never used anywhere in the file.

### 11.B UI/UX density

The most extreme ratio found in this entire audit series: **font-black + font-bold outnumber font-medium + font-normal by ~56:1** (391 vs. 7 instances). 8 color families, 348 total color-class instances in one file, emerald alone covering "success," "online," "active," "veg," and "settlement complete" with no semantic mapping. 114 instances of hardcoded sub-12px text — denser than kiosk-user's 38. On the positive side: `Modal` adoption is genuinely good here (~90%, better than anywhere else audited), though `Button` adoption is more middling (~48%).

### 11.C Missing CRUD / broken UI

- **Coupon delete has zero confirmation** (`App.tsx:2645-2657`) — directly inconsistent with combo delete (`:1803`) and the reset-entire-database action (`:3668`), both of which correctly use `confirm()`.
- Native `confirm()`/`alert()` used throughout instead of a shared dialog, including gating a **"reset entire system database"** action (`:3668`) behind nothing but a native browser confirm.
- **Silent validation failure on Add Menu Item** (`App.tsx:555`) — empty required fields simply do nothing, no error shown.
- **Fabricated Dashboard data**: the "Hourly Sales Velocity" chart is a hardcoded literal array (`:1262-1276`), not derived from real `orders`, even though the REPORTS tab a few thousand lines later computes the real equivalent via `.reduce()`. The "Payment Channels" split (`:1326-1367`) is similarly hardcoded fixed percentages (68/22/10%) rather than computed — two tabs disagreeing about the same real-world number, one of them fictitious.
- A fake hardware self-test shows "Cloud Latency: 18ms" unconditionally (`App.tsx:4185`).

### 11.D Feature gaps

- **No kiosk-device provisioning** — `KioskRepository` only exposes `getAllKiosks`/`getKioskById`/`updateKioskStatus`, no create/delete, so a restaurant onboarding a new physical kiosk terminal has no in-app path to register it.
- **STAFF tab doesn't deliver on its own description** (see 11.A).
- **Menu-sync staleness is invisible to the operator.** As noted in Section 10's architecture note, if the POS sidecar server is unreachable, kiosk-admin edits only save locally and won't propagate — and the SYNC tab shows generic network telemetry, not menu-specific staleness, so an operator has no way to know their kiosk-admin changes never reached the live kiosk.
- **"Publish Menu to Kiosk" is misleadingly named.** `MenuBuilderService.publishMenu` only creates a named version snapshot — menu edits are already live on kiosk-user the instant they're saved, before "Publish" is ever clicked. The button copy implies edits are held back until publish; they aren't.
- Device health data (`DeviceHealth` in `packages/database/src/db.ts:912-924` models CPU/RAM/printer-online state) exists in the data model but isn't rendered anywhere in the KIOSKS tab.

### 11.5 Authentication bug (fixed)

**`handleKioskAdminLogin` (`App.tsx:163-188`) never actually checked the password.** It validated that the username matched one of `'admin'`/`'kiosk-admin'`/`'manager'` and that the password field was merely non-empty — any non-empty string logged in successfully as long as the username matched. This has been fixed to require the password match one of the recognized demo values (`admin123`/`admin`/`demo`), consistent with the demo-login pattern used elsewhere in the platform (e.g. pos-admin). This app's login flow is also the one inconsistency in an otherwise-converging pattern: pos-admin uses local-demo-login + a cloud-connected activation flow, Captain uses a PIN keypad + a one-time device-connect screen, and kiosk-admin uses neither — a plain (now-fixed) username/password form with no cloud-device-activation step of any kind.

---

## 12. Cross-App Patterns (consolidated)

These recur in enough apps that they should be fixed once, as a pattern, rather than app-by-app:

1. **IDs/numbers derived from `Date.now()` or hardcoded demo-data fallbacks instead of the real persisted value.** POS (order number, transaction reference, instant-bill ID), Captain (KOT/order number fallbacks that coincidentally match real seed data). Fix once: always thread the real ID through; if it can legitimately be absent, show an explicit "—" or "pending" state, never a fabricated-looking number.
2. **UI elements that assert a status without checking anything.** Super Admin's old SystemHealthPage (fixed), Captain's sync popover, kiosk-admin's Dashboard chart/payment-split/hardware self-test. Fix once: any status indicator must be backed by a real field; if there's nothing to check yet, don't render a fake green state.
3. **"Delivery" claims with no real delivery mechanism.** Super Admin's owner-invite/resend-invite email (fixed this session), kiosk-user's WhatsApp/SMS e-bill dispatch. Both silently marked success without a real integration. The email side is now fixed with a real SMTP-backed service (`cloud/api/src/modules/notifications/`) that reports real success/failure — the same honest pattern (attempt real delivery, report the true result, provide a manual fallback when it's not configured or fails) should be applied to `packages/api/src/services/ebill.ts`.
4. **Inconsistent confirmation on destructive actions within the same file.** kiosk-admin (coupon delete vs. combo delete), Captain (logout vs. transfer/merge), POS ("+ New Order" vs. "Clear Cart"). Fix once: every delete/discard/logout action in the codebase should go through one shared confirm pattern (the `ConfirmModal`/`onRequestConfirm` prop pattern already established and used correctly in most of pos-admin) — no new component needed, just consistent adoption.
5. **Near-zero adoption of the shared `Button`/`Modal` components everywhere except Super Admin's older pages.** Measured adoption across this audit series: Super Admin ~70-90% (older pages) down to ad hoc (newer pages); pos-admin ~5% Button; POS 0% Button; KDS 0% both; Captain ~0% both; kiosk-user ~31%/~55%; kiosk-admin ~48%/~90%. This is Phase 1's core work (Section 5) and now has full-platform data to prioritize by: fix KDS and Captain (currently 0%) and POS (0% Button) first, since they're furthest from the target.
6. **Sub-12px text used for anything operationally or safety-relevant.** KDS's allergy/modifier text (Section 8.D) is the most serious instance — this is the one place across the whole platform where "congested" UI intersects with an actual safety concern (a busy line cook misreading a spice-level or allergy modifier because it's the smallest, lightest text on the ticket).

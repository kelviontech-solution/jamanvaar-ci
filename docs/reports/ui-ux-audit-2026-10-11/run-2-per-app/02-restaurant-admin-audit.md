# 02 — Restaurant Admin (and Kiosk Admin mode) audit

Run 2, 2026-10-11. Current source rendered via out-of-repo Vite config. No repository edits.

## 1. Purpose, personas, device
- **Users:** restaurant owner / manager configuring menu, tables, staff, payments, reports; in kiosk-only plans the same shell runs as **Kiosk Admin**.
- **Device:** laptop/desktop browser; also packaged via Tauri. Viewport meta locks zoom (`index.html`).
- **Source:** `apps/restaurant-system/pos-admin/src` — 120 files; `App.tsx` 2,074 lines; shared `NAV_SECTIONS` in `navSections.ts`; product pages in `adminProducts.ts`; separate QR entry `qr/main.tsx`.
- Documentation (`RUN_SERVERS.md`) says Restaurant Admin and Kiosk Admin share port 5176 with workspaces at `/restaurant-admin/dashboard` and `/kiosk-admin/dashboard` and a "Switch application" control. **Not verified in a browser.**

## 2. Build / access status
Current source starts with the two out-of-repo aliases. Owner login (Restaurant ID + password), activation panel and forgot-password panel render. Everything after sign-in → BLOCKED (no account, no backend).

## 3. Page inventory
Ids follow `PosAdminTab` (`App.tsx:163`) and `navSections.ts`.

| ID | Page | Entry | Status |
|---|---|---|---|
| ADMIN-001 | Owner sign-in | `/` | **VISUALLY VERIFIED + INTERACTION TESTED** |
| ADMIN-002 | Activate owner account panel | "Set your password from the welcome email" | **VISUALLY VERIFIED + INTERACTION TESTED (opened, not submitted)** |
| ADMIN-003 | Forgot password panel | "Forgot password?" | **VISUALLY VERIFIED + INTERACTION TESTED (opened, not submitted)** |
| ADMIN-004 | DASHBOARD | sidebar OPERATIONS | BLOCKED |
| ADMIN-005 | BILLING_SALES (Billing / Invoices) | OPERATIONS | BLOCKED |
| ADMIN-006 | ORDERS | OPERATIONS | BLOCKED |
| ADMIN-007 | LIVE_KDS | OPERATIONS | BLOCKED |
| ADMIN-008 | TABLES | OPERATIONS | BLOCKED |
| ADMIN-009 | RESERVATIONS | OPERATIONS | BLOCKED |
| ADMIN-010 | KITCHEN_KOT | OPERATIONS | BLOCKED |
| ADMIN-011 | QR_ORDERING | DIGITAL ORDERING | BLOCKED |
| ADMIN-012 | MENU | MENU & INVENTORY | BLOCKED |
| ADMIN-013 | MENU_OPTIONS (Customisations & Tax) | MENU & INVENTORY | BLOCKED |
| ADMIN-014 | INVENTORY (Inventory & Recipes) | MENU & INVENTORY | BLOCKED |
| ADMIN-015 | INVENTORY_CONTROL (Purchasing & Stock) | MENU & INVENTORY | BLOCKED |
| ADMIN-016 | CUSTOMERS (CRM) | PEOPLE & CASH | BLOCKED |
| ADMIN-017 | STAFF (Staff & Roles) | PEOPLE & CASH | BLOCKED |
| ADMIN-018 | PAYMENTS | PEOPLE & CASH | BLOCKED |
| ADMIN-019 | COUPONS | PEOPLE & CASH | BLOCKED |
| ADMIN-020 | SHIFTS | PEOPLE & CASH | BLOCKED |
| ADMIN-021 | REPORTS | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-022 | HARDWARE (Printers & Devices) | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-023 | RECEIPTS (Receipt & E-Bill) | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-024 | SYNC | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-025 | SETTINGS | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-026 | LICENSE (Subscription Plans) | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-027 | AUDIT | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-028 | BACKUP | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-029 | SUPPORT | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-030 | DOWNLOADS | ANALYTICS & SYSTEM | BLOCKED |
| ADMIN-031 | KIOSKS (Kiosk Terminals) | KIOSK | BLOCKED |
| ADMIN-032 | KIOSK_DESIGN | KIOSK | BLOCKED |
| ADMIN-033 | KIOSK_WELCOME | KIOSK | BLOCKED |
| ADMIN-034 | KIOSK_COMBOS | KIOSK | BLOCKED |
| ADMIN-035 | KIOSK_PAYMENTS | KIOSK | BLOCKED |
| ADMIN-036 | FEEDBACK | KIOSK | BLOCKED |
| ADMIN-037 | TEMPLATES (Menu Templates) | KIOSK | BLOCKED |
| ADMIN-038 | QR product workspace (`qr/QrProduct`, `QrWorkspace`) | separate entry | BLOCKED |

38 discovered · 3 verified/tested · 0 source-reviewed at page level · 35 blocked · 0 not audited. Source-reviewed only at **navigation-structure** level (`navSections.ts`, `adminProducts.ts`).

---

## 4. Page reports

### ADMIN-001 — Owner sign-in

**Route:** `http://localhost:5176/` · **Status:** VISUALLY VERIFIED + INTERACTION TESTED (current source)
**Intended user:** owner · **Primary task:** sign in with Restaurant ID + password
**Viewports:** 1366×768, 768×1024, 390×844, 1920×1080

**What works well**
- Clear labels with asterisks, **helper text under Restaurant ID** ("Find it in Super Admin: Restaurants…"), Show Password toggle, Forgot password, and an expandable "Connecting a new device? Add your admin key" so the optional field doesn't clutter the form.
- Focus order is logical and each stop shows a 2 px brand-coloured ring ([tab-order](evidence/restaurant-admin/ADMIN-001-tab-order-1366x768.png)).
- Failure is communicated in a tinted alert with an icon, and the typed Restaurant ID is **preserved** ([bad-creds](evidence/restaurant-admin/ADMIN-001-bad-creds-submit-1366x768.png)).
- No horizontal overflow at four sizes; `<main>`, one `<h1>`; the password field declares `autocomplete="current-password"` (Restaurant ID is `autocomplete=off`).

**Findings**
- **ADMIN-F1 (P2, confirmed VISUAL + SOURCE):** the sign-in error ends with a raw exception string: *"…try again. (TypeError: Failed to fetch)"*. Source: `App.tsx:399` appends `${err.name}: ${err.message}`. Owners are non-technical; the parenthetical adds noise and no action.
- **SH-008 (P3, confirmed VISUAL, measured):** the **"Pair"** control beside "Local Core: Unreachable" renders **22×16 px** (probe) — below the 24 px WCAG 2.5.8 minimum and adjacent to the 46 px network pill. Evidence: [initial](evidence/restaurant-admin/ADMIN-001-initial-1366x768.png).
- **SH-007 (P2):** zoom disabled.
- **UX (P4):** at 390 px the header crowds a ~50 px logo beside two wrapped status pills ([390](evidence/restaurant-admin/ADMIN-001-initial-390x844.png)). Functional, slightly broken-looking.
- Required marker: both fields show `*`, but neither has the `required` attribute (probe `req:false`), so an empty submit gets no native hint; the visible result of an empty submit was **not distinguishable** in the screenshot ([empty-submit](evidence/restaurant-admin/ADMIN-001-empty-submit-1366x768.png)) — unverified whether an app-level message appears below the fold.

**Interactions tested:** empty submit; wrong credentials submit (network failure path); open Forgot password; open Activate owner; Tab traversal (10 stops).
**Unverified:** real credential rejection copy, lockout, "Remember this device", session expiry, successful sign-in and product switcher.

| Visual | Usability | Interaction | A11y | Responsive | Consistency | **Weighted** | Conf. |
|---:|---:|---:|---:|---:|---:|---:|---|
| 8 | 8 | 7 | 6.5 | 7.5 | 8 | **7.5** | Medium |

0.25·8 + 0.20·8 + 0.20·7 + 0.15·7.5 + 0.15·6.5 + 0.05·8 = 7.5 (rounded from 7.50).
**Recommended changes:** drop the exception suffix (log it instead); enlarge the "Pair" hit area to ≥ 24 px (padding, not visual size); decide on zoom lock.
**Do not change:** helper text, preserved input on error, the collapsible admin-key section, focus rings.

---

### ADMIN-002 — Activate owner account

**Entry:** "Set your password from the welcome email" · **Status:** VISUALLY VERIFIED (opened; not submitted) + INTERACTION TESTED (open only)
**What works well:** explains where the details come from and that the token works once; five labelled fields (Restaurant ID, Owner email, Invitation token, New password, Confirm new password).
**Findings**
- **ADMIN-F3 (P3, confirmed VISUAL):** at 1366×768 the **"ACTIVATE ACCOUNT" button is cut by the viewport edge** and the form is already taller than the screen; the user must scroll to find the submit. Evidence: [activate-owner](evidence/restaurant-admin/ADMIN-002-activate-owner-1366x768.png).
- **ADMIN-F3b (P4, confirmed VISUAL):** the card badge still reads **"OWNER SIGN-IN"** while the panel is "Activate your owner account".
- Not visible: password rules/strength guidance — unverified whether shown on focus or only on error.
**Interactions tested:** open panel. **Unverified:** submit, token errors, validation timing.
**Score:** provisional **7.0** (visual 7.5, usability 7, interaction N/A, responsive 7, a11y 6.5, consistency 7; re-normalised over 80 % of weights). Confidence: Low–Medium.

### ADMIN-003 — Forgot password

**Status:** VISUALLY VERIFIED (opened, not submitted), 390×844 and 1366×768.
**Works well:** single field, "Email me a code" action, "← Back to Sign In", and says a **6-digit code** will go to the recovery email ([390](evidence/restaurant-admin/ADMIN-001-forgot-password-390x844.png)). Restaurant ID typed earlier is carried over.
**Findings:** none confirmed. **Unverified:** code entry step, resend, rate-limit copy.
**Score:** provisional 7.6 (visual 8, usability 8, responsive 8, a11y 6.5, consistency 8; interaction N/A). Confidence: Low.

---

## 5. Authenticated screens — what could and could not be learned

**Navigation structure (SOURCE REVIEWED: `navSections.ts`)** — *corrects a speculative remark in run 1:* the sidebar is **not** one flat 34-item list. Restaurant Admin shows six groups (OPERATIONS, DIGITAL ORDERING, MENU & INVENTORY, PEOPLE & CASH, ANALYTICS & SYSTEM, plus KIOSK for kiosk plans); Kiosk Admin mode re-groups into KIOSK OPERATIONS, CUSTOMER EXPERIENCE, PAYMENTS & SERVICE, SYSTEM, and relabels Settings → "Kiosk Settings"; items are gated by `requiresApp`/`requiresAnyApp` entitlements.
- **ADMIN-F4 (P3, suspected, source):** grouping differs between products — *Offers & Coupons* sits under "PEOPLE & CASH" in Restaurant Admin but under "CUSTOMER EXPERIENCE" in Kiosk Admin; "Payments & Split" vs "Payments & Payouts"; labels include jargon ("Staff & Roles (RBAC)", "Customisations & Tax"). Needs a rendered pass to judge discoverability.
- **ADMIN-F2 (P2, confirmed in source):** destructive operations rely on `window.confirm`: void unpaid bill (`OrdersModule.tsx:897`), delete dish/combo (`MenuCategoriesModule.tsx:186,213`), delete customer (`CustomersCrmModule.tsx:270`), delete printer, recipe/stock item, loyalty tier/reward, campaign, restore backup (`BackupRestoreModule.tsx:129`) — **29 sites**. The app ships `ConfirmModal.tsx` but it is used once (`App.tsx`). Compare Super Admin's suspend dialog with an impact box. Behaviour in packaged builds is **unverified**.
- **SH-001/SH-002 (P1/P2):** 28 `<Modal>` usages come from the shared `Modal` — see `09-shared-components-audit.md`.
- 710 sub-12 px declarations (`text-[8–11px]`) — highest count in the repo (**SH-006**); 153 `outline-none` vs 21 `focus-visible/ring` (focus-visibility risk, **unverified**).

## 6. Responsive results
Sign-in/activation/forgot rendered at four widths: no overflow; header crowd at 390 px; activation form taller than 768 px height. Workspaces unverified.

## 7. Accessibility results
Confirmed: labelled fields, visible focus rings, `main`/`h1`, alert region for errors; zoom locked; 22×16 "Pair". Not tested: screen reader, authenticated keyboard flows, dialogs.

## 8. Application scorecard

| Metric | Value |
|---|---|
| Scored pages | 3 (7.5, 7.0 provisional, 7.6 provisional) |
| Visually verified | 3 / 38 (7.9 %) |
| Interaction tested | 3 / 38 (opening/submitting pre-auth only) |
| Source reviewed only | 0 page-level (nav structure only) |
| Blocked | 35 / 38 |
| Not audited | 0 |
| Product score | **Not assigned** |

## 9. Fix backlog (Restaurant Admin only)
1. ADMIN-F1 — remove exception suffix from sign-in error (XS).
2. ADMIN-F2 — one confirmation dialog for the 29 native `confirm` sites; start with void bill, delete customer, restore backup (M).
3. SH-001/002 — fix shared Modal (M, shared; affects 28 admin dialogs).
4. SH-007 — zoom lock (XS). SH-008 — "Pair" hit area (XS).
5. ADMIN-F3 — activation panel: header badge text and fold (XS).
6. ADMIN-F4 — IA review once rendered (S–M, needs product decision).
**Order:** 1 → 3 → 2 → 4 → 5 → 6.

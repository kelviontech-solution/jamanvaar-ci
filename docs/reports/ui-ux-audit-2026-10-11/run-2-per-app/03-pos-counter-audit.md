# 03 — POS Counter audit

Run 2, 2026-10-11. Current source rendered via out-of-repo Vite config. No repository edits.

## 1. Purpose, personas, device
- **Users:** cashier at a counter queue; manager (settings, reports, day close).
- **Device:** touch/mouse counter terminal; `index.html` has `maximum-scale=1.0` and an invalid `user-select=none` token inside the viewport meta (browsers ignore it). Tauri shell exists.
- **Source:** `apps/restaurant-system/pos/src` — 57 files; `App.tsx` 524 lines; 38 hand-rolled `fixed inset-0` overlays; largest files `PosMenuManagerModal.tsx` 2,210, `PosSettingsView.tsx` 2,065, `PosBillsView.tsx` 1,378, `PosPaymentModal.tsx` 1,248.

## 2. Build / access status
Starts from current source with the same out-of-repo aliases. Activation + staff PIN + backend required for everything past the first screen → BLOCKED. No test accounts exist in the working tree (`.jamanvaar/` is empty).

## 3. Page inventory (sidebar ids from `PosSidebar.tsx:70-80`, render map `App.tsx:410-426`)

| ID | Page | Entry | Status |
|---|---|---|---|
| POS-001 | Terminal activation | first run | **VISUALLY VERIFIED + INTERACTION TESTED** |
| POS-002 | Staff PIN login (profile cards + 4-digit PIN) | after activation | BLOCKED |
| POS-003 | Billing / Menu (`MENU`): catalog, cart, payment modal | sidebar | **SOURCE REVIEWED (payment-modal guards only)** |
| POS-004 | Floor & Tables (`TABLES`) | sidebar | BLOCKED |
| POS-005 | Live Orders (`ORDERS`) | sidebar | BLOCKED (native `alert()` call sites noted from grep) |
| POS-006 | Bills & Invoices (`BILLS`) | sidebar | BLOCKED |
| POS-007 | Kitchen & KOT (`KOT`) | sidebar | BLOCKED |
| POS-008 | Customers CRM (`CUSTOMERS`) | sidebar | BLOCKED |
| POS-009 | Shift & Cash (`SHIFTS`) | sidebar | BLOCKED |
| POS-010 | Day History (`DAYS`) | sidebar | BLOCKED |
| POS-011 | POS Reports (`REPORTS`) | sidebar | BLOCKED |
| POS-012 | Inventory & Stock (`INVENTORY`) | sidebar | BLOCKED |
| POS-013 | Settings (`SETTINGS`) | sidebar | BLOCKED |

13 discovered · 1 verified · 1 source-reviewed (partial) · 11 blocked. Modals/drawers (discount, hold, notes, customer search, manager override, shortcuts help, close-day, print queue, thermal receipt, menu manager, global search) are **not separate rows**; they are listed in `10-blockers-and-coverage.md` as unaudited sub-states.

---

## 4. Page reports

### POS-001 — Terminal activation

**Route:** `http://localhost:5175/` · **Status:** VISUALLY VERIFIED + INTERACTION TESTED (current source)
**Intended user:** installer / manager · **Primary task:** enter activation key
**Viewports:** 1366×768, 768×1024, 390×844, 1920×1080
**What works well:** single labelled input (`pos-activation-key`, `required`, autofocus); error is `role="alert"` with icon; help box explains the key's origin; no overflow at four sizes; `<main>` + `<h1>`; zero console errors.

**Findings**
- **POS-F1 (P2, confirmed VISUAL + SOURCE):** with the backend unreachable and a well-formed key, the screen shows only **"Activation failed"** (`pos/src/App.tsx:61`; the `catch` only surfaces `CloudApiError.message`). Cause (typo / offline / server error) is lost. Evidence: [bad-key 1366](evidence/pos/POS-001-bad-key-submit-1366x768.png), [390](evidence/pos/POS-001-bad-key-submit-390x844.png).
- **SH-004 (P2, confirmed VISUAL + SOURCE):** "Local Core: **Connected**" (green) while nothing answers on the relay; `pos/src/App.tsx:303` passes neither `healthCheckUrl` nor `isLocalCoreConnected`. The sibling `PosLogin.tsx:86` *does* pass `healthCheckUrl`, so the badge becomes honest only after activation.
- **SH-007 (P2):** pinch-zoom blocked (`maximum-scale=1.0`), plus the invalid `user-select=none` in the viewport tag.
- No client-side format hint for the key (compare Kiosk's "must look like…").

**Interactions tested:** typed a syntactically valid fake key → submit → error; Tab traversal (only the network pill and the input are focusable; the disabled button is skipped).
**Unverified:** success + welcome screen; loading label; PIN login.

| Visual | Usability | Interaction | A11y | Responsive | Consistency | **Weighted** | Conf. |
|---:|---:|---:|---:|---:|---:|---:|---|
| 8 | 7.5 | 6.5 | 7 | 8 | 8 | **7.4** | Medium |

0.25·7.5 + 0.20·8 + 0.20·6.5 + 0.15·8 + 0.15·7 + 0.05·8 = 7.43.
**Recommended changes:** surface the transport failure message; pass real Local Core state or hide the pill pre-activation; add the same inline format hint the Kiosk uses.
**Do not change:** layout, help box, alert semantics.

---

### POS-003 — Billing / Menu: payment modal (source-reviewed, partial)

**Status:** SOURCE REVIEWED — only the settle-guard logic, shortcut hooks and confirm/alert call sites were read. Not rendered.
**What works well**
- Double-charge protection is explicit: `settlingRef` plus `isProcessing` (`PosPaymentModal.tsx:130-137`), pay button `disabled={!isReadyToSettle || isProcessing}` (line 1216), with a processing label.
- Close affordance has a tooltip "Close (Esc)" and Escape is handled (line 378).
- Global shortcuts exist (`Ctrl/Cmd+K` search, others at `App.tsx:236-`) with a Shortcuts help modal.

**Findings**
- **POS-F2 (P2, confirmed in source):** native dialogs guard cart/menu decisions and block order flows: `PosHeader.tsx:177,190` (`confirm` "Discard the N item(s) in the current cart…"), `PosMenuManagerModal.tsx:400,442` (archive/delete category), `PosOrdersView.tsx:104,108,128,140` (`alert` for "cancelled/refunded", "awaiting online payment verification", "already paid via UPI — do not collect payment again", "not fully synced"), `QrOrdersInbox.tsx:33` (`window.prompt` for decline reason). The UPI "do not collect payment again" message — a money-critical instruction — is a plain `alert()` that disappears on OK. Behaviour in the packaged Tauri build is **unverified**.
- **POS-F3 (P3, count):** 453 sub-12 px declarations (`text-[8–11px]`) in `apps/restaurant-system/pos/src`; examples in `PosPaymentModal.tsx:525` (11 px tag). Density is partly intentional for a counter UI; needs a rendered pass before changing.
- **SH-003 (P2, suspected):** 38 `fixed inset-0` overlays but only 1 `role="dialog"` in POS source — most POS modals are hand-rolled and probably lack dialog semantics/focus management. Not rendered.

**Unverified:** nearly everything functional: cart maths, taxes, discounts, hold/resume, split by guest, receipt, printer fallback, shortcuts, keyboard flow, touch target sizes.
**Scores:** not scored.

---

## 5. Blocked pages
POS-002, 004–013 and all modals. **Unblock:** an activated terminal with seeded menu/tables/staff and a reachable backend, or a supported local fixture; `npm install` for a clean toolchain.

## 6. Responsive results
Only activation rendered (clean). Counter layout, cart panel, sidebar collapse at 768 px unverified.

## 7. Accessibility results
Confirmed (POS-001): labelled input, visible focus, alert role, zoom blocked. Source: 15 `aria-label`s in 57 files; 51 `outline-none` vs 4 `focus-visible/ring` matches → **focus visibility is a risk, unverified**; no `prefers-reduced-motion` handling (0 matches).

## 8. Application scorecard

| Metric | Value |
|---|---|
| Scored pages | 1 (POS-001 → 7.4) |
| Visually verified / interaction tested | 1 / 13 |
| Source reviewed only | 1 / 13 |
| Blocked | 11 / 13 |
| Not audited | 0 |
| Product score | **Not assigned** |

## 9. Fix backlog (POS only)
1. POS-F1 + SH-004 — activation error + status honesty (S).
2. POS-F2 — replace native confirm/alert/prompt in cart discard, UPI warning, order guards (M).
3. SH-003 — dialog semantics for hand-rolled overlays (M–L, after rendering).
4. SH-007 — zoom lock (XS).
5. POS-F3 — evaluate sub-12 px text on a rendered counter at real size (L, needs design).
**Order:** 1 → 2 → 4 → 3 → 5.

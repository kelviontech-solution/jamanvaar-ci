# 06 — Customer Kiosk (self-ordering) audit

Run 2, 2026-10-11. Current source rendered via out-of-repo Vite config. No repository edits.

## 1. Purpose, personas, device

- **User:** a first-time restaurant guest at a self-order terminal; secondary: staff in "Staff Mode" (printer settings, update badge).
- **Device:** touch terminal; `kiosk-user/index.html` locks zoom. A Tauri shell exists. Orientation is not stated in the code I read (assumption: configured per hardware) — portrait vs landscape **unverified**.
- **Source:** `apps/kiosk-system/kiosk-user/src/App.tsx` (**4,325 lines**), `KioskProductCard.tsx`, `KioskReceiptDeliveryDialog.tsx`, `KioskPrinterSettingsModal.tsx`.
- Note: `apps/kiosk-system/kiosk-admin` contains only a `dist/` folder; Kiosk Admin is a product mode inside Restaurant Admin (see `02-restaurant-admin-audit.md`).

## 2. Build / access status

| Check | Result |
|---|---|
| Starts from current source | Yes, with the same two out-of-repo aliases as KDS. The kiosk additionally needs `qrcode` (uninstalled) for QR/UPI — stubbed with a placeholder square, which would show a non-scannable QR if reached. |
| Activated device / menu data | **None.** Guest flow (language → welcome → order type → menu → checkout → confirmation) is behind activation → BLOCKED. |
| Payments | Not exercised (no authorised test environment). |

## 3. Page inventory

| ID | Page / state | Entry | Status |
|---|---|---|---|
| KIOSK-001 | Kiosk activation | first run | **VISUALLY VERIFIED + INTERACTION TESTED** |
| KIOSK-002 | LANGUAGE_SELECT | after activation | BLOCKED |
| KIOSK-003 | WELCOME ("Touch to order") | idle/home | BLOCKED |
| KIOSK-004 | ORDER_TYPE (dine-in / takeaway) | | BLOCKED |
| KIOSK-005 | TABLE_SELECT | dine-in | BLOCKED |
| KIOSK-006 | MENU (categories, product cards, cart drawer, customisation sheet) | | **SOURCE REVIEWED (product card + modifier validation only)** |
| KIOSK-007 | CHECKOUT_PAYMENT (incl. OTP login, coupon, UPI/cash) | | **SOURCE REVIEWED (OTP + validation lines only)** |
| KIOSK-008 | CONFIRMATION / receipt delivery / feedback | | BLOCKED |
| KIOSK-009 | Staff Mode / printer settings modal | long-press/menu | BLOCKED |
| KIOSK-010 | Idle warning + full-session reset overlay | any step after language | **SOURCE REVIEWED** |
| KIOSK-011 | JAMAN AI chatbot panel | menu | BLOCKED |

11 discovered · 1 verified · 3 source-reviewed (partial) · 7 blocked · 0 not audited.

---

## 4. Page reports

### KIOSK-001 — Activation

**Route:** `http://localhost:5174/` · **Status:** VISUALLY VERIFIED + INTERACTION TESTED (current source)
**Intended user:** installer/manager · **Primary task:** enter Restaurant ID + activation key
**Viewports:** 1366×768, 768×1024, 390×844, 1920×1080
**What works well**
- **Specific inline validation**: submitting a malformed Restaurant ID shows "Restaurant ID must look like JM9876543210." directly above the button ([evidence](evidence/kiosk/KIOSK-001-bad-key-submit-1366x768.png)). This is the best error handling of the activation screens.
- Device status chip honestly says "Device: **Activation required**" in amber (not "Online").
- "Where can I find this?" help and "Don't have an activation key?" steps.
- No overflow at 4 viewports; fields have `inputMode="text"`; zero console errors.

**Findings**
- **KIOSK-F4 (P4, confirmed VISUAL):** header uses emoji glyphs ("🍲 Delicious Food", "⚡ Faster Service", "👥 Happier Customers") while the rest of the product uses line icons; rendering differs per OS font. Evidence: [initial 1366](evidence/kiosk/KIOSK-001-initial-1366x768.png).
- **SH-007 (P2):** zoom disabled in `index.html:11`.
- **Observed at 390×844:** the script-font "Good Food, Better Moments" badge is clipped by the top edge ([initial 390](evidence/kiosk/KIOSK-001-initial-390x844.png)). Informational; kiosk is a terminal.
- At 1366×768 the primary button sits at the very bottom edge (y≈742/768) and the "Don't have a key?" box needs scrolling.

**Interactions tested:** filled both fields (invalid ID), submitted, opened "Where can I find this?" (opens; screenshot captured), Tab order (focus ring visible on every stop).
**Unverified:** successful activation, loading ("verifying/registering/syncing" steps exist in source), back-end rejection copy.

| Visual | Usability | Interaction | A11y | Responsive | Consistency | **Weighted** | Conf. |
|---:|---:|---:|---:|---:|---:|---:|---|
| 8 | 8 | 8 | 7 | 7.5 | 7.5 | **7.8** | Medium |

0.25·8 + 0.20·8 + 0.20·8 + 0.15·7.5 + 0.15·7 + 0.05·7.5 = 7.8.
**Do not change:** the inline validation pattern — other activation screens should copy it.

---

### KIOSK-006 — Menu (source-reviewed: product card, modifiers)

**Status:** SOURCE REVIEWED (partial) — not rendered, not interaction tested.
**What works well**
- Primary "Add" button is `w-12 h-12` (48 px) with `aria-label="Add Paneer Tikka to cart"`; "Customize" is 44 px; product cards show diet badge, 2-line clamp, price at `text-xl font-black`.
- Required modifiers are enforced before add (`validateModifiers`); items with options open a sheet, others add straight away.
- `CachedImg` with placeholder fallback and `loading="lazy"`; images are cached on the device for offline use (`ImageCache.sync`).

**Findings**
- **KIOSK-F2 (P2, confirmed in source; impact suspected):** the cue that tells a guest *a choice is required* — "Customization required" — is `text-[11px] font-medium text-[#8C9BAE]` (`KioskProductCard.tsx:65-66`), calculated contrast **2.83:1** on white (needs 4.5:1). A guest who taps "Add" on a required-option dish is stopped by a validation (see KIOSK-F1). The cue is also in grey under the price.
- **KIOSK-F3 (P3, confirmed in source):** the card is a `<div onClick>` (line 33) — not focusable, no role. Fine for touch-only; blocks keyboard/switch access where a USB keyboard or assistive device is attached.
- **KIOSK-F1 (P1)** — see KIOSK-007.
- Description at `text-xs` (12 px) in `#4A5568` (7.5:1) — contrast fine, size small for arm's-length reading.

**Unverified:** category rail, cart drawer, quantity steppers, price maths, long names, empty/out-of-stock state, grid at portrait vs landscape.
**Scores:** not scored (no rendering). **Confidence:** Low.

---

### KIOSK-007 — Checkout / OTP / validation (source-reviewed)

**Status:** SOURCE REVIEWED (partial).
**Findings**
- **KIOSK-F1 (P1, confirmed in source, not rendered):** guest-facing validation uses blocking `window.alert()`:
  - `App.tsx:1208` modifier validation errors (`alert(validation.errors.join('\n'))`)
  - `App.tsx:1871` "Please enter a valid 10-digit mobile number"
  - `App.tsx:1886`, `1892`, `1911` OTP expired / too many attempts / incorrect code.
  Impact: unstyled OS dialog on a customer terminal, strings are literal English though the kiosk offers 7 languages (`LANGUAGE_OPTIONS`, `t()` exists and is used elsewhere in the file), and the kiosk's own `showToast`/inline error patterns are bypassed. **Not verified:** how the packaged Tauri/WebView build presents `alert()`.
- Not read: whether the phone/OTP fields also show an inline error alongside the `alert()` (only the `alert` call sites were inspected).

**Do not change:** idle-timer exclusion while awaiting UPI payment (`awaitingOnlinePayment`) and the automatic fallback from UPI to cash when online payment is unavailable (B2-023 comment).

---

### KIOSK-010 — Idle warning and session reset

**Status:** SOURCE REVIEWED.
**What works well**
- Thresholds come from Kiosk Admin settings (`idleWarningAfterSeconds`, `idleResetCountdownSeconds`); countdown dialog is localised (`t('idleWarningTitle')`).
- `handleFullSessionReset` (`App.tsx:913`) clears cart, table, coupon, modifiers, OTP/login, payment ids, chat history, receipt delivery state, feedback, cancels abandoned pending orders, stops speech, rotates `sessionId`, and restores the default language. This directly addresses "next customer sees the previous customer's data".
- Timer is paused on WELCOME/LANGUAGE_SELECT, during UPI wait, and during receipt delivery.

**Unverified:** that the dialog is reachable by touch on every step, whether touching *behind* the dialog resets the timer, and the real visual of the overlay. Not rendered.
**Note (low):** `showToast` uses an un-cleared `setTimeout` (`App.tsx:907`) — harmless.

---

## 5. Blocked pages
KIOSK-002, 003, 004, 005, 008, 009, 011 and all of the guest flow's *rendering*. Needed: activated device + seeded menu + backend, or a supported demo fixture (none found — `grep` for demo/mock modes found only the cloud-api seed).

## 6. Responsive results
Only activation rendered: clean at four viewports; 390 px clipped badge noted. Guest flow orientation/density unverified.

## 7. Accessibility results
- Confirmed: focus rings on activation controls; labelled inputs; zoom locked.
- Calculated: `#8C9BAE` text (2.83:1) at 11–12 px on product cards and settings lines (`App.tsx:1934, 2070, 2356, 2485`).
- Source: 14 `aria-label`s; `role="dialog"` ×1; 10 uses of shared `Modal` (see SH-001).
- Not tested: screen reader, target sizes on rendered menu, reduced motion (1 match).

## 8. Application scorecard

| Metric | Value |
|---|---|
| Scored pages | 1 (KIOSK-001 → 7.8) |
| Visually verified / interaction tested | 1 / 11 |
| Source reviewed only | 3 / 11 |
| Blocked | 7 / 11 |
| Not audited | 0 |
| Product score | **Not assigned** |

## 9. Fix backlog (Kiosk only)
1. KIOSK-F1 — replace 5 `alert()` with in-flow, localised inline/toast errors (S).
2. KIOSK-F2 — move "Customization required" to a ≥4.5:1 token and ≥12 px (XS).
3. SH-001 — focus management in shared Modal (M, shared).
4. SH-007 — zoom lock decision (XS).
5. KIOSK-F3 — `role="button"`/keyboard on card if keyboards are supported (XS).
6. KIOSK-F4 — replace header emoji with the app's icon set (XS).

**Order:** 1 → 2 → 3 → rest, then a rendered pass of the full guest flow at the real terminal resolution.

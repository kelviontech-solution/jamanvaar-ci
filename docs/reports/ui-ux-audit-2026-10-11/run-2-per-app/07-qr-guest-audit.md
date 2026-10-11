# 07 — QR Guest Ordering audit

Run 2, 2026-10-11. Current source rendered via out-of-repo Vite config. No repository edits.

## 1. Purpose, personas, device
- **User:** a restaurant guest who scanned a table QR on their own phone; no account.
- **Device:** mobile browser, portrait. `index.html` viewport is `width=device-width, initial-scale=1.0, viewport-fit=cover` — **zoom is not locked** (the only app that gets this right).
- **Source:** `apps/qr-guest/src` — `App.tsx` 595 lines, `GroupOrder.tsx` 374, `LoyaltyPanel.tsx` 183, `Operations.tsx` 200, `AdvancedGuest.tsx` 144, `styles.css` 237. URL contract: `/q/<token>` with `#menu|#cart|#checkout|#status` and `?order=` (`App.tsx:29-30, 54, 94`).

## 2. Build / access status
Starts from current source. It imports only `packages/utils` helpers (`menu_image`, `dish_photos`), not `packages/ui`; the audit's uniform aliases were applied but none of the missing modules is imported by its own source. Backend not running, so no real token can resolve; only the **invalid-code** and **network-failure** states were reachable.

## 3. Page inventory

| ID | Page / state | Entry | Status |
|---|---|---|---|
| QR-001 | Invalid QR ("This QR code is not valid") | `/` or a malformed path | **VISUALLY VERIFIED** (1366, 390) |
| QR-002 | Connection failure ("No connection" + Try again) | `/q/<well-formed token>` with API down | **VISUALLY VERIFIED + INTERACTION TESTED** |
| QR-003 | Menu (search, language, diet, category chips, dish list) | `#menu` | **SOURCE REVIEWED (partial: attributes/labels)** |
| QR-004 | Dish sheet (options, notes, quantity) | tap dish | **SOURCE REVIEWED (partial)** |
| QR-005 | Cart | `#cart` | **SOURCE REVIEWED (partial)** |
| QR-006 | Checkout (order type, table number, phone, notes, coupon, payment) | `#checkout` | **SOURCE REVIEWED (partial)** |
| QR-007 | Order status / payment retry | `#status`, `?order=` | **SOURCE REVIEWED (partial)** |
| QR-008 | Group order (`GroupOrder.tsx`) | menu feature | BLOCKED |
| QR-009 | Loyalty panel (`LoyaltyPanel.tsx`) | feature flag | BLOCKED |
| QR-010 | Service requests / operations (`Operations.tsx`) | menu | BLOCKED |
| QR-011 | Advanced: history / recommendations (`AdvancedGuest.tsx`) | menu | BLOCKED |

11 discovered · 2 verified/tested · 5 source-reviewed (partial) · 4 blocked · 0 not audited.
"Source reviewed (partial)" here means: lines matching accessibility/validation/state keywords (`aria-`, `role=`, `placeholder`, `disabled`, error handling) were read in context; the files were **not** read end-to-end.

---

## 4. Page reports

### QR-001 — Invalid QR

**Status:** VISUALLY VERIFIED (current source) at 1366×768 and 390×844.
**What works well:** brand mark, one `<h1>` ("This QR code is not valid"), plain next step ("scan the code on your table again, or ask a team member"), `<main>` landmark, no overflow, zero console errors ([390](evidence/qr-guest/QR-001-initial-390x844.png)).
**Findings:** (P4) there is no secondary action (no "contact the restaurant", no link) — acceptable because the guest has no other context. 
**Score:** visual 8, usability 7, responsive 8, a11y 7.5, consistency 8; interaction N/A → **7.6**. Confidence: Medium.

### QR-002 — "No connection"

**Route:** `http://localhost:5190/q/AuditFakeToken0123456789` · **Status:** VISUALLY VERIFIED + INTERACTION TESTED.
**What works well:** heading "No connection" + "Please check your internet and try again." + a single **Try again** button; `<main>` present ([initial](evidence/qr-guest/QR-002-initial-390x844.png)).
**Findings**
- **QR-F2 (P3, confirmed INTERACTION):** pressing *Try again* while still offline re-runs the request (4 failed requests logged) but the screen is **pixel-identical before and after** ([retry](evidence/qr-guest/QR-002-retry-390x844.png)): no "Trying…" state, no "still offline" confirmation. A guest cannot tell whether the tap registered.
**Unverified:** automatic retry/backoff, restored state after reconnect, behaviour when only one of `describe`/`menu` fails.
**Score:** visual 7.5, usability 7, interaction 6, responsive 8, a11y 7, consistency 8 → **7.1**. Confidence: Medium.
**Do not change:** copy and single-action layout.

---

### QR-003…QR-007 — Ordering flow (source-reviewed, partial; not rendered)

Positive evidence in source:
- **Accessibility baseline is the strongest in the platform:** global `:focus-visible` outlines (`styles.css:74, 220`, 3 px), `prefers-reduced-motion` handling (`styles.css:207, 225`), `role="alert"` on payment/quote/submit errors (`App.tsx:211, 513-514, 581`), `role="status"` on availability notes, `aria-label`s on Add/Edit/Fewer, `nav` landmarks labelled "Language", "Dietary filters", "Categories", "Order progress", `role="dialog" aria-modal="true"` on the dish sheet.
- **Transaction safety:** checkout button is `disabled={busy || !quote || !ready || …}` and switches label while submitting (`App.tsx:515`); cart blocks Checkout when lines became unavailable (`gone.length>0`) or no price quote (`:410`); payment retry offers "Pay at counter instead" and "Check payment status" (`:574-578`).
- Required-choice copy is explicit: "Choose 1 (required)", "Choose 2 to 3 (required)" (`:327-329`); phone has `inputMode="tel"`, `autoComplete="tel"`; notes have `maxLength`.
- Low-bandwidth mode (`lowBandwidth`) skips the hero photo.

Findings (SOURCE, suspected until rendered):
- **QR-F1 (P3):** the **table number** input has only a `placeholder` and no `<label>`/`aria-label` (`App.tsx:495`); the phone field, by contrast, is wrapped in a label. Placeholder-only fields lose their label once text is entered.
- **QR-F3 (P4):** dish-sheet dialog sets `role="dialog" aria-modal` but no focus trap or return-focus code was seen in the lines read.
- Unverified: item images (`DishPhoto` fallback), horizontal chip scroll at 320 px, sticky checkout bar vs iOS keyboard, back-button/refresh behaviour (hash navigation + `pushState` is implemented), error text for payment decline.

**Scores:** not scored.

## 5. Blocked pages
QR-008…011 and all real-data rendering. **Unblock:** running cloud API with a seeded restaurant and a generated table QR token (or a documented public demo token — none found).

## 6. Responsive results
QR-001/002 at 390 and 1366: clean. Ordering screens unverified at any size.

## 7. Accessibility results
Confirmed: `main`/`h1`, zoom permitted. Source: strong baseline listed above. Not tested: screen reader, keyboard-only checkout, rendered contrast of brand `--saffron` on white (not calculated).

## 8. Application scorecard

| Metric | Value |
|---|---|
| Scored pages | 2 (QR-001 → 7.6, QR-002 → 7.1) |
| Visually verified | 2 / 11 |
| Interaction tested | 1 / 11 |
| Source reviewed only | 5 / 11 (partial) |
| Blocked | 4 / 11 |
| Product score | **Not assigned** |

## 9. Fix backlog (QR guest only)
1. QR-F2 — visible "Trying again…" / "Still offline" feedback (XS).
2. QR-F1 — label the table-number field (XS).
3. QR-F3 — verify and, if absent, add focus management to the dish sheet (S).
4. Rendered pass of the full ordering flow at 360×640, 390×844, 768×1024 with seeded menu.
**Do not change:** the accessibility baseline in `styles.css`, the retry/"pay at counter" payment recovery, explicit required-choice copy. Other apps should borrow from this one.

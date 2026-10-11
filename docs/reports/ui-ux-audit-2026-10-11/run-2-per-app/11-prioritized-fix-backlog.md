# 11 — Prioritized fix backlog

Nothing here was implemented. Items are small enough to ship and verify independently. "Confirmed" = observed in a render or read directly in source; "Suspected" = needs a rendered pass first. Effort: S ≈ hours, M ≈ days, L ≈ week+ (approximate).

**Blockers (not product defects) — do first:** ENV-001 install dependencies, ENV-002 resolve Captain conflicts. See `10-blockers-and-coverage.md`.

## P0 — Critical
*None confirmed.* No evidence of data loss, security exposure or a blocked core transaction was found in the 23 pages that have any evidence. (Authenticated transaction flows are unaudited — this is absence of evidence, not proof.)

## P1 — High

| ID | Apps | Pages | Issue | User impact | Recommended correction | Scope | Effort | Verify |
|---|---|---|---|---|---|---|---|---|
| SH-001 | Admin (28 uses), Kiosk (10) | all dialogs using shared `Modal` | No focus move/trap/restore; backdrop click dismisses | Keyboard/switch/SR users get lost; accidental data loss in forms | Shared dialog with focus management and top-of-stack dismissal | Shared | M | Open each dialog type, Tab ×15, Esc; focus returns to trigger |
| KIOSK-F1 | Kiosk | KIOSK-006/007 | `alert()` for modifier and OTP validation (`App.tsx:1208,1871,1886,1892,1911`) | Guests get an unstyled, English-only OS dialog mid-order | Use inline/toast messages through `t()` | App | S | Trigger each validation in 2 languages |

## P2 — Medium

| ID | Apps | Pages | Issue | Correction | Scope | Effort | Verify |
|---|---|---|---|---|---|---|---|
| SH-002 | Admin, Kiosk | all `Modal` | Unnamed close; Escape closes stacked dialogs | `aria-label="Close"`; close only top-most | Shared | S | Screen-reader label; nested dialog Esc closes one |
| SH-004 / POS-F1 / KDS-F1 | POS, KDS | POS-001, KDS-001 | False "Connected" badge; "Activation failed" hides cause | Pass health state or hide pill; show transport error | Shared + 2 apps | S | Activate with backend off → "Unreachable"/"cannot reach server" |
| ADMIN-F1 | Admin | ADMIN-001 | Raw `TypeError: Failed to fetch` in sign-in error (`App.tsx:399`) | Remove exception suffix | App | XS | Sign in offline → friendly sentence only |
| ADMIN-F2 | Admin | 29 sites (void bill, delete dish/customer, restore backup…) | Native `confirm` for destructive actions | One confirmation dialog with impact text | App | M | Each action shows dialog; cancel does nothing |
| POS-F2 | POS | POS-003/005 | Native confirm/alert/prompt incl. UPI "do not collect again" | In-app dialog; persistent banner for payment warnings | App | M | Trigger each; confirm text persists until acknowledged |
| CAP-F1 | Captain (after unblock) | table workspace, header, shift | Native confirm for logout/end shift/discard order | Same dialog | App | S | — |
| KIOSK-F2 | Kiosk | KIOSK-006 | "Customization required" 11 px, 2.83:1 | ≥12 px, ≥4.5:1 token | App | XS | Measure contrast |
| SH-005 | All | many | Muted text colours < 4.5:1 | Single muted token (e.g. existing `#52677A`) | Shared | M | Contrast sweep on rendered pages |
| SH-007 | Admin, Kiosk, POS, Captain, KDS | all | Zoom blocked by viewport meta | Remove on admin console; decide per terminal | Per app | XS | Pinch zoom on a phone |
| SH-003 | POS, Captain, Super Admin | overlays | 38 / 14 / 41 overlays with few dialog roles | Audit rendered; adopt shared dialog | Shared | M–L | Keyboard + SR pass |

## P3 — Low

| ID | Apps | Issue | Correction | Effort |
|---|---|---|---|---|
| SH-006, POS-F3, KDS-F2/F2b | POS, Admin, KDS, Captain | Sub-12 px text; KDS timer chip 11 px, priority/reprint 40 px | Rendered review at real device size; enlarge status info and gloved targets | L |
| SH-008 | Admin | "Pair" 22×16 | Larger hit area | XS |
| SH-009 | Super Admin | Logo noise on dark | Dark-theme asset | S |
| SH-012 | All | Duplicated tokens/raw hex | Shared Tailwind preset | M |
| SH-013 | All with toasts | Toast container has no live region | `role="status"`/`aria-live="polite"` | XS |
| SUPER-F2 | Super Admin | Whole-list client filtering | Server-side paging | M |
| SUPER-F3 / ADMIN-F4 | Super Admin, Admin | IA grouping of payments/coupons, jargon | Product decision, then relabel | S |
| ADMIN-F3 | Admin | Activation panel submit below fold at 768 px | Tighten spacing | XS |
| KIOSK-F3 | Kiosk | Product card is `div onClick` | Role/keyboard if keyboards supported | XS |
| QR-F1 / QR-F2 | QR | Table-number unlabeled; "Try again" gives no feedback | Label; busy/still-offline message | XS |

## P4 — Cosmetic

SH-010 ("Port 4000" copy), SH-011 ("100% Secure"), SUPER-F1 (Router future-flag warnings), SUPER-F4 (no `<main>` on `/activate`), KDS-F3 (tab roles without panels), KIOSK-F4 (emoji in header), ADMIN-F3b (stale "OWNER SIGN-IN" badge), QR-F3 (dish-sheet focus management, suspected), SH-014 (auth header crowding at 390 px — confirmed on Restaurant Admin in current source; Captain and Super Admin seen only in the superseded run-1 build).

## Totals (de-duplicated by ID)
P0 0 · P1 2 · P2 12 · P3 15 · P4 9 — **38 findings**: 30 confirmed (observed in a render or read directly in source), 8 suspected (SH-003, SH-013, KDS-F2, KDS-F2b, SUPER-F2, SUPER-F3, ADMIN-F4, QR-F3). Two blockers (ENV-001, ENV-002) are tracked separately.

## Suggested order
1. Unblock (ENV-001/002) → 2. SH-001/002 → 3. KIOSK-F1 + KIOSK-F2 → 4. SH-004/POS-F1/KDS-F1 + ADMIN-F1 → 5. ADMIN-F2/POS-F2/CAP-F1 (one dialog) → 6. SH-005/SH-012 → 7. SH-007 decision → 8. rendered passes for P3 items.

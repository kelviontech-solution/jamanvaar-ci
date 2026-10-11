# 09 — Shared components and design-token audit

Run 2, 2026-10-11. Source review of `packages/ui/src` (39 component files, `Modal.tsx` read in full, `JamanvaarAuthLayout.tsx` read in the status/health sections, `Button.tsx` and `NotificationToastContainer.tsx` grepped), each app's `tailwind.config.js`, and Super Admin's `components/ui.tsx`. Rendering evidence only for the auth layout (via 6 apps' pre-auth screens).

Findings here are **shared**: one master finding with per-app impact. Page-specific findings are in the application reports.

## 1. Inventory of what was and was not inspected

| Component / asset | Inspected? |
|---|---|
| `Modal` | Yes — full read |
| `JamanvaarAuthLayout` + `ActivationHelpNote`, `ActivationNoticeBanner` | Yes — health/badge logic, rendered in 6 apps |
| `Button` | Partial — variant classes only |
| `NotificationToastContainer` | Partial — grep |
| `StateFeedback` (EmptyState etc.), `StatusBadge`, `KpiCard`, `ProductCard`, `VirtualKeyboard`, `ThermalReceiptView`, `JamanAiAssistantModal`, `UrgentGuestAlertModal`, `NotificationDrawerModal`, `DeviceGateOverlay` | **Not inspected** |
| Super Admin `components/ui.tsx` (`Modal`, `Input`, Skeletons, Badge, Card, EmptyState, BulkActionsBar) | Partial — `Modal`, `Input`, `SkeletonLine` |
| Tailwind configs ×6 | Yes |
| Icon system | Mostly `lucide-react`; emoji in Kiosk header (see KIOSK-F4) |

## 2. Shared findings

### SH-001 — Modal has no focus management (P1, confirmed in source)
**Where:** `packages/ui/src/Modal.tsx:36-98`. **Used by:** Restaurant Admin (28 `<Modal>` uses), Kiosk (10). *Not* used by POS (0), Captain (0), KDS (0), QR guest (0), Super Admin (own copy).
**Observed in code:** on open nothing receives focus; there is no trap (Tab walks into the page behind the backdrop); on close focus is not returned to the trigger; backdrop click closes (data loss risk in forms). The dialog is `role="dialog" aria-modal="true" aria-label={title || 'Dialog'}`, so assistive tech is told the rest is inert while it is not.
**Impact:** keyboard, switch and screen-reader users; also any Admin user with a physical keyboard who presses Tab in a long form dialog.
**Recommended direction:** one shared dialog that moves focus in, traps, restores, and closes on the *top-most* dialog only.
**Verification after fix:** open any Admin dialog, Tab 15×, confirm focus never leaves; Esc returns focus to the trigger.
**Rendered:** no — blocked behind authentication.

### SH-002 — Close button unnamed; Escape closes every open dialog (P2, confirmed in source)
`Modal.tsx:76-84`: icon-only `<button>` containing `<X/>` with no `aria-label`/`title`. `Modal.tsx:36-44`: each open `Modal` registers its own `window` keydown handler; with a confirm dialog opened from a form dialog, one Esc fires both handlers.
**Contrast:** Super Admin's equivalent labels the close button (`aria-label="Close"`) — the fix is known in the codebase.

### SH-003 — Hand-rolled overlays without dialog semantics (P2, suspected)
Counts of `fixed inset-0` overlays vs `role="dialog"/"alertdialog"/aria-modal`: POS **38 / 1**, Captain **14 / 4**, Kiosk 4 / 1, Admin 16 / 2, KDS 0 / 0, Super Admin's `modal-backdrop` pattern **10 inline + 31 `<Modal>` uses / 2**. Many overlays may be non-modal drawers or toasts, so the ratio is a *lead*, not proof. Needs rendered keyboard/screen-reader pass per overlay.

### SH-004 — Status badge can say "Local Core: Connected" with no check (P2, confirmed VISUAL + SOURCE)
`JamanvaarAuthLayout.tsx:291`: `apiBadgeConnected = healthCheckUrl ? apiReachable !== false : true`, and the label falls through to "Connected" when `isLocalCoreConnected` is `undefined` (only an explicit `false` produces "Not set up/Connecting"). Callers that pass neither prop therefore always show green. Confirmed in the browser on **POS** (`pos/src/App.tsx:303`) and **KDS** (`kds/src/App.tsx:645`) activation screens with nothing listening on the relay. Restaurant Admin (`App.tsx:805`), Captain (`App.tsx:327,401`), POS PIN login (`PosLogin.tsx:86`) and Super Admin pass a health URL and correctly read "Unreachable".
**Recommended direction:** make the unknown state explicit (hide the pill or show "Not checked") rather than defaulting to connected. The B2-006 comment in the file shows this was already identified once.

### SH-005 — Muted-text colours below 4.5:1 (P2, calculated from source hex values)
| Colour | on white | on ivory `#FBF9F5` | Seen in |
|---|---:|---:|---|
| `#8C9BAE` | 2.83 | 2.69 | Kiosk product card "Customization required", Kiosk settings lines |
| `#8CA0B3` | 2.69 | 2.56 | Auth layout status text on dark (separate calc needed), Admin |
| `#94A3B8` (slate-400) | 2.56 | — | disabled/secondary text across apps |
| `#E66817` saffron as **text** | 3.26 | 3.14 | eyebrow labels, prices (≥18.66 px bold passes 3:1) |
| white on `#E66817` (`Button` `accent`) | 3.30 | — | primary action buttons |
| `#718096` | 4.02 | 3.82 | secondary labels |
| `#52677A` | 5.87 | 5.58 | already in use — passes |
| `#4A5568` | 7.53 | 7.16 | passes |
Used counts: `text-[#8C9BAE]` ×22, `text-[#8CA0B3]` ×10, `text-[#718096]` ×11. Ratios are computed, not measured on rendered pixels; effective colour may differ with opacity.
**Note on accent buttons:** `Button`'s `accent` variant (white on `#E66817`, 3.3:1) is large-text-only compliant; label size is `text-sm/base` semibold → fails 1.4.3 at those sizes. Several rendered primary buttons (e.g. Restaurant Admin "Sign In") look darker than `#E66817`; their exact hex was not measured, so whether the token set is already inconsistent is **unverified**.

### SH-006 — Sub-12 px text is the norm (P3, count)
`text-[8px…11px]` declarations: Restaurant Admin 710, POS 453, Captain 103, `packages/ui` 90, Kiosk 27, Super Admin 3, KDS 15, QR guest 0. Operational density is a legitimate goal; the issue is that it also applies to *status* information (timers, required-option cues). Needs rendered review at real device size/distance.

### SH-007 — Zoom blocked by viewport meta (P2, confirmed by reading the meta tags)
| App | `index.html` viewport |
|---|---|
| Kiosk, Restaurant Admin, Captain, KDS | `maximum-scale=1.0, user-scalable=no` |
| POS | `maximum-scale=1.0, user-select=none` (invalid token; zoom still capped) |
| Super Admin | `width=device-width, initial-scale=1.0` — fine |
| QR guest | `width=device-width, initial-scale=1.0, viewport-fit=cover` — fine |
Intentional for locked terminals? Unknown; the admin console on laptops/phones is the clear case. See decisions in `10-blockers-and-coverage.md`.

### SH-008 — Small tap targets in auth chrome (P3, confirmed, measured)
"Pair" (Local Core) measures 22×16 px on Restaurant Admin sign-in. The "Remember session"/"Remember this device" native checkboxes are 13×13.

### SH-009 — Logo raster on dark background (P3, confirmed VISUAL)
Super Admin login: visible dithered rectangle around the wordmark (1366 and 1920). The light-background asset is reused on a dark theme.

### SH-010 — Developer detail in user-facing text (P4, confirmed VISUAL)
"Port 4000 • Live Cloud API" (`LoginPage.tsx:214`) and "Connected (Port 4000)" (`JamanvaarAuthLayout.tsx:372`).

### SH-011 — Unverifiable assurance copy (P4, confirmed VISUAL)
"Role-Based Security • Instant Offline Boot • 100% Secure" (`footerNote`, repeated in 6 apps).

### SH-012 — Tokens duplicated and bypassed (P3, confirmed in source)
Six `tailwind.config.js` files (27–30 lines each) repeat the same `jaman.*` palette; `bg|text|border-[#hex]` arbitrary values appear 1,012 times against 4,506 `jaman-*` uses; Super Admin has a second token system (`--jv-*`). Consequence: SH-005 must be fixed in many places.

### SH-013 — Toast region has no live-region semantics (P3, suspected, source)
`NotificationToastContainer.tsx:60` renders `<aside aria-label="System Notifications">` and the file contains no `aria-live`/`role="status|alert"`. New notifications may not be announced. (KDS and QR guest add their own `role="status|alert"` elsewhere.) Not tested with a screen reader.

## 3. What shared code does well
- Single auth/activation layout gives all apps a recognisable, accessible-enough first screen (labels, focus, landmarks).
- `Modal` caps height and scrolls its body inside the card with an optional pinned footer; comment documents a real GPU-lag fix (no `backdrop-blur`).
- Super Admin's confirmation dialog pattern with impact summary; QR guest's accessibility CSS baseline — both reusable.
- `ScreenErrorBoundary`, `StateFeedback`, `CachedImg` exist as shared primitives.

## 4. Per-application impact matrix

| Finding | Admin | Kiosk | POS | Captain | KDS | QR | Super |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| SH-001/002 shared Modal | ● 28 | ● 10 | – | – | – | – | – |
| SH-003 overlay semantics | ◐ | ◐ | ● | ◐ | – | – | ● |
| SH-004 false "Connected" | – | – | ● | – | ● | – | – |
| SH-005 contrast | ● | ● | ◐ | ◐ | ◐ | ? | ◐ |
| SH-006 tiny text | ● | ◐ | ● | ◐ | ◐ | – | – |
| SH-007 zoom lock | ● | ● | ● | ● | ● | – | – |
| SH-008 hit area | ● | – | – | ? | – | – | ◐ |
| SH-009 logo on dark | – | – | – | – | – | – | ● |
● confirmed · ◐ suspected/partial · ? not examined · – n/a

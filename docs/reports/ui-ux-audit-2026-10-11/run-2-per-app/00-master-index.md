# JAMANVAAR frontend UI/UX audit — Run 2 (per-application) — master index

**Date:** 2026-10-11 · **Mode:** read-only audit · **Supersedes (as diagnostic only):** `../UI-UX-AUDIT-REPORT.md` (run 1, stale `dist` builds)

> **This audit is not complete.** 23 of 129 discovered pages (17.8 %) have any evidence; 11 (8.5 %) were rendered from current source; 106 (82.2 %) are blocked. No application or product score is assigned.

## 1. Applications

| # | Application | Report | Pages | Verified (visual) | Interaction tested | Source-reviewed (partial) | Blocked | Scored pages → avg | Product score |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| 1 | Super Admin (`cloud/super-admin-web`) | [01](01-super-admin-audit.md) | 42 | 3 | 2 | 1 | 38 | 2 → 7.5 | — |
| 2 | Restaurant Admin / Kiosk Admin mode (`apps/restaurant-system/pos-admin`) | [02](02-restaurant-admin-audit.md) | 38 | 3 | 3 | 0 | 35 | 3 → 7.4 (2 provisional) | — |
| 3 | POS Counter | [03](03-pos-counter-audit.md) | 13 | 1 | 1 | 1 | 11 | 1 → 7.4 | — |
| 4 | Captain | [04](04-captain-audit.md) | 10 | 0 | 0 | 0 | **10** | 0 | — |
| 5 | KDS | [05](05-kds-audit.md) | 4 | 1 | 1 | 2 | 1 | 1 → 7.4 | — |
| 6 | Kiosk (customer) | [06](06-kiosk-audit.md) | 11 | 1 | 1 | 3 | 7 | 1 → 7.8 | — |
| 7 | QR Guest | [07](07-qr-guest-audit.md) | 11 | 2 | 1 | 5 | 4 | 2 → 7.4 | — |
| — | Shared components & tokens | [09](09-shared-components-audit.md) | — | — | — | — | — | — | — |
| — | Blockers, method, coverage | [10](10-blockers-and-coverage.md) | | | | | | | |
| — | Prioritised fix backlog | [11](11-prioritized-fix-backlog.md) | | | | | | | |
| | **Total** | | **129** | **11** | **9** | **12** | **106** | | |

`08-additional-frontends-audit.md` is not produced: no further frontend was found. `apps/kiosk-system/kiosk-admin` holds only a `dist/` folder; Kiosk Admin runs inside Restaurant Admin (ADMIN report). The averages are over **pre-authentication screens only** and must not be read as the quality of the products.

Scores use the weights in the brief: usability 25 · visual 20 · interaction 20 · responsive 15 · accessibility 15 · consistency 5. Where interaction could not be tested the weights were re-normalised and the page is marked provisional.

## 2. Findings summary (38, de-duplicated; details in report 11)

| Priority | Count | Examples |
|---|---:|---|
| P0 | 0 | — |
| P1 | 2 | SH-001 shared `Modal` has no focus management; KIOSK-F1 `alert()` validation in guest flow |
| P2 | 12 | SH-004 false "Local Core: Connected" (POS, KDS); POS-F1/KDS-F1 "Activation failed" hides cause; ADMIN-F1 raw `TypeError` shown; ADMIN-F2 / POS-F2 / CAP-F1 native confirms; SH-005 contrast; SH-007 zoom lock |
| P3 | 15 | KDS timer chip 11 px; Pair hit area 22×16; logo noise on dark; QR retry gives no feedback … |
| P4 | 9 | "Port 4000" copy, marketing claims, router warnings … |
| Blockers | 2 | ENV-001 uninstalled/unlinked modules; ENV-002 Captain merge conflicts |

## 3. Highest-priority confirmed items
1. **SH-001 / SH-002** — one shared dialog defect touches 28 Admin dialogs and 10 Kiosk dialogs (source).
2. **KIOSK-F1** — five blocking `alert()` calls in the guest ordering flow (source, `App.tsx:1208…1911`).
3. **SH-004** — POS and KDS activation screens show a green "Local Core: Connected" with nothing running (rendered, current source).
4. **POS-F1 / KDS-F1 / ADMIN-F1** — failure messaging ranges from "Activation failed" to raw `TypeError: Failed to fetch`; Super Admin's message is the model (rendered).
5. **ENV-002** — Captain does not compile until 10 conflict hunks are resolved (blocker).

## 4. Positive findings to preserve
- Super Admin sign-in failure copy (cause + action); suspend/reactivate dialog with impact box (source).
- QR guest accessibility baseline: focus-visible, reduced-motion, alert/status roles, explicit required-choice copy, zoom allowed.
- KDS: connection bar, cancel-ticket handling, undo model, dish-level `aria-pressed` buttons (source).
- Kiosk: full-session scrub on idle (`handleFullSessionReset`), specific inline activation validation (rendered).
- POS payment modal double-submit guard (`settlingRef` + `isProcessing`, source).
- Consistent branded activation/sign-in layout; no overflow at 4 viewports on any rendered screen; zero console errors on rendered pre-auth screens (except Router future-flag warnings).

## 5. Recommended working order (one application at a time)
1. **Unblock** (ENV-001/002) and provide a seeded backend + test accounts → re-run this audit; ~106 pages are waiting on that.
2. **Shared first:** SH-001/002 (dialog), SH-004 (badge), SH-005/SH-012 (tokens).
3. **Kiosk** (guest-facing): KIOSK-F1, F2, then rendered pass of the 7 guest steps.
4. **KDS**: KDS-F1 then rendered board pass with seeded tickets.
5. **POS**, **Restaurant Admin**: native-confirm replacement (one dialog), then rendered passes.
6. **Captain** after conflicts are resolved.
7. **Super Admin**, **QR guest**: small fixes; QR guest should be the accessibility reference.

## 6. Artifacts created (nothing else was changed)
`docs/reports/ui-ux-audit-2026-10-11/run-2-per-app/` — this index, reports 01–07, 09–11, `log-pass1/2/3.json`, and `evidence/<app>/*.png` (58 screenshots). Previous run-1 files in the parent directory were left untouched.

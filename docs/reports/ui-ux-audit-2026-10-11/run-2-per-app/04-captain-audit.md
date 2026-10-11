# 04 — Captain (floor service) audit

Run 2, 2026-10-11. **This application cannot be rendered from the current working tree.** No repository edits were made; conflicts were not resolved (audit rule).

## 1. Purpose, personas, device
- **Users:** waiter/captain on a handheld or tablet taking table orders, sending to kitchen, serving "food ready", handling guest requests and bills.
- **Device:** phone/tablet; `index.html` zoom-locked. Tauri shell exists.
- **Source:** `apps/restaurant-system/captain/src` — 31 files; tabs `TABLES | ORDERS | FOOD_READY | KOTS | MESSAGES | REQUESTS | SHIFT | CUSTOMERS` (`CaptainNavigation.tsx:14`), "More" drawer.

## 2. Build / access status — BLOCKED

| Blocker | Evidence |
|---|---|
| **Merge-conflict markers in 6 source files** (and `package-lock.json`) left by the `git pull --rebase --autostash` at the start of this session | `git status` shows `UU`; Vite reports `CaptainFoodReadyView.tsx: Unexpected token (183:1)` and `CaptainLiveKotsView.tsx: Unexpected token (93:0)`; rendered result: [blank page](evidence/captain/CAPTAIN-001-initial-1366x768.png) with 8 console errors |
| Uninstalled modules `@tauri-apps/plugin-updater`, `qrcode`, un-linked `@jamanvaar/tauri-plugin-apk-updater` | `10-blockers-and-coverage.md` |
| No backend, no activated device, no waiter PIN | — |

Conflict hunks (counted, not resolved): `CaptainJamanAiModal.tsx` 2, `CaptainFoodReadyView.tsx` 1, `CaptainLiveKotsView.tsx` 3, `CaptainGuestRequestsView.tsx` 1, `CaptainTableCard.tsx` 1, `CaptainTableWorkspaceModal.tsx` 2. The one hunk inspected (`CaptainTableCard.tsx:60`) is a collision between upstream's `role="group"` + `aria-label` + `rounded-3xl` and the stashed local `rounded-2xl` — i.e. upstream added accessibility attributes that the local work-in-progress would silently drop if the "stashed" side were taken.

## 3. Page inventory

| ID | Page | Status |
|---|---|---|
| CAPTAIN-001 | Tablet activation | **BLOCKED** (build) — attempted render, blank page |
| CAPTAIN-002 | Waiter login (PIN) | BLOCKED |
| CAPTAIN-003 | My Tables (`TABLES`: floor view, table cards, table workspace modal) | BLOCKED — contains conflicted files |
| CAPTAIN-004 | Active Orders (`ORDERS`) | BLOCKED |
| CAPTAIN-005 | Food Ready (`FOOD_READY`) | BLOCKED — conflicted |
| CAPTAIN-006 | Live KOTs (`KOTS`) | BLOCKED — conflicted |
| CAPTAIN-007 | Messages (`MESSAGES`) | BLOCKED |
| CAPTAIN-008 | Guest Requests (`REQUESTS`) | BLOCKED — conflicted |
| CAPTAIN-009 | Shift stats (`SHIFT`) | BLOCKED |
| CAPTAIN-010 | Customers (`CUSTOMERS`) | BLOCKED |

10 discovered · 0 verified · 0 source-reviewed at page level · **10 blocked** · 0 not audited.
Sub-states not counted: More drawer, guest-count modal, modifier modal, cancel-dish modal, transfer/merge modal, quick-message modal, notifications modal, urgent-help alert, JAMAN AI modal.

## 4. What *is* known (source-level, grep + one navigation file)

These are not page audits; they are leads for the first rendered pass.

- **CAP-F1 (P2, confirmed in source):** native `window.confirm` guards *log out* (`CaptainHeader.tsx:236`), *end shift* (`CaptainShiftStatsView.tsx:154`) and *discard unsent order* (`CaptainTableWorkspaceModal.tsx:561,580`). The last two protect work in progress on a handheld; native dialogs there are small and unthemed. Packaged behaviour unverified.
- **SH-003 (suspected):** 14 `fixed inset-0` overlays, 4 `role="dialog"/aria-modal` matches in captain source.
- **SH-006:** 103 sub-12 px declarations.
- Positive (source): 38 `aria-label`s, `CaptainAttentionStrip` for urgent states, and upstream's `role="group"` + `aria-label` on table cards.
- `1 focus-visible` match against 13 `outline-none` → focus visibility risk (unverified).
- `captain/src/components/layout/CaptainNavigation.tsx` bottom nav: primary tabs with live count badges and an `isUrgent` flag for Food Ready; "More" collects KOTS, REQUESTS, SHIFT. Touch target sizes not measured.

## 5. Scores
**None.** No page was rendered or interacted with. Product score: **not assigned**.

## 6. Minimum next steps to audit Captain
1. Resolve the 6 conflicted files (user decision — local WIP vs upstream).
2. `npm install` so `qrcode`/`@tauri-apps/*` and the workspace plugin link resolve.
3. Provide an activated tablet + waiter PIN against a seeded restaurant.

## 7. Fix backlog (Captain only, provisional)
1. Resolve conflicts, keeping upstream's `role="group"`/`aria-label` on table cards (blocker).
2. CAP-F1 — replace 4 native confirms (S–M).
3. Rendered pass for touch targets, double-tap on "send to kitchen", Food Ready flow, offline indicator.

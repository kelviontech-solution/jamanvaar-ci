# 05 — KDS (Kitchen Display System) audit

Run 2, 2026-10-11. Current source rendered through an out-of-repo Vite config (see `10-blockers-and-coverage.md` §Method). Nothing in the repository was edited.

## 1. Purpose, personas, device

- **Users:** kitchen operator / chef / expediter on a wall- or counter-mounted display; during rush, gloves and wet hands are plausible (assumption — not stated in the repo).
- **Intended device:** landscape terminal. `index.html` locks zoom (`user-scalable=no`). A Tauri shell exists (`apps/restaurant-system/kds/src-tauri`).
- **Source:** `apps/restaurant-system/kds/src/App.tsx` (1,024 lines), `KdsTicketCard.tsx` (261), `KdsExpoBoard.tsx` (101), `kdsLogic.ts`.

## 2. Build / access status

| Check | Result |
|---|---|
| Starts from current source | **Yes**, only with two out-of-repo aliases (uninstalled `@tauri-apps/plugin-updater` stubbed; `@jamanvaar/tauri-plugin-apk-updater` pointed at its real in-repo source). Both are optional native-update paths and are not reached on the activation screen. |
| Authenticated session | **None available.** Board is behind activation key + staff PIN → BLOCKED. |
| Backend | Not running. |

## 3. Page inventory

| ID | Page | Route / entry | Status |
|---|---|---|---|
| KDS-001 | Terminal activation | `/` while device not activated | **VISUALLY VERIFIED + INTERACTION TESTED** (4 viewports) |
| KDS-002 | Staff PIN login | after activation (`App.tsx:715` second `JamanvaarAuthLayout`) | BLOCKED — needs an activated device |
| KDS-003 | Ticket board: ACTIVE / COOKING / READY / SERVED tabs | main workspace, `statusFilter` state | **SOURCE REVIEWED** (full read of card + board layout); not rendered |
| KDS-004 | Expo (Pass) board | `statusFilter === 'EXPO'` | **SOURCE REVIEWED**; not rendered |

Totals: 4 discovered · 1 visually verified/interaction tested · 2 source reviewed · 1 blocked · 0 not audited. The KDS has no URL routes; all views are in-memory state.

---

## 4. Page reports

### KDS-001 — Terminal activation

**Route / entry point:** `http://localhost:5179/` (device not activated)
**Audit status:** VISUALLY VERIFIED + INTERACTION TESTED (current source)
**Intended user:** whoever sets the display up once (installer/manager)
**Primary task:** enter the activation key from the Welcome Kit and connect this display
**Viewports tested:** 1366×768, 768×1024, 390×844, 1920×1080
**What works well**
- One field, one action, with a "Don't have an activation key?" box that explains where the key comes from.
- Label is bound (`htmlFor`), field is `required`, error uses `role="alert"`.
- No horizontal overflow at any of the four viewports; `<main>` and one `<h1>` present; zero console errors.
- Disabled "Activate Terminal" button until text is entered.

**Findings**
- **KDS-F1 (P2, confirmed — VISUAL + SOURCE):** entering a well-formed key while the backend is unreachable shows only **"Activation failed"**; the code collapses every non-`CloudApiError` into that string (`kds/src/App.tsx:168`). Restaurant Admin's equivalent screen says *"Unable to reach the server…"*. A kitchen installer cannot tell a typo from a network outage. Evidence: [bad-key 1366](evidence/kds/KDS-001-bad-key-submit-1366x768.png).
- **SH-004 (P2, confirmed — VISUAL + SOURCE):** the status pill reads **"Local Core: Connected"** although nothing is listening on the relay port. `kds/src/App.tsx:645` renders `JamanvaarAuthLayout` without `healthCheckUrl` or `isLocalCoreConnected`, so the layout's default shows green/"Connected". Evidence: [initial 1366](evidence/kds/KDS-001-initial-1366x768.png).
- **SH-007 (P2):** viewport meta disables pinch-zoom (`maximum-scale=1.0, user-scalable=no`).

**Interactions tested:** typed `JMV-AAAA-BBBB-CCCC` (not a real key) and pressed *Activate Terminal*; observed the error state; Tab traversal (focus ring visible on the input — see [tab-order](evidence/kds/KDS-001-tab-order-1366x768.png)).
**Unverified:** a successful activation, the welcome screen after activation, slow-network "activating…" state, double-submit while pending (button disables via `isActivating` per source, not observed).

| Visual | Usability | Interaction | Accessibility | Responsive | Consistency | **Weighted** | Confidence |
|---:|---:|---:|---:|---:|---:|---:|---|
| 8 | 7.5 | 6.5 | 7 | 8 | 8 | **7.4** | Medium |

Weights: usability 25 · visual 20 · interaction 20 · responsive 15 · accessibility 15 · consistency 5. Arithmetic: 0.25·7.5 + 0.20·8 + 0.20·6.5 + 0.15·8 + 0.15·7 + 0.05·8 = 7.43.
**Recommended changes:** (1) distinguish "cannot reach server" from "key rejected" in the catch; (2) pass the real Local Core state/health URL, or hide the pill on the activation screen.
**Do not change:** the single-field layout, help box copy, `role="alert"` error.
**Evidence:** `evidence/kds/KDS-001-*.png`; `log-pass1.json`, `log-pass2.json`.

---

### KDS-003 — Ticket board (ACTIVE / COOKING / READY / SERVED)

**Route / entry point:** after PIN login; `statusFilter` tabs at `App.tsx:915`
**Audit status:** SOURCE REVIEWED — **not rendered, not interaction tested**
**Intended user:** cook / expediter
**Primary task:** see what to cook next, mark dishes/tickets ready, hand off to service
**Viewports tested:** none (blocked). `.kds-grid`/`.kds-ticket` classes live in `index.css` and were not rendered.
**What works well (from code)**
- Honest connection bar: `role="alert"`, "Connection lost: new orders may be delayed" with *Retry now* (`App.tsx:824-845`) plus a LIVE/SLOW/OFFLINE pill.
- Ticket age bands (`ok/warn/late`) change border and chip colour **and** add an icon/text ("Late 12m"), so status is not colour-only.
- Cancelled tickets/dishes are loud: `role="alert"`, rose banner, "stop cooking this ticket", strikethrough, and require an explicit *Got it: dismiss*.
- Allergy text is detected and elevated visually and in text ("ALLERGY / DIET:").
- Recoverable actions: *Undo* beside "Served"/"Ready", global undo toast with `role="status"`.
- Dish rows are real `<button aria-pressed>` with descriptive `aria-label` ("2 Paneer Tikka: cooking, tap when ready"), `min-h-[52px]`.
- "To cook" summary strip aggregates quantities so a cook can batch.
- Search + sort (priority/FIFO) and a meaningful empty state ("All Kitchen Orders Cleared").

**Findings (all SOURCE, unverified at runtime)**
- **KDS-F2 (P3, suspected):** the elapsed-time chip — the single most time-critical datum — is `text-[11px]` (`KdsTicketCard.tsx:104`), and the KOT number is `text-[10px]`. For glance-reading at distance this is small relative to the 48 px action buttons. Needs rendering at the real display size/distance to confirm.
- **KDS-F2b (P3, suspected):** the per-ticket *priority* `<select>` and the *reprint* icon are `min-h-[40px]`, below the 48 px used for the primary action, and sit in the same row as the timer; accidental taps by a gloved hand are plausible. "All dishes ready" is a single tap (mitigated by *Undo*).
- **KDS-F3 (P4):** tabs use `role="tablist"/"tab"` with `aria-selected` but no `aria-controls`/`tabpanel` and no arrow-key handling — the semantics promise more than is delivered. Buttons would be fine.
- Header labels ("Cooking", "Ready", "Station:") are `hidden lg:inline`/`xl:flex`; on a 768 px tablet the operator sees counts without words. Unverified visually.

**Interactions tested:** none. **Unverified:** everything interactive, including incoming-ticket animation, sound alerts, multi-station filtering, many-item tickets, overflow at 768×1024.
**Scores:** *provisional — not scored.* Source quality is high; no rendering evidence exists.
**Recommended changes:** render at 1366×768 and 1920×1080 with seeded tickets before any visual change; consider enlarging the timer chip and raising the priority control to 48 px.
**Do not change:** connection bar, cancel handling, undo model, dish-level `aria-pressed` buttons, "To cook" strip.

### KDS-004 — Expo (Pass) board

**Audit status:** SOURCE REVIEWED (`KdsExpoBoard.tsx`, 101 lines) — not rendered.
**What works well:** per-order progress bar with text ("3 of 5 ready · 60 %"), "Waiting on Grill (…)" line, button disabled until everything is ready, and a clear empty state. When a Captain app handles service, the button is replaced by an explanatory non-button ("All ready: waiting for captain") — avoids a dead control.
**Findings:** (P4) station tag/course labels are `text-[10px]`; progress caption `text-[11px]`. Disabled "Not everything is ready yet" uses `text-slate-400` on `bg-slate-100` (≈2.4:1 calculated) — disabled controls are exempt from 1.4.3 but this is also the *only* explanation text. Unverified visually.
**Scores:** not scored. **Confidence:** Low.

### KDS-002 — Staff PIN login — BLOCKED

Needs an activated terminal and staff directory from the backend. Not inspected.

---

## 5. Responsive results
Only KDS-001 rendered. No overflow at 390/768/1366/1920. Board responsiveness unverified — see KDS-003.

## 6. Accessibility results
- Confirmed (KDS-001): visible focus on input; labelled field; alert role on error; zoom disabled (SH-007).
- Source-level positives on the board: `aria-pressed` buttons, labelled search/sort/priority, `role="status"` undo.
- Not tested: contrast on rendered board, screen-reader output, keyboard-only operation of the board, reduced motion (no `prefers-reduced-motion` in KDS source; `animate-pulse` is used on late/cancelled chips).

## 7. Application scorecard

| Metric | Value |
|---|---|
| Pages with enough evidence to score | 1 (KDS-001) → 7.4 |
| Visually verified | 1 / 4 |
| Interaction tested | 1 / 4 |
| Source reviewed only | 2 / 4 |
| Blocked | 1 / 4 |
| Not audited | 0 / 4 |
| Product score | **Not assigned** (one page) |

## 8. Fix backlog (KDS only)
1. KDS-F1 / SH-004 — error and status honesty on activation (S).
2. KDS-F2 / F2b — verify and, if confirmed, enlarge timer chip, raise priority/reprint targets (S).
3. SH-007 — decide on zoom lock (XS).
4. KDS-F3 — tab semantics (XS).

Recommended order: 1 → 3 → 2 → 4, **after** a rendered pass of KDS-003/004 with seeded tickets.

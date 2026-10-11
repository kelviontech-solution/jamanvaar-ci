# UI/UX implementation — summary (run 2026-10-11)

Inputs: `docs/reports/ui-ux-audit-2026-10-11/run-2-per-app/` (00–11). The earlier run-1 report was built on stale `dist` output and was used only as background. Every finding below was re-checked against the current source before changing code.

## Outcome in one paragraph
The build blockers are cleared, the shared dialog/feedback/status foundations are fixed once and consumed by every app, native `alert/confirm/prompt` calls that could block an operational flow were replaced, a small Settings design language (header · tabs · section · field · feedback · save status) exists in `packages/ui` and is applied to the Restaurant Admin and POS Settings screens, and the Super Admin got the same dialog behaviour and message quality. **All 242 test files / 1,796 tests pass, all 7 apps type-check, and all 7 production builds succeed.** Authenticated screens other than the Settings screens I could render in a harness remain unverified in a browser (no backend, no accounts).

## What changed, by priority

| Priority | Change | Findings | Status |
|---|---|---|---|
| P0 | Resolved the 6 Captain merge conflicts (10 hunks) keeping upstream behaviour/a11y and your local style tokens; restored the committed `package-lock.json`; installed the 7 declared-but-missing packages with `--no-save --no-package-lock` | ENV-001, ENV-002 | Done |
| P1 | Shared `Modal`: focus in/trap/restore, labelled title and close, top-most-only Escape (`useDialogFocus`) | SH-001, SH-002 | Done, browser-verified |
| P1 | Kiosk `alert()` → inline, localised (7 languages) errors; modifier validation shown in the sheet footer | UX-001 | Done (source + type-check; guest flow not rendered) |
| P2 | Honest "Local Core" badge (POS/KDS activation pass state; layout shows nothing when it has no signal) | SH-004 | Done, browser-verified |
| P2 | Failure copy: activation (POS/KDS/Captain/Admin) and Admin sign-in no longer say "Activation failed" or show `TypeError: Failed to fetch` | POS-F1, KDS-F1, ADMIN-F1 | Done, browser-verified |
| P2 | Native confirms/prompts → in-app `useConfirm` (POS 9 sites, Captain 4, Admin native-only 17, shared 2) and `useAdminConfirm` (Super Admin 8, incl. password prompt that echoed plain text) | ADMIN-F2, POS-F2, CAP-F1 | Done |
| P2 | Contrast: muted text `#8C9BAE`→`#52677A` (21 uses), `Button` accent white-on-`#BF540F` (4.7:1) | SH-005, KIOSK-F2 | Partial (see 11) |
| P2 | Viewport: Restaurant Admin allows pinch-zoom; POS invalid `user-select` token removed | SH-007 | Partial (terminals keep their lock) |
| P2 | Settings design language + adoption (Admin Settings tab, POS Settings) | new requirement | Done for 2 apps; matrix in `01` |
| P3 | Super Admin dialogs: semantics + shared focus behaviour (`Modal`, `ModalShell` on 8 pages; the Payouts overlay already had dialog roles) | SH-003, A11Y-007 | Done |
| P3 | KDS timer chip 13 px, priority/reprint 44 px; KOT chip contrast | KDS-F2 | Done (modest, density kept) |
| P3 | QR guest: retry shows "Trying again…" and "Still not connected" note; table number labelled | QR-F1, QR-F2 | Done in source (not re-rendered) |
| P3 | Toast region is a polite live region; "Pair" target ≥24 px; "Port 4000" copy removed from Super Admin login/badge | SH-013, SH-008, SH-010 | Done |

## Verification at a glance
| Check | Result |
|---|---|
| Full vitest | **242 / 242 files, 1,796 / 1,796 tests pass** (baseline after install: 239/241 with 4 timeouts under load) |
| New tests | `tests/ui_dialog_and_settings_primitives.test.tsx` — 10 tests (focus, Escape stacking, confirm/prompt/notify, tabs, feedback roles, save bar, field wiring) |
| TypeScript (`tsc --noEmit`) | pos, pos-admin, captain, kds, kiosk-user, qr-guest, super-admin-web: 0 errors |
| Production build (`vite build`, scratch output) | 7 / 7 succeed |
| Real-browser checks | Admin Settings, POS Settings, dialogs, activation/sign-in failure copy, honest badge, Captain now renders — `evidence/` |

## What is not done / not verified
See `11-remaining-issues.md`. Highlights: authenticated workspaces were not rendered (no backend/accounts); POS and Captain hand-rolled overlays (52) were not migrated to the shared dialog; global sub-12 px text and raw-hex tokens were deliberately not mass-migrated; the Super Admin dark-theme logo needs a new asset; terminals still lock zoom pending your decision.

## Things you should know
- The Captain conflict resolution **keeps upstream's behaviour** (customer attach, `sendBill`, QR inbox, `role="group"`) and applies your local style tokens (`rounded-2xl`, `font-bold`, `shadow-md`) on top. `stash@{0}` (the autostash) is still present; I did not drop it.
- The restored lockfile is the committed one; your local lockfile edits were discarded because they conflicted and were not authored by you (install side-effects).
- `npm install --no-save` removed 88 extraneous `node_modules` packages and re-linked workspaces; `package.json` files are untouched.
- Behaviour change: cancelling the POS "decline QR order" dialog now cancels the decline (the native prompt used to decline anyway).
- Behaviour change: QR-admin "Cancel order" and "Void bill" now require a non-empty reason in the dialog (they already aborted on empty).

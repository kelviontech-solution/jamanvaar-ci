# 06 — Captain changes

Theme preserved. The app was **BLOCKED** in the audit by merge conflicts; this run resolved them first.

## Conflict resolution (6 files, 10 hunks)
Rule applied to every hunk: keep **upstream behaviour and accessibility**; re-apply only the **style tokens** your local work-in-progress had introduced (`rounded-3xl→rounded-2xl`, `font-black→font-bold`, `shadow-2xl→shadow-md`, bottom padding).

| File | Hunks | Result |
|---|---|---|
| `assistant/CaptainJamanAiModal.tsx` | 2 | upstream (JAMAN AI access handled by shared `JamanAiAccessNotice`; your inline LOCKED block was redundant and called hooks after an early return); `role="dialog"`/`aria-label` kept; `shadow-md` applied |
| `food-ready/CaptainFoodReadyView.tsx` | 1 | upstream search-aware empty message; `font-bold` |
| `kots/CaptainLiveKotsView.tsx` | 3 | upstream (`data-testid`, wrapping header, modifiers + notes shown — your version truncated and dropped them); `rounded-2xl`, `font-bold` |
| `requests/CaptainGuestRequestsView.tsx` | 1 | upstream `QrServiceInbox` **and** your `pb-16 md:pb-6` |
| `tables/CaptainTableCard.tsx` | 1 | upstream `role="group"` + `aria-label` with `rounded-2xl` |
| `tables/CaptainTableWorkspaceModal.tsx` | 2 | upstream (attach guest, `sendBill`, financial summary customer chip); `font-bold` |
| `package-lock.json` | 4 | committed lockfile restored (local hunks were install artefacts) |

One auto-merged file also had a duplicate `aria-label` (JSX error) — `CaptainTransferMergeModal.tsx` kept the descriptive "Close transfer or merge".
All files were staged (`git add`) so `git status` no longer shows unmerged paths; nothing was committed.

## UX changes
| Finding | Files | Before → after | Verification | Status |
|---|---|---|---|---|
| CAP-F1 native confirms (4) | `CaptainHeader.tsx`, `CaptainShiftStatsView.tsx`, `CaptainTableWorkspaceModal.tsx` ×2 | log-out, end-shift, discard unsent order, free table → in-app dialogs naming the consequence; "Free table" warns about the unpaid amount | typecheck + suite; not rendered past activation | Resolved (source) |
| Activation failure copy | `src/App.tsx` | "Activation failed. Please verify the key." → "Could not complete activation. Check this device's internet connection and that the key is correct, then try again." | rendered bad-key submit, 1366 and 390 | Resolved |
| Captain now builds | — | — | tsc 0 errors, `vite build` ok, activation renders | Resolved |

Not done: touch-target audit, synchronisation indicator review, 14 hand-rolled overlays (suspected), authenticated flows (no tablet/PIN).
Evidence: `evidence/captain/*`.

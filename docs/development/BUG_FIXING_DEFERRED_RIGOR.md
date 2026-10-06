# Deferred rigor — revisit in free time

Not bugs. This is a note-to-self about *how* the remaining `BUG_LIST_2.md` entries are being
fixed, so nothing done at the faster pace gets silently mistaken for having had the full
treatment.

## What changed and why

Fixing every bug in `BUG_LIST_2.md` with full rigor (repo-wide pattern search + new regression
test + multi-app `tsc` + a long BUG_LIST_2.md write-up, every time) was taking too long — flagged
by the user directly. Agreed approach going forward:

- **🔴 bugs (money/security/data-integrity)**: unchanged, full rigor as before — real regression
  test, repo-wide search for the same pattern elsewhere, `tsc --noEmit` on every affected app,
  full write-up in `BUG_LIST_2.md`.
- **🟡/🟢 bugs (cosmetic/UI/low-risk)**: fix, quick sanity check (read the code path, maybe one
  spot-check), a short one-line `BUG_LIST_2.md` entry. No new dedicated test file, no repo-wide
  sweep for duplicates, no per-bug multi-app typecheck (batched instead, periodically).
- `tsc`/`vitest` are run in batches across several fixes instead of after every single edit.

## To do later, at full rigor, once the list is cleared at the faster pace

For every 🟡/🟢 bug fixed under the faster pass above, it's worth going back once time allows and:

1. Re-checking whether the same defect pattern exists elsewhere in the repo (the faster pass
   skipped this — B2-036's real scope (16 sites, not 1) and B2-019's actual root cause were only
   found because this step wasn't skipped for those).
2. Adding a real regression test for anything that isn't purely visual (state bugs, validation
   bugs, anything with logic — not "a label says the wrong word").
3. Running a full `tsc --noEmit` pass across every app once, to catch anything a narrow per-fix
   check missed.
4. Expanding any one-line `BUG_LIST_2.md` entries written under time pressure into the fuller
   root-cause + verification format the 🔴 bugs already have, if any of them turn out to matter
   more than they looked at the time.

This file itself can be deleted once that follow-up pass happens (or once the user decides it's
not needed) — it's a reminder, not a permanent project artifact.

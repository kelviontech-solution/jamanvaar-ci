# Session handoff — bug-fixing pass on BUG_LIST_2.md — COMPLETE

Updated 2026-09-24. Every entry in `BUG_LIST_2.md` has now been fixed, verified-already-fixed, or
reviewed with a concrete, reasoned justification for why it's left as-is. Nothing remains deferred
purely for lack of time.

## What changed since the last version of this file

The previous version of this file listed **3 bugs deliberately not code-changed** (B2-017, B2-049,
B2-054), each justified as "too big for this pass". The user pushed back — "what about remaining
3, if they are genuine bugs then fix them" — and re-examining each one found that two of the three
had been **misdiagnosed as needing more architecture than they actually did**:

- **B2-054** (restaurant identity not synced): built the real fix. A device-token-authenticated
  `GET`/`PATCH /devices/me/restaurant` on the existing `DeviceHeartbeatController`, a shared
  `pullRestaurantIdentity()`/`pushRestaurantIdentity()` in `packages/sync`, wired into all 6
  terminal apps' existing sync loops, and reusing the already-correct
  `RestaurantIdentityRepository.syncProfile()` merge logic. No new product decision was actually
  needed — the earlier pass's own reasoning for *why* it was safe (plain text fields, no financial
  recalculation hazard) was right, it just hadn't been built yet.
- **B2-017** (business day mismatch across screens): the original write-up concluded this needed a
  new `BUSINESS_DAY` cross-device sync entity type plus a product decision on reconciling a stale
  device's own open day. Re-tracing the actual code paths found that was solving the wrong
  problem: `BusinessDayRepository.getCanonicalBusinessDate()` computed the 5 AM cutoff from the
  *device's own* system clock/timezone instead of the restaurant's (Asia/Kolkata), and a separate,
  independent `BusinessDayAccountingService.getActiveBusinessDay()` — the one Restaurant Admin's
  Dashboard/Billing/Payments actually call — had no cutoff-rollover logic at all, so a device that
  never itself creates an order could never advance its own "today" past midnight. Fixed both
  (one timezone fix, one delegation to remove the duplicate implementation) — no sync architecture
  needed, because once every device computes the same business day for the same real-world moment
  there's nothing left to reconcile.
- **B2-049** (duplicate restaurant name/email; suspended-account password signal): the two
  underlying policy questions (should owner email be unique across restaurants; should a suspended
  account's correct password be distinguishable from a wrong one) are still genuinely
  product/security trade-off calls, not implementation bugs — re-reviewed and confirmed, not
  reflexively re-deferred. But one concrete, practical *consequence* of the name-duplication policy
  — Super Admin's own Activation Key Generate dialog listing two identically-named restaurants with
  no way to tell them apart — was narrowly and safely fixable without touching the policy at all,
  and is now fixed.

## Established fixing pattern (for the next pass, on anything new)

1. Read the bug entry in full. Don't trust "confirmed live" as still-true without checking the
   current code.
2. Find root cause by reading source, not guessing — and don't stop at the first plausible-sounding
   architectural explanation. This pass's own biggest lesson: B2-017's first pass correctly found
   *a* real issue (per-device stores) but stopped before finding the *actual* mechanism (two
   independent, inconsistent "what's the active business day" implementations, one of them not
   timezone-safe) — which was a much smaller, safer fix than the sync architecture first proposed.
   Before concluding something "needs new sync infrastructure" or "needs a product decision",
   trace every call site of the relevant function(s) and check whether they actually agree with
   each other.
3. Prefer one shared utility/pattern over a one-off fix. Reuse existing, already-correct code
   (`RestaurantIdentityRepository.syncProfile()`, `formatRestaurantDate`/`Intl.DateTimeFormat`
   patterns) instead of writing a parallel implementation.
4. Before adding a validation guard, run the *existing* test suite for that area first, not after.
5. Match rigor to severity: full test + repo sweep + multi-app typecheck + long write-up for 🔴
   bugs; fix + quick sanity check + one-line entry for pure 🟡/🟢 cosmetic ones. See
   `BUG_FIXING_DEFERRED_RIGOR.md` (repo root) for what got the fast pass during the main sweep.
6. `tsc --noEmit` on every affected app/package, always. Run the *full* root test suite after a
   change to a low-level shared package (`packages/database`, `packages/utils`, `packages/sync`) —
   this pass's B2-017 fix broke one unrelated test (`db_persistence_batching.test.ts`, an
   `Intl.DateTimeFormat`-throws-on-invalid-date edge case the old raw `Date` getters tolerated
   silently) that a narrower test run would have missed.
7. Mark the heading (`✅ **FIXED`, `✅ **PARTIALLY FIXED`, `✅ **VERIFIED FIXED`, or `🔍 **REVIEWED`/
   `📋 **SUMMARY**` for a cross-reference), add the write-up sections, move on.

## Environment notes carried forward

- **Windows orphaned `node.exe` processes**: stopping a background `dev:all`/`vitest` task via
  TaskStop does not reliably kill its child processes on this host — saved in persistent memory
  (`windows-orphaned-dev-processes`). Clean up by matching narrowly on `CommandLine` (via
  `Get-CimInstance Win32_Process`) for `vitest|tinypool`, never by `StartTime` — `nest --watch`
  respawns its compiled child with a new, later start time on every reload, so a "kill anything
  newer than X" cutoff will eventually catch the live API by mistake. Always `curl` a real endpoint
  immediately after any cleanup.
- Dev servers: `npm run dev:all` from repo root (API :4000 + all frontends). DB: Postgres `pos`,
  migrations current (37/37 applied, confirmed live for B2-004's fix).
- `BUG_FIXING_DEFERRED_RIGOR.md` (repo root) lists exactly which 🟡/🟢 fixes in the main sweep got
  the fast treatment (no dedicated test, no repo-wide duplicate-pattern sweep) and what a follow-up
  hardening pass should double back on, if one is ever wanted. Not urgent.

This file can be deleted once read — it's a resume pointer, not a permanent project artifact.

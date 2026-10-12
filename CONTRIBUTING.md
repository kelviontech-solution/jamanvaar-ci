# Contributing to JAMANVAAR

This file captures the working process that produced the most load-bearing fixes in this codebase
(order-sync's connection-pool-exhaustion fix, the report engine's unbounded-scan fix — see
`docs/reports/robustness-scalability-audit-2026-10-11/`), written down so it's a team habit rather
than something that only happens when someone remembers to do it.

## Prove it before you fix it

Before writing a fix, reproduce the problem. Before claiming a fix works, prove it with a test that
failed against the old code and passes against the new one.

Concretely, for a concurrency/performance bug:
1. Write a test that exercises the real scenario (real database, real transaction, not a mock of
   the thing you're trying to prove).
2. Run it against the **unfixed** code. If it passes, your understanding of the bug is wrong — stop
   and re-diagnose, don't patch around a theory that didn't reproduce anything.
3. Fix it. Re-run the same test — now it should pass.
4. Run it 3-5 times, not once. A fix that's clean once and fails intermittently isn't fixed —
   `test/order-sync-load.e2e.spec.ts`'s bug reproduced 3 times out of 4 runs; a single clean run
   would have looked like a fix that wasn't one.

For a bug that isn't fully fixed by code (an architectural ceiling, a scalability number): say so.
"This makes it fail gracefully, not fail less often" is a real, useful distinction — collapsing it
into "fixed" misleads the next person who reads the commit.

## Never claim a number you didn't measure

"Handles 1,000 concurrent users" is a claim. It's either backed by a test that generated that load
against a real database and recorded the result, or it's a guess wearing a number's clothes. If you
haven't measured something, say `NOT MEASURED` or `BLOCKED BY ENVIRONMENT` and name exactly what
measuring it would require — don't round up to sound more finished than the evidence supports.

If your own test harness might be the bottleneck (a single local process opening hundreds of raw
connections at once is not the same as real client traffic), check that before trusting the number.
Isolate it — send the same load in waves instead of one burst, watch CPU/connections while it runs —
before concluding the *application* is the thing that broke.

## Small, reviewable, together with their test

A task is "done" when: the test that proves it exists and passed in this session, `tsc`/the build is
clean, and the relevant test suite (not just the new test) is green. A diff without its own test
proving the claim isn't done, regardless of how confident it looks.

Prefer fixing the smallest thing that's actually broken over rewriting the architecture around it.
`OrderSyncAdmission`'s fix was ~60 lines added to one file plus a default tied to an existing config
value — not a new queue, not a new dependency, because nothing measured yet justified either.

## Record the judgment calls, not just the code

When a decision could reasonably have gone another way — a plan was ambiguous, two reasonable fixes
existed, a finding was severe enough to act on but not severe enough to block everything else — write
down what you decided and why, next to the work, not just in your own head. A short note (what you
chose, why, what it costs if you're wrong) is cheap; re-deriving the same judgment call a month later,
or silently reversing a decision nobody remembers making, isn't.

## Say what's still open

A fix for one input class doesn't mean every sibling input class was checked. If you fixed
order-sync's admission control and didn't check every other write path, say exactly that — "checked
inventory-ledger and payment webhooks, neither needed it because X" is a complete, honest answer, and
very different from silence that reads as "everywhere is now fine."

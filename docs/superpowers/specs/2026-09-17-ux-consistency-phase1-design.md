# UX Consistency Phase 1: Token-First Visual/Interaction Consistency

**Date:** 2026-09-17
**Status:** Approved, pending implementation plan
**Author:** Claude (JAMANVAAR remediation session), approved by user

## Context

Following a QA-audit-driven remediation session that fixed data-integrity and
connectivity bugs across all 7 JAMANVAAR apps (see
`FULL_ECOSYSTEM_QA_AUDIT_REPORT.md` and `PLATFORM_STATUS_AND_ROADMAP.md`), the
user asked for the platform's day-to-day *experience* to improve — described
as wanting it to be "easy and smooth to use." That work was explicitly out of
scope for the prior session (which fixed correctness, not polish).

The user chose a broad, lighter-touch approach: a consistency pass across all
7 apps rather than deep rework of one. Four work-streams were identified as
mattering most: reduced clicks for common tasks, visual/interaction
consistency, mobile/responsive layout, and onboarding/guidance. Given the
combined scope (7 apps × 4 streams) is too large for a single spec, the work
is being decomposed into phases, one work-stream at a time, applied
consistently across all 7 apps per phase. **This spec covers Phase 1 only:
visual/interaction consistency.** Phases 2–4 (click-reduction, responsive
layout, onboarding) will each get their own brainstorm → spec → plan cycle
when reached.

## Investigation findings (informs the approach)

A codebase audit (not assumption) found the infrastructure for consistency
already exists but is unused:

- `packages/ui` is a real, ~5,000-line, 23-component shared library
  (`Button`, `Card`-equivalents, `Modal`, `StatusBadge`, `KpiCard`,
  `EmptyState`/`LoadingState`/`ErrorState`/`OfflineBanner`, etc.). Components
  are genuinely reusable (accept `className`/`variant`/`size` props).
- 6 of 7 apps' `tailwind.config.js` files define an identical (or near-identical)
  `theme.extend.colors.jaman` palette (`navy: #0B253A`, `saffron: #E66817`,
  `ivory: #FBF9F5`, `teal: #00A99D`, `border: #EBE6DD`, plus deeper variants
  in 5 of 7). Grepping actual usage of `bg-jaman-*`/`text-jaman-*`/`border-jaman-*`
  across all 7 apps returns **zero hits everywhere** — every app instead uses
  raw arbitrary-hex Tailwind utilities (`bg-[#0B253A]`) at volumes of:
  pos-admin ~2,515, pos ~1,790, kiosk-admin ~1,183, captain ~470,
  kiosk-user ~390, kds ~58. The tokens are configured but dead.
- `packages/ui`'s shared `EmptyState`/`LoadingState`/`ErrorState` components
  are used meaningfully by only 2 of 7 apps (kiosk-admin: 5 refs, kiosk-user:
  3 refs). pos-admin, pos, captain, and kds have **zero** references — they
  hand-roll their own ad hoc empty/error UI inline instead.
- Super Admin (`cloud/super-admin-web`) never imports `@jamanvaar/ui` at all.
  It has a completely separate, structurally different component system:
  `src/components/ui.tsx` (415 lines, BEM-style CSS classes via `ui.css`,
  not Tailwind arbitrary values) with its own `Button`, `Card`, `Badge`,
  `EmptyState`, `Modal`, etc.
- Each app has its own independent `index.css`/`styles.css` duplicating the
  same base font (`Plus Jakarta Sans`) and re-hardcoding the same brand hex
  values as plain CSS, rather than importing from any shared location.

Conclusion: this is closer to "wire up what's already there and stop the
drift" than "build a design system from scratch." The chosen approach
reflects that.

## Approach: token-first, incremental (chosen over full consolidation or
cosmetic-only patching)

Two alternatives were presented and rejected:
- **Full consolidation** — migrate all 7 apps (including Super Admin's
  structurally different BEM/CSS system) onto one canonical package. Rejected
  as too large for "a lighter pass" and conflicting with the user's stated
  preference for breadth over depth in this phase.
- **Cosmetic-only patch** — fix visibly inconsistent spacing/sizing app by app
  without touching tokens or the shared library. Rejected because it doesn't
  address the root cause (dead tokens, 4 apps hand-rolling state components)
  and the same drift would recur on every future change.

## Scope: three workstreams

### 1. Wire color tokens into real use
Replace raw arbitrary-hex Tailwind classes with the already-configured
`jaman-*` token classes, app by app, for the 6 apps that already have the
palette in their Tailwind config (pos-admin, pos, captain, kds, kiosk-admin,
kiosk-user). This is a **mechanical, same-value substitution**
(`bg-[#0B253A]` → `bg-jaman-navy`, `text-[#E66817]` → `text-jaman-saffron`,
etc.) — the rendered color does not change, only its source. Executed via a
scripted find/replace per app driven by an explicit hex→token mapping table
(built from each app's own `tailwind.config.js`), not manual edits, given the
volume (thousands of occurrences). Any hex value encountered that is *close
to* but not exactly equal to a token value must be flagged, not silently
normalized — that's a real (if small) color decision, not a refactor.

Each app's own `index.css`/`styles.css` base rules (font, body background,
resets) get the same treatment where they hardcode brand hex directly.

### 2. Consolidate empty/loading/error states
For pos-admin, pos, captain, and kds — the four apps with zero references to
`packages/ui`'s `EmptyState`/`LoadingState`/`ErrorState`/`OfflineBanner` —
find each hand-rolled instance (ad hoc "No orders yet" / "No data" style
conditional JSX) and replace it with the shared component, **preserving the
existing copy and any action buttons exactly** — this is a component-source
swap, not a rewrite of what each screen says. kiosk-admin and kiosk-user
already use the shared components in a few places; extend that to their
remaining hand-rolled instances too, if any are found.

### 3. Super Admin visual alignment (no code migration)
Per the approved scope, Super Admin's `ui.tsx`/`ui.css` stays its own
implementation. Adjust its color values, spacing scale, corner radii, and
empty-state visual pattern (icon + message + optional action, matching the
shared components' look) so it *feels* like the same product without
merging codebases. This is the smallest, most judgment-based workstream —
visual matching by inspection, not a mechanical script.

## Explicitly out of scope for Phase 1
No layout changes. No new features or components beyond what's needed to
close a gap found during migration. No click-count/flow changes. No
mobile/responsive fixes. No onboarding changes. No redesign — the rendered
output of workstreams 1–2 should be visually identical to today; only its
source changes. Workstream 3 is the only place a human visual judgment call
is made, and it should read as "matching," not "redesigned."

## Verification plan
- `tsc --noEmit` clean on all 7 apps after each app's token-replacement pass.
- Full `npx vitest run` at repo root stays at the established 398/398 baseline
  (this work is frontend-only; `cloud/api`'s suite is unaffected and does not
  need re-running unless something unexpected touches it).
- Since workstreams 1–2 are refactors with an explicit "same visual output"
  invariant, any deviation found during implementation (a near-but-not-exact
  hex match, a hand-rolled empty state whose copy/actions don't map cleanly
  onto the shared component's prop shape) must be surfaced as a decision
  point, not resolved silently.

## Rollout order
1. Token wiring (workstream 1) — mechanical, highest volume, lowest judgment
   risk. All 6 Tailwind-based apps.
2. Empty/loading/error consolidation (workstream 2) — moderate risk, four
   apps, done one app at a time so each can be verified independently.
3. Super Admin visual alignment (workstream 3) — smallest scope, most
   judgment-based, done last since it benefits from the token vocabulary
   established in step 1 as a reference point.

## Open items carried forward (not blocking this phase)
- Phases 2–4 (click-reduction, mobile/responsive, onboarding) are deliberately
  not scoped here — each needs its own brainstorm when reached.
- Two items already flagged as open in `PLATFORM_STATUS_AND_ROADMAP.md` §2
  (QR Ordering → Super Admin reporting gap; pos-admin refund/void
  authentication gap) are unrelated to this phase and untouched by it.

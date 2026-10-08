# CI-Based Build Pipeline for Desktop Installers — Design

**Supersedes the build *mechanism* (not the scaffolding) for the remaining apps in Sub-project 1 of the
APK/EXE distribution effort**, and absorbs what was going to be Sub-project 2's Android/CI work into the same
pipeline — one CI system covering both platforms, rather than two built separately.

## Context

Sub-project 1's original plan (`docs/superpowers/plans/2026-10-07-desktop-installers-sixapps.md`) assumed all
six apps' `.exe` installers could be built directly on this machine. Two of five remaining desktop builds
succeeded that way (POS, Restaurant Admin). The third (Kiosk) failed, confirmed via `Get-MpComputerStatus` and
the Device Guard CI policy state to be **Windows Smart App Control**, which is `On` and enforcing on this
machine: it nondeterministically blocks execution of freshly compiled, unsigned Rust build-script binaries
(`os error 4551`), hitting a different crate on each retry. Captain and KDS (brand-new `src-tauri/` target
directories, never built before) are at the same risk. Smart App Control cannot be turned off here without a
full Windows reset once it's genuinely "On" (not "Evaluation") — not something to attempt as a side effect of
a build task.

GitHub Actions runners have no such restriction and no state carried over between runs, so moving the actual
build+smoke-test step there removes the blocker entirely, for every app, permanently (not just this one
machine, this one time).

## Goal

A single GitHub Actions workflow that builds and smoke-tests a Windows `.exe` installer for all five
Tauri-wrapped desktop apps (POS, Restaurant Admin, Kiosk, Captain, KDS) on a clean `windows-latest` runner,
triggered on demand, with each installer downloadable as a workflow artifact.

## Scope

**In scope:**
- One new file: `.github/workflows/build-installers.yml`.
- A `workflow_dispatch` (manual) trigger — these builds are slow (cold Rust compiles) and not yet needed on
  every push.
- A matrix job across the five desktop apps, each doing: `npm ci` (once, before the matrix, in a separate
  setup consideration — see Workflow Design), then per-app `npm run build` → `npx @tauri-apps/cli build`,
  identical commands to the local plan's tasks.
- A smoke-test step per app: launch the produced binary, confirm a real window with the expected title opens,
  matching the local plan's verification bar (not just "the build exited 0").
- `actions/upload-artifact` for each app's `.exe`, downloadable from the Actions run page.
- Captain and KDS's new `src-tauri/` scaffolding (the actual Rust/Tauri config files) is still created
  **locally**, exactly as the existing plan's Tasks 4–5 describe step-by-step — only the *build and
  smoke-test* step moves into this workflow. Scaffolding is inert file creation; it was never the thing Smart
  App Control blocked.

**Out of scope (deliberately):**
- Code-signing — same reason as the original spec: a real but separate concern, not a blocker to a working
  unsigned installer today.
- The Android build job — Sub-project 2 proper (needs a signing-keystore decision first). This workflow file
  gets a second job added when that's designed; it is not stubbed out now with placeholder content.
- Wiring these artifacts into the in-app download page (Sub-project 4) — still needs real server-side hosting
  (Sub-project 3) first. A GitHub Actions artifact is not a stable public download URL.
- Running this workflow automatically on every push — `workflow_dispatch` only, for now.

## Workflow Design

**Trigger:** `workflow_dispatch`, no inputs needed (it always builds all five apps).

**Job structure:** one job, `build-desktop`, `runs-on: windows-latest`, with a `strategy.matrix.app` listing
the five apps' directory paths and expected binary names/window titles (matrix include list, since each app
has a different relative path, binary name, and expected window title — not a simple string list). Using one
matrixed job (rather than five hand-written near-duplicate jobs) keeps the workflow DRY and means adding a
sixth desktop app later is one matrix row, not a copy-pasted job block.

Each matrix entry carries: `name` (for display), `path` (relative to repo root), `binary` (the raw `.exe`
filename under `target/release/`), `title` (the expected `MainWindowTitle` substring).

**Steps (per matrix entry):**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 20, matching this repo's engines)
3. `dtolnay/rust-toolchain@stable` with `targets: x86_64-pc-windows-msvc`
4. `npm ci` at the repo root (installs the whole workspace once; Tauri CLI is a workspace devDependency)
5. `npm run build` inside `${{ matrix.app.path }}`
6. `npx --yes @tauri-apps/cli@2.11.4 build`, with `working-directory: ${{ matrix.app.path }}` set at the step
   level (the app's own root, same as the local plan's commands — not its `src-tauri` subfolder, which the
   Tauri CLI locates relative to cwd on its own).
7. Smoke test (PowerShell step): `Start-Process` the produced binary, sleep, check `MainWindowTitle` contains
   `${{ matrix.app.title }}`, then `Stop-Process`. **Fallback documented, not yet needed**: if GitHub's Windows
   runners turn out not to surface `MainWindowTitle` the same way a local interactive session does (untested
   from this sandbox — the plan's own task will discover this empirically on the first real run), the
   fallback pass criterion is "process started, stayed alive for 10 seconds without exiting, and was then
   killed cleanly" — a weaker but still real check, not a rubber stamp of exit-code-0.
8. `actions/upload-artifact@v4`, name `${{ matrix.app.name }}-installer`, path the NSIS `.exe` under
   `**/bundle/nsis/*.exe` relative to that app's `src-tauri`.

**Why one job with a matrix, not five jobs:** every app runs the identical sequence of steps with only path/
name values differing — exactly what a build matrix is for. Five separate job blocks would repeat the same
seven steps five times with no behavioral difference, which is the kind of duplication the matrix exists to
remove.

## Verification

Trigger the workflow for real (`gh workflow run` or the Actions tab), watch it run to completion, confirm all
five matrix legs pass, and confirm five separate downloadable artifacts appear on the run's summary page —
not just that the YAML parses or that a local `act`-style dry run succeeds, since the whole point is proving
the real GitHub-hosted runner builds and smoke-tests cleanly.

## Review Focus

- **`npm ci` at the repo root vs. per-app** — this is an npm workspaces monorepo (confirmed from this
  session's earlier work: `packages/*`, `apps/*`), so dependencies must be installed once at the root, not
  per matrix leg (installing per-app would either fail against workspace-protocol dependencies like
  `"@jamanvaar/ui": "*"` or silently duplicate installs five times, wasting CI minutes). The workflow step
  list above installs once at the repo root before the matrix's app-specific build steps run.
- **Matrix legs running in parallel hitting Smart App Control's *absence* differently** — not a risk (each
  GitHub-hosted runner is an isolated, freshly provisioned VM with no Smart App Control at all), but worth
  confirming on the first real run rather than assumed, since it's the entire premise of this redesign.
- **A matrix leg's `MainWindowTitle` check behaving differently on a headless-feeling CI desktop session** —
  called out explicitly above with a documented, real (not rubber-stamp) fallback criterion, so a worker
  hitting this doesn't invent an ad hoc weaker check on the spot.
- **Captain/KDS's `src-tauri` scaffolding must exist in the committed tree before this workflow can build
  them** — the workflow checks out the repository as committed; if Captain/KDS's new `src-tauri/` folders
  (Tasks 4–5 of the existing local plan) aren't committed and pushed yet when this workflow runs, those two
  matrix legs fail with "no such directory," which would look like a CI misconfiguration rather than the real
  cause (missing committed files). The implementation plan sequences scaffolding-and-commit before the first
  real workflow trigger.

# CI-Based Build Pipeline for Desktop Installers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Standing instruction for this plan: NO SUBAGENTS.** Execute natively, in-session — this is a repo-wide standing instruction for all JAMANVAAR work this session.

**Goal:** A GitHub Actions workflow that builds and smoke-tests a Windows `.exe` installer for all five Tauri-wrapped desktop apps (POS, Restaurant Admin, Kiosk, Captain, KDS) on a clean runner, proven by an actual triggered run — replacing local builds that Windows Smart App Control blocked on this machine for Kiosk (and would likely also block for Captain/KDS).

**Architecture:** One new workflow file (`.github/workflows/build-installers.yml`) with a single matrixed job across the five apps. Captain and KDS need their `src-tauri/` Tauri scaffolding created first (file creation only, no local build attempt — the whole point is these builds happen on CI, not here) before the workflow can build them.

**Tech Stack:** GitHub Actions (`windows-latest` runner), Tauri 2.x / Rust / cargo, `@tauri-apps/cli` 2.11.4, `gh` CLI for triggering and watching the run.

**Spec:** `docs/superpowers/specs/2026-10-07-ci-build-pipeline-design.md`

## Global Constraints

- Trigger is `workflow_dispatch` only — no `push`/`pull_request` trigger, no inputs.
- `npm ci` runs once at the repo root (npm workspaces monorepo) — never per-app.
- No code-signing, no Android job, no download-page wiring in this plan.
- Captain/KDS's new `src-tauri/` identifiers are `com.jamanvaar.captain` / `com.jamanvaar.kds` — already confirmed non-colliding with the three existing apps.
- Every task commits only the files it creates/modified — this plan's own files are uniquely this session's work, so committing and pushing them is in scope (unlike other, unrelated uncommitted work elsewhere in this repo from a separate concurrent session, which this plan does not touch).

## Review Focus

- **`npm ci` run per-app instead of once at the root** — would break on workspace-protocol dependencies (`"@jamanvaar/ui": "*"`) or silently waste five times the CI minutes. Task 3's workflow YAML places `npm ci` as a single step before the per-app build steps, not inside each matrix leg's own working directory.
- **Captain/KDS's `src-tauri` not yet committed when the workflow first runs** — the workflow checks out the committed tree; if Tasks 1–2 aren't pushed before Task 4 triggers the run, those two matrix legs fail with "no such directory" looking like a CI misconfiguration. Task 4's first step is confirming `git log` shows Tasks 1–3's commits already pushed before triggering anything.
- **`MainWindowTitle` behaving differently on a GitHub-hosted Windows runner than on this local machine** — untested until the first real run. Task 3's smoke-test step codes the documented fallback (process alive 10s + clean kill) inline from the start, not as a reactive patch after a first failure.
- **A copy-paste of pos-admin's `main.rs` into Captain/KDS pulling in the native printer module** — the same risk this session already guarded against once for the local plan; Tasks 1 and 2 give the complete minimal `main.rs` content directly and verify no `printing` reference afterward.
- **Partial icon copy breaking the NSIS installer icon** — pos-admin's `icons/` folder has 23 files; Tasks 1 and 2 verify the count and the presence of `icon.ico`/`icon.png` specifically before moving on, same guard as the local plan.

---

## Task 1: Scaffold Captain's `src-tauri` (no local build)

**Files:**
- Create: `apps/restaurant-system/captain/src-tauri/Cargo.toml`
- Create: `apps/restaurant-system/captain/src-tauri/build.rs`
- Create: `apps/restaurant-system/captain/src-tauri/tauri.conf.json`
- Create: `apps/restaurant-system/captain/src-tauri/src/main.rs`
- Create: `apps/restaurant-system/captain/src-tauri/icons/` (23 files, copied from pos-admin's)
- Modify: `apps/restaurant-system/captain/package.json`

**Interfaces:**
- Consumes: `apps/restaurant-system/captain/vite.config.ts`'s `server.port: 5177` (already confirmed this session).
- Produces: a committed `apps/restaurant-system/captain/src-tauri/` tree that Task 3's workflow matrix entry `{ name: "Captain", path: "apps/restaurant-system/captain", binary: "jamanvaar-captain.exe", title: "JAMANVAAR Captain — Table-Side Ordering & Service" }` depends on existing in the pushed repo.

- [ ] **Step 1: Copy the icons folder verbatim from pos-admin's**

```powershell
New-Item -ItemType Directory -Force "apps/restaurant-system/captain/src-tauri/icons" | Out-Null
Copy-Item "apps/restaurant-system/pos-admin/src-tauri/icons/*" "apps/restaurant-system/captain/src-tauri/icons/" -Recurse
```

- [ ] **Step 2: Verify the icon copy is complete**

```powershell
(Get-ChildItem "apps/restaurant-system/captain/src-tauri/icons").Count
Test-Path "apps/restaurant-system/captain/src-tauri/icons/icon.ico"
Test-Path "apps/restaurant-system/captain/src-tauri/icons/icon.png"
```
Expected: count is `23`; both `Test-Path` calls return `True`.

- [ ] **Step 3: Write `Cargo.toml`**

Create `apps/restaurant-system/captain/src-tauri/Cargo.toml`:
```toml
[package]
name = "jamanvaar-captain"
version = "1.0.0"
description = "JAMANVAAR Captain — Table-Side Ordering Desktop Application"
authors = ["Kelviontech Systems <info@kelviontech.com>"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0.0", features = [] }

[dependencies]
tauri = { version = "2.0.0", features = [] }
tauri-plugin-shell = "2.0.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

- [ ] **Step 4: Write `build.rs`**

Create `apps/restaurant-system/captain/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5: Write the minimal `main.rs`**

Create `apps/restaurant-system/captain/src-tauri/src/main.rs`:
```rust
// JAMANVAAR Captain — Tauri Main Entry Point
// Production Windows Desktop Application
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Captain desktop application");
}
```

- [ ] **Step 6: Confirm `main.rs` has no native-printer reference**

```powershell
Select-String -Path "apps/restaurant-system/captain/src-tauri/src/main.rs" -Pattern "printing" -Quiet
```
Expected: `False`.

- [ ] **Step 7: Write `tauri.conf.json`**

Create `apps/restaurant-system/captain/src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "JAMANVAAR Captain",
  "version": "1.0.0",
  "identifier": "com.jamanvaar.captain",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5177",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "JAMANVAAR Captain — Table-Side Ordering & Service",
        "width": 1440,
        "height": 900,
        "minWidth": 1280,
        "minHeight": 768,
        "resizable": true,
        "fullscreen": false,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http:"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/64x64.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "publisher": "JAMANVAAR by Kelviontech Systems",
    "copyright": "Copyright © 2026 Kelviontech Systems. All rights reserved.",
    "category": "Business",
    "shortDescription": "JAMANVAAR Captain Table-Side Ordering",
    "longDescription": "JAMANVAAR Wireless Table Ordering, Course Firing, and Waiter Service Terminal",
    "windows": {
      "nsis": {
        "installerIcon": "icons/icon.ico",
        "installMode": "currentUser",
        "languages": ["English"],
        "displayLanguageSelector": false
      }
    }
  }
}
```

- [ ] **Step 8: Add Tauri packages to `package.json`**

Modify `apps/restaurant-system/captain/package.json`: add `"@tauri-apps/api": "^2.11.1"` to `dependencies`, and add a new `"devDependencies"` block (currently absent) containing `"@tauri-apps/cli": "^2.11.4"`.

- [ ] **Step 9: Install the newly added npm packages**

```powershell
cd "apps/restaurant-system/captain"; npm install
```
Expected: exits 0 (this only resolves/writes the lockfile — no Rust compilation happens here, so Smart App Control is not a factor).

- [ ] **Step 10: Commit**

```bash
git add apps/restaurant-system/captain/src-tauri apps/restaurant-system/captain/package.json apps/restaurant-system/captain/package-lock.json
git commit -m "feat(captain): scaffold Tauri desktop wrapper (build runs in CI)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
(Check `git status` first — omit `package-lock.json` from `add` if this workspace doesn't produce one at the app level.)

---

## Task 2: Scaffold KDS's `src-tauri` (no local build)

**Files:**
- Create: `apps/restaurant-system/kds/src-tauri/Cargo.toml`
- Create: `apps/restaurant-system/kds/src-tauri/build.rs`
- Create: `apps/restaurant-system/kds/src-tauri/tauri.conf.json`
- Create: `apps/restaurant-system/kds/src-tauri/src/main.rs`
- Create: `apps/restaurant-system/kds/src-tauri/icons/` (23 files, copied from pos-admin's)
- Modify: `apps/restaurant-system/kds/package.json`

**Interfaces:**
- Consumes: `apps/restaurant-system/kds/vite.config.ts`'s `server.port: 5179` (already confirmed this session).
- Produces: a committed `apps/restaurant-system/kds/src-tauri/` tree that Task 3's workflow matrix entry `{ name: "KDS", path: "apps/restaurant-system/kds", binary: "jamanvaar-kds.exe", title: "JAMANVAAR Kitchen Display — Prep Queue & Order Timing" }` depends on existing in the pushed repo.

- [ ] **Step 1: Copy the icons folder verbatim from pos-admin's**

```powershell
New-Item -ItemType Directory -Force "apps/restaurant-system/kds/src-tauri/icons" | Out-Null
Copy-Item "apps/restaurant-system/pos-admin/src-tauri/icons/*" "apps/restaurant-system/kds/src-tauri/icons/" -Recurse
```

- [ ] **Step 2: Verify the icon copy is complete**

```powershell
(Get-ChildItem "apps/restaurant-system/kds/src-tauri/icons").Count
Test-Path "apps/restaurant-system/kds/src-tauri/icons/icon.ico"
Test-Path "apps/restaurant-system/kds/src-tauri/icons/icon.png"
```
Expected: count is `23`; both `Test-Path` calls return `True`.

- [ ] **Step 3: Write `Cargo.toml`**

Create `apps/restaurant-system/kds/src-tauri/Cargo.toml`:
```toml
[package]
name = "jamanvaar-kds"
version = "1.0.0"
description = "JAMANVAAR Kitchen Display System — Desktop Application"
authors = ["Kelviontech Systems <info@kelviontech.com>"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0.0", features = [] }

[dependencies]
tauri = { version = "2.0.0", features = [] }
tauri-plugin-shell = "2.0.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

- [ ] **Step 4: Write `build.rs`**

Create `apps/restaurant-system/kds/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5: Write the minimal `main.rs`**

Create `apps/restaurant-system/kds/src-tauri/src/main.rs`:
```rust
// JAMANVAAR Kitchen Display System — Tauri Main Entry Point
// Production Windows Desktop Application
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Kitchen Display System desktop application");
}
```

- [ ] **Step 6: Confirm `main.rs` has no native-printer reference**

```powershell
Select-String -Path "apps/restaurant-system/kds/src-tauri/src/main.rs" -Pattern "printing" -Quiet
```
Expected: `False`.

- [ ] **Step 7: Write `tauri.conf.json`**

Create `apps/restaurant-system/kds/src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "JAMANVAAR Kitchen Display",
  "version": "1.0.0",
  "identifier": "com.jamanvaar.kds",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5179",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "JAMANVAAR Kitchen Display — Prep Queue & Order Timing",
        "width": 1440,
        "height": 900,
        "minWidth": 1280,
        "minHeight": 768,
        "resizable": true,
        "fullscreen": false,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; connect-src 'self' https: http:"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/64x64.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "publisher": "JAMANVAAR by Kelviontech Systems",
    "copyright": "Copyright © 2026 Kelviontech Systems. All rights reserved.",
    "category": "Business",
    "shortDescription": "JAMANVAAR Kitchen Display System",
    "longDescription": "JAMANVAAR Multi-Station Prep Routing, Order Queue Timing, and Cook Alerts",
    "windows": {
      "nsis": {
        "installerIcon": "icons/icon.ico",
        "installMode": "currentUser",
        "languages": ["English"],
        "displayLanguageSelector": false
      }
    }
  }
}
```

- [ ] **Step 8: Add Tauri packages to `package.json`**

Modify `apps/restaurant-system/kds/package.json`: add `"@tauri-apps/api": "^2.11.1"` to `dependencies`, and add a new `"devDependencies"` block (currently absent) containing `"@tauri-apps/cli": "^2.11.4"`.

- [ ] **Step 9: Install the newly added npm packages**

```powershell
cd "apps/restaurant-system/kds"; npm install
```
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add apps/restaurant-system/kds/src-tauri apps/restaurant-system/kds/package.json apps/restaurant-system/kds/package-lock.json
git commit -m "feat(kds): scaffold Tauri desktop wrapper (build runs in CI)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
(Check `git status` first — omit `package-lock.json` from `add` if this workspace doesn't produce one at the app level.)

---

## Task 3: Write the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/build-installers.yml`

**Interfaces:**
- Consumes: the five apps' paths/binary names/window titles fixed by this session's work (POS, Restaurant Admin, Kiosk already exist; Captain/KDS committed in Tasks 1–2).
- Produces: a workflow named `build-installers.yml` with job id `build-desktop`, triggerable via `gh workflow run build-installers.yml` — Task 4 depends on this exact filename and job id.

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/build-installers.yml`:
```yaml
name: Build Desktop Installers

on:
  workflow_dispatch:

jobs:
  build-desktop:
    runs-on: windows-latest
    strategy:
      fail-fast: false
      matrix:
        app:
          - name: POS
            path: apps/restaurant-system/pos
            binary: jamanvaar-pos.exe
            title: "JAMANVAAR POS — High-Speed Counter Billing Terminal"
          - name: RestaurantAdmin
            path: apps/restaurant-system/pos-admin
            binary: jamanvaar-pos-admin.exe
            title: "JAMANVAAR POS Admin — Restaurant Operations & Intelligence"
          - name: Kiosk
            path: apps/kiosk-system/kiosk-user
            binary: jamanvaar-kiosk-user.exe
            title: "JAMANVAAR Kiosk — Customer Self-Order Terminal"
          - name: Captain
            path: apps/restaurant-system/captain
            binary: jamanvaar-captain.exe
            title: "JAMANVAAR Captain — Table-Side Ordering & Service"
          - name: KDS
            path: apps/restaurant-system/kds
            binary: jamanvaar-kds.exe
            title: "JAMANVAAR Kitchen Display — Prep Queue & Order Timing"
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc

      - name: Install workspace dependencies
        run: npm ci

      - name: Build frontend (${{ matrix.app.name }})
        working-directory: ${{ matrix.app.path }}
        run: npm run build

      - name: Build Tauri installer (${{ matrix.app.name }})
        working-directory: ${{ matrix.app.path }}
        run: npx --yes "@tauri-apps/cli@2.11.4" build

      - name: Smoke test (${{ matrix.app.name }})
        shell: pwsh
        run: |
          $binaryPath = Join-Path "${{ matrix.app.path }}" "src-tauri/target/release/${{ matrix.app.binary }}"
          $proc = Start-Process -FilePath $binaryPath -PassThru
          Start-Sleep -Seconds 8
          $proc.Refresh()
          if ($proc.HasExited) {
            throw "${{ matrix.app.name }} exited within 8 seconds instead of showing a window (exit code $($proc.ExitCode))."
          }
          $title = $proc.MainWindowTitle
          if ([string]::IsNullOrWhiteSpace($title)) {
            Write-Warning "${{ matrix.app.name }}: MainWindowTitle came back empty on this runner — falling back to the alive-process check."
            Start-Sleep -Seconds 2
            $proc.Refresh()
            if ($proc.HasExited) {
              throw "${{ matrix.app.name }} exited before the fallback check completed (exit code $($proc.ExitCode))."
            }
          } elseif ($title -notlike "*${{ matrix.app.title }}*") {
            throw "${{ matrix.app.name }}: expected window title containing '${{ matrix.app.title }}' but got '$title'."
          } else {
            Write-Host "${{ matrix.app.name }}: window title confirmed: $title"
          }
          Stop-Process -Id $proc.Id -Force

      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.app.name }}-installer
          path: ${{ matrix.app.path }}/src-tauri/target/release/bundle/nsis/*.exe
          if-no-files-found: error
```

- [ ] **Step 2: Verify the YAML is well-formed**

```powershell
gh workflow view build-installers.yml
```
Expected: no parse error; the command prints the workflow's name and trigger (`workflow_dispatch`). (If `gh` reports the workflow isn't recognized yet, that's expected until Task 4 pushes it — a plain YAML parse check is enough here: `python -c "import yaml, sys; yaml.safe_load(open('.github/workflows/build-installers.yml'))"` if Python+PyYAML are available, otherwise proceed to Task 4 where the real test is pushing and triggering it.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-installers.yml
git commit -m "ci: add GitHub Actions workflow to build and smoke-test desktop installers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Push, trigger the workflow, and verify all five legs pass

**Files:** None created or modified — this task pushes Tasks 1–3's commits and verifies the real CI run.

**Interfaces:**
- Consumes: the `build-installers.yml` workflow and job id `build-desktop` from Task 3; the five matrix entries' artifact names (`POS-installer`, `RestaurantAdmin-installer`, `Kiosk-installer`, `Captain-installer`, `KDS-installer`).

- [ ] **Step 1: Confirm Tasks 1–3's commits exist locally before pushing**

```bash
git log --oneline -5
git status
```
Expected: the three commits from Tasks 1–3 are present (captain scaffold, kds scaffold, ci workflow), and `git status` shows a clean tree for the files this plan touched (other unrelated in-progress changes elsewhere in the repo, from separate work, are not this plan's concern and are left alone).

- [ ] **Step 2: Push**

```bash
git push
```
Expected: exits 0. (If the remote has diverged due to other work landing in the meantime, pull/rebase only the branch pointer — do not touch unrelated unstaged files — then retry.)

- [ ] **Step 3: Trigger the workflow**

```bash
gh workflow run build-installers.yml
```
Expected: exits 0, confirming the run was queued.

- [ ] **Step 4: Watch the run to completion**

```bash
gh run list --workflow=build-installers.yml --limit 1
gh run watch $(gh run list --workflow=build-installers.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```
Expected: the command blocks until the run finishes, then exits 0 if every matrix leg succeeded. This step will take real wall-clock time (cold Rust compiles on a fresh runner, times five) — allow it to run; don't cancel it for taking a while.

- [ ] **Step 5: If any leg failed, read its log and fix forward**

```bash
gh run view --log-failed
```
If a leg failed, read the actual error (don't guess) — common first-run possibilities: a typo'd `working-directory` path, the `MainWindowTitle` check needing the documented fallback to actually trigger (confirms Review Focus item 3 either way), or a missing dependency in `npm ci` at the root. Fix the specific file responsible (`.github/workflows/build-installers.yml`, or the affected app's own config if the error is app-specific), commit the fix, push, and re-run from Step 3.

- [ ] **Step 6: Confirm all five artifacts are attached**

```bash
gh run view $(gh run list --workflow=build-installers.yml --limit 1 --json databaseId --jq '.[0].databaseId') --json name,conclusion
```
Then list the artifacts:
```bash
gh api repos/om7867/kiosk/actions/runs/$(gh run list --workflow=build-installers.yml --limit 1 --json databaseId --jq '.[0].databaseId')/artifacts --jq '.artifacts[].name'
```
Expected: exactly five artifact names printed — `POS-installer`, `RestaurantAdmin-installer`, `Kiosk-installer`, `Captain-installer`, `KDS-installer`.

- [ ] **Step 7: Report to the user**

Summarize in chat: the workflow run URL (`gh run view --web` prints it, or construct `https://github.com/om7867/kiosk/actions/runs/<id>`), which apps built clean on the first try vs. needed a fix, and that all five installers are now downloadable from that run's artifacts — while noting they are unsigned (SmartScreen warning on first run for whoever downloads them) and not yet wired into any in-app download page (Sub-project 4, still pending Sub-project 3's hosting).

*(No commit for this task unless Step 5's fix-forward path was needed, in which case that fix was already committed as part of Step 5.)*

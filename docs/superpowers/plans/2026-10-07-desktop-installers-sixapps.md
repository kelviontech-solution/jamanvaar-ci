# Desktop (.exe) Installers for All Six JAMANVAAR Apps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Standing instruction for this plan: NO SUBAGENTS.** The user has an explicit, repo-wide standing instruction for all JAMANVAAR work this session to proceed natively, in-session, without delegating to subagents. Use `superpowers:executing-plans`, not `subagent-driven-development`, regardless of which this plan's header recommends elsewhere.

**Goal:** Produce a genuine, smoke-tested Windows `.exe` installer for each of the six JAMANVAAR terminal apps (POS, Restaurant Admin, Kiosk, Captain, KDS), proving the Vite→Tauri→NSIS chain works end-to-end before Sub-projects 2–4 (Android/CI, hosting, the download page) build on top of it.

**Architecture:** Three apps (POS, Restaurant Admin, Kiosk) already carry a complete `src-tauri/` Tauri wrapper — for these, build and smoke-test what already exists. Two apps (Captain, KDS) need a new `src-tauri/` each, copied from Restaurant Admin's (`pos-admin`) structure with per-app identifiers/ports/titles and a minimal `main.rs` (no native printer bridge — neither app uses it). Kiosk Admin is the sixth app in name but ships *inside* Restaurant Admin's own build (confirmed: no separate `kiosk-admin` Tauri target exists or is planned), so it needs no separate task.

**Tech Stack:** Tauri 2.x (Rust 1.98.0 / cargo 1.98.0, target `x86_64-pc-windows-msvc`), `@tauri-apps/cli` 2.11.4 (via `npx`), Vite 6, NSIS Windows installer bundling, Visual Studio 2022 Build Tools (VC++ x86/x64 toolset).

**Spec:** `docs/superpowers/specs/2026-10-07-desktop-installers-sixapps-design.md`

## Global Constraints

- Windows `.exe` (NSIS) only for this plan — no macOS/.dmg, no Linux, no Android (Sub-project 2).
- No code-signing in this plan — an unsigned installer triggers a Windows SmartScreen warning on first run; this is expected and must not be mistaken for a build failure (see Review Focus).
- Captain/KDS's new `src-tauri/` must not wire in `packages/native/printing.rs` — confirmed neither app uses Tauri's native ESC/POS bridge.
- Captain/KDS identifiers are `com.jamanvaar.captain` / `com.jamanvaar.kds` — confirmed non-colliding with the three existing apps' `com.jamanvaar.pos` / `com.jamanvaar.posadmin` / `com.jamanvaar.kiosk`.
- Captain's `devUrl` is `http://localhost:5177`, KDS's is `http://localhost:5179` — confirmed against each app's own `vite.config.ts` (`server.port`) fresh, not from stale memory.
- No subagents — native, in-session execution only (standing instruction for all JAMANVAAR work this session).
- No `git push`/commit of anything beyond what each task's own steps commit — this session has a standing "don't push anything right now" instruction from the user for *other*, separate uncommitted work already in this repo; this plan's own commits (new files this plan creates) are fine to commit locally as each task finishes, but do not run `git push` at the end of this plan without the user asking for it.
- Out of scope, no tasks for: code-signing, Android, CI pipeline, server hosting, the in-app download page (Sub-projects 2–4).

## Review Focus

- **Unsigned-installer SmartScreen warning on first launch** — a reasonable person running the produced `.exe` for the first time sees a blue "Windows protected your PC" dialog and may conclude the build is broken or infected. Every build+verify task's smoke-test step explicitly expects this, names the exact dismissal action ("More info" → "Run anyway"), and treats it as a precondition to pass through, not a failure.
- **Cold `cargo` build needs network access to crates.io the first time** — if this sandbox has no outbound network access right now, the very first Tauri build (Task 1, POS) will hang or fail fetching dependencies, and a worker might wait indefinitely or misdiagnose a compile error. Task 1 runs `cargo fetch` first as an explicit, separate, fast-failing step before the real build, so a network problem surfaces immediately with a clear message instead of inside a 10+ minute build log.
- **A copy-paste of pos-admin's `main.rs` into Captain/KDS accidentally pulling in the native printer module** — the single most likely mistake when "copying pos-admin's structure" is leaving in the `#[path = "../../../../../packages/native/printing.rs"] mod printing;` line and its `#[tauri::command]`s, which would fail to compile for Captain (no printer, but more importantly the path is unreviewed for these apps) or silently expose unwanted printer commands. Tasks 4 and 5 give the exact, complete minimal `main.rs` content to write (not "copy and trim"), and each task's verification step confirms the file has no `printing` references.
- **Partial icon copy breaking the NSIS installer icon specifically** — `pos-admin/src-tauri/icons/` has 23 files, but `tauri.conf.json`'s `bundle.icon` array only lists 7 of them; it would be easy to copy only those 7 and still have `cargo tauri build` succeed, but silently ship a generic icon in the file-explorer/taskbar contexts that read the other files (Store/UWP tiles) if ever reused. Tasks 4 and 5 copy the entire `icons/` folder (all 23 files) and explicitly verify `icon.ico` (the installer icon) and `icon.png` are present before building.
- **A dev server or stray `node.exe` left running on an app's own port from earlier work in this session blocking that app's own later `tauri dev` use** — doesn't affect this plan's build-only path (production build embeds the built `dist/`, no live server needed), but a worker could still have a stray background dev server occupying a port from earlier in this session. Each build+verify task's first step checks for and stops any process already bound to that app's dev port before proceeding, so nothing is left running at the end that could confuse a later `tauri dev` session.

---

## Task 1: Build and verify POS's existing installer

**Files:**
- None created or modified — POS's `src-tauri/` already exists and is correct. This task only builds and verifies it.

**Interfaces:**
- Consumes: `apps/restaurant-system/pos/src-tauri/tauri.conf.json` (`productName: "JAMANVAAR POS"`, window title `"JAMANVAAR POS — High-Speed Counter Billing Terminal"`).
- Produces: `apps/restaurant-system/pos/src-tauri/target/release/bundle/nsis/*.exe` — later tasks (6) read this path to report final locations/sizes.

- [ ] **Step 1: Stop any stray process already bound to POS's dev port (5175)**

Run (PowerShell):
```powershell
$conn = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```
Expected: no error; command completes (whether or not anything was found/killed).

- [ ] **Step 2: Pre-fetch Rust dependencies to fail fast on network problems**

Run:
```powershell
cd "apps/restaurant-system/pos/src-tauri"; cargo fetch
```
Expected: exits 0. If this fails, STOP — do not proceed to the build step — and report the exact cargo error (most likely a network/registry problem) before touching any other app.

- [ ] **Step 3: Build the Vite frontend**

Run:
```powershell
cd "apps/restaurant-system/pos"; npm run build
```
Expected: exits 0, and `apps/restaurant-system/pos/dist/index.html` exists afterward.

- [ ] **Step 4: Build the Tauri NSIS installer**

Run:
```powershell
cd "apps/restaurant-system/pos"; npx --yes @tauri-apps/cli@2.11.4 build
```
Expected: exits 0. This step compiles Rust (slowest part of this entire plan the first time it runs — cargo's registry/dependency cache is empty before this step and shared by every later app). Allow real wall-clock time; do not kill it for "taking too long" before at least 10 minutes have passed.

- [ ] **Step 5: Confirm the installer file exists**

Run:
```powershell
Get-ChildItem "apps/restaurant-system/pos/src-tauri/target/release/bundle/nsis/*.exe"
```
Expected: exactly one `.exe` file listed, name containing `JAMANVAAR POS` or `jamanvaar-pos` and a version number.

- [ ] **Step 6: Launch the installer's app binary directly and confirm a real window opens**

Tauri's release build also produces the raw app exe (not just the NSIS installer) at `target/release/<binary-name>.exe` — launch that directly rather than running the installer (installing isn't necessary to verify the app itself works):
```powershell
$proc = Start-Process "apps/restaurant-system/pos/src-tauri/target/release/jamanvaar-pos.exe" -PassThru
Start-Sleep -Seconds 6
$proc.Refresh()
$proc.MainWindowTitle
```
Expected: `$proc.MainWindowTitle` is the non-empty string `"JAMANVAAR POS — High-Speed Counter Billing Terminal"` (or starts with it). If Windows shows a SmartScreen "Windows protected your PC" dialog instead of the app window, this is expected for an unsigned binary (see Review Focus) — click "More info" then "Run anyway" and re-check `MainWindowTitle` after the app window actually appears.

- [ ] **Step 7: Close the launched app**

Run:
```powershell
Stop-Process -Id $proc.Id -Force
```
Expected: no error. Confirms no stray POS window/process is left running before moving to Task 2.

*(No commit for this task — no files were created or modified.)*

---

## Task 2: Build and verify Restaurant Admin's existing installer

**Files:**
- None created or modified — same situation as Task 1, for `pos-admin`.

**Interfaces:**
- Consumes: `apps/restaurant-system/pos-admin/src-tauri/tauri.conf.json` (`productName: "JAMANVAAR POS Admin"`, window title `"JAMANVAAR POS Admin — Restaurant Operations & Intelligence"`).
- Produces: `apps/restaurant-system/pos-admin/src-tauri/target/release/bundle/nsis/*.exe`.

- [ ] **Step 1: Stop any stray process bound to Restaurant Admin's dev port (5176)**

```powershell
$conn = Get-NetTCPConnection -LocalPort 5176 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```
Expected: completes without error.

- [ ] **Step 2: Build the Vite frontend**

```powershell
cd "apps/restaurant-system/pos-admin"; npm run build
```
Expected: exits 0; `apps/restaurant-system/pos-admin/dist/index.html` exists.

- [ ] **Step 3: Build the Tauri NSIS installer**

```powershell
cd "apps/restaurant-system/pos-admin"; npx --yes @tauri-apps/cli@2.11.4 build
```
Expected: exits 0. Rust dependency fetch is now cached from Task 1 — this build should be noticeably faster than POS's.

- [ ] **Step 4: Confirm the installer file exists**

```powershell
Get-ChildItem "apps/restaurant-system/pos-admin/src-tauri/target/release/bundle/nsis/*.exe"
```
Expected: exactly one `.exe` file.

- [ ] **Step 5: Launch the app binary and confirm a real window opens**

```powershell
$proc = Start-Process "apps/restaurant-system/pos-admin/src-tauri/target/release/jamanvaar-pos-admin.exe" -PassThru
Start-Sleep -Seconds 6
$proc.Refresh()
$proc.MainWindowTitle
```
Expected: `"JAMANVAAR POS Admin — Restaurant Operations & Intelligence"` (handle the SmartScreen dialog as in Task 1 Step 6 if it appears).

- [ ] **Step 6: Close the launched app**

```powershell
Stop-Process -Id $proc.Id -Force
```

*(No commit for this task.)*

---

## Task 3: Build and verify Kiosk's existing installer

**Files:**
- None created or modified — same situation as Tasks 1–2, for `kiosk-user`.

**Interfaces:**
- Consumes: `apps/kiosk-system/kiosk-user/src-tauri/tauri.conf.json` (`productName: "JAMANVAAR Kiosk"`, window title `"JAMANVAAR Kiosk — Customer Self-Order Terminal"`). Note this app's window is `fullscreen: true, resizable: false` — `MainWindowTitle` is still readable even fullscreen.
- Produces: `apps/kiosk-system/kiosk-user/src-tauri/target/release/bundle/nsis/*.exe`.

- [ ] **Step 1: Stop any stray process bound to Kiosk's dev port (5174)**

```powershell
$conn = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```

- [ ] **Step 2: Build the Vite frontend**

```powershell
cd "apps/kiosk-system/kiosk-user"; npm run build
```
Expected: exits 0; `apps/kiosk-system/kiosk-user/dist/index.html` exists.

- [ ] **Step 3: Build the Tauri NSIS installer**

```powershell
cd "apps/kiosk-system/kiosk-user"; npx --yes @tauri-apps/cli@2.11.4 build
```
Expected: exits 0.

- [ ] **Step 4: Confirm the installer file exists**

```powershell
Get-ChildItem "apps/kiosk-system/kiosk-user/src-tauri/target/release/bundle/nsis/*.exe"
```

- [ ] **Step 5: Launch the app binary and confirm a real window opens**

```powershell
$proc = Start-Process "apps/kiosk-system/kiosk-user/src-tauri/target/release/jamanvaar-kiosk-user.exe" -PassThru
Start-Sleep -Seconds 6
$proc.Refresh()
$proc.MainWindowTitle
```
Expected: `"JAMANVAAR Kiosk — Customer Self-Order Terminal"`. Since this window is fullscreen, it will cover the whole screen — that is correct behavior, not a hang; confirm via `MainWindowTitle` rather than expecting to see a bounded window.

- [ ] **Step 6: Close the launched app**

```powershell
Stop-Process -Id $proc.Id -Force
```

*(No commit for this task.)*

---

## Task 4: Scaffold, build, and verify Captain's new installer

**Files:**
- Create: `apps/restaurant-system/captain/src-tauri/Cargo.toml`
- Create: `apps/restaurant-system/captain/src-tauri/build.rs`
- Create: `apps/restaurant-system/captain/src-tauri/tauri.conf.json`
- Create: `apps/restaurant-system/captain/src-tauri/src/main.rs`
- Create: `apps/restaurant-system/captain/src-tauri/icons/` (23 files, copied from pos-admin's)
- Modify: `apps/restaurant-system/captain/package.json` (add two devDependencies/dependencies)

**Interfaces:**
- Consumes: `apps/restaurant-system/captain/vite.config.ts`'s `server.port: 5177` (confirmed) and `apps/restaurant-system/captain/dist/` (built in Step 4 below).
- Produces: `apps/restaurant-system/captain/src-tauri/target/release/bundle/nsis/*.exe` and `.../target/release/jamanvaar-captain.exe` — Task 6 reads these paths.

- [ ] **Step 1: Create the icons folder by copying pos-admin's verbatim**

```powershell
New-Item -ItemType Directory -Force "apps/restaurant-system/captain/src-tauri/icons" | Out-Null
Copy-Item "apps/restaurant-system/pos-admin/src-tauri/icons/*" "apps/restaurant-system/captain/src-tauri/icons/" -Recurse
```
Expected: no error.

- [ ] **Step 2: Verify the icon copy is complete, specifically the installer icon**

```powershell
(Get-ChildItem "apps/restaurant-system/captain/src-tauri/icons").Count
Test-Path "apps/restaurant-system/captain/src-tauri/icons/icon.ico"
Test-Path "apps/restaurant-system/captain/src-tauri/icons/icon.png"
```
Expected: count is `23`; both `Test-Path` calls return `True`. If the count is lower, re-run Step 1 — do not proceed with a partial icon set (see Review Focus).

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

- [ ] **Step 5: Write the minimal `main.rs` — no printer module, no custom commands**

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

- [ ] **Step 6: Confirm `main.rs` has no reference to the native printer module**

```powershell
Select-String -Path "apps/restaurant-system/captain/src-tauri/src/main.rs" -Pattern "printing" -Quiet
```
Expected: `False` (no match). If `True`, the file was written wrong — rewrite it to exactly the Step 5 content.

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

Modify `apps/restaurant-system/captain/package.json`: add `"@tauri-apps/api": "^2.11.1"` to `dependencies`, and add a `"devDependencies"` block (this file currently has none) containing `"@tauri-apps/cli": "^2.11.4"`.

- [ ] **Step 9: Stop any stray process bound to Captain's dev port (5177)**

```powershell
$conn = Get-NetTCPConnection -LocalPort 5177 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```

- [ ] **Step 10: Install the newly added npm packages**

```powershell
cd "apps/restaurant-system/captain"; npm install
```
Expected: exits 0.

- [ ] **Step 11: Build the Vite frontend**

```powershell
cd "apps/restaurant-system/captain"; npm run build
```
Expected: exits 0; `apps/restaurant-system/captain/dist/index.html` exists.

- [ ] **Step 12: Build the Tauri NSIS installer**

```powershell
cd "apps/restaurant-system/captain"; npx --yes @tauri-apps/cli@2.11.4 build
```
Expected: exits 0.

- [ ] **Step 13: Confirm the installer file exists**

```powershell
Get-ChildItem "apps/restaurant-system/captain/src-tauri/target/release/bundle/nsis/*.exe"
```

- [ ] **Step 14: Launch the app binary and confirm a real window opens**

```powershell
$proc = Start-Process "apps/restaurant-system/captain/src-tauri/target/release/jamanvaar-captain.exe" -PassThru
Start-Sleep -Seconds 6
$proc.Refresh()
$proc.MainWindowTitle
```
Expected: `"JAMANVAAR Captain — Table-Side Ordering & Service"` (handle SmartScreen as before if it appears).

- [ ] **Step 15: Close the launched app**

```powershell
Stop-Process -Id $proc.Id -Force
```

- [ ] **Step 16: Commit**

```bash
git add apps/restaurant-system/captain/src-tauri apps/restaurant-system/captain/package.json apps/restaurant-system/captain/package-lock.json
git commit -m "feat(captain): add Tauri desktop wrapper and build a working .exe installer"
```
(Omit `package-lock.json` from the `add` if this workspace doesn't use one at the app level — check with `git status` first.)

---

## Task 5: Scaffold, build, and verify KDS's new installer

**Files:**
- Create: `apps/restaurant-system/kds/src-tauri/Cargo.toml`
- Create: `apps/restaurant-system/kds/src-tauri/build.rs`
- Create: `apps/restaurant-system/kds/src-tauri/tauri.conf.json`
- Create: `apps/restaurant-system/kds/src-tauri/src/main.rs`
- Create: `apps/restaurant-system/kds/src-tauri/icons/` (23 files, copied from pos-admin's)
- Modify: `apps/restaurant-system/kds/package.json` (add two devDependencies/dependencies)

**Interfaces:**
- Consumes: `apps/restaurant-system/kds/vite.config.ts`'s `server.port: 5179` (confirmed) and `apps/restaurant-system/kds/dist/` (built in Step 4 below).
- Produces: `apps/restaurant-system/kds/src-tauri/target/release/bundle/nsis/*.exe` and `.../target/release/jamanvaar-kds.exe` — Task 6 reads these paths.

- [ ] **Step 1: Create the icons folder by copying pos-admin's verbatim**

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

- [ ] **Step 5: Write the minimal `main.rs` — no printer module, no custom commands**

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

- [ ] **Step 6: Confirm `main.rs` has no reference to the native printer module**

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

Modify `apps/restaurant-system/kds/package.json`: add `"@tauri-apps/api": "^2.11.1"` to `dependencies`, and add a `"devDependencies"` block (currently none) containing `"@tauri-apps/cli": "^2.11.4"`.

- [ ] **Step 9: Stop any stray process bound to KDS's dev port (5179)**

```powershell
$conn = Get-NetTCPConnection -LocalPort 5179 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```

- [ ] **Step 10: Install the newly added npm packages**

```powershell
cd "apps/restaurant-system/kds"; npm install
```
Expected: exits 0.

- [ ] **Step 11: Build the Vite frontend**

```powershell
cd "apps/restaurant-system/kds"; npm run build
```
Expected: exits 0; `apps/restaurant-system/kds/dist/index.html` exists.

- [ ] **Step 12: Build the Tauri NSIS installer**

```powershell
cd "apps/restaurant-system/kds"; npx --yes @tauri-apps/cli@2.11.4 build
```
Expected: exits 0.

- [ ] **Step 13: Confirm the installer file exists**

```powershell
Get-ChildItem "apps/restaurant-system/kds/src-tauri/target/release/bundle/nsis/*.exe"
```

- [ ] **Step 14: Launch the app binary and confirm a real window opens**

```powershell
$proc = Start-Process "apps/restaurant-system/kds/src-tauri/target/release/jamanvaar-kds.exe" -PassThru
Start-Sleep -Seconds 6
$proc.Refresh()
$proc.MainWindowTitle
```
Expected: `"JAMANVAAR Kitchen Display — Prep Queue & Order Timing"`.

- [ ] **Step 15: Close the launched app**

```powershell
Stop-Process -Id $proc.Id -Force
```

- [ ] **Step 16: Commit**

```bash
git add apps/restaurant-system/kds/src-tauri apps/restaurant-system/kds/package.json apps/restaurant-system/kds/package-lock.json
git commit -m "feat(kds): add Tauri desktop wrapper and build a working .exe installer"
```
(Omit `package-lock.json` from the `add` if this workspace doesn't use one at the app level — check with `git status` first.)

---

## Task 6: Final report — locate and size every produced installer

**Files:** None created or modified — this task only reads filesystem state from Tasks 1–5 and reports it.

**Interfaces:**
- Consumes: the five `src-tauri/target/release/bundle/nsis/*.exe` paths produced by Tasks 1–5 (Kiosk Admin ships inside Restaurant Admin's own installer, so there are five installers total for six app names).

- [ ] **Step 1: Collect every installer's path and size**

```powershell
$apps = @(
  "apps/restaurant-system/pos/src-tauri/target/release/bundle/nsis",
  "apps/restaurant-system/pos-admin/src-tauri/target/release/bundle/nsis",
  "apps/kiosk-system/kiosk-user/src-tauri/target/release/bundle/nsis",
  "apps/restaurant-system/captain/src-tauri/target/release/bundle/nsis",
  "apps/restaurant-system/kds/src-tauri/target/release/bundle/nsis"
)
foreach ($dir in $apps) {
  Get-ChildItem "$dir/*.exe" | Select-Object FullName, @{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}}
}
```
Expected: exactly five rows printed (one `.exe` per app), each with a non-zero `SizeMB`.

- [ ] **Step 2: Report the results to the user in chat**

Write a short message listing each app's name, its installer's full path, and its size in MB, plus a one-line reminder that these are unsigned (SmartScreen will warn on first run for whoever installs them) and that this was a build-only verification — nothing was pushed to git beyond the two new `src-tauri/` scaffolds (Captain, KDS) committed locally in Tasks 4–5.

*(No commit for this task — it's a report, not a code change.)*

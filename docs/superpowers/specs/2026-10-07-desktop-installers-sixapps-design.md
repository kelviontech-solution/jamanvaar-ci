# Desktop (.exe) Installers for All Six JAMANVAAR Apps — Design

**Sub-project 1 of 4** in the APK/EXE distribution effort (full effort: desktop installers → Android/CI →
hosting → in-app download page). This spec covers desktop only.

## Context

JAMANVAAR's six terminal apps (POS, Restaurant Admin, Captain, KDS, Kiosk, and the already-merged Kiosk
Admin-inside-Restaurant-Admin) each run as an ordinary Vite-built web app today, loaded in a browser. Three
of them — POS, Restaurant Admin, and Kiosk (`kiosk-user`) — already carry a Tauri desktop wrapper
(`src-tauri/`), with a complete icon set already generated from the real JAMANVAAR logo (desktop, Android,
and iOS sizes all present, despite no mobile project existing yet). Captain and KDS have no wrapper at all;
they are pure browser apps.

Super Admin's "Applications & Releases" page and the in-app update-notification system (optional dismissible
banner for a normal release, a non-dismissible lock screen for a mandatory one) are **already fully built and
working** — they just have nothing real to point at yet, because no installer has ever actually been built.
This sub-project produces the first real ones.

## Goal

A genuine, working `.exe` installer for each of the six apps, built and smoke-tested in this environment,
proving the whole chain (Vite build → Tauri bundle → NSIS installer → the app actually opens and shows the
real UI) works before Sub-projects 2–4 (Android/CI, hosting, the download page) are built on top of it.

## What Tauri wrapping is, concretely

A Tauri app is the exact same Vite frontend this repo already builds (`npm run build` → `dist/`), loaded
inside a native window that uses the OS's own browser engine (WebView2 on Windows) instead of a bundled
Chromium. Nothing in the React/TypeScript code needs to know it is running inside Tauri instead of a browser
tab — confirmed by the fact that POS and Restaurant Admin already do this today with zero special-cased
frontend code for it. `src-tauri/` is a thin Rust shell around that same build output: a `tauri.conf.json`
(window title/size, bundle/installer settings, icon paths), a `Cargo.toml` (the Rust package + its two Tauri
dependencies), a `build.rs` (one line, hands off to `tauri-build`), and a `src/main.rs` (the actual entry
point — for POS/Restaurant Admin this also registers native ESC/POS printer commands; see below for why
Captain/KDS do not need that part).

## Scope

**In scope:**
- A new `src-tauri/` for Captain and for KDS, each following the exact structure already in
  `apps/restaurant-system/pos-admin/src-tauri/`.
- A real `.exe` installer built and launched (smoke-tested) for all six apps in this environment.
- Each app's `package.json` gets the same `tauri` dev/build scripts the existing three already carry.

**Out of scope (deliberately, for this sub-project):**
- Code-signing. An unsigned installer triggers a Windows SmartScreen warning on first run; this is a real
  but separate concern (needs a purchased code-signing certificate) that does not block having a working
  installer today.
- Android, the CI pipeline, server hosting, and the in-app download page — Sub-projects 2, 3, and 4.
- Any change to the three apps' existing Tauri setup (POS, Restaurant Admin, Kiosk) beyond what's needed to
  rebuild them for this verification pass.

## Per-app plan

**POS, Restaurant Admin, Kiosk (`kiosk-user`):** already fully scaffolded. Just run the existing build
(`npm run build` then `cargo tauri build` from each app's `src-tauri/`) and smoke-test the resulting `.exe`.

**Captain, KDS:** new `src-tauri/` each, copying pos-admin's structure with these per-app changes:
- `tauri.conf.json`: `productName` ("JAMANVAAR Captain" / "JAMANVAAR Kitchen Display"), `identifier`
  (`com.jamanvaar.captain` / `com.jamanvaar.kds` — must be unique per app, or Windows treats two JAMANVAAR
  installers as the same product and lets one overwrite the other), `devUrl` set to that app's own dev port
  (Captain `5177`, KDS `5179`, both already fixed by their own `vite.config.ts`), everything else (window
  size, CSP, bundle/NSIS settings) identical to pos-admin's.
- `Cargo.toml`: same two dependencies (`tauri`, `tauri-plugin-shell`) plus `serde`/`serde_json`; `name` and
  `description` changed to match the app.
- `build.rs`: byte-identical (`tauri_build::build()` — it does the same thing for every Tauri app).
- `src/main.rs`: **minimal**, unlike pos-admin's — just the bare `tauri::Builder` with the shell plugin and
  no custom `#[tauri::command]`s. Checked first: Captain has no printer access at all (it's a waiter's
  tablet, not a billing counter), and KDS's own `printThermalKotTicket` (in `@jamanvaar/ui`'s
  `ThermalReceiptView.tsx`) uses the browser's own print dialog, not Tauri's native ESC/POS bridge in
  `packages/native/printing.rs` — so neither app needs that module wired in. Confirmed by reading both
  files, not assumed.
- `icons/`: copied verbatim from pos-admin's `icons/` folder (confirmed byte-identical across all three
  existing apps — same source logo).
- `package.json`: add the `tauri` script and the two `@tauri-apps/*` devDependencies, matching pos-admin's.

## Verification

For each of the six apps: `npm run build` succeeds, `cargo tauri build` succeeds and produces an `.exe` under
`src-tauri/target/release/bundle/nsis/`, and launching that `.exe` opens a window showing the real app (not a
blank/error screen) — confirmed by actually running each one, not just checking the build exits 0.

## Review Focus

- **Captain/KDS's `devUrl` port collision with an already-running dev server**: if either app's own dev
  server happens to be running on its configured port during a Tauri *dev* run, `cargo tauri dev` would
  either fail to bind or show a stale window — not a concern for the *build* path this sub-project actually
  exercises (production build embeds the built `dist/`, not a live dev server), but worth a one-line note in
  the plan so whoever runs `tauri dev` later isn't confused by it.
- **Identifier collisions with the three existing apps**: checked — the three existing apps use
  `com.jamanvaar.pos`, `com.jamanvaar.posadmin`, and `com.jamanvaar.kiosk`. Captain/KDS's planned
  `com.jamanvaar.captain` / `com.jamanvaar.kds` don't collide with any of them.
- **CSP differences**: pos-admin's CSP (`connect-src 'self' https: http:`) is permissive enough for any
  app's own API calls; Captain/KDS get the same block rather than a hand-tuned one, since none of the six
  apps' CSP needs differ in a way that matters for a first working build.

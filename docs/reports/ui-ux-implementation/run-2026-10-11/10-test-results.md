# 10 — Test results

## Environment
- Node 24.12, npm 11.6, Chrome (installed), vitest 4.1.11, TypeScript from the repo.
- `npm install --no-save --no-package-lock --ignore-scripts` of seven packages **already declared** in `package.json` but missing from `node_modules`: `qrcode`, `@types/qrcode`, `jsdom`, `jsqr`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-updater`. `package.json`/lockfile were not modified. npm also pruned 88 extraneous packages and re-linked the workspaces.
- No backend (cloud API / relay) and no accounts: authenticated screens could not be exercised.

## 1. Unit / integration suite (`vitest run`)
| Run | Files | Tests | Notes |
|---|---:|---:|---|
| Before install (dependencies missing) | 196 failed / 39 passed (241) | 30 failed / 282 passed | `Cannot find package 'qrcode'/'jsdom'/'jsqr'` — environment, not product |
| Baseline after install, before any UI change | 239 passed / 2 failed (241) | 1,782 / 1,786 | 4 tests timed out at 5 s under load (`staff_pin`, `no_demo_identity_fallbacks`) |
| After changes (incl. new tests) | **242 passed / 0 failed** | **1,796 / 1,796** | the 4 timeouts passed on this run (load-dependent, not related to the change) |

Failures found and fixed during the work (caught by existing tests): `i18n_key_parity` (new keys had to exist in all 7 languages), `pos_admin_active_tab_persistence` (mismatched JSX in `KioskDisplaySettingsPanel`). Both pass.

### New tests — `tests/ui_dialog_and_settings_primitives.test.tsx` (10, jsdom)
1. Modal: dialog named from title, close button labelled, focus moves inside.
2. Modal: Tab wraps inside; Escape closes; focus returns to opener.
3. Modal: Escape closes only the top-most of two stacked dialogs.
4. `useConfirm`: Cancel resolves false / confirm true; destructive default focus is Cancel.
5. `useConfirm.prompt`: confirm disabled while a required answer is empty; returns text.
6. `useConfirm.notify`: single acknowledging button.
7. `SettingsTabs`: tab semantics + ArrowRight moves selection.
8. `SettingsFeedback`: error → `alert`, others → `status`.
9. `SettingsSaveBar`: never shows "Saved" while saving; Save disabled and `aria-busy`.
10. `SettingsSection`/`SettingsField`: region labelled by heading; label, help and error wiring.

## 2. TypeScript (`tsc -p <app> --noEmit`)
pos ✔ · pos-admin ✔ · captain ✔ · kds ✔ · kiosk-user ✔ · qr-guest ✔ · super-admin-web ✔ (0 errors each, run after the last source edit).

## 3. Production builds (`vite build --outDir <scratch>`)
kiosk-user ✔ · pos ✔ · pos-admin ✔ · captain ✔ · kds ✔ · super-admin-web ✔ · qr-guest ✔. Built with the apps' own `vite.config.ts` via a scratch wrapper so that no `dist/` or `public/` file in the repository was written.

## 4. Real-browser checks (Chrome via DevTools protocol)
| Check | Result |
|---|---|
| Admin Settings (harness, seeded demo DB) at 1366/768/390 | one `h1`, sections as `h2`, no horizontal overflow, 0 console errors, focus ring visible on every Tab stop |
| Shared Modal | `role=dialog aria-modal=true`, close = "Close Edit dish", focus lands in first field, **Escape closes and focus returns to the opener** |
| Confirm dialog (390 and 1366) | buttons: Close · Cancel · Delete dish; initial focus **Cancel**; renders correctly at 390 |
| POS Settings (harness) 1366/768/1920/390 | header + 5 tabs, tabs reach all panels, arrow key moves selection, no overflow, 0 console errors |
| POS and KDS activation, offline | badge now **"Local Core: Unreachable"**; submit shows the new sentence in a `role=alert` |
| Restaurant Admin sign-in, offline | message without exception text; diagnostic only in console |
| Captain activation | **renders from current source** (was blank); new activation copy |
| Admin sign-in "Pair" | 0 interactive targets under 24 px |
| Super Admin login | badge "Unreachable", no "Port 4000" in the card note |

## 5. Not tested
- Any authenticated screen in any app; KDS board; Kiosk guest flow, customisation sheet and OTP login (the new inline errors); Super Admin dialogs; POS cart/payment dialogs; Captain table workspace dialogs.
- Screen readers, forced-colours, 200 % text zoom, packaged Tauri/Android behaviour (`confirm/alert` replacement removes that dependency but was not exercised there).
- Performance.
- QR guest retry message after the last edit (source + typecheck + QR test files only).

## 6. Repository hygiene
- `git diff` reviewed: changes limited to the files listed in `00`–`09`; the 18 `*/public/*` line-ending changes pre-date this run (audit run 1) and were left.
- Audit run-1 and run-2 report directories were not modified.

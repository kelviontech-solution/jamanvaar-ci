# 01 — Settings consistency: inventory, standard, matrix

## 1. Current-state inventory (before)

| # | App | Screen / entry | Source | Navigation | Heading level & style | Container | Save model | Feedback |
|---|---|---|---|---|---|---|---|---|
| 1 | Restaurant Admin | `SETTINGS` tab → Terminal screen size | `settings/TerminalDisplaySettings.tsx` | stacked cards, no page header | `h3 text-sm font-bold` | `max-w-4xl`, `p-5`, `shadow-2xs` | explicit Save; navy button | toast + inline error |
| 2 | Restaurant Admin | → WhatsApp ordering | `settings/WhatsAppChannelPanel.tsx` | stacked | `h3 text-sm` + status chip | no max-width, `p-5` | Generate / Disconnect actions | status chip, confirm inline |
| 3 | Restaurant Admin | → Report branding & legal profile | `settings/ReportBrandingSettings.tsx` | stacked | **`h1 text-2xl/3xl`** | `max-w-5xl`, form | one big Save (orange) ; toast "Saved!" before sync result | toast; "saved locally" toast after |
| 4 | Restaurant Admin (Kiosk mode) | → Kiosk language / idle / token | `settings/KioskDisplaySettingsPanel.tsx` | stacked | `h4` default size | `p-6`, `shadow-sm` | immediate toggles + toast | toast |
| 5 | Restaurant Admin | Kiosk Welcome screen, Appearance & Content, Combos, Payments, Receipts & E-Bill, Printers, Sync, Subscription, Backup | `settings/*`, `receipts/*`, `payments/*`, `hardware/*` | own tabs | mixed | mixed | mixed | mixed |
| 6 | POS Counter | Settings (5 pill tabs) | `pos/.../PosSettingsView.tsx` | pill tabs, no ARIA tab semantics | `h1 text-2xl extrabold`; cards `h2 base extrabold`/`h3 sm bold`/`h4 black` | `rounded-3xl` and `rounded-2xl` mixed | per-card actions | six different banner blocks at top |
| 7 | Super Admin | Platform Settings | `pages/Settings/PlatformSettingsPage.tsx` | `settings-grid` cards | `h1 page-title`; card `h3 settings-card-title` | `settings-card` (own CSS) | per-card form + Save, **unsaved/saved status text** | `page-success`/`page-error` banners |
| 8 | Super Admin | Profile, Offline policy, Plans, etc. | `pages/*` | sidebar | page-title | `Card` | per page | toasts |
| 9 | Kiosk | Staff-mode printer settings | `KioskPrinterSettingsModal.tsx` | modal | modal title | shared `Modal` | explicit | inline |
| 10 | Captain | — (profile/shift in header and More drawer; no settings page) | — | — | — | — | — | — |
| 11 | KDS | — (station switch in header only) | — | — | — | — | — | — |
| 12 | QR Guest | — (guest-facing; no settings) | — | — | — | — | — | — |

Differences that mattered to users: three different page-heading treatments; card radius/shadow/padding differing by screen; "Save" being navy in one panel, orange in another, absent (immediate) in a third; success shown as a toast *before* the cloud result; POS feedback scattered as six identical-looking banners; no ARIA on POS tabs.

## 2. The standard that was implemented

Anatomy (shared code in `packages/ui/src/Settings.tsx`, mirrored in Super Admin's `settings-card*` CSS which already followed it):

1. **`SettingsPageHeader`** — one `h1`, one sentence of context, optional page action.
2. **`SettingsTabs`** (only where a screen has peer sections) — `role=tablist/tab`, `aria-selected`, roving tabindex, arrow/Home/End keys, brand-orange selected state.
3. **`SettingsSection`** — `section` labelled by its heading (`h2`), optional icon, status badge, header actions, footer. Card: `rounded-2xl border-jaman-border p-5 shadow-2xs`.
4. **`SettingsField`** + `SETTINGS_INPUT_CLASS` — label (with "required" text for AT), help text, error with `role=alert`; ids for `aria-describedby`.
5. **`SettingsFeedback`** — one banner for success/info/warning/error; errors `role=alert`, others `role=status`.
6. **`SettingsSaveBar` / `SettingsSaveStatus`** — primary Save in the accessible brand orange, optional Cancel, status line: *Saving… / Saved / You have unsaved changes / Could not save…* plus **scope** ("Applies to all terminals of this restaurant"). "Saved" is only shown when the caller reports persistence success.

Deliberately **not** standardised: layout (KDS/Kiosk/POS stay dense or touch-first), persistence model (immediate toggles stay immediate), field height (44 px default, caller may differ), and the Super Admin dark theme (it keeps `settings-card*` classes with the same anatomy).

## 3. Settings regression matrix

Status: **PASS** = observed in a real browser render or asserted by a test; **FAIL**; **NOT TESTED**; **N/A**. "Harness" = the real components rendered in a throw-away Vite page seeded with the default demo database (the screens are behind authentication in the apps themselves). Evidence under `evidence/`.

| Check | Admin: Settings tab (items 1–4) | POS: Settings (item 6) | Super Admin: Platform Settings (item 7) | Kiosk printer modal (9) |
|---|---|---|---|---|
| Page heading (one h1, description) | **PASS** (harness: `h1`="Restaurant settings", 1 h1) | **PASS** (h1 present, 1 h1) | **PASS** (source: `page-title`; not rendered) | N/A |
| Navigation (active/hover/focus) | N/A (stacked) | **PASS** (tablist, selected state, arrow-key test; tab order shows visible focus) | N/A | N/A |
| Section hierarchy | **PASS** (h2 sections) | **PARTIAL** — header/tabs/feedback migrated; inner cards keep their own h2/h3/h4 sizes | **PASS** (source) | N/A |
| Form fields | **PARTIAL** — ReportBranding keeps its own field styling | **NOT TESTED** | **NOT TESTED** | **NOT TESTED** |
| Buttons (variants/sizing) | **PASS** for migrated save buttons (orange primary, 40 px) | **NOT TESTED** | **NOT TESTED** | **NOT TESTED** |
| Save behaviour (honest state) | **PASS** by source+test: Terminal size uses `SettingsSaveBar`; Branding no longer says "Saved" until sync outcome is known | N/A (per-card actions unchanged) | **PASS** (existing unsaved/saved text) | **NOT TESTED** |
| Unsaved-changes | **PASS** (Branding form tracks `dirty`; Terminal size computes it) | **NOT TESTED** | **PASS** (existing) | **NOT TESTED** |
| Dialogs | **PASS** (shared Modal/ConfirmDialog verified in real browser: label, focus, Escape, restore) | **PASS** (cart discard, menu archive/delete, order guards use in-app dialog — typecheck/test; not rendered) | **PASS** (source + typecheck; not rendered) | **NOT TESTED** |
| Loading states | **NOT TESTED** | **NOT TESTED** | **NOT TESTED** | **NOT TESTED** |
| Empty states | **NOT TESTED** | **NOT TESTED** | **NOT TESTED** | **NOT TESTED** |
| Error states | **PASS** (Terminal size load error → `SettingsSaveBar` error; Branding sync failure keeps "saved on this device only") — source/test, not rendered offline | **PASS** (single `SettingsFeedback error` for license errors; source) | **PASS** (`role=alert`) | NOT TESTED |
| Responsive | **PASS** 1366/768/390: no overflow, readable | **PASS** 1366/768/390/1920: no overflow; tabs stack under title | **NOT TESTED** | **NOT TESTED** |
| Theme preservation | **PASS** (light ivory/navy, brand orange) | **PASS** (saffron selected tab retained) | **PASS** (dark theme untouched) | N/A |
| Accessibility | **PARTIAL** — keyboard order, focus ring, labelled sections verified; screen reader **NOT TESTED**; 9 small native controls (checkbox/range) remain | **PARTIAL** — tab semantics and focus verified; others NOT TESTED | **PARTIAL** — dialog semantics added; others NOT TESTED | NOT TESTED |
| Functionality preserved | **PASS** for edited panels by typecheck + full suite; **not** exercised end-to-end (no backend) | **PASS** typecheck + suite | **PASS** typecheck + suite | NOT TESTED |

Not covered by this matrix because I could not render them: the remaining Restaurant Admin configuration tabs (item 5), Super Admin item 8, and every Settings screen in a packaged Tauri build. They are listed as open in `11-remaining-issues.md`.

## 4. Decisions made
- **Primary action colour**: the accessible brand orange `#BF540F` (Admin already used it; white text 4.7:1). Navy remains the secondary solid.
- **Heading levels**: page `h1`, section `h2`; inner groups may use `h3`. The Branding form's old `h1` is now an `h2` because the page owns the `h1`.
- **Where feedback goes**: inline status next to the control that saved (and a toast only as reinforcement), never a toast alone.
- **No settings were renamed or moved**; no routes or deep links changed.

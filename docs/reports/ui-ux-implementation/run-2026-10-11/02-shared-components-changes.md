# 02 — Shared components and tokens: what changed

All shared code lives in `packages/ui/src`. Every app type-checks and builds against it (see `10-test-results.md`).

## New
| File | Purpose | Consumers |
|---|---|---|
| `useDialogFocus.ts` | Single implementation of dialog keyboard behaviour: focus in (explicit `[data-autofocus]`, else the first control that is not the close button, else the card), Tab trap, **Escape closes only the top-most dialog**, focus restored to the opener. Visibility is decided from styles (works without layout, e.g. jsdom). | shared `Modal`, `ConfirmDialog`, Super Admin `Modal`/`ModalShell` |
| `ConfirmDialog.tsx` | `ConfirmDialog` + `useConfirm()` → `confirm()`, `prompt()`, `notify()` promises. Destructive confirmations focus **Cancel** first; prompt supports `required`; `notify` is a single-button notice. | POS (9 sites), Captain (4), Admin (17 native-only sites), ConnectionPanel, NativeUpdateButton, KioskWelcomeScreenPanel |
| `Settings.tsx` | `SettingsPageHeader`, `SettingsTabs`, `SettingsSection`, `SettingsField`, `settingsFieldIds`, `SETTINGS_INPUT_CLASS`, `SettingsFeedback`, `SettingsSaveStatus`, `SettingsSaveBar` | Admin Settings tab (4 panels), POS Settings |
| Super Admin `useAdminConfirm` / `ModalShell` (`cloud/super-admin-web/src/components/ui.tsx`) | Same promise API and behaviour using the console's own dark `confirmation-*` styles; `prompt` supports `inputType: 'password'` | 8 pages |

## Changed
| File | Before → after | Finding |
|---|---|---|
| `Modal.tsx` | no focus management; unnamed close; window-level Escape per instance → uses `useDialogFocus`; `aria-labelledby` the title; close button `aria-label="Close <title>"`; icon `aria-hidden`; backdrop `aria-hidden` | SH-001, SH-002 |
| `JamanvaarAuthLayout.tsx` | defaulted to "Connected" with no signal; "Connected (Port 4000)"; "Pair" 22×16 → badge hidden when there is neither a health URL nor connection state; "Connected"; Pair has padding to ≥24 px and a focus ring | SH-004, SH-008, SH-010 |
| `Button.tsx` | `accent` white on `#E66817` (3.3:1) → white on `#BF540F` (4.7:1), darker hover/press; `outline` gets a focus ring | SH-005 |
| `NotificationToastContainer.tsx` | region without live semantics → `role="status" aria-live="polite"` | SH-013 |
| `KpiCard`, `StateFeedback`, `VirtualKeyboard` | `text-[#8C9BAE]` (2.8:1) → `text-[#52677A]` (5.9:1) | SH-005 |
| `ConnectionPanel.tsx`, `NativeUpdateButton.tsx` | `window.confirm` → `useConfirm` | UX-002 class |
| `packages/i18n` (en, hi, gu, mr, ta, te, kn) | +6 keys: `validationPhoneInvalid`, `otpExpired`, `otpTooManyAttempts`, `otpIncorrectLeft`, `otpIncorrectNone`, `fixCustomization` | UX-001 |

Translations for hi/gu/mr/ta/te/kn were written without a native-speaker review — **please have them reviewed** before shipping to customers.

## Not changed (deliberately)
- **Tailwind token files (6 copies)** — a global migration of ~1,000 raw-hex utilities was judged too risky for this pass. No new colour was introduced beyond the accessible `#BF540F` that Restaurant Admin already defines as `brand`.
- **`ThermalReceiptView` greys** — they mirror the printed receipt.
- **Dark-theme `#8CA0B3`** — good contrast on navy.
- **`text-[10px]/[11px]` declarations (1,401)** — only specific status items were enlarged (KDS timer, kiosk required-option cue). A blanket floor would shrink visible tickets and rows on POS/KDS.

## Consumer matrix
| Consumer | Rendered in browser | Type-check | Build | Test suite |
|---|---|---|---|---|
| Restaurant Admin (Modal ×28, ConfirmDialog) | ✔ harness (dialog + settings) | ✔ | ✔ | ✔ |
| Kiosk (Modal ×10) | ✔ activation only; modals unreachable | ✔ | ✔ | ✔ |
| POS (hand-rolled overlays + ConfirmDialog) | ✔ settings, activation | ✔ | ✔ | ✔ |
| Captain (ConfirmDialog, auth layout) | ✔ activation (compiles again) | ✔ | ✔ | ✔ |
| KDS (auth layout) | ✔ activation | ✔ | ✔ | ✔ |
| Super Admin (own dialogs via the hook) | ✔ login; dialogs not rendered | ✔ | ✔ | ✔ |
| QR guest (no shared UI) | ✔ invalid code | ✔ | ✔ | ✔ |

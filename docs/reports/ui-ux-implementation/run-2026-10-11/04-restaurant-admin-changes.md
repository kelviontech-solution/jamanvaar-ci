# 04 — Restaurant Admin changes

Theme preserved: ivory/navy/brand orange, existing card styling. Business logic untouched.

| Finding | Confirmed? | Files | Before → after | Verification | Status |
|---|---|---|---|---|---|
| ADMIN-F1 raw `TypeError: Failed to fetch` | Yes (rendered) | `App.tsx` | exception name and message appended to the sign-in error → friendly sentence; detail goes to `console.warn` for support | rendered sign-in offline, 2 viewports | Resolved |
| Activation copy ("Activation failed. Please verify the code.") | Yes (source) | `App.tsx` | blamed the code even when offline → "Could not complete activation. Check this device's internet connection and that the code is correct, then try again." | typecheck | Resolved |
| ADMIN-F2 native confirm/prompt | Partly: **17 calls were native-only**; the other ~12 are fallbacks behind `onRequestConfirm` that the App always supplies | `OrdersModule` (void bill: confirm + prompt → one dialog with a required reason), `StaffRolesModule` ×2, `LoyaltyProgramModal` ×2, `MarketingCampaignsModal`, `QrAdvanced` ×4, `QrCatalog` ×2, `QrConsole` ×2, `KioskWelcomeScreenPanel` ×2 | OS dialogs → `useConfirm` with consequence text, labelled actions, Cancel-first focus for destructive actions | typecheck + suite; dialog behaviour verified in a real browser harness | Resolved |
| SH-001/002 shared Modal (28 uses) | Yes | `packages/ui` | see `02` | unit tests + real browser | Resolved |
| SH-007 zoom lock | Yes | `index.html` | `maximum-scale=1.0, user-scalable=no` → `width=device-width, initial-scale=1.0` | meta read | Resolved |
| SH-008 "Pair" 22×16 | Yes | `JamanvaarAuthLayout.tsx` | → ≥24 px, focus ring | measured: 0 targets under 24 px on sign-in | Resolved |
| Settings consistency | Requirement | `App.tsx` (page header), `TerminalDisplaySettings`, `WhatsAppChannelPanel`, `KioskDisplaySettingsPanel` (token counter split into its own section), `ReportBrandingSettings` | see `01` | harness render at 1366/768/390 | Resolved for the Settings tab |
| Report-branding save honesty | Yes (source) | `ReportBrandingSettings.tsx` | "Saved!" toast fired before the cloud push result → status shows *Saving… / Saved and synced / Saved on this device only* | typecheck; not exercised end to end | Resolved (source) |
| ADMIN-F3 activation-panel fold + stale badge | Yes | — | not changed | — | Not done |
| ADMIN-F4 navigation grouping and jargon | Suspected | — | product decision | — | Not done |
| Remaining Admin configuration tabs (Kiosk welcome/content/combos/payments, receipts, printers, sync, subscription) | — | — | not migrated to the Settings primitives | — | Not done |

Evidence: `evidence/restaurant-admin/*` (settings at 3 viewports, dialog, confirm, prompt, bad-credentials copy).

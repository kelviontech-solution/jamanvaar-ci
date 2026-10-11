# 03 — Super Admin changes

Theme preserved: dark console, `--jv-*` variables, existing `settings-card*` and `confirmation-*` classes. No layout changes.

| Finding | Confirmed? | Files | Before → after | Verification | Status |
|---|---|---|---|---|---|
| A11Y-007 / SH-003 dialog semantics, focus, Escape | Yes (source) | `components/ui.tsx` (`Modal`, new `ModalShell`), 7 modal pages + `RestaurantsListPage` suspend dialog | no `role`/`aria-modal`/focus handling, 10 inline copies → `role="dialog" aria-modal`, labelled, focus in/trap/restore, top-most Escape; close button "Close <title>" | typecheck, build; shared hook unit-tested; **not rendered** (needs a session) | Resolved (source) |
| Native `confirm`/`prompt` (8 calls) | Yes | `ActivationKeysListPage` ×2, `AiAssistantPage`, `ApplicationsPage`, `BillingPage`, `MasterCatalogPage`, `PaymentConnectionsListPage` ×2 prompts | OS dialogs → `useAdminConfirm`; **the commission password was requested via a plain-text `prompt`** → masked password field | typecheck, build; not rendered | Resolved (source) |
| SH-010 "Port 4000" on the login screen | Yes (visual) | `Login/LoginPage.tsx`, shared layout | "Port 4000 • Live Cloud API" / "Connected (Port 4000)" → "Live cloud API" / "Connected" | rendered login at 1366 and 390 | Resolved |
| Settings feedback semantics | Yes | `Settings/PlatformSettingsPage.tsx` | `page-error`/`page-success` plain divs → `role=alert` / `role=status` | typecheck | Resolved (source) |
| SH-009 logo noise on dark | Yes (visual) | — | needs a transparent dark-theme logo asset | — | **Not done** (asset) |
| SUPER-F1 Router future-flag warnings | Yes | — | behavioural opt-in; belongs to a router upgrade | — | Not done |
| SUPER-F2 whole-list restaurant filtering | Suspected | — | needs API support | — | Not done |
| SUPER-F3 payments IA | Product decision | — | — | — | Not done |
| SUPER-F4 `<main>` on `/activate` | Yes | — | not changed | — | Not done |

Other "Port 4000" strings remain on the Dashboard and Support pages (operator diagnostics) and were left.
Evidence: `evidence/super-admin/SUPER-001-initial-*.png`, `log-render-after.json`.

# 05 — POS Counter changes

Theme preserved: ivory/navy with saffron selected states; dense layout untouched. No change to transaction, tax, discount, settlement or receipt logic.

| Finding | Confirmed? | Files | Before → after | Verification | Status |
|---|---|---|---|---|---|
| SH-004 false "Local Core: Connected" on activation | Yes (rendered, current source) | `src/App.tsx` | activation layout passed no connection state → passes `db.isLocalCoreUnauthorized/isLocalCoreConnected/localCoreHealthUrl` | rendered: badge now **"Local Core: Unreachable"** with nothing running | Resolved |
| POS-F1 "Activation failed" hides the cause | Yes | `src/App.tsx` | any non-API failure → "Activation failed" → "Could not complete activation. Check this device's internet connection and try again." (`role=alert`) | rendered bad-key submit, 1366 and 390 | Resolved |
| POS-F2 native dialogs (9 sites) | Yes (source) | `PosHeader.tsx` ×2, `PosMenuManagerModal.tsx` ×2, `PosOrdersView.tsx` ×4, `QrOrdersInbox.tsx` ×1 | `confirm`/`alert`/`prompt` → in-app dialogs. The "already paid via UPI — do not collect payment again" warning is now a titled notice ("Already paid via UPI") instead of a disappearing alert. Cart-discard confirmations name the consequence and offer "Keep cart" | typecheck + suite; **not rendered** (needs activated terminal) | Resolved (source) |
| Decline QR order prompt | Yes | `QrOrdersInbox.tsx` | Cancel on the prompt still declined the order → Cancel now cancels the decline | source + typecheck | Resolved — **behaviour change** |
| Settings consistency | Requirement | `settings/PosSettingsView.tsx` | hand-built header and 5 pill buttons without tab semantics, six separate feedback blocks → `SettingsPageHeader`, `SettingsTabs`, `SettingsFeedback`; first card unified (radius/shadow/heading) | rendered at 1366/768/1920/390, tab and arrow-key behaviour, no overflow; unit tests for the primitives | Resolved for header/tabs/feedback; inner cards unchanged |
| SH-007 viewport | Yes | `index.html` | invalid `user-select=none` token removed; `maximum-scale=1.0` kept (terminal) | meta read | Partial |
| POS-F3 sub-12 px text (453) | Count confirmed | — | not changed (density is intentional) | — | Not done |
| SH-003 hand-rolled overlays (38, 1 `role=dialog`) | Suspected | — | not migrated | — | Not done |

Evidence: `evidence/pos/POS-001-*`, `evidence/pos/POS-SET-*`, `log-harness-pos.json`, `log-render-after.json`.

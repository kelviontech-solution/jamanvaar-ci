# 08 — Kiosk changes

Theme preserved: touch-first customer layout. No change to payment, order submission or the session-reset logic.

| Finding | Confirmed? | Files | Before → after | Verification | Status |
|---|---|---|---|---|---|
| UX-001 blocking `alert()` on the guest terminal (5) | Yes (source) | `src/App.tsx`, `packages/i18n/*` (7 languages) | phone/OTP/expiry/attempt errors and required-option errors were English OS dialogs → inline `role="alert"` messages in the login modal and in the customisation sheet footer, using `t()` keys (en/hi/gu/mr/ta/te/kn). Field now has a bound label, `aria-invalid`, `aria-describedby`, `inputMode="numeric"`, `autocomplete="tel-national"`. Typing clears the message | typecheck, build, i18n-parity test; **not rendered** (needs an activated kiosk) | Resolved (source) |
| Modifier validation text | Source | — | the *text* of required-option errors still comes from `@jamanvaar/business` `validateModifiers` in English; only its presentation changed | — | Partial |
| KIOSK-F2 required-option cue 11 px, 2.83:1 | Yes | `KioskProductCard.tsx` | `text-[11px] #8C9BAE` → `text-xs`, required = bold navy, optional = `#52677A` (5.9:1) | source; **not rendered** | Resolved (source) |
| Other `#8C9BAE` text (18 uses) | Yes | `src/App.tsx` | → `#52677A` | typecheck | Resolved |
| Touch targets in the customisation footer | Yes (32 px steppers) | `src/App.tsx` | quantity −/+ 32 → 44 px with labelled icons | source | Resolved (source) |
| KIOSK-F3 product card `div onClick` | Yes | — | not changed (nested interactive controls would be invalid as `role=button`; touch-only) | — | Not done |
| KIOSK-F4 emoji in header | Yes | — | not changed | — | Not done |
| SH-007 zoom lock | Yes | — | kept for the public terminal | — | Not done — decision needed |

Not changed but noticed: the OTP flow still shows the one-time code in a toast ("No SMS gateway configured — your one-time code is …"). That is existing behaviour and a security/product decision; flagged in `11-remaining-issues.md`.
Evidence: `evidence/kiosk/KIOSK-001-initial-1366x768.png` (activation), `log-render-after.json`.

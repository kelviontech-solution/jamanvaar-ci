# 11 — Remaining issues, risks and decisions

## A. Open findings (not fixed in this run)
| ID | Issue | Why not done | Next step |
|---|---|---|---|
| SH-003 | 38 POS + 14 Captain hand-rolled overlays; few `role=dialog` | Suspected from counts; migrating overlays blind risks payment/ordering flows | render each with seeded data, then adopt `useDialogFocus` per overlay |
| SH-005 (rest) | `#94A3B8`/slate-400 text, `#E66817` as small text, ~1,000 raw-hex utilities | needs a token migration plan, visual diff per screen | add `brand`/`muted` semantic tokens to the shared Tailwind preset, migrate by app |
| SH-006 | 1,401 sub-12 px declarations | density is intentional for POS/KDS; needs real-distance review | design review on device at real size |
| SH-007 | zoom still locked on Kiosk, POS, KDS, Captain | terminal decision | owner decision (Section C) |
| SH-009 | logo raster shows noise on the dark Super Admin theme | needs a transparent asset | supply dark-theme logo |
| SH-011 | "100% Secure / Instant Offline Boot" footer | copy/legal decision | marketing decision |
| SH-012 | six duplicated Tailwind configs | risky global migration | shared preset package |
| ADMIN-F3, ADMIN-F4 | activation-panel fold/badge; nav grouping/jargon | needs rendered pass / product decision | — |
| SUPER-F1…F4 | Router flags, whole-list filtering, payments IA, `<main>` | separate upgrade / API / decision | — |
| KIOSK-F3, F4 | card `div onClick`, header emoji | low value / design | — |
| KDS-F3 | tab roles without panels | low value | — |
| Settings (rest) | Admin config tabs (kiosk welcome/content/combos/payments, receipts, printers, sync, subscription, backup), Super Admin non-settings pages, Kiosk printer modal not migrated to the primitives | not renderable without backend; avoid blind refactors | migrate per tab with a rendered check |
| Other native dialogs | ~12 Admin `window.confirm` fallbacks behind `onRequestConfirm` | unreachable in the shipped App | remove when the prop becomes required |

## B. Risks to review before shipping
1. **Translations** (hi, gu, mr, ta, te, kn) for six new kiosk strings were written without native review.
2. **Behaviour changes**: cancelling the POS "decline QR order" dialog no longer declines; void-bill and QR "cancel order" need a non-empty reason in the dialog.
3. **Kiosk OTP shows the code in a toast** ("No SMS gateway configured — your one-time code is …"). Pre-existing and security-relevant; not touched.
4. **Escape propagation**: the shared Modal now stops Escape at the top-most dialog. Any app-level Escape shortcut (e.g. POS global shortcuts) will not fire while a shared dialog is open — intended, but worth a hands-on check on POS.
5. **`Button` accent colour** is now `#BF540F` everywhere it is used (darker than the decorative saffron). Brand review recommended.
6. **Captain conflict resolution** favoured upstream behaviour; compare against your local branch if any local-only behaviour (not just styling) mattered to you. `stash@{0}` still holds your original autostash.
7. **node_modules** was reconciled with the committed lockfile (88 extraneous packages pruned). If any tooling relied on them, run your normal `npm install`.

## C. Decisions needed
1. Keep pinch-zoom locked on terminals (Kiosk/POS/KDS/Captain)? Restaurant Admin no longer locks it.
2. Are the packaged Tauri builds expected to show native dialogs anywhere? (Now moot for the replaced sites.)
3. Approve the brand-orange `#BF540F` for all primary actions and the Settings save button.
4. Should remaining Admin config tabs be migrated to the Settings primitives, and in what order?
5. Product decision on OTP delivery and the dev-only toast.

## D. Verification gaps (explicit)
Everything listed in `10-test-results.md` §5. In particular, **no authenticated screen was exercised end to end in any app**; the new dialogs were verified in a harness and by tests, not inside the running apps.

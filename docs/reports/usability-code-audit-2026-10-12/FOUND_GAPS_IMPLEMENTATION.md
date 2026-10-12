# Found gaps: financial and staff workflow implementation

12 October 2026. Follow-up to [REMAINING_GAPS_IMPLEMENTATION.md](REMAINING_GAPS_IMPLEMENTATION.md). Existing unrelated changes remain intact. This report describes local source changes and verification; it does not claim production deployment or a clean repository-wide re-audit.

## Results

| Finding | Implementation | Practical scope |
|---|---|---|
| R01 — returns from a closed till | Billing and Order Details let an authorized administrator select an open register recording the return. A transactional, append-only return journal records the original sale, paying register, amount in paise, return method, actor, business date and retry key. Cash creates a real cash-out movement, checks available money, and rolls back on failure. Original closed register counts and closed-day statements remain frozen. Stock and loyalty reversals remain transactional. New-register statements include returns of older bills. | Local cash and cashier-confirmed UPI bookkeeping. Staff must confirm that money was actually returned. This does not initiate a bank transfer. The existing server payment ledger remains the path for QR, online and mixed-tender returns. |
| R02 — incompatible payment projections | `orderPaymentPosition` separates accepted bill value, confirmed collection, recorded return and outstanding balance. Billing, CSV, central reporting, daily reports, shift reporting and report summaries use this projection. Part-paid bills expose their actual remaining balance. Wallet and split payments preserve paise; missing partial tender evidence remains unattributed instead of becoming invented cash. Register and business-date reports assign journal returns to the paying register/date. | A lifetime invoice balance and a frozen counted shift are different views, explicitly handled. No claim is made that every older analytics reader has been replaced. |
| R03 — historical date changes | Restaurant timezone/rollover changes are scheduled for a future local calendar date. Existing untagged orders/shifts are attributed before adopting the profile. Canonical `BD-YYYYMMDD` tags also survive a fresh cloud restore without a local day row. Calendar arithmetic handles DST and before-rollover dates. | Untagged history freezes using the rule available when migrated. This cannot recover unknown earlier operating rules from missing historical evidence. |
| R04 — branch operating profiles | Owners can inherit the restaurant rule or schedule an explicit branch timezone/rollover override. Restaurant Admin shows current rules, previews, save errors and received device profile revisions. Server authorization retains restaurant/device/branch scope and records profile changes in the audit trail. | A heartbeat revision acknowledges receipt of a profile; an online device alone is not labelled acknowledged. Physical multi-device acceptance still needs staging verification. |
| R05 — full branding transport | Logo, tagline, contact details, owner/manager names, footer and colors persist in a cloud branding profile and restore to fresh terminals. Versioned legal identity replaces stale device copies. The settings page renders an actual draft preview and distinguishes local save from server publication and terminal acknowledgement. | Failed publication is reported. Independent kiosk presentation/receipt overrides still use their existing configuration transport. |
| R06 — unfinished staff product work | Added branch-scoped station records with permanent IDs, explicit previous names, rename validation, exact legacy migration and configuration transport. KDS and Restaurant Admin station filters now use actual stations; menu editing suggests registry names. Added an isolated six-step practice flow to POS settings, Captain tools and KDS. Added Restaurant ID discovery through the registered owner mailbox, without returning IDs/credentials in a public response. Staff assistance now has separate sent/accepted/completed events and a private originating-kiosk progress endpoint. Expanded Gujarati/Hindi cashier reconciliation, Captain requests, kitchen warnings and practice copy. | The main missing workflows are implemented. **Complete language coverage is not finished**: some advanced forms, dynamic errors, reports and configuration screens remain English. Practice is a safe guided exercise, not a full simulated replica of every production screen. |

## Use the new flows

- **Return an older local bill:** Billing or Order Details → record returned payment → choose the current open register → enter the reason/amount → confirm that money was returned. The old register's counted cash stays intact.
- **Set restaurant/branch operating rules:** Restaurant Admin → Settings → Report branding & legal profile. The restaurant rule and branch override show their preview separately. Changes apply on the scheduled future date.
- **Rename a kitchen station:** Restaurant Admin → Kitchen/KOT → Kitchen stations & previous names. Register existing names, then rename. The old name remains an explicit alias; similar spellings are not routing authority.
- **Train safely:** POS Settings, Captain More Options, or KDS Staff practice. All practice state lives inside the panel; closing/resetting the exercise discards it.
- **Recover a Restaurant ID:** Restaurant Admin login → Forgot password → Forgot your Restaurant ID? → registered owner email. The IDs are emailed only to that mailbox. The public response is identical for known and unknown addresses.
- **Help a kiosk guest:** accept the urgent popup or the notification's request action, then complete the request in the inbox. The kiosk shows waiting until the server confirms staff acceptance, then completion.

## Additional integrity fixes

- A service request completed during an acknowledgement upload used to risk losing the newer outbox value. Push acknowledgements now remove only the exact version that was uploaded.
- Service messages and station registries are scoped to restaurant and branch. Switching branches does not resend the previous branch's requests.
- A public kiosk cannot acknowledge its own request, read another kiosk's progress, or receive private staff-message catch-up. Staff updates preserve original request ownership and move only forward.
- A stale sent retry cannot undo acceptance/completion. Legacy Captain requests without a transport record retain their existing local acknowledgement behavior, without fabricating a remote acknowledgement.
- Kitchen station changes require licensed Restaurant Admin access and a verified owner or appropriate branch manager. An unrelated kiosk configuration update preserves the stored station registry.
- Synced local return journals validate cumulative amount, unique immutable keys, paying-register branch/date and manager evidence. Server-confirmed actor names replace client-supplied names on new events. JSON property ordering and cached actor display names do not break retries.
- Returning money in a new register no longer deducts it twice in cash reconciliation or statements. Imported registers without detailed bills retain an explicit recorded sales base.
- Closed-day counts, refunds and AOV preserve the original reconciled statement after a later-day return.

## Verification

Exact results and file references are recorded in [FOUND_GAPS_VERIFICATION.json](evidence/FOUND_GAPS_VERIFICATION.json). Test counts from different runs overlap and must not be added together.

Final checks: **103 focused root tests**, **9 API unit tests**, **7 frontend builds** and **10 browser fixtures** passed. Root/API typechecks, API build and `git diff --check` passed.

- Focused financial/staff regression tests cover original/new registers, insufficient funds, rollback, repeat keys, partial collections/returns, cash/UPI/wallet/split paise, old business dates, profile restoration, station rename/branch separation, request progression and practice isolation.
- API unit checks cover scheduled profiles, owner authorization, append-only journals, private guest progress, staff-only acknowledgement and mailbox-only recovery.
- Actual React browser fixtures verify practice, station editing, branding/profile layout, ID recovery and service acknowledgement at **1366×768** and **768×1024**. The final fixture run has no horizontal overflow or runtime exceptions. Backend/external requests are blocked; it does not prove live delivery or gateway behavior.
- The broad root suite was run before the final compatibility fixes. It passed **1,928 tests** and exposed one legacy Captain request failure, subsequently fixed and covered by the final focused run. The first broad run also hit three five-second timeouts in slow PIN/image checks; those passed on the rerun. This is **not** represented as a final all-green full-suite run.
- Frontend builds cover POS, shared Restaurant/Kiosk/QR Admin, Captain, KDS, Kiosk, QR Guest and Super Admin. Root/API typechecks and API build are recorded separately.
- Prisma's normal generation encountered a locked Windows engine DLL. Generation using the same schema and Prisma 5.22.0 in an isolated output directory succeeded; running services/signing identities were preserved. Deployment must run normal Prisma generation after releasing the engine lock.

## Deployment and acceptance

Deploy the additive migration `cloud/api/prisma/migrations/20261012210000_operating_branding_profiles/migration.sql` before the new API. It adds restaurant operating/branding JSON, branch operating JSON and device revision fields. The preceding rollover-hour migration remains required if not already applied.

No production migration, GitHub push, signing-key change, native installer release or live-money return was performed here. Verify an owner, a branch manager, two registers, two branches, a fresh terminal, offline/reconnect, actual email delivery and independent kiosk/staff devices in staging before production acceptance.

Remaining work includes full advanced-screen localization, usability sessions with actual staff, production payment/provider and printer acceptance, and review of older analytics readers not using the common projection. These are explicit limits, not a zero-gap or 10/10 claim.

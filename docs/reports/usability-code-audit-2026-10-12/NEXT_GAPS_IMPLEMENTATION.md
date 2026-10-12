# Follow-up fixes and remaining gaps

Latest remaining-gap fixes and new findings: [REMAINING_GAPS_IMPLEMENTATION.md](REMAINING_GAPS_IMPLEMENTATION.md). The earlier findings below are preserved as audit history.
12 October 2026. Follow-up to [NEXT_FLOW_GAPS.md](NEXT_FLOW_GAPS.md), at baseline HEAD `8a6a402eb17409dc2e0c4737ae1204fa20d9df43` with the existing working tree preserved. Changes are local; no deployment or GitHub push.

## Implementation status

| Findings | Changes and limits |
|---|---|
| F01/F02 | Day-close hooks remain consistent across opening/closing. A cash count including zero is required; discrepancies require a reason. Reopening clears the previous reconciliation. |
| F03 | QR service completion and payment refresh are independent. Completed unpaid orders continue refreshing; counter collection updates without reload. Manual refresh remains. Automatic refresh is bounded to 30 minutes per state and pauses while hidden. |
| F04 | All Captain logout paths use the store guard for unsent dishes. Fired dishes permit normal logout. Existing per-table persistence was found during implementation, so the earlier loss finding was overstated for already persisted drafts; the guard also protects in-memory work. |
| F05/F06 | No fuzzy station fallback: similar names and empty queues cannot broaden responsibility. Cancellation warnings remain until acknowledgement regardless of ticket age. Stable station IDs and legacy alias migration are not implemented. |
| F07 | Publication wording distinguishes server publication from terminal acknowledgement. |
| F08 | Cashier navigation shows everyday pages first; More reveals secondary tools. Managers retain full navigation. This is presentation, not a new authorization policy. |
| F09 | Dashboard actions lead to unpaid bills, device connections, menu, shifts and stock. Billing preserves date/source/collection context. Recent-order actions search canonical order IDs. All-restaurant operational actions require choosing a branch; automatic branch switching and full timeline deep links remain incomplete. |
| F10 | Launch checklist independently verifies draft/publication, device acknowledgement and branch QR links, with truthful failures and live guest links. Staff-delivery verification is guided, not an automated order/payment test. |
| F11 | Register checklist lists cashiers/count state, links to register management and blocks branch closing where individual counts are required. It does not remotely close another cashier's register. |
| F12/F13 | Captain badges use the actual ownership selector/order records. Mobile/desktop navigation shares translation keys. Counter payment says received, rather than gateway-verified. Full localization remains incomplete. |
| F14 | Eligible configured reward is visible outside collapsed details with actual saving/points cost. Redemption is optional; attaching a customer does not spend points. |
| F15 | QR Admin defaults to daily/setup tools with Advanced toggle and setup shortcuts. Current deep links remain visible; licensed features remain available. |
| F16/F17 | Owner login help points to the owner's welcome kit/email/setup contact. Guest menu errors offer retry/counter actions. Verified restaurant discovery/recovery remains incomplete. |

Additional fix: Captain held drafts now use durable `KeyValueStore`, scoped to activated restaurant and branch. A stale cart cannot write to another branch. Invalid stored rows are filtered. The legacy unscoped `jamanvaar_captain_held_v1` key is preserved for support recovery and never silently assigned to a restaurant because ownership cannot be established safely.

## Files and verification

Principal files: POS `PosCloseDayModal.tsx`, `PosSidebar.tsx`, `PosLoyaltyRewards.tsx`; Captain store/header/navigation/drawer/shift views; KDS `App.tsx`, `kdsLogic.ts`; QR guest `App.tsx`, new `paymentProgress.ts`; Admin `App.tsx`, `BranchBusinessDashboard.tsx`, new `dashboardDrilldown.ts`, `BillingInvoicesModule.tsx`, `MenuLaunchCheck.tsx`, `MenuCategoriesModule.tsx`, `QrConsole.tsx`; shared `StaffLanguage.tsx`.

- [Focused regression run](evidence/NEXT_GAPS_TESTS.json): **195 tests across 20 files passed**, covering financial closure, Captain service/drafts/handover, KDS routing, QR propagation/checkout and CRM/loyalty. It is not a new full repository suite.
- [UI tests](evidence/NEXT_GAPS_UI_TESTS.json) cover actual dashboard action context, visible optional rewards, modal transitions, completed QR payment, station isolation and scoped drafts.
- [Seven frontend builds](evidence/next-gap-builds/RESULTS.json) passed. Final modal reset additionally rebuilt successfully in [POS final result](evidence/next-gap-builds/POS-final-result.json) and [build log](evidence/next-gap-builds/POS-final.log).
- Root `tsc --noEmit` and `git diff --check` pass.
- [13 browser fixtures](evidence/next-gap-components/RESULTS.json): actual desktop/tablet POS, KDS, Captain handover, kiosk settings, day-close and QR status components, plus QR at 390×844. Blank counts/unexplained discrepancies are blocked; explained counts permit progression. No horizontal overflow or runtime exceptions recorded.

Fixtures use isolated data and blocked/mocked backend requests. They do not verify production authentication, real gateway settlement, cross-device delivery, native installation or printer hardware. Earlier full-suite evidence is preserved.

## Other gaps found

| Priority | Source-confirmed finding | Follow-up needed |
|---|---|---|
| N01 / P0 | Billing `handleProcessRefund` directly changes status and logs a hardcoded Floor Manager, then announces success. `handleVoidOrder` also directly mutates status. They bypass canonical refund/void bookkeeping and payment provenance. These handlers were not changed in this pass. | Authorized, idempotent order/payment commands with verified actor, ledger, stock/loyalty effects and audit. Test paid/part-paid/unpaid, retries and every source. A status change must not imply money was refunded. |
| N02 / P1 | `BusinessDayRepository.getActiveBusinessDay()` automatically closes older days at a fixed 05:00 cutoff, through a getter, without cashier-count reconciliation. System closure is not a physical count. | Separate date rollover from counted settlement; show outstanding reconciliation and configurable authorized cutoff. Preserve overnight billing. |
| N03 / P1 | Shift report projection treats every order as dine-in and hardcodes takeaway/delivery/token, refund, wallet and split values to zero. | Derive breakdown from canonical orders/payments and explicitly label unknown data. Compare mixed-source/split/refunded PDF/CSV with collections. |
| N04 / P1 | Individual-register denomination fields start at zero; submission lacks deliberate count acknowledgement and a required discrepancy reason. Day-close validation is stricter than till closure. | Explicit count confirmation, valid denominations, discrepancy reason and approval/audit. Test untouched form, genuine empty till, shortage and multiple tills. |

Evidence: `apps/restaurant-system/pos-admin/src/components/billing/BillingInvoicesModule.tsx` refund/void handlers; `packages/database/src/repositories.ts` active-day getter; `apps/restaurant-system/pos/src/components/shift/PosShiftAndCashView.tsx` till submission/report.

Other proposed product work remains: per-dish visibility diagnostics, verified account discovery, isolated staff practice, reusable branch operating profiles, actionable disruption recovery and guest-visible staff acknowledgement. These are not claimed complete.

Before release, verify an authenticated test restaurant, two registers, a second branch, real reconnects and provider test-mode transactions. No perfect score or zero-bug claim is assigned.

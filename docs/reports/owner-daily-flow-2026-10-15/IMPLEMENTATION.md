# Daily owner flow improvements

15 October 2026. Implemented in the local workspace. This report builds on [the unified owner console](../qr-admin-audit-2026-10-14/OWNER_CONSOLE_IMPLEMENTATION.md). These changes have not been deployed to production or packaged into APK/EXE releases.

## What changed

| Requested improvement | Implemented behavior |
| --- | --- |
| Simpler daily navigation | Today, Orders, Menu, Customers & loyalty and Devices & sync appear first in Restaurant Admin. Kiosk Admin exposes its licensed daily tasks. Operations, Kiosk Management, QR Ordering, Reports and Setup expand when needed. Configuration starts collapsed; the current page remains visible. Existing URLs and licensed tools remain available. |
| Actionable starting dashboard | What needs attention appears before the financial charts. Live lists show unpaid bills, delayed accepted/cash-counter orders, unavailable dishes and device issues. Each list shows up to 20 tasks. Live tasks are independent of historical sales filters. |
| Exact task links | Bill links carry the order ID and its branch-local date and show that bill independently of date cutoffs, with a return-to-today action. Delayed orders open their detail or show an explicit message while local sync catches up. Dish links focus the menu search. Device links focus that device, with a Show all devices action. Restaurant-wide tasks with a branch switch to that branch before opening. Unassigned records never cause a guessed branch. |
| Plan-specific onboarding | Menu and publication steps are shared. Restaurant management adds table, team and printer steps; kiosk management adds terminal setup and welcome-preview access; QR adds table-code setup. Checklist dismissal is scoped by restaurant, branch and product combination and can be resumed. Completion is derived from actual configuration rather than manually ticked setup boxes. |
| Final test order | Owners/managers select a paid, served/completed order from their authorized branch and confirm counter delivery, kitchen delivery and receipt verification. The server stores the order, source, verifier, menu version and time. The result survives reload. Publishing another menu or refunding the accepted order invalidates the certification; an order older than the current publication cannot certify it. This form does not create an order or collect money. |
| Clearer settings scope | Menu, tax/options, identity, kiosk content, terminal welcome overrides, merchant connection, receipts and payment pages explain their scope. Restaurant merchant connection is distinguished from branch kiosk defaults. QR presentation is explicitly restaurant-wide within the QR channel. Existing live QR/mobile and kiosk portrait/landscape previews remain available before saving. |
| Simpler role views | Owners start with attention tasks and business summaries. Managers get Branch operations with business charts collapsed; the backend constrains them to their assigned branch. The assistant uses the saved manager role for its question presentation. Existing cashier shortcuts, Captain attention strip and KDS station/ticket views remain separate operational experiences. |

### Branch availability is distinct from shared availability

A shared dish can be enabled while a branch override disables it. The focused menu task now displays that distinction and offers **Use shared availability for this branch**. This clears only the branch override. It cannot silently make a globally unavailable dish available or overwrite another branch’s setting. Publish and inspect terminal delivery after making the change.

### Authorization and persistence

- Attention queries explicitly constrain restaurant and authorized branch. Branch-restricted menu items remain filtered. Historical totals continue to use the canonical order/payment ledger.
- New `GET/POST /api/v1/tenant/dashboard/launch-acceptance` endpoints use tenant authentication plus owner/manager branch authorization. Unknown fields, incomplete confirmations, foreign-branch orders, pending payments and unfinished orders are rejected.
- Launch evidence is stored as a server-owned `ADMIN_LAUNCH_CHECK` entity. It is not included in the generic entity-sync write allowlist; customer terminals cannot invent it through that route.
- Existing SQLite data, device identities, signing keys and subscription contracts are unchanged. A branch switch flushes durable local storage before reloading the branch workspace.
- Onboarding dismissal is a local convenience preference. Final launch evidence is server-persisted; its verification status is re-evaluated against the current order and publication.

## Important limits

- Licensing remains restaurant-wide. Branch ordering switches and branch configuration are **not** commercial branch licenses. No claim of branch-specific product licensing is made here.
- Delayed-order attention currently uses a visible 20-minute threshold, not a per-station SLA. It excludes completed, ready, cancelled and unverified online-payment orders. Device health follows the existing heartbeat policy.
- The UI shows the first 20 attention tasks of each kind. A displayed count is the number listed, not a fleet-wide incident total.
- The final launch check combines server-confirmed order/payment state with staff attestations. It does not independently prove physical print delivery or a successful real payment-app round trip. QR's existing payment-acceptance workflow remains a separate check.
- The current gateway and settlement connection is restaurant-wide; QR operating rules may inherit restaurant defaults or use branch overrides. Kiosk welcome overrides can target a particular terminal.
- No external payment, email or WhatsApp delivery was performed during the isolated checks. Physical printers, Android/Windows builds and production payment acceptance remain separate release checks.

## Verification

See [verification evidence](evidence/verification.json) and [browser results](evidence/browser-results.json). Browser screenshots in `evidence/` cover desktop/phone views, focused attention tasks, manager operations, settings scope and saved launch evidence.

| Final check | Result |
| --- | --- |
| Relevant root unit/regression selection | 195 / 195 tests, 9 files |
| Backend branch dashboard, owner plans and tenant-session selection | 62 / 62 tests, 3 suites |
| Owner-flow browser scenarios | 22 / 22 |
| POS, Captain, KDS and customer Kiosk browser regression | 25 / 25 |
| Admin TypeScript, admin/standalone QR frontend build and API build | Passed |
| Large dataset dashboard requests | 238, 190 and 192 ms on the isolated local database; not production measurements |

The browser verification caught and fixed lost task context during entitlement loading, the final-form select's accessible name and double serialization of its POST body. It also proves that clearing a branch availability override leaves a globally unavailable dish unchanged. Early failed test-fixture screenshots remain available; `browser-results.json` records the final clean run.

The initial broad root run covered 2,178 tests: 2,174 passed immediately, three timed out and one process-supervisor timing assertion failed under load. The affected 25-test selection then passed except for two Windows DPAPI sealing tests; those two passed with a 30-second timeout, with actual durations around 6.5 and 6.2 seconds. No security verification or production behavior was weakened to make them pass. The report distinguishes this union of verified tests from a single clean all-suite run.

Relevant final checks include the plan matrix and navigation tests, multi-branch dashboard tests, owner-console licensing and tenant-session enforcement. The multi-branch suite also measures 10,000 sales and a fleet larger than the 1,000-device response cap; all aggregate totals remain exact.

## Changed production files for this follow-up

- `apps/restaurant-system/pos-admin/src/App.tsx`
- `apps/restaurant-system/pos-admin/src/navSections.ts`
- `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`
- `apps/restaurant-system/pos-admin/src/components/dashboard/BranchBusinessDashboard.tsx`
- `apps/restaurant-system/pos-admin/src/components/dashboard/dashboardDrilldown.ts`
- `apps/restaurant-system/pos-admin/src/components/dashboard/AttentionTasks.tsx` (new)
- `apps/restaurant-system/pos-admin/src/components/dashboard/PlanOnboarding.tsx` (new)
- `apps/restaurant-system/pos-admin/src/components/dashboard/OnboardingChecklistCard.tsx`
- `apps/restaurant-system/pos-admin/src/components/settings/SettingsScopeNotice.tsx` (new)
- `apps/restaurant-system/pos-admin/src/components/menu/BranchAvailabilityNotice.tsx` (new)
- `apps/restaurant-system/pos-admin/src/components/menu/MenuCategoriesModule.tsx`
- `apps/restaurant-system/pos-admin/src/components/orders/OrdersModule.tsx`
- `apps/restaurant-system/pos-admin/src/components/billing/BillingInvoicesModule.tsx`
- `apps/restaurant-system/pos-admin/src/components/sync/SyncHealthPanel.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrOnboarding.tsx`
- `cloud/api/src/modules/dashboard/tenant-dashboard.controller.ts`
- `cloud/api/src/modules/dashboard/tenant-dashboard.service.ts`

Tests: `tests/owner_daily_flow.test.tsx`, additions in `cloud/api/test/multi-branch-dashboard.e2e.spec.ts`, and `browser-daily-flow.cjs` in this report directory. Prior owner-console work remains in the worktree and has not been discarded.

## Recommended next changes

| Priority | Improvement | Why it matters / acceptance condition |
| --- | --- | --- |
| 1 | Explicit branch product grants | Model commercial grants separately from ordering switches. Enforce them at activation, request authorization, QR resolution, device quotas and offline cached-entitlement renewal. Preserve existing restaurant-wide grants by default. Verify Branch A POS-only and Branch B Kiosk+QR without cross-branch access. |
| 2 | Configurable preparation SLA | Replace the fixed 20-minute attention threshold with branch/station limits. Paused orders, scheduled pickup and payment-pending attempts should not generate premature alerts. |
| 3 | Extend failure recovery across apps | Existing print-queue and sync tools should expose one next action and its retry result directly from the attention task. Keep collection retries idempotent. |
| 4 | Expand existing shift handovers | Captain already transfers tables with outstanding amounts and ready-ticket counts; POS has closing notes and cash reconciliation. Add itemized unresolved requests and held orders, with receiving-staff acknowledgement, to these existing flows. |
| 5 | Broader customer-page previews | Extend the existing QR and welcome-screen previews to full kiosk menu, cart and checkout copy. Preview several languages and long restaurant/dish names, including phone and landscape layouts. |
| 6 | Extend configuration history across modules | Kiosk welcome screens already have version/delivery information and restoration. Add a consistent changed-fields and target-branches review for other settings; keep financial records outside configuration rollback. |
| 7 | Operational onboarding evidence per channel | A single paid test proves one selected source, not every enabled source. Track POS, Captain, Kiosk and QR acceptance separately, and track the QR online-payment acceptance record independently. |

These are further recommendations, not claims of functionality implemented in this follow-up. Business navigation and role views do not replace backend permissions or real-device acceptance.

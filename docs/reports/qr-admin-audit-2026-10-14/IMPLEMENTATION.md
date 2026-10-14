# QR Admin fixes and shared loyalty CRM

14 October 2026. Follow-up to [the QR Admin audit](REPORT.md). These changes fix the twelve confirmed defects in that assessment and add a licensed customer/loyalty workspace. They are implemented and tested locally; this report does not claim a production deployment.

## Fixes against the audit

| Finding | Implemented behavior | Evidence |
| --- | --- | --- |
| QR01 — incorrect partial-cash prompt | Order rows include the authoritative payment balance. The confirmation shows the total, previous collections and **remaining amount received now**. Quick settlement records that remainder in the audit metadata. A ₹199 bill with ₹25 already collected asks for ₹174. | Browser confirmation and backend partial-collection regression. |
| QR02 — older unpaid bills hidden | New branch-scoped, server-filtered order listing with cursor pagination, actionable/unpaid/history views, search and restaurant-date filters. Collections also uses the paged listing and can refresh an old selected bill directly. Order identity includes calendar date. | Browser found an unpaid 2024 bill behind 60 newer records. History returned 50 + 11 records; backend tested scope, cursor and remaining balance. |
| QR03 — Back loses branding draft | Browser Back uses the workspace leave confirmation; Keep editing preserves the form and URL. Branch switching uses the same confirmation. | Browser Back regression passed. |
| QR04 — translation/promotion draft loss | Translation and promotion drafts participate in navigation protection. Changing translation records asks before replacing text. Promotion edit switching/cancellation and counted-stock selection protect unsaved changes too. | Translation and promotion browser checks; additional point-form close protection. |
| QR05 — rejected rules erase edits | Failed saves retain the entered values and show an inline error. Numeric bounds are visible in the controls. | Browser submitted invalid preparation minutes, received HTTP 400 and retained the draft. |
| QR06 — inaccessible QR popup | Named dialog, focus inside on open, trapped Tab, Escape close and focus restoration through the shared dialog hook. | Table QR browser regression. |
| QR07 — inaccessible order details | Uses the shared modal instead of an independent overlay. | Order-details focus/Escape browser regression. |
| QR08 — small touch controls | QR workspace buttons have a 44 px minimum height; compact row actions and colour controls have larger hit areas. | Phone menu measurement and screenshot. |
| QR09 — long duplicate menu views | Separate **Edit shared draft** and **Published guest availability** views. Availability groups page in sets of 24 and retain search. Switching protects unsaved edits. | Browser verified separate headings, bounded rows, touch targets and no phone overflow. |
| QR10 — UTC/restaurant reporting mismatch | Menu Performance and Feedback share server-side restaurant/branch calendar boundaries. Daily trends and hourly groups use the same timezone. Standalone QR Admin loads its configured timezone before rendering date defaults. | API tests verified 23-hour and 25-hour New York calendar days and rejected impossible/reversed dates. |
| QR11 — broken promotion currency | Shared INR formatting and readable separators replace literal placeholder characters. | Source change in `QrPromotions.tsx`; original API promotion coverage retained. |
| QR12 — technical daily-control labels | Order and service filters display staff-facing labels while retaining the existing status values and transition rules. | Shared service/order controls typechecked; canonical transition tests passed. |

Navigation protection warns before discarding edits; it does not promise to recover drafts after a browser crash or power failure.

An additional close-draft check found the navigation confirmation could be covered by the CRM form. The confirmation now renders after page dialogs, above the mobile sidebar, with pointer access to its controls. The failing capture is retained alongside the final retest.

## Customers & Loyalty

Open **QR Admin → Customers & Loyalty**. Access follows the existing `QR_LOYALTY` entitlement; plans without it show a feature request rather than enabling it locally.

- Create, search and edit customer profiles with a shared restaurant phone identity. New profiles start at zero points.
- Inspect current points, the reasoned point ledger and verified QR order history for the selected branch.
- Grant or subtract points with a mandatory reason. Negative balances are rejected; retries reuse an adjustment reference; stale concurrent writes are rejected rather than overwriting another cashier's change.
- Owners configure the restaurant-wide earning rule and create/edit/pause fixed bill rewards. Managers can manage customers within their authorized branch workspace; they cannot change the shared program/rewards.
- Program readiness separately shows the shared program status, selected-branch QR loyalty switch and phone-verification provider readiness. A direct settings action guides the owner when QR rewards are disabled.
- The CRM uses the existing `CUSTOMER`, `LOYALTY_PROGRAM_SETTINGS` and `LOYALTY_REWARD` entities. It does not create another point balance. QR loyalty/customer ledger mutations now advance the sync sequence, so incremental POS pulls receive them.
- Existing payment-confirmed earning, verified redemption, reservation release and refund reversal continue through the canonical QR payment/loyalty engine. Service completion alone does not mean payment collection.

For the requested example: grant Daksh **200 points** with a reason; enable the shared earning program; create an active **₹100 bill discount costing 150 points**; enable verified QR loyalty for the branch. A guest chooses whether to redeem after phone verification. Actual customer SMS delivery requires a configured provider. Existing item rewards remain managed through Restaurant Admin; this new QR form authors fixed bill rewards.

Profiles and point balances are restaurant-wide. The displayed QR order history follows the selected branch. This scope is stated in the UI.

## Verification

- API TypeScript check and Nest build passed.
- Restaurant Admin / standalone QR Admin TypeScript check and production frontend build passed. Vite retains its existing large-chunk warning; the build completed.
- **116 tests passed across four backend integration suites**: QR module, mobile payments, QR operations and multi-branch dashboard. These cover payment retries, partial balances, licensing, branch boundaries, canonical order routing, customer synchronization, negative points, duplicate adjustments, stale writers, manager/owner restrictions and restaurant-time ranges. [Build/test summary](evidence/backend-fix-verification.json).
- **8/8 browser regression scenarios passed**: Back protection, translation warning, failed-save recovery, two accessible dialogs, partial-cash prompt, bounded mobile menu and shared customer/program/reward/point flow. [Structured result](evidence/fix-verification.json).
- Separate browser test found the old unpaid bill and verified history pagination. [Structured result](evidence/older-bill-verification.json).
- **4/4 additional browser checks passed** for promotion drafts, translation-record switching, point-form close protection and confirmation layering above the mobile sidebar. [Structured result](evidence/draft-verification.json).

Screenshots: [partial collection](evidence/fixed-partial-cash-confirmation.png), [older bill](evidence/fixed-older-unpaid-bill.png), [phone menu](evidence/fixed-menu-phone.png), [point history](evidence/crm-points-history.png), [phone CRM](evidence/crm-phone.png), [readiness](evidence/crm-readiness-desktop.png).

The backend runner is [backend-fixes.cjs](backend-fixes.cjs); it explicitly uses the existing private isolated-test fixture. Browser runners are [browser-fixes.cjs](browser-fixes.cjs), [browser-orders-fixed.cjs](browser-orders-fixed.cjs) and [browser-drafts-fixed.cjs](browser-drafts-fixed.cjs). Credentials stay in the ignored private fixture. Temporary historical orders are deleted in a `finally` block.

The isolated fixture's optional entitlement configuration was restored after verification. Audit-labelled customers, rewards and point adjustments remain in that test tenant for review; no production customer balances or plans were modified.

An initial final backend invocation picked a separate, outdated test database from `.env` and failed during fixture setup because `Restaurant.operatingProfile` was absent. The explicit isolated-fixture runner corrected the environment; the full rerun passed. Earlier browser failures from stale same-name test selection were corrected by selecting the unique phone and awaiting the actual saved response. Historical audit/failure evidence remains available rather than being represented as passing results.

## Main files

| Area | Files |
| --- | --- |
| New private CRM | `cloud/api/src/modules/qr/qr-crm.service.ts`, `qr-crm.controller.ts`, `qr.module.ts`; `apps/restaurant-system/pos-admin/src/components/qrconsole/QrCrm.tsx`, `qrNavigation.ts` |
| Auth and ledger synchronization | `cloud/api/src/common/guards/device-auth.guard.ts`, `modules/qr/qr-loyalty.service.ts`, `modules/payments/qr-loyalty-ledger.ts` |
| Order listing and collections | `cloud/api/src/modules/qr/qr-admin.service.ts`, `qr.controllers.ts`, `modules/order-sync/order-sync.service.ts`; frontend `cloud/qrAdminClient.ts`, `QrAdvanced.tsx`, `QrCapabilities.tsx` |
| Reporting dates | `cloud/api/src/modules/qr/qr-report-range.ts`, `qr-operations.service.ts`, `qr-advanced.service.ts`; frontend `QrOperations.tsx`, `qr/QrWorkspace.tsx` |
| Navigation and UI | `QrConsole.tsx`, `useQrUnsavedChanges.ts`, `QrPromotions.tsx`, `QrCountedStock.tsx`, `qr/workspace.css`; `packages/ui/src/QrServiceInbox.tsx` |
| Added backend regressions | `cloud/api/test/multi-branch-dashboard.e2e.spec.ts`, `qr-operations.e2e.spec.ts` |

## Recommended next features

**Now implemented:** [Recommended features, usage and verification](RECOMMENDED_FEATURES.md). The list below preserves the recommendations that motivated this follow-up.

These are additions, not unresolved reproductions of QR01–QR12.

1. **QR-only onboarding wizard:** cuisine template, categories, dishes, images, variants/add-ons, taxes and publication review in one guided flow.
2. **Payment acceptance wizard:** merchant readiness plus a real phone checkout/return/verification checklist; saved credentials alone are insufficient.
3. **Unified order/payment timeline and daily reconciliation:** direct ledger navigation and collection-date totals by collector and branch.
4. **Service ownership and pickup calendar:** assign a named responder, escalate overdue requests, show pickup slots and handover responsibility.
5. **Bulk QR print pack:** ZIP/PDF sheets and replacement inventory to help owners identify invalid cards after regeneration.
6. **CRM consent and follow-up controls:** consented communications, customer segmentation, reward-expiry policy and a controlled export. Sending campaigns needs an explicit permission/consent workflow and configured transport.

Real UPI/bank settlement, SMS/SMTP/WhatsApp delivery, physical printers/scans and production deployment remain separate acceptance steps. Provider transport in these tests was simulated; tenant authentication, entitlement checks, payment signatures, database transactions and branch rules were exercised locally.

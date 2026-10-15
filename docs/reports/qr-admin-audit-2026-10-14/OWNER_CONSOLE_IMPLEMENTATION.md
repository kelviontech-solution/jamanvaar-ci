# Unified owner console and generic QR module

Completed locally on 15 October 2026, following [PLAN_FLOW_REVIEW.md](PLAN_FLOW_REVIEW.md). The review's findings describe the starting state; this report describes the resulting implementation. No production deployment or native installer release was performed.

## Owner experience

| Licensed management setup | Result |
| --- | --- |
| Restaurant Admin only | Opens Restaurant Admin automatically. Kiosk management and enabled QR tools are absent. |
| Restaurant Admin + QR | Full QR management opens from the Restaurant Admin sidebar. |
| Kiosk Admin only | Opens the focused Kiosk Admin automatically, retaining its management functions. |
| Kiosk Admin + QR | Full QR management opens from the Kiosk Admin sidebar. |
| Both admins / full suite | One Restaurant Admin console exposes the licensed Kiosk Management and QR sections. No required application dropdown or product chooser. |
| Standalone QR | The common owner entry activates the management device and opens `/qr/admin/`. Dedicated QR login remains available. No POS, KDS, Captain or other admin subscription is required. |
| Operational terminals + QR, without other admin licenses | Opens QR Admin; terminal rights do not grant unrelated Restaurant Admin resources. |

The branch remains prominent and the sole accessible branch is automatically selected. Switching management sections does not change the registered terminal's branch or create another owner account. Existing Kiosk Admin deep links map to equivalent Restaurant Admin tasks for full-suite owners. Disabled modules and invalid deep links still have explicit recovery screens.

POS, customer Kiosk, Captain and KDS remain separate operational applications. The management console does not absorb their customer/staff flows. Shared menu, team, customer and device tools retain their existing canonical data. Full-suite order reporting retains the existing source filters rather than creating another kiosk-only order database.

## QR parity and navigation

Restaurant Admin and Kiosk Admin now use the same QR workspace navigation as standalone QR Admin. While QR is open, its navigation replaces the outer management sidebar; **Back to management** returns to the owner dashboard. There are no simultaneous nested sidebars or wrapped walls of QR tabs.

Live operations lead the navigation, followed by menu/guests, setup, branding, insights and advanced configuration. All 20 QR pages are reachable. Menu editing is available inside QR in every host; the shared draft and published availability are separate selectable views. Kiosk-hosted menu links stay within the appropriate management entry.

Unsaved QR edits are protected when changing QR pages, returning to management, changing branches and using browser Back. Keeping a draft does not unmount the editor. Branch changes still flush durable storage before reloading into its scoped database.

## Super Admin and plan controls

- Super Admin can create a **Standalone QR** plan in the plan form and select Restaurant or Kiosk product family.
- Optional QR plan flags are loaded from the real feature catalogue. **Include all QR capabilities** grants the catalogue's QR flags explicitly; platform activation and rollout remain authoritative.
- A new QR-tier plan defaults to QR itself, rather than implicitly granting POS, Restaurant Admin, Captain and KDS. Explicit additional plan flags/app assignments still work. Existing stored entitlement rows are not rewritten by this change.
- The restaurant QR editor controls all 17 optional capabilities and displays their current availability separately from their configured grants. It supports loyalty, service, pickup, translations, branding, promotions, feedback, split payment and the other existing capabilities.
- Live-service pause is separate from module entitlement. Pausing guest ordering preserves the owner's licensed management access; it no longer revokes the whole QR product as a side effect.
- Platform restrictions on digital menu, online payments, guest customization, tracking and analytics are enforced in the backend. An online-payment grant does not fabricate merchant readiness or a successful collection.
- A restaurant-wide change applies to all current QR subscription rows atomically, with audit records. An error on one row rolls back the whole change. Unknown fields and invalid capability values are rejected.
- Optional QR capabilities combine across live granting subscriptions. A per-row override replaces that row's plan flag; another purchased grant can still include the capability. Platform restaurant overrides update all current grants to avoid a second subscription keeping a revoked capability alive.
- Capacity uses the largest purchased finite cap; an unspecified/null cap is unlimited. Disabling one subscription does not revoke a distinct active purchased subscription. Expired subscriptions and inactive/deleted restaurants no longer populate usable navigation grants.
- Branch Core fleet data recognizes QR-only management devices. The physical management device remains `POS_ADMIN`; this identity never substitutes for its actual licensed permissions.

## JAMAN AI

JAMAN AI resolves all current subscriptions, including explicit assistant grants on QR plans and Enterprise access. A newer base subscription no longer hides another valid assistant grant. An expired restaurant subscription cannot regain online AI access merely through an ON override.

The QR workspace now provides server-backed **QR sales today**, **QR orders today** and **QR setup snapshot** in all three hosts. These use canonical records for the selected branch or authorized restaurant-wide scope. Platform-disabled questions are not offered. The existing assistant remains in the operational applications; the shared access decision and quota fixes apply to them as well.

Every new QR insight records usage through the authenticated server. Concurrent requests across devices cannot exceed the restaurant's daily query cap. QR-only devices can fetch their own configuration and record usage without acquiring inventory or customer-sync privileges.

Super Admin's AI profile fetch ignores stale responses when the selected restaurant changes. Load failures are visible even before any profile loads. The selected restaurant is locked while a save is pending, and a rejected save preserves the selection. This remains calculated, rule-based business intelligence, not an added external language-model service.

## Additional defects found and fixed

1. **Blank kiosk menu after imported records:** the shared status badge called `.replace()` on missing dietary metadata. Missing/unknown classifications now display **Diet not specified** and do not claim vegetarian status. Browser ordering reaches cart and payment again.
2. **Owner sign-in without a mobile number:** onboarding could produce a null Restaurant ID. New restaurants without a mobile receive a unique generated `JM` code usable for owner sign-in. Existing mobile-based identities are preserved.
3. **Old entitlement cache after rejection:** QR's 401/403 responses no longer fall back to a cached enabled grant. Network/offline fallback remains distinct from an explicit authorization rejection.
4. **AI telemetry tests assuming an empty shared QA database:** comparisons now use platform-context totals and exact fixture-level usage/latency, without deleting other restaurants' records.

## Verification

| Check | Final result |
| --- | --- |
| Complete shared-app/offline runtime test suite | **2,172 passed**, 306 files. Includes the 128 application-entitlement combinations and dietary metadata regressions. |
| Backend integration selection | **297/297 passed**, 20 suites. Real authentication, tenant isolation, plan resolution, transaction rollback, concurrent quota, QR payments, canonical status, sync and multi-branch/device behavior. Final owner/legacy-cap compatibility recheck: **16/16 passed**, including one additional unique regression. Backend coverage totals **298 unique tests** across these runs. |
| Focused navigation recheck after final ordering change | **150 passed**, four existing suites; these are reruns, not additional unique coverage. |
| Owner console / QR / Super Admin browser checks | **51/51 passed**. Seven plan setups, all 20 QR pages in the integrated host, mobile navigation, shared draft access, actual capability-save/readback and unsaved-draft protection. [Results](evidence/owner-console-browser.json). |
| Operational-app browser regressions | **25/25 passed**. POS management screens, Captain tables/orders/requests/performance, KDS status views and kiosk welcome/menu/cart/payment. Desktop and phone layouts captured where appropriate. [Results](evidence/all-app-browser-regression.json). |
| Super Admin AI recovery checks | **2/2 passed**. Simulated list outage and save rejection; no production configuration changed. [Results](evidence/owner-console-super-recovery.json). |
| Production-mode web builds | Restaurant/Kiosk Admin and QR product entry, POS, Kiosk, Captain, KDS, Super Admin and QR Guest built successfully. API build passed. |
| Type checks | Admin, POS, Kiosk, Captain, KDS, Super Admin and QR Guest passed. API type validation passed through the Nest build. |

Combined unique automated checks: **2,470** shared-app/backend tests. Browser scenarios: **78**. These counts are not a claim to cover every conceivable action or device condition. Build/type results and evidence are recorded in [owner-console-verification.json](evidence/owner-console-verification.json). Legacy finite QR caps remain enforced; an explicit null can still remove a cap.

The web verification harness uses optimized Vite builds and serves existing public assets from their repository directories to avoid repeatedly copying the image library. These QA build directories are not release packages. Normal release builds must include their public assets.

## Changed production files

Paths below are relative to the repository root.

| Area | Files |
| --- | --- |
| Owner composition and routes | `apps/restaurant-system/pos-admin/src/adminProducts.ts`, `navSections.ts`, `hooks/useAdminProduct.ts`, `App.tsx`, `components/header/AdminBranchWorkspace.tsx`. |
| Shared QR experience | `apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx`, `QrAdvanced.tsx`, `qrNavigation.ts`, `useQrEntitlement.ts`, new `QrAiAssistant.tsx`; `src/qr/QrWorkspace.tsx`, `workspace.css`. |
| Entitlement, activation and fleet enforcement | `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`, `src/common/security/admin-product-access.ts`, `src/modules/tenant-auth/tenant-auth.service.ts`, `src/modules/devices/devices.service.ts`. |
| QR platform/guest controls | `cloud/api/src/modules/qr-ordering/qr-ordering.service.ts`, `src/modules/qr/qr-settings.service.ts`, `qr-public.service.ts`, `qr-admin.service.ts`. |
| AI and restaurant identity | `cloud/api/src/modules/ai-assistant/ai-assistant.service.ts`, `src/modules/restaurants/restaurants.service.ts`. |
| Super Admin | `cloud/super-admin-web/src/api/types.ts`, `src/pages/Plans/PlanFormModal.tsx`, `src/pages/QrOrdering/QrEntitlementEditor.tsx`, `QrRestaurantDetailPanel.tsx`, `src/pages/AiAssistant/AiRestaurantAccess.tsx`. |
| Imported-menu safety | `packages/ui/src/StatusBadge.tsx`. |

Frontend/backend tests, browser runners, captures and this report accompany these changes. Earlier QR features remain in their existing shared components.

Earlier failed runs are retained in the ignored `.jamanvaar` logs. Three shared tests asserted the old layout and were updated to verify the new access/selector behavior. The kiosk browser failure was an actual application defect. Later browser selectors needed to wait for the startup overlay and account for the QR On badge; those corrections did not weaken authorization or clear real data.

## Reproduction and evidence

- [owner-console-tests.cjs](owner-console-tests.cjs) selects the 20 backend suites and refuses a non-test database.
- [browser-owner-console.cjs](browser-owner-console.cjs) provisions audit-labelled isolated plan/restaurant fixtures, uses actual owner activation and Super Admin login, and verifies the new journey.
- [browser-app-regression.cjs](browser-app-regression.cjs) uses existing isolated staff/device fixtures for the operational apps.
- [browser-super-recovery.cjs](browser-super-recovery.cjs) simulates provider failures at the browser boundary and does not commit a rejected AI save.
- [Final QR navigation](evidence/owner-console-final-overview.png), [full-suite QR overview](evidence/owner-console-full-page-OVERVIEW.png), [full-suite kiosk management](evidence/owner-console-full-kiosk-welcome.png), [QR-only phone](evidence/owner-console-qr-qr-phone.png), [kiosk menu after repair](evidence/all-apps-kiosk-menu.png), [Super Admin capabilities](evidence/owner-console-super-qr-capabilities.png).

The QA API blocks external network transport. Credentials, activation keys, signing material and database connection values remain in ignored private files. Temporary browser-plan restaurants are archived after scenarios; existing isolated operation fixtures retain their audit-labelled test orders/menu records. Production data was not used.

## Release boundaries and remaining improvements

- This changes source and local verification builds. Deployment must release the API, admin/QR product frontend and shared-UI consumers. Native APK/EXE packages were not rebuilt or installed in this task.
- Existing subscription rows keep their current grants. Review legacy QR bundles when selling or renewing plans; do not silently revoke operational products that customers already purchased.
- Subscription rights remain restaurant-scoped. Branch settings and device/record isolation are enforced, but selling independent product licenses per branch still needs an explicit branch-entitlement model. This task does not pretend an ordering switch is a branch license.
- Real merchant payment-app return, webhook delivery, physical receipt printing and offline native deployment require acceptance on the actual devices/providers. Gateway transport in automated integration tests is simulated; no real customer was charged.
- The QR assistant's new answers cover the three listed canonical insights. More conversational questions, notification campaigns and additional dashboard intelligence remain product enhancements.
- Vite still reports large chunks. Splitting rarely used menu-template/setup tools into lazy bundles would reduce initial loading; no signature, offline billing or SQLite policy was weakened to improve a test result.

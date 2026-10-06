# Shared platform, separate admin experiences

Investigation completed before implementation, 2026-10-06. Scope: existing owner console and its two actual AppCodes, POS_ADMIN (Restaurant Admin) and KIOSK_ADMIN. POS, KDS, Captain and customer Kiosk remain separate assigned terminals. No new subscription products, standalone binary or database migration.

## Confirmed root causes

1. `02f2451` removed `apps/kiosk-system/kiosk-admin`, its nginx locations and runtime service. Earlier relocation commits moved functionality into pos-admin: `a793b72` fleet, `d956cea` coupons, `f89be07` languages/idle/token settings, `344eee2` hardware/feedback, `3607ddb` receipts. The deleted App.tsx at `02f2451^` had its own dashboard, menu, combos, orders/KDS, tables, terminals, coupons, receipts, hardware, feedback, reports, staff, sync, audit, license and settings.
2. Current App.tsx has one Restaurant Admin header and one NAV_SECTIONS registry. Kiosk settings are mixed into Restaurant Settings. There is no selected product or route resolver.
3. `6ef32d8` remembers a valid tab in `jamanvaar_pos_admin_active_tab`, shared across products and restaurants. This repairs tab loss but cannot restore an application context or deep link. There is no popstate handling.
4. Auth correctly registers the physical shared console as POS_ADMIN. `09d8d0b` allowed either admin entitlement at activation and DeviceAuthGuard. This alias must remain for old devices, but device type alone cannot enforce POS-only versus kiosk-only resources. Entity-sync's existing device-type write authority permits POS-only data for kiosk-only shared consoles.
5. First-login activation copy hardcodes Restaurant Admin / POS_ADMIN and separates account invitation activation from device activation without clearly explaining either. Background sync starts solely on a device credential, including before owner login, and sends inventory/customer/shift/reservation work on kiosk-only plans.

## Feature recovery comparison

| Feature | Old Kiosk Admin | Before this change | Action |
|---|---|---|---|
| Identity/dashboard/onboarding | Own shell and kiosk checklist | Restaurant dashboard, POS/Captain tasks | Dedicated kiosk dashboard and product switcher |
| Menu/categories/templates/prices/images/options | Own menu | Shared complete editor, new selective templates | Reuse editor in kiosk routes |
| Combos/coupons | Own pages | Separate kiosk combos; coupons in general nav | Restore kiosk navigation, same data and publication |
| Orders/KDS | Own queue | Hidden by POS_ADMIN nav gate | Expose existing real order/kitchen modules for kiosk entitlement |
| Floor/staff | Own pages | Hidden on kiosk-only plan | Restore existing management modules with server entitlement checks |
| Appearance/welcome/translations | Settings plus welcome editor | Available appearance panel buried in combined nav | Dedicated appearance route |
| Languages/keyboard/idle/token sequence | Settings | Mixed Restaurant Settings | Dedicated kiosk settings |
| Receipts/printer routing/queue | Own pages | Shared actual components | Preserve in kiosk navigation |
| Payment/payouts | Razorpay, statements/refunds and net payable | POS payment nav hidden; kiosk setup in Restaurant Settings | Dedicated kiosk payments and settlement configuration |
| Feedback | Own page | Embedded in fleet | Dedicated feedback route |
| Fleet | Own page | Real lock/logout/sync/diagnostics | Dedicated terminals route, actual metadata; no invented registration/update APIs |
| Reports/sync/audit/license/backup | Own screens | Shared screens | Reuse supported screens in own shell |

Cashfree was explicitly removed in `883a9cc`; it is not a missing recoverable provider. Device reset/removal/update remain platform or backend-controlled; no fake owner actions. Route settlement is pending and must remain a request, not activation. Unsupported fonts/orientation/layout controls must not be invented.

## Implementation sequence

1. Add typed, centralized product/page route registry. Server applications determine availability; tenant-scoped remembered selection is only a preference. Explicit deep links take precedence, unknown/denied links fail closed. History handles back/forward. Hold application rendering until auth/entitlements resolve.
2. Separate existing navigation and header identity, add a two-product chooser only when required, remember each product's page. Restore existing kiosk modules and a kiosk-specific dashboard with clear onboarding links.
3. Simplify login copy and explain first-device key once. Preserve existing key verification, expiry, quota, tenant binding and owner password checks.
4. Enforce shared-console resource entitlements server-side, limit kiosk-only fleet to kiosks, gate tenant payment setup. Sync only entitled resources and only after login.
5. Add nginx aliases to the same physical console with deep-link asset handling. Validate unit, backend and Playwright flows: kiosk-only, restaurant-only, both, switch/refresh/deep link/back-forward/logout/reopen, revoked access and tenant isolation. Record exact results and remaining limitations.

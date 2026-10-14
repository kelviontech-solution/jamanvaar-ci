# QR access and owner workspace flow review

14 October 2026. Source review of the current local workspace. This assessment does not represent a new production browser test or deployment, and does not change application behavior.

## Assessment

The workspace dropdown is a reasonable way to switch between separately licensed applications. The current QR placement does not yet satisfy the requested plan combinations. Shared authentication and data should support separate application experiences; purchasing several products should not reduce the features available in any one of them.

## Confirmed current gaps

| Finding | Evidence | Effect |
| --- | --- | --- |
| Kiosk Admin has no QR page or navigation entry. | `src/adminProducts.ts`: `PRODUCT_PAGES.KIOSK_ADMIN`; `src/navSections.ts`: kiosk navigation groups. | A Kiosk + QR customer cannot manage QR from that workspace. Adding a menu label alone would not fix the route whitelist. |
| The shared owner workspace picker supports only Restaurant Admin and Kiosk Admin. | `src/adminProducts.ts`: `AdminProduct`, `availableAdminProducts`; `src/components/auth/ProductPickerScreen.tsx`. | A QR-only customer entering the shared console has no eligible admin product there, although the dedicated `/qr/admin/` entry supports QR. |
| Restaurant Admin and standalone QR have different navigation presentations. | `src/App.tsx` renders `QrConsole` with its default embedded layout; `src/qr/QrWorkspace.tsx` uses `layout="workspace"`. | The same feature implementation appears as wrapped horizontal tabs in Restaurant Admin and as a sidebar in QR Admin. This makes the experience inconsistent. |
| Base QR access is distinct from optional feature access. | `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`: `resolveQrCapability` and `resolveQrCapabilities`. | Loyalty, service and pickup capabilities also require their plan flags and active rollout. Buying QR alone does not automatically grant every optional capability. |
| QR licensing is restaurant-scoped; branch switches are operating settings. | `Subscription` and `ApplicationEntitlement` in `cloud/api/prisma/schema.prisma`; `qr-public.service.ts` resolves the restaurant's QR entitlement and then branch settings. | Branch-specific ordering can be enabled/disabled, but this is not itself a branch-specific subscription entitlement. If products are sold per branch, a separate server-enforced branch entitlement policy is needed. |

Frontend paths in this table are relative to `apps/restaurant-system/pos-admin/` unless otherwise qualified. These findings concern entry, visibility and licensing flow; they do not mean the implemented QR operations are all missing from the shared component.

## Recommended plan-to-workspace behavior

| Effective licensed products | Default owner workspace | QR management access |
| --- | --- | --- |
| Restaurant Admin, no QR | Restaurant Admin | No enabled QR tools; optional clearly labelled upgrade entry. |
| Restaurant Admin + QR, with any POS/KDS/Captain combination | Restaurant Admin | Full licensed QR workspace from a QR Ordering sidebar entry. |
| Kiosk Admin, no QR | Kiosk Admin | No enabled QR tools. |
| Kiosk Admin + QR | Kiosk Admin | The same full licensed QR workspace from its sidebar. |
| QR only | QR Admin | All core QR tools and every optional feature included in that QR subscription; no POS/Kiosk prerequisite. |
| POS/KDS/Captain + QR, without either other admin entitlement | QR Admin | Terminal licenses should not require buying Restaurant Admin to administer the independently licensed QR module. |
| Restaurant Admin + Kiosk Admin + QR | Last eligible workspace, or an initial workspace choice | QR accessible from both admin workspaces; same records and configuration, with QR Admin also available as a focused workspace. |

“Full QR workspace” means the same complete feature system regardless of entry. If all features are intended to come with every QR purchase, the plan definitions must explicitly include them. Otherwise label optional capabilities as “Included”, “Upgrade required” or “Unavailable”, consistently in every host. Do not grant features from a browser dropdown or local setting.

## Simpler owner journey

1. Platform administrator onboards the restaurant, assigns products, features and device limits, and provisions the owner. Bind staff and devices to their appropriate branches.
2. Owner signs in through one owner entry. Perform activation once when required for a new console, rather than asking for a new activation key on every workspace switch.
3. Resolve current server-authorized workspaces. Open the only workspace automatically; otherwise reuse the last still-authorized selection or show a short initial choice.
4. Select the branch once. Keep the branch when switching workspaces where the user has access; display it prominently. Restaurant-wide summaries must be clearly distinguished from branch operations.
5. Show task-based navigation for the selected workspace. QR opens consistent navigation for orders, menu, tables, payments, customers and setup. Avoid nested sidebars or a large wall of tabs.
6. Switching workspaces preserves the session, respects unsaved edits and changes presentation only. It must not duplicate menus, customers, orders or payment records.

The top control should be labelled **Workspace** and show only licensed choices. Do not put customer-facing POS, Captain, KDS or Kiosk terminals into an owner-admin dropdown; their activation and staff/device operation remain separate. Keep `/qr/` for discovery and `/q/` for guests.

## Decisions and verification needed before calling this complete

- Add QR to the Kiosk Admin route map and navigation, with the QR entitlement checked separately from the host workspace entitlement.
- Let a QR-only owner reach QR Admin from the shared owner entry. Preserve the dedicated QR login route as a convenient entry.
- Use consistent QR navigation and feature access across the three host experiences. Menu creation/publication must remain available to standalone QR owners and Kiosk + QR owners.
- Define how overlapping subscriptions combine optional QR features and limits. Current `resolve` uses one granting subscription's flags/config rather than merging every granting subscription; the policy needs deterministic selection or explicit aggregation tests.
- If licensing is intended per branch, distinguish server-enforced branch product grants from ordinary branch enable/disable settings.
- Test QR-only; Restaurant Admin + QR; Kiosk Admin + QR; both admins + QR; terminal products + QR without the other admins; multiple subscriptions; plan downgrade/expiry; owner versus manager; branch switching; direct links; unsaved changes; and refreshed sessions. Verify API denials as well as visible navigation.

Recommended implementation order: fix licensed entry and Kiosk QR access first, unify QR navigation second, then complete mixed-subscription and branch-policy acceptance tests.

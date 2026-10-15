# QR access and owner workspace flow review

14 October 2026. Source review of the current local workspace. This assessment does not represent a new production browser test or deployment, and does not change application behavior.

**Implementation update — 15 October 2026:** the owner-console composition, QR access, Super Admin and AI changes are implemented locally. See [OWNER_CONSOLE_IMPLEMENTATION.md](OWNER_CONSOLE_IMPLEMENTATION.md) for current behavior, test results and release limits. The findings and proposed design below preserve the pre-implementation assessment; they are not a list of outstanding defects.

## Assessment

**Daily-flow follow-up — 15 October 2026:** see [the implemented navigation, attention dashboard, onboarding and scope improvements](../owner-daily-flow-2026-10-15/IMPLEMENTATION.md). Branch-specific commercial licensing remains a separate architectural gap.

Revised after the owner's clarification: the application dropdown should not be the primary management flow. A restaurant buying the full suite should have one owner console with licensed management modules in its navigation. Separate operational apps and standalone product entry points remain supported. Purchasing several products should add tools without forcing the owner to choose between Restaurant Admin and Kiosk Admin to complete everyday tasks.

The previous recommendation to remember an admin-workspace choice is superseded by the unified owner journey below. This is a proposed design, not an implemented change.

## Confirmed current gaps

| Finding | Evidence | Effect |
| --- | --- | --- |
| Kiosk Admin has no QR page or navigation entry. | `src/adminProducts.ts`: `PRODUCT_PAGES.KIOSK_ADMIN`; `src/navSections.ts`: kiosk navigation groups. | A Kiosk + QR customer cannot manage QR from that workspace. Adding a menu label alone would not fix the route whitelist. |
| The shared owner workspace picker supports only Restaurant Admin and Kiosk Admin. | `src/adminProducts.ts`: `AdminProduct`, `availableAdminProducts`; `src/components/auth/ProductPickerScreen.tsx`. | A QR-only customer entering the shared console has no eligible admin product there, although the dedicated `/qr/admin/` entry supports QR. |
| Restaurant Admin and standalone QR have different navigation presentations. | `src/App.tsx` renders `QrConsole` with its default embedded layout; `src/qr/QrWorkspace.tsx` uses `layout="workspace"`. | The same feature implementation appears as wrapped horizontal tabs in Restaurant Admin and as a sidebar in QR Admin. This makes the experience inconsistent. |
| Base QR access is distinct from optional feature access. | `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`: `resolveQrCapability` and `resolveQrCapabilities`. | Loyalty, service and pickup capabilities also require their plan flags and active rollout. Buying QR alone does not automatically grant every optional capability. |
| QR licensing is restaurant-scoped; branch switches are operating settings. | `Subscription` and `ApplicationEntitlement` in `cloud/api/prisma/schema.prisma`; `qr-public.service.ts` resolves the restaurant's QR entitlement and then branch settings. | Branch-specific ordering can be enabled/disabled, but this is not itself a branch-specific subscription entitlement. If products are sold per branch, a separate server-enforced branch entitlement policy is needed. |

Frontend paths in this table are relative to `apps/restaurant-system/pos-admin/` unless otherwise qualified. These findings concern entry, visibility and licensing flow; they do not mean the implemented QR operations are all missing from the shared component.

## Recommended plan-to-console behavior

| Effective licensed products | Default owner experience | QR management access |
| --- | --- | --- |
| Restaurant management, no QR | Restaurant Admin | No enabled QR tools. |
| Restaurant management + QR, with any POS/KDS/Captain combination | Restaurant Admin with QR in its sidebar | All licensed QR management functions, without changing applications. |
| Kiosk management only | Kiosk Admin | Kiosk devices, content, menu and other licensed management functions. No enabled QR tools. |
| Kiosk management + QR | Kiosk Admin with QR in its sidebar | The same QR module used by Restaurant Admin and standalone QR Admin. |
| QR only | QR Admin | All core QR tools and every optional feature included in that QR subscription; no POS/Kiosk prerequisite. |
| POS/KDS/Captain + QR, without other admin access | QR Admin plus explicitly included management permissions | Independently licensed QR remains manageable. The plan must define any additional terminal-management access; do not infer unrestricted Restaurant Admin permissions. |
| Restaurant management + Kiosk management + QR / full suite | One owner console, presented as Restaurant Admin | Kiosk Management and QR Ordering are direct navigation sections; no required admin-product switch. |

“Full QR workspace” means the same complete feature system regardless of entry. If all features are intended to come with every QR purchase, the plan definitions must explicitly include them. Otherwise label optional capabilities as “Included”, “Upgrade required” or “Unavailable”, consistently in every host. Do not grant features from a browser dropdown or local setting.

## Simpler owner journey

1. Platform administrator onboards the restaurant, assigns products, features and device limits, and provisions the owner. Bind staff and devices to their appropriate branches.
2. Owner signs in through one owner entry. Perform activation once when required for a new console, rather than asking for a new activation key for each management module.
3. Resolve authorized modules and role permissions on the server. Open the appropriate console automatically: full restaurant console for a full suite, focused Kiosk Admin for kiosk management, or focused QR Admin for QR only. A plan upgrade adds authorized navigation entries after refresh; it must not require creating another owner account.
4. Select the branch only if more than one is available. Auto-select the sole branch. Keep the branch when moving between management modules and display it prominently. Restaurant-wide summaries must be clearly distinguished from branch operations.
5. Show task-based navigation. Shared menu, team, customer and device tools appear once when licensed and permitted. QR and Kiosk retain dedicated settings and operational pages. The same QR pages work in all host consoles. Avoid nested sidebars or a large wall of tabs.
6. Navigation preserves the session, respects unsaved edits and changes presentation only. It must not duplicate menus, customers, orders or payment records. Older admin URLs remain valid deep links or redirect to their equivalent authorized section.

Remove the required admin-application dropdown and product-choice screen from the ordinary owner journey. The header should identify the restaurant, branch and account. If useful, provide an optional **Open apps** launcher under Devices, rather than requiring it for management. POS, Captain, KDS and customer Kiosk remain separate operational apps with appropriate activation and staff roles. Keep `/qr/` for discovery and `/q/` for guests.

## Full-suite navigation example

| Section | Owner tasks |
| --- | --- |
| Today | Branch/restaurant overview, payment and device alerts, outstanding setup tasks. |
| Orders & Payments | Shared order list with POS/Captain/Kiosk/QR source filters; confirmed collections, outstanding balances and refunds. |
| Menu | Shared dishes, categories, templates and options; explicit channel availability and publication state. |
| Tables & Service | Floor, table QR mapping and service requests when included. |
| Kiosk Management | Terminals, per-terminal welcome backgrounds, content, receipts and authorized remote session controls. |
| QR Ordering | QR orders, branding, cards, ordering rules, online checkout, pickup and other licensed QR capabilities. |
| Customers & Loyalty | Shared customer profiles and points, with channel capabilities and role permissions enforced. |
| Team & Devices | Authorized staff, roles, branch-bound devices and connection health. |
| Reports | Restaurant/branch totals and source breakdowns from canonical records. |
| Settings | Identity, shared defaults, explicit product/branch overrides and subscription information. |

This is not a requirement to show every section to every restaurant. Compose navigation from licensed capabilities and the signed-in user's permissions; keep ineligible tools out of the daily sidebar. Explain upgrades and unavailable capabilities in the subscription/features view.

## Architectural boundaries that keep the simpler UI honest

- Use one reusable owner-console shell with module descriptors for navigation, routes, roles and required capabilities. Standalone QR/Kiosk use focused compositions of that shell; they do not require separate copies of shared management features.
- Separate console presentation from authorization. A full-suite shell must not grant Restaurant Admin resources to a QR-only owner or Kiosk-only manager. APIs check the required module and action independently of the current URL or header label.
- QR remains an independently sellable module: one implementation, one set of canonical records and the same licensed feature depth in each host. Full QR subscriptions should explicitly include all intended features.
- Common settings have explicit scopes. For example, shared merchant defaults and QR online-checkout rules are distinct settings with clear inheritance; editing one channel must not silently replace another's configuration.
- Product upgrades, expiry and branch changes must refresh permissions predictably. Preserve unsaved drafts and provide an explanation if access changes; do not silently fall back to another tenant or branch.

## Decisions and verification needed before calling this complete

- Add QR to the Kiosk Admin route map and navigation, with the QR entitlement checked separately from the host workspace entitlement.
- Let a QR-only owner reach QR Admin from the shared owner entry. Preserve the dedicated QR login route as a convenient entry; standalone product branding remains intact.
- Replace the required product-picker/dropdown behavior with capability-composed navigation for full-suite owners. Preserve separate operational applications and their device identities.
- Use consistent QR navigation and feature access across the three host experiences. Menu creation/publication must remain available to standalone QR owners and Kiosk + QR owners.
- Define how overlapping subscriptions combine optional QR features and limits. Current `resolve` uses one granting subscription's flags/config rather than merging every granting subscription; the policy needs deterministic selection or explicit aggregation tests.
- If licensing is intended per branch, distinguish server-enforced branch product grants from ordinary branch enable/disable settings.
- Test QR-only; Restaurant Admin + QR; Kiosk Admin + QR; both admins + QR; terminal products + QR without the other admins; multiple subscriptions; plan downgrade/expiry; owner versus manager; branch switching; direct links; unsaved changes; and refreshed sessions. Verify API denials as well as visible navigation.

Recommended implementation order: define the module/action access matrix and composition rules; implement owner entry and full-suite navigation; reuse the complete QR module in each host; preserve existing links; then run mixed-plan, role, branch, downgrade and end-to-end acceptance tests. This requires both frontend and backend checks, not just hiding the dropdown.

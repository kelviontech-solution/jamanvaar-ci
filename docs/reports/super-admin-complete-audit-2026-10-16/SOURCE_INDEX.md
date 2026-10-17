# Source index

Line numbers refer to the working tree inspected on 16 October 2026. Related methods in the same file are described in the report. These links reference source, not proof that a production integration was exercised.

| Ref | Area | Source |
|---|---|---|
| S01 | Conflict resolution service | [cloud/api/src/modules/sync-observability/sync-observability.service.ts:176](../../../cloud/api/src/modules/sync-observability/sync-observability.service.ts#L176) |
| S02 | Conflict UI and controller | [cloud/super-admin-web/src/pages/SyncMonitor/SyncMonitorPage.tsx:61](../../../cloud/super-admin-web/src/pages/SyncMonitor/SyncMonitorPage.tsx#L61) |
| S03 | Restaurant product/feature/usage controls | [cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx:745](../../../cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx#L745) |
| S04 | Merged subscription entitlement reads | [cloud/api/src/modules/application-entitlements/application-entitlements.service.ts:242](../../../cloud/api/src/modules/application-entitlements/application-entitlements.service.ts#L242) |
| S05 | Subscription lifecycle implementation | [cloud/api/src/modules/subscriptions/subscriptions.service.ts:117](../../../cloud/api/src/modules/subscriptions/subscriptions.service.ts#L117) |
| S06 | Plan change UI | [cloud/super-admin-web/src/pages/Subscriptions/ChangePlanModal.tsx:8](../../../cloud/super-admin-web/src/pages/Subscriptions/ChangePlanModal.tsx#L8) |
| S07 | Subscription lists, bulk selection and renewal | [cloud/super-admin-web/src/pages/Subscriptions/SubscriptionsListPage.tsx:98](../../../cloud/super-admin-web/src/pages/Subscriptions/SubscriptionsListPage.tsx#L98) |
| S08 | Onboarding, resume and welcome output | [cloud/super-admin-web/src/pages/Onboarding/OnboardRestaurantPage.tsx:439](../../../cloud/super-admin-web/src/pages/Onboarding/OnboardRestaurantPage.tsx#L439) |
| S09 | Supported subscription assignment fields | [cloud/api/src/modules/subscriptions/dto/subscription.dto.ts:9](../../../cloud/api/src/modules/subscriptions/dto/subscription.dto.ts#L9) |
| S10 | New safe handover implementation for comparison | [cloud/super-admin-web/src/pages/Restaurants/OwnerHandover.tsx:20](../../../cloud/super-admin-web/src/pages/Restaurants/OwnerHandover.tsx#L20) |
| S11 | Owner invitation copy feedback | [cloud/super-admin-web/src/pages/Owners/OwnerDetailPage.tsx:119](../../../cloud/super-admin-web/src/pages/Owners/OwnerDetailPage.tsx#L119) |
| S12 | Support diagnostics and recovery | [cloud/super-admin-web/src/pages/Support/SupportPage.tsx:92](../../../cloud/super-admin-web/src/pages/Support/SupportPage.tsx#L92) |
| S13 | Reports filters and exports | [cloud/super-admin-web/src/pages/Reports/ReportsPage.tsx:172](../../../cloud/super-admin-web/src/pages/Reports/ReportsPage.tsx#L172) |
| S14 | Payment exception loading | [cloud/super-admin-web/src/pages/PlatformPayments/PlatformPaymentsDashboardPage.tsx:109](../../../cloud/super-admin-web/src/pages/PlatformPayments/PlatformPaymentsDashboardPage.tsx#L109) |
| S15 | Incident loading and mutation controls | [cloud/super-admin-web/src/pages/Incidents/IncidentsPage.tsx:35](../../../cloud/super-admin-web/src/pages/Incidents/IncidentsPage.tsx#L35) |
| S16 | Payout pagination, search and section loading | [cloud/super-admin-web/src/pages/Payouts/PayoutsListPage.tsx:89](../../../cloud/super-admin-web/src/pages/Payouts/PayoutsListPage.tsx#L89) |
| S17 | Notification read-state persistence | [cloud/super-admin-web/src/pages/Notifications/NotificationsPage.tsx:50](../../../cloud/super-admin-web/src/pages/Notifications/NotificationsPage.tsx#L50) |
| S18 | Manual invoice commercial defaults | [cloud/super-admin-web/src/pages/Billing/BillingPage.tsx:177](../../../cloud/super-admin-web/src/pages/Billing/BillingPage.tsx#L177) |
| S19 | Server-authoritative invoice tax handling | [cloud/api/src/modules/billing/invoices.service.ts:51](../../../cloud/api/src/modules/billing/invoices.service.ts#L51) |
| S20 | Release initialization, controls and metrics | [cloud/super-admin-web/src/pages/Applications/ApplicationsPage.tsx:99](../../../cloud/super-admin-web/src/pages/Applications/ApplicationsPage.tsx#L99) |
| S21 | Backup interface controls | [cloud/super-admin-web/src/pages/Backups/BackupsPage.tsx:76](../../../cloud/super-admin-web/src/pages/Backups/BackupsPage.tsx#L76) |
| S22 | Device command and sync display | [cloud/super-admin-web/src/pages/Devices/DeviceDetailPage.tsx:78](../../../cloud/super-admin-web/src/pages/Devices/DeviceDetailPage.tsx#L78) |
| S23 | AI write controls | [cloud/super-admin-web/src/pages/AiAssistant/AiAssistantPage.tsx:150](../../../cloud/super-admin-web/src/pages/AiAssistant/AiAssistantPage.tsx#L150) |
| S24 | Settings load and tab mounts | [cloud/super-admin-web/src/pages/Settings/PlatformSettingsPage.tsx:37](../../../cloud/super-admin-web/src/pages/Settings/PlatformSettingsPage.tsx#L37) |
| S25 | Local branding form state | [cloud/super-admin-web/src/pages/Settings/PlatformBrandingCard.tsx:30](../../../cloud/super-admin-web/src/pages/Settings/PlatformBrandingCard.tsx#L30) |
| S26 | Sandbox creation | [cloud/api/src/modules/sandboxes/sandboxes.service.ts:42](../../../cloud/api/src/modules/sandboxes/sandboxes.service.ts#L42) |
| S27 | Release uniqueness and publication | [cloud/api/src/modules/applications/applications.service.ts:252](../../../cloud/api/src/modules/applications/applications.service.ts#L252) |
| S28 | Global health badge | [cloud/super-admin-web/src/layout/ProtectedLayout.tsx:265](../../../cloud/super-admin-web/src/layout/ProtectedLayout.tsx#L265) |
| S29 | Reviewed branch copying | [cloud/super-admin-web/src/pages/Branches/BranchAccessWorkspace.tsx:28](../../../cloud/super-admin-web/src/pages/Branches/BranchAccessWorkspace.tsx#L28) |
| S30 | Backup preview and restore execution | [cloud/api/src/modules/backups/backups.service.ts:462](../../../cloud/api/src/modules/backups/backups.service.ts#L462) |
| S31 | Backup encryption and storage configuration | [cloud/api/src/modules/backups/backup-storage.service.ts:54](../../../cloud/api/src/modules/backups/backup-storage.service.ts#L54) |
| S32 | Backup fleet defaults | [cloud/api/src/modules/backups/backups.service.ts:271](../../../cloud/api/src/modules/backups/backups.service.ts#L271) |

Additional relevant sources:

- `cloud/api/src/modules/sync-observability/sync-observability.controller.ts` (no runtime strategy schema on resolve)
- `cloud/super-admin-web/src/pages/Owners/OwnersListPage.tsx` (invitation fallback)
- `cloud/super-admin-web/src/pages/Sandboxes/SandboxesPage.tsx` (clone/destroy controls)
- `cloud/super-admin-web/src/pages/Subscriptions/RenewSubscriptionModal.tsx` (renew confirmation)
- `cloud/api/src/common/rbac/access.ts` (server role permissions)
- `cloud/super-admin-web/src/pages/SystemHealth/DeploymentHealthPanel.tsx` (limited deployment-check scope)
- `cloud/api/src/modules/jobs/jobs.service.ts` (existing scheduled backup, retention and integrity tasks)
- `cloud/super-admin-web/src/hooks/usePagedList.ts` (existing reusable pagination/stale-response guard)
- `cloud/super-admin-web/src/hooks/usePlatformSearch.ts` (header search race was already fixed; Support has a separate implementation)

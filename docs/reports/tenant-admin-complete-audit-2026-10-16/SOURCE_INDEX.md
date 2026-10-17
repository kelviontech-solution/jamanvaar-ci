# Source evidence

Audited the working tree, including existing uncommitted changes. SHA-256 values and source locations are recorded in [SOURCE_SNAPSHOT.json](evidence/SOURCE_SNAPSHOT.json). Line numbers refer to this snapshot.

- **SRC01: Restore validation and commit** — [RestoreModal.tsx](../../../apps/restaurant-system/pos-admin/src/components/RestoreModal.tsx) — handleFileUpload at line 21; handleApplyRestore at line 44; Snapshot Contents Validated at line 139
- **SRC02: Backup/export** — [BackupRestoreModule.tsx](../../../apps/restaurant-system/pos-admin/src/components/backup/BackupRestoreModule.tsx) — LAST_BACKUP_KEY at line 13; fetchCloudBackups().then at line 51; handleExportJson at line 87
- **SRC03: Reports screen** — [ReportsDashboard.tsx](../../../apps/restaurant-system/pos-admin/src/components/reports/ReportsDashboard.tsx) — isFilterDrawerOpen at line 185; const currentOrders at line 265; exportTransactionsCsv at line 407
- **SRC04: Report engine** — [reportDataEngine.ts](../../../apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine.ts) — getDateRange(preset at line 239; getStationPerformance at line 854
- **SRC05: Report document** — [ReportPreviewModal.tsx](../../../apps/restaurant-system/pos-admin/src/components/reports/ReportPreviewModal.tsx) — reportTitle: string at line 23; handleExportCsv at line 81
- **SRC06: Restaurant CRM** — [CustomersCrmModule.tsx](../../../apps/restaurant-system/pos-admin/src/components/customers/CustomersCrmModule.tsx) — const richCustomers at line 66; handleAdjustPointsInDetail at line 188; handleRedeemReward at line 210
- **SRC07: Manual campaign queue** — [MarketingCampaignsModal.tsx](../../../apps/restaurant-system/pos-admin/src/components/customers/MarketingCampaignsModal.tsx) — startSending at line 51; window.open at line 69; markSent at line 70
- **SRC08: Customer/reward repositories** — [repositories.ts](../../../packages/database/src/repositories.ts) — public static redeemReward at line 1858; public static getMatchingCustomers at line 1958; public static markSent at line 1993
- **SRC09: Restaurant settings** — [ReportBrandingSettings.tsx](../../../apps/restaurant-system/pos-admin/src/components/settings/ReportBrandingSettings.tsx) — const handleSave at line 59; return ( at line 151
- **SRC10: Combo editor** — [KioskComboPanel.tsx](../../../apps/restaurant-system/pos-admin/src/components/settings/KioskComboPanel.tsx) — export function KioskComboPanel at line 5; New Combo at line 16
- **SRC11: Admin composition** — [App.tsx](../../../apps/restaurant-system/pos-admin/src/App.tsx) — activeTab === 'DASHBOARD' at line 820; activeTab === 'KIOSK_PAYMENTS' at line 982
- **SRC12: Payment composition** — [KioskPaymentSettingsPanel.tsx](../../../apps/restaurant-system/pos-admin/src/components/payments/KioskPaymentSettingsPanel.tsx) — connection.status at line 11
- **SRC13: QR authorization matrix** — [admin-product-access.ts](../../../cloud/api/src/common/security/admin-product-access.ts) — requiredConsoleApps at line 14; menu\/ at line 22
- **SRC14: QR guided menu setup** — [QrOnboarding.tsx](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrOnboarding.tsx)
- **SRC15: Shared onboarding** — [PlanOnboarding.tsx](../../../apps/restaurant-system/pos-admin/src/components/dashboard/PlanOnboarding.tsx) — fetchMenuDraftStatus() at line 41
- **SRC16: QR immediate saves** — [QrAdvanced.tsx](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced.tsx) — export function QrOrderingRules at line 420; setRules(settings.data.rules) at line 434; void save({ [key]: checked }) at line 582
- **SRC17: QR branding** — [QrOperations.tsx](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrOperations.tsx) — export function QrBrandStudio at line 763; catch(() => {}) at line 786; QR Branding is not included at line 923
- **SRC18: QR CRM** — [QrCrm.tsx](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrCrm.tsx) — setRows([]) at line 87; setTotal(r.total) at line 93; No customers match at line 316
- **SRC19: QR catalog** — [QrCatalog.tsx](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/QrCatalog.tsx) — const load = async at line 87; await load() at line 113
- **SRC20: QR feature requests** — [FeatureRequestButton.tsx](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/FeatureRequestButton.tsx) — setSent(true) at line 38
- **SRC21: QR request creation** — [qr-admin.service.ts](../../../cloud/api/src/modules/qr/qr-admin.service.ts) — async requestFeature at line 105; supportTicket.create at line 120
- **SRC22: QR navigation** — [qrNavigation.ts](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts)
- **SRC23: Product routes** — [adminProducts.ts](../../../apps/restaurant-system/pos-admin/src/adminProducts.ts) — export const PRODUCT_PAGES at line 12
- **SRC24: Settings scopes** — [SettingsScopeNotice.tsx](../../../apps/restaurant-system/pos-admin/src/components/settings/SettingsScopeNotice.tsx)
- **SRC25: Kiosk customer experience** — [CustomerExperience.tsx](../../../apps/restaurant-system/pos-admin/src/components/kiosk/CustomerExperience.tsx)
- **SRC26: Draft protections already present** — [useKioskDraft.tsx](../../../apps/restaurant-system/pos-admin/src/components/kiosk/useKioskDraft.tsx)
- **SRC27: QR navigation safeguards** — [useQrUnsavedChanges.ts](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/useQrUnsavedChanges.ts)
- **SRC28: Shared menu manager** — [MenuCategoriesModule.tsx](../../../apps/restaurant-system/pos-admin/src/components/menu/MenuCategoriesModule.tsx) — function InlinePrice at line 48; username: at line 59

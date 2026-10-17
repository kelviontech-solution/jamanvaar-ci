const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const rows=[
 ['Restore validation and commit','apps/restaurant-system/pos-admin/src/components/RestoreModal.tsx',['handleFileUpload','handleApplyRestore','Snapshot Contents Validated']],
 ['Backup/export','apps/restaurant-system/pos-admin/src/components/backup/BackupRestoreModule.tsx',['LAST_BACKUP_KEY','fetchCloudBackups().then','handleExportJson']],
 ['Reports screen','apps/restaurant-system/pos-admin/src/components/reports/ReportsDashboard.tsx',['isFilterDrawerOpen','const currentOrders','exportTransactionsCsv']],
 ['Report engine','apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine.ts',['getDateRange(preset','getStationPerformance']],
 ['Report document','apps/restaurant-system/pos-admin/src/components/reports/ReportPreviewModal.tsx',['reportTitle: string','handleExportCsv']],
 ['Restaurant CRM','apps/restaurant-system/pos-admin/src/components/customers/CustomersCrmModule.tsx',['const richCustomers','handleAdjustPointsInDetail','handleRedeemReward']],
 ['Manual campaign queue','apps/restaurant-system/pos-admin/src/components/customers/MarketingCampaignsModal.tsx',['startSending','window.open','markSent']],
 ['Customer/reward repositories','packages/database/src/repositories.ts',['public static redeemReward','public static getMatchingCustomers','public static markSent']],
 ['Restaurant settings','apps/restaurant-system/pos-admin/src/components/settings/ReportBrandingSettings.tsx',['const handleSave','return (']],
 ['Combo editor','apps/restaurant-system/pos-admin/src/components/settings/KioskComboPanel.tsx',['export function KioskComboPanel','New Combo']],
 ['Admin composition','apps/restaurant-system/pos-admin/src/App.tsx',["activeTab === 'DASHBOARD'","activeTab === 'KIOSK_PAYMENTS'"]],
 ['Payment composition','apps/restaurant-system/pos-admin/src/components/payments/KioskPaymentSettingsPanel.tsx',['connection.status']],
 ['QR authorization matrix','cloud/api/src/common/security/admin-product-access.ts',['requiredConsoleApps','menu\\/']],
 ['QR guided menu setup','apps/restaurant-system/pos-admin/src/components/qrconsole/QrOnboarding.tsx',[]],
 ['Shared onboarding','apps/restaurant-system/pos-admin/src/components/dashboard/PlanOnboarding.tsx',['fetchMenuDraftStatus()']],
 ['QR immediate saves','apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced.tsx',['export function QrOrderingRules','setRules(settings.data.rules)','void save({ [key]: checked })']],
 ['QR branding','apps/restaurant-system/pos-admin/src/components/qrconsole/QrOperations.tsx',['export function QrBrandStudio','catch(() => {})','QR Branding is not included']],
 ['QR CRM','apps/restaurant-system/pos-admin/src/components/qrconsole/QrCrm.tsx',['setRows([])','setTotal(r.total)','No customers match']],
 ['QR catalog','apps/restaurant-system/pos-admin/src/components/qrconsole/QrCatalog.tsx',['const load = async','await load()']],
 ['QR feature requests','apps/restaurant-system/pos-admin/src/components/qrconsole/FeatureRequestButton.tsx',['setSent(true)']],
 ['QR request creation','cloud/api/src/modules/qr/qr-admin.service.ts',['async requestFeature','supportTicket.create']],
 ['QR navigation','apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts',[]],
 ['Product routes','apps/restaurant-system/pos-admin/src/adminProducts.ts',['export const PRODUCT_PAGES']],
 ['Settings scopes','apps/restaurant-system/pos-admin/src/components/settings/SettingsScopeNotice.tsx',[]],
 ['Kiosk customer experience','apps/restaurant-system/pos-admin/src/components/kiosk/CustomerExperience.tsx',[]],
 ['Draft protections already present','apps/restaurant-system/pos-admin/src/components/kiosk/useKioskDraft.tsx',[]],
 ['QR navigation safeguards','apps/restaurant-system/pos-admin/src/components/qrconsole/useQrUnsavedChanges.ts',[]],
 ['Shared menu manager','apps/restaurant-system/pos-admin/src/components/menu/MenuCategoriesModule.tsx',['function InlinePrice','username:']]
];
const files=rows.map(([area,file,needles],i)=>{const bytes=fs.readFileSync(path.join(root,file)),text=bytes.toString('utf8'),lines=text.split(/\r?\n/);return {id:'SRC'+String(i+1).padStart(2,'0'),area,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),lines:needles.map(needle=>({needle,line:lines.findIndex(s=>s.includes(needle))+1})).filter(r=>r.line)};});
const snapshot={at:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTree:true,files};
fs.writeFileSync(path.join(__dirname,'evidence/SOURCE_SNAPSHOT.json'),JSON.stringify(snapshot,null,2));
fs.writeFileSync(path.join(__dirname,'SOURCE_INDEX.md'),'# Source evidence\n\nAudited the working tree, including existing uncommitted changes. SHA-256 values and source locations are recorded in [SOURCE_SNAPSHOT.json](evidence/SOURCE_SNAPSHOT.json). Line numbers refer to this snapshot.\n\n'+files.map(f=>`- **${f.id}: ${f.area}** — [${path.basename(f.file)}](../../../${f.file})${f.lines.length?' — '+f.lines.map(l=>l.needle+' at line '+l.line).join('; '):''}`).join('\n')+'\n');
console.log('Recorded',files.length,'source files');

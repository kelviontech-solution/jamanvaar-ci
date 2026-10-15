# Service maturity — 15 improvements

The 12 feature improvements and three cross-app usability improvements are implemented locally. See [REPORT.md](REPORT.md) for acceptance evidence, deployment steps and device-testing limits. Existing user changes are preserved. No production deployment or GitHub push was performed.

| Item | Status | Acceptance |
| --- | --- | --- |
| Guided problem recovery | Implemented | API/browser passed; physical printer acceptance pending |
| Branch-specific licensing | Implemented | Scope/quota/expiry tests and Super Admin browser passed |
| Payment exception inbox | Implemented | Assignment/recovery/history tests and browser passed |
| Recurring menus and holiday exceptions | Implemented | Timer/restoration/holiday tests and browser passed |
| Cashier speed mode | Implemented | Barcode, enabled-tender checkout and configuration browser passed |
| Shared wait estimates | Implemented | Helper/API tests; shared client integration built |
| Allergen declarations and order instructions | Implemented | Published snapshot and immutable-line tests passed |
| Historical food-cost snapshots | Implemented | Snapshot/waste tests and populated report browser passed |
| Thali refill workflow | Implemented | Concurrent retry, station routing and unchanged bill tested |
| Reviewed menu/appearance rollback | Implemented | Menu/QR restore and browser preview passed |
| Owner mobile daily brief | Implemented | Desktop/phone browser passed |
| Controlled device updates | Implemented | Lifecycle regression passed; signed hardware upgrade pending |
| Recover unfinished work | Implemented | POS/Kiosk browser and Captain branch isolation tests passed |
| Plain progress/status messages | Implemented | Shared mappings and revised local-save messages verified |
| Alerts open exact records | Implemented | Populated payment history drill-down browser passed |

Architecture: branch licenses constrain the restaurant's purchased grants, never expand them; payments remain in the existing ledger; recurring menus use the canonical publication transaction; order-time costs and allergen instructions are preserved as snapshots; native updates retain existing signature and installation checks. Browser tests use the isolated local QA database, not production.

## File index

| Area | Main implementation files |
| --- | --- |
| Branch grants | Prisma schema/migrations; `common/security/branch-license.ts`; application-entitlements `branch-licenses.service.ts`, `branch-licenses.controller.ts`; Super Admin `pages/Branches/BranchLicensing.tsx` |
| Enforcement | ApplicationEntitlementsService, DeviceAuthGuard, admin-product-access, TenantAuth/ActivationKeys/Devices services and branch-aware QR capabilities |
| Recovery, cases, brief, cost reports | Operations `service-maturity.service.ts`, `service-maturity.controller.ts`; PaymentsService; OperationsService timeline fallback |
| Recurring menus | Operations `recurring-menu.ts`, `recurring-menu.service.ts` |
| Refills | Operations `thali-refills.service.ts`, device controller; Captain `components/tables/ThaliRefills.tsx` |
| Frozen snapshots | OrderSync `order-snapshots.ts`, service/DTO; InventoryLedgerService; menu snapshot and QR menu types |
| Rollback | Operations `configuration-rollback.service.ts`, `appearance-history.ts`; EntitySync and QR branding history writes |
| Operations UI | `ServiceMaturityPanels.tsx`, `ServiceConfiguration.tsx`, `ConfigurationRollback.tsx`, `PrinterRecovery.tsx`, OperationsConsole and operations.css |
| POS speed | `cashierSpeed.ts`, `components/menu/CashierSpeedBar.tsx`, catalog/payment/guest-split components |
| Shared wait | Operations `wait-estimate.ts`, QR workload, pickup display, `packages/ui/src/BranchWaitEstimate.tsx`, Kiosk/Captain views |
| Drafts/status | Kiosk App/welcome recovery, Captain store, POS cart/KOT messages and shared StatusBadge |
| Native updates | `packages/ui/src/native_update.ts`, NativeUpdateButton and native lifecycle tests |
| Verification | `cloud/api/test/service-maturity.e2e.spec.ts`, wait/recurring unit tests, scripts/evidence in this directory |

Paths above identify relevant implementation areas. The workspace also contains earlier authorized changes; this index does not attribute every dirty file to this batch.

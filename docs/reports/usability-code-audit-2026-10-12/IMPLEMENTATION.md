# Usability fixes and verification

Latest remaining-gap fixes and new findings: [REMAINING_GAPS_IMPLEMENTATION.md](REMAINING_GAPS_IMPLEMENTATION.md). The earlier findings below are preserved as audit history.
Latest follow-up: [NEXT_GAPS_IMPLEMENTATION.md](NEXT_GAPS_IMPLEMENTATION.md), covering the next workflow fixes, verification and newly found gaps.

12 October 2026. Baseline HEAD: `8a6a402eb17409dc2e0c4737ae1204fa20d9df43`.

This follows the original [audit](REPORT.md). Existing order-sync admission, reporting and scalability changes were preserved; not every modified file originated in this task. [BACKLOG.md](BACKLOG.md) distinguishes implemented code from remaining operational acceptance and code improvements.

## Changes

Daily workflows have persistent cashier navigation, an outstanding-bill inbox, shorter configurable kiosk choices, incoming-captain handover, grouped owner/QR tasks, core staff language choices and kitchen display preferences. Financial changes separate table service from collection and stop day closing from inventing cash or an employee shift. The separate applications retain their existing licensing controls.

| Area | Principal files | Behavior |
|---|---|---|
| Financial lifecycle | `packages/business/src/business_day_service.ts`, `packages/database/src/repositories.ts`, `accounting_service.ts`, `tender.ts`, `packages/utils/src/outstanding_bill.ts` | Zero opening cash, explicit register shifts, transactional close, recorded split tenders, collectible completed unpaid bills and duplicate-collection protection. |
| Identity / sync | Database `terminal_identity.ts`, `local_core.ts`; sync `lan_mesh_sync.ts`, `outbox.ts`; domain types; API order-sync DTO/service | Activated IDs, truthful core health/fleet, table-release and manual-confirmation metadata. Existing order-sync edits preserved. |
| POS | `posStore.ts`, `PosSidebar.tsx`, `PosOrdersView.tsx`, `PosPaymentModal.tsx`, `PosShiftModal.tsx`, `PosCart.tsx` | Persistent tasks, collections across dates/sources, same-order settlement, manual-UPI provenance, explicit float, shared discount approval and obsolete handler removal. |
| Captain | `captainStore.ts`, `CaptainHandover.tsx`, `CaptainMoreDrawer.tsx`, `CaptainFloorView.tsx`, `CaptainTableWorkspaceModal.tsx`, `CaptainShiftStatsView.tsx` | Safe table release, PIN-accepted floor handover, task shortcuts and actual shift/table statistics. |
| KDS | `displayPreferences.ts`, `App.tsx`, `KdsTicketCard.tsx`, `kdsLogic.ts`, `index.css` | Station/device display preferences, density choices and validated preparation timing. |
| Kiosk | `kioskJourney.ts`, guest `App.tsx`, admin `KioskDisplaySettingsPanel.tsx`, API `kiosk-configuration-schema.ts` | Single-choice skipping, service modes/table binding, branch defaults and per-terminal overrides accepted by server validation. |
| Management | Admin `navSections.ts`, `MenuLaunchCheck.tsx`, `OnboardingChecklistCard.tsx`, `AdminBranchWorkspace.tsx`, QR navigation/console/unsaved-changes hook, `SyncHealthPanel.tsx`, Super Admin onboarding | Task groups, actual menu readiness, branch-scoped checklist, themed confirmation, acknowledgement wording and product presets. |
| Language / cleanup | `packages/ui/src/StaffLanguage.tsx`, staff headers/navigation, `tooling/dev/clean-unused-imports.cjs` | Gujarati/Hindi core actions with fallback; compiler-guided unused imports removed while retaining runtime side effects. |

The import cleanup removed 650 bindings in 141 files across app/API/shared packages. These were not 650 dead features. Workers, separately started services, tests and public APIs were not blindly deleted.

The unused private `RestaurantDashboard` and six exclusive helper components were removed after import/reference review. The active `BranchBusinessDashboard`, shared onboarding checklist and menu launch check remain. A historical audit-generator source citation is the only non-component reference to this old group; no runtime or test import was found.

## Evidence and reproduction

- Seven frontend builds pass in [build results](evidence/builds/RESULTS.json): POS, Restaurant/Kiosk/QR Admin, Captain, KDS, Kiosk, QR Guest and Super Admin. These use existing assets, without image regeneration or native installer builds.
- [Full regression output](evidence/FINAL_TESTS.json): **1,825 tests passed, zero failures**. [Focused follow-up output](evidence/FINAL_FOLLOWUP_TESTS.json) verifies the final register-close guard and discount paths changed during that run.
- [Component browser results](evidence/components/RESULTS.json) check actual POS, KDS, Captain handover and kiosk-settings components at 1366×768 and 768×1024, with assertions/errors/screenshots.
- New tests cover zero cash, independent tills, unpaid table release, recorded split amounts, unknown prior tender, same-order settlement, role identities, incoming PIN, kiosk choices/overrides, station preferences and sync metadata. Ecosystem tests now assert actual tenant and connection state instead of an invented healthy flagship core.
- [After-cleanup compiler scan](evidence/after/UNUSED_DECLARATIONS.json) records **231 unused declaration/import/parameter diagnostics versus 881 baseline**. The final scan still finds 11 DOM dialog calls, 516 explicit `any` keywords and large domain files; these remain review work rather than being hidden. [Candidate classification](evidence/after/CANDIDATE_CLASSIFICATION.json) excludes separately started services, workers, tests and public APIs from assumed dead features.
- Root, API and Super Admin type checks pass. After deleting the unused private dashboard group, the root type check and Admin production build pass again. [Verification summary](evidence/VERIFICATION.json) records these checks and their scope.

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=4 --reporter=json --outputFile=docs/reports/usability-code-audit-2026-10-12/evidence/FINAL_TESTS.json
node node_modules/typescript/bin/tsc -b
node node_modules/typescript/bin/tsc -p cloud/api/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p cloud/super-admin-web/tsconfig.json --noEmit
node tooling/qa/build-usability-apps.cjs
node tooling/qa/browser-usability-components.cjs
node docs/reports/usability-code-audit-2026-10-12/scan-source.cjs --after
node docs/reports/usability-code-audit-2026-10-12/scan-unused.cjs --after
git diff --check
```

## Limits and release acceptance

Browser fixtures use isolated local data with backend/external requests blocked. They do not prove authenticated owner/QR behavior, real payment verification, live tenant isolation, cross-device delivery, print hardware or native upgrade persistence. API type checks and schema tests do not replace a cloud database integration suite.

Manual collection records a descriptive clerk name. The server records the authorized device and marks that name as not server-verified; it is not cryptographic employee proof. Captain handover validates cached incoming staff PIN and queues sync to preserve offline service; it is not a new server-attested handover protocol.

Existing discount approval defaults remain 25% / ₹500. Relaxed configurable thresholds need authorized backend persistence/enforcement and consistent offline rules. Large frontend chunks, remaining unused locals/parameters, `any` usage and large domain files remain recorded work; no invented “perfect” score is assigned.

Before release, use a test restaurant with two registers and a second branch. Publish a menu, receive it on customer devices, create orders from all four sources, deliver/release an unpaid table, collect once, close each counted till, disconnect/reconnect and verify queue, printing and SQLite persistence. Test gateway success/failure/retry with provider test credentials. No production payments or customer records were used. No deployment or GitHub push was performed.

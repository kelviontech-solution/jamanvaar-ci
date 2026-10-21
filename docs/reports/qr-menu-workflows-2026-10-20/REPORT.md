# QR menu workflows and Menu Performance access

Implemented locally on 20 October 2026. No hosted deployment or production plan changes were performed.

## Findings

1. Dish, category and CSV editors used independent state, allowing all three to appear together. Starting another task could overwrite unfinished changes without a confirmation.
2. The empty-menu flow required a category but did not let the owner create it alongside the first dish. Photo entry primarily asked for an image URL. Tax, SKU and modifier settings competed with the basic fields.
3. An uncertain dish-save response could generate a different ID on retry and create another dish. CSV retries used the original screen snapshot rather than rereading successfully saved rows/categories.
4. The QR module's green “Enabled” badge could appear above a denied Menu Performance page. Module access and the optional analytics capability are different checks.
5. A read-only inspection of the **local** non-test QR-enabled plans found `qrMenuAnalytics` absent. The local Menu Performance feature itself was active with 100% rollout. This confirms a configuration cause locally; it does not establish the hosted database's current configuration.
6. Optional QR capabilities were buried late in the Super Admin plan form. Choosing the same tier again could reset newly selected capabilities.
7. The Menu Performance lock screen lacked an access retry and could retain stale report data after a failed refresh.

## Changes

### Menu & Availability → Edit shared draft

- One active task: **Add dish**, **Import CSV**, **Add category**, or the dish list.
- Switching or cancelling unfinished edits asks whether to keep editing or discard. A reviewed CSV also receives navigation protection.
- CSV template download is inside Import CSV. It downloads the template only; it does not insert or preview the sample dishes.
- CSV steps: download → fill in → upload → review → import. Review shows a dish/category/price table and collapses non-blocking notes.
- First-dish creation supports **+ Create a category** directly in the dish form.
- Optional JPEG/PNG/WebP upload uses the existing image optimiser and shows a photo preview. Image URL entry remains available under More options.
- Basic fields stay prominent. Tax, dietary label, SKU and add-ons are grouped under More options.
- Active task is highlighted; unrelated dish lists/category management are hidden while editing. Publishing is disabled until the task is finished or cancelled.
- Blank price is validated rather than silently converted to zero. A deliberately entered zero remains allowed.
- IDs remain stable across dish/category save retries. CSV retries reread server rows/categories before deciding what is missing.
- An exhausted menu-pagination limit produces an error instead of silently importing against a truncated catalogue.
- CSV upload size messaging matches the parser's 2 MB limit. The file input resets after selection, allowing the same corrected filename to be uploaded again.
- Fixed a mobile horizontal overflow caused by the hidden file input.

### Super Admin plans and QR access

- Added a visible **Choose the QR package** panel to the primary plan editor.
- **QR Essential** includes ordering prerequisites and clears optional QR flags.
- **QR Complete** includes the live catalogue's QR capabilities, including Menu Performance, loyalty and the restaurant page. It retains unrelated existing product flags rather than granting POS to a QR-only plan.
- Individual capabilities remain editable. Inactive platform features and partial rollouts are labelled; the preset does not bypass those controls.
- Selecting the currently selected tier is a no-op. Switching to standalone QR preserves selected QR capabilities while removing unrelated product flags through the existing QR-only filter.
- The console badge now says **QR Ordering active**, clarifying that it describes the module.
- Menu Performance access errors include the feature code/key, reason and current plan name. Backend checks remain authoritative.
- The lock screen shows guidance and **Check access again**. Access can be rechecked without signing out.
- Report data is cleared when refresh fails or access is denied, avoiding stale financial data and exports.
- Extracted a lightweight menu-download helper so QR menu downloads need not import the whole local-runtime menu-import UI.

## How to enable Menu Performance after deployment

1. In Super Admin, open the restaurant's assigned plan under **Plans**.
2. In **Feature Entitlements → Choose the QR package**, select **QR Complete**, or expand individual capabilities and enable **Menu Performance**.
3. Save the plan. If this is a different plan, assign it to the restaurant's subscription through the existing plan-change flow.
4. Check explicit restaurant overrides and branch restrictions if the feature is still denied. A plan upgrade intentionally does not remove those restrictions automatically.
5. In QR Admin → Menu Performance, click **Check access again**.

Saving a shared plan changes the included flags for every subscription using that plan. Use a separate plan or an existing restaurant-specific override when access should change for only one restaurant. A plan's price/name/tier alone does not grant optional capabilities.

## Verification

- Root QR regression suite: **35 files, 150 tests passed**.
- API menu-control, QR operations and dynamic-plan suites: **3 files, 37 tests passed**, using the dedicated test database.
- Added API test confirms analytics is denied without its flag, available immediately after the saved plan includes it, denied by an explicit restaurant override, and restored when that override is removed.
- Added package tests confirm Complete includes catalogue capabilities, Essential retains prerequisites, non-QR product flags are preserved, and a catalogue failure disables preset application.
- Chrome browser tests use actual React components with isolated API fixtures at **390 px and 1440 px**.
- Browser checks cover exclusive workflows, unsaved-edit confirmation, category creation, photo upload, template download, CSV preview/import, partial-response retry, dish-save retry and publishing.
- Browser checks confirm access retry, clearing stale report data on connection failure, recovery, and saving QR Complete without enabling POS. Re-selecting the same QR tier preserves the chosen capabilities.
- Screenshot inspection confirms both the dish and CSV layouts fit a 390 px viewport. Browser checks assert no horizontal overflow.
- Root TypeScript and API TypeScript checks passed. API production build passed.
- Restaurant/QR Admin and Super Admin production builds passed. Existing large-bundle warnings and the printer static/dynamic import warning remain.

Browser evidence: [results](browser-results.json), [mobile dish editor](dish-390.png), [mobile CSV import](csv-390.png), [desktop dish editor](dish-1440.png), [desktop CSV import](csv-1440.png), [analytics access guidance](analytics-access.png).

Reproduce browser verification with `node docs/reports/qr-menu-workflows-2026-10-20/browser-check.cjs`.

The browser fixtures simulate API responses and faults. Actual plan authorisation and menu publishing are separately exercised by the API integration tests. No production restaurant, live payment or hosted plan was modified.

## Files

- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrCatalog.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/qr-catalog.css`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrOperations.tsx`
- `apps/restaurant-system/pos-admin/src/components/menu/menuFileDownload.ts`
- `apps/restaurant-system/pos-admin/src/components/menu/MenuImportModals.tsx`
- `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`
- `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`
- `cloud/api/test/qr-operations.e2e.spec.ts`
- `cloud/super-admin-web/src/pages/Plans/QrPlanCapabilities.tsx`
- `cloud/super-admin-web/src/pages/Plans/PlanFormModal.tsx`
- `cloud/super-admin-web/src/pages/Plans/plans.css`
- `tests/qr_plan_package.test.tsx`
- `tests/qr_console_tables_and_catalog_flow.test.ts`
- This report directory's isolated browser fixtures and evidence.

Deploy the API, Restaurant/QR Admin frontend and Super Admin frontend. Existing optional plan flags require the explicit configuration described above; deployment alone does not change commercial entitlements.

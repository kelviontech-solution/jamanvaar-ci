# QR menu publishing and visibility repair — 21 October 2026

## What caused the confusion

Saving a dish writes a draft. QR guests read the published menu snapshot, so three saved dishes can correctly coexist with two published dishes. The old editor did not clearly show this difference or provide a publication action beside the save workflow.

Additional confirmed code problems:

- **Published guest availability** called the draft-preview endpoint. Its name implied a live list, but it could show unpublished dishes.
- Draft cards said **Available** without checking publication, QR switches, category state, branch restrictions or stock.
- The selected **Edit shared draft** button looked like an action even when already selected, making its correct no-op appear broken.
- The availability list offered branch restoration for unrelated hidden reasons. Even after clearing an actual branch pause, it could keep offering the same restore action while the published pause still required publication.
- The guest live-availability filter could apply a deleted branch override.
- Published QR filtering and live filtering disagreed when a dish explicitly included QR in `salesChannels` while its QR switch was off. The legacy digital-menu visibility switch was not consistently considered.
- Fixed-size grid columns left empty desktop space and produced cramped mobile cards.

The production restaurant was not accessed or changed. The three-draft/two-live scenario was reproduced in the browser, and the corresponding guest-menu behavior was verified separately against the real API and dedicated test database.

## Updated owner flow

1. **Dishes & drafts → Add dish**.
2. Choose **Save draft** to keep working, or **Save & review publish** to save and open the publication review.
3. After a draft save, **Review & publish saved changes** appears beside the saved confirmation. The status panel also keeps **Review & publish menu** available.
4. Review the new/changed/removed dishes, changed option groups, warnings and dishes that will remain hidden. The review states that publishing affects the shared menu across branches and licensed channels; it does not publish just one dish.
5. Acknowledge the review and select **Publish reviewed menu**.
6. Check **Live QR menu**. It displays the actual published customer menu, including published names, photographs and prices.

A saved price change also shows the current live price beside the draft price. The customer continues seeing the published price until publication. A stale review is rejected if another edit or publication occurred; **Refresh review** loads the latest changes before another confirmation.

Guest pages refresh periodically. Refreshing or rescanning after successful publication also loads the current menu. A publication does not override ordering pauses, licenses, table/menu mode switches, branch restrictions or stock.

## Visibility and layout changes

- Added branch-specific **Saved dishes / Visible on live QR / Visible after publishing** counts.
- Cards show **Live on QR**, **Live · Draft changes**, **Draft · Not published**, or **Hidden from live QR**, with the actual reason.
- Added clear QR visibility controls for a dish and its category. The dish switch updates the QR channel and legacy visibility flag consistently, preserving other sales channels.
- Exposed explicit draft restoration for archived dishes and addition to the selected branch when a dish is restricted elsewhere.
- A branch pause can be removed only when that actual pause exists. If the published menu still contains it, the card directs the owner to publish instead of repeating a redundant restore action.
- Disabled QR ordering/modes and disabled digital-menu access are explained separately. Publishing does not silently turn these settings on.
- Separated the actual live view from editing. The selected workspace button has a clear selected appearance and is disabled; switching views protects unsaved edits.
- Removed the obsolete draft-preview-as-live availability component.
- Cards fill desktop grid space evenly, use a single readable column on mobile, have consistent image heights and footers, larger labels and usable action targets.

## Implementation and safety

- Added authenticated, branch-scoped, non-cacheable `GET /api/v1/restaurant/qr/menu-status`. It compares saved entities, publication review and the same `QrMenuService` used by guests. It does not publish a first menu as a side effect.
- Shared live restriction logic between the guest menu and admin diagnosis. Deleted overrides no longer suppress dishes. QR and digital visibility switches are respected consistently in snapshots and live checks.
- Added optional `expectedChecksum` and `expectedVersion` to the existing publication API. The QR review uses both; changed drafts or intervening publications return a conflict. Existing authorized clients remain compatible.
- Publication review now includes inline-image warnings as well as normal menu warnings.
- Live status refreshes after saves, on window focus and every 30 seconds while the page is visible and idle. Failed checks clear success claims and show a retry action. Late responses cannot change the selected branch's status.
- Preserved the existing shared menu, audit trail, tenant/branch authorization, public tokens, orders, payment data and optional entitlements. No database migration is required.

## Verification

**97 automated tests passed** in the relevant runs:

- **84 API tests across four files:** `qr-module.e2e.spec.ts`, `qr-menu-control.e2e.spec.ts`, `menu-snapshot.spec.ts`, `menu-publications.service.spec.ts`.
- **13 root tests across three files:** `qr_console_menu_availability_separation.test.ts`, `qr_console_tables_and_catalog_flow.test.ts`, `qr_menu_choices.test.ts`.

The database-backed regression verifies draft-only versus live dishes, unchanged live prices before publication, exact guest-menu counts, reviewed publishing, stale review/version rejection, QR/digital flags, category hiding, branch restrictions, unavailable stock, branch isolation, unauthorized access, real branch pause → publication → draft restoration → republication, ordering disabled, and ignored deleted overrides. The final targeted run of this regression also passed after the visibility-schema update.

**Chrome at 390 px and 1440 px passed:**

- Three saved drafts and two live dishes were shown distinctly; saving did not automatically publish.
- Publishing the reviewed changes made the third dish live.
- Save & review publish opened the working dialog.
- Stale reviews were rejected without publishing; refreshing the review allowed a valid publication.
- QR visibility could be hidden and restored through publication.
- Branch pause controls and the actual live list worked.
- Draft price changes displayed the unchanged live price.
- Unsaved edits survived a cancelled view switch.
- Connection failures removed false live-status claims and recovered on refresh.
- Mobile cards were checked for readable width; no horizontal overflow or JavaScript page errors were observed.

Earlier photo/customization and CSV workflow browser suites were updated to use the reviewed publication flow and re-run successfully. Their synthetic fixtures exercise the actual UI components; real persistence, authorization and guest responses are covered separately by the API tests. No live payments or physical printers were exercised.

Root and API TypeScript checks passed. API and Restaurant/QR Admin production builds passed. Existing large-bundle and printer static/dynamic import warnings remain.

Evidence: [browser results](browser-results.json), [mobile publication status](draft-vs-live-390.png), [mobile dish card](draft-card-390.png), [mobile review](publication-review-390.png), [desktop live menu](live-menu-1440.png).

Reproduce:

```powershell
npm run typecheck
npm run typecheck --workspace=@jamanvaar/cloud-api
npm run test --workspace=@jamanvaar/cloud-api -- test/qr-module.e2e.spec.ts test/qr-menu-control.e2e.spec.ts src/modules/menu-publications/menu-snapshot.spec.ts src/modules/menu-publications/menu-publications.service.spec.ts --reporter=default
npx vitest run tests/qr_console_menu_availability_separation.test.ts tests/qr_console_tables_and_catalog_flow.test.ts tests/qr_menu_choices.test.ts
node docs/reports/qr-menu-publishing-2026-10-21/browser-check.cjs
node docs/reports/qr-dish-customization-2026-10-21/browser-check.cjs
node docs/reports/qr-menu-workflows-2026-10-20/browser-check.cjs
npm run build --workspace=@jamanvaar/cloud-api
npm run build:pos-admin
```

## Files changed for this repair

- `cloud/api/src/modules/qr/qr-menu-status.service.ts`
- `cloud/api/src/modules/qr/qr-live-availability.ts`
- `cloud/api/src/modules/qr/qr-menu.service.ts`
- `cloud/api/src/modules/qr/qr.controllers.ts`
- `cloud/api/src/modules/qr/qr.module.ts`
- `cloud/api/src/modules/menu-publications/menu-publications.service.ts`
- `cloud/api/src/modules/menu-publications/menu-snapshot.ts`
- `cloud/api/src/modules/entity-sync/menu-entity-schemas.ts`
- `cloud/api/test/qr-module.e2e.spec.ts`
- `apps/restaurant-system/pos-admin/src/cloud/qrAdminClient.ts`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrCatalog.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrMenuPublication.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrMenuWorkspace.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/qr-catalog.css`
- `tests/qr_console_menu_availability_separation.test.ts`
- This report's browser fixture/evidence and the two earlier browser scripts adapted to the new publication review.

Deploy **both the API and Restaurant/QR Admin frontend**, then refresh the browser. Deployment does not publish existing drafts: review and publish them through the new flow. No production deployment, plan changes or production data changes were performed here.

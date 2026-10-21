# QR dish photos, sizes, add-ons and category defaults

Completed locally on 21 October 2026. No production deployment or live restaurant data changes were performed.

## Result for the restaurant owner

1. Open **Menu & Availability → Manage categories → Edit category** (or **Add category**).
2. Under **Default sizes & add-ons**, choose **Add sizes**. It starts with **Normal, Medium and Large**; rename them, add/remove options and set extra prices. Size requires exactly one selection.
3. Choose **Add add-ons**, enter actual option names such as **Extra cheese**, and set their extra prices. Configure the minimum and maximum number of choices; minimum 0 makes the group optional and maximum 0 allows any number.
4. **Save category**. These restaurant-wide defaults populate new dishes in that category, including QR CSV imports without their own corresponding choices. Category defaults do not silently rewrite existing dishes.
5. **Add dish → select the category**. Its configured sizes and extras appear automatically, with readable option names, extra prices and selection rules.
6. Use **Upload photo** to choose a picture from the phone or computer. A preview and **Replace photo / Remove photo** actions are available. A URL remains optional under More options.
7. Use **Customize for this dish** to make an independent copy of a saved group. Adjusting this pizza's Medium price or removing an extra does not change its category or another dish. Additional dish-specific groups are supported.
8. **Save draft → Publish shared menu**. Customers then see the actual uploaded photo and named customization choices. The backend prices the selected options and enforces required choices and limits.

For an existing dish, **Use category choices** offers a confirmation before replacing its selected groups. Category changes while creating a new dish replace the previous category defaults while preserving separately added groups. Existing dishes keep their explicit choices when moved between categories; applying defaults remains explicit.

Extra prices are increments to the dish's base price: a ₹200 dish with Medium +₹50 costs ₹250 before tax. Included choices use +₹0. No prices are inferred from the category name. An administrator configures defaults once for each applicable category.

## What was wrong

- The deployed screenshot shows the older URL-only editor. Photo selection/optimization was already present in the pending local menu workflow changes; this work gives it a prominent upload control and verifies persistence through publication and customer image retrieval.
- The old variants area only attached saved groups through checkboxes. It neither explained their available options/prices nor allowed the owner to define those options there.
- Categories had no typed, validated default choice-group references in the shared menu model. New dishes and imports required repeated manual configuration.

## Implementation

- Added a reusable choice editor for dish and category forms. It defines group/option names, prices, availability, required counts and maximum selections. Existing groups show their actual contents before selection/customization.
- Added typed `MenuCategory.defaultModifierGroupIds` and optional modifier-group `kind` (`SIZE` / `ADD_ON`) using the existing entity-sync storage. No database migration is required.
- Added backend schema validation for those fields. The existing canonical modifier groups, published snapshots, server pricing and order records remain authoritative; no parallel QR-only variant model was introduced.
- Category defaults are materialized into a dish's existing `modifierGroupIds` when that dish is created in the QR menu editor. POS, Captain, Kiosk and QR consumers can continue using that existing field. Other independent menu authoring screens have not been changed to apply category defaults automatically.
- Customized copies receive new group and option IDs, preserving existing shared references. Partial-save retries reuse the same staged IDs. Draft groups are written before the dish/category references them.
- Spreadsheet-specified sizes/add-ons replace the matching default kind while retaining unrelated category defaults. Imports with no explicit choices inherit their category's defaults.
- Added validation for missing/duplicate option names, invalid currency amounts, impossible selection limits, unavailable required choices and missing groups. Unused staged groups are not saved.
- Retained leave/discard safeguards and the explicit publication step.
- Photo selection accepts JPEG, PNG and WebP up to 20 MB. The existing optimizer normalizes orientation and compresses the image to at most 1,000,000 bytes. Publication moves valid image bytes into the existing stored-image endpoint. SVG uploads are rejected.

## Verification

**98 automated tests passed:**

- API: **72 tests across 2 files** (`qr-module.e2e.spec.ts`, `qr-menu-control.e2e.spec.ts`). The new database-backed integration case verifies saved category references, published sizes and add-ons, uploaded-image retrieval, required and maximum selections, canonical server prices, isolation of a customized pizza from its sibling, rejection of the original group's option on the customized dish, a real order saved with the expected ₹280 total, and rejection of malformed category defaults.
- Root: **26 tests across 4 files** (`qr_menu_choices`, `modifiers`, `modifier_selection`, `qr_console_tables_and_catalog_flow`). New unit coverage includes independent copied IDs/prices, category changes, decimal price normalization, invalid names/prices/limits, required option availability and missing references.

**Chrome browser verification at 390 px and 1440 px passed:**

- Actual category/dish editor components configured and saved category sizes and extras.
- Two new pizzas inherited the saved defaults.
- An uploaded image was decoded and optimized to WebP, saved with the dish and displayed by the actual customer app.
- One pizza's Medium extra price was customized to ₹80 without altering the sibling's ₹50 extra price or the category references.
- Unfinished changes were protected, and a simulated lost save response could be retried without duplicate groups.
- A CSV pizza inherited its category defaults.
- The actual customer picker required a size, displayed the configured add-ons and calculated ₹200 + Medium ₹80 + Extra cheese ₹30 + Chilli oil ₹15 = **₹325**.
- Editing category defaults preserved existing dishes and changed the defaults offered to the next new dish.
- Blank add-on names were rejected before any save; unsupported image types were rejected.
- No horizontal overflow or browser JavaScript errors were observed.

These browser fixtures use isolated API responses and synthetic pictures, with no live credentials or payments. Actual API persistence, publishing, image serving, pricing and order placement were checked separately against the dedicated test database. The browser check covers the editor-to-customer picker and cart; it does not claim a live payment or physical-device acceptance test.

Root and API TypeScript checks passed. API and Restaurant/QR Admin production builds passed. Existing large-bundle and printer static/dynamic import warnings remain.

Evidence: [browser results](browser-results.json), [mobile size editor](size-editor-390.png), [desktop size editor](size-editor-1440.png), [mobile customer picker](customer-choices-390.png), [desktop customer picker](customer-choices-1440.png), [mobile photo upload](dish-editor-390.png).

Reproduce:

```powershell
npm run typecheck
npm run typecheck --workspace=@jamanvaar/cloud-api
npx vitest run tests/qr_menu_choices.test.ts tests/modifiers.test.ts tests/modifier_selection.test.ts tests/qr_console_tables_and_catalog_flow.test.ts
npm run test --workspace=@jamanvaar/cloud-api -- test/qr-module.e2e.spec.ts test/qr-menu-control.e2e.spec.ts --reporter=default
node docs/reports/qr-dish-customization-2026-10-21/browser-check.cjs
npm run build --workspace=@jamanvaar/cloud-api
npm run build:pos-admin
```

## Files changed for this work

- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrCatalog.tsx` (preserves the earlier menu workflow fixes)
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrMenuChoices.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/menuChoiceDrafts.ts`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/qr-menu-choices.css`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/qr-catalog.css`
- `packages/types/src/domain.ts`
- `cloud/api/src/modules/entity-sync/menu-entity-schemas.ts`
- `cloud/api/test/qr-module.e2e.spec.ts` (preserves earlier QR regression cases)
- `tests/qr_menu_choices.test.ts`
- This report directory's fixture, browser checks and evidence.

Deploy the **API and Restaurant/QR Admin frontend**. There is no customer-app protocol change or schema migration. Existing menus and category defaults require the administrator's explicit configuration and normal menu publication; deployment alone does not set restaurant-specific sizes or prices.

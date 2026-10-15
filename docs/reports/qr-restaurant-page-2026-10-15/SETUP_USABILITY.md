# Easier restaurant page setup

Implemented and verified locally on 15 October 2026. Not pushed or deployed to production.

**Follow-up:** the subsequently requested checklist, image optimization, reusable bundles, translations, branch copying, scheduled notices, engagement report and publication comparisons are implemented. See [ENHANCEMENTS.md](ENHANCEMENTS.md). Counts and recommendations below describe the earlier setup-usability batch.

## Super Admin flow

1. Open **QR Ordering Suite** and select the restaurant.
2. Choose **Set up restaurant page** on its overview. This opens the dedicated page-access card.
3. Turn on **Include restaurant page builder**, then **Save entitlement changes** beside the switch.
4. Hand setup to the restaurant owner: **QR Admin → Restaurant Page**.

The access card explains base QR requirements, platform feature/rollout restrictions and branch licensing. It grants access without publishing restaurant content or changing the scan destination. The save action uses the existing audited entitlement API and saves all pending entitlement changes. Enabling only the page switch was browser-verified to preserve ordering and payment settings.

The existing feature catalogue and plan configuration remain authoritative. The feature migration from the original implementation must be deployed before it can be enabled. A restaurant grant cannot expand a branch's separately restricted license.

## QR Admin flow

1. Choose **Restaurant-wide defaults** or an authorized branch in **Editing scope**.
2. Follow four shortcuts: **Choose a design → Add your welcome → Check contact details → Preview & publish**. Each shortcut opens the relevant section.
3. **Fill missing restaurant details** supplies a heading and editable welcome. It uses an available scope address and preserves existing text, design, contact information and scan preference. It never enables or publishes a page automatically.
4. Choose whether to enable the page and whether fresh scans open the page or the menu first. Photos, contact links and gallery remain optional.
5. Use **Save & review** to save a draft and open preview/review in one action. Check the affected branches, acknowledge the review, then **Publish reviewed page**. **Save draft** remains available for unfinished work.
6. Once published, choose **Branch to share** to open/copy its actual public link without switching editing scope or losing draft edits. A branch's own publication and effective access determine whether its link is offered.

New status labels distinguish **Not published**, **Changes not published**, **Page switched off**, **Live · page first** and **Live · menu first**. Unsaved edits are also labelled separately. The customer-facing version remains the last publication until publication succeeds.

Locked access now offers the existing feature-request workflow and **Check access again**. A failed initial load offers **Try loading again**. Missing heading/welcome errors are shown before review, and opening a step focuses its summary. Textareas have stable accessible names after autofill and editing.

Screenshots use isolated QA sample content:

- [Super Admin access card](evidence/super-page-access-desktop.png)
- [QR Admin desktop studio](evidence/studio-heritage-desktop.png)
- [QR Admin mobile editor](evidence/studio-edit-phone.png)
- [Mobile preview with reachable publication controls](evidence/studio-preview-phone.png)

## Verification

| Check | Result |
| --- | --- |
| End-to-end Chrome browser | **16/16 passed** against the real compiled local API |
| Setup guidance, shared renderer and capability labels | **12 tests passed**, three files |
| Page backend integration | **11 tests passed**, rerun after the usability changes |
| Type checking | Restaurant Admin and Super Admin passed |
| Production Vite bundles | Restaurant Admin and Super Admin built successfully; existing large-chunk warnings remain |

Browser coverage includes real Super Admin login/OTP, selecting the restaurant, saving page access, checking access from QR Admin, simulated load failure/retry, prefilling, incomplete welcome validation, actual image upload, private draft save/review, acknowledgement/publication, status labels, branch sharing with unsaved edits, three public templates, missing menu, cart preservation, real featured-dish customization, an original unpaid QA order return, branch overrides and mobile widths of 360/390/430/960 px. It checks document overflow and uncaught page errors. No real collection or customer message was sent. The access-request button was checked for availability; this run did not submit a support request.

Final results: [browser-results.json](evidence/browser-results.json). Earlier failure screenshots are debugging history and are superseded by these final results. The initial run exposed unstable textarea names after autofill; explicit accessible names fixed it before the successful final run.

Reproduce with the existing isolated local QA database and browser servers:

```powershell
node docs/reports/qr-restaurant-page-2026-10-15/browser.cjs
node docs/reports/qr-restaurant-page-2026-10-15/verify.cjs
node node_modules/vitest/vitest.mjs run tests/qr_restaurant_page_setup.test.ts tests/qr_restaurant_page.test.tsx tests/qr_admin_license_capability_labels.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit -p apps/restaurant-system/pos-admin/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p cloud/super-admin-web/tsconfig.json
```

## Recommended next improvements

These are suggestions, not implemented in this batch:

1. **Reviewed branch copying.** Copy selected page content to selected branches with a difference preview, preserving branch addresses, phones and review links unless explicitly selected.
2. **Translated page content.** Let owners supply welcome, story and notice text for each supported guest language, with clear fallback and a language-specific preview.
3. **Scheduled notices.** Give festival/event notices an expiry time so stale promotions stop appearing automatically. Keep ordering hours under the existing service rules.
4. **Page engagement reporting.** Report page views and menu/contact clicks with clear privacy controls. Do not label a Google review click as a completed review.

Start with branch copying for multi-branch operators and translations for restaurants serving guests in several languages. Custom domains and freeform drag-and-drop design add more operational complexity and can follow demonstrated demand.

## Files changed in this usability batch

- `cloud/super-admin-web/src/pages/QrOrdering/QrRestaurantDetailPanel.tsx`
- `cloud/super-admin-web/src/pages/QrOrdering/QrEntitlementEditor.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrRestaurantPage.tsx`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/restaurant-page-editor.css`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/restaurantPageSetup.ts`
- `tests/qr_restaurant_page_setup.test.ts`
- Browser runner, evidence and reports in this directory.

No backend authorization, database schema, signing identity or payment logic was changed in this usability batch. Existing owner/manager scope, optimistic draft revisions and explicit publication remain enforced by the backend.

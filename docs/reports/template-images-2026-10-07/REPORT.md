# Complete template photographs and category presentation

Implemented locally on 7 October 2026. All **30 bundled templates** have images for their **652 dish entries, 27 combos and 199 categories**. The library contains **679 distinct assets**: 453 distinct named dishes, 27 combos and 199 separate category covers. The same named dish deliberately keeps the same corresponding image across templates and applications; different dishes, combos and template categories do not share an asset.

## What changed

- Generated an individual, description-matched starter photograph for every distinct dish and combo. Category covers show a curated selection of the category's actual dishes in a cohesive arrangement. The warm ivory backgrounds suit Jamanvaar's orange/navy theme.
- Added category cover thumbnails and consistent food icons in Restaurant Admin, template previews and Kiosk navigation. Owners can choose automatic icons or one of 24 specific icons, upload their own cover and save the changes.
- Template imports now copy category covers. Distinct categories with the same legacy slug have separate stable identities, including individual-category selection. Repeated imports retain existing category IDs and owner uploads. The default duplicate strategy keeps existing items.
- Exact dish identity repairs missing and explicitly registered old starter pictures at display time. The old image picker contained SVG food illustrations marked as photos; those entries now resolve to matching raster photos or are excluded. Saved known bundled SVG starter paths are also repaired. Arbitrary restaurant uploads, external URLs, data URLs and custom SVGs are preserved.
- Packaging verifies each checksum and copies identical assets to all six frontend public directories. QR Guest shares POS public assets. Each app's build/dev preparation includes the copy step, so Docker builds receive the canonical library.
- Kiosk retains a continuous grid for combos and individual dishes, with no separate mostly empty combo row. Category and branch/channel eligibility remain respected.

These are **AI-generated starter illustrations**, not photographs of a restaurant's actual servings. Owners can replace them. Unknown custom dishes still need a suitable owner photo; the app does not assign an unrelated dish image.

## Main files

| Area | Implementation |
|---|---|
| Canonical photos, provenance and checksums | `packages/assets/menu/template-photos-v1/` |
| Exact dish/category identity and legacy repair | `packages/utils/src/dish_photos.ts`, `template_photo_catalog.json` |
| Complete template metadata and picker | `packages/database/src/restaurant_template_catalog.ts`, `image_library.ts` |
| Stable category selection and cover import | `packages/business/src/menu_template_import.ts` |
| Shared icon presentation | `packages/utils/src/category_visuals.ts`, `packages/ui/src/MenuCategoryIcon.tsx`, `CategoryCard.tsx` |
| Owner controls and previews | Restaurant Admin `CategoryModal.tsx`, `PrebuiltMenuModal.tsx`, `menu/MenuCategoriesModule.tsx` |
| Customer category display | Kiosk `App.tsx`, `standardMenu.ts` |
| Asset preparation | `tooling/dev/pack_template_photo.mjs`, `finalize_template_photos.mjs`, `sync_description_photos.mjs` |
| Verification | `tests/template_photo_coverage.test.ts`, `tooling/qa/browser-menu-photos.cjs` |

## Verification

- **679 images visually reviewed**, including all 199 covers. Five images were regenerated after inspection: untopped Plain Uttapam, exactly 14 mini podi idlis, a plain Chocolate Brownie without ice cream, and single scoops of Chocolate and Vanilla Ice Cream.
- **679 distinct SHA-256 checksums**, with byte-for-byte verification of all copies in every public directory. Canonical WebP payload: **66,262,846 bytes**, resized to 840px width for menu cards.
- **118 tests passed in 14 files.** Coverage includes all templates, image uniqueness and delivery, saved legacy image repair, editable icon defaults, preserved custom uploads, duplicate-slug category imports, branch/channel restrictions, offline caching and menu synchronization.
- **All seven frontend builds passed in both QA and normal workspace configurations:** Kiosk, POS, Restaurant Admin, Captain, KDS, Super Admin and QR Guest. The browser checks used an isolated QA API at localhost:4010 with production URL subpaths: [QA build results](QA_BUILD_RESULTS.json). The saved build outputs were subsequently rebuilt with the normal workspace configuration, removing the temporary QA API override: [normal build results](BUILD_RESULTS.json). Deploy using the actual production environment.
- The final Vanilla replacement changed only a static photo and its provenance record; the browser catalogue checksum remained unchanged. Updated the static file in all seven compiled outputs and verified **all 4,753 compiled photo copies** against the final manifest: [compiled asset verification](COMPILED_ASSET_RESULTS.json). The complete 14-test photo suite was rerun against the final package.
- **14 Playwright checks passed, zero page errors**, using compiled apps and an isolated API/test database. Verified photos in Kiosk, Restaurant Admin, POS, Captain and mobile QR; all **16 offered complete onboarding templates**; saved category icon changes after reload; owner photo replacement across apps; and blob-backed offline images with the browser HTTP cache disabled.
- Importing the Pizza category in Admin increased the open Kiosk menu from **21 to 33 cards without refreshing the page**. Farmhouse Pizza photos loaded correctly in both apps. Reviewing every template exceeded the normal guest idle window, so the test started the next guest session on the same open page before importing; it did not disable idle reset.
- Kiosk grid widths **768 / 1024 / 1366 / 1920 / 2560 px** rendered **2 / 3 / 4 / 6 / 8 columns**, without menu-grid overflow. Combos share a row with dishes; search, empty states and the cart remain usable. Mobile QR fit a 390px viewport.
- Earlier harness attempts exposed an ambiguous template label, independent menu/promotion hydration during setup, and the expected guest idle reset during the long preview audit. Setup now waits for the actual combo control and starts a new guest session if idle reset occurred. The final complete run passed; earlier attempt JSON is retained for transparency. Isolated fixture combo hydration was 234 ms in that run, not a production synchronization measurement.

Evidence: [photo review and counts](PHOTO_REVIEW.json), [29 visual contact sheets](evidence/photo-review/index.json), [unit results](UNIT_RESULTS.json), [final photo tests](FINAL_PHOTO_TESTS.json), [build results](BUILD_RESULTS.json), [browser results](BROWSER_RESULTS.json), [Admin imported menu](evidence/admin-pizza-import.png), [template preview](evidence/pizza-template-preview.png), [Kiosk live import](evidence/kiosk-pizza-sync.png).

## Production rollout still required

An anonymous production check returned **404 HTML** for a new photo in both Kiosk and Restaurant Admin. The new assets have not been deployed: [production check](PRODUCTION_ASSET_CHECK.json). Local passing tests do not establish that the live site serves this revision.

Deploy the reviewed repository revision through the existing trusted deployment process and rebuild the frontend services:

```sh
PUBLIC_ORIGIN=https://system.kelviontech.in docker compose up -d --build frontend kiosk-user pos pos-admin captain kds qr-guest
```

Verify an `image/webp` response from `/kiosk/assets/menu/template-photos-v1/dish-55faac529b308d.webp` and the corresponding `/restaurant-admin/` path, then reload the apps to load the new bundle. No tenant-data migration is required for this photo change. Existing unrelated workspace changes have their own deployment requirements; the isolated QA API reported two unapplied migration entries from earlier payment work, which is not validated by these photo tests.

The configured SSH target could not be used earlier because strict verification lacked a trusted host key. That verification was not bypassed. Production custom uploads and any tenant-specific records still need checking after rollout.

## Codex grey panel

Applied focused workspace watcher exclusions and a backed-up VS Code software-rendering mitigation. The user subsequently confirmed the grey-panel issue was resolved. The logs establish extension-host stalls and webview errors but do not prove a particular GPU or extension fault. Details: [Codex diagnostics](CODEX_PANEL_DIAGNOSTICS.md).

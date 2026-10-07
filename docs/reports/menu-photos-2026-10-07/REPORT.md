# Kiosk All Menu layout and description-matched dish photos

## Result

Implemented and verified in the workspace. The Kiosk now renders combos and individual dishes in one continuous responsive grid. Twenty Gujarati dishes in the reported menu, spiced chaas and the named paneer/rice meal combo have description-matched starter images. Restaurant uploads remain authoritative. Shared image handling covers Restaurant Admin, POS, Captain and mobile QR ordering as well as the Kiosk.

**Production deployment is outstanding.** Anonymous production checks found the existing JPEGs and placeholder available, while the new versioned Khaman image returns HTTP 404 on both `/kiosk/` and `/restaurant-admin/`. Local browser verification uses compiled apps, production subpaths and a disposable restaurant on the isolated test API/database; it is not a production rollout or live-restaurant test.

A non-interactive, read-only SSH probe stopped at host verification: this workspace has no trusted ED25519 host key for `system.kelviontech.in`. Host verification was preserved; no remote command or deployment ran.

## Confirmed causes and fixes

| Severity | Cause / evidence | Affected files / apps | Change and impact |
| --- | --- | --- | --- |
| Medium | `App.tsx` rendered a combo grid followed by a separate dish grid. One combo necessarily reserved an entire row, even when many dishes could fit beside it. | Kiosk `App.tsx` | One grid containing both card types. No reserved combo row. Same category, dietary and search filters apply to the published combo backing dish; no duplicate backing card. |
| High | `enrichRestaurantTemplates` replaced unmapped dish photos with `menu-placeholder-v2.svg`. Its short explicit mapping omitted most Gujarati legacy dishes. | Shared template catalogue and stored restaurant menus | Versioned photo library with exact dish identities and explicit legacy replacements. Existing saved menus resolve photos during display without changing restaurant records or requiring a re-import. Future imports carry the new asset references. |
| High | Legacy template photo assignments reused unrelated assets: rice/okra/fritters pointed to paneer curry; breads shared one rotla image; basundi and shrikhand shared one file; patra pointed to a wrap. | Gujarati starter template, Kiosk/Admin/POS/Captain/QR | Separate assets generated from the actual descriptions, with visual review. Images are AI-generated starter illustrations rendered as food photographs, not photographs of the restaurant's own servings. Owners can replace them. Unknown dish names are not guessed. |
| Medium | Several image-error callbacks assigned root `/assets/menu/…` paths even though root assets belong to Super Admin on the shared production domain. | Shared `CachedImg`, Kiosk and staff menu cards | Shared loader controls the final fallback and resolves assets through the current app prefix. Explicit dish identity remains usable when the displayed name is localized. Legacy `/kiosk-admin/` prefixes are also recognized. |
| Medium | Category placeholders took precedence over the already available dish image. Image warming used the original stored photo paths. | Kiosk `standardMenu.ts`, menu cache effect | Categories use an eligible visible dish when their photo is missing. Kiosk warms the resolved photos, so offline rendering uses the same images. Uploaded category photos remain intact. |

## Image storage and delivery

- `packages/assets/menu/description-matched-v1/`: 22 WebP files and a provenance manifest. Total payload: **2,041,632 bytes**; images resized to 840px width for menu cards.
- `packages/utils/src/dish_photos.ts`: exact names, explicit legacy paths and resolution rules. Data URLs, content-addressed uploads, external URLs and restaurant-specific asset paths take precedence.
- `packages/database/src/repositories.ts`: display-only repair; stored menu objects, IDs, prices and publication versions are not changed.
- `packages/database/src/image_library.ts`: exposes the new starter images in the owner's image picker.
- `tooling/dev/sync_description_photos.mjs`: validates the manifest and packages identical assets into the six frontend public directories. QR Guest reuses POS public assets. Every frontend's `prebuild` and `predev` hook runs this step, including Docker builds; root `npm test` does too. Generated public copies are ignored by Git; central files are tracked.
- QR Guest resolves the published English dish identity before language selection, so translated labels do not lose the matching image.

## Verification

- **76 tests passed across 10 files**, covering exact image mapping, distinct dishes, preserved owner uploads, unchanged stored records, branch-safe category covers, templates, offline image caching, menu recovery, combo authoring and cross-window menu sync.
- **Seven frontend builds passed**: Kiosk, POS, Restaurant Admin, Captain, KDS, QR Guest and Super Admin.
- **Six frontend TypeScript checks passed**; Super Admin's build includes its own TypeScript check.
- **11 Playwright checks passed, zero page errors**. The actual Kiosk loaded all **21 card images** (20 dishes plus one combo), and the first combo and next dish shared a row.
- Kiosk grid measurements: 768px viewport → 2 columns; 1024 → 3; 1366 → 4; 1920 → 6; 2560 → 8. No horizontal overflow inside the menu grid at these widths. Opening the cart kept the grid usable.
- Verified search and empty state, combos-only view, actual menu photos in Admin/POS/Captain, mobile QR photos without document overflow, live owner photo replacement in Kiosk/Admin, and Kiosk blob-backed photos after network loss with the browser HTTP cache disabled.
- The first browser attempt selected a decorative SVG as an image and failed its image-decoding assertion. The selector was corrected to HTML `img`; the final run passed. Diagnostic screenshot is retained separately.

Evidence: [browser results](BROWSER_RESULTS.json), [Kiosk desktop](evidence/kiosk-all-menu-1366.png), [Kiosk portrait](evidence/kiosk-768.png), [mobile QR](evidence/qr-mobile-menu.png), [photo review](evidence/starter-photo-review.jpg), [verification details](VERIFICATION_RESULTS.json). Fixtures were removed after verification. No live restaurant orders or payments were created.

## Production rollout remaining

On the existing deployment host, deploy the reviewed repository revision and rebuild the frontend services with the existing production environment. This fix does not require a database migration or new backend setting. The complete workspace also contains separately reported changes from earlier tasks; review their deployment requirements before deploying that entire revision.

```sh
PUBLIC_ORIGIN=https://system.kelviontech.in docker compose up -d --build frontend kiosk-user pos pos-admin captain kds qr-guest
```

Verify an actual `image/webp` response from `/kiosk/assets/menu/description-matched-v1/khaman.webp` and `/restaurant-admin/assets/menu/description-matched-v1/khaman.webp`, then reload the app to receive the new JavaScript bundle. Old devices keep their restaurant data and custom images. Images use a versioned path to avoid the immutable cache attached to the old JPEGs.

## Limits and further verification

The authenticated production restaurant's stored image records were not inspected. Actual production image failures for custom uploads, proxy differences, tenant-specific modifications and deployed bundle age still need verification after rollout. This library covers the named affected dishes, not every arbitrary dish a restaurant may create. Unknown/custom dishes need a suitable restaurant photo; the app does not assign a random cuisine image.

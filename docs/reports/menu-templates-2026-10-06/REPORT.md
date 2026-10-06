# Restaurant menu templates, CSV and duplicate safety ? 6 October 2026

The merged Restaurant Admin now supports niche selection, a complete template preview, individual category/item selection, variant and add-on import, priced combos, duplicate strategies and publication through the existing restaurant menu synchronization. Kiosk uses the restaurant's actual categories and ordering. CSV imports are reviewed before mutation; duplicate cleanup requires a backup and explicit confirmation.

## Confirmed problems and implemented fixes

| Severity | Root cause / evidence | Affected flow | Fix |
| --- | --- | --- | --- |
| High | Load Default Items imported every bundled cuisine simultaneously; Pizza claimed about 25 items but actually defined five. The separate preload modal could clear the whole existing menu. | Restaurant Admin onboarding ? Kiosk | Replace both paths with one non-destructive preview/selection flow. Offer detailed onboarding catalogs, true counts and default Skip Existing. Preserve legacy miniature preset IDs outside the onboarding picker. |
| High | Kiosk standardMenu.ts rewrote all categories into eight fixed Indian categories and reassigned dish category IDs based on name patterns. | Admin categories ? Kiosk | Preserve actual active category IDs, labels and sortOrder. Hide archived, unavailable, wrong-branch and excluded-channel items; leave orphan items out of customer ordering and identify them in the cleanup report. |
| High | Template import appended arrays, did not import modifier definitions, discarded combo component IDs and created new combo copies on repeated loads. | Templates ? options ? checkout | Stable tenant/template provenance and menu IDs, Unicode identities, independent copies, required single-select size groups and optional add-ons. Combos retain component IDs and have real priced backing menu items; respect common branch restrictions and food types. Existing generic combo editing reuses the same authoring service. |
| Critical | Opening the menu page automatically hard-deleted name matches; ASCII normalization erased Gujarati/Hindi identity. Names alone can describe different portions or configurations. | Menu cleanup / historical orders | Remove automatic cleanup. Scan tenant/category/name/SKU/provenance/content; distinguish confirmed groups from candidates needing verification. Require matching configuration, backup download and explicit selection/confirmation. Archive menu rows, remap current combo/recipe references and leave historical orders/KOTs/invoices unchanged. |
| High | Asset build code overwrote live_db.json and the desktop database with the sample menu. | Build ? stored restaurant data | Catalog builder generates image metadata only. The executed regression verifies that the stored menu bytes remain unchanged. Asset preparation stops recreating standalone Kiosk Admin output; packaging works from bundled assets without a hardcoded author's media directory. |
| High | CSV required eight exact headers in exact order and split by newline before parsing quotes. BOM/reordered/snake_case headers and multiline descriptions broke; uploads mutated data without preview or file-read error handling. | File ? preview ? local DB ? cloud | UTF-8/BOM-aware quoted parser, aliases, physical row errors, decimals/booleans/category mapping/subcategory/tags/tax/variants/add-ons, duplicate handling and error download. Validate extension/2MB/5,000 rows. Review valid rows, then apply one local transaction with rollback and honest publication status. |
| High | Generic image defaults and unrelated mappings were reused. Audit found 90 JPEG paths but only 46 distinct byte sequences; khaman showed samosas and several unrelated dishes shared the same file. | Templates / menu cards / image library | Explicit reviewed dish mappings; remove misleading mappings and generic salad fallback. Filter unreviewed photo library entries. Use a labeled neutral photo placeholder with a new versioned path to avoid old immutable-cache content. Preserve restaurant-uploaded photos; provide replace/remove/preview and raster upload validation. |
| High | A stale client could still try ordering an archived item, unavailable add-on, excluded channel or wrong-branch item. | Cached menu ? payment API | Server pricing rejects archived/unavailable/excluded items and inactive categories, filters unavailable options and checks branch restrictions. Backend tests verify authoritative variant/add-on pricing and tenant queries. |
| Medium | Cleanup fingerprints depended on JSON property order, causing harmless database JSON reordering to block undo. | Sync ? cleanup ? undo | Reuse canonical collection signatures; check real menu/relationship changes and tenant scope. Undo is allowed only while the reviewed state is still current. Synchronize before scanning; block stale confirmations. |

## Owner workflow

Open **Restaurant Admin ? Menu & Categories ? Load Menu Template**. Choose a restaurant type, inspect categories, prices, classifications, photos, sizes and add-ons. Use **Select Complete Template**, category checkboxes or individual item checkboxes. Selecting Combos also selects the component dishes for review. Choose **Skip Existing** (default), **Update Existing** or **Create New Copy**, review the restaurant tax group and load.

Existing menu records and owner edits remain intact under Skip Existing. Update preserves existing record IDs; copies get distinct IDs/SKUs. Imported records are independent of the shared template definitions. Owners can edit names, prices, images, stock/availability, classifications, subcategories, tags, ordering, translations, modifiers and taxes through existing menu controls. Category display order is editable. Actual customer navigation follows that configuration.

Use **Upload CSV** for a validation preview and **Download CSV Template** for the sample. **Export Menu CSV** retains the legacy export capability. Minimum import fields are name/category/price; supported legacy aliases remain accepted. Optional variant_price is the full size price, while addon_price is an additional amount. Repeated option rows for the same SKU form one item; conflicting repeated SKUs are errors. New categories are explicitly identified in the preview. Tax rates are percentages and must be reviewed against the restaurant configuration.

Use **Clean Duplicate Items** to synchronize and scan, download the report and backup, select confirmed groups, choose their canonical record and confirm archiving. A changed menu requires rescanning. **Undo This Cleanup** restores the captured menu/relationships while they remain unchanged. Groups needing verification are not automatically archived. Generic dish deletion now archives the item; priced combo deletion also archives its backing item.

## Detailed onboarding catalogs

Counts exclude the separately counted combo backing menu item. The owner-facing picker offers complete catalogs with at least 25 dishes, including all 15 requested niches and Thali. Thirty original preset IDs remain compatible; miniature legacy presets are not presented as complete onboarding menus.

| Niche | Categories | Dishes | Variant options | Add-on options | Combos |
| --- | ---: | ---: | ---: | ---: | ---: |
| North Indian Restaurant | 15 | 45 | 4 | 2 | 1 |
| Gujarati Restaurant | 15 | 52 | 0 | 0 | 1 |
| South Indian Restaurant | 13 | 42 | 0 | 18 | 1 |
| Punjabi Dhaba & Restaurant | 12 | 44 | 2 | 1 | 1 |
| Kathiyawadi Dhaba & Bhojanalaya | 10 | 37 | 0 | 0 | 1 |
| Jain Satvik Bhojanalaya | 10 | 31 | 0 | 0 | 1 |
| Indian Multi-Cuisine Diner | 12 | 60 | 38 | 87 | 1 |
| Grand Indian Thali Restaurant | 11 | 38 | 0 | 0 | 1 |
| Authentic Chinese & Wok | 10 | 32 | 0 | 0 | 1 |
| Fast Food & Quick Service Restaurant | 10 | 35 | 0 | 4 | 1 |
| Artisan Café & Coffee Bar | 9 | 34 | 0 | 0 | 1 |
| Bakery, Patisserie & Cafe | 9 | 32 | 10 | 0 | 1 |
| Pizza Restaurant | 8 | 39 | 36 | 82 | 1 |
| Street Food Restaurant | 9 | 36 | 0 | 0 | 1 |
| Biryani & Kebab Darbar | 9 | 31 | 30 | 15 | 1 |
| Dessert / Ice Cream | 8 | 32 | 0 | 0 | 1 |

The Pizza template has eight categories: Pizzas, Garlic Bread, Sides, Pasta, Burgers, Beverages, Desserts and Combos. Its 39 dishes include vegetarian and chicken pizzas, garlic breads, sides, pasta, burgers, beverages and desserts; a complete load adds the priced combo for 40 menu records. Pizza sizes use Regular/Medium/Large with explicit price deltas and six optional toppings. Biryani sizes and bakery cake weights use the same existing modifier model. Menu definitions are packaged once and copied into the restaurant's ordinary menu; no separate kiosk menu database exists.

## Data model and APIs

No SQL/Prisma migration was needed. Reuse tenant-isolated SyncedEntity JSON, the existing durable local collections and payment snapshots. Optional fields add subcategory/tags/templateItemKey/archivedAt/archiveReason and category provenance. Template definitions include size/add-on metadata and combo component SKU references.

No new CSV-upload or template-specific backend endpoint was introduced. Frontend parsing and staged validation feed the existing authenticated `/api/v1/entity-sync/MENU_CATEGORY`, `MENU_ITEM`, `MODIFIER_GROUP`, `TAX_GROUP` and `COMBO` endpoints. Menu payload validation and server payment lookup were strengthened. Payment amounts remain derived by the backend from restaurant records and selected option IDs.

Local imports and cleanup use rollback-capable transactions over menu/category/modifier/tax/combo/recipe/history/audit collections. Cloud publication remains the existing ordered, chunked, eventually consistent sync: tax/options/categories precede items. An interrupted upload retains pending changes and resumes on the normal reconciliation path; it does not undo remote rows already acknowledged. UI distinguishes saved/pending from published. Realtime wakeups remain the fast path, with the existing roughly 15-second fallback while connected; downtime can extend that. No new polling/retry architecture was added. Offline browsing retains the last synchronized restaurant menu.

## Verification and measured results

| Check | Result | Evidence |
| --- | --- | --- |
| Full runtime regression checkpoint | **1,453 passed, 0 failed** | `logs/menu-templates-final-runtime.json` |
| Final focused checks, including subsequent cleanup signature/branch/asset work | **100 passed, 0 failed** | `logs/menu-templates-final-focused.json` |
| Backend pricing/entity-sync/tenant regressions | **34 passed, 0 failed** | `logs/menu-templates-api-tests.json` |
| Final actual Chromium Admin ? Kiosk flows | **11 passed, 0 failed** | `browser-results.json`, `evidence/`, `tooling/qa/browser-menu-templates.cjs` |
| Root TypeScript; API, Restaurant Admin and Kiosk builds | Passed | Final logs under `logs/` |

The runtime counts overlap and must not be added. The full-suite checkpoint preceded later focused refinements. Earlier failed/hot-reloaded harness attempts remain in test-matrix.jsonl; browser-results.json indexes the final stable run.

Browser flows cover category-only loading, complete Pizza loading twice without copies, required size/add-on choice, a simulated paid checkout, price editing without kiosk refresh, Gujarati/Hindi CSV with quoted commas/newlines and invalid rows, CSV duplicates/wrong extension, independent Gujarati category loading while preserving Pizza, explicit dish archiving, backup/confirmed duplicate archiving/undo with unchanged historical paid orders, and offline browsing.

Final local price publication ? applied kiosk value: **138 ms**, without refreshing the kiosk. This is local QA, not AWS latency or a service-level guarantee.

The simulated Medium Margherita + cheese order had listed price **?289.00** (?149 + ?100 size + ?40 topping). With the explicitly configured **5% inclusive** restaurant tax group, the actual persisted order contains **?275.24 subtotal + ?13.76 tax = ?289.00 total**, status PAID. See `payment-verification.json`; no real funds were used or transferred.

Read-only legacy file audit: **12 items, 7 categories, zero same-category normalized-name groups, missing-category rows or invalid prices** in the repository's live_db.json. This file is a local legacy snapshot, not evidence about the production PostgreSQL database. It was not modified. Only isolated QA duplicates were archived and undone; production cleanup requires the owner's review/confirmation through the new tool.

## Principal changed files

- `packages/database/src/restaurant_template_catalog.ts`, `menu_templates.ts`, `menu_templates_data.ts`: definitions, provenance and explicit photo mapping.
- `packages/business/src/menu_template_import.ts`, `menu_csv.ts`, `menu_builder.ts`: import/preview/duplicate strategies, CSV and tenant-scoped version history.
- `packages/database/src/menu_identity.ts`, `menu_transaction.ts`, `menu_cleanup.ts`, `repositories.ts`, `tenant_isolation.ts`, `collection_sync.ts`, `kiosk_combo_authoring.ts`: Unicode identities, atomic rollback, archival/undo, authoritative combo editing and scoped reset.
- `apps/restaurant-system/pos-admin/src/components/PrebuiltMenuModal.tsx`, `menu/MenuImportModals.tsx`, `menu/MenuCategoriesModule.tsx`, `menu/ComboModal.tsx`, `ItemModal.tsx`, `CategoryModal.tsx`: owner workflow, previews, editing and confirmation.
- `apps/kiosk-system/kiosk-user/src/standardMenu.ts`, `App.tsx`, `KioskProductCard.tsx`, `packages/ui/src/StatusBadge.tsx`, `packages/types/src/domain.ts`: real category rendering, filtering, food indicators and compatible fields.
- Cloud `modules/entity-sync/menu-entity-schemas.ts`, `modules/payments/menu-sync.service.ts` and its tests: validation, pricing and ordering enforcement.
- Image library, versioned neutral SVGs, platform-root assets and preparation/catalog scripts: truthful image handling and non-destructive builds.
- Runtime/backend regressions and reproducible browser/API harnesses under `tests/`, `cloud/api/` and `tooling/qa/`.

## Limits / further verification

Many dishes do not yet have a verified matching photograph. They deliberately display **Restaurant photo needed**, and owners can replace that placeholder; no unrelated photo is substituted. `template-catalog-summary.json` records the missing-photo counts. New versioned placeholders are bundled in the terminal apps and the platform root asset directory; sampled root assets match the canonical stored bytes.

Production restaurant rows, AWS/Nginx runtime performance, deployment and physical printer output were not verified here. Browser tests used fresh authenticated restaurant/device fixtures, an isolated database and a simulated gateway; email/SMS/payment-provider delivery was not tested or triggered. Existing bundle-size build warnings remain. The optional authoring-image directory is configured with JAMANVAAR_CORE_PHOTO_SOURCE; ordinary packaging uses bundled assets and no longer depends on one developer's private filesystem.

Deploy/restart the relevant running services to load the code and packaged assets. Razorpay Route remains pending and no direct-settlement/commission policy was changed by this menu task.

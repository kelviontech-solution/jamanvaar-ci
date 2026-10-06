# Restaurant menu templates / CSV / duplicate safety — implementation plan

## Confirmed findings before implementation

1. Menu & Categories has a Load Default Items path that imports all 30 cuisines at once. The actual Pizza definition has five items despite claiming about 25. Template arrays are appended directly; modifierGroups are never imported and combo component IDs are discarded. Repeat combo imports add copies.
2. The older preload modal has a Replace Entire Menu path that clears menu/categories without a backup. Page-open useEffect automatically hard-deletes name-based duplicates. Names are normalized with ASCII-only regex, making Gujarati/Hindi names collapse to empty. Generic photo defaults and unrelated template mappings (pizza → paneer tikka, pasta → garlic bread) explain incorrect images.
3. Admin and Kiosk already share MENU_CATEGORY/MENU_ITEM/MODIFIER_GROUP/TAX_GROUP/COMBO entity synchronization and offline persistence. However, Kiosk standardMenu.ts remaps every item into eight hardcoded Indian categories, replacing the owner's category IDs/names/order even when the stored menu is correct.
4. CSV is parsed in the browser, not uploaded as a backend CSV endpoint. It requires eight exact headers in one exact order; BOM, new snake_case columns and reordered columns fail. Splitting by newline corrupts quoted multiline descriptions. File reads have no catch/preview, and import mutates collections while processing rows.
5. Cloud menu records use tenant-isolated generic entity JSON; menu snapshots for payments resolve modifier groups and tax. Required size variants can reuse required single-select modifier groups with price deltas, so no second menu database or SQL migration is needed.
6. Fresh cloud activation already clears demo menu once, but tenant change does not itself clear all menu/sync state. Imported definitions and stale local state need consistent scoping and timestamps; production data must not be auto-replaced.

## Implementation

- Replace all-cuisine defaults/destructive replacement with niche → template → preview → select categories/items → load. Default skip existing; explicit update or new copy. Stable template provenance IDs, Unicode-aware matching, actual counts, atomic local menu mutation with rollback, timestamped existing entity sync. Import only related variants/add-ons and complete selected combo dependencies.
- Provide at least the requested 15 detailed starter catalogs (including Pizza's eight categories). Store shared definitions once; copy independent editable restaurant records. Prices are editable suggestions, taxes use restaurant selection rather than an assumed legal rate.
- Preserve actual category IDs/order in Kiosk, hide inactive/archived/unavailable/channel-excluded items, and use correct food indicators.
- Add CSV file validation, robust quoted UTF-8/BOM parsing, header aliases, decimal/boolean/category/subcategory/tag/tax/variant/add-on fields, non-mutating row preview, duplicate strategies, error download and atomic import of explicitly selected valid rows. Keep legacy header/export compatibility.
- Replace auto deletion with tenant-bound scan/report, additional duplicate evidence, canonical choice, backup download, explicit archive confirmation, component remapping and unchanged historical orders/KOTs/receipts. Do not modify live restaurant data during development.
- Use reviewed stored dish-image mappings; remove known unrelated photo assignments, retain clear neutral fallbacks when no appropriate asset exists. Existing restaurant photos remain untouched; keep upload/replace/remove/preview controls.
- Run focused regressions and actual isolated Playwright Admin → Kiosk template/CSV/edit/archive flows; verify repeat load, multilingual rows, modifier pricing, tenant isolation, rollback and saved-order preservation. Document results and external limitations.

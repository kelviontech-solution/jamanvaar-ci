# POS item cards + Super Admin dark-mode refinement

**Scope decision.** The brief asked for POS item-card simplification *and* a dark-mode polish, but also said "do not add dark mode anywhere — improve it in Super Admin only". Applied as: item-card change in the **POS**; dark-mode work in the **Super Admin only** (the one app that already has a dark theme). No dark theme was added to POS or any other app.

## 1. POS Counter — item cards
File: `apps/restaurant-system/pos/src/components/menu/PosProductCard.tsx` (and nothing else in POS for this part).

| Before | After |
|---|---|
| ~44 %-width product photo (with veg/spice badges overlaid) next to the name | no photo; `CachedImg` import removed |
| Description | The card never rendered the description; it is still only used by the existing search match (`PosCatalog.tsx:166`), so searching by description keeps working |
| Name `text-sm`, 3-line clamp | name `text-[15px]`, 3-line clamp, `break-words`, full name in `title` |
| Veg/non-veg and spice marks on the photo | same marks, now beside the name; given accessible names ("Vegetarian", "Non-vegetarian", "Spicy") |
| Station chip + separate SKU line | one muted line `Station · SKU` (JAIN chip kept) |
| Bottom row | same price, MOD button, add / stepper; `flex-wrap` so the stepper can drop under the price on a narrow card instead of clipping |

Unchanged on purpose: price on the card, availability ("Out of Stock", opacity), the whole-card click → `addItemToCart(item)`, 120 ms tap debounce, MOD → customisation modal, in-cart badge + border + stepper (selection is shown by border, badge and stepper, not colour alone), sounds. Grid minimum card width stays 196 px.

**Cart/MRP preservation.** Click handler traced: card click → `handleCardClick` → `addItemToCart(item)` (unchanged) → `usePosStore` → `PosCart`. In the rendered harness (seeded demo menu) clicking "Hara Bhara Kebab (6 Pcs)" (card price ₹220) put the item in the cart at ₹220 with Total Payable ₹220 and subtotal ₹209.52 (GST-inclusive model), exactly the values the cart computes; no cart, pricing, tax, discount or payment file was edited.

## 2. Super Admin — dark mode
The console already had a token-based dark theme (`prefers-color-scheme` and `data-theme="dark"`). The visible problem was **~200 hard-coded light-theme colours in page inline styles** and a few CSS rules, which looked awkward in dark (navy text on navy, white cards, pastel banners). Fixes:

| Change | Detail |
|---|---|
| New semantic tokens (`styles.css`) | `--jv-ink`, `--jv-slate-700/600/500`, `--jv-line`, `--jv-line-strong`, `--jv-paper`, `--jv-paper-soft`, `--jv-ok-line`, `--jv-warn-line`, `--jv-err-line`, `--jv-accent-line`, `--jv-info-text`, `--jv-surface-alt`, `--jv-overlay`. Light values equal the hex they replace; dark values reuse the existing dark palette (e.g. `--jv-paper` = `--jv-surface`, `--jv-line` = `--jv-border`) |
| Inline styles (23 TSX files, 199 values) | `color/background/border*` hex → tokens. Text colours: dark navy/slate → `ink`/`slate-*`; green/red/amber/orange text → the existing `*-text` tokens (these are slightly darker in light mode, 4.5:1+ on white); pale tints → `*-soft`; pastel borders → `*-line`. Solid brand fills (`#0b253a` backgrounds, white-on-fill text) were left alone |
| CSS fixes | `.form-error`, `.user-avatar-owner`, `.modal-backdrop` overlay, filter-pill count (was white-on-white in dark), previously undefined `--jv-surface-alt` (invisible hover rows) |
| Dark refinements | stat-tile icon tints, unread notification rows, detail avatar edge; primary button / active filter pill use a cool dimmed slate instead of pure white |
| Light theme | unchanged except the text-colour tokens noted above and `#fff4eb→#fff4ed`, `#f0fdf4→#ecfdf5` on a few tints |

Not done: authenticated Super Admin pages were not rendered (no session); only a component harness and the login were. Several inline gradients and solid brand fills remain hard-coded by design.

## 3. Verification
| Check | Result |
|---|---|
| Full vitest | 242 / 242 files, 1,796 / 1,796 tests pass |
| `tsc --noEmit` POS, Super Admin | 0 errors |
| `vite build` POS, Super Admin | both succeed |
| POS catalog render (real components, seeded DB) at 1366×768, 768×1024, 390×844, light theme | 12 cards, **0 images in cards**, names readable, selection state clear, add → cart shows ₹220; no console errors. The page-level horizontal scroll seen at 1366/768 comes from my harness's fixed 360 px cart column, not from the POS layout |
| Super Admin component harness light vs dark at 1366×768 and 390×844 | tokens apply in both; dialog, badges, banners, stat tiles, filter pills, table readable in dark |
| POS dark mode | not applicable — none added, as instructed |

## 4. Files
POS: `components/menu/PosProductCard.tsx`.
Super Admin: `src/styles.css`, `src/components/{ui.css,shared.css,CopyButton.tsx}` and the page files containing inline styles (Devices ×2, Entitlements, OfflinePolicy, Onboarding, Plans ×2, QrOrdering, Restaurants ×4, Sandboxes, Subscriptions ×3, Support, Billing, AiAssistant, Catalog, PaymentConnections, ActivationKeys ×2, Applications, Branches).
Evidence: `evidence/super-admin/SA-HARNESS-{LIGHT,DARK}-*.png`, `evidence/pos/POS-CATALOG-*.png`, `log-*.json`.

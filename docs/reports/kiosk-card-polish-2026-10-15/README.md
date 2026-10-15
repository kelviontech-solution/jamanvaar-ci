# Kiosk product cards and floating cart polish

Implemented and visually inspected on 2026-10-15 in the existing customer kiosk application.

## Files changed

| File | Change |
| --- | --- |
| `apps/kiosk-system/kiosk-user/src/KioskProductCard.tsx` | Consistent image, text, price, and action areas; 48 px Add and Customize controls. |
| `apps/kiosk-system/kiosk-user/src/App.tsx` | Apply the same structure to combo cards; anchor the existing cart to the menu shell; reserve scroll clearance; prevent the duplicate floating assistant from obstructing ordering. |
| `apps/kiosk-system/kiosk-user/src/index.css` | Scoped card, content-width grid, cart, and scroll-spacing rules. |
| `tooling/qa/browser-kiosk-card-polish.cjs` | Repeatable screenshots, geometry assertions, and touch interaction checks using the real kiosk App. |

## What changed and why

The original card footer put the price and both actions in a wrapping flex row. Customizable and plain dishes therefore needed different amounts of space. Product descriptions also had no reserved height, and Customize was 44 px tall alongside a 48 px Add button.

Cards now use an 8:5 image ratio, two-line names and descriptions, consistently placed orange prices, and a separate 48 px action row. Optional subcategory space is reserved across cards only when the visible menu uses that metadata. Plain dishes keep their existing Add behavior; modifier labels and all handlers remain in place. Combo cards use the same dimensions and spacing.

The grid uses a minimum card width of 16 rem, calculated within the existing category/menu split. At 424 px, the 96 px rail and 32 px content gutters leave 296 px for the grid: a single readable column. At 768 px there are two columns, and at 1080 px there are three. Wider landscape screens retain additional columns.

The existing orange cart is positioned absolutely inside the bounded menu shell. Shared CSS dimensions provide its height, safe-area-aware bottom gap, and matching bottom padding on the independently scrolling product list. The standard-size bottom gap is 24 px; the last row clears the cart by at least 16 px in the measured viewports. The bar uses a shorter Checkout label and omits its decorative bag icon at narrow widths to keep the count and total readable.

The duplicate floating assistant initially overlapped Checkout. Moving it above the bar still obstructed the final Add control, so it is hidden while the menu cart bar is present. The existing header Need Help action remains available and now has an accessible label; opening it with the cart present was tested. No header layout or category-rail structure was changed.

## Verification

| Viewport, CSS px | Columns | Result |
| --- | ---: | --- |
| 424 × 755 | 1 | Passed |
| 480 × 854 | 1 | Passed |
| 768 × 1024 | 2 | Passed |
| 1080 × 1920 | 3 | Passed |
| 1366 × 768 | 4 | Passed |
| 1920 × 1080 | 6 | Passed |

The final browser run passed **160 checks**, with no uncaught browser exceptions. Checks cover consistent card heights and price positions, 48 px card actions, control containment, absence of product-grid/page horizontal overflow, cart bottom gap, last-row clearance, and unobstructed last-row touch targets.

Touch interactions verified:

- Two quick Add taps create one cart line with quantity two.
- The floating cart opens the existing order summary at 424 × 755.
- Incrementing updates quantity and price; decrementing restores the original total.
- Customize opens the existing modifier dialog.
- Confirming the same default customization merges into the existing line without creating a duplicate.
- Header Need Help remains accessible when the floating launcher is hidden.
- Large-text mode at 424 × 755 and 768 × 1024 fits the cart and preserves last-row clearance.
- Long product names, long descriptions, a missing description, and optional metadata preserve price alignment in isolated test data.

The baseline JSON records Customize targets below 48 px, reproducing the control inconsistency before the change. Before screenshots also show the assistant/cart overlap.

The kiosk TypeScript check and production Vite build passed. The selected existing regression suites passed **54 tests across seven files**: modifiers, modifier selection, pricing, dietary badges, customization/touch keyboard, kiosk display settings, and kiosk order lifecycle.

Commands:

```powershell
node node_modules/typescript/bin/tsc -p apps/kiosk-system/kiosk-user/tsconfig.json --noEmit
node node_modules/vitest/vitest.mjs run tests/modifier_selection.test.ts tests/modifiers.test.ts tests/pricing.test.ts tests/dietary_badge_missing_metadata.test.tsx tests/audit_customization_and_keyboard.test.tsx tests/kiosk_display_settings.test.ts tests/kiosk_order_lifecycle.test.ts --reporter=default
# Run from apps/kiosk-system/kiosk-user:
node ../../../node_modules/vite/bin/vite.js build
# Run from the repository root:
node tooling/qa/browser-kiosk-card-polish.cjs
```

## Screenshots and raw evidence

| View | Before | After |
| --- | --- | --- |
| Cards, 768 × 1024 | [Before](before-menu-768x1024.png) | [After](after-menu-768x1024.png) |
| Cart, 424 × 755 | [Before](before-cart-424x755.png) | [After](after-cart-424x755.png) |
| Last row, 424 × 755 | [Before](before-last-row-424x755.png) | [After](after-last-row-424x755.png) |
| Three-column portrait, 1080 × 1920 | [Before](before-cart-1080x1920.png) | [After](after-cart-1080x1920.png) |

Additional evidence: [large-text last row](after-large-text-last-row-424x755.png), [mixed-content cards](after-mixed-content-768x1024.png), [customization](after-customize-768x1024.png), [quantity controls](after-quantity-424x755.png), [before measurements](before-results.json), and [final measurements and assertions](after-results.json).

## Verification limits and remaining issues

Screenshots render the real kiosk entry point, App, styles, components, and event handlers in local Chromium. The test harness seeds the existing database only in a fresh isolated browser profile and simulates a locally connected device. Every API request and external resource request is blocked; no live activation, restaurant data, payment, or order submission is used. The test server's startup-data injection is confined to the QA script, and no production access rules were changed. External web fonts were blocked in both screenshot sets, so the same configured system-font fallback was used for comparison.

Physical touchscreen hardware, a live activated device/backend, and nonzero hardware safe-area insets were not exercised. The actual ordering interactions were verified locally, not as a live backend checkout.

The existing header and dietary-filter controls remain crowded/clipped at narrow widths, particularly in large-text mode. They were preserved because this task excludes navigation/header redesign; the product grid and its actions fit without horizontal overflow.

ESLint could not run because its declared package is absent from this checkout's `node_modules`; no dependencies were added. The production build reports existing shared printer-import and large-bundle warnings, which are outside this UI refinement.

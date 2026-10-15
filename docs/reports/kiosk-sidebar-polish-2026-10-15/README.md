# Customer kiosk category sidebar correction

Implemented and visually inspected on 2026-10-15 in the existing kiosk application.

## Root cause

The rail is a bounded vertical flex container. Its category buttons, thumbnail containers, and labels all allowed the default `flex-shrink: 1`. When the list exceeded the available height, the browser compressed the contents instead of allowing the rail to scroll naturally.

At **424 × 755**, the nominal 68 px thumbnail height compressed to approximately **30 px**, while the image box was **53 px wide**. Two-line labels were compressed to approximately **13 px**. At **1080 × 1920**, the same images were approximately **54 × 68 px**, making them disproportionately tall. The one-line All Menu label also produced a different tile height from the other categories.

## Changes

| File | Change |
| --- | --- |
| `apps/kiosk-system/kiosk-user/src/App.tsx` | Stop category tiles shrinking; use the existing thumbnail/label structure with scoped classes; tighten padding and gaps; preserve selection handlers and colors; expose the selected state and full localized category names through accessibility attributes. |
| `apps/kiosk-system/kiosk-user/src/index.css` | Non-shrinking square thumbnails sized from available width, a consistent three-line label area, proportional corner icons, and bottom clearance above the existing Display control. |
| `tooling/qa/browser-kiosk-card-polish.cjs` | Add `--sidebar` mode with before/after measurements, screenshots, and category selection/scroll checks. Existing card/cart test mode remains available. |

Tiles derive their dimensions from their contents: a square thumbnail, a 6 px image/label gap, three 16.25 px text lines, padding, and a constant border. Their overall height is not tied to the viewport or distributed across the rail. At the standard text setting, tiles are **124.75 px high** and thumbnails are **56 × 56 px**, consistently across the measured screens. Large-text mode scales the contents naturally.

The 96 px portrait rail width, product-grid width, category data, original images and icons, active-category behavior, colors, API calls, product cards, and cart behavior were preserved. Active and inactive tiles retain identical dimensions. Full localized labels remain available in each button's accessible name and title; the visible label allows up to three lines.

## Verification

| Viewport, CSS px | Rail width | Full categories visible before scrolling |
| --- | ---: | ---: |
| 424 × 755 | 96 px | 4 |
| 480 × 854 | 96 px | 5 |
| 768 × 1024 | 96 px | 6 |
| 1080 × 1920 | 97.19 px | 8 |
| 1366 × 768 | 122.94 px | 5 |

**64 browser checks passed**, with no uncaught browser exceptions. Verified:

- Uniform tile dimensions, square thumbnails, and preserved `object-fit: cover` images.
- Labels fit their reserved space at standard and large text sizes.
- No horizontal rail overflow or overlap with the product grid.
- Real touch events swipe the sidebar independently of the page and menu scroll positions.
- Selecting a category filters the existing menu and changes the active indicator without resizing tiles.
- The last category can be reached and selected by touch.
- The final label is unobstructed by the existing bottom-left Display control.
- All Menu restores the existing category selection behavior.

A separate comparison of before/after measurements confirmed that rail width, grid position, and available product-grid width are unchanged at all five viewports: [layout comparison](layout-preservation.json).

The kiosk TypeScript check and production Vite build passed. The build retains its existing shared printer-import and large-bundle warnings.

```powershell
node tooling/qa/browser-kiosk-card-polish.cjs --sidebar
node node_modules/typescript/bin/tsc -p apps/kiosk-system/kiosk-user/tsconfig.json --noEmit
# From apps/kiosk-system/kiosk-user:
node ../../../node_modules/vite/bin/vite.js build
```

## Screenshots

| View | Before | After |
| --- | --- | --- |
| Portrait, 424 × 755 | [Before](before-sidebar-424x755.png) | [After](after-sidebar-424x755.png) |
| Portrait, 768 × 1024 | [Before](before-sidebar-768x1024.png) | [After](after-sidebar-768x1024.png) |
| Tall portrait, 1080 × 1920 | [Before](before-sidebar-1080x1920.png) | [After](after-sidebar-1080x1920.png) |

Additional evidence: [selected category](after-selected-424x755.png), [last category and Display clearance](after-bottom-424x755.png), [large-text mode](after-large-text-424x755.png), [baseline measurements](before-results.json), and [final measurements and checks](after-results.json).

## Verification limits

Screenshots use the actual kiosk entry point, App, components, and styles in local Chromium with the existing isolated seeded-menu/device fixture. All API/external requests are blocked, and no live restaurant data or activation records are read or changed. External fonts use the same system fallback in both screenshot sets. Physical touchscreen hardware and a live activated backend session were not exercised.

Existing header/filter crowding at narrow widths is outside this sidebar-only change.

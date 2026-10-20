# Customer kiosk action and cart polish

The customer kiosk keeps its existing product grid, image proportions, content,
category rail, calculations, modifiers, and checkout flow.

- Action controls share an 8px gap and height: 40px with a mouse, 44px on touch
  screens, and 48px in the existing accessible display modes. Customize fills the
  available width with a 1px outline; Add is circular with an 18px plus.
- The cart is centered at `min(520px, 100% - 40px)`, compared with the previous
  760px maximum. It has a 60px minimum height, 16px corners, soft elevation, and
  an 18px bottom gap plus the safe-area inset. Large display mode uses 64px.
- The existing Display launcher moves above the cart on narrow screens. Menu
  and category scroll clearance keep final actions accessible.
- CSS animations provide a 260ms first appearance, 220ms cart pulse,
  and 200ms total emphasis. Feedback follows committed quantity/total changes;
  rapid updates cancel earlier feedback. Drawer reopening and unrelated renders
  do not replay entry. Recovered carts receive entry when first shown.
- Reduced motion disables feedback and press transitions. Existing handlers and
  business logic remain in place; no dependencies were added.

## Validation

The real App was rendered with isolated seed data and external/API traffic
blocked, using the repository's existing Chromium harness. No live restaurant,
device, or order was changed. Python is unavailable in this environment, so the
existing Node/CDP harness was used for browser verification.

Viewport coverage: 320×740, 360×800, 390×844, 430×932, 768×1024,
1080×1920 (configured kiosk target), and 1366×768. The target retains three
product columns. Browser checks cover layout geometry, final-row access,
Customize, rapid additions, quantities/totals, drawer behavior, navigation to
payment selection, keyboard focus, disabled controls, reduced motion, mixed
product content, and long values in standard and large display modes.

- Browser: 191 checks passed, with no uncaught browser errors. Results and
  geometry: [after-results.json](after-results.json).
- Baseline: [before-results.json](before-results.json).
- TypeScript: kiosk `tsc --noEmit` passed.
- Existing regression tests: 22 passed across modifiers, modifier selection,
  cart/billing, kiosk order lifecycle, and kiosk payment product scope.
- JavaScript syntax checks and `git diff --check` passed.
- ESLint could not run: its declared package is absent from local node_modules,
  and the npm registry is inaccessible in this environment.

Reproduce browser checks from the repository root:

```powershell
node tooling/qa/browser-kiosk-card-polish.cjs --actions
```

## Rendered evidence

- Kiosk: [before](before-cart-1080x1920.png) / [after](after-cart-1080x1920.png).
- [320px](after-cart-320x740.png), [360px](after-cart-360x800.png),
  [390px](after-cart-390x844.png), [430px](after-cart-430x932.png).
- [Mouse controls](after-mouse-controls-1366x768.png).
- [Final row at 320px](after-last-row-320x740.png).
- [Large display final row at 320px](after-large-last-row-320.png).
- [Long count and total](after-long-values-large-320.png).

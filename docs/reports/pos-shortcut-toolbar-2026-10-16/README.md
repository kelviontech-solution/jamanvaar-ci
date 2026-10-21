# POS operational shortcut toolbar

Moved Billing, Orders, Tables, and Collect out of the sidebar into the Quick service
row. They share the existing icons, labels/translations, POS navigation actions, and
collection inbox mode. A single shortcut set is rendered: beside Quick service in
billing, or at the top of the workspace on other POS tabs and the initial table picker.
This preserves navigation back to Billing after opening Orders, Tables, or Collect.

The toolbar uses wrapping flex rows and 44px controls. Quick service, Repeat last
order, favorites, the barcode form, and their existing handlers remain intact. No
absolute positioning, new scrollbar, dependency, or global style was introduced.

The sidebar's All pages/category mode now lives with the existing POS UI state so
navigation from the relocated Billing button restores categories, just as the former
sidebar button did. It resets on navigation, lock, and sign-out; it is not persisted
as restaurant configuration. Cart calculations, payment rules, table assignment,
permissions, and session navigation persistence remain unchanged.

## Rendered verification

- 43 browser checks passed in the real POS App at 1440×900, 1280×768, 1024×768,
  768×1024, and 390×844.
- All four shortcuts share a row with Quick service at both desktop sizes. At
  narrower sizes, the rows wrap without clipping shortcut labels or hiding actions.
- Removing the sidebar shortcut grid reclaims **129px**. Category row sizes remain
  unchanged, and more rows are visible at both desktop sizes.
- The right order panel retains its exact original bounds and initial content.
  The language selector, Print Queue, Core indicator, footer, and Display control
  remain in place.
- Orders opens the all-orders interface; Collect opens outstanding bills; Tables
  opens the floor interface; Billing restores the catalog and category navigation.
- Quick service expansion, Repeat last order's existing empty-history feedback,
  its active-cart disabled state, cart/total preservation across all shortcuts, and
  payment-dialog access passed.
- No horizontal page overflow or uncaught browser errors occurred.
- POS TypeScript check and `git diff --check` passed.
- 10 existing tests passed across fast cashier workflow, cart/billing, and terminal
  lock persistence. ESLint is unavailable in local node_modules.

Browser verification used an isolated browser profile, seeded local data/staff
session, and blocked external/API traffic. No live restaurant data, orders, bills,
payments, or user sessions were changed.

## Changed POS files

- [PosOperationalShortcuts.tsx](../../../apps/restaurant-system/pos/src/components/layout/PosOperationalShortcuts.tsx)
- [CashierSpeedBar.tsx](../../../apps/restaurant-system/pos/src/components/menu/CashierSpeedBar.tsx)
- [PosSidebar.tsx](../../../apps/restaurant-system/pos/src/components/layout/PosSidebar.tsx)
- [App.tsx](../../../apps/restaurant-system/pos/src/App.tsx)
- [posStore.ts](../../../apps/restaurant-system/pos/src/store/posStore.ts)

## Evidence

| Viewport | Before | After |
| --- | --- | --- |
| 1440×900 | [Desktop](before-toolbar-1440.png) | [Desktop](after-toolbar-1440.png) |
| 1280×768 | [Narrow desktop](before-toolbar-1280.png) | [Narrow desktop](after-toolbar-1280.png) |
| 1024×768 | [Tablet landscape](before-toolbar-1024.png) | [Tablet landscape](after-toolbar-1024.png) |
| 768×1024 | [Tablet portrait](before-toolbar-768.png) | [Tablet portrait](after-toolbar-768.png) |
| 390×844 | [Narrow](before-toolbar-390.png) | [Narrow](after-toolbar-390.png) |

[Expanded Quick service](after-quick-service-expanded.png).
[Baseline geometry](before-results.json). [Final browser results](after-results.json).

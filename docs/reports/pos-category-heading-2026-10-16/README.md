# POS counter category heading removal

Removed the central category heading, dish-count subtitle, and the calculation
used only by that heading from `PosCatalog.tsx`. The existing 10px parent spacing
naturally moves the filters and product grid up by **70px**. No CSS changes were
needed. Category grouping, sidebar labels and highlighting, handlers, cards, and
the rest of the POS remain unchanged.

Verified the real POS App with isolated seed data, an isolated local staff session,
and blocked external/API traffic. The browser-only fixture puts 12 existing seed
dishes into a Pizza & Pasta category to reproduce the requested example. No live
restaurant, user session, bill, payment, or order was changed.

- 31 browser checks passed at 1440×900 (configured desktop), 1280×768, and 1024×768.
- Filters and grid move up exactly 70px at each width, with no heading-sized gap.
- The right order panel retains the same bounds and initial content; the header
  retains the same position and dimensions.
- Sidebar selection, category switching, Modify, product selection, quick add,
  totals, payment-dialog opening, and narrower-screen navigation/order switching
  work. No horizontal page overflow or uncaught browser errors occurred.
- POS TypeScript check passed.
- 15 existing cart/billing and modifier tests passed.
- `git diff --check` passed. ESLint is absent from local node_modules.

Evidence: [before results](before-results.json), [after results](after-results.json).

| Viewport | Before | After |
| --- | --- | --- |
| 1440×900 | [Desktop](before-counter-1440.png) | [Desktop](after-counter-1440.png) |
| 1280×768 | [Narrow desktop](before-counter-1280.png) | [Narrow desktop](after-counter-1280.png) |
| 1024×768 | [Responsive](before-counter-1024.png) | [Responsive](after-counter-1024.png) |

[Narrow-screen order panel](after-narrow-order-panel.png).

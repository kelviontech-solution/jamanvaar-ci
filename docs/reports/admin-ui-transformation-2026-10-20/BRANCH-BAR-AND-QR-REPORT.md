# Branch context bar and QR Ordering consistency — 2026-10-20

Verified in a signed-in session against the isolated QA database and API (never the dev database). Behaviour, routes, permissions and API contracts are unchanged.

## Branch context bar

**Finding.** The strip under the header was a separate full-width white row, 57 px tall, holding one 44 px select on the cream page. The select used a native arrow with no label affordance, the row had a different tint from the header above it, and the header and strip both drew a divider.

**Change** ([AdminBranchWorkspace.tsx](../../../apps/restaurant-system/pos-admin/src/components/header/AdminBranchWorkspace.tsx)). Option B, redesigned: a compact 48 px strip tinted like the header, so the two read as one shell. The header now has no bottom border of its own; the strip owns the divider. The label gets a branch icon, and the select is 36 px with a custom chevron, hover and brand focus ring, and its full "name · code" in a tooltip. On phones the select takes the full width. Nothing was added to the row. The selector, its handler, the unsaved-changes guard and the error and retry states are untouched.

**Related fix.** The header's inline search returned at 1024 px and squeezed out the restaurant name; it now returns at 1280 px, with the compact search button until then. The QR sidebar height was adjusted for the shorter strip.

## QR Ordering: pages inspected

All 27 QR console pages, from `QR_PAGES`, each at 1440, 768 and 390 px: Overview, QR Orders, Service Requests, Operations Hub, Pickup Calendar, Reservations, Menu & Availability, Customers & Loyalty, Guided Menu Setup, Tables & QR, Bills & receipts, Payment Acceptance, Payment Settings, Ordering Rules, Pickup Scheduling, QR Settings, Advanced Features, Customer Branding, Business Page, Restaurant Page QR, Table QR Design, QR Print Packs, Collection Reconciliation, Analytics, Menu Performance, Help & Support.

## Measured inconsistencies (before, then after)

| Item | Before | After |
|---|---|---|
| Page title | 28 px / 800 (rest of admin 24 / 700) | 24 / 700 everywhere |
| Workspace background | cool grey `#f6f7f9` | admin ivory `#faf7f2` |
| Primary action colour | navy (Tables, Advanced, Capabilities, Catalog, Operations, Promotions, Branch preferences) vs 3 oranges (`#b74b05`, `#a94e0c`, `#c2570c`) | one brand orange `#bf540f`, 12 px radius |
| Button radius | 10, 12 and 8 px | 12 px |
| Input family | 46 px / 10 px / 16 px text on 26 pages vs 42-44 px / 12 px / 14 px | 44 px / 12 px / 14 px (16 px on phones to avoid zoom) |
| Card border | `#EBE6DD` on 17 pages, grey `#E5E7EB` on 8, plus 5 one-offs | warm border on 24 of 26 |
| Notices | blue banners on 3 pages, a different blue on Business Page | one neutral notice with an accent edge |
| Sidebar | 12 px labels, white surface, outlined peach active pill | 13 px, admin surface, tint plus accent bar like the main sidebar |
| Focus ring | blue 3 px | brand 2 px |
| Duplicate headings | h2 repeated the h1 on Bills & receipts, Customers & loyalty, Menu performance, Pickup scheduling, Business page studio (plus a marketing eyebrow) | kept for screen readers, hidden visually; eyebrow removed |

## Shared components and styles changed

- New [qrUi.ts](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/qrUi.ts): one primary button, secondary button and form field. Eight QR modules each declared their own copy and now import it.
- [workspace.css](../../../apps/restaurant-system/pos-admin/src/qr/workspace.css): tokens, title scale, `.qr-btn`, focus ring, sidebar.
- [restaurant-page-editor.css](../../../apps/restaurant-system/pos-admin/src/components/qrconsole/restaurant-page-editor.css), `restaurant-page-qr.css`, `qr-receipts.css`: borders, ink and radii mapped onto the shared tokens.
- `tailwind.config.js`: the default `border` colour now matches `jaman-border`. This affects any bare `border` in the admin.
- Receipts layout: three columns now start at 1280 px; at 1024 px the fixed preview card overflowed its column.

## Tested

- **Signed-in flows (12):**
  - Branch select shows the active branch and lists all three.
  - Switching branch saves it and reloads.
  - The QR page shows the new branch.
  - Switching back works.
  - The branch selector's focus ring is visible.
  - QR sidebar navigation sets `aria-current` and the accent bar.
  - Add table opens its inline form.
  - All tools and search filter the nav (27 to 3).
  - Payments scope select and toggles are present.
  - Back to management returns to the dashboard.
  - Mobile drawer opens and navigates.
  - The mobile branch select is usable with no overflow.
- **Sweeps:** all 27 QR pages at 3 widths and all 35 admin pages at 4 widths. No script errors and no horizontal overflow after the Receipts fix.
- **Checks:** typecheck is clean; 350 test files and 2,535 tests pass, including 8 new ones; the `pos-admin` production build succeeds.

## Not verified or not done

- **Lint** cannot run: `eslint` and its plugins are in `package.json` but not installed in this checkout.
- **Saving changes** inside QR forms was not exercised (no data was written), nor were tables with populated data.
- **Broken QR hero and template images** on the long-running dev server on port 5176 are environmental: it predates a Vite config change. Restart it.
- **Card radius and padding** still vary (12/16/18/20 px radii, 12-24 px padding) in a few places where pages have their own CSS (Receipts, Operations Hub, Business Page). Colour, type and controls are unified; geometry was left alone.
- **Brand preview accent** `#c2570c` on the Customer Branding page is the restaurant's own preview colour, not interface chrome, and is unchanged.

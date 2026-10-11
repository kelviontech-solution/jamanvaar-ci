# Restaurant Admin Reports & Analytics — Visual Charts + Missing Reports

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into an implementation plan, then superpowers:subagent-driven-development or superpowers:executing-plans to implement it task-by-task.

**Goal:** Make Restaurant Admin's existing Reports & Analytics feel like a real analytics dashboard (not a document catalog) by giving it real visual charts, and finish the two report types that were declared but never implemented.

**Spec supersedes:** the user's own pasted "complete Reports & Analytics implementation" brief. That brief assumed analytics was largely missing. A direct audit (recorded below) found that assumption wrong for most of it — this spec is the corrected, scoped version the user approved after seeing the audit findings.

## 0. Audit findings (why this spec is smaller than the original ask)

Read in full before this spec was written: `reportDataEngine.ts` (990 lines), `ReportsDashboard.tsx` (1027 lines), `RestaurantDashboard.tsx`, `PrimaryMetricsGrid.tsx`, `HourlySalesChart.tsx`, `BranchBusinessDashboard.tsx`, `navSections.ts`, the backend `cloud/api/src/modules/dashboard/*` (tenant-dashboard service, 128+207 lines), and the `InventoryItem`/`StockMovement`/`CustomerAccount` types.

**Already real and working — do not rebuild:**
- `ReportDataEngine` (local-first, computes from `db.orders`): gross/net sales, discounts, CGST/SGST, orders, AOV, cash/UPI/card/split/other collected, refunds, cancellations, hourly sales, day-by-day rows, dish performance (with food-cost estimate + margin), category performance, table performance, staff performance, kitchen-station performance, GST breakdown, EOD cash reconciliation. All with period presets (Today/Yesterday/Last 7/30 days/This month/Last month/This year/Custom) and previous-period comparison variance (`MetricWithVariance`, already handles a zero previous value without dividing by zero).
- `ReportsDashboard.tsx`: category tabs, period/compare/filter controls, a catalog of report documents, PDF-style preview, export, favorites/recents, design themes.
- `RestaurantDashboard.tsx`: 4 KPI hero cards, a real hourly-sales bar chart (hand-rolled SVG-free div/Tailwind bars, hover tooltips, real data, empty state), top-dishes leaderboard, operational snapshot, needs-attention panel.
- `BranchBusinessDashboard.tsx` + `GET /api/v1/tenant/dashboard` (real NestJS service): cross-branch sales trend, sales-by-source, sales-by-branch, top items, device health, alerts, recent orders — already covers cross-branch and per-channel comparison for multi-branch owners.
- Inline comments in the engine (`"was previously hardcoded"`) show this code already went through a real correctness pass removing fake values — not asking this spec to repeat that audit.
- `REPORTS` nav entry is already correctly placed in its own "ANALYTICS & SYSTEM" sidebar section for a full Restaurant Admin (POS_ADMIN) console (the cramped "under Payments & Service" placement only affects the separate solo-Kiosk-only nav variant, which this spec does not touch).

**Confirmed gaps (what this spec actually builds):**
1. No real line or donut/pie chart exists anywhere in the app — every chart is a hand-rolled bar. The reference screenshot's trend line and payment donut don't exist in that form.
2. `ReportsDashboard.tsx` opens straight into a document-catalog browsing experience with zero visual charts — this is very likely the actual "I can't find analytics" complaint: the landing experience doesn't read as an analytics dashboard.
3. `CustomerReportRow` and `InventoryReportRow` are declared as TypeScript interfaces in `reportDataEngine.ts` with **no computing method anywhere in the file** — dead, unimplemented stubs.
4. No recipe/BOM-based ingredient-consumption inference exists anywhere in the codebase — confirmed by grep. The Inventory report below is scoped to real stock-movement data only, per the user's own spec instruction not to infer consumption without reliable recipe-deduction logic.

## Global Constraints

- No new runtime dependencies (user chose hand-rolled SVG/Tailwind charts over a charting library, matching the existing `HourlySalesChart`/`BranchBusinessDashboard` precedent).
- All new chart/report data comes from `db.orders` / `db.customerAccounts` / `db.inventoryItems` / `db.stockMovements` already synced to this device — this is a local-first app; no new backend endpoint is needed for anything in this spec (unlike the cross-branch dashboard, which already has its own real backend and is out of scope here).
- Currency formatting via the existing `formatINR` from `@jamanvaar/utils` everywhere; no ad hoc `Intl.NumberFormat` calls.
- Every new metric must say plainly when there isn't enough data to compute it (e.g., "No wastage recorded this period") rather than showing a zero that looks like a real zero.
- Reuse `ReportDataEngine.getDateRange`/`getCompareDateRange`/`getOrders` for every new report — do not hand-roll a second date-filtering path.
- Jamanvaar brand: ivory/white surfaces, navy (`jaman-navy`) text, saffron (`jaman-saffron`/`brand`) accent — match `HourlySalesChart.tsx`'s existing palette exactly for the new charts.

## Review Focus

- A restaurant with zero orders in the selected period must show a real, worded empty state on every new chart/report — not a chart drawn with all-zero bars that looks broken.
- A restaurant with exactly one order in the comparison period must not show a divide-by-zero or a nonsensical "+Infinity%" change (the engine's existing `MetricWithVariance` logic already guards this — the new charts must keep using it, not recompute their own percentage).
- A customer with orders but no stored `CustomerAccount` phone match (guest checkout, no phone given) must not silently disappear from order totals elsewhere — the new Customer report counts only matched accounts and says how many orders had no linked customer, rather than quietly under-counting.
- A stock item with `currentStock` below `reorderLevel` but zero recorded `StockMovement` rows in the selected period (e.g. it just arrived low) must still appear in the low-stock list, since that list is a live snapshot, not period-scoped — don't accidentally filter it out by reusing the period-scoped order query path.
- Switching the global period/branch filter must re-run every widget on the new Overview tab from the same single `ReportDateRange`/order fetch, not five independent re-fetches with possibly-different boundaries.

---

## 1. Reports & Analytics: lead with a visual Overview

**Problem:** opening "Reports & Analytics" currently lands on a document catalog. Nothing on that screen looks like analytics until you pick a report and generate a PDF preview.

**Design:** add a new default tab/section at the top of `ReportsDashboard.tsx`, **"Overview"**, shown before the existing report catalog (which stays, unchanged, as "Detailed Reports" below it). Overview contains:

- The existing period/compare/filter controls `ReportsDashboard.tsx` already has (reused, not duplicated).
- A row of KPI cards (gross sales, net sales, orders, AOV, discounts, refunds+cancellations, tax collected) sourced from `ReportDataEngine.calculateSummary` — the same computation already powering `PrimaryMetricsGrid` on the Dashboard page, called here with whatever period/filters Overview's own controls are set to (independent of the Dashboard page's own period state).
- **Sales Trend** — the new line chart (section 2), fed by `ReportDataEngine.getDayByDayRows`.
- **Payment Method Split** — the new donut chart (section 2), fed by `calculateSummary`'s existing cash/upi/card/split/other fields.
- **Order Channel Split** — a second donut, fed by a small new aggregation over `orderType`/`source_type` on the already-fetched order list for the period (grouped the same way `getCategoryPerformance` already groups by category — same pattern, different key).

Dashboard's own "View all" link from `TopDishesLeaderboard` (`setActiveTab('REPORTS'); setReportSubTab('TOP_ITEMS')`) is left as-is; Overview becomes reachable the same way every other `REPORTS` sub-view already is.

## 2. Two new hand-rolled chart components

New folder: `apps/restaurant-system/pos-admin/src/components/charts/`.

**`SalesTrendLineChart.tsx`** — SVG line/area chart over `DayRow[]` (already computed by `getDayByDayRows`). Axis labels from `displayDate`, hover tooltip showing the exact `grossSales`/`netSales`/`ordersCount` for that day (same tooltip visual language as `HourlySalesChart`: dark navy pill, small triangle pointer). Empty state when the range has zero days with orders (not zero days total — a 30-day range with 2 active days still draws a real line across those 2 points plus flat zero elsewhere, it does not say "no data" just because most days are empty).

**`DonutChart.tsx`** — generic, reusable: takes `{ segments: { label: string; value: number; color?: string }[] }`. Renders an SVG ring (stroke-dasharray per segment), a legend with percentage labels, hover highlights the matching ring segment and legend row together. Used for both Payment Method Split and Order Channel Split (and reusable later for Order Status Split if that's ever added — not built speculatively now, just not precluded). Empty state when `segments` sums to zero.

Both components live under the same prop contract as `HourlySalesChart` (data in, no internal fetching) so they're pure and independently testable.

## 3. Customer report (new)

New method `ReportDataEngine.getCustomerReport(orders: Order[]): CustomerReportResult`:

```ts
export interface CustomerReportResult {
  matchedOrders: number;
  unmatchedOrders: number; // orders with no customerPhone, or a phone with no CustomerAccount record
  newCustomers: number; // CustomerAccount.createdAt falls inside the selected range
  repeatCustomers: number; // had at least one order before the range start
  topSpenders: CustomerReportRow[]; // top 10 by spend within the range, not lifetime totalSpend
  avgSpendPerVisit: MetricWithVariance;
}

export interface CustomerReportRow {
  phone: string;
  name?: string;
  ordersInRange: number;
  spendInRange: number;
  lastVisitAt?: string;
  tags?: string[];
}
```

Computed entirely from the already-fetched `orders` (grouped by `customerPhone`) joined against `db.customerAccounts` for name/tags — no new sync, no new local-first collection. Rendered as a new "Customers" entry in `ReportsDashboard.tsx`'s existing `CUSTOMERS` category tab (the tab already exists in `ReportCategoryKey`; it currently has no report wired to it), as a sortable table matching the visual style of the existing Dish/Table/Staff performance report tables.

## 4. Inventory report (new)

New method `ReportDataEngine.getInventoryReport(orders: Order[], range: ReportDateRange): InventoryReportResult`:

```ts
export interface InventoryReportResult {
  lowStock: InventoryReportRow[]; // live snapshot: db.inventoryItems where status !== 'IN_STOCK', NOT period-scoped
  movementsInRange: { type: StockMovement['type']; count: number; quantityTotal: number; costImpactTotal: number }[];
  topWastageByCost: InventoryReportRow[]; // top 10 by cost impact; only populated when WASTE/SPOILAGE movements exist in range; otherwise explicitly empty with a "no wastage recorded" reason, not a fabricated zero row
}

export interface InventoryReportRow {
  itemId: string;
  name: string;
  sku: string;
  currentStock: number;
  unit: string;
  status: InventoryItem['status'];
  costImpactInRange?: number;
}
```

Low-stock list reads `db.inventoryItems` directly (a live snapshot — explicitly NOT run through `getOrders`'s period filter, per the Review Focus item above). Movements and wastage read `db.stockMovements` filtered by `createdAt` falling inside the selected `ReportDateRange`. Rendered as a new "Inventory" entry in the existing `INVENTORY` category tab, same table styling convention as the other report tables.

## 5. Out of scope for this pass

- POS's own separate report module (`apps/restaurant-system/pos/src/components/reports/*`) was not audited for duplication against `reportDataEngine.ts` in this pass — flagged as a follow-up, not fixed here.
- Staff, Table, Station, GST, Branch, and Channel-vs-cross-branch reports already exist (engine + `BranchBusinessDashboard`) and are not rebuilt; only the Order Channel Split donut (section 1) is new, and it's a thin aggregation, not a new report page.
- No charting library, no scheduled/emailed reports, no Super Admin platform-wide analytics changes, no marketing-website claim audit (per the user's own answer, these were explicitly not selected).

## 6. Testing

- Unit tests for `getCustomerReport` and `getInventoryReport` against fixed `db.orders`/`db.customerAccounts`/`db.inventoryItems`/`db.stockMovements` fixtures with known expected totals (mirrors how the existing engine methods are likely already tested — reuse that fixture pattern, don't invent a new one).
- Component-level check that `SalesTrendLineChart` and `DonutChart` render their empty state on zero data and their real state on fixture data (no snapshot-testing pixel output — assert on the rendered labels/values, matching this repo's existing testing style).
- Manual verification pass on a real branch with orders: Overview tab's KPI cards match the Dashboard page's own KPI cards for the same period (same underlying `calculateSummary` call, so they must agree exactly).

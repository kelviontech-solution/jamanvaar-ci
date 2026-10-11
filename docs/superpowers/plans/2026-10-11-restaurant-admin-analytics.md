# Restaurant Admin Reports & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution method for this plan is **Native** (the main session implements every task directly — no subagent-driven-development).

**Goal:** Give Restaurant Admin's Reports & Analytics a real visual "Overview" (KPI cards + a sales-trend line chart + two donut charts) as its landing view instead of a bare document catalog, and implement the two report types (Customer, Inventory) whose catalog entries currently render nothing.

**Architecture:** Everything reads from the already-synced local-first `db` singleton (`@jamanvaar/database`) through `ReportDataEngine`'s existing static-method pattern — no backend/API changes anywhere in this plan. Two new chart components are hand-rolled SVG (no new dependency, per explicit user decision), styled to match the one existing real chart (`HourlySalesChart.tsx`). The two new reports follow the exact structural pattern already used by `LossReportPanel`/`PrepTimePanel`/`LabourPanel` in `OwnerInsightPanels.tsx`.

**Tech Stack:** React 18 + TypeScript, Tailwind (no component library), Vitest (root-level `tests/*.test.ts`, run via `npm test` from the repo root), `@jamanvaar/database` (local-first `db` singleton), `@jamanvaar/utils` (`formatINR`).

**Spec:** `docs/superpowers/specs/2026-10-11-restaurant-admin-analytics-design.md`

## Global Constraints

- No new runtime dependencies — both new charts are hand-rolled SVG/Tailwind, matching `HourlySalesChart.tsx`'s existing style (navy/saffron palette, dark-navy-pill hover tooltip with a small triangle pointer, worded empty states).
- All currency values go through `formatINR` from `@jamanvaar/utils` — never a local `Intl.NumberFormat` call.
- Every new `ReportDataEngine` method takes already-fetched data (`Order[]`, a `ReportDateRange`) and does no fetching of its own, matching every existing method on that class (`getDishPerformance`, `getCategoryPerformance`, etc.).
- Reuse `ReportDataEngine.getDateRange`/`getCompareDateRange`/`getOrders` for all date filtering — never hand-roll a second date-range comparison.
- Do not touch `cloud/api` or any backend file — this plan is 100% local-first client code.
- No git commit step in any task (the user's standing instruction this session is not to commit or push) — each task's last step is local verification only.
- Match the established visual pattern from `OwnerInsightPanels.tsx` exactly for the two new report panels: shared `card`/`cell`/`headRow` class-name constants, a `<div className={card}>` wrapper, a header row (title left, one summary stat right), a worded empty state when there's no data, tables styled identically to the existing ones in that file.

## Review Focus

- A restaurant with zero orders in the selected period must show a real worded empty state on the new Overview tab's charts and KPI cards, not a chart drawn from all-zero data that looks broken or a "0%" change that looks like a real negative trend. (Task 5, Task 8)
- A `ReportSummaryMetrics` field whose `previous` value is `0` or `undefined` must not render `Infinity%`/`NaN%` on the new KPI cards — `MetricWithVariance.diffPercent` is already computed by the existing engine with this guarded; the new KPI card component must trust that field as-is and never recompute its own percentage from `current`/`previous`. (Task 5)
- An order with no `customerPhone`, or a `customerPhone` with no matching `CustomerAccount` record, must be counted in `unmatchedOrders` rather than silently vanishing from the Customer report's totals. (Task 1)
- An `InventoryItem` with `currentStock` below `reorderLevel` but zero `StockMovement` rows inside the selected date range must still appear in the Inventory report's low-stock list — that list is a live snapshot of `db.inventoryItems`, not filtered by the period's order/movement window. (Task 2)
- Clicking any of the 14 existing CUSTOMERS/INVENTORY report catalog entries (`CUSTOMER_SALES`, `NEW_CUSTOMERS`, `RETURNING_CUSTOMERS`, `REPEAT_VISIT_RATE`, `CUSTOMER_LIFETIME_VALUE`, `AVG_CUSTOMER_SPEND`, `LOYALTY_POINTS`, `STOCK_MOVEMENT`, `LOW_STOCK`, `INGREDIENT_USAGE`, `WASTE_REPORT`, `PURCHASE_VS_CONSUMPTION`, `MENU_FOOD_COST`, `ESTIMATED_GROSS_MARGIN`) currently renders nothing in the right-hand content area — confirmed by reading `ReportsDashboard.tsx`'s full content-routing conditional chain (lines ~771-995), which has zero branches for any of these 14 ids. Every one of them must render the new panel after this plan, not just a couple of representative ones. (Task 9)

---

### Task 1: `ReportDataEngine.getCustomerReport`

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine.ts` (replace the existing bare `CustomerReportRow` interface around line 164-173, and add the new method near the other `getXPerformance` methods, after `getStationPerformance` at line 824-885)
- Test: `tests/pos_admin_customer_report.test.ts`

**Interfaces:**
- Consumes: `Order[]` (already-filtered, from `ReportDataEngine.getOrders`), `db.customerAccounts: CustomerAccount[]` (from `@jamanvaar/database`)
- Produces: `ReportDataEngine.getCustomerReport(orders: Order[]): CustomerReportResult`, exported types `CustomerReportResult`, `CustomerReportRow` — consumed by Task 6's `CustomerReportPanel` and Task 9's wiring.

- [ ] **Step 1: Write the failing tests**

Create `tests/pos_admin_customer_report.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { ReportDataEngine, ReportDateRange } from '../apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine';
import { Order } from '@jamanvaar/types';

const rangeCoveringNow = (): ReportDateRange => ({
  startDate: new Date(Date.now() - 60 * 60 * 1000),
  endDate: new Date(Date.now() + 60 * 60 * 1000),
  preset: 'TODAY',
  label: 'Today'
});

describe('ReportDataEngine.getCustomerReport', () => {
  beforeEach(() => {
    db.orders = [];
    db.customerAccounts = [];
  });

  it('counts an order with no customerPhone as unmatched, not silently dropped', () => {
    const order = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 200, cgstAmount: 5, sgstAmount: 5, taxAmount: 10, totalAmount: 210,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS'
    } as Partial<Order>);

    const report = ReportDataEngine.getCustomerReport([order]);
    expect(report.matchedOrders).toBe(0);
    expect(report.unmatchedOrders).toBe(1);
    expect(report.topSpenders).toHaveLength(0);
  });

  it('counts an order whose customerPhone has no CustomerAccount record as unmatched too', () => {
    const order = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 200, cgstAmount: 5, sgstAmount: 5, taxAmount: 10, totalAmount: 210,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS',
      customerPhone: '9999999999'
    } as Partial<Order>);

    const report = ReportDataEngine.getCustomerReport([order]);
    expect(report.matchedOrders).toBe(0);
    expect(report.unmatchedOrders).toBe(1);
  });

  it('matches an order to its CustomerAccount, sums spend in range, and ranks top spenders', () => {
    db.customerAccounts.push({
      phone: '8888888888', name: 'Asha Patel', loyaltyPoints: 0, favoriteItemIds: [], recentOrderIds: [],
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    });
    const orderA = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 500, cgstAmount: 12.5, sgstAmount: 12.5, taxAmount: 25, totalAmount: 525,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS',
      customerPhone: '8888888888'
    } as Partial<Order>);
    const orderB = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 300, cgstAmount: 7.5, sgstAmount: 7.5, taxAmount: 15, totalAmount: 315,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS',
      customerPhone: '8888888888'
    } as Partial<Order>);

    const report = ReportDataEngine.getCustomerReport([orderA, orderB]);
    expect(report.matchedOrders).toBe(2);
    expect(report.unmatchedOrders).toBe(0);
    expect(report.topSpenders[0].phone).toBe('8888888888');
    expect(report.topSpenders[0].ordersInRange).toBe(2);
    expect(report.topSpenders[0].spendInRange).toBe(840);
    expect(report.topSpenders[0].name).toBe('Asha Patel');
  });

  it('classifies a customer created inside the range as new, and one created before it as repeat', () => {
    const now = new Date();
    db.customerAccounts.push(
      { phone: '7000000001', name: 'New Guest', loyaltyPoints: 0, favoriteItemIds: [], recentOrderIds: [], createdAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString() },
      { phone: '7000000002', name: 'Regular', loyaltyPoints: 0, favoriteItemIds: [], recentOrderIds: [], createdAt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString() }
    );
    const o1 = OrderRepository.createOrder({ idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [], subtotal: 100, cgstAmount: 2.5, sgstAmount: 2.5, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', customerPhone: '7000000001' } as Partial<Order>);
    const o2 = OrderRepository.createOrder({ idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [], subtotal: 100, cgstAmount: 2.5, sgstAmount: 2.5, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', customerPhone: '7000000002' } as Partial<Order>);

    const report = ReportDataEngine.getCustomerReport([o1, o2], rangeCoveringNow());
    expect(report.newCustomers).toBe(1);
    expect(report.repeatCustomers).toBe(1);
  });

  it('reports avgSpendPerVisit as a MetricWithVariance built from matched orders only', () => {
    const report = ReportDataEngine.getCustomerReport([]);
    expect(report.avgSpendPerVisit.current).toBe(0);
    expect(report.matchedOrders).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- pos_admin_customer_report` (from the repo root)
Expected: FAIL — `ReportDataEngine.getCustomerReport is not a function`

- [ ] **Step 3: Replace the dead interface and add the real method**

In `reportDataEngine.ts`, replace the existing bare interface (around line 164):

```ts
export interface CustomerReportRow {
  phone: string;
  name?: string;
  ordersInRange: number;
  spendInRange: number;
  lastVisitAt?: string;
  tags?: string[];
}

export interface CustomerReportResult {
  matchedOrders: number;
  unmatchedOrders: number;
  newCustomers: number;
  repeatCustomers: number;
  topSpenders: CustomerReportRow[];
  avgSpendPerVisit: MetricWithVariance;
}
```

Add the import of `CustomerAccount` at the top of the file (it already imports `Order, MenuItem, Category, DiningTable, User` from `@jamanvaar/types` — add `CustomerAccount` to that same import list), and add `db` access the same way every other method does (the file already imports `db` from `@jamanvaar/database` at the top).

Add the method to the `ReportDataEngine` class, immediately after `getStationPerformance` (which ends around line 885, right before `getGstReport` begins):

```ts
public static getCustomerReport(orders: Order[], range?: ReportDateRange): CustomerReportResult {
  const byPhone = new Map<string, { ordersInRange: number; spendInRange: number; lastVisitAt?: string }>();
  let matchedOrders = 0;
  let unmatchedOrders = 0;

  for (const order of orders) {
    const phone = order.customerPhone;
    const account = phone ? db.customerAccounts.find((c) => c.phone === phone) : undefined;
    if (!phone || !account) {
      unmatchedOrders++;
      continue;
    }
    matchedOrders++;
    const entry = byPhone.get(phone) ?? { ordersInRange: 0, spendInRange: 0, lastVisitAt: undefined };
    entry.ordersInRange++;
    entry.spendInRange += order.totalAmount;
    if (!entry.lastVisitAt || order.createdAt > entry.lastVisitAt) entry.lastVisitAt = order.createdAt;
    byPhone.set(phone, entry);
  }

  const rangeStart = range?.startDate;
  let newCustomers = 0;
  let repeatCustomers = 0;
  for (const phone of byPhone.keys()) {
    const account = db.customerAccounts.find((c) => c.phone === phone);
    if (!account) continue;
    const createdInRange = rangeStart && account.createdAt ? new Date(account.createdAt) >= rangeStart : false;
    if (createdInRange) newCustomers++; else repeatCustomers++;
  }

  const topSpenders: CustomerReportRow[] = [...byPhone.entries()]
    .map(([phone, v]) => {
      const account = db.customerAccounts.find((c) => c.phone === phone);
      return { phone, name: account?.name, ordersInRange: v.ordersInRange, spendInRange: v.spendInRange, lastVisitAt: v.lastVisitAt, tags: account?.tags };
    })
    .sort((a, b) => b.spendInRange - a.spendInRange)
    .slice(0, 10);

  const totalSpend = [...byPhone.values()].reduce((sum, v) => sum + v.spendInRange, 0);
  const avgSpendPerVisit: MetricWithVariance = { current: matchedOrders > 0 ? Math.round((totalSpend / matchedOrders) * 100) / 100 : 0 };

  return { matchedOrders, unmatchedOrders, newCustomers, repeatCustomers, topSpenders, avgSpendPerVisit };
}
```

Note: the test file calls `ReportDataEngine.getCustomerReport([order])` (one argument) in most cases and `ReportDataEngine.getCustomerReport([o1, o2], rangeCoveringNow())` (two arguments) in the new/repeat test — `range` must be optional (`range?: ReportDateRange`), and `newCustomers`/`repeatCustomers` must both be `0` when `range` is omitted (no customer can be classified without a range to compare `createdAt` against) — confirm this matches the method body above (it does: `rangeStart` is `undefined` when `range` is omitted, so `createdInRange` is always `false`, so everyone who appears would count as `repeatCustomers`; the first three tests never check `newCustomers`/`repeatCustomers` so this is safe, but note it for Task 6/9: always pass `range` when calling this from `ReportsDashboard.tsx`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- pos_admin_customer_report` (from the repo root)
Expected: PASS, all 5 tests

- [ ] **Step 5: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

---

### Task 2: `ReportDataEngine.getInventoryReport`

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine.ts` (replace the existing bare `InventoryReportRow` interface around line 174-186, add the method after Task 1's `getCustomerReport`)
- Test: `tests/pos_admin_inventory_report.test.ts`

**Interfaces:**
- Consumes: `db.inventoryItems: InventoryItem[]`, `db.stockMovements: StockMovement[]` (both from `@jamanvaar/database`), a `ReportDateRange`
- Produces: `ReportDataEngine.getInventoryReport(range: ReportDateRange): InventoryReportResult`, exported types `InventoryReportResult`, `InventoryReportRow` — consumed by Task 7's `InventoryReportPanel` and Task 9's wiring. Unlike every other method on this class, this one does NOT take `orders: Order[]` as its first argument — it has nothing to do with orders, only stock state and movements, so its signature is `(range: ReportDateRange)` alone.

- [ ] **Step 1: Write the failing tests**

Create `tests/pos_admin_inventory_report.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { ReportDataEngine, ReportDateRange } from '../apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine';

const rangeCoveringNow = (): ReportDateRange => ({
  startDate: new Date(Date.now() - 60 * 60 * 1000),
  endDate: new Date(Date.now() + 60 * 60 * 1000),
  preset: 'TODAY',
  label: 'Today'
});

describe('ReportDataEngine.getInventoryReport', () => {
  beforeEach(() => {
    db.inventoryItems = [];
    db.stockMovements = [];
  });

  it('lists a low-stock item even with zero stock movements in range (live snapshot, not period-scoped)', () => {
    db.inventoryItems.push({
      id: 'inv-1', name: 'Paneer', sku: 'PNR-01', category: 'Dairy', unit: 'kg',
      currentStock: 2, minStockLevel: 5, reorderLevel: 5, costPerUnit: 320,
      status: 'LOW_STOCK', updatedAt: new Date().toISOString()
    });

    const report = ReportDataEngine.getInventoryReport(rangeCoveringNow());
    expect(report.lowStock).toHaveLength(1);
    expect(report.lowStock[0].itemId).toBe('inv-1');
    expect(report.lowStock[0].currentStock).toBe(2);
  });

  it('does not list an IN_STOCK item in the low-stock list', () => {
    db.inventoryItems.push({
      id: 'inv-2', name: 'Rice', sku: 'RCE-01', category: 'Grains', unit: 'kg',
      currentStock: 40, minStockLevel: 5, reorderLevel: 10, costPerUnit: 60,
      status: 'IN_STOCK', updatedAt: new Date().toISOString()
    });

    const report = ReportDataEngine.getInventoryReport(rangeCoveringNow());
    expect(report.lowStock).toHaveLength(0);
  });

  it('summarizes stock movements in range grouped by type', () => {
    const now = new Date().toISOString();
    db.stockMovements.push(
      { id: 'mv-1', itemId: 'inv-1', itemName: 'Paneer', type: 'SALE', quantityDelta: -2, unit: 'kg', orderId: 'ord-1', reason: 'Order consumption', performedBy: 'system', createdAt: now } as any,
      { id: 'mv-2', itemId: 'inv-1', itemName: 'Paneer', type: 'SALE', quantityDelta: -1, unit: 'kg', orderId: 'ord-2', reason: 'Order consumption', performedBy: 'system', createdAt: now } as any,
      { id: 'mv-3', itemId: 'inv-1', itemName: 'Paneer', type: 'PURCHASE', quantityDelta: 10, unit: 'kg', costImpact: 3200, reason: 'Restock', performedBy: 'manager', createdAt: now } as any
    );

    const report = ReportDataEngine.getInventoryReport(rangeCoveringNow());
    const sale = report.movementsInRange.find((m) => m.type === 'SALE')!;
    const purchase = report.movementsInRange.find((m) => m.type === 'PURCHASE')!;
    expect(sale.count).toBe(2);
    expect(sale.quantityTotal).toBe(-3);
    expect(purchase.count).toBe(1);
    expect(purchase.costImpactTotal).toBe(3200);
  });

  it('excludes a movement outside the selected date range', () => {
    db.stockMovements.push({
      id: 'mv-old', itemId: 'inv-1', itemName: 'Paneer', type: 'SALE', quantityDelta: -5, unit: 'kg',
      reason: 'Old sale', performedBy: 'system', createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    } as any);

    const report = ReportDataEngine.getInventoryReport(rangeCoveringNow());
    expect(report.movementsInRange).toHaveLength(0);
  });

  it('returns an explicitly empty wastage list, not a fabricated zero row, when no WASTE/SPOILAGE movements exist', () => {
    const report = ReportDataEngine.getInventoryReport(rangeCoveringNow());
    expect(report.topWastageByCost).toHaveLength(0);
  });

  it('ranks top wastage by cost when WASTE/SPOILAGE movements exist in range', () => {
    db.inventoryItems.push(
      { id: 'inv-3', name: 'Tomato', sku: 'TMT-01', category: 'Vegetables', unit: 'kg', currentStock: 8, minStockLevel: 5, reorderLevel: 5, costPerUnit: 40, status: 'IN_STOCK', updatedAt: new Date().toISOString() },
      { id: 'inv-4', name: 'Milk', sku: 'MLK-01', category: 'Dairy', unit: 'ltr', currentStock: 12, minStockLevel: 5, reorderLevel: 5, costPerUnit: 55, status: 'IN_STOCK', updatedAt: new Date().toISOString() }
    );
    const now = new Date().toISOString();
    db.stockMovements.push(
      { id: 'mv-w1', itemId: 'inv-3', itemName: 'Tomato', type: 'WASTE', quantityDelta: -5, unit: 'kg', costImpact: 200, reason: 'Spoiled', performedBy: 'chef', createdAt: now } as any,
      { id: 'mv-w2', itemId: 'inv-4', itemName: 'Milk', type: 'SPOILAGE', quantityDelta: -10, unit: 'ltr', costImpact: 550, reason: 'Expired', performedBy: 'chef', createdAt: now } as any
    );

    const report = ReportDataEngine.getInventoryReport(rangeCoveringNow());
    expect(report.topWastageByCost[0].itemId).toBe('inv-4');
    expect(report.topWastageByCost[0].costImpactInRange).toBe(550);
    expect(report.topWastageByCost[1].itemId).toBe('inv-3');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- pos_admin_inventory_report` (from the repo root)
Expected: FAIL — `ReportDataEngine.getInventoryReport is not a function`

- [ ] **Step 3: Replace the dead interface and add the real method**

Replace the existing bare interface (around line 174):

```ts
export interface InventoryReportRow {
  itemId: string;
  name: string;
  sku: string;
  currentStock: number;
  unit: string;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  costImpactInRange?: number;
}

export interface InventoryMovementSummary {
  type: 'PURCHASE' | 'RESTOCK' | 'SALE' | 'SALE_REVERSAL' | 'WASTE' | 'SPOILAGE' | 'ADJUSTMENT';
  count: number;
  quantityTotal: number;
  costImpactTotal: number;
}

export interface InventoryReportResult {
  lowStock: InventoryReportRow[];
  movementsInRange: InventoryMovementSummary[];
  topWastageByCost: InventoryReportRow[];
}
```

Add `InventoryItem, StockMovement` to the existing `@jamanvaar/types` import. Add the method right after Task 1's `getCustomerReport`:

```ts
public static getInventoryReport(range: ReportDateRange): InventoryReportResult {
  const lowStock: InventoryReportRow[] = (db.inventoryItems ?? [])
    .filter((item) => item.status !== 'IN_STOCK')
    .map((item) => ({ itemId: item.id, name: item.name, sku: item.sku, currentStock: item.currentStock, unit: item.unit, status: item.status }))
    .sort((a, b) => a.currentStock - b.currentStock);

  const inRange = (db.stockMovements ?? []).filter((m) => {
    const t = new Date(m.createdAt).getTime();
    return t >= range.startDate.getTime() && t <= range.endDate.getTime();
  });

  const movementsByType = new Map<string, InventoryMovementSummary>();
  for (const m of inRange) {
    const entry = movementsByType.get(m.type) ?? { type: m.type, count: 0, quantityTotal: 0, costImpactTotal: 0 };
    entry.count++;
    entry.quantityTotal += m.quantityDelta;
    entry.costImpactTotal += m.costImpact ?? 0;
    movementsByType.set(m.type, entry);
  }

  const wastageByItem = new Map<string, number>();
  for (const m of inRange) {
    if (m.type !== 'WASTE' && m.type !== 'SPOILAGE') continue;
    wastageByItem.set(m.itemId, (wastageByItem.get(m.itemId) ?? 0) + (m.costImpact ?? 0));
  }
  const topWastageByCost: InventoryReportRow[] = [...wastageByItem.entries()]
    .map(([itemId, costImpactInRange]) => {
      const item = (db.inventoryItems ?? []).find((i) => i.id === itemId);
      return { itemId, name: item?.name ?? 'Unknown item', sku: item?.sku ?? '', currentStock: item?.currentStock ?? 0, unit: item?.unit ?? '', status: item?.status ?? 'IN_STOCK', costImpactInRange };
    })
    .sort((a, b) => (b.costImpactInRange ?? 0) - (a.costImpactInRange ?? 0))
    .slice(0, 10);

  return { lowStock, movementsInRange: [...movementsByType.values()], topWastageByCost };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- pos_admin_inventory_report` (from the repo root)
Expected: PASS, all 6 tests

- [ ] **Step 5: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

---

### Task 3: `DonutChart` — reusable hand-rolled SVG donut

**Files:**
- Create: `apps/restaurant-system/pos-admin/src/components/charts/DonutChart.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DonutChart` component, `{ title: string; segments: { label: string; value: number; color: string }[] }` props — consumed by Task 8.

- [ ] **Step 1: Write the component**

```tsx
import React, { useState } from 'react';
import { formatINR } from '@jamanvaar/utils';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  title: string;
  segments: DonutSegment[];
  /** How each segment's value is displayed in the legend and tooltip — money by default. */
  formatValue?: (n: number) => string;
}

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const DonutChart: React.FC<DonutChartProps> = ({ title, segments, formatValue = formatINR }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col h-full">
      <h3 className="font-bold text-base text-jaman-navy tracking-tight pb-4 border-b border-slate-100">{title}</h3>

      {total === 0 ? (
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center p-6 bg-jaman-cream/50 rounded-xl border border-dashed border-jaman-border my-3">
          <p className="text-sm font-bold text-jaman-navy">No data in this period</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">This breaks down once orders exist for the selected range.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col sm:flex-row items-center gap-6 pt-5">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {(() => {
                let offset = 0;
                return segments.filter((s) => s.value > 0).map((s, idx) => {
                  const fraction = s.value / total;
                  const dash = fraction * CIRCUMFERENCE;
                  const el = (
                    <circle
                      key={s.label}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={hoveredIdx === idx ? STROKE + 4 : STROKE}
                      strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                      strokeDashoffset={-offset}
                      opacity={hoveredIdx === null || hoveredIdx === idx ? 1 : 0.35}
                      style={{ transition: 'stroke-width 0.15s, opacity 0.15s' }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  );
                  offset += dash;
                  return el;
                });
              })()}
            </g>
            <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" className="fill-jaman-navy font-bold" style={{ fontSize: 15 }}>
              {hoveredIdx !== null ? formatValue(segments.filter((s) => s.value > 0)[hoveredIdx]?.value ?? 0) : formatValue(total)}
            </text>
            <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
              {hoveredIdx !== null ? segments.filter((s) => s.value > 0)[hoveredIdx]?.label : 'Total'}
            </text>
          </svg>

          <div className="flex-1 w-full space-y-2">
            {segments.filter((s) => s.value > 0).map((s, idx) => (
              <div
                key={s.label}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${hoveredIdx === idx ? 'bg-jaman-cream' : ''}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="truncate font-medium text-jaman-navy">{s.label}</span>
                </span>
                <span className="tabular-nums font-bold text-jaman-navy shrink-0">
                  {formatValue(s.value)} <span className="text-slate-500 font-normal">({Math.round((s.value / total) * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

- [ ] **Step 3: Manual smoke check**

This component has no existing test harness to render React components in this app (confirmed: no `*.test.tsx`/`*.spec.tsx` files anywhere in `apps/restaurant-system/pos-admin/src`, and no `@testing-library/react` in its `package.json`). Skip an automated render test for this component — it will be exercised indirectly through Task 8's manual verification pass instead. Do not introduce a new test-rendering dependency for one component; that is out of scope for this plan.

---

### Task 4: `SalesTrendLineChart` — hand-rolled SVG line/area chart

**Files:**
- Create: `apps/restaurant-system/pos-admin/src/components/charts/SalesTrendLineChart.tsx`

**Interfaces:**
- Consumes: `DayRow[]` (the existing type from `reportDataEngine.ts`, produced by `ReportDataEngine.getDayByDayRows`, already fields: `dateKey, displayDate, ordersCount, grossSales, discount, tax, netSales, cash, upi, card, avgOrderValue`).
- Produces: `SalesTrendLineChart` component — consumed by Task 8.

- [ ] **Step 1: Write the component**

```tsx
import React, { useState } from 'react';
import { TrendingUp, Clock } from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';
import type { DayRow } from '../reports/reportDataEngine';

interface SalesTrendLineChartProps {
  days: DayRow[];
}

const WIDTH = 640;
const HEIGHT = 180;
const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;

export const SalesTrendLineChart: React.FC<SalesTrendLineChartProps> = ({ days }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalSales = days.reduce((sum, d) => sum + d.netSales, 0);
  const hasActivity = days.some((d) => d.ordersCount > 0);

  const maxSale = Math.max(...days.map((d) => d.netSales), 100);
  const plotWidth = WIDTH - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const stepX = days.length > 1 ? plotWidth / (days.length - 1) : 0;

  const points = days.map((d, i) => ({
    x: PADDING_X + i * stepX,
    y: PADDING_TOP + plotHeight - (d.netSales / maxSale) * plotHeight,
    day: d
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${PADDING_TOP + plotHeight} L ${points[0].x} ${PADDING_TOP + plotHeight} Z`
    : '';

  return (
    <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-base text-jaman-navy tracking-tight">Sales Trend</h3>
          </div>
          <p className="text-xs text-[#5A6878] mt-0.5 font-medium">Net sales by day for the selected period</p>
        </div>
        {hasActivity && (
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand bg-brand/[0.07] border border-brand/30 px-3 py-1 rounded-xl self-start sm:self-auto">
            <span>Total: {formatINR(totalSales)}</span>
          </div>
        )}
      </div>

      {!hasActivity ? (
        <div className="h-48 sm:h-52 flex flex-col items-center justify-center text-center p-6 bg-jaman-cream/50 rounded-xl border border-dashed border-jaman-border my-3">
          <div className="w-10 h-10 rounded-full bg-brand/[0.07] text-brand flex items-center justify-center mb-2 shadow-xs">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-jaman-navy">No sales recorded in this period</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">The trend line appears once orders exist for at least one day in range.</p>
        </div>
      ) : (
        <div className="pt-6 pb-2">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-44 sm:h-48" preserveAspectRatio="none">
            <line x1={PADDING_X} y1={PADDING_TOP} x2={WIDTH - PADDING_X} y2={PADDING_TOP} stroke="#F1F5F9" strokeWidth={1} />
            <line x1={PADDING_X} y1={PADDING_TOP + plotHeight / 2} x2={WIDTH - PADDING_X} y2={PADDING_TOP + plotHeight / 2} stroke="#F1F5F9" strokeWidth={1} />
            {areaPath && <path d={areaPath} fill="var(--brand, #EF6A0B)" opacity={0.08} />}
            {linePath && <path d={linePath} fill="none" stroke="var(--brand, #EF6A0B)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, idx) => (
              <circle
                key={p.day.dateKey}
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === idx ? 5 : 3}
                fill={hoveredIdx === idx ? 'var(--brand, #EF6A0B)' : '#ffffff'}
                stroke="var(--brand, #EF6A0B)"
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </svg>

          {hoveredIdx !== null && (
            <div className="bg-jaman-navy text-white text-[11px] py-1.5 px-2.5 rounded-lg shadow-xl inline-flex flex-col items-start -mt-2">
              <span className="font-bold">{points[hoveredIdx].day.displayDate}</span>
              <span className="tabular-nums">{formatINR(points[hoveredIdx].day.netSales)} · {points[hoveredIdx].day.ordersCount} order{points[hoveredIdx].day.ordersCount === 1 ? '' : 's'}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 px-1 mt-3 border-t border-slate-100 pt-2">
            {days.map((d) => (
              <div key={d.dateKey} className="flex-1 text-center">
                <span className="text-[11px] font-bold text-slate-500 block truncate">{d.displayDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

- [ ] **Step 3: Manual smoke check**

Same reasoning as Task 3 Step 3 — no component-render test harness exists in this app; exercised manually in Task 8's verification pass.

---

### Task 5: `ReportKpiRow` — KPI cards with real previous-period comparison

**Files:**
- Create: `apps/restaurant-system/pos-admin/src/components/reports/ReportKpiRow.tsx`

**Interfaces:**
- Consumes: `ReportSummaryMetrics` (the existing type from `reportDataEngine.ts`, with its `MetricWithVariance` fields).
- Produces: `ReportKpiRow` component — consumed by Task 8. Not `PrimaryMetricsGrid`: that component's prop shape (`summary: {netSales: number, ...}`) is a flat, already-extracted shape built by `App.tsx` for the Dashboard page and carries no `MetricWithVariance`/comparison data at all — reusing it here would mean either losing the period-over-period comparison the spec requires, or writing a lossy adapter. `ReportKpiRow` reads `ReportSummaryMetrics` directly instead.

- [ ] **Step 1: Write the component**

```tsx
import React from 'react';
import { ArrowUpRight, ArrowDownRight, IndianRupee, ShoppingBag, TrendingUp, Percent } from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';
import type { MetricWithVariance, ReportSummaryMetrics } from './reportDataEngine';

interface ReportKpiRowProps {
  summary: ReportSummaryMetrics;
  periodLabel: string;
  hasCompare: boolean;
}

/** Renders a metric's % change only when there's a real previous value to compare against —
 * MetricWithVariance.diffPercent is already null/undefined-guarded upstream in ReportDataEngine
 * (a zero or missing previous value never produces Infinity/NaN); this trusts that field as-is
 * and never recomputes its own percentage from current/previous. */
function Change({ metric, isPositiveGood = true }: { metric: MetricWithVariance; isPositiveGood?: boolean }) {
  if (metric.diffPercent === undefined || metric.previous === undefined) return null;
  const good = isPositiveGood ? metric.diffPercent >= 0 : metric.diffPercent <= 0;
  const Icon = metric.diffPercent >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(metric.diffPercent)}%
    </span>
  );
}

function Card({ icon: Icon, label, value, metric, isPositiveGood, hasCompare }: {
  icon: React.ElementType; label: string; value: string; metric: MetricWithVariance; isPositiveGood?: boolean; hasCompare: boolean;
}) {
  return (
    <div className="rounded-2xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="mt-2 text-2xl font-bold text-jaman-navy tabular-nums tracking-tight leading-none">{value}</div>
      {hasCompare && (
        <div className="mt-2">
          <Change metric={metric} isPositiveGood={isPositiveGood} />
          {metric.diffPercent === undefined && <span className="text-[11px] text-slate-400">No prior period to compare</span>}
        </div>
      )}
    </div>
  );
}

export const ReportKpiRow: React.FC<ReportKpiRowProps> = ({ summary, periodLabel, hasCompare }) => {
  return (
    <section aria-label="Reports overview KPIs" className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{periodLabel}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={IndianRupee} label="Gross Sales" value={formatINR(summary.grossSales.current)} metric={summary.grossSales} hasCompare={hasCompare} />
        <Card icon={IndianRupee} label="Net Sales" value={formatINR(summary.netSales.current)} metric={summary.netSales} hasCompare={hasCompare} />
        <Card icon={ShoppingBag} label="Orders" value={String(summary.ordersCount.current)} metric={summary.ordersCount} hasCompare={hasCompare} />
        <Card icon={TrendingUp} label="Average Order Value" value={formatINR(summary.avgOrderValue.current)} metric={summary.avgOrderValue} hasCompare={hasCompare} />
        <Card icon={Percent} label="Discounts" value={formatINR(summary.discountAmount.current)} metric={summary.discountAmount} isPositiveGood={false} hasCompare={hasCompare} />
        <Card icon={IndianRupee} label="Tax Collected" value={formatINR(summary.totalTax.current)} metric={summary.totalTax} hasCompare={hasCompare} />
        <Card icon={IndianRupee} label="Refunds" value={formatINR(summary.refundsAmount.current)} metric={summary.refundsAmount} isPositiveGood={false} hasCompare={hasCompare} />
        <Card icon={ShoppingBag} label="Cancelled" value={String(summary.cancelledCount.current)} metric={summary.cancelledCount} isPositiveGood={false} hasCompare={hasCompare} />
      </div>
    </section>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

---

### Task 6: `CustomerReportPanel`

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/reports/OwnerInsightPanels.tsx` (add alongside `LossReportPanel`/`PrepTimePanel`/`LabourPanel`, same file — these panels are already grouped together there)

**Interfaces:**
- Consumes: `CustomerReportResult` (Task 1's type, imported from `./reportDataEngine`).
- Produces: `CustomerReportPanel` component — consumed by Task 9.

- [ ] **Step 1: Write the component**

Add to `OwnerInsightPanels.tsx` (add `CustomerReportResult` to the existing `import type { ReportDateRange, ReportSummaryMetrics, DishPerformanceRow } from './reportDataEngine';` line at the top):

```tsx
export const CustomerReportPanel: React.FC<{ report: CustomerReportResult }> = ({ report }) => {
  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-bold text-sm text-jaman-navy">Who's buying, and how much they spend</h3>
        <span className="text-xs text-slate-500 font-mono">{report.matchedOrders} matched · {report.unmatchedOrders} without a linked customer</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="New customers" value={String(report.newCustomers)} />
        <Tile label="Repeat customers" value={String(report.repeatCustomers)} />
        <Tile label="Avg spend / visit" value={formatINR(report.avgSpendPerVisit.current)} />
        <Tile label="Top spenders tracked" value={String(report.topSpenders.length)} />
      </div>

      {report.topSpenders.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No orders linked to a customer account in this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-jaman-border">
          <table className="w-full text-left text-xs">
            <thead className={headRow}><tr><th className={cell}>Customer</th><th className={cell}>Orders</th><th className={cell}>Spend</th><th className={cell}>Last visit</th><th className={cell}>Tags</th></tr></thead>
            <tbody>
              {report.topSpenders.map((r) => (
                <tr key={r.phone} className="border-b border-slate-100 last:border-0">
                  <td className={`${cell} font-bold text-jaman-navy`}>{r.name || r.phone}<span className="block text-[11px] text-slate-500 font-mono">{r.phone}</span></td>
                  <td className={`${cell} font-mono`}>{r.ordersInRange}</td>
                  <td className={`${cell} tabular-nums font-bold`}>{formatINR(r.spendInRange)}</td>
                  <td className={cell}>{r.lastVisitAt ? new Date(r.lastVisitAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}</td>
                  <td className={cell}>{r.tags?.join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

---

### Task 7: `InventoryReportPanel`

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/reports/OwnerInsightPanels.tsx` (same file as Task 6, add alongside `CustomerReportPanel`)

**Interfaces:**
- Consumes: `InventoryReportResult` (Task 2's type, imported from `./reportDataEngine`).
- Produces: `InventoryReportPanel` component — consumed by Task 9.

- [ ] **Step 1: Write the component**

Add `InventoryReportResult` to the same `import type {...} from './reportDataEngine'` line Task 6 extended, then add:

```tsx
export const InventoryReportPanel: React.FC<{ report: InventoryReportResult }> = ({ report }) => {
  const totalWastageCost = report.topWastageByCost.reduce((sum, r) => sum + (r.costImpactInRange ?? 0), 0);
  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-bold text-sm text-jaman-navy">Stock levels, movement, and wastage</h3>
        {totalWastageCost > 0 && <span className="text-xs tabular-nums font-bold text-rose-700">{formatINR(totalWastageCost)} wasted</span>}
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase text-slate-500 mb-2">Low stock right now</h4>
        {report.lowStock.length === 0 ? (
          <p className="text-sm text-slate-500 py-3 text-center">Nothing is below its reorder level right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-jaman-border">
            <table className="w-full text-left text-xs">
              <thead className={headRow}><tr><th className={cell}>Item</th><th className={cell}>Stock</th><th className={cell}>Status</th></tr></thead>
              <tbody>
                {report.lowStock.map((r) => (
                  <tr key={r.itemId} className="border-b border-slate-100 last:border-0">
                    <td className={`${cell} font-bold text-jaman-navy`}>{r.name}<span className="block text-[11px] text-slate-500 font-mono">{r.sku}</span></td>
                    <td className={`${cell} font-mono`}>{r.currentStock} {r.unit}</td>
                    <td className={cell}><span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${r.status === 'OUT_OF_STOCK' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{r.status.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase text-slate-500 mb-2">Stock movement this period</h4>
        {report.movementsInRange.length === 0 ? (
          <p className="text-sm text-slate-500 py-3 text-center">No stock movements recorded in this period.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {report.movementsInRange.map((m) => (
              <Tile key={m.type} label={m.type.replace('_', ' ')} value={`${m.count} · ${m.quantityTotal > 0 ? '+' : ''}${m.quantityTotal}`} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase text-slate-500 mb-2">Top wastage by cost</h4>
        {report.topWastageByCost.length === 0 ? (
          <p className="text-sm text-slate-500 py-3 text-center">No wastage recorded in this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-jaman-border">
            <table className="w-full text-left text-xs">
              <thead className={headRow}><tr><th className={cell}>Item</th><th className={cell}>Cost impact</th></tr></thead>
              <tbody>
                {report.topWastageByCost.map((r) => (
                  <tr key={r.itemId} className="border-b border-slate-100 last:border-0">
                    <td className={`${cell} font-bold text-jaman-navy`}>{r.name}</td>
                    <td className={`${cell} tabular-nums font-bold text-rose-700`}>{formatINR(r.costImpactInRange ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

---

### Task 8: Wire the "Overview" tab into `ReportsDashboard.tsx`

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/reports/ReportsDashboard.tsx`

**Interfaces:**
- Consumes: `DonutChart` (Task 3), `SalesTrendLineChart` (Task 4), `ReportKpiRow` (Task 5), plus the already-existing `summary`/`dayByDay`/`currentOrders` local variables (lines 249-259 of this file).
- Produces: a new `'OVERVIEW'` option on `selectedCategory`, made the default landing view.

- [ ] **Step 1: Add the imports and widen `selectedCategory`'s type**

At the top of the file, add:

```ts
import { DonutChart } from '../charts/DonutChart';
import { SalesTrendLineChart } from '../charts/SalesTrendLineChart';
import { ReportKpiRow } from './ReportKpiRow';
```

Find `const [selectedCategory, setSelectedCategory] = useState<ReportCategoryKey>('SALES');` (line 153) and change it to:

```ts
const [selectedCategory, setSelectedCategory] = useState<ReportCategoryKey | 'OVERVIEW'>('OVERVIEW');
```

- [ ] **Step 2: Compute the Order Channel Split aggregation**

Right after the existing `const eod = useMemo(...)` block (ends around line 287), add:

```ts
const channelSplit = useMemo(() => {
  const byChannel = new Map<string, number>();
  for (const o of currentOrders) {
    const key = o.source_type || o.orderType || 'OTHER';
    byChannel.set(key, (byChannel.get(key) ?? 0) + o.totalAmount);
  }
  const palette = ['#EF6A0B', '#0B253A', '#16A34A', '#D97706', '#7C3AED', '#0891B2'];
  return [...byChannel.entries()].map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
}, [currentOrders]);

const paymentSplit = useMemo(() => [
  { label: 'Cash', value: summary.cashCollected.current, color: '#16A34A' },
  { label: 'UPI', value: summary.upiCollected.current, color: '#0B253A' },
  { label: 'Card', value: summary.cardCollected.current, color: '#EF6A0B' },
  { label: 'Split / Other', value: summary.splitCollected.current + summary.otherCollected.current, color: '#7C3AED' }
], [summary]);
```

- [ ] **Step 3: Make the category-tab click handler safe for 'OVERVIEW'**

Find the category tab list (around line 616-647). The tab array only has the 6 `ReportCategoryKey` entries; add an Overview tab as the first entry:

```tsx
<div className="grid grid-cols-4 gap-1.5 text-xs">
  {[
    { id: 'OVERVIEW', label: 'Overview', icon: TrendingUp },
    { id: 'SALES', label: 'Sales', icon: DollarSign },
    { id: 'MENU', label: 'Menu', icon: Utensils },
    { id: 'FINANCIAL', label: 'Financial', icon: BarChart3 },
    { id: 'OPERATIONS', label: 'Operations', icon: Clock },
    { id: 'CUSTOMERS', label: 'Customers', icon: Users },
    { id: 'INVENTORY', label: 'Inventory', icon: Package }
  ].filter(c => !kioskMode || !['CUSTOMERS', 'INVENTORY'].includes(c.id)).map((c) => {
    const Icon = c.icon;
    const isCatActive = selectedCategory === c.id && !searchQuery.trim();
    return (
      <button
        key={c.id}
        onClick={() => {
          setSelectedCategory(c.id as ReportCategoryKey | 'OVERVIEW');
          setSearchQuery('');
          if (c.id === 'OVERVIEW') return;
          const firstInCat = reports.find((r) => r.category === c.id);
          if (firstInCat) handleSelectReport(firstInCat.id);
        }}
        className={`py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
          isCatActive
            ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
            : 'bg-jaman-cream text-slate-600 hover:bg-[#F2EFE9]'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{c.label}</span>
      </button>
    );
  })}
</div>
```

(Changed `grid-cols-3` to `grid-cols-4` so 7 tabs lay out as a clean 4+3 instead of a 3+3+1 orphan row.)

- [ ] **Step 4: Render the Overview content instead of the category/report-list workspace when selected**

Find the `{/* 4. MAIN REPORT WORKSPACE... */}` block (line 607). Wrap its existing content (the whole two-column grid) in a condition, and add the new Overview branch above it:

```tsx
{selectedCategory === 'OVERVIEW' ? (
  <div className="space-y-5">
    <ReportKpiRow summary={summary} periodLabel={dateRange.label} hasCompare={isCompareEnabled && !!compareDateRange} />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
      <div className="lg:col-span-2">
        <SalesTrendLineChart days={dayByDay} />
      </div>
      <div className="lg:col-span-1 space-y-5">
        <DonutChart title="Payment Method Split" segments={paymentSplit} />
      </div>
    </div>
    <DonutChart title="Order Channel Split" segments={channelSplit} />
  </div>
) : (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    {/* ... existing two-column content, unchanged ... */}
  </div>
)}
```

The existing two-column grid content (everything currently between the `<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">` opening tag at line 608 and its matching closing `</div>` right before the `{/* MODALS */}` comment at line 999) moves inside the `) : (` branch unchanged — this is a wrap, not a rewrite; every line of existing JSX in that block stays exactly as it is.

- [ ] **Step 5: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

- [ ] **Step 6: Manual verification**

Run the app locally (`npm run dev` from `apps/restaurant-system/pos-admin`, or however this session's established local dev flow works for this app), sign in, open Reports & Analytics, and confirm:
1. It now lands on "Overview" by default, showing KPI cards, a sales trend line, and two donut charts — not the bare document catalog.
2. With zero orders for the selected period, every new chart shows its worded empty state (not a blank or broken-looking chart).
3. Switching the period filter (e.g. Today → Last 7 days) updates the Overview KPIs and charts.
4. Clicking Sales/Menu/Financial/Operations/Customers/Inventory still shows the pre-existing document-catalog workspace exactly as it did before this task (no regression).

---

### Task 9: Wire `CustomerReportPanel`/`InventoryReportPanel` into the existing catalog routing

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/reports/ReportsDashboard.tsx`

**Interfaces:**
- Consumes: `CustomerReportPanel` (Task 6), `InventoryReportPanel` (Task 7), `ReportDataEngine.getCustomerReport`/`getInventoryReport` (Tasks 1/2).
- Produces: all 14 CUSTOMERS/INVENTORY catalog entries render real content.

- [ ] **Step 1: Add the two imports**

Extend the existing `import { LabourPanel, LossReportPanel, OwnerSummaryPanel, PrepTimePanel } from './OwnerInsightPanels';` line to:

```ts
import { CustomerReportPanel, InventoryReportPanel, LabourPanel, LossReportPanel, OwnerSummaryPanel, PrepTimePanel } from './OwnerInsightPanels';
```

- [ ] **Step 2: Compute the two new reports**

Right after the `channelSplit`/`paymentSplit` block from Task 8 Step 2, add:

```ts
const customerReport = useMemo(() => ReportDataEngine.getCustomerReport(currentOrders, dateRange), [currentOrders, dateRange]);
const inventoryReport = useMemo(() => ReportDataEngine.getInventoryReport(dateRange), [dateRange]);
```

- [ ] **Step 3: Add the two rendering branches**

In the "REPORT SPECIFIC CONTENT ROUTING" section (inside the `) : (` non-Overview branch from Task 8 Step 4), add after the existing `{activeReportId === 'KITCHEN_PREP_TIME' && <PrepTimePanel range={dateRange} />}` line (around line 972):

```tsx
{['CUSTOMER_SALES', 'NEW_CUSTOMERS', 'RETURNING_CUSTOMERS', 'REPEAT_VISIT_RATE', 'CUSTOMER_LIFETIME_VALUE', 'AVG_CUSTOMER_SPEND', 'LOYALTY_POINTS'].includes(activeReportId) && (
  <CustomerReportPanel report={customerReport} />
)}
{['STOCK_MOVEMENT', 'LOW_STOCK', 'INGREDIENT_USAGE', 'WASTE_REPORT', 'PURCHASE_VS_CONSUMPTION', 'MENU_FOOD_COST', 'ESTIMATED_GROSS_MARGIN'].includes(activeReportId) && (
  <InventoryReportPanel report={inventoryReport} />
)}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

- [ ] **Step 5: Manual verification**

In the running app, click Reports & Analytics → Customers category, then click through all 7 listed reports (Customer Sales, New Customers, Returning Customers, Repeat Visit Rate, Customer Lifetime Value, Average Customer Spend, Loyalty Points) — confirm every one now shows the `CustomerReportPanel` content instead of a blank area. Repeat for all 7 Inventory category reports, confirming `InventoryReportPanel` shows.

---

### Task 10: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole root test suite**

Run: `npm test` (from the repo root)
Expected: all tests pass, including the two new files from Tasks 1 and 2 — no regressions in any of the other `tests/*.test.ts` files (particularly `tests/pos_admin_report_data_engine.test.ts`, `tests/central_reporting_consistency.test.ts`, `tests/reports.test.ts`, which exercise the same `reportDataEngine.ts` file this plan modifies).

- [ ] **Step 2: Type-check the whole pos-admin app one more time**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean)

- [ ] **Step 3: Confirm nothing was committed or pushed**

Run: `git status --short` (from the repo root)
Expected: every file this plan touched shows as modified/untracked, nothing staged or committed — matches the standing instruction for this session not to commit or push.

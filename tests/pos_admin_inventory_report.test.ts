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
      { id: 'mv-1', itemId: 'inv-1', itemName: 'Paneer', type: 'SALE', quantityDelta: -2, unit: 'kg', orderId: 'ord-1', reason: 'Order consumption', performedBy: 'system', timestamp: now } as any,
      { id: 'mv-2', itemId: 'inv-1', itemName: 'Paneer', type: 'SALE', quantityDelta: -1, unit: 'kg', orderId: 'ord-2', reason: 'Order consumption', performedBy: 'system', timestamp: now } as any,
      { id: 'mv-3', itemId: 'inv-1', itemName: 'Paneer', type: 'PURCHASE', quantityDelta: 10, unit: 'kg', costImpact: 3200, reason: 'Restock', performedBy: 'manager', timestamp: now } as any
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
      reason: 'Old sale', performedBy: 'system', timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
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
      { id: 'mv-w1', itemId: 'inv-3', itemName: 'Tomato', type: 'WASTE', quantityDelta: -5, unit: 'kg', costImpact: 200, reason: 'Spoiled', performedBy: 'chef', timestamp: now } as any,
      { id: 'mv-w2', itemId: 'inv-4', itemName: 'Milk', type: 'SPOILAGE', quantityDelta: -10, unit: 'ltr', costImpact: 550, reason: 'Expired', performedBy: 'chef', timestamp: now } as any
    );

    const report = ReportDataEngine.getInventoryReport(rangeCoveringNow());
    expect(report.topWastageByCost[0].itemId).toBe('inv-4');
    expect(report.topWastageByCost[0].costImpactInRange).toBe(550);
    expect(report.topWastageByCost[1].itemId).toBe('inv-3');
  });
});

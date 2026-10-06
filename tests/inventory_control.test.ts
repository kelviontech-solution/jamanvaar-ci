import { describe, it, expect, beforeEach } from 'vitest';
import { db, InventoryRepository, InventoryControl, RecipeRepository } from '@jamanvaar/database';

/**
 * BUG-046: inventory had only items, movements and recipes. A restaurant also needs to know who it buys from and
 * at what price, count its shelves, see what is about to expire, cost its dishes and be told what to reorder.
 * This is the purchasing and control layer on top of the existing stock engine.
 */
const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

describe('Inventory control (BUG-046)', () => {
  let paneer: string;
  let flour: string;
  let butter: string;
  let supplierA: string;
  let supplierB: string;

  beforeEach(() => {
    InventoryRepository.startFresh();
    db.restaurant.stockAdjustmentApprovalLimit = undefined;
    paneer = InventoryRepository.createItem({ name: 'Paneer', sku: 'PAN', category: 'Dairy', unit: 'kg', currentStock: 0, minStockLevel: 2, reorderLevel: 5, costPerUnit: 0 })!.id;
    flour = InventoryRepository.createItem({ name: 'Flour', sku: 'FLR', category: 'Dry', unit: 'kg', currentStock: 20, minStockLevel: 5, reorderLevel: 10, costPerUnit: 40 })!.id;
    butter = InventoryRepository.createItem({ name: 'Butter', sku: 'BUT', category: 'Dairy', unit: 'kg', currentStock: 4, minStockLevel: 1, reorderLevel: 3, costPerUnit: 500 })!.id;
    supplierA = InventoryControl.addSupplier({ name: 'Ahmedabad Dairy', phone: '9876500001' }).id;
    supplierB = InventoryControl.addSupplier({ name: 'Metro Wholesale' }).id;
  });

  describe('suppliers', () => {
    it('are added, listed, edited and deactivated', () => {
      expect(InventoryControl.getSuppliers().map((s) => s.name)).toEqual(expect.arrayContaining(['Ahmedabad Dairy', 'Metro Wholesale']));
      InventoryControl.updateSupplier(supplierA, { contactName: 'Ravi', paymentTerms: '15 days' });
      expect(InventoryControl.getSuppliers().find((s) => s.id === supplierA)).toMatchObject({ contactName: 'Ravi', paymentTerms: '15 days', isActive: true });
      InventoryControl.updateSupplier(supplierB, { isActive: false });
      expect(InventoryControl.getSuppliers().map((s) => s.id)).not.toContain(supplierB);
      expect(InventoryControl.getSuppliers({ includeInactive: true }).map((s) => s.id)).toContain(supplierB);
    });

    it('refuse a blank name and a duplicate name', () => {
      expect(() => InventoryControl.addSupplier({ name: '  ' })).toThrow(/name/i);
      expect(() => InventoryControl.addSupplier({ name: 'ahmedabad dairy' })).toThrow(/already/i);
    });
  });

  describe('receiving goods', () => {
    it('adds the stock, records the receipt with a running number, and remembers the supplier', () => {
      const grn = InventoryControl.receiveGoods({ supplierId: supplierA, invoiceNumber: 'INV-77', receivedBy: 'Amit', lines: [{ itemId: paneer, quantity: 10, unitCost: 300 }] });
      expect(grn.number).toBe('GRN-000001');
      expect(grn.totalCost).toBe(3000);
      expect(grn.supplierName).toBe('Ahmedabad Dairy');
      expect(InventoryRepository.getItemById(paneer)).toMatchObject({ currentStock: 10, supplierName: 'Ahmedabad Dairy' });
      const move = db.stockMovements.find((m) => m.itemId === paneer && m.type === 'PURCHASE');
      expect(move).toMatchObject({ quantityDelta: 10, costImpact: 3000, performedBy: 'Amit' });
      expect(move?.reason).toContain('GRN-000001');
      expect(InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'Amit', lines: [{ itemId: flour, quantity: 5, unitCost: 42 }] }).number).toBe('GRN-000002');
    });

    it('keeps a weighted-average cost across purchases at different prices', () => {
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'Amit', lines: [{ itemId: paneer, quantity: 10, unitCost: 300 }] });
      expect(InventoryRepository.getItemById(paneer)?.costPerUnit).toBe(300);
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'Amit', lines: [{ itemId: paneer, quantity: 10, unitCost: 340 }] });
      expect(InventoryRepository.getItemById(paneer)?.costPerUnit).toBe(320);
      // 20 kg @ 320, receive 20 more @ 360 -> 340
      InventoryControl.receiveGoods({ supplierId: supplierB, receivedBy: 'Amit', lines: [{ itemId: paneer, quantity: 20, unitCost: 360 }] });
      expect(InventoryRepository.getItemById(paneer)?.costPerUnit).toBe(340);
    });

    it('a purchase into an empty or negative balance takes the new price', () => {
      InventoryRepository.updateItem(flour, { currentStock: -3, costPerUnit: 10 });
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'Amit', lines: [{ itemId: flour, quantity: 10, unitCost: 50 }] });
      expect(InventoryRepository.getItemById(flour)).toMatchObject({ currentStock: 7, costPerUnit: 50 });
    });

    it('rejects what cannot be right: no lines, unknown item, zero or negative quantity or cost, inactive or unknown supplier, already expired stock', () => {
      const base = { supplierId: supplierA, receivedBy: 'Amit' };
      expect(() => InventoryControl.receiveGoods({ ...base, lines: [] })).toThrow(/at least one/i);
      expect(() => InventoryControl.receiveGoods({ ...base, lines: [{ itemId: 'nope', quantity: 1, unitCost: 1 }] })).toThrow(/item/i);
      expect(() => InventoryControl.receiveGoods({ ...base, lines: [{ itemId: paneer, quantity: 0, unitCost: 1 }] })).toThrow(/quantity/i);
      expect(() => InventoryControl.receiveGoods({ ...base, lines: [{ itemId: paneer, quantity: 1, unitCost: -1 }] })).toThrow(/cost|price/i);
      expect(() => InventoryControl.receiveGoods({ supplierId: 'nope', receivedBy: 'A', lines: [{ itemId: paneer, quantity: 1, unitCost: 1 }] })).toThrow(/supplier/i);
      InventoryControl.updateSupplier(supplierB, { isActive: false });
      expect(() => InventoryControl.receiveGoods({ supplierId: supplierB, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 1, unitCost: 1 }] })).toThrow(/inactive|supplier/i);
      expect(() => InventoryControl.receiveGoods({ ...base, lines: [{ itemId: paneer, quantity: 1, unitCost: 1, expiryDate: inDays(-2) }] })).toThrow(/expir/i);
      expect(InventoryRepository.getItemById(paneer)?.currentStock).toBe(0);
    });

    it('a rejected receipt changes nothing, even when only its last line is bad', () => {
      expect(() =>
        InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 5, unitCost: 300 }, { itemId: flour, quantity: -1, unitCost: 40 }] })
      ).toThrow();
      expect(InventoryRepository.getItemById(paneer)?.currentStock).toBe(0);
      expect(InventoryControl.getGoodsReceipts()).toHaveLength(0);
    });

    it('supplier price history shows each purchase and how the price moved', () => {
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 5, unitCost: 300 }] });
      InventoryControl.receiveGoods({ supplierId: supplierB, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 5, unitCost: 330 }] });
      const history = InventoryControl.getSupplierPriceHistory(paneer);
      expect(history.map((h) => [h.supplierName, h.unitCost])).toEqual([['Metro Wholesale', 330], ['Ahmedabad Dairy', 300]]);
      expect(history[0].changePercent).toBe(10);
      expect(history[1].changePercent).toBeNull();
    });
  });

  describe('shelf life', () => {
    it('sells from the batch that expires first, and lists what is about to expire', () => {
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 10, unitCost: 300, expiryDate: inDays(30) }] });
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 10, unitCost: 300, expiryDate: inDays(2) }] });

      InventoryRepository.recordMovement({ itemId: paneer, itemName: 'Paneer', type: 'SALE', quantityDelta: -6, unit: 'kg', reason: 'test sale', performedBy: 'POS' });

      const soon = InventoryControl.getExpiringBatches(3);
      expect(soon).toHaveLength(1);
      expect(soon[0]).toMatchObject({ itemName: 'Paneer', quantityRemaining: 4, expired: false });
      expect(soon[0].daysLeft).toBeLessThanOrEqual(2);
      const all = InventoryControl.getExpiringBatches(60);
      expect(all.map((b) => b.quantityRemaining)).toEqual([4, 10]);
    });

    it('a batch past its date is flagged expired and stays on the list until written off', () => {
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 3, unitCost: 300, expiryDate: inDays(1) }] });
      const later = new Date(Date.now() + 3 * DAY);
      const list = InventoryControl.getExpiringBatches(3, later);
      expect(list[0]).toMatchObject({ expired: true, quantityRemaining: 3 });
    });

    it('a batch that has been used up is not listed', () => {
      InventoryControl.receiveGoods({ supplierId: supplierA, receivedBy: 'A', lines: [{ itemId: paneer, quantity: 4, unitCost: 300, expiryDate: inDays(1) }] });
      InventoryRepository.recordMovement({ itemId: paneer, itemName: 'Paneer', type: 'SALE', quantityDelta: -4, unit: 'kg', reason: 'x', performedBy: 'POS' });
      expect(InventoryControl.getExpiringBatches(30)).toEqual([]);
    });
  });

  describe('stock counts', () => {
    it('sets stock to what was counted, records each difference and its value', () => {
      const count = InventoryControl.recordStockCount({
        countedBy: 'Amit',
        counts: [{ itemId: flour, countedQuantity: 18 }, { itemId: butter, countedQuantity: 4 }]
      });
      expect(count.number).toBe('COUNT-000001');
      expect(InventoryRepository.getItemById(flour)?.currentStock).toBe(18);
      const flourLine = count.lines.find((l) => l.itemId === flour)!;
      expect(flourLine).toMatchObject({ systemQuantity: 20, countedQuantity: 18, variance: -2, varianceValue: -80 });
      expect(count.totalVarianceValue).toBe(-80);
      const moves = db.stockMovements.filter((m) => m.type === 'ADJUSTMENT');
      expect(moves).toHaveLength(1);
      expect(moves[0]).toMatchObject({ itemId: flour, quantityDelta: -2, performedBy: 'Amit' });
    });

    it('a large difference needs a manager to approve it', () => {
      const attempt = () => InventoryControl.recordStockCount({ countedBy: 'Amit', counts: [{ itemId: butter, countedQuantity: 0 }] }); // -4 kg x 500 = 2000
      db.restaurant.stockAdjustmentApprovalLimit = 1000;
      expect(attempt).toThrow(/approv/i);
      expect(InventoryRepository.getItemById(butter)?.currentStock).toBe(4);
      const ok = InventoryControl.recordStockCount({ countedBy: 'Amit', approvedBy: 'Manager Mira', counts: [{ itemId: butter, countedQuantity: 0 }] });
      expect(ok.approvedBy).toBe('Manager Mira');
      expect(InventoryRepository.getItemById(butter)?.currentStock).toBe(0);
    });

    it('rejects a negative count and an unknown item, changing nothing', () => {
      expect(() => InventoryControl.recordStockCount({ countedBy: 'A', counts: [{ itemId: flour, countedQuantity: 15 }, { itemId: flour, countedQuantity: -1 }] })).toThrow(/negative|count/i);
      expect(() => InventoryControl.recordStockCount({ countedBy: 'A', counts: [{ itemId: 'nope', countedQuantity: 1 }] })).toThrow(/item/i);
      expect(InventoryRepository.getItemById(flour)?.currentStock).toBe(20);
    });
  });

  describe('costing', () => {
    it('costs each dish from its recipe (converting units) and shows food-cost percent and margin', () => {
      db.menuItems[0].price = 250;
      const dishId = db.menuItems[0].id;
      RecipeRepository.createRecipe({
        menuItemId: dishId,
        menuItemName: db.menuItems[0].name,
        ingredients: [
          { inventoryItemId: flour, inventoryItemName: 'Flour', quantityPerPortion: 200, unit: 'g' }, // 0.2 kg x 40 = 8
          { inventoryItemId: butter, inventoryItemName: 'Butter', quantityPerPortion: 0.03, unit: 'kg' } // 15
        ]
      });
      const dish = InventoryControl.getDishCosts().find((d) => d.menuItemId === dishId)!;
      expect(dish.cost).toBe(23);
      expect(dish.foodCostPercent).toBe(9.2);
      expect(dish.marginAmount).toBe(227);
      expect(dish.incomplete).toBe(false);
    });

    it('marks a dish incomplete when an ingredient cannot be costed', () => {
      const dishId = db.menuItems[0].id;
      RecipeRepository.createRecipe({
        menuItemId: dishId,
        menuItemName: 'x',
        ingredients: [{ inventoryItemId: flour, inventoryItemName: 'Flour', quantityPerPortion: 2, unit: 'pcs' }]
      });
      expect(InventoryControl.getDishCosts().find((d) => d.menuItemId === dishId)?.incomplete).toBe(true);
    });
  });

  describe('reorder suggestions', () => {
    it('suggests what to buy for items that are low, using what has actually been used', () => {
      // flour: 20 kg, reorder at 10. Use 14 kg over the last week -> low, and running out fast.
      InventoryRepository.recordMovement({ itemId: flour, itemName: 'Flour', type: 'SALE', quantityDelta: -14, unit: 'kg', reason: 'sales', performedBy: 'POS' });
      InventoryControl.receiveGoods({ supplierId: supplierB, receivedBy: 'A', lines: [{ itemId: flour, quantity: 1, unitCost: 45 }] });
      InventoryRepository.updateItem(flour, { currentStock: 7 });
      const s = InventoryControl.getReorderSuggestions({ days: 7 }).find((x) => x.itemId === flour)!;
      expect(s.currentStock).toBe(7);
      expect(s.averageDailyUse).toBe(2);
      expect(s.daysOfStockLeft).toBe(3.5);
      expect(s.suggestedQuantity).toBeGreaterThan(0);
      expect(s.lastSupplierName).toBe('Metro Wholesale');
      expect(s.lastUnitCost).toBe(45);
    });

    it('does not suggest items that are comfortably stocked', () => {
      expect(InventoryControl.getReorderSuggestions().map((s) => s.itemId)).not.toContain(flour);
    });

    it('an item with no reorder level is only suggested when it has run out', () => {
      const salt = InventoryRepository.createItem({ name: 'Salt', sku: 'SLT', category: 'Dry', unit: 'kg', currentStock: 0, minStockLevel: 0, reorderLevel: 0, costPerUnit: 20 })!.id;
      expect(InventoryControl.getReorderSuggestions().map((s) => s.itemId)).toContain(salt);
    });
  });

  describe('reports', () => {
    it('values stock at cost by category, and reports negative balances separately', () => {
      InventoryRepository.updateItem(butter, { currentStock: -1 });
      const v = InventoryControl.getStockValuation();
      // flour 20 x 40 = 800; butter is negative so it is worth 0 here; paneer 0
      expect(v.total).toBe(800);
      expect(v.byCategory.find((c) => c.category === 'Dry')?.value).toBe(800);
      expect(v.negativeItems.map((i) => i.itemName)).toEqual(['Butter']);
    });

    it('wastage by reason, with what it cost', () => {
      InventoryRepository.recordMovement({ itemId: flour, itemName: 'Flour', type: 'WASTE', quantityDelta: -2, unit: 'kg', reason: 'trim', wastageReasonCode: 'KITCHEN_PREP_TRIM', performedBy: 'A', costImpact: -80 });
      InventoryRepository.recordMovement({ itemId: butter, itemName: 'Butter', type: 'SPOILAGE', quantityDelta: -1, unit: 'kg', reason: 'expired', wastageReasonCode: 'EXPIRED_SPOILED', performedBy: 'A', costImpact: -500 });
      const r = InventoryControl.getWastageReport(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
      expect(r.totalCost).toBe(580);
      expect(r.byReason.map((x) => [x.reason, x.cost])).toEqual([['EXPIRED_SPOILED', 500], ['KITCHEN_PREP_TRIM', 80]]);
      const none = InventoryControl.getWastageReport(new Date(Date.now() + 5 * DAY), new Date(Date.now() + 6 * DAY));
      expect(none.totalCost).toBe(0);
    });

    it('consumption in a period: sold, wasted and adjusted quantities per item', () => {
      InventoryRepository.recordMovement({ itemId: flour, itemName: 'Flour', type: 'SALE', quantityDelta: -5, unit: 'kg', reason: 's', performedBy: 'POS' });
      InventoryRepository.recordMovement({ itemId: flour, itemName: 'Flour', type: 'WASTE', quantityDelta: -1, unit: 'kg', reason: 'w', performedBy: 'A' });
      const rows = InventoryControl.getConsumptionReport(new Date(Date.now() - DAY), new Date(Date.now() + DAY));
      expect(rows.find((r) => r.itemId === flour)).toMatchObject({ sold: 5, wasted: 1, valueConsumed: 240 });
    });
  });

  describe('alerts', () => {
    it('tells the manager once when an item drops to low stock, and again when it runs out', () => {
      const before = db.notifications.length;
      InventoryRepository.recordMovement({ itemId: flour, itemName: 'Flour', type: 'SALE', quantityDelta: -16, unit: 'kg', reason: 's', performedBy: 'POS' }); // 4 <= min 5
      expect(db.notifications.length).toBe(before + 1);
      expect(db.notifications[0].title).toMatch(/low stock/i);
      InventoryRepository.recordMovement({ itemId: flour, itemName: 'Flour', type: 'SALE', quantityDelta: -1, unit: 'kg', reason: 's', performedBy: 'POS' }); // still low, no repeat
      expect(db.notifications.length).toBe(before + 1);
      InventoryRepository.recordMovement({ itemId: flour, itemName: 'Flour', type: 'SALE', quantityDelta: -3, unit: 'kg', reason: 's', performedBy: 'POS' }); // 0
      expect(db.notifications.length).toBe(before + 2);
      expect(db.notifications[0].title).toMatch(/out of stock/i);
    });
  });
});

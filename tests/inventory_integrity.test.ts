import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, InventoryRepository, RecipeRepository } from '../packages/database/src';

/**
 * BUG-044 / BUG-045: stock was deducted when the order was created (once per createOrder, so a
 * dish sold across repeated Send-KOT / Pay could deduct several times), items added to a
 * running order later were never deducted, nothing ever put stock back on void/refund/cancel,
 * movement ids collided within the same millisecond, negative stock was silently clamped to 0,
 * recipe units were never converted, and the actor was hardcoded.
 */
describe('Inventory stock integrity (BUG-044/045)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.inventoryItems = [];
    db.recipes = [];
    db.stockMovements = [];
    InventoryRepository.createItem({ id: 'inv-paneer', name: 'Paneer', sku: 'P', category: 'Dairy', unit: 'kg', currentStock: 10, minStockLevel: 2, reorderLevel: 3, costPerUnit: 300 });
    InventoryRepository.createItem({ id: 'inv-butter', name: 'Butter', sku: 'B', category: 'Dairy', unit: 'kg', currentStock: 5, minStockLevel: 1, reorderLevel: 2, costPerUnit: 500 });
    RecipeRepository.createRecipe({
      menuItemId: 'dish-1',
      menuItemName: 'Paneer Dish',
      ingredients: [
        { inventoryItemId: 'inv-paneer', inventoryItemName: 'Paneer', quantityPerPortion: 0.25, unit: 'kg' },
        { inventoryItemId: 'inv-butter', inventoryItemName: 'Butter', quantityPerPortion: 0.05, unit: 'kg' }
      ]
    } as any);
  });

  const stock = (id: string) => db.inventoryItems.find((i) => i.id === id)!.currentStock;

  function makeOrder(qty = 2, extra: object = {}) {
    return OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '1',
      items: [{ id: 'oi-1', orderId: '', menuItemId: 'dish-1', name: 'Paneer Dish', sku: 'D1', quantity: qty, unitPrice: 200, modifiers: [], totalPrice: 200 * qty, kitchenStatus: 'PREPARING' } as any],
      subtotal: 200 * qty, taxAmount: 0, totalAmount: 200 * qty,
      paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING', cashierName: 'Real Cashier', source_type: 'POS',
      ...extra
    } as any);
  }

  it('consumes recipe stock once for a sale, however many times it is reconciled', () => {
    const order = makeOrder(2);
    expect(stock('inv-paneer')).toBeCloseTo(9.5);
    InventoryRepository.reconcileOrder(order);
    InventoryRepository.reconcileOrder(order);
    expect(stock('inv-paneer')).toBeCloseTo(9.5);
    expect(stock('inv-butter')).toBeCloseTo(4.9);
  });

  it('an add-on round (new line, or more of an existing line) deducts only the difference', () => {
    const order = makeOrder(2);
    order.items.push({ id: 'oi-2', orderId: order.id, menuItemId: 'dish-1', name: 'Paneer Dish', sku: 'D1', quantity: 1, unitPrice: 200, modifiers: [], totalPrice: 200, kitchenStatus: 'PREPARING' } as any);
    InventoryRepository.reconcileOrder(order);
    expect(stock('inv-paneer')).toBeCloseTo(9.25);
    order.items[0].quantity = 3;
    InventoryRepository.reconcileOrder(order);
    expect(stock('inv-paneer')).toBeCloseTo(9.0);
  });

  it('a void puts the stock back, exactly once', () => {
    const order = makeOrder(2);
    OrderRepository.voidOrder(order.id, 'customer left', 'Manager');
    expect(stock('inv-paneer')).toBeCloseTo(10);
    expect(stock('inv-butter')).toBeCloseTo(5);
    InventoryRepository.restoreForOrder(order, 'again');
    expect(stock('inv-paneer')).toBeCloseTo(10);
  });

  it('a full refund puts the stock back; a partial refund does not guess', () => {
    const paid = makeOrder(2, { paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', totalAmount: 400 });
    OrderRepository.refundOrder(paid.id, 100, 'partial', 'Manager');
    expect(stock('inv-paneer')).toBeCloseTo(9.5);

    const paid2 = makeOrder(2, { paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', totalAmount: 400 });
    expect(stock('inv-paneer')).toBeCloseTo(9.0);
    OrderRepository.refundOrder(paid2.id, 400, 'full', 'Manager');
    expect(stock('inv-paneer')).toBeCloseTo(9.5);
  });

  it('cancelling an order through a status change puts the stock back', () => {
    const order = makeOrder(2);
    OrderRepository.updateOrderStatus(order.id, 'CANCELLED', 'Manager');
    expect(stock('inv-paneer')).toBeCloseTo(10);
  });

  it('every stock movement gets its own id, even within the same millisecond', () => {
    for (let i = 0; i < 5; i++) makeOrder(1);
    const ids = db.stockMovements.map((m) => m.id);
    expect(ids.length).toBe(10);
    expect(new Set(ids).size).toBe(10);
  });

  it('selling more than is in stock shows a NEGATIVE balance instead of silently clamping to 0', () => {
    makeOrder(60); // needs 15 kg of paneer, 10 on hand
    expect(stock('inv-paneer')).toBeCloseTo(-5);
    expect(db.inventoryItems.find((i) => i.id === 'inv-paneer')!.status).toBe('OUT_OF_STOCK');
  });

  it('converts recipe units to the stock unit (250 g of a kg-stocked item is 0.25 kg)', () => {
    db.recipes = [];
    RecipeRepository.createRecipe({
      menuItemId: 'dish-2', menuItemName: 'Grams Dish',
      ingredients: [{ inventoryItemId: 'inv-paneer', inventoryItemName: 'Paneer', quantityPerPortion: 250, unit: 'g' }]
    } as any);
    OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [{ id: 'oi-g', orderId: '', menuItemId: 'dish-2', name: 'Grams Dish', sku: 'G', quantity: 2, unitPrice: 100, modifiers: [], totalPrice: 200, kitchenStatus: 'PREPARING' } as any],
      subtotal: 200, taxAmount: 0, totalAmount: 200, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING', source_type: 'POS'
    } as any);
    expect(stock('inv-paneer')).toBeCloseTo(9.5);
  });

  it('an incompatible unit (pieces vs kg) is NOT subtracted blindly; it is flagged', () => {
    db.recipes = [];
    RecipeRepository.createRecipe({
      menuItemId: 'dish-3', menuItemName: 'Odd Dish',
      ingredients: [{ inventoryItemId: 'inv-paneer', inventoryItemName: 'Paneer', quantityPerPortion: 3, unit: 'pcs' }]
    } as any);
    OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [{ id: 'oi-o', orderId: '', menuItemId: 'dish-3', name: 'Odd Dish', sku: 'O', quantity: 1, unitPrice: 100, modifiers: [], totalPrice: 100, kitchenStatus: 'PREPARING' } as any],
      subtotal: 100, taxAmount: 0, totalAmount: 100, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING', source_type: 'POS'
    } as any);
    expect(stock('inv-paneer')).toBeCloseTo(10);
    expect(db.auditLogs.some((l) => l.action === 'STOCK_UNIT_MISMATCH')).toBe(true);
  });

  it('records the real cashier as the actor, not a hardcoded terminal name', () => {
    makeOrder(1);
    expect(db.stockMovements.every((m) => m.performedBy === 'Real Cashier')).toBe(true);
  });

  it('warns which ingredients are short for what is about to be sold', () => {
    const shortages = InventoryRepository.getShortages([{ menuItemId: 'dish-1', quantity: 60 }]);
    expect(shortages).toHaveLength(1);
    expect(shortages[0].itemName).toBe('Paneer');
    expect(shortages[0].needed).toBeCloseTo(15);
    expect(shortages[0].available).toBeCloseTo(10);
    expect(InventoryRepository.getShortages([{ menuItemId: 'dish-1', quantity: 2 }])).toHaveLength(0);
  });

  describe('B2-044: Add/Edit Stock Item validation', () => {
    it('refuses to create an item with negative stock, negative cost, or an unrealistically large quantity', () => {
      expect(InventoryRepository.createItem({ name: 'Bad Stock', sku: 'BAD-1', category: 'Dairy', unit: 'kg', currentStock: -5, minStockLevel: 1, reorderLevel: 2, costPerUnit: 10 })).toBeNull();
      expect(InventoryRepository.createItem({ name: 'Bad Cost', sku: 'BAD-2', category: 'Dairy', unit: 'kg', currentStock: 5, minStockLevel: 1, reorderLevel: 2, costPerUnit: -50 })).toBeNull();
      expect(InventoryRepository.createItem({ name: 'Bad Qty', sku: 'BAD-3', category: 'Dairy', unit: 'kg', currentStock: 1_000_000_000_000, minStockLevel: 1, reorderLevel: 2, costPerUnit: 10 })).toBeNull();
      expect(db.inventoryItems.some((i) => i.sku.startsWith('BAD-'))).toBe(false);
    });

    it('refuses a duplicate SKU on create, but allows editing an item without tripping on its own SKU', () => {
      const item = InventoryRepository.createItem({ name: 'Unique Item', sku: 'UNIQ-1', category: 'Dairy', unit: 'kg', currentStock: 5, minStockLevel: 1, reorderLevel: 2, costPerUnit: 10 })!;
      expect(item).not.toBeNull();
      expect(InventoryRepository.createItem({ name: 'Different Item', sku: 'UNIQ-1', category: 'Dairy', unit: 'kg', currentStock: 5, minStockLevel: 1, reorderLevel: 2, costPerUnit: 10 })).toBeNull();
      // Re-saving the SAME item with its own existing SKU is not a collision with itself.
      expect(InventoryRepository.updateItem(item.id, { name: 'Unique Item Renamed', sku: 'UNIQ-1' })).not.toBeNull();
    });

    it("B2-044 canary: updateItem still allows an EXISTING item's stock to go negative (an oversold item is a real, reportable state, not an error) — only creating a brand-new item negative is refused", () => {
      const item = InventoryRepository.createItem({ name: 'Canary Item', sku: 'CANARY-1', category: 'Dairy', unit: 'kg', currentStock: 5, minStockLevel: 1, reorderLevel: 2, costPerUnit: 10 })!;
      const updated = InventoryRepository.updateItem(item.id, { currentStock: -2 });
      expect(updated).not.toBeNull();
      expect(updated?.currentStock).toBe(-2);
      expect(updated?.status).toBe('OUT_OF_STOCK');
    });
  });

  it('a real restaurant starts with no seeded ingredients, recipes or stock history', () => {
    db.resetToDefaultSeed();
    expect(db.inventoryItems.length).toBeGreaterThan(0); // demo seed, as before
    InventoryRepository.startFresh();
    expect(db.inventoryItems).toHaveLength(0);
    expect(db.recipes).toHaveLength(0);
    expect(db.stockMovements).toHaveLength(0);
  });

  describe('BUG-043: dish availability follows real stock', () => {
    function addDish(extra: object = {}) {
      db.menuItems.push({
        id: 'dish-1', categoryId: 'c', sku: 'D1', name: 'Paneer Dish', description: '', price: 200,
        dietaryType: 'VEG', spiceLevel: 'MILD', isPopular: false, isNew: false, isFeatured: false,
        isAvailable: true, prepTimeMinutes: 10, allergens: [], modifierGroupIds: [], sortOrder: 0, ...extra
      } as any);
    }
    const dish = () => db.menuItems.find((m) => m.id === 'dish-1')!;

    it('a dish becomes unavailable when a required ingredient runs out, and returns when restocked', () => {
      addDish();
      makeOrder(40); // 10 kg of paneer -> exactly 0 left
      expect(dish().isAvailable).toBe(false);
      expect(dish().soldOutReason).toMatch(/paneer/i);

      InventoryRepository.recordMovement({ itemId: 'inv-paneer', itemName: 'Paneer', type: 'RESTOCK', quantityDelta: 5, unit: 'kg', reason: 'delivery', performedBy: 'Manager' });
      expect(dish().isAvailable).toBe(true);
      expect(dish().soldOutReason).toBeUndefined();
    });

    it('does not re-enable a dish the owner switched off by hand', () => {
      addDish({ isAvailable: false, soldOutReason: 'Chef unavailable' });
      InventoryRepository.recordMovement({ itemId: 'inv-paneer', itemName: 'Paneer', type: 'RESTOCK', quantityDelta: 5, unit: 'kg', reason: 'delivery', performedBy: 'Manager' });
      expect(dish().isAvailable).toBe(false);
    });

    it("a dish's own stockQuantity goes down when sold and back up on void", () => {
      addDish({ stockQuantity: 10 });
      const order = makeOrder(3);
      expect(dish().stockQuantity).toBe(7);
      OrderRepository.voidOrder(order.id, 'oops', 'Manager');
      expect(dish().stockQuantity).toBe(10);
    });

    it('a dish with a counted stock is switched off at zero', () => {
      addDish({ stockQuantity: 2 });
      makeOrder(2);
      expect(dish().stockQuantity).toBe(0);
      expect(dish().isAvailable).toBe(false);
    });
  });
});

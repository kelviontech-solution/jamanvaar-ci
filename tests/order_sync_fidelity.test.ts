import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { SyncOutboxEngine, OrderSyncPushEvent, CloudSyncedOrder } from '@jamanvaar/sync';

/**
 * BUG-022 / BUG-023 / BUG-034: what POS pushes must arrive on another device
 * (KDS, Captain, Restaurant Admin) as the SAME order and the SAME kitchen
 * ticket: real order/token numbers, modifiers, special instructions, kitchen
 * station and payment details. Items added later (an add-on round) must also
 * reach the other device and produce their own ticket.
 *
 * A tiny in-memory "cloud" stands in for cloud/api; "device B" is simulated by
 * resetting the local database between the push and the pull.
 */
describe('order sync round trip keeps the real ticket (BUG-022/023/034)', () => {
  let cloud: Map<string, CloudSyncedOrder>;

  function fakeCloudTransport() {
    return {
      push: async (events: OrderSyncPushEvent[]) => {
        const now = new Date().toISOString();
        events.forEach((e) => {
          cloud.set(e.externalOrderId, {
            externalOrderId: e.externalOrderId,
            orderType: e.orderType,
            status: e.status,
            tableId: e.tableId ?? null,
            tableLabel: e.tableLabel ?? null,
            items: e.items,
            subtotal: e.subtotal,
            taxAmount: e.taxAmount,
            discountAmount: e.discountAmount,
            totalAmount: e.totalAmount,
            notes: e.notes ?? null,
            paymentStatus: e.paymentStatus ?? null,
            paymentMethod: e.paymentMethod ?? null,
            meta: e.meta ?? null,
            updatedAt: now
          } as CloudSyncedOrder);
        });
        return {
          results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const, syncVersion: 1 })),
          serverTime: now
        };
      },
      pull: async () => ({ orders: Array.from(cloud.values()), serverTime: new Date().toISOString() })
    };
  }

  beforeEach(() => {
    cloud = new Map();
    db.resetToDefaultSeed();
    SyncOutboxEngine.configureTransport(null);
  });

  function tandooriItem() {
    const menuItem = db.menuItems.find((m) => (m.kitchenStation || '').toLowerCase().includes('tandoor')) || db.menuItems[0];
    return {
      menuItem,
      line: {
        id: 'oi-rt-1',
        orderId: '',
        menuItemId: menuItem.id,
        name: menuItem.name,
        sku: menuItem.sku || 'SKU',
        quantity: 2,
        unitPrice: menuItem.price + 20,
        modifiers: [{ groupId: 'g1', optionId: 'o1', optionName: 'Extra Cheese', priceDelta: 20 }],
        specialInstructions: 'no onion please',
        totalPrice: (menuItem.price + 20) * 2,
        kitchenStatus: 'PREPARING' as const
      }
    };
  }

  it('rebuilds the same order and the real kitchen ticket on another device', async () => {
    const { menuItem, line } = tandooriItem();
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '4',
      items: [line as any],
      subtotal: line.totalPrice,
      taxAmount: 12.5,
      totalAmount: line.totalPrice + 12.5,
      orderStatus: 'PREPARING',
      paymentStatus: 'PENDING',
      cashierName: 'Real Cashier',
      source_type: 'POS'
    });

    SyncOutboxEngine.configureTransport(fakeCloudTransport());
    await SyncOutboxEngine.processOutbox();
    expect(cloud.size).toBe(1);

    // "Device B": a fresh local database that only knows what the cloud tells it
    db.resetToDefaultSeed();
    expect(db.orders.length).toBe(0);
    await SyncOutboxEngine.catchUpFromCloud();

    const mirrored = db.orders.find((o) => o.id === order.id);
    expect(mirrored).toBeTruthy();
    expect(mirrored!.orderNumber).toBe(order.orderNumber);
    expect(mirrored!.tokenNumber).toBe(order.tokenNumber);
    expect(mirrored!.totalAmount).toBeCloseTo(order.totalAmount, 2);
    expect(mirrored!.items[0].modifiers[0].optionName).toBe('Extra Cheese');
    expect(mirrored!.items[0].specialInstructions).toBe('no onion please');

    const ticket = db.kots.find((k) => k.orderId === order.id);
    expect(ticket).toBeTruthy();
    expect(ticket!.items[0].kitchenStation).toBe(menuItem.kitchenStation || 'Main Kitchen');
    expect(ticket!.items[0].modifiers[0].optionName).toBe('Extra Cheese');
    expect(ticket!.items[0].specialInstructions).toBe('no onion please');
    expect(ticket!.cashierName).toBe('Real Cashier');
  });

  it('BUG-023: a kitchen status change made on the OTHER device (KDS marking a ticket READY) flows back to this one', async () => {
    const { line } = tandooriItem();
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '7',
      items: [line as any],
      subtotal: line.totalPrice,
      taxAmount: 12.5,
      totalAmount: line.totalPrice + 12.5,
      orderStatus: 'PREPARING',
      paymentStatus: 'PENDING',
      cashierName: 'Real Cashier',
      source_type: 'POS'
    });

    SyncOutboxEngine.configureTransport(fakeCloudTransport());
    await SyncOutboxEngine.processOutbox();

    // "Device B" (KDS): pulls the order, gets a real ticket, marks it READY.
    db.resetToDefaultSeed();
    await SyncOutboxEngine.catchUpFromCloud();
    const kot = db.kots.find((k) => k.orderId === order.id)!;
    expect(kot).toBeTruthy();
    const { KOTRepository } = await import('@jamanvaar/database');
    KOTRepository.updateKOTStatus(kot.id, 'READY');
    expect(db.orders.find((o) => o.id === order.id)!.syncStatus).toBe('SAVED_LOCALLY');
    await SyncOutboxEngine.processOutbox();

    // Back to "Device A" (POS): it already has this order locally; catching up must apply
    // the READY status onto it, not just create a brand-new copy.
    db.resetToDefaultSeed();
    (db.orders as any).push({ ...order, updatedAt: new Date(0).toISOString() });
    await SyncOutboxEngine.catchUpFromCloud();

    const backOnDeviceA = db.orders.find((o) => o.id === order.id)!;
    expect(backOnDeviceA.items[0].kitchenStatus).toBe('READY');
  });

  it('carries payment status, method and the recorded tender lines to the other device', async () => {
    const { line } = tandooriItem();
    const order = OrderRepository.createOrder({
      items: [line as any],
      subtotal: line.totalPrice,
      totalAmount: line.totalPrice,
      orderStatus: 'PREPARING',
      paymentStatus: 'PENDING',
      source_type: 'POS'
    });
    OrderRepository.settleOrder(order.id, 'SPLIT', 100, 'TXN-RT', 'Cashier', [
      { method: 'CASH', amount: 100 },
      { method: 'UPI', amount: line.totalPrice - 100 }
    ]);

    SyncOutboxEngine.configureTransport(fakeCloudTransport());
    await SyncOutboxEngine.processOutbox();

    db.resetToDefaultSeed();
    await SyncOutboxEngine.catchUpFromCloud();

    const mirrored = db.orders.find((o) => o.id === order.id)!;
    expect(mirrored.paymentStatus).toBe('SUCCESS');
    expect(mirrored.orderStatus).toBe('COMPLETED');
    expect(mirrored.paymentMethod).toBe('SPLIT');
    expect(mirrored.paymentSplits).toEqual([
      { method: 'CASH', amount: 100 },
      { method: 'UPI', amount: line.totalPrice - 100 }
    ]);
  });

  it('delivers an add-on round: the new item reaches the other device and gets its own ticket', async () => {
    const { line } = tandooriItem();
    const order = OrderRepository.createOrder({
      items: [line as any],
      subtotal: line.totalPrice,
      totalAmount: line.totalPrice,
      orderStatus: 'PREPARING',
      paymentStatus: 'PENDING',
      source_type: 'POS'
    });

    SyncOutboxEngine.configureTransport(fakeCloudTransport());
    await SyncOutboxEngine.processOutbox();

    // device B receives the first round
    const snapshotA = JSON.stringify(db.orders);
    db.resetToDefaultSeed();
    await SyncOutboxEngine.catchUpFromCloud();
    expect(db.orders.find((o) => o.id === order.id)!.items.length).toBe(1);
    const ticketsAfterFirstRound = db.kots.filter((k) => k.orderId === order.id).length;

    // device A adds a second dish and pushes again
    db.orders.splice(0, db.orders.length, ...JSON.parse(snapshotA));
    const a = db.orders.find((o) => o.id === order.id)!;
    const extra = db.menuItems[1];
    a.items.push({
      id: 'oi-rt-2',
      orderId: a.id,
      menuItemId: extra.id,
      name: extra.name,
      sku: extra.sku || 'SKU',
      quantity: 1,
      unitPrice: extra.price,
      modifiers: [],
      totalPrice: extra.price,
      kitchenStatus: 'PREPARING'
    } as any);
    a.subtotal += extra.price;
    a.totalAmount += extra.price;
    a.updatedAt = new Date(Date.now() + 1000).toISOString();
    a.syncStatus = 'SAVED_LOCALLY';
    await SyncOutboxEngine.processOutbox();

    // device B pulls again
    db.resetToDefaultSeed();
    await SyncOutboxEngine.catchUpFromCloud(); // first snapshot (2 items now)
    const mirrored = db.orders.find((o) => o.id === order.id)!;
    expect(mirrored.items.map((i) => i.name)).toContain(extra.name);
    const tickets = db.kots.filter((k) => k.orderId === order.id);
    expect(ticketsAfterFirstRound).toBe(1);
    expect(tickets.flatMap((k) => k.items.map((i) => i.name))).toContain(extra.name);
  });

  describe('B2-045: an order that sells out a recipe dish deducts stock on the device that actually owns the recipe/inventory data', () => {
    it('POS (no recipe/inventory data at all — the real-world gap, BUG-159) sells a dish; Restaurant Admin (which owns the recipe) deducts it on catch-up, exactly once', async () => {
      const { InventoryRepository, RecipeRepository } = await import('@jamanvaar/database');

      // "Device A" (POS): confirmed live in the bug's own repro — jamanvaar_db_inventory is
      // empty on POS before and after a sale. No recipes, no inventory items, on purpose.
      db.resetToDefaultSeed();
      db.recipes = [];
      db.inventoryItems = [];
      const menuItem = db.menuItems[0];
      const order = OrderRepository.createOrder({
        orderType: 'DINE_IN',
        tableNumber: '9',
        items: [{
          id: 'oi-b2045', orderId: '', menuItemId: menuItem.id, name: menuItem.name, sku: menuItem.sku || 'SKU',
          quantity: 2, unitPrice: menuItem.price, modifiers: [], totalPrice: menuItem.price * 2, kitchenStatus: 'PREPARING'
        } as any],
        subtotal: menuItem.price * 2,
        taxAmount: 0,
        totalAmount: menuItem.price * 2,
        orderStatus: 'PREPARING',
        paymentStatus: 'PENDING',
        cashierName: 'Real Cashier',
        source_type: 'POS'
      });
      // The deduction genuinely could not happen here — there is nothing to deduct from.
      expect(db.inventoryItems).toHaveLength(0);

      SyncOutboxEngine.configureTransport(fakeCloudTransport());
      await SyncOutboxEngine.processOutbox();

      // "Device B" (Restaurant Admin): the only place recipes/inventory are ever entered.
      db.resetToDefaultSeed();
      db.recipes = [];
      db.inventoryItems = [];
      const paneer = InventoryRepository.createItem({
        name: 'QA Paneer', sku: 'QA-PAN', category: 'Dairy', unit: 'kg', currentStock: 5, minStockLevel: 1, reorderLevel: 2, costPerUnit: 300
      })!;
      RecipeRepository.createRecipe({
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        ingredients: [{ inventoryItemId: paneer.id, inventoryItemName: 'QA Paneer', quantityPerPortion: 0.5, unit: 'kg' }]
      } as any);

      await SyncOutboxEngine.catchUpFromCloud();

      const stockAfter = InventoryRepository.getItemById(paneer.id)!.currentStock;
      expect(stockAfter).toBeCloseTo(4); // 5kg - (2 x 0.5kg) = 4kg — exactly what the bug said it should be

      // Catching up again (a routine poll, nothing new happened) must not deduct a second time.
      await SyncOutboxEngine.catchUpFromCloud();
      expect(InventoryRepository.getItemById(paneer.id)!.currentStock).toBeCloseTo(4);
    });

    it('does not deduct for an order that arrives already CANCELLED — it was never actually served', async () => {
      const { InventoryRepository, RecipeRepository } = await import('@jamanvaar/database');

      db.resetToDefaultSeed();
      db.recipes = [];
      db.inventoryItems = [];
      const menuItem = db.menuItems[0];
      const order = OrderRepository.createOrder({
        orderType: 'TAKEAWAY',
        items: [{
          id: 'oi-b2045-c', orderId: '', menuItemId: menuItem.id, name: menuItem.name, sku: menuItem.sku || 'SKU',
          quantity: 1, unitPrice: menuItem.price, modifiers: [], totalPrice: menuItem.price, kitchenStatus: 'PREPARING'
        } as any],
        subtotal: menuItem.price, taxAmount: 0, totalAmount: menuItem.price,
        orderStatus: 'PREPARING', paymentStatus: 'PENDING', source_type: 'POS'
      });
      OrderRepository.voidOrder(order.id, 'guest changed mind', 'Manager');

      SyncOutboxEngine.configureTransport(fakeCloudTransport());
      await SyncOutboxEngine.processOutbox();

      db.resetToDefaultSeed();
      db.recipes = [];
      db.inventoryItems = [];
      const paneer = InventoryRepository.createItem({
        name: 'QA Paneer', sku: 'QA-PAN-2', category: 'Dairy', unit: 'kg', currentStock: 5, minStockLevel: 1, reorderLevel: 2, costPerUnit: 300
      })!;
      RecipeRepository.createRecipe({
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        ingredients: [{ inventoryItemId: paneer.id, inventoryItemName: 'QA Paneer', quantityPerPortion: 0.5, unit: 'kg' }]
      } as any);

      await SyncOutboxEngine.catchUpFromCloud();
      expect(InventoryRepository.getItemById(paneer.id)!.currentStock).toBeCloseTo(5); // unchanged
    });
  });
});

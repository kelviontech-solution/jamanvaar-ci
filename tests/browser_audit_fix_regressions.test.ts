import { beforeEach, describe, expect, it } from 'vitest';
import { db, BusinessDayRepository, BusinessDayAccountingService, InventoryItemSync, InventoryRepository, KOTRepository, OrderRepository } from '@jamanvaar/database';
import { calculateCart, CentralReportingService, priceOrderLines } from '@jamanvaar/business';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { priceCart } from '../cloud/api/src/modules/payments/pricing.util';
import { EntitySyncEngine, SyncOutboxEngine } from '@jamanvaar/sync';
import type { CartItem, MenuItem, TaxGroup } from '@jamanvaar/types';

const groups: TaxGroup[] = [
  { id: 'gst18', name: 'GST18', cgstPercent: 9, sgstPercent: 9, igstPercent: 18, isInclusive: false, isActive: true },
  { id: 'gst5inclusive', name: 'GST5 inclusive', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: true, isActive: true }
];
function line(price: number, taxGroupId?: string, quantity = 1): CartItem {
  const item = { ...db.menuItems[0], id: `qa-${taxGroupId ?? 'none'}`, price, taxGroupId } as MenuItem;
  return { cartItemId: item.id, menuItemId: item.id, item, quantity, unitPrice: price, itemTotal: price * quantity, selectedModifiers: [] };
}
beforeEach(() => {
  db.resetToDefaultSeed(); db.orders = []; db.kots = []; db.stockMovements = []; db.inventoryItems = [];
  InventoryItemSync.reset(); usePosStore.getState().clearCart();
  usePosStore.setState({ runningOrderId: null, selectedTable: null, currentUser: { id: 'qa-cashier', roleId: 'role-cashier', fullName: 'QA Cashier' } as never });
  db.restaurant.instantBillConfig = { enabled: true, paymentMethod: 'CASH', autoPrint: false, askConfirmation: false, defaultOrderType: 'TAKEAWAY', sendKotBeforeBill: false, allowedRoles: ['role-cashier'] };
});
describe('browser audit financial and identity regressions', () => {
  it('automatically opening a day never invents a float and preserves a zero closing balance', () => {
    const prior = { ...BusinessDayRepository.getActiveBusinessDay(), id: 'prior-empty-drawer', status: 'CLOSED' as const, closingCash: 0 };
    db.businessDays = [prior];
    expect(BusinessDayRepository.getActiveBusinessDay().openingCash).toBe(0);
    db.businessDays = [];
    expect(BusinessDayRepository.getActiveBusinessDay().openingCash).toBe(0);
  });

  it('includes an imported Captain order in live-day reports despite a different terminal day ID', () => {
    const day = BusinessDayRepository.getActiveBusinessDay();
    const remote = { id: 'captain-mirror', businessDayId: 'other-terminal-day', kioskId: 'CLOUD-SYNC', createdAt: new Date().toISOString(), orderType: 'DINE_IN', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', paymentMethod: 'CASH', totalAmount: 118, subtotal: 100, taxAmount: 18, cgstAmount: 9, sgstAmount: 9, discountAmount: 0, items: [] } as any;
    db.orders = [remote];
    expect(BusinessDayRepository.orderBelongsToBusinessDay(remote, day)).toBe(true);
    expect(BusinessDayRepository.getOrdersForBusinessDay(day.id)).toEqual([remote]);
    expect(BusinessDayAccountingService.getBusinessDaySummary(day.id)).toMatchObject({ total_orders: 1, cash_sales: 118, tax_amount: 18 });
    expect(CentralReportingService.getReportableOrders(db.orders, CentralReportingService.getBusinessDateRange('TODAY'))).toEqual([remote]);
    expect(BusinessDayRepository.orderBelongsToBusinessDay({ ...remote, kioskId: 'POS-01' }, day)).toBe(false);
    expect(BusinessDayRepository.orderBelongsToBusinessDay({ ...remote, createdAt: '2000-01-01T10:00:00Z' }, day)).toBe(false);
  });

  it('a previously synced unpaid draft creates its kitchen ticket when the same lines become paid', async () => {
    const now = new Date().toISOString();
    const remote: any = { externalOrderId: 'qa-paid-admission', orderType: 'TAKEAWAY', status: 'DRAFT', items: [{ externalItemId: 'qa-line', menuItemId: 'qa-pizza', name: 'QA Pizza', quantity: 1, unitPrice: 10000, lineTotal: 10000, modifiers: [], kitchenStatus: 'PENDING' }], subtotal: 10000, taxAmount: 1800, discountAmount: 0, totalAmount: 11800, paymentStatus: 'PENDING', paymentMethod: 'UPI', meta: { sourceType: 'KIOSK', tokenNumber: 'QA-1' }, seq: 1, updatedAt: now };
    SyncOutboxEngine.configureTransport({ push: async () => ({ results: [], serverTime: now }), pull: async () => ({ orders: [remote], latestSeq: remote.seq, serverTime: now }) });
    try {
      await SyncOutboxEngine.catchUpFromCloud(); expect(db.kots).toHaveLength(0);
      remote.status = 'CONFIRMED'; remote.paymentStatus = 'SUCCESS'; remote.seq = 2;
      await SyncOutboxEngine.catchUpFromCloud(); expect(db.kots).toHaveLength(1);
      expect(db.kots[0].orderId).toBe(remote.externalOrderId);
      await SyncOutboxEngine.catchUpFromCloud(); expect(db.kots).toHaveLength(1);
    } finally { SyncOutboxEngine.configureTransport(null); EntitySyncEngine.configureTransport(null); }
  });
  it('unassigned tax is zero on POS, Captain and the online quote', () => {
    const item = line(299);
    db.menuItems = [item.item]; db.taxGroups = groups;
    usePosStore.getState().addItemToCart(item.item, [], '', 1);
    expect(usePosStore.getState().cart.totalPayable).toBe(299);
    expect(usePosStore.getState().cart.taxAmount).toBe(0);
    expect(priceOrderLines([{ menuItemId: item.menuItemId, unitPrice: 299, quantity: 1 }], { menuItems: db.menuItems, taxGroups: groups }).totalAmount).toBe(299);
    expect(priceCart([{ externalItemId: item.menuItemId, quantity: 1, selectedOptionIds: [] }], new Map([[item.menuItemId, { externalItemId: item.menuItemId, name: 'Pizza', basePrice: 29900, taxRate: 0, isAvailable: true, modifierGroups: [] }]])).totalAmount).toBe(29900);
  });
  it('mixed exclusive and inclusive taxes reconcile exactly to the gateway quote', () => {
    const items = [line(100, 'gst18'), line(100, 'gst5inclusive')];
    const cart = calculateCart({ items, taxGroups: groups, roundToRupee: false });
    const quote = priceCart(items.map(i => ({ externalItemId: i.menuItemId, quantity: 1, selectedOptionIds: [] })), new Map(items.map(i => [i.menuItemId, { externalItemId: i.menuItemId, name: 'Pizza', basePrice: 10000, taxRate: i.item.taxGroupId === 'gst18' ? 1800 : 500, taxInclusive: i.item.taxGroupId === 'gst5inclusive', isAvailable: true, modifierGroups: [] }])));
    expect(cart.totalPayable).toBe(218); expect(cart.taxAmount).toBe(22.76);
    expect(Math.round(cart.subtotal * 100)).toBe(quote.subtotal);
    expect(Math.round(cart.taxAmount * 100)).toBe(quote.taxAmount);
    expect(Math.round(cart.totalPayable * 100)).toBe(quote.totalAmount);
    expect(cart.subtotal - cart.discountAmount + cart.taxAmount + cart.roundOffAmount).toBeCloseTo(cart.totalPayable, 2);
    expect(calculateCart({ items, taxGroups: groups, discountType: 'PERCENTAGE', discountValue: 10, roundToRupee: false }).totalPayable).toBe(196.2);
  });
  it('SEND KOT followed by Instant Bill settles the same order and preserves item identity', async () => {
    const item = line(100, 'gst18'); db.menuItems = [item.item]; db.taxGroups = groups;
    usePosStore.getState().addItemToCart(item.item, [], '', 1);
    usePosStore.getState().sendKOT();
    expect(db.orders).toHaveLength(1);
    const id = db.orders[0].id, itemId = db.orders[0].items[0].id, kotCount = db.kots.length;
    const paid = await usePosStore.getState().executeInstantBill('CASH');
    expect(paid?.id).toBe(id); expect(paid?.items[0].id).toBe(itemId);
    expect(paid?.totalAmount).toBe(118); expect(paid?.paymentStatus).toBe('SUCCESS');
    expect(db.orders).toHaveLength(1); expect(db.kots).toHaveLength(kotCount);
    expect(usePosStore.getState().cart.items).toHaveLength(0);
  });
  it('an inclusive-tax sale is accepted with a net-of-tax subtotal and an exact receipt identity', async () => {
    const item = line(100, 'gst5inclusive'); db.menuItems = [item.item]; db.taxGroups = groups;
    usePosStore.getState().addItemToCart(item.item, [], '', 1);
    const paid = await usePosStore.getState().executeInstantBill('CASH');
    expect(paid).not.toBeNull(); expect(paid?.totalAmount).toBe(100);
    expect(paid?.subtotal).toBe(95.24); expect(paid?.taxAmount).toBe(4.76);
  });
});
describe('inventory master and ledger reconstruction', () => {
  it('syncs opening stock, not a device live balance, and replays movements once on another device', () => {
    const item = InventoryRepository.createItem({ name: 'QA Cheese', sku: 'QA-CHEESE', unit: 'kg', category: 'Dairy', currentStock: 10, minStockLevel: 2, reorderLevel: 3, costPerUnit: 100 })!;
    InventoryRepository.recordMovement({ itemId: item.id, itemName: item.name, type: 'PURCHASE', quantityDelta: 5, unit: item.unit, reason: 'Delivery', performedBy: 'Owner' });
    const record = InventoryItemSync.collectSyncRecords()[0];
    expect(record.payload.currentStock).toBe(10); expect(record.payload.openingStock).toBe(10);
    const movements = [...db.stockMovements]; db.inventoryItems = []; db.stockMovements = []; InventoryItemSync.reset();
    InventoryItemSync.applyRemote(record.payload);
    expect(db.inventoryItems[0].currentStock).toBe(10);
    db.stockMovements = movements.map(m => ({ ...m, id: `remote:${m.id}`, remote: true }));
    InventoryItemSync.applyRemote(record.payload);
    expect(db.inventoryItems[0].currentStock).toBe(15);
    InventoryItemSync.applyRemote(record.payload);
    expect(db.inventoryItems[0].currentStock).toBe(15);
    InventoryRepository.updateItem(item.id, { currentStock: 14 });
    expect(db.stockMovements.filter(m => m.type === 'ADJUSTMENT').map(m => m.quantityDelta)).toEqual([-1]);
    expect(db.inventoryItems[0].openingStock).toBe(10);
    expect(InventoryItemSync.collectSyncRecords()).toHaveLength(0); // Movement-only changes never overwrite the master balance.
  });
});

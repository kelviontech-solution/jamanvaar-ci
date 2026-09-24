import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, ReceiptRepository, PrintQueueRepository } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

describe('JAMANVAAR POS — ⚡ Instant Bill / Fast-Track Counter Billing Mode', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    usePosStore.getState().clearCart();
  });

  it('1. should fast-track settle an order using Instant Bill (Cash) bypassing payment overview screen', async () => {
    const item1 = db.menuItems.find((m) => m.name.includes('Butter Naan')) || db.menuItems[0];
    const item2 = db.menuItems.find((m) => m.name.includes('Dal Makhani')) || db.menuItems[1];

    usePosStore.getState().addItemToCart(item1, [], '', 2); // 2x item1
    usePosStore.getState().addItemToCart(item2, [], '', 1); // 1x item2

    expect(usePosStore.getState().cart.items.length).toBe(2);
    const expectedPayable = usePosStore.getState().cart.totalPayable;
    expect(expectedPayable).toBeGreaterThan(0);

    // 2. Trigger Instant Bill
    const settledOrder = await usePosStore.getState().executeInstantBill('CASH');

    expect(settledOrder).toBeDefined();
    expect(settledOrder?.paymentMethod).toBe('CASH');
    expect(settledOrder?.paymentStatus).toBe('SUCCESS');
    expect(settledOrder?.orderStatus).toBe('COMPLETED');
    expect(settledOrder?.totalAmount).toBe(expectedPayable);

    // 3. Cart should be immediately cleared for the next customer
    expect(usePosStore.getState().cart.items.length).toBe(0);

    // 4. Receipt should be queued in Print Queue
    const lastReceipt = ReceiptRepository.getAllRecords().pop();
    expect(lastReceipt).toBeDefined();
    expect(lastReceipt?.orderId).toBe(settledOrder?.id);
  });

  it('2. should support Instant Bill with UPI / QR tender and tax calculations', async () => {
    const dish = db.menuItems[0];
    usePosStore.getState().addItemToCart(dish, [], '', 1);

    const payable = usePosStore.getState().cart.totalPayable;
    const settledOrder = await usePosStore.getState().executeInstantBill('UPI_QR');

    expect(settledOrder).toBeDefined();
    expect(settledOrder?.paymentMethod).toBe('UPI_QR');
    expect(settledOrder?.totalAmount).toBe(payable);
  });

  it('3. should update Instant Bill configuration in Restaurant Settings', () => {
    usePosStore.getState().updateInstantBillConfig({
      paymentMethod: 'CARD',
      autoPrint: false,
      sendKotBeforeBill: true
    });

    expect(db.restaurant?.instantBillConfig?.paymentMethod).toBe('CARD');
    expect(db.restaurant?.instantBillConfig?.autoPrint).toBe(false);
    expect(db.restaurant?.instantBillConfig?.sendKotBeforeBill).toBe(true);
  });

  // BUG-153: the sale was saved as DINE_IN with no table and no cashier, and under a different guest name.
  it('4. is a takeaway sale by the signed-in cashier, like a normal counter order (BUG-153)', async () => {
    usePosStore.setState({ currentUser: { id: 'u1', fullName: 'Priya Cashier', roleId: 'role-cashier' } as never, orderType: 'DINE_IN', selectedTable: null });
    usePosStore.getState().addItemToCart(db.menuItems[0], [], '', 1);
    const settled = await usePosStore.getState().executeInstantBill('CASH');
    expect(settled?.orderType).toBe('TAKEAWAY');
    expect(settled?.cashierName).toBe('Priya Cashier');
    expect(settled?.customerName).not.toBe('Walk-in Guest');
  });

  it('5. keeps a type the cashier chose on purpose', async () => {
    usePosStore.setState({ orderType: 'DELIVERY', selectedTable: null });
    usePosStore.getState().addItemToCart(db.menuItems[0], [], '', 1);
    const settled = await usePosStore.getState().executeInstantBill('CASH');
    expect(settled?.orderType).toBe('DELIVERY');
  });

  describe('B2-062: House Account cannot be settled with no customer attached and no manager present', () => {
    it('refuses (no order created) and routes to the full Pay screen when no customer is attached', async () => {
      usePosStore.setState({ currentUser: { id: 'u1', fullName: 'Priya Cashier', roleId: 'role-manager' } as never, selectedCustomer: null, isPaymentOpen: false });
      usePosStore.getState().addItemToCart(db.menuItems[0], [], '', 1);
      const ordersBefore = db.orders.length;

      const settled = await usePosStore.getState().executeInstantBill('HOUSE_ACCOUNT' as never);

      expect(settled).toBeNull();
      expect(db.orders.length).toBe(ordersBefore); // nothing was created
      expect(usePosStore.getState().isPaymentOpen).toBe(true); // redirected to the real Pay screen
      // Cart is left intact — the cashier hasn't lost their work, just been redirected.
      expect(usePosStore.getState().cart.items.length).toBe(1);
    });

    it('refuses when a customer is attached but the cashier is not a manager', async () => {
      usePosStore.setState({
        currentUser: { id: 'u1', fullName: 'Priya Cashier', roleId: 'role-cashier' } as never,
        selectedCustomer: { id: 'cust-1', name: 'Rahul Regular', phone: '9998887777' } as never,
        isPaymentOpen: false
      });
      usePosStore.getState().addItemToCart(db.menuItems[0], [], '', 1);

      const settled = await usePosStore.getState().executeInstantBill('HOUSE_ACCOUNT' as never);
      expect(settled).toBeNull();
      expect(usePosStore.getState().isPaymentOpen).toBe(true);
    });

    it('settles normally, correctly tagged as CREDIT (not WALLET), once a customer is attached and a manager is signed in', async () => {
      usePosStore.setState({
        currentUser: { id: 'u1', fullName: 'Manager Meera', roleId: 'role-manager' } as never,
        selectedCustomer: { id: 'cust-1', name: 'Rahul Regular', phone: '9998887777' } as never
      });
      usePosStore.getState().addItemToCart(db.menuItems[0], [], '', 1);

      const settled = await usePosStore.getState().executeInstantBill('HOUSE_ACCOUNT' as never);
      expect(settled).not.toBeNull();
      // Never 'WALLET' — House Account is a distinct, traceable payment method.
      expect(settled?.paymentMethod).toBe('CREDIT');
      expect(settled?.customerName).toBe('Rahul Regular');
      expect(settled?.customerPhone).toBe('9998887777');
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db, StaffRepository, KOTRepository, OrderRepository, ServiceMessages } from '@jamanvaar/database';
import { useCaptainStore, guestCountOptions, selectMyTables } from '../apps/restaurant-system/captain/src/store/captainStore';

/**
 * Captain module live test (BUG-097..112). The store is the waiter's whole workflow, so these
 * drive it the way the screens do: sign in with a PIN, seat a table, add dishes, fire the KOT,
 * take the food out, ask for the bill.
 */
describe('Captain service workflow', () => {
  let pin: string;
  let userId: string;

  const store = () => useCaptainStore.getState();
  const table = (n: string) => db.tables.find((t) => t.tableNumber === n)!;

  beforeEach(async () => {
    db.resetToDefaultSeed();
    // This scenario explicitly exercises tax-exclusive listed prices; inclusive pricing has separate regressions.
    db.taxGroups.forEach(group => { group.isInclusive = false; });
    db.users = [];
    db.orders = [];
    db.kots = [];
    const created = await StaffRepository.createUser({ username: 'ravi', fullName: 'Ravi Waiter', roleId: 'role-captain' });
    pin = created.issuedPin!;
    userId = created.id;
    ServiceMessages.resetForTests();
    store().logout();
    useCaptainStore.setState({ cartItems: [], selectedTable: null, selectedTableOrder: null, foodReadyItems: [], tableFilter: 'ALL_TABLES' });
  });

  const signIn = async () => expect(await store().login(pin)).toBe(true);
  const addDish = (index: number, quantity = 1) => store().addItemToCart(db.menuItems[index], [], '', 'COURSE_1', quantity);

  describe('sign-in (BUG-105/106/107)', () => {
    it('rejects a wrong PIN and signs in the real staff member on the right one', async () => {
      expect(await store().login('0000')).toBe(false);
      expect(store().isLoggedIn).toBe(false);

      await signIn();
      expect(store().isLoggedIn).toBe(true);
      expect(store().currentCaptain?.name).toBe('Ravi Waiter');
      expect(store().currentCaptain?.id).toBe(userId);
    });

    it('refuses a PIN that belongs to a role that does not work the floor (BUG-118)', async () => {
      const cook = await StaffRepository.createUser({ username: 'chefji', fullName: 'Chef Ji', roleId: 'role-chef' });
      expect(await store().login(cook.issuedPin!)).toBe(false);
      expect(store().isLoggedIn).toBe(false);
      // BUG-147: the screen says why, instead of "incorrect PIN"; a plain typo says nothing special.
      expect(store().loginError).toMatch(/Chef.*can't open the Captain app/);
      expect(await store().login('0000')).toBe(false);
      expect(store().loginError).toBeNull();
    });

    it('nobody is pre-assigned tables: the default view is every table', async () => {
      await signIn();
      expect(store().currentCaptain?.assignedTableNumbers ?? []).toEqual([]);
      expect(store().tableFilter).toBe('ALL_TABLES');
    });

    it('a table that has been freed is no longer "mine", even if it was freed at the counter and still carries the waiters name', async () => {
      await signIn();
      store().openTable('3', 2);
      const t3 = db.tables.find((t) => t.tableNumber === '3')!;
      t3.status = 'AVAILABLE';
      t3.currentOrderId = undefined;
      expect(selectMyTables(db.tables, store().currentCaptain)).toEqual([]);
    });

    it('"my tables" are the tables this waiter seated', async () => {
      await signIn();
      store().openTable('3', 2);
      const mine = selectMyTables(db.tables, store().currentCaptain);
      expect(mine.map((t) => t.tableNumber)).toEqual(['3']);
    });
  });

  describe('seating (BUG-109)', () => {
    it('only offers guest counts the table can seat', async () => {
      expect(guestCountOptions(2)).toEqual([1, 2]);
      expect(guestCountOptions(4)).toEqual([1, 2, 3, 4]);
      expect(guestCountOptions(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(guestCountOptions(0)).toEqual([1]);
    });

    it('records who seated the table', async () => {
      await signIn();
      store().openTable('1', 2);
      expect(table('1')).toMatchObject({ status: 'OCCUPIED', currentGuests: 2, openedById: userId, openedByName: 'Ravi Waiter' });
    });
  });

  describe('firing the KOT (BUG-101/102)', () => {
    it('the order carries the waiter, the table link and a proper CGST/SGST/round-off bill', async () => {
      await signIn();
      store().openTable('1', 2);
      addDish(0, 1);
      addDish(1, 2);
      const kots = store().sendKOT();
      expect(kots).not.toBeNull();

      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      expect(order).toMatchObject({ captainName: 'Ravi Waiter', source_type: 'CAPTAIN', tableNumber: '1', orderStatus: 'PREPARING' });
      expect(order.cgstAmount + order.sgstAmount).toBeCloseTo(order.taxAmount, 2);
      expect(order.taxAmount).toBeGreaterThan(0);
      expect(order.totalAmount).toBe(Math.round(order.subtotal + order.taxAmount));
      expect(order.roundOffAmount).toBeCloseTo(order.totalAmount - order.subtotal - order.taxAmount, 2);
      expect(kots![0].serverName).toBe('Ravi Waiter');
    });

    it('adding a second round reprices the whole order the same way', async () => {
      await signIn();
      store().openTable('1', 2);
      addDish(0, 1);
      store().sendKOT();
      addDish(1, 1);
      store().sendKOT();

      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      const subtotal = order.items.reduce((s, i) => s + i.totalPrice, 0);
      expect(order.subtotal).toBeCloseTo(subtotal, 2);
      expect(order.cgstAmount + order.sgstAmount).toBeCloseTo(order.taxAmount, 2);
      expect(order.totalAmount).toBe(Math.round(order.subtotal + order.taxAmount));
      expect(order.syncStatus).toBe('SAVED_LOCALLY');
    });

    it('will not fire a KOT without a table', async () => {
      await signIn();
      addDish(0, 1);
      expect(store().sendKOT()).toBeNull();
      expect(db.orders).toHaveLength(0);
    });
  });

  describe('bill request (BUG-099)', () => {
    it('marks the table so the counter sees it, only when there is something to bill', async () => {
      await signIn();
      store().openTable('1', 2);
      expect(store().requestBill('1')).toBe(false);
      expect(table('1').status).toBe('OCCUPIED');

      addDish(0, 1);
      store().sendKOT();
      expect(store().requestBill('1')).toBe(true);
      expect(table('1').status).toBe('BILL_REQUESTED');
    });
  });

  describe('transfer and merge (BUG-111)', () => {
    const seatWithOrder = (n: string, dish = 0, qty = 1) => {
      store().openTable(n, 2);
      addDish(dish, qty);
      store().sendKOT();
      store().closeTableWorkspace();
      useCaptainStore.setState({ cartItems: [], selectedTable: null, selectedTableOrder: null });
    };

    it('moves the running order to a free table and frees the old one', async () => {
      await signIn();
      seatWithOrder('1');
      const orderId = table('1').currentOrderId!;

      expect(store().transferTable('1', '5')).toBe(true);
      expect(table('1')).toMatchObject({ status: 'AVAILABLE' });
      expect(table('1').currentOrderId).toBeUndefined();
      expect(table('5')).toMatchObject({ status: 'OCCUPIED', currentOrderId: orderId, openedByName: 'Ravi Waiter' });
      const order = OrderRepository.getOrderById(orderId)!;
      expect(order.tableNumber).toBe('5');
      expect(order.syncStatus).toBe('SAVED_LOCALLY');
      expect(KOTRepository.getKOTsForOrder(orderId).every((k) => k.tableNumber === '5')).toBe(true);
    });

    it('refuses to move onto a table that is already in use, and leaves both untouched', async () => {
      await signIn();
      seatWithOrder('1');
      seatWithOrder('2', 1);
      const first = table('1').currentOrderId;
      const second = table('2').currentOrderId;

      expect(store().transferTable('1', '2')).toBe(false);
      expect(table('1').currentOrderId).toBe(first);
      expect(table('2').currentOrderId).toBe(second);
    });

    it('merging combines both orders into one bill and keeps the second table linked to it', async () => {
      await signIn();
      seatWithOrder('1', 0, 1);
      seatWithOrder('2', 1, 2);
      const primaryId = table('1').currentOrderId!;
      const secondaryId = table('2').currentOrderId!;
      const secondaryTotal = OrderRepository.getOrderById(secondaryId)!.subtotal;
      const primarySubtotal = OrderRepository.getOrderById(primaryId)!.subtotal;

      expect(store().mergeTables('1', '2')).toBe(true);

      const primary = OrderRepository.getOrderById(primaryId)!;
      expect(primary.subtotal).toBeCloseTo(primarySubtotal + secondaryTotal, 2);
      expect(primary.cgstAmount + primary.sgstAmount).toBeCloseTo(primary.taxAmount, 2);
      expect(primary.totalAmount).toBe(Math.round(primary.subtotal + primary.taxAmount));
      expect(OrderRepository.getOrderById(secondaryId)!.orderStatus).toBe('CANCELLED');
      expect(table('2').currentOrderId).toBe(primaryId);
      expect(table('1').currentGuests).toBe(4);
    });

    it('refuses to merge a table that is not in use', async () => {
      await signIn();
      seatWithOrder('1');
      expect(store().mergeTables('1', '4')).toBe(false);
    });
  });

  describe('food ready and serving (BUG-098)', () => {
    it('refuses a cooking ticket and ignores repeated serve taps', async () => {
      await signIn(); store().openTable('1', 2); addDish(0, 1);
      const [kot] = store().sendKOT()!;
      const before = store().shiftStats.foodServed;
      store().markEntireKotServed(kot.id);
      expect(db.kots.find(k => k.id === kot.id)!.status).toBe('PREPARING');
      expect(store().shiftStats.foodServed).toBe(before);
      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      order.items.forEach(i => { i.kitchenStatus = 'READY'; }); KOTRepository.reconcileWithOrders(); store().refreshState();
      const ready = store().foodReadyItems[0]; store().markItemServed(ready.id);
      const after = store().shiftStats.foodServed; store().markItemServed(ready.id); store().markEntireKotServed(kot.id);
      expect(after).toBeGreaterThan(before); expect(store().shiftStats.foodServed).toBe(after);
    });
    it('does not serve a stale ready-list dish after the kitchen undoes Ready', async () => {
      await signIn(); store().openTable('1', 2); addDish(0, 1); store().sendKOT();
      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      order.items.forEach(i => { i.kitchenStatus = 'READY'; }); KOTRepository.reconcileWithOrders(); store().refreshState();
      const ready = store().foodReadyItems[0], before = store().shiftStats.foodServed;
      const kot = db.kots.find(k => k.id === ready.kotId)!; kot.status = 'PREPARING'; kot.items.forEach(i => { i.status = 'PREPARING'; });
      store().markItemServed(ready.id);
      expect(kot.status).toBe('PREPARING'); expect(store().shiftStats.foodServed).toBe(before);
    });
    it('dishes the kitchen finished appear as food ready, and serving them clears the list', async () => {
      await signIn();
      store().openTable('1', 2);
      addDish(0, 1);
      addDish(1, 1);
      const kots = store().sendKOT()!;

      // The order copy arrives from the kitchen marked ready; the tickets follow it.
      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      order.items.forEach((i) => { i.kitchenStatus = 'READY'; });
      KOTRepository.reconcileWithOrders();
      store().refreshState();

      const ready = store().foodReadyItems;
      expect(ready.length).toBeGreaterThan(0);
      expect(ready.every((r) => r.tableNumber === '1')).toBe(true);

      ready.forEach((r) => store().markItemServed(r.id));
      expect(store().foodReadyItems).toEqual([]);
      expect(kots.every((k) => db.kots.find((x) => x.id === k.id)!.status === 'SERVED')).toBe(true);
      expect(store().shiftStats.foodServed).toBeGreaterThan(0);
    });

    it('delivering a table serves every dish the kitchen finished for it in one tap, and leaves other tables alone (BUG-148)', async () => {
      await signIn();
      store().openTable('1', 2);
      addDish(0, 1);
      addDish(1, 2);
      store().sendKOT();
      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      order.items.forEach((i) => { i.kitchenStatus = 'READY'; });
      KOTRepository.reconcileWithOrders();
      store().refreshState();
      expect(store().foodReadyItems.length).toBeGreaterThan(0);

      expect(store().serveReadyForTable('2')).toBe(0);
      expect(store().foodReadyItems.length).toBeGreaterThan(0);

      expect(store().serveReadyForTable('1')).toBeGreaterThan(0);
      expect(store().foodReadyItems).toEqual([]);
      expect(OrderRepository.getOrderById(table('1').currentOrderId!)!.items.every((i) => i.kitchenStatus === 'SERVED')).toBe(true);
    });

    it('a ticket served as a whole is cleared in one tap', async () => {
      await signIn();
      store().openTable('1', 2);
      addDish(0, 1);
      const [kot] = store().sendKOT()!;
      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      order.items.forEach((i) => { i.kitchenStatus = 'READY'; });
      KOTRepository.reconcileWithOrders();
      store().refreshState();

      store().markEntireKotServed(kot.id);
      expect(store().foodReadyItems).toEqual([]);
    });
  });

  describe('a table whose order was settled elsewhere (BUG-097)', () => {
    it('is freed on refresh, so the waiter is not left with a stuck table', async () => {
      await signIn();
      store().openTable('1', 2);
      addDish(0, 1);
      store().sendKOT();
      store().requestBill('1');

      const order = OrderRepository.getOrderById(table('1').currentOrderId!)!;
      order.orderStatus = 'COMPLETED';
      order.paymentStatus = 'SUCCESS';
      store().refreshState();

      expect(table('1').status).toBe('AVAILABLE');
      expect(table('1').currentOrderId).toBeUndefined();
    });
  });
  describe('messages and bill requests leave the tablet (BUG-099/100)', () => {
    it('a message to the kitchen is queued for delivery with the table and the waiters name', async () => {
      await signIn();
      store().sendMessage('KITCHEN', 'Food taking too long', 'Table is upset', '4');
      const [record] = ServiceMessages.collectSyncRecords();
      expect(record.payload).toMatchObject({ kind: 'MESSAGE', recipient: 'KITCHEN', senderName: 'Ravi Waiter', presetText: 'Food taking too long', customNote: 'Table is upset', tableNumber: '4' });
    });

    it('a bill request belongs to the order: the order carries it, the table follows, and no separate message is queued', async () => {
      await signIn();
      store().openTable('1', 2);
      addDish(0, 1);
      store().sendKOT();
      expect(store().requestBill('1')).toBe(true);

      const order = db.orders.find((o) => o.id === table('1').currentOrderId);
      expect(order?.billRequestedAt).toBeTruthy();
      expect(table('1').status).toBe('BILL_REQUESTED');
      expect(ServiceMessages.collectSyncRecords()).toHaveLength(0);
    });

    it('a refused bill request queues nothing', async () => {
      await signIn();
      store().openTable('1', 2);
      expect(store().requestBill('1')).toBe(false);
      expect(ServiceMessages.collectSyncRecords()).toHaveLength(0);
    });

    it('messages that arrive from other devices show up in the inbox once, with a notification', async () => {
      await signIn();
      const incoming = { id: 'svc-9', kind: 'MESSAGE' as const, recipient: 'CAPTAIN' as const, senderName: 'Manager', presetText: 'Table 9 needs help', tableNumber: '9', createdAt: new Date().toISOString() };
      store().receiveMessages([incoming]);
      store().receiveMessages([incoming]);

      expect(store().messages.filter((m) => m.id === 'svc-9')).toHaveLength(1);
      expect(store().messages[0]).toMatchObject({ senderName: 'Manager', presetText: 'Table 9 needs help', tableNumber: '9' });
      expect(store().notifications.some((n) => n.message.includes('Table 9 needs help'))).toBe(true);
    });

    it('a kiosk guest\'s Call Staff tap lands in Guest Requests, not the general message inbox', () => {
      signIn();
      const incoming = {
        id: 'svc-call-1',
        kind: 'CALL_STAFF' as const,
        recipient: 'COUNTER' as const,
        senderName: 'Self-order kiosk',
        presetText: 'A guest at Table 5 asked for help.',
        tableNumber: '5',
        createdAt: new Date().toISOString()
      };
      store().receiveMessages([incoming]);
      store().receiveMessages([incoming]); // delivered twice — must not duplicate

      const requests = store().customerRequests.filter((r) => r.id === 'svc-svc-call-1');
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ tableNumber: '5', type: 'HELP', notes: 'A guest at Table 5 asked for help.', isResolved: false });
      expect(store().messages.some((m) => m.id === 'svc-call-1')).toBe(false);
      expect(store().notifications.some((n) => n.type === 'GUEST_HELP' && n.message.includes('Table 5'))).toBe(true);
    });
  });
});

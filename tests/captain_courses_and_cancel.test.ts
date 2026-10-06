import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, StaffRepository, ServiceMessages, KOTRepository } from '@jamanvaar/database';
import { useCaptainStore } from '../apps/restaurant-system/captain/src/store/captainStore';

/**
 * Firing a meal course by course, keeping the dishes not yet sent, and cancelling a dish that is already cooking.
 */
describe('Captain: courses, held dishes and cancelling a sent dish', () => {
  const store = () => useCaptainStore.getState();
  const memory = new Map<string, string>();
  const g = globalThis as unknown as { localStorage: unknown };
  let saved: unknown;
  let captainPin: string;
  let managerPin: string;

  beforeEach(async () => {
    saved = g.localStorage;
    memory.clear();
    g.localStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) };
    db.resetToDefaultSeed();
    // This scenario explicitly exercises tax-exclusive listed prices; inclusive pricing has separate regressions.
    db.taxGroups.forEach(group => { group.isInclusive = false; });
    db.users = [];
    db.orders = [];
    db.kots = [];
    ServiceMessages.resetForTests();
    captainPin = (await StaffRepository.createUser({ username: 'ravi', fullName: 'Ravi Waiter', roleId: 'role-captain' })).issuedPin!;
    managerPin = (await StaffRepository.createUser({ username: 'mona', fullName: 'Mona Manager', roleId: 'role-manager' })).issuedPin!;
    store().logout();
    useCaptainStore.setState({ cartItems: [], selectedTable: null, selectedTableOrder: null, foodReadyItems: [], tableFilter: 'ALL_TABLES' });
    expect(await store().login(captainPin)).toBe(true);
  });
  afterEach(() => {
    g.localStorage = saved;
  });

  const seat = (index = 0) => {
    const table = db.tables[index];
    store().selectTable(table);
    store().openTable(table.tableNumber, 2);
    return db.tables[index];
  };
  const add = (menuIndex: number, course: 'COURSE_1' | 'COURSE_2' | 'COURSE_3') => store().addItemToCart(db.menuItems[menuIndex], [], '', course, 1);

  describe('courses', () => {
    it('sending one course sends only its dishes; the rest stay held for later', () => {
      seat();
      add(0, 'COURSE_1');
      add(1, 'COURSE_2');
      add(2, 'COURSE_2');

      const kots = store().sendKOT(['COURSE_1']);
      expect(kots).not.toBeNull();
      const sentNames = kots!.flatMap((k) => k.items.map((i) => i.name));
      expect(sentNames).toEqual([db.menuItems[0].name]);
      expect(store().selectedTableOrder!.items).toHaveLength(1);
      expect(store().cartItems.filter((c) => !c.isFired)).toHaveLength(2);

      const second = store().sendKOT(['COURSE_2']);
      expect(second!.flatMap((k) => k.items).map((i) => i.name).sort()).toEqual([db.menuItems[1].name, db.menuItems[2].name].sort());
      expect(store().selectedTableOrder!.items).toHaveLength(3);
    });

    it('sending with no course sends everything, as before', () => {
      seat();
      add(0, 'COURSE_1');
      add(1, 'COURSE_3');
      const kots = store().sendKOT();
      expect(kots!.flatMap((k) => k.items)).toHaveLength(2);
    });

    it('a course with nothing in it sends nothing', () => {
      seat();
      add(0, 'COURSE_1');
      expect(store().sendKOT(['COURSE_3'])).toBeNull();
    });

    it('the first order holds only the sent dishes and is priced for them alone', () => {
      seat();
      add(0, 'COURSE_1');
      add(1, 'COURSE_2');
      store().sendKOT(['COURSE_1']);
      const order = store().selectedTableOrder!;
      expect(order.items.map((i) => i.menuItemId)).toEqual([db.menuItems[0].id]);
      expect(order.subtotal).toBe(db.menuItems[0].price);
    });

    it('a dish can be moved to another course until it is sent', () => {
      seat();
      add(0, 'COURSE_1');
      const id = store().cartItems[0].id;
      store().setCartItemCourse(id, 'COURSE_3');
      expect(store().cartItems[0].course).toBe('COURSE_3');
      store().sendKOT();
      store().setCartItemCourse(id, 'COURSE_1'); // already sent: ignored
      expect(store().cartItems[0].course).toBe('COURSE_3');
    });

    it('each sent dish is tied to its own order line and course, on the order and on the ticket', () => {
      seat();
      add(0, 'COURSE_2');
      const kots = store().sendKOT()!;
      const line = store().selectedTableOrder!.items[0];
      expect(line.course).toBe('COURSE_2');
      expect(kots[0].items[0]).toMatchObject({ orderItemId: line.id, course: 'COURSE_2' });
      expect(store().cartItems[0].orderItemId).toBe(line.id);
    });
  });

  describe('dishes not yet sent are kept for the table', () => {
    it('come back when the table is opened again, and do not leak onto another table', () => {
      const t1 = seat(0);
      add(0, 'COURSE_2');
      store().closeTableWorkspace();
      store().selectTable(null); // leaves the table

      store().openTableWorkspace(t1);
      expect(store().cartItems.map((c) => c.menuItem.id)).toEqual([db.menuItems[0].id]);

      const t2 = seat(1);
      expect(store().cartItems).toEqual([]);
      expect(t2.tableNumber).not.toBe(t1.tableNumber);
    });

    it('are dropped when the table is closed, so the next party does not inherit them', () => {
      const t1 = seat(0);
      add(0, 'COURSE_1');
      store().closeTable(t1.tableNumber);
      const again = seat(0);
      expect(store().cartItems).toEqual([]);
      expect(again.status).toBe('OCCUPIED');
    });

    it('follow a transfer to the new table', () => {
      const from = seat(0);
      add(0, 'COURSE_1');
      add(1, 'COURSE_2');
      store().sendKOT(['COURSE_1']);
      const to = db.tables[1];
      expect(store().transferTable(from.tableNumber, to.tableNumber)).toBe(true);
      expect(store().cartItems.filter((c) => !c.isFired).map((c) => c.menuItem.id)).toEqual([db.menuItems[1].id]);
    });
  });

  describe('cancelling a dish that was already sent', () => {
    const sentTwo = () => {
      const table = seat();
      add(0, 'COURSE_1');
      add(1, 'COURSE_1');
      store().sendKOT();
      const order = store().selectedTableOrder!;
      return { table, order, first: order.items[0], second: order.items[1] };
    };

    it('needs a manager: a captain with no PIN, or a PIN that is not a manager\'s, is refused', async () => {
      const { first, order } = sentTwo();
      expect((await store().cancelDish(first.id, 'Guest changed mind'))).toMatchObject({ ok: false, error: expect.stringMatching(/manager must approve/i) });
      expect((await store().cancelDish(first.id, 'Guest changed mind', captainPin))).toMatchObject({ ok: false, error: expect.stringMatching(/not a manager/i) });
      expect(order.items[0].kitchenStatus).toBe('PREPARING');
    });

    it('with a manager\'s PIN and a reason: the dish is at no charge, cancelled on the order and on the ticket, and the bill drops', async () => {
      const { first, order: sent } = sentTwo();
      const before = sent.totalAmount;
      const price = first.totalPrice;

      const result = await store().cancelDish(first.id, 'Out of stock', managerPin);
      expect(result).toEqual({ ok: true });
      const order = store().selectedTableOrder!; // read again: the store holds the stored copy of the order

      expect(first).toMatchObject({ kitchenStatus: 'CANCELLED', cancelReason: 'Out of stock', totalPrice: 0, unitPrice: 0, statusRev: 1 });
      expect(order.subtotal).toBe(order.items[1].totalPrice);
      expect(order.totalAmount).toBeLessThan(before);
      expect(price).toBeGreaterThan(0);
      const ticketLine = db.kots.flatMap((k) => k.items).find((i) => i.orderItemId === first.id)!;
      expect(ticketLine.status).toBe('CANCELLED');
      expect(store().cartItems.find((c) => c.orderItemId === first.id)).toMatchObject({ status: 'CANCELLED', totalPrice: 0 });
      expect(order.syncStatus).toBe('SAVED_LOCALLY');
    });

    it('needs a reason', async () => {
      const { first } = sentTwo();
      expect(await store().cancelDish(first.id, ' ', managerPin)).toMatchObject({ ok: false, error: expect.stringMatching(/reason/i) });
    });

    it('a dish already served, or already cancelled, cannot be cancelled', async () => {
      const { first, second } = sentTwo();
      const kot = db.kots[0];
      KOTRepository.setItemStatus(kot.id, kot.items.find((i) => i.orderItemId === second.id)!.id, 'SERVED');
      expect(await store().cancelDish(second.id, 'Too late', managerPin)).toMatchObject({ ok: false });
      expect(await store().cancelDish(first.id, 'Out of stock', managerPin)).toEqual({ ok: true });
      expect(await store().cancelDish(first.id, 'Again', managerPin)).toMatchObject({ ok: false });
    });

    it('a manager who is signed in needs no PIN', async () => {
      store().logout();
      expect(await store().login(managerPin)).toBe(true);
      const { first } = sentTwo();
      expect(await store().cancelDish(first.id, 'Guest left')).toEqual({ ok: true });
    });

    it('cancelling every dish cancels the order and frees the table', async () => {
      const { table, first, second, order } = sentTwo();
      await store().cancelDish(first.id, 'Guest left', managerPin);
      await store().cancelDish(second.id, 'Guest left', managerPin);
      expect(db.orders.find((o) => o.id === order.id)!.orderStatus).toBe('CANCELLED');
      expect(db.tables.find((t) => t.tableNumber === table.tableNumber)!.status).toBe('AVAILABLE');
    });

    it('later dishes added to the table are priced without the cancelled one', async () => {
      const { first } = sentTwo();
      await store().cancelDish(first.id, 'Out of stock', managerPin);
      add(2, 'COURSE_1');
      store().sendKOT();
      const order = store().selectedTableOrder!;
      const live = order.items.filter((i) => i.kitchenStatus !== 'CANCELLED');
      expect(order.subtotal).toBe(live.reduce((n, i) => n + i.totalPrice, 0));
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

/**
 * BUG-032: after "Send KOT" the cart was untouched and not tied to the order
 * that was just created. Pressing Send KOT again created a second order and a
 * second kitchen ticket, and Pay then created a third order. Items added after
 * the first KOT were never added to the order that got paid.
 *
 * Target flow: the first Send KOT turns the cart into a *running order*;
 * only NEW items can be sent afterwards (as an add-on ticket on the same
 * order); Pay always settles that same running order.
 */
describe('POS running order — Send KOT then Pay (BUG-032)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    usePosStore.getState().clearCart();
    usePosStore.setState({ selectedTable: null, orderType: 'TAKEAWAY' });
  });

  const itemA = () => db.menuItems[0];
  const itemB = () => db.menuItems[1];

  it('a second Send KOT with nothing new creates no extra order and no extra ticket', () => {
    usePosStore.getState().addItemToCart(itemA());
    const first = usePosStore.getState().sendKOT();
    expect(first && first.length).toBeGreaterThan(0);

    const ordersAfterFirst = db.orders.length;
    const ticketsAfterFirst = db.kots.length;

    const second = usePosStore.getState().sendKOT();

    expect(second).toBeNull();
    expect(db.orders.length).toBe(ordersAfterFirst);
    expect(db.kots.length).toBe(ticketsAfterFirst);
  });

  it('items added after the first KOT go out as an add-on ticket on the same order', () => {
    usePosStore.getState().addItemToCart(itemA());
    usePosStore.getState().sendKOT();
    const ordersAfterFirst = db.orders.length;

    usePosStore.getState().addItemToCart(itemB());
    const addOn = usePosStore.getState().sendKOT();

    expect(addOn).not.toBeNull();
    const sentNames = (addOn || []).flatMap((k) => k.items.map((i) => i.name));
    expect(sentNames).toEqual([itemB().name]);
    expect(db.orders.length).toBe(ordersAfterFirst);
    expect(db.orders[0].items.map((i) => i.name).sort()).toEqual([itemA().name, itemB().name].sort());
  });

  it('paying after a KOT settles that same order, including add-on items', () => {
    usePosStore.getState().addItemToCart(itemA());
    usePosStore.getState().sendKOT();
    usePosStore.getState().addItemToCart(itemB());
    const total = usePosStore.getState().cart.totalPayable;
    const ordersBeforePay = db.orders.length;

    const paid = usePosStore.getState().completePayment('CASH', total, 'TXN-RUN-1');

    expect(paid).not.toBeNull();
    expect(db.orders.length).toBe(ordersBeforePay);
    expect(paid!.paymentStatus).toBe('SUCCESS');
    expect(paid!.items.map((i) => i.name).sort()).toEqual([itemA().name, itemB().name].sort());
    expect(paid!.totalAmount).toBe(total);
  });

  it('sending more of an item already sent only kitchen-tickets the extra quantity', () => {
    usePosStore.getState().addItemToCart(itemA());
    usePosStore.getState().sendKOT();
    usePosStore.getState().addItemToCart(itemA()); // quantity 1 -> 2

    const addOn = usePosStore.getState().sendKOT();

    expect(addOn).not.toBeNull();
    const line = (addOn || []).flatMap((k) => k.items)[0];
    expect(line.quantity).toBe(1);
    expect(db.orders[0].items[0].quantity).toBe(2);
  });

  it('a dine-in table order behaves the same: one order, add-on ticket, single settlement', () => {
    usePosStore.setState({ selectedTable: db.tables[0], orderType: 'DINE_IN' });
    usePosStore.getState().addItemToCart(itemA());
    usePosStore.getState().sendKOT();
    usePosStore.getState().addItemToCart(itemB());
    const addOn = usePosStore.getState().sendKOT();
    expect(addOn).not.toBeNull();
    const total = usePosStore.getState().cart.totalPayable;
    const ordersBeforePay = db.orders.length;

    const paid = usePosStore.getState().completePayment('CASH', total, 'TXN-RUN-2');

    expect(db.orders.length).toBe(ordersBeforePay);
    expect(paid!.items.length).toBe(2);
    expect(paid!.paymentStatus).toBe('SUCCESS');
  });
});

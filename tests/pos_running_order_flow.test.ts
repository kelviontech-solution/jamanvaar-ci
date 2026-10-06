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

  it('B2-019: roundOffAmount survives Send KOT and Pay, so subtotal + tax + round-off always equals the stored total', () => {
    // A price chosen so subtotal * 1.05 is not a whole rupee, guaranteeing a real, non-zero round-off.
    const category = db.categories[0];
    db.menuItems.push({
      id: 'menu-item-b2019-test',
      categoryId: category.id,
      name: 'Round-Off Test Dish',
      sku: 'B2019-01',
      taxGroupId: db.taxGroups.find(group => group.isActive)?.id,
      price: 111,
      dietaryType: 'VEG',
      spiceLevel: 'MILD',
      description: '',
      isAvailable: true
    } as any);

    db.taxGroups.forEach(group => { group.isInclusive = false; });
    usePosStore.getState().addItemToCart(db.menuItems.find((m) => m.id === 'menu-item-b2019-test')!);
    const cartRoundOff = usePosStore.getState().cart.roundOffAmount;
    expect(cartRoundOff).not.toBe(0); // sanity check: this price really does produce a non-zero round-off

    usePosStore.getState().sendKOT();
    const runningOrder = db.orders[0];
    // B2-019: this used to silently stay 0 here even though the cart already knew better.
    expect(runningOrder.roundOffAmount).toBe(cartRoundOff);

    const total = usePosStore.getState().cart.totalPayable;
    const paid = usePosStore.getState().completePayment('CASH', total, 'TXN-RUN-B2019');
    expect(paid).not.toBeNull();
    expect(paid!.roundOffAmount).toBe(cartRoundOff);

    // The identity the receipt's own arithmetic depends on: nothing left unaccounted for.
    const reconstructed = Math.round((paid!.subtotal + paid!.taxAmount + paid!.roundOffAmount) * 100) / 100;
    expect(reconstructed).toBe(paid!.totalAmount);

    db.menuItems = db.menuItems.filter((m) => m.id !== 'menu-item-b2019-test');
  });
});

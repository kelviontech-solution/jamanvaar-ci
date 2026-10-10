import { describe, it, expect } from 'vitest';
import type { KOTItem, KOTRecord } from '@jamanvaar/types';
import {
  allergyText, buildExpoBoard, connectionLevel, dishAllergy, effectiveItemStatus, orderProgress, prepMinutes, prepSummary, sortForKitchen, ticketAge
} from '../apps/restaurant-system/kds/src/kdsLogic';

const item = (id: string, name: string, status: KOTItem['status'] = 'PREPARING', extra: Partial<KOTItem> = {}): KOTItem => ({
  id, menuItemId: id, name, quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status, ...extra
});
const ticket = (id: string, items: KOTItem[], extra: Partial<KOTRecord> = {}): KOTRecord => ({
  id, kotNumber: `K-${id}`, orderId: 'o1', orderNumber: 'N1', tokenNumber: '101', orderType: 'DINE_IN', station: 'Main Kitchen', type: 'FIRST',
  items, cashierName: 'Kavya', createdAt: new Date(Date.now() - 60_000).toISOString(), printed: true, status: 'PREPARING', ...extra
} as KOTRecord);

describe('what the kitchen screen shows for a dish', () => {
  it('an older ticket marked ready shows its dishes ready, even though they were never set one by one', () => {
    const t = ticket('a', [item('x', 'Naan')], { status: 'READY' });
    expect(effectiveItemStatus(t, t.items[0])).toBe('READY');
  });

  it('a cancelled dish always shows cancelled, and a dish set on its own wins over a cooking ticket', () => {
    const t = ticket('a', [item('x', 'Naan', 'CANCELLED'), item('y', 'Dal', 'READY')], { status: 'READY' });
    expect(effectiveItemStatus(t, t.items[0])).toBe('CANCELLED');
    const cooking = ticket('b', [item('y', 'Dal', 'READY'), item('z', 'Rice')]);
    expect(effectiveItemStatus(cooking, cooking.items[0])).toBe('READY');
    expect(effectiveItemStatus(cooking, cooking.items[1])).toBe('PREPARING');
  });
});

describe('allergy and diet notes are never read past', () => {
  it('spots the words that matter and ignores ordinary requests', () => {
    expect(allergyText('Peanut allergy, please')).toBeTruthy();
    expect(allergyText('no onion no garlic (Jain)')).toBeTruthy();
    expect(allergyText('gluten free')).toBeTruthy();
    expect(allergyText('extra crispy')).toBeNull();
    expect(allergyText(undefined, '')).toBeNull();
  });

  it('checks the dish note and its modifiers', () => {
    expect(dishAllergy(item('a', 'Curry', 'PREPARING', { specialInstructions: 'nut allergy' }))).toBeTruthy();
    expect(dishAllergy(item('a', 'Curry', 'PREPARING', { modifiers: [{ groupId: 'g', optionId: 'o', optionName: 'No dairy', priceDelta: 0 }] as never }))).toBeTruthy();
    expect(dishAllergy(item('a', 'Curry'))).toBeNull();
  });
});

describe('how late a ticket is depends on how long its dishes should take', () => {
  it('starts a scheduled pickup clock at preparation time and preserves ordinary ticket timing', () => {
    const createdAt = '2026-10-10T06:00:00Z', pickupAt = '2026-10-11T06:00:00Z';
    const scheduled = ticket('pickup', [item('x', 'Meal')], { createdAt, pickupAt });
    expect(ticketAge(scheduled, Date.parse('2026-10-11T05:35:00Z'), 20)).toMatchObject({mins: 0, level: 'ok'});
    expect(ticketAge(scheduled, Date.parse(pickupAt), 20)).toMatchObject({mins: 20, level: 'warn'});
    expect(ticketAge(scheduled, Date.parse('2026-10-11T06:10:00Z'), 20).level).toBe('late');
    expect(ticketAge({...scheduled, pickupAt: undefined}, Date.parse(pickupAt), 20).level).toBe('late');
  });
  const at = (minsAgo: number) => ticket('t', [item('x', 'Biryani')], { createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString() });

  it('takes the longest prep time on the ticket, 10 minutes when the menu does not say, and keeps it sensible', () => {
    const t = ticket('t', [item('a', 'Salad'), item('b', 'Biryani')]);
    expect(prepMinutes(t, (id) => (id === 'a' ? 5 : 25))).toBe(25);
    expect(prepMinutes(t, () => undefined)).toBe(10);
    expect(prepMinutes(t, () => 1)).toBe(4);
    expect(prepMinutes(t, () => 500)).toBe(60);
  });

  it('is fine within the prep time, warns at it, and is late at one and a half times', () => {
    // One instant for both sides: reading the clock twice made a 30-minute-old ticket 29.99 minutes old under load.
    const now = Date.now();
    const ago = (m: number) => ticket('t', [item('x', 'Naan')], { createdAt: new Date(now - m * 60_000).toISOString() });
    expect(ticketAge(ago(5), now, 20).level).toBe('ok');
    expect(ticketAge(ago(20), now, 20).level).toBe('warn');
    expect(ticketAge(ago(29), now, 20).level).toBe('warn');
    expect(ticketAge(ago(30), now, 20).level).toBe('late');
    // A 5-minute dish is late far sooner than a 25-minute one.
    expect(ticketAge(ago(8), now, 5).level).toBe('late');
    expect(ticketAge(ago(8), now, 25).level).toBe('ok');
  });
});

describe('summaries for the cook', () => {
  it('sums the dishes still to cook across tickets and leaves out what is ready, served or cancelled', () => {
    const tickets = [
      ticket('a', [item('n', 'Butter Naan', 'PREPARING', { quantity: 2 }), item('p', 'Paneer', 'READY')]),
      ticket('b', [item('n', 'Butter Naan', 'PREPARING', { quantity: 3 }), item('d', 'Dal', 'CANCELLED')]),
      ticket('c', [item('z', 'Rice')], { status: 'SERVED' }),
      ticket('d', [item('z', 'Rice')], { status: 'CANCELLED' })
    ];
    expect(prepSummary(tickets)).toEqual([{ name: 'Butter Naan', qty: 5 }]);
  });

  it('shows how far a whole order is across every station\'s ticket', () => {
    const tandoor = ticket('t1', [item('a', 'Kebab', 'READY')]);
    const curry = ticket('t2', [item('b', 'Dal'), item('c', 'Rice', 'CANCELLED')]);
    const other = ticket('t3', [item('d', 'Soup')], { orderId: 'o2' });
    expect(orderProgress([tandoor, curry, other], 'o1')).toEqual({ ready: 1, total: 2, tickets: 2 });
  });

  it('puts cancelled tickets first, then cooking oldest first, then ready, then served', () => {
    const t = (id: string, status: KOTRecord['status'], minsAgo: number) => ticket(id, [item(id, id)], { status, createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString() });
    const order = sortForKitchen([t('ready', 'READY', 30), t('newer', 'PREPARING', 2), t('cancel', 'CANCELLED', 1), t('older', 'PREPARING', 9)]).map((k) => k.id);
    expect(order).toEqual(['cancel', 'older', 'newer', 'ready']);
  });
});

describe('the connection warning', () => {
  it('is fine while the server keeps answering, slow after a few silent seconds, lost after half a minute', () => {
    expect(connectionLevel(2000, true, 60000)).toBe('ok');
    expect(connectionLevel(20000, true, 60000)).toBe('slow');
    expect(connectionLevel(45000, true, 60000)).toBe('lost');
  });

  it('is lost the moment the browser says it is offline, and gives a fresh start a moment to connect', () => {
    expect(connectionLevel(1000, false, 60000)).toBe('lost');
    expect(connectionLevel(null, true, 5000)).toBe('ok');
    expect(connectionLevel(null, true, 20000)).toBe('lost');
  });
});

describe('the pass (expo): one row per order, across every station', () => {
  const now = Date.now();
  const at = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  const noTargets = () => undefined;

  it('brings the tickets of one table from two stations together and says which station is holding it up', () => {
    const kitchen = ticket('k', [item('a', 'Paneer', 'READY'), item('b', 'Dal', 'PREPARING')], { createdAt: at(6), tableNumber: '4' });
    const bar = ticket('b', [item('c', 'Lassi', 'PREPARING', { kitchenStation: 'Beverages Bar' })], { createdAt: at(5), station: 'Beverages Bar', tableNumber: '4' });
    const [order] = buildExpoBoard([kitchen, bar], now, noTargets);
    expect(order).toMatchObject({ tableNumber: '4', total: 3, ready: 1, served: 0, allReady: false });
    expect(order.waitingOn).toEqual([{ station: 'Main Kitchen', dishes: ['Dal'] }, { station: 'Beverages Bar', dishes: ['Lassi'] }]);
    expect(order.ticketIds.sort()).toEqual(['b', 'k']);
    expect(order.age.mins).toBe(6);
  });

  it('marks an order that can go out now, puts it first, and drops orders that are fully served or cancelled', () => {
    const cooking = ticket('c1', [item('a', 'Dal', 'PREPARING')], { orderId: 'o-cook', createdAt: at(20) });
    const done = ticket('c2', [item('b', 'Naan', 'READY'), item('c', 'Rice', 'SERVED')], { orderId: 'o-done', createdAt: at(3) });
    const served = ticket('c3', [item('d', 'Tea')], { orderId: 'o-served', status: 'SERVED', createdAt: at(30) });
    const cancelled = ticket('c4', [item('e', 'Soup', 'CANCELLED')], { orderId: 'o-gone', status: 'CANCELLED' });
    const board = buildExpoBoard([cooking, done, served, cancelled], now, noTargets);
    expect(board.map((o) => o.orderId)).toEqual(['o-done', 'o-cook']);
    expect(board[0]).toMatchObject({ allReady: true, ready: 1, served: 1 });
    expect(board[1].age.level).toBe('late');
  });

  it('a cancelled dish is not counted, so the order can go out without it', () => {
    const t = ticket('x', [item('a', 'Dal', 'READY'), item('b', 'Soup', 'CANCELLED')], { orderId: 'o1' });
    expect(buildExpoBoard([t], now, noTargets)[0]).toMatchObject({ total: 1, allReady: true });
  });
});

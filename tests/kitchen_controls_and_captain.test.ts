import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, setKitchenPriority, compareKitchenPriority, announceBillRequests, resetBillAnnouncementsForTests, NotificationRepository } from '@jamanvaar/database';
import type { KOTRecord, Order } from '@jamanvaar/types';
import { matchesKitchenSearch, sortForKitchen, buildExpoBoard } from '../apps/restaurant-system/kds/src/kdsLogic';
import { currentTableKots, matchesCaptainDiet, matchesCaptainTicket } from '../apps/restaurant-system/captain/src/captainWorkflow';
import { buildThermalKotTicketHtml } from '../packages/ui/src/ThermalReceiptView';
import { mergeKitchenPriority } from '../cloud/api/src/modules/order-sync/kitchen-priority';
import { SyncOutboxEngine } from '../packages/sync/src/outbox';

const ticket = (id: string, minutes: number, status: KOTRecord['status'] = 'PREPARING'): KOTRecord => ({
  id, orderId: id, kotNumber: `KOT-${id}`, orderNumber: `ORDER-${id}`, tokenNumber: id,
  tableNumber: 'TN6', orderType: 'DINE_IN', station: 'Main Kitchen', type: 'FIRST', cashierName: 'QA',
  createdAt: new Date(Date.now() - minutes * 60000).toISOString(), printed: true, status,
  items: [{ id: 'line-'+id, menuItemId: 'coffee', name: 'Cold Coffee', quantity: 2, modifiers: [], status, kitchenStation: 'Main Kitchen' }]
});
const changed = { kitchenPriority: 'URGENT', kitchenPriorityRev: 2, kitchenPriorityChangeId: 'b0000000-0000-4000-8000-000000000000' };
const merge = (prior: Record<string, unknown>, incoming: Record<string, unknown>, role = 'KDS') => {
  const merged = { ...prior, ...incoming }; mergeKitchenPriority(prior, incoming, merged, role); return merged;
};

describe('kitchen urgency is an operational change, not a financial mutation', () => {
  beforeEach(() => { db.orders = []; db.kots = []; });
  it('persists urgency, increments revision, queues a push and keeps money/status/items unchanged', () => {
    const order = { id: 'a', orderStatus: 'CONFIRMED', paymentStatus: 'PENDING', totalAmount: 250, items: [{ id: 'x', kitchenStatus: 'PREPARING' }], syncStatus: 'SYNCED' } as Order;
    db.orders.push(order); db.kots.push(ticket('a', 1));
    expect(setKitchenPriority('a', 'URGENT')).toBe(true);
    expect(order).toMatchObject({ kitchenPriority: 'URGENT', kitchenPriorityRev: 1, syncStatus: 'SAVED_LOCALLY', totalAmount: 250, orderStatus: 'CONFIRMED', paymentStatus: 'PENDING', items: [{ id: 'x', kitchenStatus: 'PREPARING' }] });
    expect(order.kitchenPriorityChangeId).toMatch(/^[a-f0-9-]{36}$/i);
    expect(setKitchenPriority('a', 'URGENT')).toBe(false);
    expect(setKitchenPriority('a', 'NORMAL')).toBe(true);
    expect(order.kitchenPriorityRev).toBe(2);
    db.kots[0].status = 'SERVED'; expect(setKitchenPriority('a', 'URGENT')).toBe(false);
  });
  it('rejects missing, cancelled and refunded orders', () => {
    expect(setKitchenPriority('missing', 'URGENT')).toBe(false);
    for (const status of ['CANCELLED', 'REFUNDED']) { db.orders = [{ id: 'a', orderStatus: status } as Order]; db.kots = [ticket('a', 1)]; expect(setKitchenPriority('a', 'URGENT')).toBe(false); }
  });
  it('promotes urgency within cooking, preserves cancellation alerts and offers original FIFO', () => {
    const kots = [ticket('old', 9), ticket('urgent', 1), ticket('cancel', 2, 'CANCELLED'), ticket('ready', 10, 'READY')];
    expect(sortForKitchen(kots, id => id === 'urgent' ? 'URGENT' : undefined).map(k => k.id)).toEqual(['cancel', 'urgent', 'old', 'ready']);
    expect(sortForKitchen(kots).map(k => k.id)).toEqual(['cancel', 'old', 'urgent', 'ready']);
    expect(buildExpoBoard(kots, Date.now(), () => 10, id => id === 'urgent' ? 'URGENT' : undefined).map(o => o.orderId)).toEqual(['ready', 'urgent', 'old']);
  });
  it('matches token/table/KOT/dish without filtering or mutating the underlying tickets', () => {
    const kot = ticket('K-108', 1);
    for (const term of [' #k-108 ', 'tn6', 'kot-k-108', 'cold coffee', '']) {
      expect(matchesKitchenSearch(kot, term)).toBe(true); expect(matchesCaptainTicket(kot, term)).toBe(true);
    }
    expect(matchesKitchenSearch(kot, 'not found')).toBe(false);
    expect(matchesKitchenSearch(kot, '#108')).toBe(false);
    expect(matchesCaptainTicket(kot, '#108')).toBe(false);
  });
});

describe('priority metadata resists stale writes and customer-controlled changes', () => {
  it('only KDS/POS/admin can change priority; a kiosk or Captain cannot forge it', () => {
    for (const role of ['KIOSK', 'CAPTAIN', 'UNKNOWN']) expect(merge({}, changed, role)).toEqual({});
    for (const role of ['KDS', 'POS', 'POS_ADMIN']) expect(merge({}, changed, role)).toEqual(changed);
  });
  it('preserves priority on stale snapshots, accepts deliberate clearing and converges concurrent edits', () => {
    const stale = { ...changed, kitchenPriority: 'NORMAL', kitchenPriorityRev: 1 };
    expect(merge(changed, stale)).toEqual(changed);
    const clear = { ...changed, kitchenPriority: 'NORMAL', kitchenPriorityRev: 3 };
    expect(merge(changed, clear)).toEqual(clear);
    const concurrent = { ...changed, kitchenPriority: 'NORMAL', kitchenPriorityChangeId: 'c0000000-0000-4000-8000-000000000000' };
    expect(merge(changed, concurrent)).toEqual(concurrent); expect(merge(concurrent, changed)).toEqual(concurrent);
    expect(compareKitchenPriority(concurrent as never, changed as never)).toBeGreaterThan(0);
    expect(merge(changed, { ...changed, kitchenPriority: 'NORMAL' })).toEqual(changed);
  });
});

describe('Captain filters use the current dining session', () => {
  afterEach(() => SyncOutboxEngine.configureTransport(null));
  it('bill collection alerts reach the counter and admin without obstructing kitchen screens', () => {
    db.notifications = []; resetBillAnnouncementsForTests();
    db.orders = [{ id: 'bill-scope', billRequestedAt: new Date().toISOString(), paymentStatus: 'PENDING', orderStatus: 'PREPARING', totalAmount: 250, items: [] } as unknown as Order];
    expect(announceBillRequests()).toBe(1);
    expect(NotificationRepository.getNotifications('POS')).toHaveLength(1);
    expect(NotificationRepository.getNotifications('POS_ADMIN')).toHaveLength(1);
    expect(NotificationRepository.getNotifications('KDS')).toHaveLength(0);
    expect(NotificationRepository.getNotifications('CAPTAIN')).toHaveLength(0);
  });
  it('a cloud table transfer updates existing KOT destinations without changing ticket identity or creating duplicates', async () => {
    const kot = ticket('transfer', 1); kot.items[0].orderItemId = 'line-transfer';
    const originalId = kot.id, originalNumber = kot.kotNumber;
    db.orders = [{ id: 'transfer', orderNumber: 'ORDER-transfer', tokenNumber: 'transfer', tableNumber: 'TN6', items: [{ id: 'line-transfer', menuItemId: 'coffee', name: 'Cold Coffee', quantity: 2, unitPrice: 120, totalPrice: 240, kitchenStatus: 'PREPARING', modifiers: [] }], totalAmount: 240, subtotal: 240, taxAmount: 0, discountAmount: 0, orderStatus: 'CONFIRMED', paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER', updatedAt: new Date(0).toISOString(), syncStatus: 'SYNCED' } as Order];
    db.kots = [kot];
    SyncOutboxEngine.configureTransport({ async push() { return { results: [], serverTime: new Date().toISOString() }; }, async pull() { return { serverTime: new Date().toISOString(), orders: [{ externalOrderId: 'transfer', idempotencyKey: 'qa-transfer', status: 'CONFIRMED', orderType: 'DINE_IN', tableLabel: 'TN9', paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER', subtotal: 24000, totalAmount: 24000, taxAmount: 0, discountAmount: 0, seq: 2, updatedAt: new Date().toISOString(), items: [{ externalItemId: 'line-transfer', menuItemId: 'coffee', name: 'Cold Coffee', quantity: 2, unitPrice: 12000, lineTotal: 24000, kitchenStatus: 'PREPARING' }] }] }; } });
    await SyncOutboxEngine.catchUpFromCloud();
    expect(db.orders[0].tableNumber).toBe('TN9'); expect(db.kots).toHaveLength(1);
    expect(db.kots[0]).toMatchObject({ id: originalId, kotNumber: originalNumber, tableNumber: 'TN9', status: 'PREPARING' });
  });
  it('does not show an old ready ticket for a table reused with a new order', () => {
    const previous = ticket('old', 20, 'READY'), current = ticket('new', 1);
    expect(currentTableKots({ currentOrderId: 'new' }, [previous, current])).toEqual([current]);
    expect(currentTableKots({}, [previous, current])).toEqual([]);
  });
  it('Jain filters match Jain dishes, and Veg includes Jain/Vegan without including chicken', () => {
    expect(matchesCaptainDiet({ dietaryType: 'JAIN' }, 'JAIN')).toBe(true);
    expect(matchesCaptainDiet({ dietaryType: 'VEG' }, 'JAIN')).toBe(false);
    expect(matchesCaptainDiet({ dietaryType: 'VEGAN' }, 'VEG')).toBe(true);
    expect(matchesCaptainDiet({ dietaryType: 'NON_VEG' }, 'VEG')).toBe(false);
  });
});

describe('a KOT copy can never become a new kitchen order', () => {
  it('includes cancellation, modifiers, seat/course and allergies while escaping restaurant data', () => {
    const kot = ticket('K-108', 1, 'CANCELLED'); kot.orderNotes = '<script>alert(1)</script>';
    Object.assign(kot.items[0], { name: 'Coffee <img onerror=alert(1)>', specialInstructions: 'ALLERGY: no nuts & dairy', seat: 2, course: 'COURSE_1', modifiers: [{ optionName: 'No sugar' }] });
    const snapshot = JSON.stringify(kot), html = buildThermalKotTicketHtml(kot, '58mm', { reprint: true });
    expect(html).toContain('REPRINT'); expect(html).toContain('EXISTING KOT COPY'); expect(html).toContain('CANCELLED');
    expect(html).toContain('No sugar'); expect(html).toContain('Seat 2'); expect(html).toContain('COURSE_1');
    expect(html).toContain('ALLERGY: no nuts &amp; dairy'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).not.toContain('<img onerror');
    expect(html).toContain('58mm'); expect(JSON.stringify(kot)).toBe(snapshot);
  });
});

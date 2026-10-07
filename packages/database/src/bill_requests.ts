import type { DiningTable, Order } from '@jamanvaar/types';
import { db } from './db';
import { isUnpaidOpenOrder, NotificationRepository } from './repositories';
import { billRequestNotification } from './service_messages';

/**
 * A guest's request for the bill belongs to the order it is for. Captain sets `billRequestedAt` on the order,
 * the order syncs like any other change, and every other screen derives what it shows from that one field:
 * the table's "Bill requested" state (projectTableBillState) and the counter's notification (announceBillRequests).
 * Nothing else writes those, so there is no separate table flag or message to fall out of step.
 */

/** A request older than this is history, not a new call for the counter. */
export const BILL_REQUEST_FRESH_MS = 12 * 60 * 60 * 1000;

/** Window event fired once for each newly raised bill request. */
export const BILL_REQUESTED_EVENT = 'jamanvaar:bill-requested';

/** Request ids already announced in this session, so a re-pull never raises the same bill twice. */
const announced = new Set<string>();

/** A dine-in order the guest asked to settle and that is still unpaid. */
export function isBillWaiting(order: Order | undefined | null): order is Order {
  return !!order && !!order.billRequestedAt && isUnpaidOpenOrder(order);
}

/** The bills the counter should settle now, oldest request first. */
export function billsWaiting(orders: Order[] = db.orders): Order[] {
  return orders.filter(isBillWaiting).sort((a, b) => (a.billRequestedAt! < b.billRequestedAt! ? -1 : 1));
}

/** The lines a counter prints for a bill: "2× Paneer Tikka, 1× Naan". */
export function billLinesOf(order: Pick<Order, 'items'>): string {
  return order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
}

/**
 * A table reads "Bill requested" while its current order is waiting for payment. When the order is no longer waiting
 * (paid, cancelled, or the request was withdrawn) a table that still shows it goes back to Occupied. A table whose order
 * has not arrived on this device yet keeps its status until it does.
 */
export function projectTableBillState(table: DiningTable, orders: Order[] = db.orders): void {
  if (!table.currentOrderId) {
    if (table.status === 'BILL_REQUESTED') table.status = 'AVAILABLE';
    return;
  }
  const order = orders.find((o) => o.id === table.currentOrderId);
  if (!order) return;
  if (isBillWaiting(order)) table.status = 'BILL_REQUESTED';
  else if (table.status === 'BILL_REQUESTED') table.status = 'OCCUPIED';
}

/** Raises one notification per bill request, keyed by the order and when it was asked for. Returns how many were raised. */
export function announceBillRequests(now: number = Date.now(), orders: Order[] = db.orders): number {
  let raised = 0;
  for (const order of billsWaiting(orders)) {
    const requestedMs = Date.parse(order.billRequestedAt!);
    if (Number.isNaN(requestedMs) || now - requestedMs > BILL_REQUEST_FRESH_MS) continue;
    const requestId = `${order.id}-${order.billRequestedAt}`;
    if (announced.has(requestId)) continue;
    announced.add(requestId);
    NotificationRepository.createNotification(
      billRequestNotification({
        requestId,
        tableNumber: order.tableNumber,
        senderName: order.captainName || 'Captain',
        billAmount: order.totalAmount,
        billLines: billLinesOf(order),
        orderId: order.id,
        splitNote: order.billSplitNote,
        createdAt: order.billRequestedAt,
        targetRoles: ['POS', 'POS_ADMIN']
      })
    );
    raised++;
    // Lets a screen that wants a sound or a flash for a new bill react, without this module knowing about screens.
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BILL_REQUESTED_EVENT, { detail: { orderId: order.id, tableNumber: order.tableNumber } }));
  }
  return raised;
}

/** Brings every table's state and the bill notifications in line with the orders this device holds. Safe to run repeatedly. */
export function refreshBillState(): void {
  db.tables.forEach((t) => projectTableBillState(t));
  announceBillRequests();
  settleBillNotifications();
}

/** A bill notification says "to pay" only while the bill is still waiting. Once it is paid or withdrawn it reads as settled. */
export function settleBillNotifications(orders: Order[] = db.orders): void {
  for (const n of db.notifications) {
    const orderId = n.meta?.orderId as string | undefined;
    if (n.type !== 'BILL_REQUESTED' || !orderId || n.meta?.settled === true) continue;
    const order = orders.find((o) => o.id === orderId);
    if (!order || isBillWaiting(order)) continue;
    n.meta = { ...n.meta, settled: true };
    n.title = n.title.replace(' to pay', '') + ' · settled';
    n.isRead = true;
  }
}

/** Test helper: forget which requests were already announced in this session. */
export function resetBillAnnouncementsForTests(): void {
  announced.clear();
}

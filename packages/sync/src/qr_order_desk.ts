import { db, KOTRepository, OrderRepository } from '@jamanvaar/database';
import type { KOTRecord, Order } from '@jamanvaar/types';
import { SyncOutboxEngine } from './outbox';

/**
 * How a QR order is taken at the counter. A guest's order is not a special object: it is an ordinary order that
 * arrived with source QR and status NEW. What is special is that several POS terminals can see it, and exactly one
 * must accept it and print its kitchen ticket. Accepting is a claim recorded on the order itself; the first claim
 * to reach the server (or Branch Core) wins for every device, and a terminal that lost the claim prints nothing.
 */
export type AcceptResult =
  | { status: 'ACCEPTED'; printed: number }
  | { status: 'ALREADY_ACCEPTED'; by?: string }
  | { status: 'NOT_PENDING' }
  | { status: 'NOT_FOUND' };

export interface DeskOptions {
  /** This terminal's own device id: the identity a claim is recorded under. */
  deviceId: string;
  actor: string;
  /** Sends one ticket to the kitchen printer. Not called when this terminal lost the claim. */
  print: (kot: KOTRecord) => void | Promise<void>;
}

export class QrOrderDesk {
  /** QR orders waiting for a terminal to accept them. */
  static pending(): Order[] {
    return db.orders.filter((o) => o.source_type === 'QR_TABLE' && o.orderStatus === 'NEW');
  }

  static async accept(orderId: string, opts: DeskOptions): Promise<AcceptResult> {
    const order = db.orders.find((o) => o.id === orderId && o.source_type === 'QR_TABLE');
    if (!order) return { status: 'NOT_FOUND' };
    if (order.acceptedByDeviceId && order.acceptedByDeviceId !== opts.deviceId) return { status: 'ALREADY_ACCEPTED', by: order.acceptedByDeviceId };
    if (order.orderStatus !== 'NEW' && order.acceptedByDeviceId !== opts.deviceId) return { status: 'NOT_PENDING' };

    if (order.orderStatus === 'NEW') {
      order.acceptedByDeviceId = opts.deviceId;
      OrderRepository.updateOrderStatus(order.id, 'PREPARING', opts.actor);
    }

    // Let the server settle who claimed first before anything is printed. Unreachable servers do not block the
    // counter: a terminal working alone owns the order it accepted.
    try {
      await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
      await SyncOutboxEngine.catchUpFromCloud();
    } catch {
      // offline: the claim is pushed later
    }

    const settled = db.orders.find((o) => o.id === orderId);
    if (!settled || (settled.acceptedByDeviceId && settled.acceptedByDeviceId !== opts.deviceId)) {
      return { status: 'ALREADY_ACCEPTED', by: settled?.acceptedByDeviceId };
    }

    let printed = 0;
    for (const kot of KOTRepository.getKOTsForOrder(orderId)) {
      if ((kot as KOTRecord & { printedByDeviceId?: string }).printedByDeviceId) continue;
      await opts.print(kot);
      (kot as KOTRecord & { printedByDeviceId?: string }).printedByDeviceId = opts.deviceId;
      printed++;
    }
    db.notify();
    return { status: 'ACCEPTED', printed };
  }

  /** Declines a pending QR order (nothing is printed; the guest sees it cancelled). */
  static async reject(orderId: string, opts: { deviceId: string; actor: string; reason?: string }): Promise<AcceptResult | { status: 'REJECTED' }> {
    const order = db.orders.find((o) => o.id === orderId && o.source_type === 'QR_TABLE');
    if (!order) return { status: 'NOT_FOUND' };
    if (order.orderStatus !== 'NEW') return order.acceptedByDeviceId ? { status: 'ALREADY_ACCEPTED', by: order.acceptedByDeviceId } : { status: 'NOT_PENDING' };
    order.acceptedByDeviceId = opts.deviceId;
    OrderRepository.updateOrderStatus(order.id, 'CANCELLED', opts.actor);
    if (opts.reason) order.customerNotes = [order.customerNotes, `Declined: ${opts.reason}`].filter(Boolean).join(' | ');
    try {
      await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    } catch {
      // offline: pushed later
    }
    return { status: 'REJECTED' };
  }
}

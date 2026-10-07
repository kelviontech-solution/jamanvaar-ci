import { db } from './db';
import type { Order } from '@jamanvaar/types';
import { generateUUID } from '@jamanvaar/utils';

type PriorityState = Pick<Order, 'kitchenPriority' | 'kitchenPriorityRev' | 'kitchenPriorityChangeId'>;

/** Revisions beat stale device snapshots. Concurrent edits converge on the same change id. */
export function compareKitchenPriority(a: PriorityState, b: PriorityState): number {
  const revision = (a.kitchenPriorityRev || 0) - (b.kitchenPriorityRev || 0);
  const left = (a.kitchenPriorityChangeId || '').toLowerCase(), right = (b.kitchenPriorityChangeId || '').toLowerCase();
  return revision || (left === right ? 0 : left > right ? 1 : -1);
}

export function setKitchenPriority(orderId: string, priority: 'NORMAL' | 'URGENT'): boolean {
  const order = db.orders.find(o => o.id === orderId);
  if (!order || order.orderStatus === 'CANCELLED' || order.orderStatus === 'REFUNDED') return false;
  const tickets = db.kots.filter(k => k.orderId === orderId);
  if (!tickets.some(k => k.status !== 'CANCELLED' && k.status !== 'SERVED')) return false;
  if ((order.kitchenPriority || 'NORMAL') === priority) return false;
  order.kitchenPriority = priority;
  order.kitchenPriorityRev = (order.kitchenPriorityRev || 0) + 1;
  order.kitchenPriorityChangeId = generateUUID();
  order.updatedAt = new Date().toISOString();
  order.syncStatus = 'SAVED_LOCALLY';
  order.isSynced = false;
  db.notify();
  return true;
}

/**
 * Item-level merge for an order that more than one device writes to (POS adds, Captain adds, KDS
 * advances kitchen status). Each item remembers which device first added it (`originDeviceId`):
 *  - a device's push is authoritative for the items it originated (so its removals are honoured);
 *  - items other devices added are kept unless that device removes them;
 *  - kitchen progress only moves forward, so a delayed push can never un-ready a dish.
 */

export interface MergeableItem {
  externalItemId: string;
  kitchenStatus?: string;
  /** Raised by an undo or a cancellation; a higher revision replaces a lower one even when it moves the status backwards. */
  statusRev?: number;
  originDeviceId?: string;
  [key: string]: unknown;
}

const KITCHEN_RANK: Record<string, number> = {
  PENDING: 0, NEW: 0, QUEUED: 0,
  PREPARING: 1, COOKING: 1,
  READY: 2,
  SERVED: 3, COMPLETED: 3, DELIVERED: 3,
  CANCELLED: 4, VOID: 4, VOIDED: 4
};

export function kitchenStatusRank(status: string | undefined): number {
  return status ? (KITCHEN_RANK[status.toUpperCase()] ?? 0) : 0;
}

export function mergeOrderItems<T extends MergeableItem>(
  existing: T[] | undefined,
  incoming: T[],
  deviceId: string
): { items: T[]; foreignItemsKept: boolean } {
  const prior = existing ?? [];
  const incomingIds = new Set(incoming.map((i) => i.externalItemId));
  const priorById = new Map(prior.map((i) => [i.externalItemId, i]));

  const merged: T[] = incoming.map((inc) => {
    const old = priorById.get(inc.externalItemId);
    // Revision first (a recall beats an older copy), then forward-only by rank.
    const oldRev = old?.statusRev ?? 0;
    const incRev = inc.statusRev ?? 0;
    const keepOld = !!old && (oldRev > incRev || (oldRev === incRev && kitchenStatusRank(old.kitchenStatus) > kitchenStatusRank(inc.kitchenStatus)));
    const status = keepOld ? old!.kitchenStatus : inc.kitchenStatus;
    const statusRev = Math.max(oldRev, incRev);
    // The ordered-with configuration is written once, when the order is created, and outlives every later push.
    const kept: Record<string, unknown> = {};
    if (old?.snapshot && !inc.snapshot) kept.snapshot = old.snapshot;
    if (old?.modifierDetails && !inc.modifierDetails) kept.modifierDetails = old.modifierDetails;
    // A copy that lost on revision must not carry its own price or cancellation details onto the winner.
    if (keepOld && old) {
      if (old.cancelReason !== undefined) kept.cancelReason = old.cancelReason;
      if (old.lineTotal !== undefined && old.kitchenStatus === 'CANCELLED') { kept.lineTotal = old.lineTotal; kept.unitPrice = old.unitPrice; }
    }
    return { ...inc, ...kept, kitchenStatus: status, ...(statusRev > 0 ? { statusRev } : {}), originDeviceId: old?.originDeviceId ?? deviceId };
  });

  let foreignItemsKept = false;
  for (const old of prior) {
    if (incomingIds.has(old.externalItemId)) continue;
    // Absent from this push: only the device that added it may remove it.
    if (old.originDeviceId && old.originDeviceId !== deviceId) {
      merged.push(old);
      foreignItemsKept = true;
    } else if (!old.originDeviceId && prior.length > 0 && incoming.length === 0) {
      merged.push(old); // legacy item with no owner: never drop everything on an empty push
    }
  }
  return { items: merged, foreignItemsKept };
}

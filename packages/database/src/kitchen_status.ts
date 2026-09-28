/**
 * How the kitchen status of one dish is merged when two copies disagree. The same rule runs on every device and on the
 * server (cloud/api order-merge.ts):
 *  - progress only moves forward: PENDING < PREPARING < READY < SERVED < CANCELLED;
 *  - a deliberate step backwards (a recall) carries a higher revision and beats any copy with a lower one;
 *  - at equal revisions the further-along status wins.
 */
export type KitchenStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

const RANK: Record<string, number> = {
  PENDING: 0, NEW: 0, QUEUED: 0, ACCEPTED: 0,
  PREPARING: 1, COOKING: 1,
  READY: 2,
  SERVED: 3, COMPLETED: 3, DELIVERED: 3,
  CANCELLED: 4, VOID: 4, VOIDED: 4
};

export function kitchenRank(status: string | undefined | null): number {
  return status ? (RANK[status.toUpperCase()] ?? 0) : 0;
}

export interface KitchenState {
  status?: string | null;
  rev?: number | null;
}

/** Which of two copies of a dish's kitchen state stands. Ties go to `remote`, so applying the same copy twice changes nothing. */
export function resolveKitchenState(local: KitchenState, remote: KitchenState): { status: string | undefined; rev: number } {
  const lr = local.rev ?? 0;
  const rr = remote.rev ?? 0;
  if (rr > lr) return { status: remote.status ?? local.status ?? undefined, rev: rr };
  if (rr < lr) return { status: local.status ?? remote.status ?? undefined, rev: lr };
  if (!remote.status) return { status: local.status ?? undefined, rev: lr };
  if (!local.status) return { status: remote.status, rev: rr };
  return { status: kitchenRank(remote.status) >= kitchenRank(local.status) ? remote.status : local.status, rev: lr };
}

/**
 * The status of a whole ticket from its dishes. Cancelled dishes do not count; a ticket with nothing left to cook is
 * CANCELLED. Returns null for a ticket with no dishes.
 */
export function deriveTicketStatus(itemStatuses: Array<string | undefined | null>): 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED' | null {
  if (itemStatuses.length === 0) return null;
  const live = itemStatuses.filter((s) => kitchenRank(s) < 4);
  if (live.length === 0) return 'CANCELLED';
  if (live.every((s) => kitchenRank(s) >= 3)) return 'SERVED';
  if (live.every((s) => kitchenRank(s) >= 2)) return 'READY';
  return 'PREPARING';
}

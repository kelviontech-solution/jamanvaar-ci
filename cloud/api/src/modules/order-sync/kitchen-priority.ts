const FIELDS = ['kitchenPriority', 'kitchenPriorityRev', 'kitchenPriorityChangeId'] as const;
const WRITERS = new Set(['KDS', 'POS', 'POS_ADMIN']);

/** Only kitchen/counter devices can change urgency. Stale snapshots cannot undo a deliberate priority change. */
export function mergeKitchenPriority(prior: Record<string, unknown>, incoming: Record<string, unknown>, merged: Record<string, unknown>, deviceType: string): void {
  const hasChange = FIELDS.some(k => incoming[k] !== undefined);
  if (!hasChange) return;
  const rev = Number(incoming.kitchenPriorityRev || 0), before = Number(prior.kitchenPriorityRev || 0);
  const change = String(incoming.kitchenPriorityChangeId || '').toLowerCase(), oldChange = String(prior.kitchenPriorityChangeId || '').toLowerCase();
  const accept = WRITERS.has(deviceType) && ['NORMAL', 'URGENT'].includes(String(incoming.kitchenPriority)) && rev > 0 && !!change &&
    (rev > before || (rev === before && change > oldChange));
  if (accept) return;
  for (const key of FIELDS) {
    if (prior[key] === undefined) delete merged[key];
    else merged[key] = prior[key];
  }
}

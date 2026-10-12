/**
 * db.orders holds a restaurant's entire local order history in memory for the lifetime of the app
 * (every write path either rebuilds it in full or unshifts one new order — nothing ever evicts an
 * old one). ReportDataEngine.getOrders (apps/restaurant-system/pos-admin) now stops scanning once
 * it passes a report's date window, but a report that genuinely asks for a wide range, or any other
 * future consumer that doesn't take the same care, still pays for however large this array has
 * grown. This is deliberately NOT a fix — archiving old orders out of the hot array is a real
 * design change (every consumer of db.orders would need to agree on what "old" means and where
 * archived data lives) that hasn't been scoped yet. This only gives visibility before that becomes
 * a silent problem, by warning once per threshold crossing rather than staying silent forever.
 */
const ORDER_HISTORY_WARNING_THRESHOLDS = [10_000, 50_000, 100_000, 250_000, 500_000] as const;

/** Which threshold (if any) `count` has just crossed, given it was `previousCount` before this
 * write. Returns the threshold itself (not a boolean) so the warning can say which one, and only
 * the first threshold crossed in one step — multiple orders are never created in a single write
 * here, but a caller that batches shouldn't get more than one warning per call either. */
export function crossedOrderHistoryThreshold(previousCount: number, count: number): number | null {
  for (const threshold of ORDER_HISTORY_WARNING_THRESHOLDS) {
    if (previousCount < threshold && count >= threshold) return threshold;
  }
  return null;
}

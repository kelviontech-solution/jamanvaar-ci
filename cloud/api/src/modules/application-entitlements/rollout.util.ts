/**
 * Super Admin feature request: feature-flag percentage rollout. Feature Catalog could only flip a
 * feature fully on or fully off for every restaurant at once -- no way to soft-launch something
 * risky to, say, 10% of restaurants before going platform-wide. Deterministic: the same restaurant
 * always lands on the same side of the line for a given percentage (no flapping between checks),
 * via a simple string hash rather than storing a per-restaurant assignment row.
 */
export function isRestaurantInRollout(restaurantId: string, rolloutPercent: number): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  let hash = 0;
  for (let i = 0; i < restaurantId.length; i++) {
    hash = (hash * 31 + restaurantId.charCodeAt(i)) >>> 0;
  }
  return hash % 100 < rolloutPercent;
}

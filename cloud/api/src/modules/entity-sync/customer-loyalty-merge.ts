// The browser and API merge rules are verified together in crm_loyalty_checkout.test.ts.
export interface CustomerAccount {
  phone: string;
  loyaltyPoints: number;
  totalSpend?: number;
  totalVisits?: number;
  recentOrderIds: string[];
  updatedAt?: string;
  loyaltyBaseline?: { points: number; spend: number; visits: number };
  loyaltyLedger?: Record<string, { points: number; spend: number; visits: number; at: string }>;
  [key: string]: unknown;
}

/** A balance is an opening amount plus uniquely keyed events, never a last-writer-wins counter. */
export function initializeLoyaltyLedger(account: CustomerAccount): void {
  account.loyaltyLedger ??= {};
  account.loyaltyBaseline ??= {
    points: account.loyaltyPoints - Object.values(account.loyaltyLedger).reduce((sum, e) => sum + e.points, 0),
    spend: (account.totalSpend ?? 0) - Object.values(account.loyaltyLedger).reduce((sum, e) => sum + e.spend, 0),
    visits: (account.totalVisits ?? 0) - Object.values(account.loyaltyLedger).reduce((sum, e) => sum + e.visits, 0)
  };
}

export function refreshLoyaltyBalance(account: CustomerAccount): void {
  initializeLoyaltyLedger(account);
  const entries = Object.values(account.loyaltyLedger!);
  account.loyaltyPoints = account.loyaltyBaseline!.points + entries.reduce((sum, e) => sum + e.points, 0);
  account.totalSpend = Number((account.loyaltyBaseline!.spend + entries.reduce((sum, e) => sum + e.spend, 0)).toFixed(2));
  account.totalVisits = account.loyaltyBaseline!.visits + entries.reduce((sum, e) => sum + e.visits, 0);
}

/** Used on both sides of the sync bridge; old snapshots cannot erase a purchase or adjustment. */
export function mergeCustomerLoyalty(existing: CustomerAccount, incoming: CustomerAccount): CustomerAccount {
  if (!existing.loyaltyBaseline && !incoming.loyaltyBaseline) {
    return Date.parse(incoming.updatedAt ?? '') < Date.parse(existing.updatedAt ?? '') ? existing : incoming;
  }
  const old = structuredClone(existing);
  const next = structuredClone(incoming);
  initializeLoyaltyLedger(old);
  initializeLoyaltyLedger(next);
  const incomingNewer = (Date.parse(next.updatedAt ?? '') || 0) >= (Date.parse(old.updatedAt ?? '') || 0);
  const merged: CustomerAccount = {
    ...(incomingNewer ? next : old),
    loyaltyBaseline: existing.loyaltyBaseline ?? next.loyaltyBaseline,
    loyaltyLedger: { ...next.loyaltyLedger, ...old.loyaltyLedger },
    recentOrderIds: Array.from(new Set([...(next.recentOrderIds ?? []), ...(old.recentOrderIds ?? [])])).slice(0, 20)
  };
  refreshLoyaltyBalance(merged);
  return merged;
}

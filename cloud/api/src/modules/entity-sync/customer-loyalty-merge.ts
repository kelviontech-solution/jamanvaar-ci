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

function mergeCustomerHistory(existing: CustomerAccount, incoming: CustomerAccount, result: CustomerAccount): CustomerAccount {
  const oldConsent = existing.marketingConsent as any,
    newConsent = incoming.marketingConsent as any;
  const consent = oldConsent && (!newConsent || Date.parse(oldConsent.at) >= Date.parse(newConsent.at)) ? oldConsent : newConsent;
  if (consent) result.marketingConsent = structuredClone(consent);
  const oldNotes = Array.isArray(existing.followups) ? existing.followups : [],
    newNotes = Array.isArray(incoming.followups) ? incoming.followups : [];
  if (oldNotes.length || newNotes.length)
    result.followups = [...new Map([...newNotes, ...oldNotes].map((n) => [n.id, n])).values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-200);
  return result;
}

/** Used on both sides of the sync bridge; old snapshots cannot erase a purchase or adjustment. */
export function mergeCustomerLoyalty(existing: CustomerAccount, incoming: CustomerAccount): CustomerAccount {
  if (!existing.loyaltyBaseline && !incoming.loyaltyBaseline) {
    return mergeCustomerHistory(
      existing,
      incoming,
      structuredClone(Date.parse(incoming.updatedAt ?? '') < Date.parse(existing.updatedAt ?? '') ? existing : incoming)
    );
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
  return mergeCustomerHistory(existing, incoming, merged);
}

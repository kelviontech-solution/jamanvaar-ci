/**
 * Pure scoring function for the Restaurant Health & Risk board (Super Admin feature request:
 * "churn/risk radar" + "restaurant health score"). Takes signals already aggregated from existing
 * tables (Device, Subscription, RestaurantPaymentConnection, SupportTicket, SyncConflict) -- no new
 * table, no duplicated source of truth. Kept pure and DB-free so it is unit-testable without a
 * database.
 */
export interface HealthSignals {
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | null;
  /** null = restaurant has no payment connection row at all (hasn't set one up yet). */
  bankVerificationStatus: 'NOT_ADDED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  activeDeviceCount: number;
  /** Devices counted as unhealthy: offline or never_seen, out of activeDeviceCount. */
  unhealthyDeviceCount: number;
  openSupportTickets: number;
  pendingSyncConflicts: number;
}

export type HealthTone = 'healthy' | 'watch' | 'at_risk';

export interface HealthResult {
  score: number;
  tone: HealthTone;
  reasons: string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function computeHealthScore(signals: HealthSignals): HealthResult {
  let score = 100;
  const reasons: string[] = [];

  switch (signals.subscriptionStatus) {
    case 'SUSPENDED':
    case 'EXPIRED':
      score -= 40;
      reasons.push(`Subscription ${signals.subscriptionStatus.toLowerCase()}`);
      break;
    case 'PAST_DUE':
      score -= 25;
      reasons.push('Subscription payment past due');
      break;
    case 'TRIAL':
      score -= 5;
      reasons.push('Still on trial');
      break;
    case null:
      score -= 20;
      reasons.push('No active subscription');
      break;
    case 'ACTIVE':
      break;
  }

  if (signals.bankVerificationStatus === 'NOT_ADDED' || signals.bankVerificationStatus === null) {
    score -= 5;
  } else if (signals.bankVerificationStatus === 'REJECTED') {
    score -= 15;
    reasons.push('Bank verification rejected');
  } else if (signals.bankVerificationStatus === 'PENDING') {
    score -= 8;
    reasons.push('Bank verification pending');
  }

  if (signals.activeDeviceCount > 0) {
    const unhealthyRatio = clamp(signals.unhealthyDeviceCount / signals.activeDeviceCount, 0, 1);
    const devicePenalty = Math.round(unhealthyRatio * 30);
    if (devicePenalty > 0) {
      score -= devicePenalty;
      reasons.push(`${signals.unhealthyDeviceCount}/${signals.activeDeviceCount} terminals offline or unseen`);
    }
  }

  if (signals.openSupportTickets > 1) {
    const ticketPenalty = Math.min(20, (signals.openSupportTickets - 1) * 5);
    score -= ticketPenalty;
    reasons.push(`${signals.openSupportTickets} open support tickets`);
  }

  if (signals.pendingSyncConflicts > 0) {
    const conflictPenalty = Math.min(20, signals.pendingSyncConflicts * 5);
    score -= conflictPenalty;
    reasons.push(`${signals.pendingSyncConflicts} unresolved sync conflicts`);
  }

  score = clamp(Math.round(score), 0, 100);
  const tone: HealthTone = score >= 80 ? 'healthy' : score >= 50 ? 'watch' : 'at_risk';
  return { score, tone, reasons };
}

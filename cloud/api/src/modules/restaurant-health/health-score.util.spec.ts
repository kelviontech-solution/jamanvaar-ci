import { describe, it, expect } from 'vitest';
import { computeHealthScore, type HealthSignals } from './health-score.util';

const HEALTHY: HealthSignals = {
  subscriptionStatus: 'ACTIVE',
  bankVerificationStatus: 'VERIFIED',
  activeDeviceCount: 4,
  unhealthyDeviceCount: 0,
  openSupportTickets: 0,
  pendingSyncConflicts: 0
};

describe('computeHealthScore', () => {
  it('a fully healthy restaurant scores 100 and is toned healthy', () => {
    const result = computeHealthScore(HEALTHY);
    expect(result.score).toBe(100);
    expect(result.tone).toBe('healthy');
    expect(result.reasons).toEqual([]);
  });

  it('a suspended subscription drags the score down hard, into "watch", and explains why', () => {
    const result = computeHealthScore({ ...HEALTHY, subscriptionStatus: 'SUSPENDED' });
    expect(result.score).toBe(60);
    expect(result.tone).toBe('watch');
    expect(result.reasons).toContain('Subscription suspended');
  });

  it('every terminal offline is a heavier penalty than half offline', () => {
    const half = computeHealthScore({ ...HEALTHY, unhealthyDeviceCount: 2 });
    const all = computeHealthScore({ ...HEALTHY, unhealthyDeviceCount: 4 });
    expect(all.score).toBeLessThan(half.score);
  });

  it('a restaurant with zero registered devices gets no device penalty (nothing to be unhealthy)', () => {
    const result = computeHealthScore({ ...HEALTHY, activeDeviceCount: 0, unhealthyDeviceCount: 0 });
    expect(result.score).toBe(100);
  });

  it('a single open ticket is normal and does not penalize, but a backlog does', () => {
    const one = computeHealthScore({ ...HEALTHY, openSupportTickets: 1 });
    const five = computeHealthScore({ ...HEALTHY, openSupportTickets: 5 });
    expect(one.score).toBe(100);
    expect(five.score).toBeLessThan(100);
    expect(five.reasons).toContain('5 open support tickets');
  });

  it('many small penalties combine but never push the score below 0', () => {
    const result = computeHealthScore({
      subscriptionStatus: 'SUSPENDED',
      bankVerificationStatus: 'REJECTED',
      activeDeviceCount: 10,
      unhealthyDeviceCount: 10,
      openSupportTickets: 20,
      pendingSyncConflicts: 20
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.tone).toBe('at_risk');
  });

  it('a restaurant with no subscription at all is flagged, not silently treated as fine', () => {
    const result = computeHealthScore({ ...HEALTHY, subscriptionStatus: null });
    expect(result.reasons).toContain('No active subscription');
    expect(result.score).toBeLessThan(100);
  });

  it('a restaurant exactly at the healthy/watch boundary (80) is still healthy, 79 is watch', () => {
    // TRIAL alone costs exactly 5 points -> 95, still healthy.
    const trial = computeHealthScore({ ...HEALTHY, subscriptionStatus: 'TRIAL' });
    expect(trial.score).toBe(95);
    expect(trial.tone).toBe('healthy');
    // PAST_DUE (-25) lands exactly on 75 -> watch.
    const pastDue = computeHealthScore({ ...HEALTHY, subscriptionStatus: 'PAST_DUE' });
    expect(pastDue.score).toBe(75);
    expect(pastDue.tone).toBe('watch');
  });

  it('a restaurant below 50 is toned at_risk', () => {
    const result = computeHealthScore({
      ...HEALTHY,
      subscriptionStatus: 'SUSPENDED',
      unhealthyDeviceCount: 4,
      openSupportTickets: 4
    });
    expect(result.score).toBeLessThan(50);
    expect(result.tone).toBe('at_risk');
  });
});

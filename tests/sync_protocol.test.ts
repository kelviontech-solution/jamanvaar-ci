import { describe, it, expect } from 'vitest';
import {
  newEventId,
  backoffDelayMs,
  nextAttemptState,
  MAX_ATTEMPTS_BEFORE_DEAD_LETTER,
  CONFLICT_POLICY,
  eventPriorityRank,
  pickNextBatch,
  formatDisplayNumber
} from '@jamanvaar/sync';

describe('sync protocol', () => {
  it('event ids are unique, sortable by creation time and carry the device prefix', () => {
    const a = newEventId('POS01', 1_000);
    const b = newEventId('POS01', 2_000);
    const c = newEventId('POS02', 2_000);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a < b).toBe(true);
    expect(a.startsWith('POS01-')).toBe(true);
  });

  it('backoff grows 2s, 5s, 15s, 30s, 60s then caps, and jitter stays within +-20%', () => {
    const noJitter = () => 0.5;
    expect([1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, noJitter))).toEqual([2000, 5000, 15000, 30000, 60000]);
    expect(backoffDelayMs(50, noJitter)).toBe(300000);
    expect(backoffDelayMs(3, () => 0)).toBe(12000);
    expect(backoffDelayMs(3, () => 1)).toBe(18000);
  });

  it('a failing event is retried with a delay, then dead-lettered instead of being deleted or retried forever', () => {
    let state = nextAttemptState({ attemptCount: 0, status: 'PENDING' }, 0, () => 0.5);
    expect(state.status).toBe('FAILED');
    expect(state.nextAttemptAt).toBe(2000);
    state = nextAttemptState({ attemptCount: MAX_ATTEMPTS_BEFORE_DEAD_LETTER - 1, status: 'FAILED' }, 0, () => 0.5);
    expect(state.status).toBe('DEAD_LETTER');
    expect(state.attemptCount).toBe(MAX_ATTEMPTS_BEFORE_DEAD_LETTER);
  });

  it('every entity type has an explicit conflict policy; money and stock are never last-write-wins', () => {
    for (const entity of ['MENU', 'ORDER', 'ORDER_ITEM', 'PAYMENT', 'REFUND', 'KOT_STATUS', 'INVENTORY', 'TABLE', 'DEVICE_CONFIG', 'USER', 'SETTINGS']) {
      expect(CONFLICT_POLICY[entity as keyof typeof CONFLICT_POLICY], entity).toBeTruthy();
    }
    expect(CONFLICT_POLICY.PAYMENT).toBe('SINGLE_COMMIT');
    expect(CONFLICT_POLICY.INVENTORY).toBe('LEDGER');
    expect(Object.values(CONFLICT_POLICY)).not.toContain('LAST_WRITE_WINS');
  });

  it('critical events go first but lower priorities are never starved', () => {
    expect(eventPriorityRank('PAYMENT')).toBeLessThan(eventPriorityRank('ANALYTICS'));
    const queue = [
      ...Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, entityType: 'PAYMENT', createdAt: i })),
      { id: 'low', entityType: 'ANALYTICS', createdAt: 0 }
    ];
    const first = pickNextBatch(queue, 10, 0);
    expect(first.map((e) => e.id)).not.toContain('low');
    const later = pickNextBatch(queue, 10, 1_000_000);
    expect(later.map((e) => e.id)).toContain('low');
  });

  it('display numbers are branch-day scoped and human friendly', () => {
    expect(formatDisplayNumber('AHD', new Date('2026-09-25T10:00:00+05:30'), 24)).toBe('AHD-20260925-024');
    expect(formatDisplayNumber('AHD', new Date('2026-09-25T10:00:00+05:30'), 1, 'POS02')).toBe('AHD-20260925-POS02-001');
  });
});

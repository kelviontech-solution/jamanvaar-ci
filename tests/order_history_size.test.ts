import { describe, it, expect } from 'vitest';
import { crossedOrderHistoryThreshold } from '@jamanvaar/database';

describe('crossedOrderHistoryThreshold', () => {
  it('returns null while well below the first threshold', () => {
    expect(crossedOrderHistoryThreshold(5, 6)).toBeNull();
    expect(crossedOrderHistoryThreshold(9998, 9999)).toBeNull();
  });

  it('returns the threshold exactly on the write that crosses it', () => {
    expect(crossedOrderHistoryThreshold(9999, 10_000)).toBe(10_000);
    expect(crossedOrderHistoryThreshold(49_999, 50_000)).toBe(50_000);
  });

  it('returns null on every write after the crossing — warns once, not forever', () => {
    expect(crossedOrderHistoryThreshold(10_000, 10_001)).toBeNull();
    expect(crossedOrderHistoryThreshold(12_000, 12_001)).toBeNull();
  });

  it('a restore/import that jumps straight past a threshold (not one order at a time) still gets exactly one warning, for the lowest threshold it crossed', () => {
    expect(crossedOrderHistoryThreshold(100, 60_000)).toBe(10_000);
  });

  it('starting already above every threshold (a huge imported history) warns for none of them — the crossing already happened before this process started', () => {
    expect(crossedOrderHistoryThreshold(600_000, 600_001)).toBeNull();
  });
});

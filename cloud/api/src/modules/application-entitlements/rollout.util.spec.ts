import { describe, it, expect } from 'vitest';
import { isRestaurantInRollout } from './rollout.util';

describe('isRestaurantInRollout', () => {
  it('100% always includes, regardless of id', () => {
    expect(isRestaurantInRollout('restaurant-a', 100)).toBe(true);
    expect(isRestaurantInRollout('restaurant-b', 100)).toBe(true);
  });

  it('0% always excludes, regardless of id', () => {
    expect(isRestaurantInRollout('restaurant-a', 0)).toBe(false);
    expect(isRestaurantInRollout('restaurant-b', 0)).toBe(false);
  });

  it('is deterministic: the same restaurant+percent always gives the same answer', () => {
    const first = isRestaurantInRollout('restaurant-xyz', 37);
    for (let i = 0; i < 20; i++) {
      expect(isRestaurantInRollout('restaurant-xyz', 37)).toBe(first);
    }
  });

  it('roughly distributes across a large set of ids (not all-or-nothing in practice)', () => {
    let included = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (isRestaurantInRollout(`restaurant-${i}`, 30)) included++;
    }
    // Allow generous slack -- this just proves it's not degenerate (e.g. always true/false).
    expect(included).toBeGreaterThan(total * 0.15);
    expect(included).toBeLessThan(total * 0.45);
  });
});

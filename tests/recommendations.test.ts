import { describe, expect, it } from 'vitest';
import { RecommendationEngine } from '../shared/business/src/recommendations';

describe('RecommendationEngine', () => {
  it('should recommend Beverages and Desserts when Chicken Biryani is in cart', () => {
    const recs = RecommendationEngine.getCartRecommendations(['item-hbd-chk']);
    expect(recs.length).toBeGreaterThan(0);
    const recIds = recs.map((r) => r.item.id);
    expect(recIds).toContain('item-cc-ice');
    expect(recs[0].explanation).toContain('Biryani');
  });

  it('should not recommend items already in the cart', () => {
    const recs = RecommendationEngine.getCartRecommendations(['item-hbd-chk', 'item-cc-ice']);
    const recIds = recs.map((r) => r.item.id);
    expect(recIds).not.toContain('item-cc-ice');
    expect(recIds).not.toContain('item-hbd-chk');
  });
});

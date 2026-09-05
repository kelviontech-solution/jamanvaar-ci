import { MenuItem, RecommendationRule } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';

export class RecommendationEngine {
  public static rules: RecommendationRule[] = [
    {
      id: 'rec-1',
      triggerItemId: 'item-hbd-chk', // Hyderabadi Chicken Dum Biryani
      recommendedItemIds: ['item-cc-ice', 'item-gj-2'],
      explanation: 'Biryani pairs exceptionally well with Chilled Cold Coffee and Warm Shahi Gulab Jamun.',
      isActive: true
    },
    {
      id: 'rec-2',
      triggerItemId: 'item-pt', // Paneer Tikka
      recommendedItemIds: ['item-bn', 'item-dm', 'item-cc-ice'],
      explanation: 'Customers frequently pair Paneer Tikka with Butter Naan and Dal Makhani.',
      isActive: true
    },
    {
      id: 'rec-3',
      triggerCategoryId: 'cat-starters',
      recommendedItemIds: ['item-cc-ice'],
      explanation: 'Complete your appetizers with a refreshing beverage.',
      isActive: true
    }
  ];

  /**
   * Get intelligent recommendations based on active cart items
   */
  public static getCartRecommendations(cartItemIds: string[]): { item: MenuItem; explanation: string }[] {
    const results: { item: MenuItem; explanation: string }[] = [];
    const allItems = db.menuItems.filter((i) => i.isAvailable);

    // 1. Check item-specific trigger rules
    for (const itemId of cartItemIds) {
      const match = this.rules.find((r) => r.isActive && r.triggerItemId === itemId);
      if (match) {
        for (const recId of match.recommendedItemIds) {
          if (!cartItemIds.includes(recId) && !results.some((r) => r.item.id === recId)) {
            const foundItem = allItems.find((i) => i.id === recId);
            if (foundItem) {
              results.push({ item: foundItem, explanation: match.explanation });
            }
          }
        }
      }
    }

    // 2. Data-driven fallback: popular beverages / desserts
    if (results.length < 3) {
      const popularBeverages = allItems.filter(
        (i) =>
          (i.categoryId === 'cat-beverages' || i.isPopular) &&
          !cartItemIds.includes(i.id) &&
          !results.some((r) => r.item.id === i.id)
      );

      popularBeverages.slice(0, 3 - results.length).forEach((item) => {
        results.push({
          item,
          explanation: 'Popular item frequently ordered this time of day.'
        });
      });
    }

    return results;
  }
}

import { describe, it, expect } from 'vitest';
import { dishMargins, prepPlan } from './operations-analytics';
const menu = { externalId: 'dish', entityType: 'MENU_ITEM', payload: { name: 'Test dish', price: 100 } };
const recipe = {
  externalId: 'recipe',
  entityType: 'RECIPE',
  payload: { menuItemId: 'dish', ingredients: [{ inventoryItemId: 'stock', quantityPerPortion: 0.2 }] },
};
const stock = { externalId: 'stock', entityType: 'INVENTORY_ITEM', payload: { costPerUnit: 200 } };
const line = { menuItemId: 'dish', name: 'Test dish', quantity: 2, lineTotal: 20000 };
describe('honest food-cost and preparation estimates', () => {
  it('calculates current recipe food margin, not business profit', () => {
    expect(dishMargins([menu, recipe, stock], [])[0]).toMatchObject({
      estimatedFoodCost: 40,
      estimatedFoodMargin: 60,
      marginPercent: 60,
    });
  });
  it('reports a missing recipe as unknown instead of free food', () => {
    expect(dishMargins([menu, stock], [])[0].estimatedFoodCost).toBeNull();
  });
  it('reports missing ingredient costs as unknown', () => {
    expect(dishMargins([menu, recipe], [])[0]).toMatchObject({ estimatedFoodCost: null, missingCosts: 1 });
  });
  it('keeps known zero ingredient cost', () => {
    expect(
      dishMargins([menu, recipe, { ...stock, payload: { costPerUnit: 0 } }], [])[0].estimatedFoodCost,
    ).toBe(0);
  });
  it('allocates an order discount proportionally to sales', () => {
    expect(
      dishMargins(
        [menu],
        [{ items: [line], totalAmount: 18000, discountAmount: 2000, status: 'COMPLETED' }],
      )[0],
    ).toMatchObject({ units: 2, allocatedSales: 180 });
  });
  it.each(['CANCELLED', 'VOID', 'DRAFT', 'REFUNDED'])(
    'excludes %s orders from preparation and sales',
    (status) => {
      const order = { items: [line], createdAt: new Date(), status, totalAmount: 20000, discountAmount: 0 };
      expect(dishMargins([menu], [order])[0].units).toBe(0);
      expect(prepPlan([order], 'Asia/Kolkata', 7, 10)).toEqual([]);
    },
  );
  it('excludes cancelled dishes', () => {
    expect(
      prepPlan(
        [{ createdAt: new Date(), status: 'COMPLETED', items: [{ ...line, kitchenStatus: 'CANCELLED' }] }],
        'Asia/Kolkata',
        7,
        10,
      ),
    ).toEqual([]);
  });
  it('uses calendar-day demand, buffer and branch-local peak hour', () => {
    expect(
      prepPlan(
        [
          {
            createdAt: new Date('2026-10-15T06:30:00Z'),
            status: 'SERVED',
            items: [{ ...line, quantity: 14 }],
          },
        ],
        'Asia/Kolkata',
        7,
        50,
      )[0],
    ).toMatchObject({ averageDaily: 2, suggestedPortions: 3, peakHour: '12' });
  });
  it('ignores nonfinite or negative demand', () => {
    expect(
      prepPlan(
        [
          {
            createdAt: new Date(),
            status: 'SERVED',
            items: [
              { ...line, quantity: -2 },
              { ...line, quantity: 'invalid' },
            ],
          },
        ],
        'Asia/Kolkata',
        7,
        10,
      ),
    ).toEqual([]);
  });
});

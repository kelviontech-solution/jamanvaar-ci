import { describe, expect, it } from 'vitest';
import { buildCategoryGroups } from '../apps/restaurant-system/pos/src/components/menu/useCategoryGroups';

const cat = (id: string, name: string, extra: object = {}) => ({ id, name, sortOrder: 1, isActive: true, ...extra }) as never;
const dish = (id: string, categoryId: string, extra: object = {}) => ({ id, name: id, categoryId, price: 100, isAvailable: true, ...extra }) as never;

describe('POS category rail', () => {
  it('groups dishes under their active categories as before', () => {
    const groups = buildCategoryGroups([cat('c1', 'Pizzas'), cat('c2', 'Garlic Breads')], [dish('a', 'c1'), dish('b', 'c1'), dish('c', 'c2')]);
    expect(groups.map((g) => [g.displayLabel, g.totalDishCount])).toEqual([['PIZZA & PASTA', 2], ['NAAN & ROTI', 1]]);
  });

  it('shows a switched-off category under its own name instead of hiding its dishes', () => {
    const groups = buildCategoryGroups([cat('c1', 'Pizzas'), cat('c2', 'Garlic Breads', { isActive: false })], [dish('a', 'c1'), dish('b', 'c2'), dish('c', 'c2')]);
    expect(groups).toHaveLength(2);
    expect(groups[1].totalDishCount).toBe(2);
    expect(groups[1].categoryIds).toEqual(['c2']);
  });

  it('groups dishes whose category is missing by subcategory, or under "Other dishes"', () => {
    const groups = buildCategoryGroups(
      [cat('c1', 'Pizzas')],
      [dish('a', 'c1'), dish('b', 'gone-1', { subcategory: 'Garlic Breads' }), dish('c', 'gone-1', { subcategory: 'Garlic Breads' }), dish('d', 'gone-2'), dish('e', undefined as never)]
    );
    const byLabel = Object.fromEntries(groups.map((g) => [g.displayLabel, g.totalDishCount]));
    expect(byLabel['PIZZA & PASTA']).toBe(1);
    expect(byLabel['NAAN & ROTI']).toBe(2);
    expect(byLabel['OTHER DISHES']).toBe(2);
  });

  it('accounts for every dish the grid shows, and none it hides', () => {
    const items = [
      dish('a', 'c1'), dish('b', 'c2'), dish('c', 'nowhere'),
      dish('hidden', 'c1', { archivedAt: '2026-01-01' }),
      dish('qr-only', 'c1', { salesChannels: ['QR'] })
    ];
    const groups = buildCategoryGroups([cat('c1', 'Pizzas'), cat('c2', 'Dips', { isActive: false })], items);
    expect(groups.reduce((n, g) => n + g.totalDishCount, 0)).toBe(3);
  });

  it('lets the grid filter find every dish through its group category ids', () => {
    const items = [dish('a', 'c1'), dish('b', 'gone')];
    const groups = buildCategoryGroups([cat('c1', 'Pizzas')], items);
    for (const item of items) expect(groups.some((g) => g.categoryIds.includes((item as { categoryId: string }).categoryId))).toBe(true);
  });
});

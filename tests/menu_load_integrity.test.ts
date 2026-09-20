import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JamanvaarDatabase } from '../packages/database/src/db';

/**
 * BUG-017: on load, every persisted item with `dietaryType === 'NON_VEG'` or "chicken" in its
 * name was silently dropped, and if fewer than 8 items survived that filter the WHOLE stored
 * menu was thrown away and replaced with the demo seed menu. A real restaurant's own menu —
 * especially a small one, or one that sells non-veg food — could be destroyed just by loading
 * the app. This must load exactly what was stored, with no hidden filtering or reseeding.
 */
describe('Local menu storage load integrity (BUG-017)', () => {
  const g = globalThis as unknown as { localStorage?: Storage };
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    g.localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0
    } as Storage;
  });

  afterEach(() => {
    delete g.localStorage;
  });

  function freshInstance(prefix: string) {
    return JamanvaarDatabase.getInstanceForRole('POS', prefix);
  }

  it('loads a small real menu exactly as stored, without reseeding it to the demo menu', () => {
    const prefix = `test_small_${Date.now()}_`;
    const realMenu = Array.from({ length: 3 }, (_, i) => ({
      id: `real-${i}`,
      restaurantId: 'r1',
      categoryId: 'cat-1',
      name: `Real Dish ${i}`,
      sku: `SKU-${i}`,
      price: 100,
      dietaryType: 'VEG',
      isAvailable: true
    }));
    store[`${prefix}menu_items`] = JSON.stringify(realMenu);

    const instance = freshInstance(prefix);
    expect(instance.menuItems).toHaveLength(3);
    expect(instance.menuItems.map((i) => i.id)).toEqual(['real-0', 'real-1', 'real-2']);
  });

  it('never drops a non-veg dish, or one with "chicken" in its name', () => {
    const prefix = `test_nonveg_${Date.now()}_`;
    const realMenu = [
      { id: 'chk-1', restaurantId: 'r1', categoryId: 'cat-1', name: 'Chicken Biryani', sku: 'CB1', price: 250, dietaryType: 'NON_VEG', isAvailable: true },
      { id: 'veg-1', restaurantId: 'r1', categoryId: 'cat-1', name: 'Paneer Tikka', sku: 'PT1', price: 200, dietaryType: 'VEG', isAvailable: true }
    ];
    store[`${prefix}menu_items`] = JSON.stringify(realMenu);

    const instance = freshInstance(prefix);
    expect(instance.menuItems).toHaveLength(2);
    expect(instance.menuItems.some((i) => i.id === 'chk-1')).toBe(true);
  });

  it('does not force demo photos onto a real dish that merely shares a common name', () => {
    const prefix = `test_image_${Date.now()}_`;
    const realMenu = [
      { id: 'my-biryani', restaurantId: 'r1', categoryId: 'cat-1', name: 'Chef Special Biryani', sku: 'MB1', price: 300, dietaryType: 'VEG', isAvailable: true, imageUrl: 'https://my-cdn.example.com/my-photo.jpg' }
    ];
    store[`${prefix}menu_items`] = JSON.stringify(realMenu);

    const instance = freshInstance(prefix);
    expect(instance.menuItems[0].imageUrl).toBe('https://my-cdn.example.com/my-photo.jpg');
  });
});

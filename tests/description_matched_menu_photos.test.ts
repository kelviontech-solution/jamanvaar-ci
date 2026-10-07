import { beforeEach, describe, expect, it } from 'vitest';
import { db, MenuRepository, PREBUILT_MENU_TEMPLATES } from '@jamanvaar/database';
import { menuDishImage, starterDishPhoto, STARTER_DISH_PHOTOS, resolveMenuImage } from '@jamanvaar/utils';
import { buildStandardMenu } from '../apps/kiosk-system/kiosk-user/src/standardMenu';

describe('description-matched starter photos without overwriting restaurant data', () => {
  it('repairs every identified wrong legacy picture using the dish identity', () => {
    for (const photo of STARTER_DISH_PHOTOS) {
      const name = photo.names[0];
      expect(menuDishImage('/assets/menu/common/menu-placeholder-v2.svg', name)).toBe(starterDishPhoto(name));
      for (const old of photo.legacy) {
        expect(menuDishImage(`/restaurant-admin/assets/menu/${old}`, name)).toBe(starterDishPhoto(name));
        expect(resolveMenuImage(menuDishImage(`/assets/menu/${old}`, name), { pathname: '/kiosk/' })).toBe(`/kiosk${starterDishPhoto(name)}`);
      }
    }
  });
  it('preserves owner uploads, content-addressed photos and custom paths', () => {
    for (const source of ['data:image/png;base64,custom', `img:${'a'.repeat(64)}`, '/api/v1/public/qr/images/custom', 'https://restaurant.example/dish.webp', '/assets/menu/restaurant-custom/khaman.webp', 'blob:owner-photo']) {
      expect(menuDishImage(source, 'Surti Nylon Khaman (250g)')).toBe(source);
    }
  });
  it('never guesses a photograph from an unknown dish or a partial name match', () => {
    expect(menuDishImage(undefined, 'Our family special')).toBeUndefined();
    expect(menuDishImage('/assets/menu/custom.jpg', 'Chicken Khaman Surprise')).toBe('/assets/menu/custom.jpg');
    expect(starterDishPhoto('Our family special')).toBeUndefined();
  });
  it('has distinct photos for dal, kadhi, rotla, rice, shrikhand and basundi', () => {
    const names = ['Sweet Gujarati Toor Dal', 'Traditional Gujarati Kadhi', 'Kathiyawadi Bajra Rotla (Ghee)', 'Steamed Surti Basmati Rice', 'Kesar Pista Shrikhand (150g)', 'Rich Basundi Bowl'];
    expect(new Set(names.map(starterDishPhoto)).size).toBe(names.length);
  });
  it('future Gujarati imports include photos for all 21 legacy dishes including chaas', () => {
    const items = PREBUILT_MENU_TEMPLATES.find(template => template.id === 'tpl-gujarati')!.categories.flatMap(category => category.items).filter(item => /^GUJ-\d{3}$/.test(item.sku));
    expect(items.length).toBeGreaterThanOrEqual(20);
    for (const item of items) expect(item.imageUrl).toBe(starterDishPhoto(item.name));
  });
  beforeEach(() => { db.menuItems = []; db.categories = []; });
  it('existing saved menus gain display photos without changing prices, records or publications', () => {
    const original = { id: 'khaman', name: 'Surti Nylon Khaman (250g)', imageUrl: '/assets/menu/common/menu-placeholder-v2.svg', price: 90, categoryId: 'farsan', isAvailable: true, isKioskEnabled: true, modifierGroupIds: [], sortOrder: 1 };
    db.menuItems = [structuredClone(original)] as never;
    expect(MenuRepository.getAllMenuItems()[0].imageUrl).toBe(starterDishPhoto(original.name));
    expect(MenuRepository.getMenuItemById(original.id)?.price).toBe(90);
    expect(db.menuItems[0]).toEqual(original);
  });
  it('custom category placeholders borrow a visible dish rather than hidden items or another branch', () => {
    db.categories = [{ id: 'farsan', name: 'Our Family Snacks', sortOrder: 1, isActive: true, imageUrl: '/assets/menu/common/menu-placeholder-v2.svg' }] as never;
    db.menuItems = [
      { id: 'hidden', name: 'Hidden', categoryId: 'farsan', isAvailable: false, imageUrl: '/hidden.jpg' },
      { id: 'other', name: 'Other branch', categoryId: 'farsan', isAvailable: true, branchIds: ['other'], imageUrl: '/other.jpg' },
      { id: 'khaman', name: 'Surti Nylon Khaman (250g)', categoryId: 'farsan', isAvailable: true, sortOrder: 1 }
    ] as never;
    const view = buildStandardMenu(db.categories, MenuRepository.getAllMenuItems(), 'main');
    expect(view.categories[0].imageUrl).toBe(starterDishPhoto('Surti Nylon Khaman (250g)'));
    expect(view.items).toHaveLength(1);
    expect(db.categories[0].imageUrl).toContain('placeholder');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PREBUILT_MENU_TEMPLATES, FOOD_IMAGE_LIBRARY } from '@jamanvaar/database';
import { CATEGORY_ICON_OPTIONS, categoryVisual, isMenuPlaceholder, menuDishImage, menuCategoryImage, TEMPLATE_DISH_PHOTOS, TEMPLATE_CATEGORY_PHOTOS, starterDishPhoto, starterCategoryPhoto, resolveMenuImage } from '@jamanvaar/utils';

describe('complete template photo delivery', () => {
  it('provides a real image for every dish, category and combo in every bundled template', () => {
    expect(PREBUILT_MENU_TEMPLATES).toHaveLength(30);
    let dishes = 0, categories = 0, combos = 0;
    for (const template of PREBUILT_MENU_TEMPLATES) {
      for (const category of template.categories) {
        categories++;
        expect(isMenuPlaceholder(category.imageUrl), `${template.name}: ${category.name}`).toBe(false);
        expect(fs.existsSync(path.join('packages', category.imageUrl!.replace('/assets/', 'assets/'))), category.imageUrl).toBe(true);
        expect(CATEGORY_ICON_OPTIONS.some(([icon]) => icon === category.iconName)).toBe(true);
        for (const item of category.items) {
          dishes++;
          expect(isMenuPlaceholder(item.imageUrl), item.name).toBe(false);
          expect(item.imageUrl).toMatch(/\.(webp|jpg)$/);
          expect(fs.existsSync(path.join('packages', item.imageUrl!.replace('/assets/', 'assets/'))), item.name).toBe(true);
        }
      }
      for (const combo of template.combos || []) {
        combos++;
        expect(isMenuPlaceholder(combo.imageUrl), combo.name).toBe(false);
        expect(fs.existsSync(path.join('packages', combo.imageUrl!.replace('/assets/', 'assets/')))).toBe(true);
      }
    }
    expect({ dishes, categories, combos }).toEqual({ dishes: 652, categories: 199, combos: 27 });
  });
  it('uses template identity for category covers and preserves restaurant category uploads', () => {
    expect(TEMPLATE_CATEGORY_PHOTOS).toHaveLength(199);
    for (const photo of TEMPLATE_CATEGORY_PHOTOS) {
      const cover = starterCategoryPhoto(photo.templateId!, photo.slug!, photo.categoryName!);
      expect(cover).toBe(`/assets/menu/template-photos-v1/${photo.file}`);
      expect(menuCategoryImage(undefined, photo.categoryName!, photo.description, `${photo.templateId}::${photo.slug}`)).toBe(cover);
      expect(menuCategoryImage('data:image/webp;base64,owner', photo.categoryName!, photo.description)).toBe('data:image/webp;base64,owner');
      expect(menuCategoryImage('https://restaurant.example/category.webp', photo.categoryName!, photo.description)).toBe('https://restaurant.example/category.webp');
    }
    expect(menuCategoryImage(undefined, 'Unlisted chef category')).toBeUndefined();
  });
  it('checks each generated asset against its recorded checksum and all six public folders', () => {
    const manifest = JSON.parse(fs.readFileSync('packages/assets/menu/template-photos-v1/manifest.json', 'utf8'));
    expect(manifest.photos).toHaveLength(679);
    expect(new Set(manifest.photos.map((photo: { sha256: string }) => photo.sha256)).size).toBe(679);
    expect(TEMPLATE_DISH_PHOTOS).toHaveLength(480);
    for (const photo of manifest.photos) {
      const data = fs.readFileSync(`packages/assets/menu/template-photos-v1/${photo.file}`);
      expect(crypto.createHash('sha256').update(data).digest('hex')).toBe(photo.sha256);
      expect(data.subarray(8, 12).toString()).toBe('WEBP');
      for (const app of ['apps/kiosk-system/kiosk-user', 'apps/restaurant-system/pos', 'apps/restaurant-system/pos-admin', 'apps/restaurant-system/captain', 'apps/restaurant-system/kds', 'cloud/super-admin-web']) {
        const delivered = fs.readFileSync(`${app}/public/assets/menu/template-photos-v1/${photo.file}`);
        expect(crypto.createHash('sha256').update(delivered).digest('hex')).toBe(photo.sha256);
      }
    }
  });
  it('never shares a photo between different dish names, combos or template categories', () => {
    const dishPhotos = new Map<string, string>();
    const categories: string[] = [], combos: string[] = [];
    for (const template of PREBUILT_MENU_TEMPLATES) {
      for (const category of template.categories) {
        categories.push(category.imageUrl!);
        expect(category.imageUrl).toMatch(/\/category-[a-f0-9]+\.webp$/);
        for (const item of category.items) {
          if (dishPhotos.has(item.name)) expect(item.imageUrl).toBe(dishPhotos.get(item.name));
          dishPhotos.set(item.name, item.imageUrl!);
        }
      }
      for (const combo of template.combos || []) combos.push(combo.imageUrl!);
    }
    expect(dishPhotos.size).toBe(453);
    expect(new Set([...dishPhotos.values(), ...categories, ...combos]).size).toBe(679);
    expect(new Set(FOOD_IMAGE_LIBRARY.map(photo => photo.url)).size).toBe(FOOD_IMAGE_LIBRARY.length);
    expect(FOOD_IMAGE_LIBRARY.every(photo => !photo.url.endsWith('.svg'))).toBe(true);
  });
  it('repairs saved starter images using an exact dish identity and preserves custom sources', () => {
    expect(menuDishImage('/kiosk/assets/menu/pizza/margherita.svg', 'Margherita Pizza')).toBe(starterDishPhoto('Margherita Pizza'));
    for (const photo of TEMPLATE_DISH_PHOTOS) {
      expect(menuDishImage(undefined, photo.name)).toBe(starterDishPhoto(photo.name));
      for (const app of ['restaurant-admin', 'pos', 'kiosk', 'captain', 'kds', 'q']) expect(resolveMenuImage(starterDishPhoto(photo.name), { pathname: `/${app}/` })).toBe(`/${app}${starterDishPhoto(photo.name)}`);
      for (const legacy of photo.legacy) expect(menuDishImage(`/kiosk/assets/menu/${legacy}`, photo.name)).toBe(starterDishPhoto(photo.name));
      for (const source of ['data:image/webp;base64,owner', 'blob:owner', 'img:owner', 'https://restaurant.example/upload.webp', '/assets/menu/owner-special.webp']) expect(menuDishImage(source, photo.name)).toBe(source);
    }
    expect(menuDishImage(undefined, 'Unlisted family recipe')).toBeUndefined();
  });
});

describe('category defaults and owner icon selection', () => {
  it.each([['Pizzas', 'Pizza'], ['Jain Starters', 'Leaf'], ['Fresh Farsan (Snacks)', 'Popcorn'], ['Rotli, Bhakri & Thepla', 'Wheat'], ['Beverages', 'CupSoda'], ['Sweets & Mithai', 'Cookie'], ['Seafood', 'Fish'], ['Combos', 'Package']])('gives %s the %s icon', (name, icon) => {
    expect(categoryVisual(name, 'Utensils').icon).toBe(icon);
    expect(categoryVisual(name, 'auto').icon).toBe(icon);
  });
  it('preserves a supported owner selection and handles unknown legacy icons', () => {
    expect(categoryVisual('House Specials', 'Pizza').icon).toBe('Pizza');
    expect(categoryVisual('Pizzas', 'UtensilsCrossed').icon).toBe('UtensilsCrossed');
    expect(categoryVisual('Desserts', 'Cake').icon).toBe('CakeSlice');
    expect(categoryVisual('Beverages', 'NotAnIcon').icon).toBe('CupSoda');
  });
});

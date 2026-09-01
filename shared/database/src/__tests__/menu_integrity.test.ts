import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('JAMANVAAR Menu Catalog & Image Data Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '../../../../');
  const liveDbPath = path.join(rootDir, 'shared/database/src/live_db.json');
  const manifestPath = path.join(rootDir, 'shared/database/src/image_manifest.json');
  const posPublicDir = path.join(rootDir, 'apps/restaurant-system/pos/public');
  const sharedAssetDir = path.join(rootDir, 'shared');

  const liveDb = JSON.parse(fs.readFileSync(liveDbPath, 'utf-8'));
  const menuItems = liveDb.menuItems || [];
  const categories = liveDb.categories || [];

  it('1. Single Source of Truth: Canonical catalog must have valid menu items and categories', () => {
    expect(menuItems.length).toBeGreaterThan(0);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('2. Stable Dish Identity: Every dish must have a unique ID and unique SKU', () => {
    const ids = new Set<string>();
    const skus = new Set<string>();

    menuItems.forEach((item: any) => {
      expect(item.id).toBeDefined();
      expect(item.id.trim()).not.toBe('');
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);

      expect(item.sku).toBeDefined();
      expect(item.sku.trim()).not.toBe('');
      expect(skus.has(item.sku)).toBe(false);
      skus.add(item.sku);
    });
  });

  it('3. Strict Image Mapping: Every dish must explicitly reference a valid local asset with zero remote URLs', () => {
    menuItems.forEach((item: any) => {
      expect(item.imageUrl).toBeDefined();
      expect(item.imageUrl.startsWith('http://')).toBe(false);
      expect(item.imageUrl.startsWith('https://')).toBe(false);

      const cleanRel = item.imageUrl.startsWith('/') ? item.imageUrl.slice(1) : item.imageUrl;
      const posFile = path.join(posPublicDir, cleanRel);
      const sharedFile = path.join(sharedAssetDir, cleanRel);

      const exists = fs.existsSync(posFile) || fs.existsSync(sharedFile);
      expect(exists).toBe(true);

      const activeFile = fs.existsSync(posFile) ? posFile : sharedFile;
      const stats = fs.statSync(activeFile);
      expect(stats.size).toBeGreaterThan(100); // Non-empty valid file
    });
  });

  it('4. Data Completeness: Every dish must have name, description, price, category, station and dietary type', () => {
    menuItems.forEach((item: any) => {
      expect(item.name).toBeDefined();
      expect(item.name.length).toBeGreaterThan(2);

      expect(item.description).toBeDefined();
      expect(item.description.length).toBeGreaterThan(5);

      expect(typeof item.price).toBe('number');
      expect(item.price).toBeGreaterThan(0);

      expect(item.categoryId).toBeDefined();
      const catExists = categories.some((c: any) => c.id === item.categoryId);
      expect(catExists).toBe(true);

      expect(['VEG', 'NON_VEG', 'EGG', 'VEGAN']).toContain(item.dietaryType);
      expect(item.kitchenStation).toBeDefined();
    });
  });

  it('5. Image Manifest Consistency: Manifest records must match canonical live database', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    menuItems.forEach((item: any) => {
      const manifestEntry = manifest.items[item.sku];
      expect(manifestEntry).toBeDefined();
      expect(manifestEntry.name).toBe(item.name);
      expect(manifestEntry.localAsset).toBe(item.imageUrl);
      expect(manifestEntry.price).toBe(item.price);
    });
  });
});

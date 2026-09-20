import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-117: "Veg Seekh Kebab Mughlai" showed a photo of tropical fish, because the file
 * north-indian/seekh-kebab.jpg is not a picture of food. A dish without a suitable photo shows the
 * app's plain placeholder instead of a wrong one.
 */
describe('Default menu photos (BUG-117)', () => {
  const templates = readFileSync(join(__dirname, '../packages/database/src/menu_templates_data.ts'), 'utf8');

  it('no default dish points at the wrong seekh-kebab photo', () => {
    expect(templates).not.toContain('seekh-kebab.jpg');
  });

  it('every photo a default dish points at exists in the terminal apps', () => {
    const referenced = Array.from(templates.matchAll(/imageUrl:\s*'(\/assets\/[^']+)'/g)).map((m) => m[1]);
    const apps = ['apps/restaurant-system/pos', 'apps/restaurant-system/captain', 'apps/restaurant-system/kds', 'apps/restaurant-system/pos-admin'];
    const missing = referenced.filter((url) => apps.some((a) => existsSync(join(__dirname, '..', a, 'public')) && !existsSync(join(__dirname, '..', a, 'public', url))));
    expect(Array.from(new Set(missing))).toEqual([]);
  });
});

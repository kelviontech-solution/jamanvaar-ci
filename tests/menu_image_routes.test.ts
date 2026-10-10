import { describe, expect, it } from 'vitest';
import { resolveMenuImage } from '../packages/utils/src/menu_image';

describe('Catalog photos on shared-origin app routes', () => {
  for (const app of ['restaurant-admin', 'pos-admin', 'pos', 'captain', 'kds', 'kiosk', 'qr', 'q']) {
    it(`uses ${app}'s own images even on a nested screen`, () => {
      expect(resolveMenuImage('/assets/menu/pizza/margherita.jpg', { pathname: `/${app}/menu/details` })).toBe(`/${app}/assets/menu/pizza/margherita.jpg`);
      expect(resolveMenuImage('/assets/menu/common/menu-placeholder-v2.svg', { pathname: `/${app}/` })).toBe(`/${app}/assets/menu/common/menu-placeholder-v2.svg`);
    });
  }
  it('keeps standalone localhost and desktop catalog paths at the root', () => {
    expect(resolveMenuImage('/assets/menu/pizza/margherita.jpg', { pathname: '/menu' })).toBe('/assets/menu/pizza/margherita.jpg');
  });
  it('repairs a persisted asset prefix from another app without changing catalog data', () => {
    expect(resolveMenuImage('/restaurant-admin/assets/menu/pizza/margherita.jpg', { pathname: '/kiosk/' })).toBe('/kiosk/assets/menu/pizza/margherita.jpg');
  });
  it('preserves uploaded raster images and remote addresses', () => {
    for (const src of ['data:image/png;base64,test', 'https://restaurant.example/photo.jpg', 'blob:local-photo']) expect(resolveMenuImage(src, { pathname: '/pos/' })).toBe(src);
  });
  it('resolves stored hash pictures through the configured API without the app prefix', () => {
    const hash = 'a'.repeat(64);
    expect(resolveMenuImage(`img:${hash}`, { pathname: '/q/table-code', apiBase: 'https://restaurant.example/' })).toBe(`https://restaurant.example/api/v1/public/qr/images/${hash}`);
    expect(resolveMenuImage(`/api/v1/public/qr/images/${hash}`, { pathname: '/q/code', apiBase: 'https://restaurant.example' })).toBe(`https://restaurant.example/api/v1/public/qr/images/${hash}`);
  });
});

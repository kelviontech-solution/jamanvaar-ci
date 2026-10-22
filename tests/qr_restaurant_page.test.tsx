// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RestaurantPage } from '../packages/ui/src/restaurant-page/RestaurantPage';
import { DEFAULT_RESTAURANT_PAGE, RestaurantPageContent } from '../packages/ui/src/restaurant-page/types';
import type { RestaurantPageDish, RestaurantPageView } from '../packages/ui/src/restaurant-page/types';
let root: Root | undefined, container: HTMLDivElement | undefined;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
});
const button = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((b) => b.textContent?.includes('View menu'));
const link = (text: string) => Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((a) => a.textContent?.includes(text));
function show(
  content: Partial<RestaurantPageContent> = {},
  options: { preview?: boolean; browseMenu?: boolean; onMenu?: () => void } = {},
  items?: RestaurantPageDish[],
  pageOverrides: Partial<RestaurantPageView> = {}
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <RestaurantPage
        page={{
          content: { ...DEFAULT_RESTAURANT_PAGE, title: 'River House Kitchen', welcome: 'Freshly cooked at your table.', ...content },
          restaurantName: 'River House',
          branchName: 'Riverside',
          table: 'TN12',
          currency: 'INR',
          ...pageOverrides
        }}
        items={items || [{ id: 'thali', name: 'Gujarati Thali', price: 250, allergens: ['Milk'] }]}
        {...options}
      />
    )
  );
  return container;
}
describe('shared restaurant page renderer', () => {
  it.each(['HERITAGE', 'CAFE', 'MODERN', 'INDIAN'] as const)('renders %s using the same preview and public component', (template) => {
    const view = show({ template }, { preview: true, onMenu: vi.fn() });
    expect(view.querySelector('.rp-' + template.toLowerCase())).not.toBeNull();
    expect(view.querySelector('h1')?.textContent).toBe('River House Kitchen');
    expect(view.textContent).toContain('LIVE DESIGN PREVIEW');
    expect(view.textContent).toContain('Table TN12');
  });
  it('retains declared allergen details, hides absent sections and routes menu actions without placing an order', () => {
    const onMenu = vi.fn(),
      view = show({ featuredItemIds: ['missing', 'thali'] }, { onMenu });
    expect(view.textContent).toContain('Gujarati Thali');
    expect(view.textContent).toContain('Allergens: Milk');
    expect(view.textContent).not.toContain('Our story');
    expect(view.textContent).not.toContain('At our place');
    act(() => button()[0].click());
    expect(onMenu).toHaveBeenCalledOnce();
  });
  it('uses direct review, WhatsApp and phone links while hiding absent social fields', () => {
    show({ reviewUrl: 'https://g.page/r/branch/review', whatsapp: '+919876543210', phone: '+91 9876543210', address: 'River Road' });
    expect(link('Google review')?.getAttribute('href')).toBe('https://g.page/r/branch/review');
    expect(link('WhatsApp')?.getAttribute('href')).toBe('https://wa.me/919876543210');
    expect(link('Instagram')).toBeUndefined();
    expect(link('Call')?.getAttribute('href')).toBe('tel:+919876543210');
  });
  it('does not activate ordering when the menu is unavailable or create fake review ratings', () => {
    const view = show({ reviewUrl: 'javascript:alert(1)' });
    expect(button().every((b) => b.disabled)).toBe(true);
    expect(link('Google review')).toBeUndefined();
    expect(view.textContent).not.toMatch(/5\.0|5-star/);
  });
  it('uses a menu photograph as the cover without treating an empty image as the current page URL', () => {
    const view = show({}, {}, [{ id: 'thali', name: 'Gujarati Thali', price: 250, imageUrl: 'https://images.example/thali.webp' }]);
    const hero = view.querySelector<HTMLImageElement>('.rp-hero-photo img');
    expect(hero?.src).toBe('https://images.example/thali.webp');
    expect(hero?.getAttribute('loading')).toBe('eager');
    expect(view.querySelectorAll('img[src=""]')).toHaveLength(0);
  });
  it('recovers from a broken owner cover using the available dish photo', () => {
    const view = show({ heroUrl: 'https://images.example/broken.webp' }, {}, [
      { id: 'thali', name: 'Gujarati Thali', price: 250, imageUrl: 'https://images.example/thali.webp' }
    ]);
    act(() => view.querySelector('.rp-hero-photo img')!.dispatchEvent(new Event('error')));
    expect(view.querySelector<HTMLImageElement>('.rp-hero-photo img')?.src).toBe('https://images.example/thali.webp');
  });
  it('keeps every menu item accessible through expansion and name/description search', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Dish ${i}`,
      price: 100,
      description: i === 24 ? 'Special saffron rice' : 'Fresh meal'
    }));
    const view = show({}, { browseMenu: true }, items);
    expect(view.querySelector('#rp-menu')).toBeNull();
    expect(view.querySelector('.rp-nav a[href="#rp-menu"]')).toBeNull();
    act(() => view.querySelector<HTMLButtonElement>('.rp-header-actions .rp-nav-order')!.click());
    const menu = view.querySelector('#rp-menu')!;
    expect(menu.querySelectorAll('.rp-dish')).toHaveLength(8);
    act(() => menu.querySelector<HTMLButtonElement>('.rp-more-menu')!.click());
    expect(menu.querySelectorAll('.rp-dish')).toHaveLength(20);
    act(() => menu.querySelector<HTMLButtonElement>('.rp-more-menu')!.click());
    expect(menu.querySelectorAll('.rp-dish')).toHaveLength(25);
    const input = menu.querySelector('input')!;
    const search = (value: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    search('saffron');
    expect(menu.querySelectorAll('.rp-dish')).toHaveLength(1);
    expect(menu.textContent).toContain('Dish 24');
    search('unavailable dish');
    expect(menu.querySelectorAll('.rp-dish')).toHaveLength(0);
    expect(menu.textContent).toContain('No matching dishes');
  });
  it('keeps the full menu out of the landing page and toggles accessible page navigation', () => {
    const view = show({ address: 'River Road' });
    expect(view.querySelector('#rp-menu')).toBeNull();
    expect(view.querySelector('#rp-visit')).not.toBeNull();
    const toggle = view.querySelector<HTMLButtonElement>('.rp-nav-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(view.querySelector('nav')?.className).toContain('rp-nav-open');
  });
  it('opens browse-only menus without inventing an order link and restores document scrolling on close', () => {
    const view = show({}, { browseMenu: true });
    act(() => view.querySelector<HTMLButtonElement>('.rp-header-actions .rp-nav-order')!.click());
    expect(view.querySelector('dialog[open]')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(view.querySelector('.rp-menu-dialog-order')).toBeNull();
    act(() => view.querySelector<HTMLButtonElement>('.rp-menu-close')!.click());
    expect(view.querySelector('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
  it('shows the real ordering label in previews while preventing a real ordering navigation', () => {
    const onMenu = vi.fn();
    const view = show({}, { preview: true, onMenu }, undefined, { table: null, orderOnlineUrl: 'https://restaurant.example/q/order' });
    const orderLink = view.querySelector<HTMLAnchorElement>('a.rp-order')!;
    expect(orderLink.textContent).toContain('Order online');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => orderLink.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(onMenu).toHaveBeenCalledOnce();
  });
  it('does not advertise online ordering when there are no published dishes', () => {
    const view = show({}, {}, [], { table: null, orderOnlineUrl: 'https://restaurant.example/q/order' });
    expect(view.querySelector('a.rp-order')).toBeNull();
    expect(view.querySelector<HTMLButtonElement>('button.rp-order')?.disabled).toBe(true);
  });
  it('loads the actual location map only when requested', () => {
    const view = show({ address: 'River Road, Ahmedabad' });
    expect(view.querySelector('iframe')).toBeNull();
    act(() => view.querySelector<HTMLButtonElement>('.rp-load-map')!.click());
    expect(view.querySelector('iframe')?.getAttribute('src')).toBe('https://maps.google.com/maps?q=River%20Road%2C%20Ahmedabad&output=embed');
  });
  it('uses the configured order route in the same tab and keeps the landing page separate', () => {
    const view = show({}, { browseMenu: true }, undefined, { table: null, orderOnlineUrl: 'https://restaurant.example/q/branch-order' });
    const order = view.querySelector<HTMLAnchorElement>('.rp-header a.rp-nav-order')!;
    expect(order.href).toBe('https://restaurant.example/q/branch-order#menu');
    expect(order.target).toBe('');
    expect(view.querySelector('#rp-menu')).toBeNull();
  });
});

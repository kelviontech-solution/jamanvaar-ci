// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RestaurantPage } from '../packages/ui/src/restaurant-page/RestaurantPage';
import { DEFAULT_RESTAURANT_PAGE, RestaurantPageContent } from '../packages/ui/src/restaurant-page/types';
let root: Root | undefined, container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
});
const button = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((b) => b.textContent?.includes('View menu'));
const link = (text: string) => Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find((a) => a.textContent?.includes(text));
function show(content: Partial<RestaurantPageContent> = {}, options: { preview?: boolean; onMenu?: () => void } = {}) {
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
          currency: 'INR'
        }}
        items={[{ id: 'thali', name: 'Gujarati Thali', price: 250, allergens: ['Milk'] }]}
        {...options}
      />
    )
  );
  return container;
}
describe('shared restaurant page renderer', () => {
  it.each(['HERITAGE', 'CAFE', 'MODERN'] as const)('renders %s using the same preview and public component', (template) => {
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
});

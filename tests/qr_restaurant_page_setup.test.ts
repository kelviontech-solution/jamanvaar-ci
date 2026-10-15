import { describe, it, expect } from 'vitest';
import { DEFAULT_RESTAURANT_PAGE as defaults } from '../packages/ui/src/restaurant-page/types';
import {
  fillPageDetails,
  pagePublicationStatus,
  pagePublishIssue,
  samePage
} from '../apps/restaurant-system/pos-admin/src/components/qrconsole/restaurantPageSetup';

describe('restaurant page setup and publication guidance', () => {
  it('fills only missing fields without changing existing design, scan destination or contact information', () => {
    const draft = { ...defaults, title: 'Our custom name', phone: '+919876543210', template: 'CAFE' as const };
    const result = fillPageDetails(draft, 'Restaurant One', 'Branch address');
    expect(result).toMatchObject({
      title: draft.title,
      welcome: 'Welcome to Restaurant One. Explore our menu and make yourself at home.',
      address: 'Branch address',
      phone: draft.phone,
      template: 'CAFE',
      enabled: false,
      entryMode: 'MENU'
    });
    expect(draft.welcome).toBe('');
    expect(fillPageDetails({ ...result, address: 'Custom location' }, 'Other', 'Other address').address).toBe('Custom location');
  });
  it('keeps generated text within the server limits and treats whitespace as missing', () => {
    const filled = fillPageDetails({ ...defaults, title: ' ', welcome: '\n' }, 'R'.repeat(500), 'A'.repeat(900));
    expect(filled.title.length).toBe(100);
    expect(filled.welcome.length).toBe(400);
    expect(filled.address.length).toBe(500);
  });
  it('distinguishes access, unpublished drafts, changed publications, switched-off and live scan modes', () => {
    const live = { ...defaults, enabled: true, title: 'Restaurant', welcome: 'Hello', entryMode: 'PAGE' as const };
    expect(pagePublicationStatus(live, live, false)).toBe('Access not included');
    expect(pagePublicationStatus(null, live, true)).toBe('Not published');
    expect(pagePublicationStatus(live, { ...live, welcome: 'New draft' }, true)).toBe('Changes not published');
    expect(pagePublicationStatus(defaults, defaults, true)).toBe('Page switched off');
    expect(pagePublicationStatus(live, live, true)).toBe('Live · page first');
    expect(pagePublicationStatus({ ...live, entryMode: 'MENU' }, { ...live, entryMode: 'MENU' }, true)).toBe('Live · menu first');
  });
  it('ignores API object key order but detects gallery and featured dish order changes', () => {
    expect(samePage(defaults, Object.fromEntries(Object.entries(defaults).reverse()) as typeof defaults)).toBe(true);
    expect(samePage({ ...defaults, featuredItemIds: ['a', 'b'] }, { ...defaults, featuredItemIds: ['b', 'a'] })).toBe(false);
  });
  it('allows switching off an incomplete page and does not require optional contact, menu or images', () => {
    expect(pagePublishIssue(defaults)).toBeNull();
    expect(pagePublishIssue({ ...defaults, enabled: true })).toContain('heading');
    expect(pagePublishIssue({ ...defaults, enabled: true, title: 'Name' })).toContain('welcome');
    expect(pagePublishIssue({ ...defaults, enabled: true, title: 'Name', welcome: 'Hello' })).toBeNull();
  });
});

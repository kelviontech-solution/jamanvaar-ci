// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { diverseSignatureDishes, restaurantOpeningStatus } from '../packages/ui/src/restaurant-page/restaurant-hours';
import { restaurantLabel, restaurantLabelCoverage } from '../packages/ui/src/restaurant-page/restaurant-labels';
import { DEFAULT_RESTAURANT_PAGE, type RestaurantBusinessHours } from '../packages/ui/src/restaurant-page/types';
import { RestaurantPage } from '../packages/ui/src/restaurant-page/RestaurantPage';
import { pagePublishIssue } from '../apps/restaurant-system/pos-admin/src/components/qrconsole/restaurantPageSetup';
const schedule = (): RestaurantBusinessHours => ({
  timezone: 'Asia/Kolkata',
  weekly: Array.from({ length: 7 }, (_, day) => ({ day, intervals: [{ start: '10:00', end: '22:00' }] })),
  exceptions: []
});
const status = (hours: RestaurantBusinessHours, date: string) => restaurantOpeningStatus(hours, Date.parse(date));
describe('restaurant physical opening status', () => {
  it('uses the restaurant timezone and exclusive closing boundary', () => {
    expect(status(schedule(), '2026-10-19T04:29:00Z')?.open).toBe(false);
    expect(status(schedule(), '2026-10-19T04:30:00Z')?.open).toBe(true);
    expect(status(schedule(), '2026-10-19T16:30:00Z')?.open).toBe(false);
  });
  it('handles split shifts and shows the next opening', () => {
    const hours = schedule();
    hours.weekly[1].intervals = [
      { start: '10:00', end: '14:00' },
      { start: '18:00', end: '22:00' }
    ];
    expect(status(hours, '2026-10-19T09:00:00Z')).toMatchObject({ open: false, next: { date: '2026-10-19', time: '18:00' } });
  });
  it('carries an overnight shift into the next day but honours a closed holiday', () => {
    const hours = schedule();
    hours.weekly.forEach((row) => (row.intervals = []));
    hours.weekly[1].intervals = [{ start: '18:00', end: '02:00' }];
    expect(status(hours, '2026-10-19T19:30:00Z')?.open).toBe(true);
    expect(status(hours, '2026-10-19T20:30:00Z')?.open).toBe(false);
    hours.exceptions = [{ date: '2026-10-20', intervals: [] }];
    expect(status(hours, '2026-10-19T19:30:00Z')?.open).toBe(false);
  });
  it('replaces normal hours with a special date and crosses the year boundary', () => {
    const hours = schedule();
    hours.exceptions = [{ date: '2026-12-31', intervals: [{ start: '20:00', end: '02:00' }] }];
    expect(status(hours, '2026-12-31T08:00:00Z')?.open).toBe(false);
    expect(status(hours, '2026-12-31T19:00:00Z')?.open).toBe(true);
  });
  it('uses real local wall-clock hours over a daylight saving transition', () => {
    const hours = schedule();
    hours.timezone = 'America/New_York';
    hours.weekly[0].intervals = [{ start: '01:00', end: '02:00' }];
    expect(status(hours, '2026-11-01T05:30:00Z')?.open).toBe(true);
    expect(status(hours, '2026-11-01T06:30:00Z')?.open).toBe(true);
    expect(status(hours, '2026-11-01T07:00:00Z')?.open).toBe(false);
  });
  it('does not guess a status from prose or an invalid timezone', () => {
    expect(restaurantOpeningStatus(null)).toBeNull();
    expect(status({ ...schedule(), timezone: 'bad/timezone' }, '2026-10-19T08:00Z')).toBeNull();
    const hours = schedule();
    hours.weekly[1].intervals = [{ start: '', end: '' }];
    expect(pagePublishIssue({ ...DEFAULT_RESTAURANT_PAGE, businessHours: hours })).toMatch(/Opening hours/);
  });
});
describe('signature variety and labels', () => {
  const items = [
    { id: 'a', categoryId: 'meal' },
    { id: 'b', categoryId: 'meal' },
    { id: 'c', categoryId: 'drink' },
    { id: 'd', categoryId: 'dessert' }
  ];
  it('picks distinct categories before repeating one', () => expect(diverseSignatureDishes(items, []).map((v) => v.id)).toEqual(['a', 'c', 'd']));
  it('keeps the owner’s explicit order and never replaces choices automatically', () =>
    expect(diverseSignatureDishes(items, ['b', 'a', 'missing']).map((v) => v.id)).toEqual(['b', 'a']));
  it('fills small catalogues without duplicate dishes', () => expect(diverseSignatureDishes(items.slice(0, 2), []).map((v) => v.id)).toEqual(['a', 'b']));
  it('has every customer UI label in all eight supported languages', () => {
    for (const coverage of Object.values(restaurantLabelCoverage())) expect(coverage.actual).toBe(coverage.expected);
    expect(restaurantLabel('gu', 'menu')).toBe('મેનૂ');
    expect(restaurantLabel('xx', 'menu')).toBe('Menu');
  });
});
let root: Root | undefined, host: HTMLDivElement;
beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  host?.remove();
});
it('combines translated category filters with search without showing the catalogue on the landing page', () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <RestaurantPage
        browseMenu
        language="gu"
        page={{
          restaurantName: 'River',
          branchName: 'Main',
          currency: 'INR',
          content: { ...DEFAULT_RESTAURANT_PAGE, enabled: true, translations: { gu: { title: 'નદી', welcome: 'આવો' } }, businessHours: schedule() }
        }}
        categories={[
          { id: 'drinks', name: 'Drinks', translations: { gu: { name: 'પીણાં' } } },
          { id: 'meals', name: 'Meals' }
        ]}
        items={[
          { id: 'a', categoryId: 'meals', name: 'Thali', price: 250 },
          { id: 'b', categoryId: 'drinks', name: 'Lassi', translations: { gu: { name: 'લસ્સી' } }, price: 50 }
        ]}
      />
    )
  );
  expect(host.querySelector('#rp-menu')).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('.rp-header-actions .rp-nav-order')!.click());
  const filter = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'પીણાં')!;
  act(() => filter.click());
  expect(host.querySelector('#rp-menu')?.textContent).toContain('લસ્સી');
  expect(host.querySelector('#rp-menu')?.textContent).not.toContain('Thali');
  expect(filter.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('.rp-opening-status')).not.toBeNull();
});

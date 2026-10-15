import { describe, it, expect } from 'vitest';
import { DEFAULT_RESTAURANT_PAGE as defaults } from '../packages/ui/src/restaurant-page/types';
import { translatedPage, noticeIsActive, pageDifferences } from '../packages/ui/src/restaurant-page/page-content';
describe('page translation, notice windows and publication comparison', () => {
  it('uses translated fields individually and falls back to main text for blanks', () => {
    const page = {
      ...defaults,
      title: 'Main heading',
      welcome: 'Main welcome',
      hours: 'Main hours',
      translations: { gu: { welcome: 'સ્વાગત', title: ' ', hours: 'સમય' } }
    };
    expect(translatedPage(page, 'gu')).toMatchObject({ title: 'Main heading', welcome: 'સ્વાગત', hours: 'સમય' });
    expect(translatedPage(page, 'hi').welcome).toBe('Main welcome');
    expect(page.title).toBe('Main heading');
  });
  it('shows a notice at the start and removes it at the exact end, including translated notices', () => {
    const page = {
      ...defaults,
      notice: 'Festival',
      noticeStart: '2026-10-15T10:00:00Z',
      noticeEnd: '2026-10-15T11:00:00Z',
      translations: { hi: { notice: 'त्योहार' } }
    };
    expect(noticeIsActive(page, Date.parse('2026-10-15T09:59:59Z'))).toBe(false);
    expect(translatedPage(page, 'hi', Date.parse(page.noticeStart)).notice).toBe('त्योहार');
    expect(translatedPage(page, 'hi', Date.parse(page.noticeEnd)).notice).toBe('');
    expect(translatedPage({ ...page, noticeStart: '', noticeEnd: '' }, 'hi', 0).notice).toBe('त्योहार');
  });
  it('compares every persisted setting, including translations, privacy, photos and schedules', () => {
    expect(
      pageDifferences(defaults, {
        ...defaults,
        title: 'New',
        heroPositionX: 75,
        engagementEnabled: true,
        translations: { gu: { welcome: 'Hello' } },
        noticeEnd: '2026-10-15T11:00:00Z'
      }).map((d) => d.key)
    ).toEqual(expect.arrayContaining(['title', 'heroPositionX', 'engagementEnabled', 'translations', 'noticeEnd']));
    expect(pageDifferences(defaults, { ...defaults })).toEqual([]);
  });
});

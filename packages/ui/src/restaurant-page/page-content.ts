import { DEFAULT_RESTAURANT_PAGE, PAGE_TRANSLATED_FIELDS, type RestaurantPageContent } from './types';
export function noticeIsActive(content: RestaurantPageContent, now = Date.now()) {
  const start = content.noticeStart ? Date.parse(content.noticeStart) : -Infinity;
  const end = content.noticeEnd ? Date.parse(content.noticeEnd) : Infinity;
  return now >= start && now < end;
}
export function translatedPage(content: RestaurantPageContent, language: string, now = Date.now()): RestaurantPageContent {
  const result = { ...DEFAULT_RESTAURANT_PAGE, ...content };
  const translation = content.translations?.[language];
  for (const key of PAGE_TRANSLATED_FIELDS) if (translation?.[key]?.trim()) result[key] = translation[key]!;
  if (!noticeIsActive(result, now)) result.notice = '';
  return result;
}
export function pageDifferences(before: RestaurantPageContent | null, after: RestaurantPageContent) {
  const a = { ...DEFAULT_RESTAURANT_PAGE, ...before },
    b = { ...DEFAULT_RESTAURANT_PAGE, ...after };
  return (Object.keys(DEFAULT_RESTAURANT_PAGE) as (keyof RestaurantPageContent)[])
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((key) => ({ key, before: a[key], after: b[key] }));
}

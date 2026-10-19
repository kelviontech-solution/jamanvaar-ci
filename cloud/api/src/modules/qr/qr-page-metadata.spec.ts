import { describe, expect, it } from 'vitest';
import { restaurantPageHead } from './qr-page-metadata';
import { restaurantBusinessHoursSchema } from './qr-restaurant-page.schema';
const content = {
  title: 'Welcome',
  welcome: 'Fresh food',
  address: 'River Road',
  phone: '+919876543210',
  instagram: '',
  heroUrl: '/assets/meal.webp',
  logoUrl: ''
};
describe('published restaurant metadata', () => {
  it('returns restaurant-specific metadata without requiring JavaScript', () => {
    const head = restaurantPageHead({ restaurantName: 'River Kitchen', branchName: 'West', content }, 'https://example.test/q/site/river-west');
    expect(head).toContain('<title>River Kitchen · West</title>');
    expect(head).toContain('https://example.test/q/assets/meal.webp');
    expect(head).toContain('property="og:url" content="https://example.test/q/site/river-west"');
    expect(head).toContain('summary_large_image');
  });
  it('escapes both HTML attributes and script-closing content', () => {
    const attack = '</script><script>alert("x")</script>';
    const head = restaurantPageHead(
      { restaurantName: attack, branchName: 'Main', content: { ...content, seo: { title: '" onclick="bad', description: attack, imageUrl: '' } } },
      'https://example.test/q/site/river'
    );
    expect(head).not.toContain(attack);
    expect(head.match(/<script/g)).toHaveLength(1);
    expect(head).toContain('&quot; onclick=&quot;bad');
    const json = JSON.parse(head.match(/application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(json.name).toBe(attack);
  });
  it('includes closed days and holiday exceptions without fabricated ratings', () => {
    const head = restaurantPageHead(
      {
        restaurantName: 'River',
        branchName: 'Main',
        content: { ...content, businessHours: { weekly: [{ day: 1, intervals: [] }], exceptions: [{ date: '2026-12-25', intervals: [] }] } }
      },
      'https://example.test/q/site/river'
    );
    const json = JSON.parse(head.match(/application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(json.openingHoursSpecification[0]).toMatchObject({ opens: '00:00', closes: '00:00' });
    expect(json.specialOpeningHoursSpecification[0]).toMatchObject({ validFrom: '2026-12-25', validThrough: '2026-12-25', opens: '00:00', closes: '00:00' });
    expect(json.aggregateRating).toBeUndefined();
  });
});
describe('structured opening-hours input', () => {
  const hours = () => ({
    timezone: 'Asia/Kolkata',
    weekly: Array.from({ length: 7 }, (_, day) => ({ day, intervals: [{ start: '10:00', end: '22:00' }] })),
    exceptions: [] as Array<{ date: string; intervals: Array<{ start: string; end: string }> }>
  });
  it('accepts split shifts, overnight hours and closed holiday exceptions', () => {
    const h = hours();
    h.weekly[1].intervals = [
      { start: '10:00', end: '14:00' },
      { start: '18:00', end: '02:00' }
    ];
    h.exceptions = [{ date: '2026-12-25', intervals: [] }];
    expect(restaurantBusinessHoursSchema.safeParse(h).success).toBe(true);
  });
  it('rejects invalid clocks, overlapping shifts, duplicate weekdays, invalid dates and zones', () => {
    for (const transform of [
      (h: ReturnType<typeof hours>) => {
        h.timezone = 'bad/zone';
      },
      (h: ReturnType<typeof hours>) => {
        h.weekly[1].intervals = [{ start: '25:00', end: '22:00' }];
      },
      (h: ReturnType<typeof hours>) => {
        h.weekly[1].intervals = [{ start: '10:00', end: '10:00' }];
      },
      (h: ReturnType<typeof hours>) => {
        h.weekly[1].intervals = [
          { start: '10:00', end: '15:00' },
          { start: '14:00', end: '22:00' }
        ];
      },
      (h: ReturnType<typeof hours>) => {
        h.weekly[1].day = 0;
      },
      (h: ReturnType<typeof hours>) => {
        h.exceptions = [{ date: '2026-02-30', intervals: [] }];
      }
    ]) {
      const h = hours();
      transform(h);
      expect(restaurantBusinessHoursSchema.safeParse(h).success).toBe(false);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { relativeTime } from '../cloud/super-admin-web/src/lib/relativeTime';

/** BUG-069: "Last seen" showed only a time of day, so a week-old check-in looked like today's. */
describe('relativeTime', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('says "Never" when there is no time', () => {
    expect(relativeTime(null, now)).toBe('Never');
    expect(relativeTime(undefined, now)).toBe('Never');
    expect(relativeTime('not a date', now)).toBe('Never');
  });

  it('shows seconds, minutes, hours and days', () => {
    expect(relativeTime(ago(10_000), now)).toBe('just now');
    expect(relativeTime(ago(3 * 60_000), now)).toBe('3 min ago');
    expect(relativeTime(ago(5 * 3600_000), now)).toBe('5 hr ago');
    expect(relativeTime(ago(26 * 3600_000), now)).toBe('1 day ago');
    expect(relativeTime(ago(9 * 86400_000), now)).toBe('9 days ago');
  });

  it('never goes negative for a clock slightly ahead', () => {
    expect(relativeTime(new Date(now.getTime() + 5000).toISOString(), now)).toBe('just now');
  });
});

/**
 * "3 min ago" for recent times, so an operator can tell at a glance how stale something is (BUG-069:
 * "Last seen 9:48 PM" could have been today or last week). Pair it with an absolute date for the tooltip.
 */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never';
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "19 Sep, 4:34 pm" - always carries the date. */
export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

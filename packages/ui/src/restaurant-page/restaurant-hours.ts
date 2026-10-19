import type { RestaurantBusinessHours, RestaurantHoursInterval } from './types';
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function diverseSignatureDishes<T extends { id: string; categoryId?: string }>(items: T[], selected: string[], limit = 3): T[] {
  if (selected.length) return selected.map((id) => items.find((item) => item.id === id)).filter((item): item is T => !!item);
  const result: T[] = [],
    seen = new Set<string>();
  for (const item of items)
    if (item.categoryId && !seen.has(item.categoryId)) {
      seen.add(item.categoryId);
      result.push(item);
      if (result.length === limit) return result;
    }
  for (const item of items)
    if (!result.some((value) => value.id === item.id)) {
      result.push(item);
      if (result.length === limit) break;
    }
  return result;
}
/** Display-only physical hours. It never changes QR ordering/payment availability. */
export function restaurantOpeningStatus(hours: RestaurantBusinessHours | null | undefined, now = Date.now()) {
  if (!hours) return null;
  if (
    [...hours.weekly, ...hours.exceptions].some((row) =>
      row.intervals.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.end) || value.start === value.end)
    )
  )
    return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: hours.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`,
      current = Number(parts.hour) * 60 + Number(parts.minute);
    const dayDate = new Date(date + 'T12:00:00Z');
    const intervalsFor = (value: Date): RestaurantHoursInterval[] => {
      const key = value.toISOString().slice(0, 10),
        exception = hours.exceptions.find((row) => row.date === key);
      return exception ? exception.intervals : (hours.weekly.find((row) => row.day === value.getUTCDay())?.intervals ?? []);
    };
    const today = intervalsFor(dayDate),
      previousDate = new Date(dayDate.getTime() - 86400000);
    const explicitlyClosed = hours.exceptions.some((row) => row.date === date && row.intervals.length === 0);
    const open =
      today.some((row) => {
        const start = minutes(row.start),
          end = minutes(row.end);
        return current >= start && (end <= start || current < end);
      }) ||
      (!explicitlyClosed && intervalsFor(previousDate).some((row) => minutes(row.end) <= minutes(row.start) && current < minutes(row.end)));
    let next: { date: string; time: string } | null = null;
    if (!open)
      for (let offset = 0; offset < 15 && !next; offset++) {
        const value = new Date(dayDate.getTime() + offset * 86400000);
        const future = intervalsFor(value)
          .filter((row) => offset > 0 || minutes(row.start) > current)
          .sort((a, b) => a.start.localeCompare(b.start));
        if (future[0]) next = { date: value.toISOString().slice(0, 10), time: future[0].start };
      }
    return { open, next, timezone: hours.timezone, date };
  } catch {
    return null;
  }
}

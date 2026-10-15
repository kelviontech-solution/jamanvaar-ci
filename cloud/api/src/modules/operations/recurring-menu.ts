export interface RecurringWindow {
  days: number[];
  open: string;
  close: string;
  skipDates: string[];
}
export function recurringActive(window: RecurringWindow, timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${part('year')}-${part('month')}-${part('day')}`,
    day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday')),
    time = `${part('hour')}:${part('minute')}`;
  return window.days.includes(day) && !window.skipDates.includes(date) && time >= window.open && time < window.close;
}
export function recurringOverlap(a: RecurringWindow, b: RecurringWindow) {
  return a.days.some((d) => b.days.includes(d)) && a.open < b.close && b.open < a.close;
}

/**
 * JAMANVAAR Central Timezone & Restaurant Date Utilities
 * Authoritative Indian Restaurant Standard (Asia/Kolkata)
 */

export const RESTAURANT_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current timestamp in UTC ISO string
 */
export function getUtcIsoString(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Formats a given date/string in Indian Restaurant Timezone (Asia/Kolkata)
 */
export function formatRestaurantDate(
  dateInput: Date | string | number = new Date(),
  format: 'DISPLAY_FULL' | 'DATE_ONLY' | 'TIME_ONLY' | 'SHORT' | 'ISO_DATE' = 'DISPLAY_FULL'
): string {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'Invalid Date';

  switch (format) {
    case 'DATE_ONLY':
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: RESTAURANT_TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(date);

    case 'TIME_ONLY':
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: RESTAURANT_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(date);

    case 'SHORT':
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: RESTAURANT_TIMEZONE,
        day: 'numeric',
        month: 'short'
      }).format(date);

    case 'ISO_DATE': {
      // Return YYYY-MM-DD in Asia/Kolkata
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: RESTAURANT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      const y = parts.find((p) => p.type === 'year')?.value || '2026';
      const m = parts.find((p) => p.type === 'month')?.value || '08';
      const d = parts.find((p) => p.type === 'day')?.value || '31';
      return `${y}-${m}-${d}`;
    }

    case 'DISPLAY_FULL':
    default:
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: RESTAURANT_TIMEZONE,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(date);
  }
}

/**
 * Returns formatted restaurant business day ID e.g. "BD-20260831"
 */
export function generateBusinessDayId(dateInput: Date | string = new Date()): string {
  const iso = formatRestaurantDate(dateInput, 'ISO_DATE');
  return `BD-${iso.replace(/-/g, '')}`;
}

/**
 * Returns human readable display date e.g. "31 August 2026"
 */
export function getBusinessDayDisplayDate(dateInput: Date | string = new Date()): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: RESTAURANT_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

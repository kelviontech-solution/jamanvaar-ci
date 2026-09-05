/**
 * Time and Date Formatting Utilities
 */

export function formatTime(isoString?: string | Date | null): string {
  if (!isoString) return '--:--';
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (!date || isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export function formatDate(isoString?: string | Date | null): string {
  if (!isoString) return '--/--/----';
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (!date || isNaN(date.getTime())) return '--/--/----';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

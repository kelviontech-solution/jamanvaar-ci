import type { Restaurant, Outlet } from '@jamanvaar/types';

export interface OperatingProfile { timezone: string; cutoffHour: number; effectiveFrom?: string; previous?: { timezone: string; cutoffHour: number }; inherit?: boolean }
export function validTimezone(timezone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); return true; } catch { return false; }
}
export function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function resolveOperatingProfile(restaurant: Pick<Restaurant, 'businessDayCutoffHour' | 'operatingProfile'>, branch?: Pick<Outlet, 'operatingProfile'>, at = new Date()) {
  const profile = branch?.operatingProfile ?? restaurant.operatingProfile;
  const fallback = { timezone: 'Asia/Kolkata', cutoffHour: restaurant.businessDayCutoffHour ?? 5 };
  if (!profile) return fallback;
  const previous = profile.previous ?? fallback;
  if (branch?.operatingProfile?.inherit && (!profile.effectiveFrom || localDateKey(at, previous.timezone) >= profile.effectiveFrom)) return resolveOperatingProfile(restaurant, undefined, at);
  const selected = profile.effectiveFrom && localDateKey(at, previous.timezone) < profile.effectiveFrom ? previous : profile;
  return { timezone: validTimezone(selected.timezone) ? selected.timezone : fallback.timezone, cutoffHour: Number.isInteger(selected.cutoffHour) && selected.cutoffHour >= 0 && selected.cutoffHour <= 23 ? selected.cutoffHour : fallback.cutoffHour };
}

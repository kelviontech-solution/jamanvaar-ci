import { BadRequestException } from '@nestjs/common';

export function dateIn(timezone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function scheduleProfile(current: { timezone: string; cutoffHour: number }, next: { timezone?: string; cutoffHour?: number; effectiveFrom?: string; inherit?: boolean }, at = new Date()) {
  const tomorrow = new Date(`${dateIn(current.timezone, at)}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const effectiveFrom = next.effectiveFrom ?? tomorrow.toISOString().slice(0, 10);
  const parsed = new Date(`${effectiveFrom}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== effectiveFrom || effectiveFrom <= dateIn(current.timezone, at)) throw new BadRequestException('Operating changes must start on a future restaurant calendar date');
  return { timezone: next.timezone ?? current.timezone, cutoffHour: next.cutoffHour ?? current.cutoffHour, effectiveFrom, previous: current, ...(next.inherit ? { inherit: true } : {}) };
}
export function activeProfile(profile: unknown, fallback: { timezone: string; cutoffHour: number }, at = new Date()): {timezone: string; cutoffHour: number} {
  if (!profile || typeof profile !== 'object') return fallback;
  const value = profile as {timezone?:string;cutoffHour?:number;effectiveFrom?:string;previous?:{timezone:string;cutoffHour:number};inherit?:boolean};
  const previous = value.previous ?? fallback;
  if (value.effectiveFrom && dateIn(previous.timezone,at) < value.effectiveFrom) return previous;
  if (value.inherit) return fallback;
  return {timezone:value.timezone ?? fallback.timezone,cutoffHour:value.cutoffHour ?? fallback.cutoffHour};
}

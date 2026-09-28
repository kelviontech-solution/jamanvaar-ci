import type { Order } from '@jamanvaar/types';

export interface DishPrepRow {
  menuItemId: string;
  name: string;
  station: string;
  /** Portions cooked in the period. */
  portions: number;
  avgMinutes: number;
  medianMinutes: number;
  /** 9 in 10 portions were ready within this many minutes. */
  p90Minutes: number;
  slowestMinutes: number;
  /** What the menu says the dish should take, when it says. */
  targetMinutes?: number;
  /** Share of portions that were ready within the target, 0 to 100. Absent when there is no target. */
  onTimePercent?: number;
}

export interface StationPrepRow {
  station: string;
  portions: number;
  avgMinutes: number;
  p90Minutes: number;
}

export interface PrepTimeReport {
  dishes: DishPrepRow[];
  stations: StationPrepRow[];
  /** Portions with a recorded time; portions still cooking or with no time are left out, and counted here. */
  measured: number;
  unmeasured: number;
}

export interface PrepTimeInput {
  orders: Order[];
  from: Date;
  to: Date;
  targetOf?: (menuItemId: string) => number | undefined;
  stationOf?: (menuItemId: string) => string | undefined;
}

/** A dish left open overnight would report a cooking time of hours; anything past this is a forgotten ticket, not a slow dish. */
const IMPLAUSIBLE_MINUTES = 180;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

/**
 * How long each dish really takes, from the moment it was sent to the kitchen to the moment the cook marked it done. Both times are
 * kept on the order line, so the answer is the same on every device and does not depend on when a screen happened to hear about it.
 * A line with no send time counts from when the order was created. Dishes still cooking or cancelled are left out.
 */
export function buildPrepTimeReport({ orders, from, to, targetOf, stationOf }: PrepTimeInput): PrepTimeReport {
  const perDish = new Map<string, { name: string; station: string; minutes: number[] }>();
  const perStation = new Map<string, number[]>();
  let measured = 0;
  let unmeasured = 0;

  for (const order of orders) {
    for (const line of order.items ?? []) {
      if (line.kitchenStatus === 'CANCELLED') continue;
      const done = line.kitchenStatus === 'READY' || line.kitchenStatus === 'SERVED';
      if (!done) continue;
      const sent = new Date(line.sentAt ?? order.createdAt).getTime();
      if (!Number.isFinite(sent) || sent < from.getTime() || sent > to.getTime()) continue;
      const ready = line.readyAt ? new Date(line.readyAt).getTime() : NaN;
      const minutes = (ready - sent) / 60000;
      const qty = line.quantity || 1;
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > IMPLAUSIBLE_MINUTES) { unmeasured += qty; continue; }
      const station = stationOf?.(line.menuItemId) || 'Main Kitchen';
      const entry = perDish.get(line.menuItemId) ?? { name: line.name, station, minutes: [] };
      const st = perStation.get(station) ?? [];
      for (let n = 0; n < qty; n += 1) { entry.minutes.push(minutes); st.push(minutes); }
      perDish.set(line.menuItemId, entry);
      perStation.set(station, st);
      measured += qty;
    }
  }

  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      avg: round1(sorted.reduce((sum, v) => sum + v, 0) / sorted.length),
      median: round1(percentile(sorted, 0.5)),
      p90: round1(percentile(sorted, 0.9)),
      max: round1(sorted[sorted.length - 1])
    };
  };

  const dishes: DishPrepRow[] = [...perDish.entries()].map(([menuItemId, d]) => {
    const s = stats(d.minutes);
    const target = targetOf?.(menuItemId);
    const hasTarget = typeof target === 'number' && target > 0;
    return {
      menuItemId, name: d.name, station: d.station, portions: d.minutes.length,
      avgMinutes: s.avg, medianMinutes: s.median, p90Minutes: s.p90, slowestMinutes: s.max,
      ...(hasTarget ? { targetMinutes: target, onTimePercent: Math.round((d.minutes.filter((m) => m <= target!).length / d.minutes.length) * 100) } : {})
    };
  }).sort((a, b) => b.avgMinutes - a.avgMinutes);

  const stations: StationPrepRow[] = [...perStation.entries()].map(([station, minutes]) => {
    const s = stats(minutes);
    return { station, portions: minutes.length, avgMinutes: s.avg, p90Minutes: s.p90 };
  }).sort((a, b) => b.avgMinutes - a.avgMinutes);

  return { dishes, stations, measured, unmeasured };
}

import type { OrderItem } from '@jamanvaar/types';
import { db } from './db';

/**
 * How many items each kitchen station has to make for an order, from the station each dish is actually assigned to
 * (its own `kitchenStation`, else the restaurant's menu, else the main kitchen). It reads the restaurant's data; it
 * makes no assumption about what a station is called or which dishes belong where.
 */
export function summarizeStations(items: OrderItem[]): { stationBreakdown: Record<string, number>; summaryText: string } {
  const stationBreakdown: Record<string, number> = {};
  for (const it of items) {
    const station = (it as OrderItem & { kitchenStation?: string }).kitchenStation || db.menuItems.find((m) => m.id === it.menuItemId)?.kitchenStation || 'Main Kitchen';
    stationBreakdown[station] = (stationBreakdown[station] ?? 0) + it.quantity;
  }
  const summaryText = Object.entries(stationBreakdown)
    .map(([st, c]) => `${st}: ${c} ${c === 1 ? 'item' : 'items'}`)
    .join(' • ');
  return { stationBreakdown, summaryText };
}

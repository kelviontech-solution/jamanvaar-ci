import type { KOTItem, KOTRecord } from '@jamanvaar/types';
import { kitchenRank } from '@jamanvaar/database';

/**
 * Pure helpers behind the kitchen screen: what a dish or ticket looks like right now, how old it is, what is worth a
 * warning. Kept apart from the screen so they can be tested without rendering anything.
 */

export const COURSE_LABEL: Record<string, string> = { COURSE_1: 'Starters', COURSE_2: 'Mains', COURSE_3: 'Dessert' };

/** What a guest writes when it matters for health or belief; shown in red so it is never read past. */
const ALLERGY_WORDS = /\b(allerg\w*|nuts?|peanuts?|tree ?nuts?|gluten|lactose|dairy|celiac|coeliac|shellfish|sesame|soy|no (onion|garlic|nuts?|dairy|egg)|jain|vegan)\b/i;

export function allergyText(...sources: Array<string | undefined | null | string[]>): string | null {
  for (const s of sources) {
    const text = Array.isArray(s) ? s.join(', ') : s ?? '';
    const m = ALLERGY_WORDS.exec(text);
    if (m) return text.trim();
  }
  return null;
}

export function dishAllergy(item: KOTItem): string | null {
  return allergyText(item.specialInstructions, (item.modifiers ?? []).map((m) => m.optionName));
}

/** The status to show for a dish. Tickets made before per-dish status kept every dish at the ticket's own stage. */
export function effectiveItemStatus(kot: KOTRecord, item: KOTItem): KOTItem['status'] {
  if (item.status === 'CANCELLED') return 'CANCELLED';
  const ticketRank = kitchenRank(kot.status);
  if ((ticketRank === 2 || ticketRank === 3) && kitchenRank(item.status) < ticketRank) return kot.status;
  return item.status;
}

export const liveItems = (kot: KOTRecord): KOTItem[] => (kot.items ?? []).filter((i) => i.status !== 'CANCELLED');

export type TicketAge = { mins: number; secs: number; timeStr: string; level: 'ok' | 'warn' | 'late'; prep: number };

/** Minutes the kitchen should need: the longest prep time among the ticket's dishes (10 when the menu does not say). */
export function prepMinutes(kot: KOTRecord, prepTimeOf: (menuItemId: string) => number | undefined): number {
  const times = liveItems(kot).map((i) => prepTimeOf(i.menuItemId) ?? 0).filter((n) => n > 0);
  const longest = times.length ? Math.max(...times) : 10;
  return Math.min(60, Math.max(4, longest));
}

/** Warns when a ticket has been waiting as long as its dishes should take, and marks it late at one and a half times that. */
export function ticketAge(kot: KOTRecord, nowMs: number, prep: number): TicketAge {
  const created=new Date(kot.createdAt).getTime(),pickup=Date.parse(kot.pickupAt??'');
  const dueStart=Number.isFinite(pickup)?Math.max(created,pickup-prep*60000):created;
  const diff = Math.max(0, nowMs-dueStart);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const level = mins >= Math.ceil(prep * 1.5) ? 'late' : mins >= prep ? 'warn' : 'ok';
  return { mins, secs, timeStr: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, level, prep };
}

/** Dishes still to cook across the given tickets, summed by name, most first: what a cook batches. */
export function prepSummary(kots: KOTRecord[]): Array<{ name: string; qty: number }> {
  const totals = new Map<string, number>();
  for (const kot of kots) {
    if (kot.status === 'SERVED' || kot.status === 'CANCELLED') continue;
    for (const item of kot.items ?? []) {
      const status = effectiveItemStatus(kot, item);
      if (kitchenRank(status) >= 2) continue;
      totals.set(item.name, (totals.get(item.name) ?? 0) + (item.quantity || 1));
    }
  }
  return [...totals.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/** How far along a whole order is across every station's ticket, so a station can see it is holding a table up. */
export function orderProgress(allKots: KOTRecord[], orderId: string): { ready: number; total: number; tickets: number } {
  let ready = 0;
  let total = 0;
  let tickets = 0;
  for (const kot of allKots) {
    if (kot.orderId !== orderId || kot.status === 'CANCELLED') continue;
    tickets += 1;
    for (const item of liveItems(kot)) {
      total += 1;
      if (kitchenRank(effectiveItemStatus(kot, item)) >= 2) ready += 1;
    }
  }
  return { ready, total, tickets };
}

/** A leading # searches an exact token; ordinary text searches across ticket details. */
export function matchesKitchenSearch(kot: KOTRecord, search: string): boolean {
  const query = search.trim().toLowerCase().replace(/^#/, '');
  if (query && search.trim().startsWith('#')) return kot.tokenNumber.toLowerCase().replace(/^#/, '') === query;
  return !query || [kot.tokenNumber, kot.tableNumber, kot.kotNumber, kot.orderNumber, kot.cashierName, kot.station,
    ...kot.items.map(i => i.name)].some(value => value?.toLowerCase().includes(query));
}

export function sortForKitchen(kots: KOTRecord[], priorityOf: (orderId: string) => string | undefined = () => undefined): KOTRecord[] {
  const bucket = (k: KOTRecord) => (k.status === 'CANCELLED' ? 0 : k.status === 'READY' ? 2 : k.status === 'SERVED' ? 3 : 1);
  return [...kots].sort((a, b) => bucket(a) - bucket(b) || Number(priorityOf(b.orderId) === 'URGENT') - Number(priorityOf(a.orderId) === 'URGENT') || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export interface ExpoDish {
  kotId: string;
  itemId: string;
  name: string;
  quantity: number;
  station: string;
  status: KOTItem['status'];
  course?: string;
}

export interface ExpoOrder {
  orderId: string;
  orderNumber: string;
  tokenNumber: string;
  tableNumber?: string;
  orderType: string;
  age: TicketAge;
  dishes: ExpoDish[];
  /** Dishes that are ready and waiting to be taken out / done being served. */
  ready: number;
  served: number;
  /** Dishes not cancelled. */
  total: number;
  /** Every dish is ready or served, and at least one is waiting to go out: the runner can take the whole order. */
  allReady: boolean;
  /** Stations that are still cooking something for this order, with what: the reason the order is held up. */
  waitingOn: Array<{ station: string; dishes: string[] }>;
  ticketIds: string[];
}

/**
 * One row per order across EVERY station, so the person at the pass sees a table's whole order come together: what is ready, what
 * each station still owes, and when it can go out. Orders whose every dish is served or cancelled drop off. Orders that can go out
 * now come first, then the ones waiting longest.
 */
export function buildExpoBoard(kots: KOTRecord[], nowMs: number, prepTimeOf: (menuItemId: string) => number | undefined, priorityOf: (orderId: string) => string | undefined = () => undefined): ExpoOrder[] {
  const byOrder = new Map<string, KOTRecord[]>();
  for (const kot of kots) {
    if (kot.status === 'CANCELLED') continue;
    byOrder.set(kot.orderId, [...(byOrder.get(kot.orderId) ?? []), kot]);
  }

  const board: ExpoOrder[] = [];
  for (const [orderId, tickets] of byOrder) {
    const dishes: ExpoDish[] = [];
    for (const kot of tickets) {
      for (const item of liveItems(kot)) {
        dishes.push({ kotId: kot.id, itemId: item.id, name: item.name, quantity: item.quantity || 1, station: item.kitchenStation || kot.station || 'Main Kitchen', status: effectiveItemStatus(kot, item), course: item.course });
      }
    }
    if (dishes.length === 0 || dishes.every((d) => d.status === 'SERVED')) continue;

    const ready = dishes.filter((d) => d.status === 'READY').length;
    const served = dishes.filter((d) => d.status === 'SERVED').length;
    const cooking = dishes.filter((d) => kitchenRank(d.status) < 2);
    const stations = new Map<string, string[]>();
    for (const d of cooking) stations.set(d.station, [...(stations.get(d.station) ?? []), d.quantity > 1 ? `${d.quantity} x ${d.name}` : d.name]);

    const open = tickets.filter((k) => k.status !== 'SERVED');
    const oldest = [...open].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] ?? tickets[0];
    const prep = Math.max(...open.map((k) => prepMinutes(k, prepTimeOf)), 4);
    const first = tickets[0];
    board.push({
      orderId, orderNumber: first.orderNumber, tokenNumber: first.tokenNumber, tableNumber: first.tableNumber, orderType: first.orderType,
      age: ticketAge(oldest, nowMs, prep), dishes, ready, served, total: dishes.length,
      allReady: cooking.length === 0 && ready > 0,
      waitingOn: [...stations.entries()].map(([station, names]) => ({ station, dishes: names })),
      ticketIds: open.map((k) => k.id)
    });
  }

  const rank = (o: ExpoOrder) => (o.allReady ? 0 : o.age.level === 'late' ? 1 : o.age.level === 'warn' ? 2 : 3);
  return board.sort((a, b) => Number(b.allReady) - Number(a.allReady) || Number(priorityOf(b.orderId) === 'URGENT') - Number(priorityOf(a.orderId) === 'URGENT') || rank(a) - rank(b) || b.age.mins - a.age.mins || b.age.secs - a.age.secs);
}

export { connectionLevel, type ConnectionLevel } from '@jamanvaar/sync';

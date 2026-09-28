/** One dish line on a bill. `amount` is the line total in rupees. */
export interface SplitLine {
  id: string;
  name: string;
  quantity: number;
  amount: number;
  /** The seat (or guest number) the dish was taken for, when the waiter noted one. */
  seat?: number;
}

/** The bill's own figures, in rupees, as they already stand (discount, tax, charges and rounding included in `totalAmount`). */
export interface SplitBillTotals {
  discountAmount: number;
  taxAmount: number;
  serviceChargeAmount: number;
  tipAmount: number;
  totalAmount: number;
}

export interface SplitGroup {
  label: string;
  /** Line ids this guest is paying for. A line named by several groups is shared equally between them. */
  lineIds: string[];
}

export interface SplitShare {
  label: string;
  lineIds: string[];
  /** Rupees. */
  subtotal: number;
  discount: number;
  tax: number;
  charges: number;
  total: number;
}

export interface SplitResult {
  shares: SplitShare[];
  /** Live lines that no guest has been given yet. The bill cannot be settled until this is empty. */
  unassigned: string[];
  error?: string;
}

const toPaise = (rupees: number): number => Math.round((rupees + Number.EPSILON) * 100);
const toRupees = (paise: number): number => paise / 100;

/** Divides `total` paise across `weights` so the parts add up to exactly `total` (largest remainder). Works for negative totals too. */
export function allocatePaise(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const even = weights.map(() => Math.trunc(total / weights.length));
    let left = total - even.reduce((s, v) => s + v, 0);
    for (let i = 0; left !== 0; i = (i + 1) % even.length) { const step = left > 0 ? 1 : -1; even[i] += step; left -= step; }
    return even;
  }
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((v) => Math.floor(v));
  let left = total - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length) { floors[order[k].i] += 1; left -= 1; }
  return floors;
}

/** Groups the lines by the seat each was taken for: "Seat 1", "Seat 2" ... Lines with no seat go to a group of their own so nothing is lost. */
export function groupsBySeat(lines: SplitLine[]): SplitGroup[] {
  const live = lines.filter((l) => l.amount > 0);
  const seats = [...new Set(live.filter((l) => l.seat !== undefined).map((l) => l.seat as number))].sort((a, b) => a - b);
  const groups: SplitGroup[] = seats.map((s) => ({ label: `Seat ${s}`, lineIds: live.filter((l) => l.seat === s).map((l) => l.id) }));
  const loose = live.filter((l) => l.seat === undefined).map((l) => l.id);
  if (loose.length > 0) groups.push({ label: seats.length > 0 ? 'Shared / no seat' : 'Everyone', lineIds: loose });
  return groups;
}

/** `count` equal groups sharing every line: each guest pays the same share of the whole bill. */
export function groupsEqually(lines: SplitLine[], count: number): SplitGroup[] {
  const ids = lines.filter((l) => l.amount > 0).map((l) => l.id);
  return Array.from({ length: Math.max(1, Math.floor(count)) }, (_, i) => ({ label: `Guest ${i + 1}`, lineIds: ids }));
}

/**
 * Splits one bill between guests. Every guest's total is worked out in whole paise and the guests' totals add up to the bill's
 * total exactly, so the counter never ends a split bill a paisa short or over. The discount, tax and charges follow each guest's
 * share of the food, and a dish shared by several guests is divided equally between them.
 */
export function splitBill(lines: SplitLine[], bill: SplitBillTotals, groups: SplitGroup[]): SplitResult {
  const live = lines.filter((l) => l.amount > 0);
  if (groups.length === 0) return { shares: [], unassigned: live.map((l) => l.id), error: 'Add at least one guest.' };
  const known = new Set(live.map((l) => l.id));
  for (const g of groups) for (const id of g.lineIds) if (!known.has(id) && !lines.some((l) => l.id === id)) return { shares: [], unassigned: [], error: 'A guest was given a dish that is not on this bill.' };

  const takers = new Map<string, number[]>();
  groups.forEach((g, gi) => g.lineIds.forEach((id) => { if (known.has(id)) takers.set(id, [...(takers.get(id) ?? []), gi]); }));
  const unassigned = live.filter((l) => !takers.has(l.id)).map((l) => l.id);

  const subtotals = groups.map(() => 0);
  for (const line of live) {
    const who = takers.get(line.id);
    if (!who) continue;
    allocatePaise(toPaise(line.amount), who.map(() => 1)).forEach((p, k) => { subtotals[who[k]] += p; });
  }

  const totalPaise = allocatePaise(toPaise(bill.totalAmount), subtotals);
  const discount = allocatePaise(toPaise(bill.discountAmount), subtotals);
  const tax = allocatePaise(toPaise(bill.taxAmount), subtotals);
  const charges = allocatePaise(toPaise(bill.serviceChargeAmount + bill.tipAmount), subtotals);

  const shares: SplitShare[] = groups.map((g, i) => ({
    label: g.label, lineIds: g.lineIds.filter((id) => known.has(id)),
    subtotal: toRupees(subtotals[i]), discount: toRupees(discount[i]), tax: toRupees(tax[i]), charges: toRupees(charges[i]), total: toRupees(totalPaise[i])
  }));
  return { shares, unassigned };
}

export type GuestMethod = 'CASH' | 'UPI' | 'CARD';

/** What each way of paying has to collect when every guest pays their own share their own way. Summed in whole paise, so it is exact. */
export function amountsByMethod(shares: SplitShare[], methods: GuestMethod[]): Record<GuestMethod, number> {
  const paise: Record<GuestMethod, number> = { CASH: 0, UPI: 0, CARD: 0 };
  shares.forEach((share, i) => { paise[methods[i] ?? 'CASH'] += toPaise(share.total); });
  return { CASH: toRupees(paise.CASH), UPI: toRupees(paise.UPI), CARD: toRupees(paise.CARD) };
}

import type { Order } from '@jamanvaar/types';

/** One cancelled dish, one voided bill, one discount or one refund: money the restaurant did not collect, and who was behind it. */
export interface LossEntry {
  kind: 'DISH_CANCELLED' | 'ORDER_VOIDED' | 'DISCOUNT' | 'REFUND';
  orderId: string;
  orderNumber: string;
  tableNumber?: string;
  /** Dish name for a cancelled dish; empty for the others. */
  label: string;
  /** Rupees. Always positive. */
  amount: number;
  reason: string;
  by: string;
  at: string;
}

export interface StaffLossRow {
  name: string;
  cancelledCount: number;
  cancelledValue: number;
  discountCount: number;
  discountValue: number;
  refundValue: number;
  total: number;
}

export interface ReasonRow {
  reason: string;
  count: number;
  value: number;
}

export interface LossReport {
  entries: LossEntry[];
  totals: { cancelledDishes: number; voidedOrders: number; discounts: number; refunds: number; all: number };
  byStaff: StaffLossRow[];
  byReason: ReasonRow[];
  /** Plain-language things the owner should look at first. Empty when nothing stands out. */
  watch: string[];
}

export interface LossReportInput {
  orders: Order[];
  from: Date;
  to: Date;
  /** Reasons and names recorded when a whole bill was voided, keyed by order number (read from the audit trail). */
  voids?: Map<string, { reason: string; by: string }>;
}

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const within = (iso: string | undefined, from: Date, to: Date): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
};

/** A bill voided or a dish cancelled is lost sales; a discount is sales given away; a refund is sales handed back. All four are reported by who did it and why. */
export function buildLossReport({ orders, from, to, voids }: LossReportInput): LossReport {
  const entries: LossEntry[] = [];

  for (const o of orders) {
    const cancelledLines = (o.items ?? []).filter((i) => i.kitchenStatus === 'CANCELLED' && (i.cancelledAmount ?? 0) > 0);
    for (const line of cancelledLines) {
      const at = line.cancelledAt ?? o.updatedAt ?? o.createdAt;
      if (!within(at, from, to)) continue;
      entries.push({
        kind: 'DISH_CANCELLED', orderId: o.id, orderNumber: o.orderNumber, tableNumber: o.tableNumber,
        label: `${line.quantity} x ${line.name}`, amount: money(line.cancelledAmount ?? 0),
        reason: line.cancelReason || 'No reason given', by: line.cancelledBy || o.captainName || o.cashierName || 'Unknown', at
      });
    }

    if (o.orderStatus === 'CANCELLED' && cancelledLines.length === 0 && o.totalAmount > 0) {
      const at = o.updatedAt ?? o.createdAt;
      if (within(at, from, to)) {
        const v = voids?.get(o.orderNumber);
        entries.push({
          kind: 'ORDER_VOIDED', orderId: o.id, orderNumber: o.orderNumber, tableNumber: o.tableNumber, label: '', amount: money(o.totalAmount),
          reason: v?.reason || 'No reason recorded', by: v?.by || o.cashierName || o.captainName || 'Unknown', at
        });
      }
    }

    if (o.orderStatus === 'REFUNDED' || o.paymentStatus === 'REFUNDED') {
      const at = o.updatedAt ?? o.createdAt;
      if (within(at, from, to)) {
        entries.push({
          kind: 'REFUND', orderId: o.id, orderNumber: o.orderNumber, tableNumber: o.tableNumber, label: '', amount: money(o.totalAmount),
          reason: 'Refunded', by: o.cashierName || 'Unknown', at
        });
      }
    }

    if (o.orderStatus !== 'CANCELLED' && (o.discountAmount ?? 0) > 0) {
      const at = o.discountAppliedAt ?? o.createdAt;
      if (within(at, from, to)) {
        entries.push({
          kind: 'DISCOUNT', orderId: o.id, orderNumber: o.orderNumber, tableNumber: o.tableNumber, label: o.couponCode ? `Coupon ${o.couponCode}` : '',
          amount: money(o.discountAmount), reason: o.discountReason || (o.couponCode ? 'Coupon' : 'No reason given'),
          by: o.discountAppliedBy || o.cashierName || o.captainName || 'Unknown', at
        });
      }
    }
  }

  entries.sort((a, b) => b.at.localeCompare(a.at));

  const sum = (kind: LossEntry['kind']) => money(entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0));
  const totals = { cancelledDishes: sum('DISH_CANCELLED'), voidedOrders: sum('ORDER_VOIDED'), discounts: sum('DISCOUNT'), refunds: sum('REFUND'), all: 0 };
  totals.all = money(totals.cancelledDishes + totals.voidedOrders + totals.discounts + totals.refunds);

  const staff = new Map<string, StaffLossRow>();
  const row = (name: string): StaffLossRow => {
    let r = staff.get(name);
    if (!r) staff.set(name, (r = { name, cancelledCount: 0, cancelledValue: 0, discountCount: 0, discountValue: 0, refundValue: 0, total: 0 }));
    return r;
  };
  for (const e of entries) {
    const r = row(e.by);
    if (e.kind === 'DISCOUNT') { r.discountCount += 1; r.discountValue = money(r.discountValue + e.amount); }
    else if (e.kind === 'REFUND') r.refundValue = money(r.refundValue + e.amount);
    else { r.cancelledCount += 1; r.cancelledValue = money(r.cancelledValue + e.amount); }
    r.total = money(r.cancelledValue + r.discountValue + r.refundValue);
  }
  const byStaff = [...staff.values()].sort((a, b) => b.total - a.total);

  const reasons = new Map<string, ReasonRow>();
  for (const e of entries.filter((x) => x.kind !== 'DISCOUNT' && x.kind !== 'REFUND')) {
    const key = e.reason.trim() || 'No reason given';
    const r = reasons.get(key) ?? { reason: key, count: 0, value: 0 };
    r.count += 1;
    r.value = money(r.value + e.amount);
    reasons.set(key, r);
  }
  const byReason = [...reasons.values()].sort((a, b) => b.value - a.value);

  return { entries, totals, byStaff, byReason, watch: watchList(entries, byStaff, totals.all) };
}

function watchList(entries: LossEntry[], byStaff: StaffLossRow[], all: number): string[] {
  const watch: string[] = [];
  // One person behind most of the losses, when there are enough events to mean something.
  if (byStaff.length >= 2 && entries.length >= 5 && all > 0) {
    const top = byStaff[0];
    if (top.total / all >= 0.6) watch.push(`${top.name} is behind ${Math.round((top.total / all) * 100)}% of the money lost (₹${top.total}). Worth a conversation.`);
  }
  const noReason = entries.filter((e) => e.kind !== 'DISCOUNT' && e.kind !== 'REFUND' && /^(no reason|unknown)/i.test(e.reason)).length;
  if (noReason > 0) watch.push(`${noReason} cancellation${noReason === 1 ? ' has' : 's have'} no reason written down.`);
  const big = entries.filter((e) => e.kind === 'ORDER_VOIDED' && e.amount >= 1000);
  if (big.length > 0) watch.push(`${big.length} whole bill${big.length === 1 ? ' was' : 's were'} voided for ₹1,000 or more.`);
  const heavyDiscounts = byStaff.filter((s) => s.discountCount >= 5);
  for (const s of heavyDiscounts) watch.push(`${s.name} gave ${s.discountCount} discounts worth ₹${s.discountValue}.`);
  return watch;
}

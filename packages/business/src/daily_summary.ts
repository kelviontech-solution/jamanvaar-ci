import { formatINR } from '@jamanvaar/utils';
import type { LossReport } from './loss_report';

export interface DailySummaryInput {
  restaurantName: string;
  dateLabel: string;
  orders: number;
  sales: number;
  cash: number;
  upi: number;
  card: number;
  other: number;
  guests?: number;
  topDishes: Array<{ name: string; quantity: number }>;
  losses: LossReport;
}

/**
 * The end-of-day message an owner reads on their phone: sales, how it was paid, best dishes, and the money that did not come in
 * (cancellations, voids, discounts, refunds) with anything worth a look. Plain text, so it reads the same in WhatsApp and an SMS.
 */
export function buildDailySummaryMessage(s: DailySummaryInput): string {
  const lines: string[] = [];
  lines.push(`*${s.restaurantName}: ${s.dateLabel}*`);
  lines.push('');
  lines.push(`Sales: ${formatINR(s.sales)} from ${s.orders} order${s.orders === 1 ? '' : 's'}${s.guests ? `, ${s.guests} guests` : ''}`);
  const paid = [
    s.cash > 0 && `Cash ${formatINR(s.cash)}`,
    s.upi > 0 && `UPI ${formatINR(s.upi)}`,
    s.card > 0 && `Card ${formatINR(s.card)}`,
    s.other > 0 && `Other ${formatINR(s.other)}`
  ].filter(Boolean);
  if (paid.length) lines.push(`Paid by: ${paid.join(', ')}`);
  if (s.topDishes.length) lines.push(`Best sellers: ${s.topDishes.slice(0, 3).map((d) => `${d.name} (${d.quantity})`).join(', ')}`);

  const t = s.losses.totals;
  lines.push('');
  if (t.all <= 0) {
    lines.push('Cancellations, voids, discounts and refunds: none today.');
  } else {
    lines.push(`Money not collected: ${formatINR(t.all)}`);
    if (t.cancelledDishes > 0) lines.push(`- Cancelled dishes: ${formatINR(t.cancelledDishes)}`);
    if (t.voidedOrders > 0) lines.push(`- Voided bills: ${formatINR(t.voidedOrders)}`);
    if (t.discounts > 0) lines.push(`- Discounts: ${formatINR(t.discounts)}`);
    if (t.refunds > 0) lines.push(`- Refunds: ${formatINR(t.refunds)}`);
    if (s.losses.byStaff.length > 0) {
      const top = s.losses.byStaff[0];
      lines.push(`Most by: ${top.name} (${formatINR(top.total)})`);
    }
  }
  for (const w of s.losses.watch) lines.push(`Look at: ${w}`);
  return lines.join('\n');
}

/** A link that opens WhatsApp with the message ready to send to `phone` (digits, with country code). No key or account is needed. */
export function whatsappShareLink(message: string, phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

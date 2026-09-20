import type { Order, PaymentSplit } from '@jamanvaar/types';

export interface TenderBreakdown {
  cash: number;
  upi: number;
  card: number;
  wallet: number;
  houseAccount: number;
  /** Money that cannot be attributed to a tender line (e.g. a legacy SPLIT order with no recorded lines). */
  other: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function emptyTenders(): TenderBreakdown {
  return { cash: 0, upi: 0, card: 0, wallet: 0, houseAccount: 0, other: 0 };
}

function addLine(t: TenderBreakdown, method: string, amount: number): void {
  const m = (method || '').toUpperCase();
  if (m === 'CASH' || m === 'CASH_AT_COUNTER') t.cash += amount;
  else if (m === 'UPI' || m === 'UPI_QR' || m === 'BHARAT_QR') t.upi += amount;
  else if (m === 'CARD' || m === 'CARD_TERMINAL' || m === 'POS_CARD') t.card += amount;
  else if (m === 'WALLET') t.wallet += amount;
  else if (m === 'HOUSE_ACCOUNT' || m === 'CREDIT') t.houseAccount += amount;
  else t.other += amount;
}

/**
 * The single place that answers "how much of this bill was paid by each
 * method". A SPLIT bill uses its recorded payment lines; it is never guessed
 * as 50/50 (that made shift totals, expected drawer cash and every report
 * wrong for any split that was not exactly half and half).
 */
export function getOrderTenders(order: Pick<Order, 'totalAmount' | 'paymentMethod'> & { paymentSplits?: PaymentSplit[] }): TenderBreakdown {
  const t = emptyTenders();
  const total = order.totalAmount || 0;
  const method = (order.paymentMethod || '').toUpperCase();

  if (order.paymentSplits && order.paymentSplits.length > 0) {
    order.paymentSplits.forEach((line) => addLine(t, line.method, line.amount));
  } else if (method === 'SPLIT') {
    t.other += total;
  } else {
    addLine(t, method || 'CASH', total);
  }

  (Object.keys(t) as Array<keyof TenderBreakdown>).forEach((k) => {
    t[k] = round2(t[k]);
  });
  return t;
}

/** True when the lines add up to the bill total (within a paisa of rounding). */
export function splitsMatchTotal(splits: PaymentSplit[], total: number): boolean {
  const sum = splits.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
  return Math.abs(sum - total) < 0.011;
}

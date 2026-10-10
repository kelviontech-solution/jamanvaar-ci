/**
 * Who may move an order to which state, and what a push has to look like to be believed. Pure functions: the sync service
 * applies them, the tests exercise them directly.
 */

/** Position of each order status in the order's life. Statuses not listed are unknown to the server and are never blocked. */
const RANK: Record<string, number> = {
  DRAFT: -1,
  NEW: 0, PENDING: 0, CONFIRMED: 0, ACCEPTED: 0,
  PREPARING: 1, COOKING: 1,
  READY: 2,
  SERVED: 3, DELIVERED: 3,
  COMPLETED: 4,
  CANCELLED: 5, VOID: 5, VOIDED: 5,
  REFUNDED: 6
};

const TERMINAL = new Set(['CANCELLED', 'VOID', 'VOIDED', 'REFUNDED']);
/** Devices that run the counter and may correct an order's state on purpose (`meta.statusCorrection`). */
const CORRECTION_AUTHORITY = new Set(['POS', 'POS_ADMIN']);
/** A self-service kiosk creates and pays its own order; it does not run the kitchen or the counter. */
const KIOSK_TYPES = new Set(['KIOSK', 'KIOSK_ADMIN']);
const KIOSK_FORBIDDEN = new Set(['READY', 'SERVED', 'DELIVERED', 'COMPLETED', 'REFUNDED']);

export const statusRank = (s: string | null | undefined): number | undefined => (s ? RANK[s.toUpperCase()] : undefined);

/** Explicit operator actions share one definition; sync still accepts the established offline aliases. */
export function validateQrOrderAction(current: string, action: string, paid: boolean, reason?: string): string | null {
  const allowed: Record<string, string[]> = { PREPARING: ['NEW', 'CONFIRMED', 'ACCEPTED'], READY: ['PREPARING', 'COOKING'], COMPLETED: ['READY', 'SERVED'], CANCELLED: ['NEW', 'CONFIRMED', 'PREPARING', 'READY'] };
  if (!allowed[action]?.includes(current)) return 'This status change is no longer available';
  if (action === 'CANCELLED' && (paid || !reason?.trim())) return 'Unpaid cancellations need a reason. Paid orders must use the refund workflow.';
  if (action === 'COMPLETED' && !paid) return 'Collect the outstanding payment before completing the order';
  const decision = decideStatus(current, action, 'POS_ADMIN');
  return decision.apply ? null : decision.message;
}

export type StatusDecision =
  | { apply: true; status: string }
  | { apply: false; status: string; reason: 'STATUS_REGRESSION' | 'STATUS_TERMINAL' | 'STATUS_NOT_PERMITTED'; message: string };

/**
 * The status an order ends up with after a push. A push that would move it backwards, out of a terminal state, or that its
 * device type may not make is NOT applied (the order keeps its state) and the caller records the conflict; the rest of the
 * push (items, meta) is still merged, so nothing else is lost.
 */
export function decideStatus(current: string | null | undefined, incoming: string, deviceType: string, meta?: { statusCorrection?: unknown } | null): StatusDecision {
  if (!current || current === incoming) return { apply: true, status: incoming };
  const from = statusRank(current);
  const to = statusRank(incoming);
  if (from === undefined || to === undefined) return { apply: true, status: incoming };

  if (KIOSK_TYPES.has(deviceType) && KIOSK_FORBIDDEN.has(incoming.toUpperCase())) {
    return { apply: false, status: current, reason: 'STATUS_NOT_PERMITTED', message: `A ${deviceType} device cannot set an existing order to ${incoming}` };
  }
  const correction = meta?.statusCorrection === true && CORRECTION_AUTHORITY.has(deviceType);
  if (TERMINAL.has(current.toUpperCase()) && !(current.toUpperCase() === 'CANCELLED' && correction) && incoming.toUpperCase() !== 'REFUNDED') {
    return { apply: false, status: current, reason: 'STATUS_TERMINAL', message: `The order is ${current}; it cannot become ${incoming}` };
  }
  if (to < from && !correction) {
    return { apply: false, status: current, reason: 'STATUS_REGRESSION', message: `The order is already ${current}; a push from ${deviceType} tried to set ${incoming}` };
  }
  return { apply: true, status: incoming };
}

export interface IntegrityLine {
  externalItemId: string;
  menuItemId?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  snapshot?: { taxInclusive?: boolean; lineTax?: number };
}

/**
 * Sanity checks on a device-priced order. Devices price offline, so a stale menu is legitimate and the order is never
 * rejected: problems become review flags on the order and a recorded conflict for the operator.
 */
export function integrityFlags(lines: IntegrityLine[], subtotal: number, menuBasePaise: Map<string, number>): string[] {
  const flags: string[] = [];
  let sum = 0;
  for (const l of lines) {
    const embeddedTax = l.snapshot?.taxInclusive === true && Number.isSafeInteger(l.snapshot.lineTax)
      && l.snapshot.lineTax! >= 0 && l.snapshot.lineTax! <= l.lineTotal ? l.snapshot.lineTax! : 0;
    sum += l.lineTotal - embeddedTax;
    if (l.lineTotal !== l.unitPrice * l.quantity) flags.push(`LINE_TOTAL_MISMATCH:${l.externalItemId}`);
    const base = menuBasePaise.get(l.menuItemId || l.externalItemId);
    if (base !== undefined && l.unitPrice < base) flags.push(`BELOW_MENU_PRICE:${l.externalItemId}:${l.unitPrice}<${base}`);
  }
  if (sum !== subtotal) flags.push(`SUBTOTAL_MISMATCH:${sum}!=${subtotal}`);
  return flags;
}

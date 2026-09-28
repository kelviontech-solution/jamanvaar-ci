import type { Reservation } from '@jamanvaar/types';

export interface HoldPolicy {
  /** How long before the booked time the table is kept free for the guest. */
  holdBeforeMinutes: number;
  /** How long after the booked time the table is still kept, before the booking is treated as a no-show. */
  graceAfterMinutes: number;
}

export const DEFAULT_HOLD_POLICY: HoldPolicy = { holdBeforeMinutes: 30, graceAfterMinutes: 20 };

export type HoldState = 'UPCOMING' | 'DUE' | 'LATE';

export interface TableHold {
  reservation: Reservation;
  state: HoldState;
  /** Minutes until the booked time (negative once past it). */
  minutesUntil: number;
}

const minutesBetween = (now: Date, iso: string): number => (new Date(iso).getTime() - now.getTime()) / 60000;

/**
 * The booking that is holding a table right now, if any. From `holdBeforeMinutes` before the booked time until
 * `graceAfterMinutes` after it the table is held: UPCOMING (kept free), DUE (booked time has come), LATE (guest is late, not yet a no-show).
 * A booking is matched to a table by table id, or by table number when the booking has no id.
 */
export function tableHold(reservations: Reservation[], table: { id?: string; tableNumber: string }, now: Date, policy: HoldPolicy = DEFAULT_HOLD_POLICY): TableHold | undefined {
  let best: TableHold | undefined;
  for (const r of reservations) {
    if (r.status !== 'CONFIRMED') continue;
    const forThisTable = r.tableId ? r.tableId === table.id : !!r.tableNumber && r.tableNumber === table.tableNumber;
    if (!forThisTable) continue;
    const until = minutesBetween(now, r.reservationTime);
    if (until > policy.holdBeforeMinutes || until < -policy.graceAfterMinutes) continue;
    const state: HoldState = until > 0 ? 'UPCOMING' : until > -5 ? 'DUE' : 'LATE';
    if (!best || Math.abs(until) < Math.abs(best.minutesUntil)) best = { reservation: r, state, minutesUntil: Math.round(until) };
  }
  return best;
}

/** Bookings that are past their grace time and still marked CONFIRMED: the guest did not come. */
export function overdueReservations(reservations: Reservation[], now: Date, policy: HoldPolicy = DEFAULT_HOLD_POLICY): Reservation[] {
  return reservations.filter((r) => r.status === 'CONFIRMED' && minutesBetween(now, r.reservationTime) < -policy.graceAfterMinutes);
}

/** Plain words for a screen: "Reserved 8:30 PM: Sharma (4)". */
export function holdLabel(hold: TableHold): string {
  const time = new Date(hold.reservation.reservationTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const who = `${hold.reservation.customerName} (${hold.reservation.guestCount})`;
  if (hold.state === 'LATE') return `Reserved ${time}: ${who}, ${Math.abs(hold.minutesUntil)} min late`;
  return `Reserved ${time}: ${who}`;
}

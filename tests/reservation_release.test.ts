import { describe, it, expect, beforeEach } from 'vitest';
import { db, ReservationRepository, ReservationSync } from '@jamanvaar/database';

const NOW = new Date(Date.UTC(2026, 8, 28, 19, 0));
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60000).toISOString();

describe('bookings free their table when the guests do not come', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.reservations = [];
  });

  it('marks a booking no-show once it is 20 minutes past its time, and leaves the others alone', () => {
    const late = ReservationRepository.create({ customerName: 'Late', reservationTime: at(-25), tableNumber: '5' });
    const grace = ReservationRepository.create({ customerName: 'Grace', reservationTime: at(-10), tableNumber: '6' });
    const later = ReservationRepository.create({ customerName: 'Later', reservationTime: at(30), tableNumber: '7' });
    expect(ReservationRepository.releaseOverdue(NOW)).toBe(1);
    expect(late.status).toBe('NO_SHOW');
    expect(grace.status).toBe('CONFIRMED');
    expect(later.status).toBe('CONFIRMED');
    expect(ReservationRepository.releaseOverdue(NOW)).toBe(0);
  });

  it('marks it seated, not no-show, when the table already has an order (they came and nobody pressed seated)', () => {
    const table = db.tables[0];
    table.currentOrderId = 'order-on-table';
    const r = ReservationRepository.create({ customerName: 'Came', reservationTime: at(-40), tableId: table.id, tableNumber: table.tableNumber });
    ReservationRepository.releaseOverdue(NOW);
    expect(r.status).toBe('SEATED');
  });

  it('stamps every change with a time, so the newest edit wins when devices sync', () => {
    const r = ReservationRepository.create({ customerName: 'Stamp', reservationTime: at(60) });
    expect(Number.isNaN(Date.parse(r.updatedAt!))).toBe(false);
    const before = r.updatedAt!;
    ReservationRepository.updateStatus(r.id, 'CANCELLED');
    expect(r.updatedAt! >= before).toBe(true);
    expect(r.status).toBe('CANCELLED');
  });

  it('travels between devices: a booking made here is sent, and a newer change from another device replaces it', () => {
    ReservationSync.reset();
    ReservationSync.stampChanges(); // baseline
    const r = ReservationRepository.create({ customerName: 'Sharma', reservationTime: at(60), tableNumber: '5' });
    const sent = ReservationSync.collectSyncRecords();
    expect(sent.map((x) => x.externalId)).toContain(r.id);

    ReservationSync.applyRemote({ ...r, status: 'SEATED', updatedAt: new Date(Date.now() + 5000).toISOString() });
    expect(db.reservations.find((x) => x.id === r.id)!.status).toBe('SEATED');
    // an older copy arriving late changes nothing
    ReservationSync.applyRemote({ ...r, status: 'CANCELLED', updatedAt: '2020-01-01T00:00:00.000Z' });
    expect(db.reservations.find((x) => x.id === r.id)!.status).toBe('SEATED');
  });

  it('a booking that arrives from another device is added, and a record that is not a booking is ignored', () => {
    ReservationSync.applyRemote({ id: 'from-admin', customerName: 'Remote', customerPhone: '', guestCount: 2, reservationTime: at(90), status: 'CONFIRMED', createdAt: at(0), updatedAt: at(1) });
    expect(db.reservations.some((x) => x.id === 'from-admin')).toBe(true);
    ReservationSync.applyRemote({ id: 'bad', notABooking: true });
    expect(db.reservations.some((x) => x.id === 'bad')).toBe(false);
  });
});

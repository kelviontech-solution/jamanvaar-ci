import { describe, it, expect, beforeEach } from 'vitest';
import { db, TableRepository, TableSync, OrderRepository } from '@jamanvaar/database';

/**
 * BUG-096 / BUG-097 (found live in the Captain module test): the table layout made in Restaurant
 * Admin never reached Captain or POS, and a table seated on Captain looked vacant on POS, because
 * every device kept its own copy of the demo tables and nothing synced them. `TableSync` is the
 * shared logic every app's sync tick uses: stamp local changes, push what changed, pull and apply
 * what others changed, newest change wins, deletions travel as tombstones.
 */
describe('Dining table cross-device sync (BUG-096/097)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    TableSync.resetForTests();
  });

  it('a device that has never synced records a baseline without treating the demo seed as a fresh edit', () => {
    const before = db.tables.map((t) => t.updatedAt);
    TableSync.stampChanges('2026-09-20T10:00:00.000Z');
    expect(db.tables.map((t) => t.updatedAt)).toEqual(before);
  });

  it('a local status change after the baseline is stamped and pushed, unchanged tables are not', () => {
    TableSync.stampChanges('2026-09-20T10:00:00.000Z');
    TableSync.markPushed(TableSync.collectSyncRecords());

    const t1 = db.tables.find((t) => t.tableNumber === '1')!;
    t1.status = 'OCCUPIED';
    t1.currentGuests = 3;
    TableSync.stampChanges('2026-09-20T10:05:00.000Z');

    expect(t1.updatedAt).toBe('2026-09-20T10:05:00.000Z');
    const records = TableSync.collectSyncRecords();
    expect(records).toHaveLength(1);
    expect(records[0].externalId).toBe(t1.id);
    expect(records[0].payload).toMatchObject({ tableNumber: '1', status: 'OCCUPIED', currentGuests: 3, updatedAt: '2026-09-20T10:05:00.000Z' });
  });

  it('a table created on this device (Restaurant Admin) is pushed', () => {
    TableSync.stampChanges('2026-09-20T10:00:00.000Z');
    TableSync.markPushed(TableSync.collectSyncRecords());

    const created = TableRepository.createTable({ tableNumber: '15', capacity: 6, zone: 'Garden Terrace' });
    TableSync.stampChanges('2026-09-20T10:01:00.000Z');

    const records = TableSync.collectSyncRecords();
    expect(records.map((r) => r.externalId)).toEqual([created.id]);
  });

  it('a remote table that does not exist here is created', () => {
    TableSync.applyRemote({ id: 'tbl-remote-15', outletId: 'o', tableNumber: '15', capacity: 6, zone: 'Garden Terrace', floor: 1, status: 'AVAILABLE', isActive: true, updatedAt: '2026-09-20T10:00:00.000Z' });
    expect(db.tables.find((t) => t.id === 'tbl-remote-15')).toMatchObject({ tableNumber: '15', zone: 'Garden Terrace' });
  });

  it('the newer change wins in both directions', () => {
    const t1 = db.tables.find((t) => t.tableNumber === '1')!;
    t1.updatedAt = '2026-09-20T10:00:00.000Z';

    TableSync.applyRemote({ ...t1, status: 'OCCUPIED', currentOrderId: 'ord-9', updatedAt: '2026-09-20T10:10:00.000Z' });
    expect(t1.status).toBe('OCCUPIED');
    expect(t1.currentOrderId).toBe('ord-9');

    TableSync.applyRemote({ ...t1, status: 'AVAILABLE', currentOrderId: undefined, updatedAt: '2026-09-20T10:05:00.000Z' });
    expect(t1.status).toBe('OCCUPIED');
  });

  it('a settled table freed elsewhere frees it here, including the order link', () => {
    const t1 = db.tables.find((t) => t.tableNumber === '1')!;
    t1.status = 'BILL_REQUESTED';
    t1.currentOrderId = 'ord-9';
    t1.updatedAt = '2026-09-20T10:00:00.000Z';

    TableSync.applyRemote({ ...t1, status: 'AVAILABLE', currentOrderId: null, currentGuests: null, updatedAt: '2026-09-20T10:20:00.000Z' });
    expect(t1.status).toBe('AVAILABLE');
    expect(t1.currentOrderId).toBeUndefined();
    expect(t1.currentGuests).toBeUndefined();
  });

  it('deleting a table travels as a tombstone and removes it on the other device', () => {
    TableSync.stampChanges('2026-09-20T10:00:00.000Z');
    TableSync.markPushed(TableSync.collectSyncRecords());
    const t12 = db.tables.find((t) => t.tableNumber === '12')!;

    TableRepository.deleteTable(t12.id);
    const records = TableSync.collectSyncRecords();
    expect(records).toHaveLength(1);
    expect(records[0].payload).toMatchObject({ id: t12.id, deleted: true });

    db.resetToDefaultSeed();
    expect(db.tables.find((t) => t.id === t12.id)).toBeDefined();
    TableSync.applyRemote({ id: t12.id, deleted: true, updatedAt: '2099-01-01T00:00:00.000Z' });
    expect(db.tables.find((t) => t.id === t12.id)).toBeUndefined();
  });

  it('a table freed elsewhere drops the waiter it was seated by', () => {
    const t1 = db.tables.find((t) => t.tableNumber === '1')!;
    t1.status = 'OCCUPIED';
    t1.openedById = 'usr-1';
    t1.openedByName = 'Ravi Waiter';
    t1.updatedAt = '2026-09-20T10:00:00.000Z';

    TableSync.applyRemote({ ...t1, status: 'AVAILABLE', currentOrderId: null, currentGuests: null, updatedAt: '2026-09-20T10:20:00.000Z' });
    expect(t1.openedById).toBeUndefined();
    expect(t1.openedByName).toBeUndefined();
  });

  it('a tombstone older than a later edit does not delete the table', () => {
    const t3 = db.tables.find((t) => t.tableNumber === '3')!;
    t3.updatedAt = '2026-09-20T12:00:00.000Z';
    TableSync.applyRemote({ id: t3.id, deleted: true, updatedAt: '2026-09-20T09:00:00.000Z' });
    expect(db.tables.find((t) => t.id === t3.id)).toBeDefined();
  });

  it('applying a remote change is not mistaken for a local edit and pushed back', () => {
    TableSync.stampChanges('2026-09-20T10:00:00.000Z');
    TableSync.markPushed(TableSync.collectSyncRecords());
    const t1 = db.tables.find((t) => t.tableNumber === '1')!;

    TableSync.applyRemote({ ...t1, status: 'OCCUPIED', updatedAt: '2026-09-20T10:10:00.000Z' });
    TableSync.stampChanges('2026-09-20T10:11:00.000Z');

    expect(t1.updatedAt).toBe('2026-09-20T10:10:00.000Z');
    expect(TableSync.collectSyncRecords()).toHaveLength(0);
  });

  it('malformed remote records are ignored', () => {
    const before = db.tables.length;
    TableSync.applyRemote({} as never);
    TableSync.applyRemote({ id: '', tableNumber: '9' } as never);
    expect(db.tables.length).toBe(before);
  });
  describe('releasing tables whose order is already settled', () => {
    const seat = (tableNumber: string, orderStatus: 'PREPARING' | 'COMPLETED' | 'CANCELLED') => {
      const table = db.tables.find((t) => t.tableNumber === tableNumber)!;
      const order = OrderRepository.createOrder({ orderType: 'DINE_IN', tableId: table.id, tableNumber, items: [], subtotal: 100, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus });
      table.status = 'BILL_REQUESTED';
      table.currentOrderId = order.id;
      table.currentGuests = 2;
      return table;
    };

    it('frees a table whose order was completed on another device', () => {
      const table = seat('2', 'COMPLETED');
      expect(TableRepository.releaseSettledTables()).toBe(1);
      expect(table.status).toBe('AVAILABLE');
      expect(table.currentOrderId).toBeUndefined();
      expect(table.currentGuests).toBeUndefined();
    });

    it('frees a table whose order was cancelled', () => {
      const table = seat('3', 'CANCELLED');
      TableRepository.releaseSettledTables();
      expect(table.status).toBe('AVAILABLE');
    });

    it('leaves a table with a running order alone', () => {
      const table = seat('4', 'PREPARING');
      expect(TableRepository.releaseSettledTables()).toBe(0);
      expect(table.status).toBe('BILL_REQUESTED');
    });

    it('leaves a table alone when its order has not reached this device yet', () => {
      const table = db.tables.find((t) => t.tableNumber === '5')!;
      table.status = 'OCCUPIED';
      table.currentOrderId = 'ord-not-here-yet';
      expect(TableRepository.releaseSettledTables()).toBe(0);
      expect(table.status).toBe('OCCUPIED');
    });
  });
});

describe('Table zones come from the restaurant\'s own tables (BUG-116)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('lists each zone once, in the order the floor plan uses them', () => {
    expect(TableRepository.getZones()).toEqual(['Main Hall', 'Family Section', 'AC Balcony']);
  });

  it('a zone added with a new table joins the list, and a floor with no tables has none', () => {
    TableRepository.createTable({ tableNumber: '30', zone: 'Rooftop' });
    expect(TableRepository.getZones()).toContain('Rooftop');
    db.tables = [];
    expect(TableRepository.getZones()).toEqual([]);
  });
});

describe('Table numbers are unique (BUG-120)', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('reports a number that is already in use, ignoring the table being edited and stray spaces', () => {
    expect(TableRepository.isTableNumberTaken('3')).toBe(true);
    expect(TableRepository.isTableNumberTaken(' 3 ')).toBe(true);
    expect(TableRepository.isTableNumberTaken('40')).toBe(false);
    const t3 = db.tables.find((t) => t.tableNumber === '3')!;
    expect(TableRepository.isTableNumberTaken('3', t3.id)).toBe(false);
  });
});

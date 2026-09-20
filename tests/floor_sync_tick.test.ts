import { describe, it, expect, beforeEach } from 'vitest';
import { db, TableSync, OrderRepository } from '@jamanvaar/database';
import { EntitySyncEngine, syncDiningTables } from '@jamanvaar/sync';
import type { EntitySyncEvent, CloudSyncedEntity } from '@jamanvaar/sync';

/**
 * The tick every app runs (Restaurant Admin, POS, Captain) to keep the floor plan and table
 * states shared — see table_cross_device_sync.test.ts for the merge rules themselves.
 */
describe('syncDiningTables tick (BUG-096/097)', () => {
  let pushes: { type: string; events: EntitySyncEvent[] }[];
  let pullable: CloudSyncedEntity[];
  let failPush: boolean;

  beforeEach(() => {
    db.resetToDefaultSeed();
    TableSync.resetForTests();
    pushes = [];
    pullable = [];
    failPush = false;
    EntitySyncEngine.configureTransport({
      push: async (type, events) => {
        if (failPush) throw new Error('offline');
        pushes.push({ type, events });
        return { results: events.map((e) => ({ externalId: e.externalId, status: 'ok' as const })), serverTime: new Date().toISOString() };
      },
      pull: async () => ({ entities: pullable, serverTime: new Date().toISOString() })
    });
  });

  it('the first tick pushes the whole floor plan, the next tick pushes nothing new', async () => {
    await syncDiningTables();
    expect(pushes).toHaveLength(1);
    expect(pushes[0].type).toBe('DINING_TABLE');
    expect(pushes[0].events).toHaveLength(db.tables.length);

    await syncDiningTables();
    expect(pushes).toHaveLength(1);
  });

  it('a table seated after that is pushed on the next tick, alone', async () => {
    await syncDiningTables();
    const t1 = db.tables.find((t) => t.tableNumber === '1')!;
    t1.status = 'OCCUPIED';
    t1.currentOrderId = 'ord-1';

    await syncDiningTables();
    expect(pushes).toHaveLength(2);
    expect(pushes[1].events).toHaveLength(1);
    expect(pushes[1].events[0].payload).toMatchObject({ tableNumber: '1', status: 'OCCUPIED', currentOrderId: 'ord-1' });
  });

  it('a failed push is retried on the next tick instead of being forgotten', async () => {
    failPush = true;
    await syncDiningTables();
    expect(pushes).toHaveLength(0);

    failPush = false;
    await syncDiningTables();
    expect(pushes).toHaveLength(1);
    expect(pushes[0].events).toHaveLength(db.tables.length);
  });

  it('without a configured transport nothing is marked as pushed', async () => {
    EntitySyncEngine.configureTransport(null);
    await syncDiningTables();
    expect(TableSync.collectSyncRecords()).toHaveLength(db.tables.length);
  });

  it('a table pulled from another device is applied', async () => {
    pullable = [{ externalId: 'tbl-x', updatedAt: '2026-09-20T10:00:00.000Z', payload: { id: 'tbl-x', tableNumber: '20', capacity: 8, zone: 'Rooftop', floor: 2, status: 'AVAILABLE', isActive: true, updatedAt: '2026-09-20T10:00:00.000Z' } }];
    await syncDiningTables();
    expect(db.tables.find((t) => t.id === 'tbl-x')).toMatchObject({ tableNumber: '20', zone: 'Rooftop' });
  });

  it('a table whose order was settled elsewhere is freed by the tick', async () => {
    const t2 = db.tables.find((t) => t.tableNumber === '2')!;
    const order = OrderRepository.createOrder({ orderType: 'DINE_IN', tableId: t2.id, tableNumber: '2', items: [], subtotal: 100, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED' });
    t2.status = 'BILL_REQUESTED';
    t2.currentOrderId = order.id;

    await syncDiningTables();
    expect(t2.status).toBe('AVAILABLE');
  });
});

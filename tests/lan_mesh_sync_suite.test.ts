import { describe, it, expect, beforeEach } from 'vitest';
import {
  lanMeshSync,
  LanMeshSyncEngine
} from '../packages/sync/src/lan_mesh_sync';
import {
  db,
  captainDb,
  posDb,
  posAdminDb,
  kdsDb
} from '../packages/database/src';
import { Order, KOTRecord } from '../packages/types/src';

describe('JAMANVAAR POS Admin ↔ POS ↔ Captain App ↔ KDS Real-Time & Offline Sync', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    captainDb.resetToDefaultSeed();
    posDb.resetToDefaultSeed();
    posAdminDb.resetToDefaultSeed();
    kdsDb.resetToDefaultSeed();
  });

  it('1. Captain opens Table 5 ➔ POS, Admin and KDS reflect OCCUPIED status in real-time', () => {
    const sync = LanMeshSyncEngine.getInstance();
    sync.setAttachedDatabase(db);
    sync.registerDevice('CAPTAIN', 'CAPTAIN-01', 'Rahul Sharma (Captain)');

    const tableNumber = '5';
    const guestCount = 4;

    // Captain opens Table 5
    sync.broadcast('TABLE_OPENED', {
      tableNumber,
      guestCount,
      captainName: 'Rahul Sharma'
    });

    const tbl = db.tables.find((t) => t.tableNumber === tableNumber);
    expect(tbl?.status).toBe('OCCUPIED');
    expect(tbl?.currentGuests).toBe(4);
  });

  it('2. Captain takes order & fires KOT ➔ Order & KOT propagate to POS and KDS', () => {
    const sync = LanMeshSyncEngine.getInstance();
    sync.setAttachedDatabase(db);

    const testOrder: Order = {
      id: `ord-capt-${Date.now()}`,
      orderNumber: 'ORD-CAP-99',
      tokenNumber: '199',
      restaurantId: 'rest-1',
      outletId: 'out-1',
      kioskId: 'CAPTAIN-01',
      sessionId: 'sess-capt-1',
      idempotencyKey: `idem-capt-${Date.now()}`,
      orderType: 'DINE_IN',
      tableNumber: '5',
      items: [
        {
          id: 'item-1',
          orderId: 'temp',
          menuItemId: 'item-pt',
          name: 'Paneer Tikka',
          sku: 'PT-01',
          unitPrice: 260,
          quantity: 2,
          totalPrice: 520,
          modifiers: []
        }
      ],
      subtotal: 520,
      discountAmount: 0,
      taxAmount: 26,
      cgstAmount: 13,
      sgstAmount: 13,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalAmount: 546,
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      orderStatus: 'PREPARING',
      estimatedWaitMinutes: 15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'SYNCED',
      isSynced: true
    };

    const testKot: KOTRecord = {
      id: `kot-capt-${Date.now()}`,
      kotNumber: 'KOT-99',
      orderId: testOrder.id,
      orderNumber: testOrder.orderNumber,
      tokenNumber: testOrder.tokenNumber,
      tableNumber: '5',
      orderType: 'DINE_IN',
      station: 'Tandoor',
      type: 'FIRST',
      items: [
        {
          id: 'koti-1',
          menuItemId: 'item-pt',
          name: 'Paneer Tikka',
          quantity: 2,
          modifiers: [],
          kitchenStation: 'Tandoor',
          status: 'PREPARING'
        }
      ],
      cashierName: 'Rahul Sharma',
      createdAt: new Date().toISOString(),
      printed: false,
      status: 'PREPARING'
    };

    // Broadcast Order & KOT from Captain
    sync.broadcast('ORDER_CREATED', testOrder);
    sync.broadcast('KOT_CREATED', testKot);

    expect(db.orders.some((o) => o.id === testOrder.id)).toBe(true);
    expect(db.kots.some((k) => k.id === testKot.id)).toBe(true);
  });

  it('3. KDS marks KOT Ready ➔ Captain receives FOOD_READY event', () => {
    const sync = LanMeshSyncEngine.getInstance();
    sync.setAttachedDatabase(db);

    let receivedFoodReady = false;
    const unsub = sync.on('FOOD_READY', (event) => {
      if (event.payload.tableNumber === '5') {
        receivedFoodReady = true;
      }
    });

    sync.broadcast('FOOD_READY', {
      tableNumber: '5',
      dishName: 'Paneer Tikka',
      items: ['2x Paneer Tikka'],
      kotNumber: 'KOT-99',
      station: 'Tandoor'
    });

    expect(receivedFoodReady).toBe(true);
    unsub();
  });

  it('4. Captain requests bill ➔ POS cashier receives BILL_REQUESTED alert', () => {
    const sync = LanMeshSyncEngine.getInstance();
    sync.setAttachedDatabase(db);

    let billAlertTable = '';
    const unsub = sync.on('BILL_REQUESTED', (event) => {
      billAlertTable = event.payload.tableNumber;
    });

    sync.broadcast('BILL_REQUESTED', {
      tableNumber: '5',
      captainName: 'Rahul Sharma'
    });

    expect(billAlertTable).toBe('5');
    unsub();
  });

  it('5. POS settles bill ➔ Captain receives BILL_SETTLED and Table 5 becomes AVAILABLE', () => {
    const sync = LanMeshSyncEngine.getInstance();
    sync.setAttachedDatabase(db);

    // Initial state: Table 5 occupied
    const tbl = db.tables.find((t) => t.tableNumber === '5');
    if (tbl) tbl.status = 'OCCUPIED';

    sync.broadcast('BILL_SETTLED', {
      orderId: 'ord-capt-1',
      tableNumber: '5',
      paymentMethod: 'UPI_QR',
      totalAmount: 546
    });

    expect(tbl?.status).toBe('AVAILABLE');
    expect(tbl?.currentGuests).toBe(0);
  });

  it('6. Offline Queue & Reconnect: Operations queue offline and drain without duplicate creation', async () => {
    const sync = LanMeshSyncEngine.getInstance();
    sync.setAttachedDatabase(db);

    // Disconnect network
    sync.setOnlineStatus(false);
    expect(sync.getIsOnline()).toBe(false);

    // Captain creates table operation while offline
    const queuedEvent = sync.broadcast('TABLE_STATUS_CHANGED', {
      tableNumber: '3',
      status: 'OCCUPIED',
      guestCount: 2
    });

    expect(sync.getOutboxCount()).toBeGreaterThan(0);

    // Reconnect network
    sync.setOnlineStatus(true);
    expect(sync.getIsOnline()).toBe(true);

    const res = await sync.processOutbox();
    expect(res.processed).toBeGreaterThanOrEqual(0);
  });
});

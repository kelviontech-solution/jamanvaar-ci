import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  posDb,
  posAdminDb,
  captainDb,
  kdsDb,
  JamanvaarLocalCore,
  BusinessDayAccountingService
} from '../packages/database/src';
import {
  RestaurantCommandPipeline,
  RestaurantCommand
} from '../packages/sync/src/command_pipeline';

describe('JAMANVAAR — Unified Multi-App Restaurant Ecosystem Suite', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('1. Single Authoritative Local Core: All role databases reference identical shared state', () => {
    const health = JamanvaarLocalCore.getHealth();
    expect(health.restaurant_id).toBe('JAMANVAAR-AHM-FLAGSHIP');
    expect(health.outlet_id).toBe('AHM-FLAGSHIP');
    expect(health.core_status).toBe('HEALTHY');

    // Mutate via posDb -> Check reflection in captainDb, kdsDb, posAdminDb
    posDb.restaurant.name = 'JAMANVAAR — Royal Cuisine';
    expect(posAdminDb.restaurant.name).toBe('JAMANVAAR — Royal Cuisine');
    expect(captainDb.restaurant.name).toBe('JAMANVAAR — Royal Cuisine');
    expect(kdsDb.restaurant.name).toBe('JAMANVAAR — Royal Cuisine');
  });

  it('2. Command Pipeline & Idempotency: Duplicate commands execute only once', async () => {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const commandId = `CMD-${Date.now()}-001`;

    const createOrderCmd: RestaurantCommand = {
      commandId,
      type: 'CREATE_ORDER',
      deviceId: 'CAPTAIN-01',
      senderRole: 'CAPTAIN',
      timestamp: new Date().toISOString(),
      payload: {
        tableNumber: '12',
        orderType: 'DINE_IN',
        items: [
          {
            dishId: 'PT-04',
            name: 'Paneer Tikka (Tandoori Angaar)',
            quantity: 2,
            unitPrice: 280
          },
          {
            dishId: 'DM-05',
            name: 'Dal Makhani (Slow Cooked)',
            quantity: 1,
            unitPrice: 240
          }
        ]
      }
    };

    // First execution
    const res1 = await RestaurantCommandPipeline.executeCommand(createOrderCmd);
    expect(res1.success).toBe(true);
    expect(res1.data.order).toBeDefined();
    expect(res1.data.kot).toBeDefined();
    expect(res1.data.order.businessDayId).toBe(activeDay.id);

    const initialOrderCount = db.orders.length;

    // Second execution with identical commandId (simulating network retry)
    const res2 = await RestaurantCommandPipeline.executeCommand(createOrderCmd);
    expect(res2.success).toBe(true);
    expect(res2.commandId).toBe(commandId);

    // Total orders count must NOT increase
    expect(db.orders.length).toBe(initialOrderCount);
  });

  it('3. KDS Station Routing & KOT Lifecycle: Auto-splits items by station and updates statuses', async () => {
    const cmd: RestaurantCommand = {
      commandId: `CMD-${Date.now()}-KOT`,
      type: 'CREATE_ORDER',
      deviceId: 'POS-01',
      senderRole: 'POS',
      timestamp: new Date().toISOString(),
      payload: {
        tableNumber: '5',
        orderType: 'DINE_IN',
        items: [
          { dishId: 'PT-04', name: 'Paneer Tikka', quantity: 2, unitPrice: 280 },
          { dishId: 'DM-05', name: 'Dal Makhani', quantity: 1, unitPrice: 240 },
          { dishId: 'CC-10', name: 'Cold Coffee with Ice Cream', quantity: 2, unitPrice: 150 }
        ]
      }
    };

    const res = await RestaurantCommandPipeline.executeCommand(cmd);
    const kot = res.data.kot;
    expect(kot).toBeDefined();

    // Verify Station Classification
    const stations = kot.items.map((it: any) => it.station);
    expect(stations).toContain('TANDOOR'); // Paneer Tikka
    expect(stations).toContain('CURRY');   // Dal Makhani
    expect(stations).toContain('BEVERAGE');// Cold Coffee

    // Update KOT to COOKING -> transitions to PREPARING
    const cookRes = await RestaurantCommandPipeline.executeCommand({
      commandId: `CMD-COOK-${Date.now()}`,
      type: 'UPDATE_KOT_STATUS',
      deviceId: 'KDS-01',
      senderRole: 'KDS',
      timestamp: new Date().toISOString(),
      payload: { kotId: kot.id, status: 'COOKING' }
    });
    expect(cookRes.success).toBe(true);
    expect(cookRes.data.status).toBe('PREPARING');

    // Update KOT to READY -> verify FOOD_READY event and Table status
    const readyRes = await RestaurantCommandPipeline.executeCommand({
      commandId: `CMD-READY-${Date.now()}`,
      type: 'UPDATE_KOT_STATUS',
      deviceId: 'KDS-01',
      senderRole: 'KDS',
      timestamp: new Date().toISOString(),
      payload: { kotId: kot.id, status: 'READY' }
    });
    expect(readyRes.success).toBe(true);
    expect(readyRes.emittedEvents).toContain('FOOD_READY');

    const table5 = db.tables.find((t) => t.tableNumber === '5');
    expect(table5?.status).toBe('FOOD_READY');
  });

  it('4. Full Table Floor Lifecycle: Order -> Table Transfer -> Bill Request -> Complete Payment', async () => {
    // 1. Create order on Table 12
    const createCmd: RestaurantCommand = {
      commandId: `CMD-T12-${Date.now()}`,
      type: 'CREATE_ORDER',
      deviceId: 'CAPTAIN-01',
      senderRole: 'CAPTAIN',
      timestamp: new Date().toISOString(),
      payload: {
        tableNumber: '12',
        orderType: 'DINE_IN',
        // A dine-in bill is settled at the counter: unpaid until the bill request is paid.
        paymentMethod: 'CASH_AT_COUNTER',
        items: [{ dishId: 'DM-05', name: 'Dal Makhani', quantity: 2, unitPrice: 240 }]
      }
    };
    const createRes = await RestaurantCommandPipeline.executeCommand(createCmd);
    const order = createRes.data.order;

    let table12 = db.tables.find((t) => t.tableNumber === '12');
    let table8 = db.tables.find((t) => t.tableNumber === '8');
    expect(table12?.status).toBe('OCCUPIED');
    expect(table8?.status).toBe('AVAILABLE');

    // 2. Transfer Table 12 -> Table 8
    const transferCmd: RestaurantCommand = {
      commandId: `CMD-XFER-${Date.now()}`,
      type: 'TRANSFER_TABLE',
      deviceId: 'CAPTAIN-01',
      senderRole: 'CAPTAIN',
      timestamp: new Date().toISOString(),
      payload: { sourceTableNumber: '12', targetTableNumber: '8' }
    };
    const xferRes = await RestaurantCommandPipeline.executeCommand(transferCmd);
    expect(xferRes.success).toBe(true);

    table12 = db.tables.find((t) => t.tableNumber === '12');
    table8 = db.tables.find((t) => t.tableNumber === '8');
    expect(table12?.status).toBe('AVAILABLE');
    expect(table8?.status).toBe('OCCUPIED');
    expect(table8?.currentOrderId).toBe(order.id);

    // 3. Request Bill from Captain
    const billCmd: RestaurantCommand = {
      commandId: `CMD-BILL-${Date.now()}`,
      type: 'REQUEST_BILL',
      deviceId: 'CAPTAIN-01',
      senderRole: 'CAPTAIN',
      timestamp: new Date().toISOString(),
      payload: { tableNumber: '8', requestedBy: 'Captain Rahul' }
    };
    const billRes = await RestaurantCommandPipeline.executeCommand(billCmd);
    expect(billRes.success).toBe(true);
    expect(billRes.emittedEvents).toContain('BILL_REQUESTED');

    table8 = db.tables.find((t) => t.tableNumber === '8');
    expect(table8?.status).toBe('BILL_REQUESTED');

    // 4. Complete Payment at POS Counter
    const payCmd: RestaurantCommand = {
      commandId: `CMD-PAY-${Date.now()}`,
      type: 'COMPLETE_PAYMENT',
      deviceId: 'POS-01',
      senderRole: 'POS',
      timestamp: new Date().toISOString(),
      payload: { orderId: order.id, paymentMethod: 'UPI' }
    };
    const payRes = await RestaurantCommandPipeline.executeCommand(payCmd);
    expect(payRes.success).toBe(true);
    expect(payRes.data.paymentStatus).toBe('SUCCESS');

    table8 = db.tables.find((t) => t.tableNumber === '8');
    expect(table8?.status).toBe('AVAILABLE');
  });

  it('5. Device Fleet & QR Pairing: Generates short-lived tokens and registers new devices', () => {
    const tokenPayload = JamanvaarLocalCore.generatePairingToken('192.168.1.10', 8765);
    expect(tokenPayload.token.startsWith('PAIR-')).toBe(true);
    expect(tokenPayload.restaurant_id).toBe('JAMANVAAR-AHM-FLAGSHIP');

    // Redeem Token on Captain Handheld
    const pairedDevice = JamanvaarLocalCore.redeemPairingToken(tokenPayload.token, 'Captain Hardik', 'Android Tablet');
    expect(pairedDevice).not.toBeNull();
    expect(pairedDevice?.name).toBe('Captain Hardik');
    expect(pairedDevice?.status).toBe('ONLINE');

    const devices = JamanvaarLocalCore.getRegisteredDevices();
    expect(devices.some((d) => d.id === pairedDevice?.id)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { SyncOutboxEngine } from '../packages/sync/src/outbox';
import { NetworkStatusService } from '../packages/api/src/services/network';
import { db } from '../packages/database/src/db';
import { Order } from '../packages/types/src';

describe('SyncOutboxEngine & Network Continuity', () => {
  it('should track network state transitions correctly', () => {
    NetworkStatusService.setNetworkState('ONLINE', 18);
    expect(NetworkStatusService.isOnline()).toBe(true);
    expect(NetworkStatusService.getLatency()).toBe(18);

    NetworkStatusService.setNetworkState('OFFLINE', 0);
    expect(NetworkStatusService.isOnline()).toBe(false);

    NetworkStatusService.setNetworkState('ONLINE', 18);
  });

  it('should queue events in offline mode and synchronize them upon reconnection', async () => {
    // 1. Add a simulated offline order
    const offlineOrder: Order = {
      id: `ord-offline-${Date.now()}`,
      orderNumber: 'ORD-OFF-1',
      tokenNumber: '999',
      restaurantId: 'rest-1',
      outletId: 'out-1',
      kioskId: 'KIOSK-01',
      sessionId: 'sess-off',
      idempotencyKey: `idemp-off-${Date.now()}`,
      orderType: 'TAKEAWAY',
      items: [],
      subtotal: 300,
      discountAmount: 0,
      cgstAmount: 7.5,
      sgstAmount: 7.5,
      taxAmount: 15,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalAmount: 315,
      paymentMethod: 'CASH_AT_COUNTER',
      paymentStatus: 'SUCCESS',
      orderStatus: 'CONFIRMED',
      estimatedWaitMinutes: 15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'SAVED_LOCALLY',
      isSynced: false
    };

    db.orders.push(offlineOrder);
    SyncOutboxEngine.queueEvent('ORDER_CREATED', offlineOrder, 'KIOSK-01');

    const statsBefore = SyncOutboxEngine.getSyncStats();
    expect(statsBefore.pendingCount).toBeGreaterThan(0);

    // 2. Process outbox (reconnect simulation)
    const result = await SyncOutboxEngine.processOutbox();
    expect(result.processed).toBeGreaterThan(0);
    expect(offlineOrder.syncStatus).toBe('SYNCED');

    const statsAfter = SyncOutboxEngine.getSyncStats();
    expect(statsAfter.pendingCount).toBe(0);
  });
});

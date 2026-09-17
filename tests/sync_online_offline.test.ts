import { describe, expect, it, afterEach } from 'vitest';
import { SyncOutboxEngine, OrderSyncTransport } from '../packages/sync/src/outbox';
import { NetworkStatusService } from '../packages/api/src/services/network';
import { db } from '../packages/database/src/db';
import { Order } from '../packages/types/src';

/**
 * A fake of exactly what a real app's cloudClient.ts wires in — see
 * pos/src/cloud/cloudClient.ts's deviceFetch-backed push/pull. Standing in
 * for the real HTTP round-trip to cloud/api's OrderSyncController lets this
 * test verify the actual push contract instead of the old stub's
 * always-succeeds fake, without needing a live server in the test run.
 */
function fakeTransport(): OrderSyncTransport {
  return {
    async push(events) {
      return {
        results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const, syncVersion: 1 })),
        serverTime: new Date().toISOString()
      };
    },
    async pull() {
      return { orders: [], serverTime: new Date().toISOString() };
    }
  };
}

describe('SyncOutboxEngine & Network Continuity', () => {
  afterEach(() => {
    SyncOutboxEngine.configureTransport(null);
  });

  it('marks pending orders FAILED (not silently synced) when no transport is configured', async () => {
    const offlineOrder: Order = {
      id: `ord-notransport-${Date.now()}`,
      orderNumber: 'ORD-NT-1',
      tokenNumber: '998',
      restaurantId: 'rest-1',
      outletId: 'out-1',
      kioskId: 'KIOSK-01',
      sessionId: 'sess-nt',
      idempotencyKey: `idemp-nt-${Date.now()}`,
      orderType: 'TAKEAWAY',
      items: [],
      subtotal: 100,
      discountAmount: 0,
      cgstAmount: 2.5,
      sgstAmount: 2.5,
      taxAmount: 5,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalAmount: 105,
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

    const result = await SyncOutboxEngine.processOutbox();
    expect(result.failed).toBeGreaterThan(0);
    expect(offlineOrder.syncStatus).toBe('FAILED');
  });

  it('should track network state transitions correctly', () => {
    NetworkStatusService.setNetworkState('ONLINE', 18);
    expect(NetworkStatusService.isOnline()).toBe(true);
    expect(NetworkStatusService.getLatency()).toBe(18);

    NetworkStatusService.setNetworkState('OFFLINE', 0);
    expect(NetworkStatusService.isOnline()).toBe(false);

    NetworkStatusService.setNetworkState('ONLINE', 18);
  });

  it('should queue events in offline mode and synchronize them upon reconnection', async () => {
    SyncOutboxEngine.configureTransport(fakeTransport());

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

import { SyncEvent, SyncEventType } from '@jamanvaar/types';
import { generateUUID } from '@jamanvaar/utils';
import { db } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';

export class SyncOutboxEngine {
  private static isSyncing = false;

  public static queueEvent(eventType: SyncEventType, payload: any, kioskId: string = 'KIOSK-01'): SyncEvent {
    const event: SyncEvent = {
      id: generateUUID(),
      kioskId,
      eventType,
      payload,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date().toISOString()
    };

    db.syncEvents.push(event);
    db.notify();
    return event;
  }

  public static async processOutbox(): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing) return { processed: 0, failed: 0 };
    this.isSyncing = true;
    NetworkStatusService.setNetworkState('SYNCING', NetworkStatusService.getLatency());

    let processed = 0;
    let failed = 0;

    // 1. Process outbox sync events
    const pending = db.syncEvents.filter((e) => e.status === 'PENDING' || e.status === 'FAILED');
    for (const evt of pending) {
      try {
        evt.status = 'PROCESSING';
        evt.lastAttemptAt = new Date().toISOString();
        evt.status = 'COMPLETED';
        processed++;
      } catch (err: any) {
        evt.status = 'FAILED';
        evt.retryCount += 1;
        evt.errorMessage = err?.message || 'Sync transmission failure';
        failed++;
      }
    }

    // 2. Synchronize offline orders
    const offlineOrders = db.orders.filter((o) => o.syncStatus === 'SAVED_LOCALLY' || o.syncStatus === 'FAILED');
    for (const ord of offlineOrders) {
      try {
        ord.syncStatus = 'SYNCING';
        // Simulate cloud acknowledgment
        ord.syncStatus = 'SYNCED';
        processed++;
      } catch (err) {
        ord.syncStatus = 'FAILED';
        failed++;
      }
    }

    NetworkStatusService.setNetworkState('ONLINE', 18);
    db.notify();
    this.isSyncing = false;
    return { processed, failed };
  }

  public static getSyncStats(): { pendingCount: number; syncedCount: number; failedCount: number } {
    const pendingOrders = db.orders.filter((o) => o.syncStatus === 'SAVED_LOCALLY' || o.syncStatus === 'SYNCING').length;
    const syncedOrders = db.orders.filter((o) => !o.syncStatus || o.syncStatus === 'SYNCED').length;
    const failedOrders = db.orders.filter((o) => o.syncStatus === 'FAILED').length;

    const pendingEvents = db.syncEvents.filter((e) => e.status === 'PENDING' || e.status === 'PROCESSING').length;
    const failedEvents = db.syncEvents.filter((e) => e.status === 'FAILED').length;

    return {
      pendingCount: pendingOrders + pendingEvents,
      syncedCount: syncedOrders,
      failedCount: failedOrders + failedEvents
    };
  }
}

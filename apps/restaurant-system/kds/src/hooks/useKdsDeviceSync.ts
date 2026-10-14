import { useEffect } from 'react';
import { syncStaffUsers } from '@jamanvaar/sync';
import { EntitySyncEngine, SyncOutboxEngine, syncServiceMessages, syncMenuCatalog, onAppResume } from '@jamanvaar/sync';
import { pushOrderSync, pullOrderSync, pushEntitySync, pullEntitySync, reportHeartbeat, syncRestaurantIdentity, leaseNumberBlock } from '../cloud/cloudClient';

/**
 * Wires the real cloud sync bridge once this terminal is activated. Extracted from App.tsx as a
 * single-concern effect: its only input is whether the device is activated.
 */
export function useKdsDeviceSync(isDeviceActivated: boolean): void {
  useEffect(() => {
    if (!isDeviceActivated) {
      SyncOutboxEngine.configureTransport(null);
      return;
    }
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_kds_device_id') });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });

    // BUG-019/034/035: a staff PIN issued in Restaurant Admin used to work only on the device that
    // created it — KDS had no entity-sync wiring at all (not even for menu/CRM), so a kitchen chef's
    // PIN never reached this screen despite the create/reset screen's own promise that it would.
    const syncStaff = () => syncStaffUsers({ push: false });

    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void syncStaff();
    // The menu (read-only here) tells this screen which kitchen stations the restaurant uses.
    void syncMenuCatalog({ push: false });
    void reportHeartbeat();
    void syncRestaurantIdentity();

    // A kitchen needs new tickets within seconds, not every 15 s.
    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      // BUG-100: messages from the floor to the kitchen arrive as notifications.
      void syncServiceMessages('KDS');
    }, 3000);
    const interval = setInterval(() => {
      void syncStaff();
      void syncMenuCatalog({ push: false });
      void reportHeartbeat();
      void syncRestaurantIdentity();
    }, 15000);

    // Waking the screen (tab visible again, network back, tablet unlocked) catches up at once: no refresh needed.
    const stopResume = onAppResume(() => {
      void SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
      void SyncOutboxEngine.catchUpFromCloud();
      void syncServiceMessages('KDS');
    });

    return () => {
      clearInterval(orderInterval);
      clearInterval(interval);
      stopResume();
    };
  }, [isDeviceActivated]);
}

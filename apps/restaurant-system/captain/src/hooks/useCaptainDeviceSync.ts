import { useEffect } from 'react';
import { syncStaffUsers, SyncOutboxEngine, EntitySyncEngine, syncDiningTables, syncServiceMessages, syncMenuCatalog, syncReservations, syncCustomers, syncLoyaltyTiers, syncLoyaltyRewards, syncLoyaltyProgramSettings, onAppResume } from '@jamanvaar/sync';
import { useCaptainStore } from '../store/captainStore';
import { pushOrderSync, pullOrderSync, pushEntitySync, pullEntitySync, reportHeartbeat, syncRestaurantIdentity, leaseNumberBlock } from '../cloud/cloudClient';

/**
 * Wires the real cloud sync bridge once this tablet is connected. Extracted from App.tsx as a
 * single-concern effect: its only input is whether the device is connected.
 */
export function useCaptainDeviceSync(deviceConnected: boolean): void {
  useEffect(() => {
    if (!deviceConnected) {
      SyncOutboxEngine.configureTransport(null);
      return;
    }
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_captain_device_id') });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });

    // Captain never edits the menu — only pulls whatever POS/Restaurant
    // Admin have pushed, so a Captain tablet with its own cleared/fresh
    // storage still gets the real menu instead of the local seed fallback.

    // Captain never edits categories either — pull only, same as menu items.

    // BUG-019/034/035: a staff PIN issued in Restaurant Admin used to work only on the device that
    // created it — Captain never pulled staff records, despite the create/reset screen's own promise
    // that the PIN would work here too. Captain never edits staff either — pull only.
    const syncStaff = () => syncStaffUsers({ push: false });

    // Guests attached to a table here reach Restaurant Admin's CRM and back (same two-way sync as POS's own
    // counter-registered guests): only what changed is sent, and the newer change wins. Loyalty tiers, the
    // reward catalog and the admin's earn rate are configured in Restaurant Admin only — Captain just pulls them.
    const syncCrm = () => syncCustomers({ push: true });
    const syncLoyalty = () => {
      void syncLoyaltyTiers({ push: false });
      void syncLoyaltyRewards({ push: false });
      void syncLoyaltyProgramSettings({ push: false });
    };

    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void syncMenuCatalog({ push: false });
    void syncReservations({ push: false });
    void syncStaff();
    void syncCrm();
    void syncLoyalty();
    void syncDiningTables();
    EntitySyncEngine.registerWakeUp('SERVICE_MESSAGE', async () => { const inbound = await syncServiceMessages('CAPTAIN'); useCaptainStore.getState().receiveMessages(inbound); });
    void reportHeartbeat();
    void syncRestaurantIdentity();

    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      // BUG-096/097: table layout and status are shared with Restaurant Admin and POS.
      void syncDiningTables();
      // BUG-099/100: deliver this tablet's bill requests and messages, and show what others sent.
      void syncServiceMessages('CAPTAIN').then((inbound) => {
        if (inbound.length > 0) useCaptainStore.getState().receiveMessages(inbound);
      });
    }, 4000);
    const interval = setInterval(() => {
      void syncMenuCatalog({ push: false });
      void syncReservations({ push: false });
      void syncStaff();
      void syncCrm();
      void syncLoyalty();
      void reportHeartbeat();
      void syncRestaurantIdentity();
    }, 15000);

    // Waking the tablet (screen unlocked, network back, tab visible again) catches up at once: no refresh needed.
    const stopResume = onAppResume(() => {
      void SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
      void SyncOutboxEngine.catchUpFromCloud();
      void syncDiningTables();
    });

    return () => {
      clearInterval(orderInterval);
      clearInterval(interval);
      stopResume();
    };
  }, [deviceConnected]);
}

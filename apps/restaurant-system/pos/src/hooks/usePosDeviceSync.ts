import { useEffect } from 'react';
import { syncStaffUsers, startLocalChangeSync, syncInventoryMasters, InventoryLedgerSync, SyncOutboxEngine, EntitySyncEngine, syncDiningTables, syncServiceMessages, syncMenuCatalog, syncCustomers, syncShifts, syncReservations, syncLoyaltyTiers, syncLoyaltyRewards, syncLoyaltyProgramSettings, syncKioskConfiguration, onAppResume } from '@jamanvaar/sync';
import { pushOrderSync, pullOrderSync, pushEntitySync, pullEntitySync, reportHeartbeat, syncRestaurantIdentity, leaseNumberBlock, pushInventoryMovements, pullInventoryMovements } from '../cloud/cloudClient';

/**
 * Wires the real cloud sync bridge once this terminal is activated -- without this, orders would
 * sit at SAVED_LOCALLY forever and no other device (KDS, Captain) would ever see them via the
 * cloud catch-up path. Extracted from App.tsx as a single-concern effect: its only input is
 * whether the device is activated, and it has no other dependency on the rest of the app's state.
 */
export function usePosDeviceSync(isDeviceActivated: boolean): void {
  useEffect(() => {
    if (!isDeviceActivated) {
      SyncOutboxEngine.configureTransport(null);
      InventoryLedgerSync.configureTransport(null);
      return;
    }
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_pos_device_id') });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });
    InventoryLedgerSync.configureTransport({ push: pushInventoryMovements, pull: pullInventoryMovements });
    void syncInventoryMasters({ push: false }).then(() => InventoryLedgerSync.sync());

    // Guests registered here reach Restaurant Admin's CRM and back (BUG-159): only what changed is sent, and the
    // newer change wins, so a stale copy cannot overwrite loyalty points changed elsewhere.
    const syncCrm = () => syncCustomers({ push: true });

    // Database-layer gap: the menu previously lived only in this device's
    // own browser storage — clearing it, or a brand-new terminal, meant
    // starting from the seed menu with no way to recover a restaurant's
    // real one. Every device now pushes its full current menu and merges
    // in whatever other devices have pushed, so the menu has a real,
    // durable copy in Postgres instead of existing on exactly one screen.

    // BUG-016: MENU_CATEGORY was defined in the entity-sync bridge's DTO but no app
    // ever actually used it, so categories never synced (even though the dishes did).

    // BUG-019/034/035: a staff PIN issued in Restaurant Admin used to work only on the device that
    // created it — nothing synced staff records here, despite the create/reset screen's own promise
    // that the PIN would work on POS too. Restaurant Admin is the only place staff are created, so
    // this terminal only pulls.
    const syncStaff = () => syncStaffUsers({ push: false });

    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void syncCrm();
    const stopLocalChanges = startLocalChangeSync({ customers: true, menu: true, tables: true, staff: false });
    void syncMenuCatalog({ push: true });
    void syncStaff();
    // Restaurant Admin is the only place the Loyalty Program (tier multipliers, rewards catalog) is
    // edited — this terminal only ever reads it, so a real reward can actually be redeemed at the till.
    void syncLoyaltyTiers({ push: false });
    void syncLoyaltyRewards({ push: false });
    void syncLoyaltyProgramSettings({ push: false });
    void syncDiningTables();
    // B2-056: this POS's own cash-drawer shift and its cash movements, so Restaurant Admin's
    // Shift & Cash Drawer Ledger/Reconciliation/EOD Z-Report can see them. Only POS edits its own
    // shift, so this terminal always pushes.
    void syncShifts({ push: true });
    void syncReservations({ push: true });
    void reportHeartbeat();
    void syncRestaurantIdentity();
    // BUG: despite its name this also carries ReceiptConfig (thank-you message, footer, logo, and
    // the UPI "scan to pay" QR settings) -- Restaurant Admin pushes it, but POS never pulled it at
    // all, so a UPI QR enabled in Settings showed correctly in Admin's own receipt preview and on
    // Kiosk (which does call this), yet never reached the actual bill printed at the counter.
    void syncKioskConfiguration().catch(() => {});

    // Orders, kitchen tickets and table states are time-critical: every few seconds. The
    // heavier snapshots (CRM, menu) and the heartbeat keep the slower cadence.
    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      void syncDiningTables();
      void InventoryLedgerSync.sync();
      // BUG-099/100: bill requests and messages from Captain arrive as notifications.
      void syncServiceMessages('POS');
    }, 4000);
    const interval = setInterval(() => {
      void syncCrm();
      void syncMenuCatalog({ push: true });
      void syncStaff();
      void syncLoyaltyTiers({ push: false });
      void syncLoyaltyRewards({ push: false });
      void syncLoyaltyProgramSettings({ push: false });
      void syncShifts({ push: true });
      void syncReservations({ push: true });
      void reportHeartbeat();
      void syncRestaurantIdentity();
      void syncKioskConfiguration().catch(() => {});
    }, 15000);

    // Waking the terminal (screen unlocked, network back, tab visible again) catches up at once: no refresh needed.
    const stopResume = onAppResume(() => {
      void SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
      void SyncOutboxEngine.catchUpFromCloud();
      void syncDiningTables();
      void InventoryLedgerSync.sync();
    });

    return () => {
      stopLocalChanges();
      clearInterval(orderInterval);
      clearInterval(interval);
      stopResume();
    };
  }, [isDeviceActivated]);
}

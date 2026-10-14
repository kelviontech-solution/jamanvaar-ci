import { useEffect } from 'react';
import { activeAdminBranch } from '../adminBranchScope';
import { ReservationRepository } from '@jamanvaar/database';
import {
  EntitySyncEngine,
  SyncOutboxEngine,
  InventoryLedgerSync,
  syncDiningTables,
  syncServiceMessages,
  syncMenuCatalog,
  syncCustomers,
  syncShifts,
  syncReservations,
  syncFeedback,
  syncLoyaltyTiers,
  syncLoyaltyRewards,
  syncLoyaltyProgramSettings,
  syncKioskConfiguration,
  syncStaffUsers,
  startLocalChangeSync,
  syncPromotions,
  syncInventoryMasters
} from '@jamanvaar/sync';
import {
  getStoredDeviceToken,
  pushEntitySync,
  pullEntitySync,
  pushOrderSync,
  pullOrderSync,
  leaseNumberBlock,
  pushInventoryMovements,
  pullInventoryMovements,
  refreshCloudEntitlementsIntoLicense,
  reportDeviceHeartbeat,
  syncRestaurantIdentity,
  type AppCode
} from '../cloud/cloudClient';

/**
 * Database-layer gap: the menu previously lived only in whichever device's browser created it --
 * Restaurant Admin is the actual menu-editing surface, so its edits are what most needs a durable
 * cloud copy. Gated on the device token specifically (not cloudConnected/the user session), since
 * entity-sync is a DeviceAuthGuard endpoint. Extracted from App.tsx, same effect, same deps.
 */
export function usePosAdminDeviceSync(
  branchScopeReady: boolean,
  cloudConnected: boolean,
  isAdminLoggedIn: boolean,
  entitlementsLoading: boolean,
  entitlementError: string | null,
  hasApp: (app: AppCode) => boolean,
  refetchEntitlements: () => void
): void {
  useEffect(() => {
    if (!branchScopeReady || activeAdminBranch === 'all' || !isAdminLoggedIn || entitlementsLoading || entitlementError || !getStoredDeviceToken()) return;
    const restaurantAccess = hasApp('POS_ADMIN');
    const kioskAccess = hasApp('KIOSK_ADMIN');
    if (!restaurantAccess && !kioskAccess) return;
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });
    // Restaurant Admin is the owner's live window onto the restaurant: it must
    // receive every order, payment and kitchen ticket the other devices create.
    // It used to have no order-sync client at all (BUG-034).
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_cloud_device_id') });
    InventoryLedgerSync.configureTransport(restaurantAccess ? { push: pushInventoryMovements, pull: pullInventoryMovements } : null);
    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    if (restaurantAccess) void syncInventoryMasters({ push: true }).then(() => InventoryLedgerSync.sync());
    void syncDiningTables();
    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      if (restaurantAccess) void syncInventoryMasters({ push: true }).then(() => InventoryLedgerSync.sync());
      void SyncOutboxEngine.catchUpFromCloud();
      // BUG-096/097: the floor plan built here, and each table's live state, are shared with POS and Captain.
      void syncDiningTables();
      void syncServiceMessages('POS_ADMIN');
    }, 4000);


    // BUG-016: same gap as POS — categories were never synced, only dishes.

    // BUG-019/034/035: staff PINs created here previously worked only on this one device — nothing
    // synced them to POS, Captain, KDS or Kiosk, despite the create/reset screen's own promise that
    // they would. Restaurant Admin is the sole place staff are created, so this is push-heavy, but it
    // still applies whatever it pulls back in case another admin device edited a record first.
    const syncStaff = () => syncStaffUsers({ push: true });

    const stopLocalChanges = startLocalChangeSync({ customers: true, menu: true, tables: true, staff: true, promotions: true, inventory: restaurantAccess });
    void syncMenuCatalog({ push: true });
    void syncPromotions({ pushCombos: true, pushCoupons: true });
    if (restaurantAccess) void syncCustomers({ push: true }); // BUG-159: guests registered at the counter show up in the CRM
    void syncStaff();
    // B2-056: POS's own cash-drawer shift and its cash movements, so the Shift & Cash Drawer
    // Ledger, Reconciliation and EOD Z-Report pages here actually see them. Restaurant Admin never
    // opens or edits a shift itself, so this device only ever pulls.
    if (restaurantAccess) void syncShifts({ push: false });
    // The Customer Experience & Feedback tab only ever reads ratings; the kiosk is the only place
    // they're ever submitted, so this device only ever pulls, never pushes.
    if (restaurantAccess) void syncFeedback({ push: false });
    // The Loyalty Program modal (tiers, rewards catalog) is edited only here — POS and Captain only read it.
    if (restaurantAccess) void syncLoyaltyTiers({ push: true });
    if (restaurantAccess) void syncLoyaltyRewards({ push: true });
    if (restaurantAccess) void syncLoyaltyProgramSettings({ push: true });
    if (restaurantAccess) void syncReservations({ push: true });
    // B2-055: keeps LicenseRepository (plan tier, sidebar badges, JAMAN AI button) in step with a
    // Super Admin plan change regardless of which screen is open — was only ever refreshed when
    // the Subscription Plans screen itself happened to be mounted.
    void refreshCloudEntitlementsIntoLicense();
    void reportDeviceHeartbeat();
    void syncRestaurantIdentity();
    void syncKioskConfiguration({ push: true }).catch(() => {});
    const interval = setInterval(() => {
      void syncMenuCatalog({ push: true });
      void syncPromotions({ pushCombos: true, pushCoupons: true });
    if (restaurantAccess) void syncCustomers({ push: true });
      void syncStaff();
      if (restaurantAccess) void syncShifts({ push: false });
      if (restaurantAccess) void syncFeedback({ push: false });
      if (restaurantAccess) void syncLoyaltyTiers({ push: true });
      if (restaurantAccess) void syncLoyaltyRewards({ push: true });
      if (restaurantAccess) void syncLoyaltyProgramSettings({ push: true });
      // Guests who did not come free their table, then the change goes out with the rest.
      ReservationRepository.releaseOverdue();
      if (restaurantAccess) void syncReservations({ push: true });
      void refreshCloudEntitlementsIntoLicense();
      // Same self-healing reason: picks up a Super Admin entitlement change made while this
      // console is already open, not just the fresh-activation case the cloudConnected key covers.
      refetchEntitlements();
      void reportDeviceHeartbeat();
      void syncRestaurantIdentity();
    void syncKioskConfiguration({ push: true }).catch(() => {});
    }, 15000);
    return () => {
      stopLocalChanges();
      clearInterval(interval);
      clearInterval(orderInterval);
      SyncOutboxEngine.configureTransport(null);
      InventoryLedgerSync.configureTransport(null);
    };
  }, [branchScopeReady, cloudConnected, isAdminLoggedIn, entitlementsLoading, entitlementError, hasApp]);
}

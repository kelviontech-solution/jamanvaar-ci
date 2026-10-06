import { KioskContentPanel } from './components/settings/KioskContentPanel';
import { KioskComboPanel } from './components/settings/KioskComboPanel';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import { syncStaffUsers, startLocalChangeSync, syncPromotions, syncInventoryMasters } from '@jamanvaar/sync';
import React, { useEffect, useState, useMemo } from 'react';
import {
  AuditRepository,
  CouponRepository,
  db,
  LicenseRepository,
  MenuRepository,
  NotificationRepository,
  RestaurantIdentityRepository,
  ReservationRepository,
  StaffRepository
} from '@jamanvaar/database';
import { ForgotPasswordPanel } from './components/auth/ForgotPasswordPanel';
import { ActivateOwnerPanel } from './components/auth/ActivateOwnerPanel';
import type { CloudRestaurantProfile } from './cloud/cloudClient';
import { SyncHealthPanel } from './components/sync/SyncHealthPanel';
import { isCloudConnected, redeemActivationCode, cloudLoginOwner, cloudActivateDevice, cloudLogout, CloudApiError, reportAiQueryNow, pushEntitySync, pullEntitySync, pushOrderSync, pullOrderSync, reportDeviceHeartbeat, getStoredDeviceToken, refreshCloudEntitlementsIntoLicense, syncRestaurantIdentity, saveRestaurantIdentity, leaseNumberBlock, pushInventoryMovements, pullInventoryMovements, fetchCloudKiosks, sendKioskCommand, type CloudKiosk } from './cloud/cloudClient';
import { EntitySyncEngine, SyncOutboxEngine, InventoryLedgerSync, syncDiningTables, syncServiceMessages, syncMenuCatalog, syncCustomers, syncShifts, syncReservations } from '@jamanvaar/sync';
import {
  Category,
  Coupon,
  DiningTable,
  InventoryItem,
  MenuItem,
  Order,
  PrinterDevice,
  Recipe,
  User,
  CustomerAccount
} from '@jamanvaar/types';
import {
  Button,
  JamanAiAssistantModal,
  JamanAiFloatingButton,
  JAMANVAARStartup,
  JamanvaarAuthLayout,
  APP_HERO_IMAGES,
  Modal,
  NotificationDrawerModal,
  NotificationToastContainer,
  useAiAccess,
  ActivationNoticeBanner
} from '@jamanvaar/ui';
import { lanMeshSync } from '@jamanvaar/sync';
import { useEntitlements, filterNavSections } from './hooks/useEntitlements';
import { productNavSections } from './navSections';
import { ADMIN_PRODUCTS, PRODUCT_PAGES, availableAdminProducts } from './adminProducts';
import { useAdminProduct } from './hooks/useAdminProduct';
import { KioskDashboard } from './components/kiosk/KioskDashboard';
import { OnlinePaymentsPanel } from './components/payments/OnlinePaymentsPanel';
import {
  CentralReportingService,
  ReportGeneratorService,
  SessionPersistence
} from '@jamanvaar/business';
import {
  Activity,
  AlertCircle,
  Award,
  CalendarClock,
  CheckCircle2,
  Coins,
  CreditCard,
  Database,
  DollarSign,
  Flame,
  Grid,
  Heart,
  LayoutDashboard,
  Package,
  Printer,
  QrCode,
  Lock,
  ChevronDown,
  Settings,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Sparkles,
  ArrowRight,
  LifeBuoy,
  Truck,
  RefreshCw,
  Sliders,
  Tablet,
  Unlock,
  Tag
} from 'lucide-react';

// Reusable Feature Modules
import { RestaurantDashboard } from './components/dashboard/RestaurantDashboard';
import { BillingInvoicesModule } from './components/billing/BillingInvoicesModule';
import { OrdersModule } from './components/orders/OrdersModule';
import { KitchenKotModule } from './components/kitchen/KitchenKotModule';
import { QrConsole } from './components/qrconsole/QrConsole';
import { useQrEntitlement } from './components/qrconsole/useQrEntitlement';
import { LegacyGuestRedirect } from './components/qrconsole/LegacyGuestRedirect';
import { MenuCategoriesModule } from './components/menu/MenuCategoriesModule';
import { MenuOptionsModule } from './components/menu/MenuOptionsModule';
import { FloorTablesModule } from './components/tables/FloorTablesModule';
import { ReservationsModule } from './components/reservations/ReservationsModule';
import { BranchDirectoryModal } from './components/header/BranchDirectoryModal';
import { InventoryRecipesModule } from './components/inventory/InventoryRecipesModule';
import { CustomersCrmModule } from './components/customers/CustomersCrmModule';
import { StaffRolesModule } from './components/staff/StaffRolesModule';
import { PaymentsSplitModule } from './components/payments/PaymentsSplitModule';
import { KioskPaymentSettingsPanel } from './components/payments/KioskPaymentSettingsPanel';
import { ReportsDashboard } from './components/reports/ReportsDashboard';
import { ShiftCashDrawerModule } from './components/shifts/ShiftCashDrawerModule';
import { PrintersDevicesModule } from './components/hardware/PrintersDevicesModule';
import { KitchenPrinterRoutingPanel } from './components/hardware/KitchenPrinterRoutingPanel';
import { PrintQueuePanel } from './components/hardware/PrintQueuePanel';
import { ReceiptEBillPanel } from './components/receipts/ReceiptEBillPanel';
import { FeedbackPanel } from './components/kiosk/FeedbackPanel';
import { ReportBrandingSettings } from './components/settings/ReportBrandingSettings';
import { SubscriptionPlansView } from './components/settings/SubscriptionPlansView';
import { AuditTrailModule } from './components/audit/AuditTrailModule';
import { BackupRestoreModule } from './components/backup/BackupRestoreModule';
import { SupportTicketsModule } from './components/support/SupportTicketsModule';
import { InventoryControlModule } from './components/inventory/InventoryControlModule';
import { TerminalDisplaySettings } from './components/settings/TerminalDisplaySettings';
import { KioskDisplaySettingsPanel } from './components/settings/KioskDisplaySettingsPanel';
import { WhatsAppChannelPanel } from './components/settings/WhatsAppChannelPanel';
import { PosAdminHeader } from './components/header/PosAdminHeader';

// Specialized Modal Dialogs
import { ConfirmModal } from './components/ConfirmModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { OrderDetailModal } from './components/OrderDetailModal';
import { ItemModal } from './components/ItemModal';
import { CategoryModal } from './components/CategoryModal';
import { TableModal } from './components/TableModal';
import { StaffModal } from './components/StaffModal';
import { CustomerModal } from './components/CustomerModal';
import { InventoryModal } from './components/InventoryModal';
import { RecipeModal } from './components/RecipeModal';
import { PrinterModal } from './components/PrinterModal';
import { PrebuiltMenuModal } from './components/PrebuiltMenuModal';
import { StockAdjustModal } from './components/StockAdjustModal';
import { WastageLogModal } from './components/inventory/WastageLogModal';
import { CashDropModal } from './components/CashDropModal';
import { EodReportModal } from './components/EodReportModal';
import { RestoreModal } from './components/RestoreModal';
import { FinancialReconciliationModal } from './components/reports/FinancialReconciliationModal';

export type PosAdminTab =
  | 'DASHBOARD'
  | 'QR_ORDERING'
  | 'BILLING_SALES'
  | 'ORDERS'
  | 'LIVE_KDS'
  | 'MENU'
  | 'MENU_OPTIONS'
  | 'TABLES'
  | 'RESERVATIONS'
  | 'KITCHEN_KOT'
  | 'INVENTORY'
  | 'CUSTOMERS'
  | 'STAFF'
  | 'PAYMENTS'
  | 'REPORTS'
  | 'SHIFTS'
  | 'HARDWARE'
  | 'SYNC'
  | 'SETTINGS'
  | 'LICENSE'
  | 'AUDIT'
  | 'BACKUP'
  | 'SUPPORT'
  | 'INVENTORY_CONTROL'
  | 'KIOSK_DESIGN'
  | 'KIOSK_COMBOS'
  | 'KIOSKS'
  | 'COUPONS'
  | 'RECEIPTS'
  | 'TEMPLATES'
  | 'KIOSK_PAYMENTS'
  | 'FEEDBACK';

/** The real production tab list, as a runtime array -- restoreActiveTab validates against this
 *  (not a hardcoded fixture), so a test can prove every actual tab round-trips, and the array
 *  can't silently drift out of sync with the PosAdminTab type above (TS flags it if they diverge). */
export const ALL_POS_ADMIN_TABS: readonly PosAdminTab[] = [
  'DASHBOARD', 'QR_ORDERING', 'BILLING_SALES', 'ORDERS', 'LIVE_KDS', 'MENU', 'MENU_OPTIONS',
  'TABLES', 'RESERVATIONS', 'KITCHEN_KOT', 'INVENTORY', 'CUSTOMERS', 'STAFF', 'PAYMENTS',
  'REPORTS', 'SHIFTS', 'HARDWARE', 'SYNC', 'SETTINGS', 'LICENSE', 'AUDIT', 'BACKUP', 'SUPPORT',
  'INVENTORY_CONTROL', 'KIOSK_DESIGN', 'KIOSK_COMBOS', 'KIOSKS', 'COUPONS', 'RECEIPTS', 'TEMPLATES', 'KIOSK_PAYMENTS', 'FEEDBACK'
];



/** Compatibility validator for callers of the old tab API. Routing now restores product and page together. */
export function restoreActiveTab(stored: string | null): PosAdminTab {
  return stored && (ALL_POS_ADMIN_TABS as readonly string[]).includes(stored) ? (stored as PosAdminTab) : 'DASHBOARD';
}

export default function PosAdminApp() {
  const ai = useAiAccess();
  // Check URL parameters for direct guest QR table ordering
  const queryParams = new URLSearchParams(window.location.search);
  const isGuestQrMode = queryParams.has('qrTable') || queryParams.has('table');

  if (isGuestQrMode) {
    return <LegacyGuestRedirect />;
  }

  const [kiosks, setKiosks] = useState<CloudKiosk[]>([]);
  const coupons = CouponRepository.getAllCoupons();
  const [isAddCouponModalOpen, setIsAddCouponModalOpen] = useState(false);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponValue, setNewCouponValue] = useState<number>(50);
  const [newCouponMin, setNewCouponMin] = useState<number>(200);
  const [newCouponUsageLimit, setNewCouponUsageLimit] = useState('');
  // Whether QR Ordering is in this restaurant's plan, as the server says (cached for a week offline).
  const qr = useQrEntitlement();
  const qrKnown = qr.state.status === 'ready';
  const qrLocked = qr.state.status === 'ready' && !qr.state.entitlement.enabled;
  const [dbTick, setDbTick] = useState(0);
  // Below the large breakpoint the sidebar is a drawer that slides over the page instead of taking most of a phone's width.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // Sidebar sections are collapsible and remembered per install (localStorage)
  // — previously all 19 nav items across 5 sections were always fully
  // expanded with no way to hide sections a given owner never uses.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('jamanvaar_posadmin_collapsed_sections');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      try {
        localStorage.setItem('jamanvaar_posadmin_collapsed_sections', JSON.stringify(next));
      } catch {
        // localStorage unavailable — collapse state just won't persist across reloads.
      }
      return next;
    });
  };

  // Authentication State — restored from persisted session
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(
    () => SessionPersistence.isValid('admin')
  );
  const [authRestaurantCode, setAuthRestaurantCode] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  // Two-phase auth state: 'LOGIN' (enter email + password) or 'ACTIVATION_REQUIRED' (enter JMV key)
  const [passwordResetNotice, setPasswordResetNotice] = useState(false);
  const [authScreenState, setAuthScreenState] = useState<'LOGIN' | 'ACTIVATION_REQUIRED' | 'FORGOT' | 'ACTIVATE'>('LOGIN');
  const [activatePrefill, setActivatePrefill] = useState<{ code: string; email: string; token: string } | null>(null);

  // The owner's welcome email links here with the Restaurant ID, email and token in the address. Read them once, then drop them from the address bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('activate') !== '1') return;
    setActivatePrefill({ code: params.get('code') ?? '', email: params.get('email') ?? '', token: params.get('token') ?? '' });
    setAuthScreenState('ACTIVATE');
    window.history.replaceState({}, '', window.location.pathname);
  }, []);
  const [activationSessionToken, setActivationSessionToken] = useState('');
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [pendingTenant, setPendingTenant] = useState<{
    restaurantId: string;
    restaurantName: string;
    ownerEmail: string;
    ownerName: string;
  } | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(() => isCloudConnected());
  // Which AppCodes (e.g. KIOSK_ADMIN) this restaurant has enabled, to gate nav sections below.
  // Keyed on cloudConnected so a fresh device activation (which flips this true after this hook's
  // own initial mount-time fetch already 401'd) re-fetches instead of staying wrong until reload.
  const tenantId = localStorage.getItem('jamanvaar_cloud_restaurant_id');
  const { enabledApps, hasApp, loading: entitlementsLoading, refetch: refetchEntitlements, error: entitlementError, authRequired } = useEntitlements(`${isAdminLoggedIn}:${cloudConnected}:${tenantId}`, isAdminLoggedIn);
  const availableProducts = availableAdminProducts(enabledApps);
  const contextReady = isAdminLoggedIn && !entitlementsLoading && !entitlementError;
  const context = useAdminProduct(tenantId, availableProducts, contextReady);
  const product = context.product;
  const isKioskAdmin = product === 'KIOSK_ADMIN';
  const activeTab: PosAdminTab = context.page || 'DASHBOARD';
  const setActiveTab: React.Dispatch<React.SetStateAction<PosAdminTab>> = next => {
    const page = typeof next === 'function' ? next(activeTab) : next;
    if (product && Object.hasOwn(PRODUCT_PAGES[product], page)) context.navigate(product, page);
  };
  const appName = product ? ADMIN_PRODUCTS[product].name : 'Jamanvaar Apps';
  useEffect(() => { document.title = `JAMANVAAR | ${isAdminLoggedIn ? appName : 'Owner Sign-in'}`; }, [appName, isAdminLoggedIn]);

  const completeLogin = (
    user: { id: string; fullName: string; role: string; restaurantId: string },
    restaurant?: CloudRestaurantProfile
  ) => {
    setIsAdminLoggedIn(true);
    setAuthError('');
    setAuthPassword('');
    setAuthScreenState('LOGIN');
    setCloudConnected(true);
    refetchEntitlements();

    if (restaurant) {
      // BUG-110: the header kept showing the demo branch "Ahmedabad Flagship Store".
      RestaurantIdentityRepository.adoptBranch(restaurant.id, restaurant.name);
      // BUG-158: and the legal details (GSTIN, address, phone, FSSAI) stayed the demo install's, printing on bills.
      RestaurantIdentityRepository.syncProfile(restaurant);
    }

    SessionPersistence.save('admin', {
      userId: user.id,
      fullName: user.fullName,
      roleId: user.role === 'OWNER' ? 'role-admin' : 'role-manager',
      restaurantId: user.restaurantId,
      terminalId: 'ADMIN-01'
    });
  };

  const handleAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authRestaurantCode.trim() || !authPassword.trim()) {
      setAuthError('Please enter your Restaurant ID and password.');
      return;
    }

    setAuthError('');
    setLoginBusy(true);

    // Production Multi-Tenant Cloud Authentication (owner-only — spec sections 5/33)
    try {
      const authResult = await cloudLoginOwner(authRestaurantCode.trim(), authPassword);

      if (authResult.requiresActivation) {
        if (activationKeyInput.trim()) {
          const activated = await cloudActivateDevice(authResult.activationSessionToken, activationKeyInput.trim());
          setActivationKeyInput('');
          completeLogin(activated.user, activated.restaurant);
          return;
        }
        // Ask for a key only when this device has not been connected yet.
        setActivationSessionToken(authResult.activationSessionToken);
        setPendingTenant({
          restaurantId: authResult.restaurant.id,
          restaurantName: authResult.restaurant.name,
          ownerEmail: authResult.user.email,
          ownerName: authResult.user.fullName
        });
        setActivationKeyInput('');
        setActivationError('');
        setAuthScreenState('ACTIVATION_REQUIRED');
      } else {
        // Direct LOGIN_SUCCESS (device already registered in PostgreSQL)
        completeLogin(authResult.user, authResult.restaurant);
      }
    } catch (err) {
      // No local credential store exists for admin accounts, so a failed cloud
      // auth call cannot be resolved locally — surface the real error instead
      // of granting access on username/role match alone.
      setAuthError(
        err instanceof CloudApiError
          ? err.message
          : 'Unable to reach the server to verify credentials. Please check your connection and try again.'
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationKeyInput.trim()) {
      setActivationError('Please enter the activation key from your Welcome Kit.');
      return;
    }
    setActivationError('');
    setActivationBusy(true);

    try {
      const res = await cloudActivateDevice(activationSessionToken, activationKeyInput.trim());
      setActivationKeyInput('');
      completeLogin(res.user, res.restaurant);
    } catch (err) {
      setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed. Please verify the code.');
    } finally {
      setActivationBusy(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAuthPassword('');
    // Fire-and-forget: the server-side revocation (LOW-05) must not block the
    // UI from signing out locally, including while offline.
    void cloudLogout();
    SessionPersistence.clear('admin');
  };

  // Global Search State
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // Dashboard Time Filter
  const [dashFilter, setDashFilter] = useState<
    'TODAY' | 'YESTERDAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM'
  >('TODAY');

  // Modals Open States & Editing Entities
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<MenuItem | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);

  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [tableToEdit, setTableToEdit] = useState<DiningTable | null>(null);

  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffToEdit, setStaffToEdit] = useState<User | null>(null);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerAccount | null>(null);

  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [inventoryToEdit, setInventoryToEdit] = useState<InventoryItem | null>(null);

  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [recipeToEdit, setRecipeToEdit] = useState<Recipe | null>(null);

  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [printerToEdit, setPrinterToEdit] = useState<PrinterDevice | null>(null);

  const [isPrebuiltMenuModalOpen, setIsPrebuiltMenuModalOpen] = useState(false);

  const [isStockAdjustModalOpen, setIsStockAdjustModalOpen] = useState(false);
  const [stockAdjustItem, setStockAdjustItem] = useState<InventoryItem | null>(null);

  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [wastageItem, setWastageItem] = useState<InventoryItem | null>(null);

  const [isBranchDirectoryOpen, setIsBranchDirectoryOpen] = useState(false);

  const [isCashDropModalOpen, setIsCashDropModalOpen] = useState(false);
  const [isEodModalOpen, setIsEodModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

  // Bulk Price Adjuster Modal
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState(10);
  const [bulkRounding, setBulkRounding] = useState<1 | 5 | 10>(5);

  // Confirmation Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDanger: true
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isProUpgradeModalOpen, setIsProUpgradeModalOpen] = useState(false);
  const [isReconModalOpen, setIsReconModalOpen] = useState(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [reportSubTab, setReportSubTab] = useState<string>('DAILY');

  // A product/tenant switch must not retain an editor or order detail from the previous workspace.
  useEffect(() => {
    setSelectedOrderDetail(null); setItemToEdit(null); setCategoryToEdit(null); setTableToEdit(null);
    setStaffToEdit(null); setCustomerToEdit(null); setInventoryToEdit(null); setRecipeToEdit(null);
    setIsGlobalSearchOpen(false); setIsItemModalOpen(false); setIsCategoryModalOpen(false);
    setIsTableModalOpen(false); setIsStaffModalOpen(false); setIsCustomerModalOpen(false);
    setIsInventoryModalOpen(false); setIsRecipeModalOpen(false); setIsPrinterModalOpen(false);
    setIsPrebuiltMenuModalOpen(false); setIsBulkPriceModalOpen(false); setIsAddCouponModalOpen(false);
    setIsRestoreModalOpen(false); setIsEodModalOpen(false); setIsReconModalOpen(false);
    setConfirmDialog(previous => ({ ...previous, isOpen: false })); setNavOpen(false);
  }, [tenantId, product, isAdminLoggedIn]);

  // Whether JAMAN AI works, is locked or is hidden is decided by the platform for THIS restaurant (delivered
  // with the heartbeat and cached), not by the local licence record, which every fresh install set to PRO.
  const handleOpenAssistant = () => setIsAssistantOpen(true);

  const unreadNotifsCount = NotificationRepository.getUnreadCount('POS_ADMIN');

  // Real-time Database & LAN Mesh Cluster Subscription
  useEffect(() => {
    lanMeshSync.registerDevice('POS_ADMIN', 'ADMIN-01', 'Restaurant Admin HQ');

    const unsubMesh = lanMeshSync.onAny((_evt: any) => {
      setDbTick((t) => t + 1);
    });

    const unsubDb = db.subscribe(() => {
      setDbTick((t) => t + 1);
    });

    const pollInterval = setInterval(() => {
      setDbTick((t) => t + 1);
    }, 2000);

    return () => {
      unsubMesh();
      unsubDb();
      clearInterval(pollInterval);
    };
  }, []);

  // Database-layer gap: the menu previously lived only in whichever device's
  // browser created it — Restaurant Admin is the actual menu-editing
  // surface, so its edits are what most needs a durable cloud copy. Gated on
  // the device token specifically (not cloudConnected/the user session),
  // since entity-sync is a DeviceAuthGuard endpoint.
  useEffect(() => {
    if (!isAdminLoggedIn || entitlementsLoading || entitlementError || !getStoredDeviceToken()) return;
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

    const stopLocalChanges = startLocalChangeSync({ menu: true, tables: true, staff: true, promotions: true, inventory: restaurantAccess });
    void syncMenuCatalog({ push: true });
    void syncPromotions({ pushCombos: true, pushCoupons: true });
    if (restaurantAccess) void syncCustomers({ push: true }); // BUG-159: guests registered at the counter show up in the CRM
    void syncStaff();
    // B2-056: POS's own cash-drawer shift and its cash movements, so the Shift & Cash Drawer
    // Ledger, Reconciliation and EOD Z-Report pages here actually see them. Restaurant Admin never
    // opens or edits a shift itself, so this device only ever pulls.
    if (restaurantAccess) void syncShifts({ push: false });
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
  }, [cloudConnected, isAdminLoggedIn, entitlementsLoading, entitlementError, hasApp]);

  // Kiosk fleet polling for the Kiosk Terminals tab. Deliberately its own effect, not merged into
  // the sync effect above: that effect already calls SyncOutboxEngine/EntitySyncEngine
  // .configureTransport once for this console's own order/menu sync -- calling it again here (as
  // kiosk-admin's original fleet-polling code did, for ITS OWN sync needs) would silently
  // overwrite this console's already-configured transport.
  useEffect(() => {
    if (!isAdminLoggedIn || !hasApp('KIOSK_ADMIN')) { setKiosks([]); return; }
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const fleet = await fetchCloudKiosks();
        if (!cancelled) setKiosks(fleet);
      } catch {
        // Fleet view just stays on its last-known data; this is a background refresh, not a user action.
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const kioskInterval = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(kioskInterval);
    };
  }, [hasApp, isAdminLoggedIn]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Relocated from kiosk-admin -- not kiosk-specific, this app simply had no coupon
  // management UI despite already reading coupon data in reports/dashboard.
  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode) return;

    const usageLimit = newCouponUsageLimit.trim() ? Number(newCouponUsageLimit) : undefined;
    const cpn: Coupon = {
      id: `cpn-${Date.now()}`,
      code: newCouponCode.toUpperCase(),
      description: `Get ₹${newCouponValue} discount on orders above ₹${newCouponMin}`,
      discountType: 'FLAT',
      discountValue: Number(newCouponValue),
      minOrderValue: Number(newCouponMin),
      validFrom: new Date().toISOString(),
      validUntil: '2027-12-31T23:59:59Z',
      usageCount: 0,
      usageLimit,
      isActive: true
    };

    CouponRepository.createCoupon(cpn);

    AuditRepository.log({
      username: 'admin',
      action: 'COUPON_CREATED',
      category: 'OFFERS',
      details: `Created promo coupon "${cpn.code}"${usageLimit ? ` (usage limit: ${usageLimit})` : ''}`
    });

    showToast(`Created coupon: ${cpn.code}`);
    setIsAddCouponModalOpen(false);
    setNewCouponCode('');
    setNewCouponValue(50);
    setNewCouponMin(200);
    setNewCouponUsageLimit('');
  };

  // Synchronized Data Sources
  const categories = db.categories;
  const menuItems = db.menuItems;
  const tables = useMemo(() => [...db.tables], [dbTick]);
  const orders = useMemo(() => [...db.orders], [dbTick]);
  const reservations = useMemo(() => [...db.reservations], [dbTick]);
  const kots = useMemo(() => [...db.kots], [dbTick]);
  const shifts = useMemo(() => [...db.shifts], [dbTick]);
  const users = db.users;
  const customers = db.customerAccounts;
  const inventoryItems = db.inventoryItems;
  const recipes = db.recipes;
  const configuredPrinters = db.configuredPrinters;
  const auditLogs = db.auditLogs;

  // Real-Time Calculated Metrics
  const dashPeriodReport = useMemo(() => {
    return CentralReportingService.getDashboardMetrics(dashFilter as any, orders);
  }, [dashFilter, dbTick, orders]);

  // B2-032: getDailyReport()'s totals are scoped to today's active business day, but
  // getTopSellingItems() with no dates aggregates every order ever stored on this device — so
  // the dashboard's "Top Dishes" widget used to show all-time quantities/revenue (including
  // dishes from any other restaurant's orders a device had ever pulled in, per B2-029) right
  // next to a "Today" sales total that couldn't agree with it. Both now come from the exact
  // same today-scoped order list.
  const todayReport = useMemo(() => ReportGeneratorService.getReportForPeriod('TODAY'), [dbTick, orders]);
  const dailyReport = todayReport.summary;
  const topDishes = useMemo(() => ReportGeneratorService.getTopSellingItemsFromOrders(todayReport.orders), [todayReport]);
  const hourlySales = useMemo(() => ReportGeneratorService.getHourlySalesToday(), [dbTick, orders]);
  const peakHours = useMemo(() => ReportGeneratorService.getPeakHoursAnalysis(), [dbTick, orders]);

  const activeShift = shifts.find((s) => s.status === 'OPEN') || shifts[0];
  const pendingKotsCount = kots.filter((k: any) => k.status === 'PREPARING').length;
  const occupiedTablesCount = tables.filter((t: any) => t.status === 'OCCUPIED').length;
  const lowStockCount = inventoryItems.filter(
    (i: any) => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK'
  ).length;

  const handleApplyBulkPrice = () => {
    const multiplier = 1 + bulkPercent / 100;
    menuItems.forEach((item) => {
      const raw = item.price * multiplier;
      item.price = Math.round(raw / bulkRounding) * bulkRounding;
    });
    AuditRepository.log({
      action: 'BULK_PRICE_ADJUSTMENT',
      category: 'MENU',
      details: `Adjusted prices across all ${menuItems.length} dishes by ${bulkPercent}%`,
      username: 'Manager'
    });
    db.notify();
    setIsBulkPriceModalOpen(false);
    showToast(`Adjusted prices for all ${menuItems.length} dishes by ${bulkPercent}%!`);
  };

  if (!isAdminLoggedIn) {
    return (
      <JAMANVAARStartup appName="Owner Sign-in" appType="OWNER" subtitle="Your restaurant account">
        <JamanvaarAuthLayout
          appIdentity="ADMIN"
          applicationLabel="Owner Sign-in"
          appTitle="JAMANVAAR"
          appSubtitle="One account for your restaurant and kiosk apps"
          isOnline={isOnline}
          onToggleNetwork={() => setIsOnline((prev) => !prev)}
          isLocalCoreUnauthorized={db.isLocalCoreUnauthorized()}
          isLocalCoreConnected={db.isLocalCoreConnected()}
          localCoreUrl={db.getSyncServerUrl()}
          onPairLocalCore={(pin, url) => db.pairLocalCore(pin, url)}
          healthCheckUrl={`${db.getSyncServerUrl()}/api/health`}
          heroHeadline="Restaurant Control."
          heroHighlightWord="Live Intelligence."
          heroDescription="Sign in once. Open the apps included in your plan, with a separate workspace for each."
          heroImages={APP_HERO_IMAGES.ADMIN}
          capabilities={[
            { label: 'Restaurant Management', icon: 'dashboard' },
            { label: 'Reports & Analytics', icon: 'chart' },
            { label: 'Menu Management', icon: 'table' },
            { label: 'Inventory & Staff', icon: 'package' }
          ]}
          footerNote="Plan-Based Access • Instant Offline Boot • 100% Secure"
        >
          <ActivationNoticeBanner />
          {authScreenState === 'ACTIVATE' ? (
            <ActivateOwnerPanel
              defaultRestaurantCode={activatePrefill?.code ?? authRestaurantCode}
              defaultEmail={activatePrefill?.email ?? ''}
              defaultToken={activatePrefill?.token ?? ''}
              onBack={() => setAuthScreenState('LOGIN')}
              onDone={(code) => {
                setAuthRestaurantCode(code);
                setAuthPassword('');
                setActivatePrefill(null);
                setAuthError('');
                setPasswordResetNotice(true);
                setAuthScreenState('LOGIN');
              }}
            />
          ) : authScreenState === 'FORGOT' ? (
            <ForgotPasswordPanel
              defaultRestaurantCode={authRestaurantCode}
              onBack={() => setAuthScreenState('LOGIN')}
              onActivate={() => {
                setAuthError('');
                setAuthScreenState('ACTIVATE');
              }}
              onDone={() => {
                setAuthPassword('');
                setAuthScreenState('LOGIN');
                setAuthError('');
                setPasswordResetNotice(true);
              }}
            />
          ) : authScreenState === 'LOGIN' ? (
            <>
              <form onSubmit={handleAdminLogin} className="space-y-3.5 pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
                    Restaurant ID *
                  </label>
                  <input
                    type="text"
                    value={authRestaurantCode}
                    onChange={(e) => {
                      setAuthRestaurantCode(e.target.value);
                      setAuthError('');
                    }}
                    placeholder="e.g. JM9876543210"
                    className="w-full bg-jaman-cream border border-jaman-border focus:border-brand focus:bg-white rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Find it in Super Admin: Restaurants, open the restaurant, Restaurant ID (with a Copy button).
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">Owner Password *</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="text-xs text-[#B8500C] hover:underline font-semibold"
                    >
                      {showPassword ? 'Hide Password' : 'Show Password'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={authPassword}
                      onChange={(e) => {
                        setAuthPassword(e.target.value);
                        setAuthError('');
                      }}
                      placeholder="Enter owner password"
                      className="w-full bg-jaman-cream border border-jaman-border focus:border-brand focus:bg-white rounded-2xl px-4 py-3 text-sm text-jaman-navy font-semibold focus:outline-hidden transition-colors"
                    />
                  </div>
                </div>

                {passwordResetNotice && !authError && (
                  <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-center" role="status">
                    Your password was changed. Sign in with the new one.
                  </div>
                )}

                {authError && (
                  <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <span>Your owner account</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setPasswordResetNotice(false);
                      setAuthScreenState('FORGOT');
                    }}
                    className="font-semibold text-[#B8500C] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <details className="text-sm text-slate-600"><summary className="cursor-pointer">Connecting a new device? Add your admin key</summary><label className="block mt-3">Admin activation key (first connection only)<input aria-label="Admin activation key (optional)" type="text" value={activationKeyInput} onChange={e => setActivationKeyInput(e.target.value.toUpperCase())} placeholder="JMV-XXXX-XXXX-XXXX" className="block w-full mt-1 rounded-xl border border-jaman-border p-3 font-mono" /></label><p className="text-xs mt-2">Use your Restaurant Admin or Kiosk Admin key. Customer kiosks still use their own kiosk activation screen.</p></details>

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="w-full h-12 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press disabled:opacity-50 text-white font-semibold text-sm transition-colors shadow-sm active:scale-[0.99] cursor-pointer mt-2"
                >
                  {loginBusy ? 'Signing In…' : 'Sign In'}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setPasswordResetNotice(false);
                      setActivatePrefill(null);
                      setAuthScreenState('ACTIVATE');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer"
                  >
                    Set your password from the welcome email
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span>FIRST-TIME DEVICE ACTIVATION</span>
                </div>
                <h3 className="text-base font-bold text-jaman-navy pt-1">
                  Connect this admin device
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Enter your admin activation key once on this device. Your plan determines which apps open after sign-in.
                </p>
              </div>

              {pendingTenant && (
                <div className="p-3.5 bg-jaman-cream border border-jaman-border rounded-2xl space-y-1 text-left text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Restaurant:</span>
                    <span className="font-bold text-jaman-navy">{pendingTenant.restaurantName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Owner Account:</span>
                    <span className="font-mono text-jaman-navy text-[11px]">{pendingTenant.ownerEmail}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Apps:</span>
                    <span className="font-bold text-brand">Restaurant Admin / Kiosk Admin</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleActivateSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
                    Admin Activation Key *
                  </label>
                  <input
                    type="text"
                    value={activationKeyInput}
                    onChange={(e) => {
                      setActivationKeyInput(e.target.value.toUpperCase());
                      setActivationError('');
                    }}
                    placeholder="JMV-XXXX-XXXX-XXXX"
                    autoFocus
                    required
                    className="w-full bg-jaman-cream border border-jaman-border focus:border-brand focus:bg-white rounded-2xl px-4 py-3 text-sm text-center font-mono font-bold tracking-wider text-jaman-navy focus:outline-hidden transition-colors"
                  />
                </div>

                {activationError && (
                  <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{activationError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={activationBusy || !activationKeyInput.trim()}
                  className="w-full h-12 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press disabled:opacity-40 text-white font-semibold text-sm transition-colors shadow-sm active:scale-[0.99] cursor-pointer mt-2"
                >
                  {activationBusy ? 'Activating Terminal…' : 'Connect & Continue'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthScreenState('LOGIN');
                    setActivationError('');
                  }}
                  className="w-full py-2.5 text-center text-xs font-bold text-slate-500 hover:text-jaman-navy transition-colors cursor-pointer"
                >
                  ← Back to Sign In
                </button>
              </form>
            </div>
          )}
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
    );
  }

  if (!contextReady || !product) {
    return <div className="min-h-screen bg-jaman-cream flex items-center justify-center p-6">
      <section className="bg-white border border-jaman-border rounded-2xl p-8 max-w-xl w-full space-y-5">
        <h1 className="text-2xl font-bold text-jaman-navy">JAMANVAAR Apps</h1>
        <p className="text-sm text-slate-600">{db.restaurant.name}</p>
        {entitlementsLoading && <p role="status">Loading your applications?</p>}
        {entitlementError && <><p role="alert">{entitlementError}</p><button onClick={authRequired ? handleAdminLogout : refetchEntitlements} className="underline font-bold">{authRequired ? 'Sign in again' : 'Retry'}</button></>}
        {contextReady && <>
          {context.denied && <p role="alert">This application is not enabled in your restaurant's current plan.</p>}
          {context.invalid && <p role="alert">This page was not found. Choose an application below.</p>}
          {!context.denied && !context.invalid && <p>Choose what you want to manage.</p>}
          {availableProducts.map(app => <button key={app} onClick={() => context.navigate(app)} className="w-full text-left rounded-xl border p-4 hover:border-orange-500"><strong>{ADMIN_PRODUCTS[app].name}</strong><p className="text-sm text-slate-600 mt-1">{ADMIN_PRODUCTS[app].description}</p></button>)}
          {!availableProducts.length && <p role="alert">No admin application is enabled. Ask your platform administrator to check your subscription.</p>}
        </>}
        <button onClick={handleAdminLogout} className="text-sm underline">Log out</button>
      </section>
    </div>;
  }

  return (
    <JAMANVAARStartup appName={appName} appType={isKioskAdmin ? 'KIOSK_ADMIN' : 'ADMIN'} subtitle="Your restaurant workspace">
      <div className="h-screen w-screen bg-jaman-cream text-jaman-navy flex flex-col font-sans select-none antialiased overflow-hidden">
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div className="fixed top-4 right-4 z-50 bg-jaman-navy text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-white/20 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold">{toastMessage}</span>
          </div>
        )}

        {/* UNIFIED SAAS HEADER */}
        <PosAdminHeader
          applicationName={appName}
          availableProducts={availableProducts}
          selectedProduct={product}
          onSwitchProduct={app => context.navigate(app)}
          showRestaurantActions={!isKioskAdmin}
          restaurantName={db.restaurant.name}
          outletName={db.outlet.name}
          isCloudConnected={cloudConnected}
          onOpenBranchDirectory={() => setIsBranchDirectoryOpen(true)}
          globalSearch={globalSearch}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
          activeShift={activeShift}
          onOpenEodModal={() => setIsEodModalOpen(true)}
          onOpenReconModal={() => setIsReconModalOpen(true)}
          onOpenAssistant={handleOpenAssistant}
          onOpenNotifDrawer={() => setIsNotifDrawerOpen(true)}
          unreadNotifsCount={unreadNotifsCount}
          onAdminLogout={handleAdminLogout}
          onOpenNav={() => setNavOpen(true)}
        />

        {/* BODY WITH FULL SIDEBAR & MAIN CONTENT */}
        {entitlementError && (
          <div role="alert" className="px-4 py-3 bg-amber-50 text-amber-900 flex items-center justify-between gap-3">
            <span>{entitlementError}</span>
            <button type="button" className="font-bold underline" onClick={authRequired ? handleAdminLogout : refetchEntitlements}>
              {authRequired ? 'Sign in again' : 'Retry'}
            </button>
          </div>
        )}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Behind the open drawer: tap anywhere outside it to close it */}
          {navOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setNavOpen(false)} aria-hidden="true" />}

          {/* LEFT ADMIN SIDEBAR (a slide-in drawer below the large breakpoint) */}
          <aside
            aria-label="Main menu"
            className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transition-transform duration-200 ${navOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 bg-[#FAF8F5] lg:bg-[#FAF8F5]/95 backdrop-blur-md border-r border-[#EAE3D6] flex flex-col justify-between p-3.5 shrink-0 overflow-y-auto min-h-0 shadow-2xl lg:shadow-2xs select-none`}
          >
            <div className="space-y-4">
              {filterNavSections(productNavSections(product), hasApp).map((grp) => {
                const hasActiveTab = grp.items.some((it) => it.id === activeTab);
                // A section holding the currently-open tab always shows,
                // regardless of its remembered collapse state — you should
                // never lose sight of where you are.
                const isExpanded = hasActiveTab || !collapsedSections[grp.section];
                return (
                <div key={grp.section} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(grp.section)}
                    className="w-full flex items-center justify-between px-3 py-0.5 cursor-pointer group/section"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 group-hover/section:text-slate-600 font-mono">
                      {grp.section}
                    </span>
                    <ChevronDown
                      className={`w-3 h-3 text-slate-300 group-hover/section:text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                    />
                  </button>
                  {isExpanded && (
                  <nav className="space-y-0.5">
                    {grp.items.map((nav) => {
                      const Icon = nav.icon;
                      const isSelected = activeTab === nav.id;

                      let badgeCount = 0;
                      let badgeColor = 'bg-brand text-white';
                      if (nav.id === 'LIVE_KDS' && pendingKotsCount > 0) {
                        badgeCount = pendingKotsCount;
                        badgeColor = 'bg-brand text-white shadow-2xs';
                      } else if (nav.id === 'INVENTORY' && lowStockCount > 0) {
                        badgeCount = lowStockCount;
                        badgeColor = 'bg-amber-600 text-white shadow-2xs';
                      }

                      // A locked module used to look like any other clickable
                      // nav item with just a small "PRO" tag — a CORE-tier
                      // owner could only tell it was locked after navigating
                      // in. Now the whole row visibly dims and shows a lock
                      // icon before the click, not after.
                      const isLockedPro = nav.id === 'QR_ORDERING' && qrLocked;

                      return (
                        <button
                          key={nav.id}
                          onClick={() => { setActiveTab(nav.id as PosAdminTab); setNavOpen(false); }}
                          title={isLockedPro ? 'Not included in your current plan — tap to see what it offers' : undefined}
                          aria-current={isSelected ? 'page' : undefined}
                          className={`group relative w-full min-h-[46px] flex items-center justify-between px-3.5 py-2.5 rounded-2xl border font-medium text-[13px] transition-colors duration-150 cursor-pointer ${
                            isSelected
                              ? 'bg-brand/[0.08] border-brand/40 text-brand font-semibold'
                              : isLockedPro
                              ? 'border-transparent text-[#94A3B8] hover:bg-brand/[0.04]'
                              : 'border-transparent text-slate-700 hover:bg-brand/[0.05] hover:text-jaman-navy'
                          }`}
                        >
                          <div className={`flex items-center gap-3 min-w-0 ${isLockedPro ? 'opacity-60' : ''}`}>
                            <Icon
                              className={`w-5 h-5 shrink-0 transition-colors duration-150 ${
                                isSelected ? 'text-brand' : isLockedPro ? 'text-slate-500' : 'text-slate-500 group-hover:text-jaman-navy'
                              }`}
                            />
                            <span className="truncate">{nav.label}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {nav.id === 'QR_ORDERING' && qrKnown && (
                              <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                                  !qrLocked
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {isLockedPro && <Lock className="w-2.5 h-2.5" />}
                                {qrLocked ? 'Locked' : 'On'}
                              </span>
                            )}
                            {badgeCount > 0 && (
                              <span
                                className={`px-1.5 py-0.5 text-[11px] font-bold rounded-full min-w-5 text-center ${badgeColor}`}
                              >
                                {badgeCount}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </nav>
                  )}
                </div>
                );
              })}
            </div>

            {/* The header actions that do not fit a phone's header live here on small screens */}
            <div className="sm:hidden mt-4 pt-3 border-t border-[#EAE3D6] grid grid-cols-2 gap-2">
              {!isKioskAdmin && <button type="button" onClick={() => { setNavOpen(false); setIsEodModalOpen(true); }} className="min-h-[44px] rounded-xl bg-brand/[0.07] border border-brand/30 text-brand text-xs font-bold cursor-pointer">EOD Report</button>}
              {!isKioskAdmin && <button type="button" onClick={() => { setNavOpen(false); setIsReconModalOpen(true); }} className="min-h-[44px] rounded-xl bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#1E40AF] text-xs font-bold cursor-pointer">Reconciliation</button>}
              <button type="button" onClick={() => { setNavOpen(false); handleOpenAssistant(); }} className="min-h-[44px] rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold cursor-pointer">Assistant</button>
              <button type="button" onClick={() => { setNavOpen(false); handleAdminLogout(); }} className="min-h-[44px] rounded-xl bg-white border border-jaman-border text-rose-700 text-xs font-bold cursor-pointer">Log out</button>
            </div>
          </aside>

          {/* MAIN VIEW CONTENT AREA — ALL 18 PRODUCTION MODULES */}
          <main key={activeTab} className="jv-page-enter flex-1 overflow-y-auto p-3 sm:p-6 bg-jaman-cream min-h-0 min-w-0">
            {/* TAB 1: DASHBOARD */}
            {activeTab === 'DASHBOARD' && isKioskAdmin && <KioskDashboard kiosks={kiosks} onNavigate={setActiveTab} />}
            {activeTab === 'DASHBOARD' && !isKioskAdmin && (
              <RestaurantDashboard
                dashFilter={dashFilter}
                setDashFilter={setDashFilter}
                dashPeriodReport={dashPeriodReport}
                hourlySales={hourlySales}
                peakHours={peakHours}
                topDishes={topDishes}
                pendingKotsCount={pendingKotsCount}
                occupiedTablesCount={occupiedTablesCount}
                tablesTotalCount={tables.length}
                lowStockCount={lowStockCount}
                activeShift={activeShift}
                setActiveTab={setActiveTab}
                setReportSubTab={setReportSubTab}
                setIsReconModalOpen={setIsReconModalOpen}
                onboardingItems={[
                  { id: 'menu', label: 'Add dishes to your menu', hint: 'Add your categories and dishes with prices, then press Publish so the Captain, POS and QR menu all show them.', done: menuItems.length > 0, onGo: () => setActiveTab('MENU') },
                  { id: 'tables', label: 'Set up your floor & tables', hint: 'Add your tables (you can add many at once) so the Captain can open them and guests can scan their QR code.', done: tables.length > 0, onGo: () => setActiveTab('TABLES') },
                  { id: 'printer', label: 'Connect a receipt printer', hint: 'Add the counter printer and any kitchen printers so bills and kitchen tickets print.', done: configuredPrinters.length > 0, onGo: () => setActiveTab('HARDWARE') },
                  { id: 'staff', label: 'Add your team members', hint: 'Add each waiter, cashier and cook. Each gets a PIN to sign in on the Captain, POS and kitchen screen.', done: users.length > 1, onGo: () => setActiveTab('STAFF') },
                  {
                    id: 'captain_order',
                    label: 'Take a practice order on a Captain tablet',
                    hint: 'Open the Captain app, sign in with a staff PIN, pick a table, add a dish and press Send to kitchen. Then check the next step.',
                    done: orders.some((o) => o.source_type === 'CAPTAIN'),
                    onGo: () => setActiveTab('TABLES')
                  },
                  {
                    id: 'kitchen_seen',
                    label: 'See it on the kitchen screen and mark it ready',
                    hint: 'The ticket appears on the kitchen screen by itself. Tap the dish when it is cooked; the Captain tablet buzzes to say it is ready.',
                    done: db.kots.some((k) => !!k.readyAt || k.items.some((i) => !!i.readyAt) || k.status === 'READY' || k.status === 'SERVED'),
                    onGo: () => setActiveTab('LIVE_KDS')
                  },
                  {
                    id: 'first_order',
                    label: 'Take your first payment at the counter',
                    hint: 'On the POS, open that table and press Settle. When the bill is paid, your restaurant is ready for service.',
                    done: orders.some((o) => o.orderStatus === 'COMPLETED' && o.paymentStatus === 'SUCCESS'),
                    onGo: () => setActiveTab('BILLING_SALES')
                  }
                ]}
                onRefresh={() => {
                  setDbTick((t) => t + 1);
                  showToast('Dashboard metrics refreshed');
                }}
              />
            )}

            {/* TAB 2: DIGITAL ORDERING & QR SUITE */}
            {activeTab === 'QR_ORDERING' && <QrConsole onViewPlan={() => setActiveTab('LICENSE')} showToast={showToast} />}

            {/* TAB 3: BILLING / INVOICES */}
            {activeTab === 'BILLING_SALES' && (
              <BillingInvoicesModule
                orders={orders}
                onOrderUpdated={() => setDbTick((t) => t + 1)}
                showToast={showToast}
              />
            )}

            {/* TAB 4: ORDERS & ORDER HISTORY */}
            {activeTab === 'ORDERS' && (
              <OrdersModule
                orders={orders}
                onOrderUpdated={() => setDbTick((t) => t + 1)}
                showToast={showToast}
              />
            )}

            {/* TAB 5: LIVE KDS & KITCHEN / KOT */}
            {(activeTab === 'LIVE_KDS' || activeTab === 'KITCHEN_KOT') && (
              <KitchenKotModule
                showToast={showToast}
                onKotUpdated={() => setDbTick((t) => t + 1)}
              />
            )}

            {/* TAB 6: MENU & CATEGORIES */}
            {activeTab === 'SYNC' && <SyncHealthPanel showToast={showToast} />}

            {activeTab === 'MENU' && (
              <MenuCategoriesModule
                categories={categories}
                menuItems={menuItems}
                onOpenItemModal={(item) => {
                  setItemToEdit(item || null);
                  setIsItemModalOpen(true);
                }}
                onCategoriesChanged={() => setDbTick((t) => t + 1)}
                onOpenCategoryModal={(cat) => {
                  setCategoryToEdit(cat || null);
                  setIsCategoryModalOpen(true);
                }}
                onOpenPrebuiltMenuModal={() => setIsPrebuiltMenuModalOpen(true)}
                onOpenBulkPriceModal={() => setIsBulkPriceModalOpen(true)}
                showToast={showToast}
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {activeTab === 'MENU_OPTIONS' && <MenuOptionsModule showToast={showToast} onRequestConfirm={setConfirmDialog} />}

            {/* TAB 7: FLOOR & TABLES */}
            {activeTab === 'TABLES' && (
              <FloorTablesModule
                tables={tables}
                orders={orders}
                occupiedTablesCount={occupiedTablesCount}
                onOpenTableModal={(tbl) => {
                  setTableToEdit(tbl || null);
                  setIsTableModalOpen(true);
                }}
                onSelectOrderDetail={(ord) => setSelectedOrderDetail(ord)}
                onNavigateToQr={() => setActiveTab('QR_ORDERING')}
                showToast={showToast}
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {/* TAB 7B: TABLE RESERVATIONS */}
            {activeTab === 'RESERVATIONS' && (
              <ReservationsModule
                reservations={reservations}
                tables={tables}
                showToast={showToast}
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {/* TAB 8: INVENTORY & RECIPES */}
            {activeTab === 'INVENTORY' && (
              <InventoryRecipesModule
                inventoryItems={inventoryItems}
                recipes={recipes}
                lowStockCount={lowStockCount}
                onOpenInventoryModal={(item) => {
                  setInventoryToEdit(item || null);
                  setIsInventoryModalOpen(true);
                }}
                onOpenRecipeModal={(rec) => {
                  setRecipeToEdit(rec || null);
                  setIsRecipeModalOpen(true);
                }}
                onOpenStockAdjustModal={(item) => {
                  setStockAdjustItem(item);
                  setIsStockAdjustModalOpen(true);
                }}
                onOpenWastageModal={(item) => {
                  setWastageItem(item);
                  setIsWastageModalOpen(true);
                }}
                showToast={showToast}
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {/* TAB 9: CUSTOMERS CRM */}
            {activeTab === 'CUSTOMERS' && (
              <CustomersCrmModule
                customers={customers}
                orders={orders}
                onCustomerUpdated={() => setDbTick((t) => t + 1)}
                showToast={showToast}
                onOpenCreateModal={() => {
                  setCustomerToEdit(null);
                  setIsCustomerModalOpen(true);
                }}
                onOpenEditModal={(cust) => {
                  setCustomerToEdit(cust);
                  setIsCustomerModalOpen(true);
                }}
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {/* TAB 10: STAFF & ROLES (RBAC) */}
            {activeTab === 'STAFF' && (
              <StaffRolesModule
                users={users}
                onOpenStaffModal={(usr) => {
                  setStaffToEdit(usr || null);
                  setIsStaffModalOpen(true);
                }}
                showToast={showToast}
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {/* TAB 11: PAYMENTS & SPLIT LEDGER */}
            {activeTab === 'PAYMENTS' && (
              <PaymentsSplitModule
                showKioskPayments={false}
                orders={orders}
                dashPeriodReport={dashPeriodReport}
                onSelectOrderDetail={(ord) => setSelectedOrderDetail(ord)}
                showToast={showToast}
              />
            )}

            {activeTab === 'KIOSK_PAYMENTS' && <div className="space-y-6"><OnlinePaymentsPanel /><KioskPaymentSettingsPanel /></div>}
            {activeTab === 'FEEDBACK' && <FeedbackPanel orders={orders} />}
            {activeTab === 'TEMPLATES' && <h1 className="text-2xl font-bold">Menu Templates</h1>}
            {activeTab === 'KIOSK_DESIGN' && hasApp('KIOSK_ADMIN') && <KioskContentPanel showToast={showToast} />}
            {activeTab === 'KIOSK_COMBOS' && hasApp('KIOSK_ADMIN') && <KioskComboPanel showToast={showToast} />}
            {/* TAB: KIOSK TERMINAL FLEET (relocated from kiosk-admin, gated on KIOSK_ADMIN) */}
            {activeTab === 'KIOSKS' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">Kiosk Terminal Control</h1>
                  <p className="text-sm text-[#4A5568] mt-1">Manage self-ordering stations, lockdown states, and maintenance modes.</p>
                </div>
                {kiosks.length === 0 && (
                  <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm text-xs text-[#64748B]">
                    No Kiosk Terminals yet. A terminal appears here the moment it's activated with a real activation code and joins this restaurant's network.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {kiosks.map((k) => (
                    <div key={k.id} data-testid={`kiosk-terminal-${k.id}`} className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-jaman-navy">{k.name}</h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{k.health}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs bg-jaman-ivory p-3 rounded-xl border border-jaman-border">
                        <div>
                          <span className="text-[#64748B]">Pending changes:</span>
                          <div className="font-semibold text-jaman-navy tabular-nums">{k.pendingSyncCount}</div>
                        </div>
                        <div>
                          <span className="text-[#64748B]">App version:</span>
                          <div className="font-semibold text-jaman-navy font-mono">{k.appVersion ?? '—'}</div>
                        </div>
                      </div>
                      <dl className="text-xs space-y-1 text-slate-600"><div>Terminal ID: <span className="font-mono">{k.id}</span></div><div>Branch: {k.branchName || db.outlet.name}</div><div>Last seen: {k.lastSeenAt ? new Date(k.lastSeenAt).toLocaleString() : 'Never seen'}</div><div>Last sync: {k.lastSyncAt ? new Date(k.lastSyncAt).toLocaleString() : 'Not synced yet'}</div></dl>
                      {k.syncError && (
                        <div role="alert" className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                          {k.syncError}
                        </div>
                      )}
                      {k.lastCommand && <p role="status" className="text-xs p-3 rounded-xl border border-jaman-border">Last command: {k.lastCommand.commandType.replace(/_/g, ' ')} — {k.lastCommand.status}{k.lastCommand.errorMessage ? `: ${k.lastCommand.errorMessage}` : ''}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => void sendKioskCommand(k.id, 'REQUEST_SYNC').then(() => showToast('Kiosk sync queued.')).catch(error => showToast(error.message || 'Could not request sync.'))}>Sync now</Button>
                        <Button variant="outline" size="sm" onClick={() => void sendKioskCommand(k.id, 'REQUEST_DIAGNOSTICS').then(() => showToast('Kiosk diagnostics queued.')).catch(error => showToast(error.message || 'Could not request diagnostics.'))}>Diagnostics</Button>
                        <Button variant="outline" size="sm" onClick={() => setConfirmDialog({ isOpen: true, title: 'Log out this kiosk?', message: `${k.name} will stop accepting orders after it acknowledges the command. Orders are retained. An active payment or unsent orders must finish first. Reactivation requires a fresh kiosk key. Offline kiosks receive this command when they reconnect.`, confirmText: 'Log out kiosk', isDanger: true, onConfirm: () => { void sendKioskCommand(k.id, 'FORCE_LOGOUT').then(() => showToast('Kiosk logout queued; awaiting terminal acknowledgement.')).catch(error => showToast(error.message || 'Could not queue kiosk logout.')); } })}>Log out kiosk</Button>
                        <Button
                          variant={k.isLocked ? 'accent' : 'outline'}
                          size="sm"
                          leftIcon={k.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          onClick={() => void sendKioskCommand(k.id, k.isLocked ? 'UNLOCK' : 'LOCK').then(() => showToast('Kiosk lock command queued.')).catch(error => showToast(error.message || 'Could not change kiosk lock.'))}
                        >
                          {k.isLocked ? 'Unlock' : 'Lockdown'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>


              </div>
            )}

            {/* TAB: OFFERS & COUPONS (relocated from kiosk-admin -- not kiosk-specific, ungated) */}
            {activeTab === 'COUPONS' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">Offers & Promo Coupons</h1>
                    <p className="text-sm text-[#4A5568] mt-1">Manage customer discounts and threshold promotions.</p>
                  </div>
                  <Button variant="accent" size="sm" onClick={() => setIsAddCouponModalOpen(true)}>
                    + Add Coupon Code
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {coupons.map((c) => (
                    <div key={c.id} className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-lg font-bold text-brand bg-brand/10 px-3 py-1 rounded-xl border border-brand/20">
                            {c.code}
                          </span>
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            ACTIVE
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-jaman-navy mt-3">{c.description}</p>
                        <div className="text-xs text-[#64748B] mt-2 space-y-1">
                          <div>Min Order Value: ₹{c.minOrderValue}</div>
                          <div>Times Used: {c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ' (unlimited)'}</div>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          setConfirmDialog({
                            isOpen: true,
                            title: 'Delete coupon?',
                            message: `Delete coupon ${c.code}? This cannot be undone.`,
                            confirmText: 'Delete',
                            isDanger: true,
                            onConfirm: () => {
                              if (CouponRepository.deleteCoupon(c.id)) showToast(`Removed coupon ${c.code}`);
                            }
                          })
                        }
                        className="mt-4 text-xs font-semibold text-rose-600 hover:text-rose-800 self-end"
                      >
                        Delete Coupon
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 12: FINANCIAL & SALES REPORTS */}
            {activeTab === 'REPORTS' && <ReportsDashboard kioskMode={isKioskAdmin} showToast={showToast} />}

            {/* TAB 13: SHIFT & CASH DRAWER RECONCILIATION */}
            {activeTab === 'SHIFTS' && (
              <ShiftCashDrawerModule
                activeShift={activeShift}
                dailyReport={dailyReport}
                shifts={shifts}
                onOpenEodModal={() => setIsEodModalOpen(true)}
                onOpenCashDropModal={() => setIsCashDropModalOpen(true)}
                showToast={showToast}
              />
            )}

            {/* TAB 14: HARDWARE & PRINTERS */}
            {activeTab === 'HARDWARE' && (
              <div className="space-y-6">
                <PrintersDevicesModule
                  configuredPrinters={configuredPrinters}
                  onOpenPrinterModal={(prn) => {
                    setPrinterToEdit(prn || null);
                    setIsPrinterModalOpen(true);
                  }}
                  showToast={showToast}
                  onRequestConfirm={setConfirmDialog}
                />
                <KitchenPrinterRoutingPanel showToast={showToast} />
                <PrintQueuePanel showToast={showToast} />
              </div>
            )}

            {/* TAB: RECEIPT & E-BILL SETTINGS (relocated from kiosk-admin, not kiosk-specific) */}
            {activeTab === 'RECEIPTS' && (
              <ReceiptEBillPanel showToast={showToast} onGoToSettings={() => setActiveTab('SETTINGS')} />
            )}

            {/* TAB 15: SETTINGS & BRANDING */}
            {activeTab === 'SETTINGS' && (
              <>
                <TerminalDisplaySettings showToast={showToast} />
                {!isKioskAdmin && hasApp('WHATSAPP_ORDERING') && <WhatsAppChannelPanel showToast={showToast} />}
                <ReportBrandingSettings
                  showToast={showToast}
                  onUpdated={() => setDbTick((t) => t + 1)}
                />
                {isKioskAdmin && <KioskDisplaySettingsPanel showToast={showToast} />}
              </>
            )}

            {/* TAB 16: SUBSCRIPTION PLANS */}
            {activeTab === 'LICENSE' && (
              <SubscriptionPlansView
                showToast={showToast}
                onUpdated={() => setDbTick((t) => t + 1)}
              />
            )}

            {/* TAB 17: AUDIT TRAIL LOGS */}
            {activeTab === 'AUDIT' && (
              <AuditTrailModule
                auditLogs={auditLogs}
                showToast={showToast}
              />
            )}

            {activeTab === 'INVENTORY_CONTROL' && <InventoryControlModule showToast={showToast} />}

            {activeTab === 'SUPPORT' && <SupportTicketsModule showToast={showToast} />}

            {/* TAB 18: BACKUP & DATA RESTORE */}
            {activeTab === 'BACKUP' && (
              <BackupRestoreModule
                onOpenRestoreModal={() => setIsRestoreModalOpen(true)}
                showToast={showToast}
                onRequestConfirm={setConfirmDialog}
              />
            )}
          </main>
        </div>

        {/* ALL SPECIALIZED MODAL DIALOGS */}
        <GlobalSearchModal
          isOpen={isGlobalSearchOpen}
          showCustomers={!isKioskAdmin}
          onClose={() => setIsGlobalSearchOpen(false)}
          onSelectOrder={(ord) => {
            setSelectedOrderDetail(ord);
            setActiveTab(isKioskAdmin ? 'ORDERS' : 'BILLING_SALES');
          }}
          onSelectMenuItem={(item) => {
            setItemToEdit(item);
            setIsItemModalOpen(true);
            setActiveTab('MENU');
          }}
          onSelectCustomer={(cust) => {
            setCustomerToEdit(cust);
            setIsCustomerModalOpen(true);
            setActiveTab('CUSTOMERS');
          }}
          onSelectTable={(tbl) => {
            setTableToEdit(tbl);
            setIsTableModalOpen(true);
            setActiveTab('TABLES');
          }}
          onSelectStaff={(usr) => {
            setStaffToEdit(usr);
            setIsStaffModalOpen(true);
            setActiveTab('STAFF');
          }}
        />

        <OrderDetailModal
          order={selectedOrderDetail}
          isOpen={!!selectedOrderDetail}
          onClose={() => setSelectedOrderDetail(null)}
          onOrderUpdated={() => {
            setDbTick((t) => t + 1);
            showToast('Order record updated!');
          }}
        />

        <ItemModal
          isOpen={isItemModalOpen}
          onClose={() => setIsItemModalOpen(false)}
          itemToEdit={itemToEdit}
          categories={categories}
          onSaved={() => showToast(itemToEdit ? 'Dish updated!' : 'Dish created!')}
        />

        <CategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          categoryToEdit={categoryToEdit}
          onSaved={() => showToast(categoryToEdit ? 'Category updated!' : 'Category created!')}
        />

        <TableModal
          isOpen={isTableModalOpen}
          onClose={() => setIsTableModalOpen(false)}
          tableToEdit={tableToEdit}
          onSaved={(message) => showToast(message ?? (tableToEdit ? 'Table updated!' : 'Table created!'))}
        />

        <StaffModal
          isOpen={isStaffModalOpen}
          onClose={() => setIsStaffModalOpen(false)}
          staffToEdit={staffToEdit}
          onSaved={() => showToast(staffToEdit ? 'Staff member updated!' : 'Staff member created!')}
        />

        <CustomerModal
          isOpen={isCustomerModalOpen}
          onClose={() => setIsCustomerModalOpen(false)}
          customerToEdit={customerToEdit}
          onSaved={() => showToast(customerToEdit ? 'Customer profile updated!' : 'Customer registered!')}
        />

        <InventoryModal
          isOpen={isInventoryModalOpen}
          onClose={() => setIsInventoryModalOpen(false)}
          itemToEdit={inventoryToEdit}
          onSaved={() => showToast(inventoryToEdit ? 'Stock item updated!' : 'Stock item created!')}
        />

        <RecipeModal
          isOpen={isRecipeModalOpen}
          onClose={() => setIsRecipeModalOpen(false)}
          menuItems={menuItems}
          inventoryItems={inventoryItems}
          recipeToEdit={recipeToEdit}
          onSaved={() => showToast('Recipe formula saved!')}
        />

        <PrinterModal
          isOpen={isPrinterModalOpen}
          onClose={() => setIsPrinterModalOpen(false)}
          printerToEdit={printerToEdit}
          onSaved={() => showToast(printerToEdit ? 'Printer updated!' : 'Printer registered!')}
        />

        <PrebuiltMenuModal
          isOpen={isPrebuiltMenuModalOpen || activeTab === 'TEMPLATES'}
          onClose={() => { setIsPrebuiltMenuModalOpen(false); if (activeTab === 'TEMPLATES') setActiveTab('MENU'); }}
          onImported={(count) => showToast(`Successfully imported ${count} dishes!`)}
        />

        <StockAdjustModal
          isOpen={isStockAdjustModalOpen}
          onClose={() => setIsStockAdjustModalOpen(false)}
          item={stockAdjustItem}
          onSaved={() => showToast('Stock movement recorded!')}
        />

        <WastageLogModal
          isOpen={isWastageModalOpen}
          onClose={() => setIsWastageModalOpen(false)}
          item={wastageItem}
          onSaved={() => showToast('Wastage logged')}
          onRequestConfirm={setConfirmDialog}
        />

        <BranchDirectoryModal
          isOpen={isBranchDirectoryOpen}
          onClose={() => setIsBranchDirectoryOpen(false)}
        />

        <CashDropModal
          isOpen={isCashDropModalOpen}
          onClose={() => setIsCashDropModalOpen(false)}
          shift={activeShift}
          onSaved={() => showToast('Cash movement recorded!')}
        />

        <EodReportModal isOpen={isEodModalOpen} onClose={() => setIsEodModalOpen(false)} />

        <RestoreModal
          isOpen={isRestoreModalOpen}
          onClose={() => setIsRestoreModalOpen(false)}
          onRestored={() => showToast('Database restored successfully from JSON snapshot!')}
        />

        <ConfirmModal
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          isDanger={confirmDialog.isDanger}
        />

        <Modal
          isOpen={isAddCouponModalOpen}
          onClose={() => setIsAddCouponModalOpen(false)}
          title="Create Promotional Coupon"
        >
          <form onSubmit={handleCreateCoupon} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Promo Code *</label>
              <input
                type="text"
                required
                value={newCouponCode}
                onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                placeholder="E.g., FESTIVE100, WELCOME20"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Discount Amount (₹)</label>
                <input
                  type="number"
                  required
                  min={5}
                  value={newCouponValue}
                  onChange={(e) => setNewCouponValue(Number(e.target.value))}
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Min Order (₹)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={newCouponMin}
                  onChange={(e) => setNewCouponMin(Number(e.target.value))}
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Usage Limit (optional)</label>
              <input
                type="number"
                min={1}
                value={newCouponUsageLimit}
                onChange={(e) => setNewCouponUsageLimit(e.target.value)}
                placeholder="Blank = unlimited"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="outline" size="sm" type="button" onClick={() => setIsAddCouponModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="accent" size="sm" type="submit">
                Create Coupon
              </Button>
            </div>
          </form>
        </Modal>

        {isBulkPriceModalOpen && (
          <Modal
            isOpen={isBulkPriceModalOpen}
            onClose={() => setIsBulkPriceModalOpen(false)}
            title="Quick Bulk Menu Price Adjustment"
            maxWidth="md"
          >
            <div className="space-y-4 py-1">
              <p className="text-xs text-slate-500">
                Increase or decrease menu prices across all {menuItems.length} dishes in your restaurant
                catalog simultaneously:
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Percentage Change (%)
                  </label>
                  <div className="flex gap-2">
                    {[-10, -5, +5, +10, +15, +20].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setBulkPercent(pct)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          bulkPercent === pct
                            ? 'bg-brand text-white shadow-xs'
                            : 'bg-jaman-ivory border border-slate-200 text-jaman-navy'
                        }`}
                      >
                        {pct > 0 ? `+${pct}%` : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Nearest Rounding Rule
                  </label>
                  <select
                    value={bulkRounding}
                    onChange={(e) => setBulkRounding(Number(e.target.value) as any)}
                    className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value={1}>Exact (₹1 Rounding)</option>
                    <option value={5}>Commercial (Nearest ₹5 e.g. ₹265, ₹270)</option>
                    <option value={10}>Standard (Nearest ₹10 e.g. ₹260, ₹270)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button variant="outline" size="sm" onClick={() => setIsBulkPriceModalOpen(false)}>
                  Cancel
                </Button>
                <button
                  onClick={handleApplyBulkPrice}
                  className="px-4 py-2 bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  Apply {bulkPercent > 0 ? `+${bulkPercent}%` : `${bulkPercent}%`} to {menuItems.length} Dishes
                </button>
              </div>
            </div>
          </Modal>
        )}

        <FinancialReconciliationModal
          isOpen={isReconModalOpen}
          onClose={() => setIsReconModalOpen(false)}
          showToast={showToast}
        />

        <NotificationDrawerModal
          isOpen={isNotifDrawerOpen}
          onClose={() => setIsNotifDrawerOpen(false)}
          role="POS_ADMIN"
        />

        <NotificationToastContainer role="POS_ADMIN" />

        {ai.showButton(db.restaurant?.showJamanAI !== false) && (
          <JamanAiFloatingButton
            onClick={handleOpenAssistant}
            isOpen={isAssistantOpen}
            position="bottom-right"
            className="bottom-4! right-4! sm:bottom-6! sm:right-6!"
          />
        )}

        <JamanAiAssistantModal
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
          app="ADMIN"
          userRole="OWNER_ADMIN"
          onPerformAction={(action) => {
            if (action.actionType === 'NAVIGATE_TAB' && action.targetTab) {
              // The assistant names screens the way the POS does; this console calls a few of them differently. An unknown name is
              // ignored (staying where you are) rather than opening a blank page.
              const alias: Record<string, PosAdminTab> = { BILLS: 'BILLING_SALES', KOT: 'KITCHEN_KOT' };
              const known: PosAdminTab[] = ['DASHBOARD', 'QR_ORDERING', 'BILLING_SALES', 'ORDERS', 'LIVE_KDS', 'MENU', 'MENU_OPTIONS', 'TABLES', 'RESERVATIONS', 'KITCHEN_KOT', 'INVENTORY', 'CUSTOMERS', 'STAFF', 'PAYMENTS', 'REPORTS', 'SHIFTS', 'HARDWARE', 'SYNC', 'SETTINGS', 'LICENSE', 'AUDIT', 'BACKUP', 'SUPPORT', 'INVENTORY_CONTROL'];
              const target = alias[action.targetTab] ?? (known.includes(action.targetTab as PosAdminTab) ? (action.targetTab as PosAdminTab) : null);
              if (target) setActiveTab(target);
            }
          }}
          onQueryExecuted={(intent, _queryText, latencyMs) => {
            void reportAiQueryNow(intent, latencyMs ?? 0);
          }}
        />

        {/* PRO FEATURE LOCKED MODAL (₹7,000 Plan Gate) */}
        {isProUpgradeModalOpen && (
          <Modal
            isOpen={isProUpgradeModalOpen}
            onClose={() => setIsProUpgradeModalOpen(false)}
            title="JAMAN AI Operations Assistant"
            maxWidth="md"
          >
            <div className="space-y-4 py-2">
              {/* Feature Hero Card */}
              <div className="p-4 rounded-2xl bg-jaman-navy text-white shadow-md relative overflow-hidden">
                                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-brand text-white">
                    <Sparkles className="w-3 h-3" /> PRO Exclusive Feature
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-300">₹7,000 / month</span>
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Unlock Intelligent Restaurant Operations
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  JAMAN AI connects directly to your restaurant's local device data to deliver instant operational answers, revenue projections, delayed kitchen alerts, and cash drawer auditing.
                </p>
              </div>

              {/* Benefits Checklist */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  What you get with PRO Plan
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-brand">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-jaman-navy">JAMAN AI Engine</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Real-time revenue, delayed KOT & cash discrepancy detection.</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-emerald-600">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-jaman-navy">Captain Ordering App</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Handheld digital ordering for waitstaff & captains on any mobile.</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-indigo-600">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-jaman-navy">Table QR Ordering</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Instant guest scanning, digital menu browsing & self-ordering.</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-amber-600">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-jaman-navy">Super Admin Synced</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Centralized audit, cloud invoices & real-time telemetry control.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Current plan notice */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Currently on <strong>JAMANVAAR CORE (₹5,000/mo)</strong>. Upgrade to PRO to unlock.</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE3D6]">
                <button
                  type="button"
                  onClick={() => setIsProUpgradeModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all cursor-pointer"
                >
                  Maybe Later
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProUpgradeModalOpen(false);
                    setActiveTab('SETTINGS');
                    setToastMessage('Navigate to Subscription Plans to upgrade to JAMANVAAR PRO.');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>Upgrade to PRO (₹7,000)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </JAMANVAARStartup>
  );
}

import React, { useEffect, useState, useMemo } from 'react';
import {
  AuditRepository,
  db,
  LicenseRepository,
  MenuRepository,
  NotificationRepository,
  RestaurantIdentityRepository,
  StaffRepository
} from '@jamanvaar/database';
import { ForgotPasswordPanel } from './components/auth/ForgotPasswordPanel';
import type { CloudRestaurantProfile } from './cloud/cloudClient';
import { SyncHealthPanel } from './components/sync/SyncHealthPanel';
import { isCloudConnected, redeemActivationCode, cloudLoginOwner, cloudActivateDevice, cloudLogout, CloudApiError, reportAiQueryNow, pushEntitySync, pullEntitySync, pushOrderSync, pullOrderSync, reportDeviceHeartbeat, getStoredDeviceToken, refreshCloudEntitlementsIntoLicense, syncRestaurantIdentity, saveRestaurantIdentity, leaseNumberBlock, pushInventoryMovements, pullInventoryMovements } from './cloud/cloudClient';
import { EntitySyncEngine, SyncOutboxEngine, InventoryLedgerSync, syncDiningTables, syncServiceMessages, syncMenuCatalog, syncCustomers, syncShifts } from '@jamanvaar/sync';
import {
  Category,
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
  Sliders
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
import { ReportsDashboard } from './components/reports/ReportsDashboard';
import { ShiftCashDrawerModule } from './components/shifts/ShiftCashDrawerModule';
import { PrintersDevicesModule } from './components/hardware/PrintersDevicesModule';
import { ReportBrandingSettings } from './components/settings/ReportBrandingSettings';
import { SubscriptionPlansView } from './components/settings/SubscriptionPlansView';
import { AuditTrailModule } from './components/audit/AuditTrailModule';
import { BackupRestoreModule } from './components/backup/BackupRestoreModule';
import { SupportTicketsModule } from './components/support/SupportTicketsModule';
import { InventoryControlModule } from './components/inventory/InventoryControlModule';
import { TerminalDisplaySettings } from './components/settings/TerminalDisplaySettings';
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
  | 'INVENTORY_CONTROL';

export default function PosAdminApp() {
  const ai = useAiAccess();
  // Check URL parameters for direct guest QR table ordering
  const queryParams = new URLSearchParams(window.location.search);
  const isGuestQrMode = queryParams.has('qrTable') || queryParams.has('table');

  if (isGuestQrMode) {
    return <LegacyGuestRedirect />;
  }

  const [activeTab, setActiveTab] = useState<PosAdminTab>('DASHBOARD');
  // Whether QR Ordering is in this restaurant's plan, as the server says (cached for a week offline).
  const qr = useQrEntitlement();
  const qrKnown = qr.state.status === 'ready';
  const qrLocked = qr.state.status === 'ready' && !qr.state.entitlement.enabled;
  const [dbTick, setDbTick] = useState(0);

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
  const [rememberMe, setRememberMe] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  // Two-phase auth state: 'LOGIN' (enter email + password) or 'ACTIVATION_REQUIRED' (enter JMV key)
  const [passwordResetNotice, setPasswordResetNotice] = useState(false);
  const [authScreenState, setAuthScreenState] = useState<'LOGIN' | 'ACTIVATION_REQUIRED' | 'FORGOT'>('LOGIN');
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

  const completeLogin = (
    user: { id: string; fullName: string; role: string; restaurantId: string },
    restaurant?: CloudRestaurantProfile
  ) => {
    setIsAdminLoggedIn(true);
    setAuthError('');
    setAuthPassword('');
    setAuthScreenState('LOGIN');
    setCloudConnected(true);

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
        // First-time login on this device -> Prompt for Welcome Kit activation key
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
    if (!getStoredDeviceToken()) return;
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });
    // Restaurant Admin is the owner's live window onto the restaurant: it must
    // receive every order, payment and kitchen ticket the other devices create.
    // It used to have no order-sync client at all (BUG-034).
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_cloud_device_id') });
    InventoryLedgerSync.configureTransport({ push: pushInventoryMovements, pull: pullInventoryMovements });
    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void InventoryLedgerSync.sync();
    void syncDiningTables();
    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void InventoryLedgerSync.sync();
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
    const syncStaff = async () => {
      await EntitySyncEngine.pushSnapshot('STAFF_USER', db.users.map((u) => ({ externalId: u.id, payload: StaffRepository.toSyncPayload(u) })));
      await EntitySyncEngine.catchUp('STAFF_USER', (remote) => StaffRepository.applyRemoteUser(remote.payload));
    };

    void syncMenuCatalog({ push: true });
    void syncCustomers({ push: true }); // BUG-159: guests registered at the counter show up in the CRM
    void syncStaff();
    // B2-056: POS's own cash-drawer shift and its cash movements, so the Shift & Cash Drawer
    // Ledger, Reconciliation and EOD Z-Report pages here actually see them. Restaurant Admin never
    // opens or edits a shift itself, so this device only ever pulls.
    void syncShifts({ push: false });
    // B2-055: keeps LicenseRepository (plan tier, sidebar badges, JAMAN AI button) in step with a
    // Super Admin plan change regardless of which screen is open — was only ever refreshed when
    // the Subscription Plans screen itself happened to be mounted.
    void refreshCloudEntitlementsIntoLicense();
    void reportDeviceHeartbeat();
    void syncRestaurantIdentity();
    const interval = setInterval(() => {
      void syncMenuCatalog({ push: true });
      void syncCustomers({ push: true });
      void syncStaff();
      void syncShifts({ push: false });
      void refreshCloudEntitlementsIntoLicense();
      void reportDeviceHeartbeat();
      void syncRestaurantIdentity();
    }, 15000);
    return () => {
      clearInterval(interval);
      clearInterval(orderInterval);
      SyncOutboxEngine.configureTransport(null);
    };
  }, [cloudConnected]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
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
      <JAMANVAARStartup appName="Restaurant Admin" appType="ADMIN" subtitle="Restaurant Operations Platform">
        <JamanvaarAuthLayout
          appIdentity="ADMIN"
          appTitle="JAMANVAAR"
          appSubtitle="Restaurant Operations SaaS"
          isOnline={isOnline}
          onToggleNetwork={() => setIsOnline((prev) => !prev)}
          isLocalCoreUnauthorized={db.isLocalCoreUnauthorized()}
          healthCheckUrl={`${db.getSyncServerUrl()}/api/health`}
          heroHeadline="Restaurant Control."
          heroHighlightWord="Live Intelligence."
          heroDescription="Centralized management suite for sales analytics, live KOT dispatch, recipe costing and team permissions."
          heroImages={APP_HERO_IMAGES.ADMIN}
          capabilities={[
            { label: 'Restaurant Management', icon: 'zap' },
            { label: 'Reports & Analytics', icon: 'printer' },
            { label: 'Menu Management', icon: 'table' },
            { label: 'Inventory & Staff', icon: 'cloud' }
          ]}
          footerNote="Role-Based Security • Instant Offline Boot • 100% Secure"
        >
          <ActivationNoticeBanner />
          {authScreenState === 'FORGOT' ? (
            <ForgotPasswordPanel
              defaultRestaurantCode={authRestaurantCode}
              onBack={() => setAuthScreenState('LOGIN')}
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
                    className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">Owner Password *</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="text-[11px] text-jaman-saffron hover:underline font-bold"
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
                      className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm text-jaman-navy font-semibold focus:outline-hidden transition-colors"
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
                  <label className="flex items-center gap-2 cursor-pointer select-none font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded accent-jaman-saffron"
                    />
                    <span>Remember this device</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setPasswordResetNotice(false);
                      setAuthScreenState('FORGOT');
                    }}
                    className="font-bold text-jaman-saffron hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="w-full py-3.5 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] disabled:opacity-50 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2"
                >
                  {loginBusy ? 'Signing In…' : 'Sign In to Admin'}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span>FIRST-TIME DEVICE ACTIVATION</span>
                </div>
                <h3 className="text-base font-black text-jaman-navy pt-1">
                  Activate Restaurant Admin Console
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Enter the hardware activation key from your Super Admin Welcome Kit to bind this terminal.
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
                    <span className="text-slate-500 font-medium">Device Role:</span>
                    <span className="font-bold text-jaman-saffron">POS_ADMIN (Management Console)</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleActivateSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
                    Hardware Activation Key *
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
                    className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm text-center font-mono font-bold tracking-wider text-jaman-navy focus:outline-hidden transition-colors"
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
                  className="w-full py-3.5 rounded-2xl bg-jaman-saffron hover:bg-[#EA580C] disabled:opacity-40 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2"
                >
                  {activationBusy ? 'Activating Terminal…' : 'Activate & Enter Portal'}
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

  return (
    <JAMANVAARStartup appName="Restaurant Admin" appType="ADMIN" subtitle="Restaurant Operations Platform">
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
        />

        {/* BODY WITH FULL SIDEBAR & MAIN CONTENT */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* LEFT ADMIN SIDEBAR */}
          <aside className="w-64 bg-[#FAF8F5]/95 backdrop-blur-md border-r border-[#EAE3D6] flex flex-col justify-between p-3.5 shrink-0 overflow-y-auto min-h-0 shadow-2xs select-none">
            <div className="space-y-4">
              {[
                {
                  section: 'OPERATIONS',
                  items: [
                    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
                    { id: 'BILLING_SALES', label: 'Billing / Invoices', icon: DollarSign },
                    { id: 'ORDERS', label: 'Orders', icon: ShoppingBag },
                    { id: 'LIVE_KDS', label: 'Live Orders / KDS', icon: Flame },
                    { id: 'TABLES', label: 'Floor / Tables', icon: Grid },
                    { id: 'RESERVATIONS', label: 'Reservations', icon: CalendarClock },
                    { id: 'KITCHEN_KOT', label: 'Kitchen / KOT', icon: Activity }
                  ]
                },
                {
                  section: 'DIGITAL ORDERING',
                  items: [{ id: 'QR_ORDERING', label: 'QR Table Ordering', icon: QrCode }]
                },
                {
                  section: 'MENU & INVENTORY',
                  items: [
                    { id: 'MENU', label: 'Menu & Categories', icon: UtensilsCrossed },
                    { id: 'MENU_OPTIONS', label: 'Customisations & Tax', icon: Sliders },
                    { id: 'INVENTORY', label: 'Inventory & Recipes', icon: Package },
                    { id: 'INVENTORY_CONTROL', label: 'Purchasing & Stock Control', icon: Truck }
                  ]
                },
                {
                  section: 'PEOPLE & CASH',
                  items: [
                    { id: 'CUSTOMERS', label: 'Customers CRM', icon: Heart },
                    { id: 'STAFF', label: 'Staff & Roles (RBAC)', icon: Users },
                    { id: 'PAYMENTS', label: 'Payments & Split', icon: CreditCard },
                    { id: 'SHIFTS', label: 'Shift & Cash Drawer', icon: Coins }
                  ]
                },
                {
                  section: 'ANALYTICS & SYSTEM',
                  items: [
                    { id: 'REPORTS', label: 'Reports & Analytics', icon: TrendingUp },
                    { id: 'HARDWARE', label: 'Printers & Devices', icon: Printer },
                    { id: 'SYNC', label: 'Sync & Devices', icon: RefreshCw },
                    { id: 'SETTINGS', label: 'Restaurant Settings', icon: Settings },
                    { id: 'LICENSE', label: 'Subscription Plans', icon: Award },
                    { id: 'AUDIT', label: 'Audit Trail Logs', icon: ShieldCheck },
                    { id: 'BACKUP', label: 'Backup & Restore', icon: Database },
                    { id: 'SUPPORT', label: 'Help & Support', icon: LifeBuoy }
                  ]
                }
              ].map((grp) => {
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover/section:text-slate-600 font-mono">
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
                      let badgeColor = 'bg-jaman-saffron text-white';
                      if (nav.id === 'LIVE_KDS' && pendingKotsCount > 0) {
                        badgeCount = pendingKotsCount;
                        badgeColor = 'bg-jaman-saffron text-white shadow-2xs';
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
                          onClick={() => setActiveTab(nav.id as PosAdminTab)}
                          title={isLockedPro ? 'Not included in your current plan — tap to see what it offers' : undefined}
                          className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs sm:text-[13px] transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? 'bg-jaman-navy text-white shadow-xs'
                              : isLockedPro
                              ? 'text-[#94A3B8] hover:bg-white/60'
                              : 'text-[#4A5568] hover:bg-white hover:text-jaman-navy'
                          }`}
                        >
                          {isSelected && (
                            <span
                              className="absolute left-0 top-2 bottom-2 w-1 bg-jaman-saffron rounded-r-full"
                              aria-hidden="true"
                            />
                          )}

                          <div className={`flex items-center gap-2.5 min-w-0 pl-1 ${isLockedPro ? 'opacity-60' : ''}`}>
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isSelected ? 'text-jaman-saffron' : isLockedPro ? 'text-slate-400' : 'text-slate-400 group-hover:text-jaman-navy'
                              }`}
                            />
                            <span className="truncate">{nav.label}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {nav.id === 'QR_ORDERING' && qrKnown && (
                              <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black rounded-md uppercase ${
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
                                className={`px-1.5 py-0.5 text-[10px] font-black rounded-full min-w-5 text-center ${badgeColor}`}
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
          </aside>

          {/* MAIN VIEW CONTENT AREA — ALL 18 PRODUCTION MODULES */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-jaman-cream min-h-0">
            {/* TAB 1: DASHBOARD */}
            {activeTab === 'DASHBOARD' && (
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
                  { id: 'menu', label: 'Add dishes to your menu', done: menuItems.length > 0, onGo: () => setActiveTab('MENU') },
                  { id: 'tables', label: 'Set up your floor & tables', done: tables.length > 0, onGo: () => setActiveTab('TABLES') },
                  { id: 'printer', label: 'Connect a receipt printer', done: configuredPrinters.length > 0, onGo: () => setActiveTab('HARDWARE') },
                  { id: 'staff', label: 'Add your team members', done: users.length > 1, onGo: () => setActiveTab('STAFF') },
                  { id: 'first_order', label: 'Take your first order', done: orders.length > 0, onGo: () => setActiveTab('TABLES') }
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
                orders={orders}
                dashPeriodReport={dashPeriodReport}
                onSelectOrderDetail={(ord) => setSelectedOrderDetail(ord)}
                showToast={showToast}
              />
            )}

            {/* TAB 12: FINANCIAL & SALES REPORTS */}
            {activeTab === 'REPORTS' && <ReportsDashboard showToast={showToast} />}

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
              <PrintersDevicesModule
                configuredPrinters={configuredPrinters}
                onOpenPrinterModal={(prn) => {
                  setPrinterToEdit(prn || null);
                  setIsPrinterModalOpen(true);
                }}
                showToast={showToast}
                onRequestConfirm={setConfirmDialog}
              />
            )}

            {/* TAB 15: SETTINGS & BRANDING */}
            {activeTab === 'SETTINGS' && (
              <>
                <TerminalDisplaySettings showToast={showToast} />
                <ReportBrandingSettings
                  showToast={showToast}
                  onUpdated={() => setDbTick((t) => t + 1)}
                />
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
          onClose={() => setIsGlobalSearchOpen(false)}
          onSelectOrder={(ord) => {
            setSelectedOrderDetail(ord);
            setActiveTab('BILLING_SALES');
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
          onSaved={() => showToast(tableToEdit ? 'Table updated!' : 'Table created!')}
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
          isOpen={isPrebuiltMenuModalOpen}
          onClose={() => setIsPrebuiltMenuModalOpen(false)}
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

        {isBulkPriceModalOpen && (
          <Modal
            isOpen={isBulkPriceModalOpen}
            onClose={() => setIsBulkPriceModalOpen(false)}
            title="⚡ Quick Bulk Menu Price Adjustment"
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
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                          bulkPercent === pct
                            ? 'bg-jaman-saffron text-white shadow-xs'
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
                  className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
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
              setActiveTab(action.targetTab as any);
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
              <div className="p-4 rounded-2xl bg-gradient-to-br from-jaman-navy to-[#163E5E] text-white shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 w-28 h-28 bg-jaman-saffron/20 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-jaman-saffron text-white">
                    <Sparkles className="w-3 h-3" /> PRO Exclusive Feature
                  </span>
                  <span className="text-[11px] font-mono text-slate-300">₹7,000 / month</span>
                </div>
                <h3 className="text-lg font-black text-white tracking-tight">
                  Unlock Intelligent Restaurant Operations
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  JAMAN AI connects directly to your restaurant's local device data to deliver instant operational answers, revenue projections, delayed kitchen alerts, and cash drawer auditing.
                </p>
              </div>

              {/* Benefits Checklist */}
              <div className="space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  What you get with PRO Plan
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE3D6] flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-jaman-border flex items-center justify-center shrink-0 text-jaman-saffron">
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
                  className="px-5 py-2.5 rounded-xl bg-jaman-saffron hover:bg-[#c9570f] text-white text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
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

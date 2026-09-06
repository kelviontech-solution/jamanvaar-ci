import React, { useEffect, useState, useMemo } from 'react';
import {
  AuditRepository,
  db,
  MenuRepository,
  NotificationRepository
} from '@jamanvaar/database';
import { isCloudConnected, redeemActivationCode, cloudLogin, cloudLogout, CloudApiError } from './cloud/cloudClient';
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
  Modal,
  NotificationDrawerModal,
  NotificationToastContainer
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
  Settings,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Zap
} from 'lucide-react';

// Reusable Feature Modules
import { RestaurantDashboard } from './components/dashboard/RestaurantDashboard';
import { BillingInvoicesModule } from './components/billing/BillingInvoicesModule';
import { OrdersModule } from './components/orders/OrdersModule';
import { KitchenKotModule } from './components/kitchen/KitchenKotModule';
import { QrOrderingModule } from './components/qr/QrOrderingModule';
import { GuestQrOrderingPage } from './components/qr/GuestQrOrderingPage';
import { MenuCategoriesModule } from './components/menu/MenuCategoriesModule';
import { FloorTablesModule } from './components/tables/FloorTablesModule';
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
  | 'TABLES'
  | 'KITCHEN_KOT'
  | 'INVENTORY'
  | 'CUSTOMERS'
  | 'STAFF'
  | 'PAYMENTS'
  | 'REPORTS'
  | 'SHIFTS'
  | 'HARDWARE'
  | 'SETTINGS'
  | 'LICENSE'
  | 'AUDIT'
  | 'BACKUP';

export default function PosAdminApp() {
  // Check URL parameters for direct guest QR table ordering
  const queryParams = new URLSearchParams(window.location.search);
  const isGuestQrMode = queryParams.has('qrTable') || queryParams.has('table');

  if (isGuestQrMode) {
    return <GuestQrOrderingPage />;
  }

  const [activeTab, setActiveTab] = useState<PosAdminTab>('DASHBOARD');
  const [dbTick, setDbTick] = useState(0);

  // Authentication State — restored from persisted session
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(
    () => SessionPersistence.isValid('admin')
  );
  const [authUsername, setAuthUsername] = useState('admin');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  // Cloud-connected restaurant login — an alternative to the local demo/PIN
  // login above for restaurants Super Admin has actually onboarded. Device
  // activation (redeemActivationCode) only ever happens once per install —
  // isCloudConnected() persists across reloads — after that this panel goes
  // straight to owner email + password.
  const [cloudPanelOpen, setCloudPanelOpen] = useState(false);
  const [cloudActivationCode, setCloudActivationCode] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [cloudConnected, setCloudConnected] = useState(() => isCloudConnected());

  const handleCloudActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudError('');
    setCloudBusy(true);
    try {
      await redeemActivationCode(cloudActivationCode.trim());
      setCloudConnected(true);
      setCloudActivationCode('');
    } catch (err) {
      setCloudError(err instanceof CloudApiError ? err.message : 'Could not activate — check the code and try again.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudError('');
    setCloudBusy(true);
    try {
      const user = await cloudLogin(cloudEmail.trim(), cloudPassword);
      setIsAdminLoggedIn(true);
      setAuthError('');
      setCloudPassword('');
      SessionPersistence.save('admin', {
        userId: user.id,
        fullName: user.fullName,
        roleId: user.role === 'OWNER' ? 'role-admin' : 'role-manager',
        restaurantId: user.restaurantId,
        terminalId: 'ADMIN-01'
      });
    } catch (err) {
      setCloudError(err instanceof CloudApiError ? err.message : 'Login failed — check your email and password.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleAdminLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('Please enter both username/email and password.');
      return;
    }

    const trimmedUser = authUsername.trim().toLowerCase();
    const foundUser = db.users.find(
      (u) =>
        (u.username.toLowerCase() === trimmedUser || u.email?.toLowerCase() === trimmedUser) &&
        (u.roleId === 'role-manager' || u.roleId === 'role-super-admin' || u.roleId === 'role-admin')
    );

    if (
      foundUser ||
      (trimmedUser === 'admin' &&
        (authPassword === 'admin123' || authPassword === 'admin' || authPassword === 'demo'))
    ) {
      setIsAdminLoggedIn(true);
      setAuthError('');
      SessionPersistence.save('admin', {
        userId: foundUser?.id || 'admin-user',
        fullName: foundUser?.fullName || 'Restaurant Admin',
        roleId: foundUser?.roleId || 'role-admin',
        restaurantId: 'restaurant-main',
        terminalId: 'ADMIN-01'
      });
    } else {
      setAuthError('Invalid credentials. Please verify your username and password.');
    }
  };

  const handleQuickDemoAdmin = () => {
    setAuthUsername('admin');
    setAuthPassword('admin123');
    setIsAdminLoggedIn(true);
    setAuthError('');
    SessionPersistence.save('admin', {
      userId: 'admin-user',
      fullName: 'Restaurant Admin',
      roleId: 'role-admin',
      restaurantId: 'restaurant-main',
      terminalId: 'ADMIN-01'
    });
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAuthPassword('');
    cloudLogout();
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
  const [isReconModalOpen, setIsReconModalOpen] = useState(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [reportSubTab, setReportSubTab] = useState<string>('DAILY');

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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Synchronized Data Sources
  const categories = db.categories;
  const menuItems = db.menuItems;
  const tables = useMemo(() => [...db.tables], [dbTick]);
  const orders = useMemo(() => [...db.orders], [dbTick]);
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

  const dailyReport = useMemo(() => ReportGeneratorService.getDailyReport(new Date()), [dbTick, orders]);
  const topDishes = useMemo(() => ReportGeneratorService.getTopSellingItems(), [dbTick, orders]);
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
          heroHeadline="Restaurant Control."
          heroHighlightWord="Live Intelligence."
          heroDescription="Centralized management suite for sales analytics, live KOT dispatch, recipe costing and team permissions."
          capabilities={[
            { label: 'Restaurant Management', icon: 'zap' },
            { label: 'Reports & Analytics', icon: 'printer' },
            { label: 'Menu Management', icon: 'table' },
            { label: 'Inventory & Staff', icon: 'cloud' }
          ]}
          footerNote="Role-Based Security • Instant Offline Boot • 100% Secure"
        >
          {!cloudPanelOpen ? (
            <>
              <button
                type="button"
                onClick={handleQuickDemoAdmin}
                className="w-full py-2.5 px-4 rounded-xl bg-[#FFF7ED] hover:bg-[#FFEEDD] border border-[#FDBA74] text-[#E66817] font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-2xs active:scale-[0.98] cursor-pointer"
              >
                <Zap className="w-4 h-4 text-[#E66817] fill-[#E66817]" />
                <span>QUICK DEMO LOGIN — Restaurant Admin (@admin)</span>
              </button>

              <form onSubmit={handleAdminLogin} className="space-y-3.5 pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
                    Username or Email *
                  </label>
                  <input
                    type="text"
                    value={authUsername}
                    onChange={(e) => {
                      setAuthUsername(e.target.value);
                      setAuthError('');
                    }}
                    placeholder="e.g. admin or owner@jamanvaar.com"
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">Password *</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="text-[11px] text-[#E66817] hover:underline font-bold"
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
                      placeholder="Enter admin password (demo: admin123)"
                      className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
                    />
                  </div>
                </div>

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
                      className="rounded accent-[#E66817]"
                    />
                    <span>Remember this device</span>
                  </label>
                  <span className="text-slate-400 text-[11px] font-mono">PIN: admin / admin123</span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2"
                >
                  Sign In to Admin
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setCloudError('');
                  setCloudPanelOpen(true);
                }}
                className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-[#0B253A] underline cursor-pointer pt-1"
              >
                Restaurant Owner? Sign in with your JAMANVAAR Cloud account →
              </button>
            </>
          ) : (
            <div className="space-y-3.5">
              <div className="text-center space-y-0.5">
                <h3 className="text-sm font-black text-[#0B253A]">
                  {cloudConnected ? 'Sign in to JAMANVAAR Cloud' : 'Activate this device'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {cloudConnected
                    ? 'Log in with the owner email and password issued by Super Admin.'
                    : "Enter the activation code from your restaurant's Welcome Kit — this is only needed once."}
                </p>
              </div>

              {!cloudConnected ? (
                <form onSubmit={handleCloudActivate} className="space-y-3">
                  <input
                    type="text"
                    value={cloudActivationCode}
                    onChange={(e) => setCloudActivationCode(e.target.value)}
                    placeholder="JMV-XXXX-XXXX-XXXX"
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-center font-mono font-bold text-[#0B253A] focus:outline-hidden transition-colors"
                    autoFocus
                  />
                  {cloudError && (
                    <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center">
                      {cloudError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={cloudBusy || !cloudActivationCode.trim()}
                    className="w-full py-3.5 rounded-2xl bg-[#0B253A] hover:bg-[#1E3A4C] disabled:opacity-40 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {cloudBusy ? 'Activating…' : 'Activate'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCloudLogin} className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">Owner Email *</label>
                    <input
                      type="email"
                      value={cloudEmail}
                      onChange={(e) => setCloudEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">Password *</label>
                    <input
                      type="password"
                      value={cloudPassword}
                      onChange={(e) => setCloudPassword(e.target.value)}
                      required
                      className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
                    />
                  </div>
                  {cloudError && (
                    <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center">
                      {cloudError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={cloudBusy}
                    className="w-full py-3.5 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] disabled:opacity-40 text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {cloudBusy ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setCloudError('');
                  setCloudPanelOpen(false);
                }}
                className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-[#0B253A] underline cursor-pointer"
              >
                ← Back to local / demo login
              </button>
            </div>
          )}
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
    );
  }

  return (
    <JAMANVAARStartup appName="Restaurant Admin" appType="ADMIN" subtitle="Restaurant Operations Platform">
      <div className="h-screen w-screen bg-[#FAF7F2] text-[#0B253A] flex flex-col font-sans select-none antialiased overflow-hidden">
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div className="fixed top-4 right-4 z-50 bg-[#0B253A] text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-white/20 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold">{toastMessage}</span>
          </div>
        )}

        {/* UNIFIED SAAS HEADER */}
        <PosAdminHeader
          restaurantName={db.restaurant.name}
          outletName={db.outlet.name}
          globalSearch={globalSearch}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
          activeShift={activeShift}
          onOpenEodModal={() => setIsEodModalOpen(true)}
          onOpenReconModal={() => setIsReconModalOpen(true)}
          onOpenAssistant={() => setIsAssistantOpen(true)}
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
                    { id: 'INVENTORY', label: 'Inventory & Recipes', icon: Package }
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
                    { id: 'SETTINGS', label: 'Restaurant Settings', icon: Settings },
                    { id: 'LICENSE', label: 'Subscription Plans', icon: Award },
                    { id: 'AUDIT', label: 'Audit Trail Logs', icon: ShieldCheck },
                    { id: 'BACKUP', label: 'Backup & Restore', icon: Database }
                  ]
                }
              ].map((grp) => (
                <div key={grp.section} className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-0.5 block font-mono">
                    {grp.section}
                  </span>
                  <nav className="space-y-0.5">
                    {grp.items.map((nav) => {
                      const Icon = nav.icon;
                      const isSelected = activeTab === nav.id;

                      let badgeCount = 0;
                      let badgeColor = 'bg-[#E66817] text-white';
                      if (nav.id === 'LIVE_KDS' && pendingKotsCount > 0) {
                        badgeCount = pendingKotsCount;
                        badgeColor = 'bg-[#E66817] text-white shadow-2xs';
                      } else if (nav.id === 'INVENTORY' && lowStockCount > 0) {
                        badgeCount = lowStockCount;
                        badgeColor = 'bg-amber-600 text-white shadow-2xs';
                      }

                      return (
                        <button
                          key={nav.id}
                          onClick={() => setActiveTab(nav.id as PosAdminTab)}
                          className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs sm:text-[13px] transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? 'bg-[#0B253A] text-white shadow-xs'
                              : 'text-[#4A5568] hover:bg-white hover:text-[#0B253A]'
                          }`}
                        >
                          {isSelected && (
                            <span
                              className="absolute left-0 top-2 bottom-2 w-1 bg-[#E66817] rounded-r-full"
                              aria-hidden="true"
                            />
                          )}

                          <div className="flex items-center gap-2.5 min-w-0 pl-1">
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isSelected ? 'text-[#E66817]' : 'text-slate-400 group-hover:text-[#0B253A]'
                              }`}
                            />
                            <span className="truncate">{nav.label}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {nav.id === 'QR_ORDERING' && (
                              <span
                                className={`px-1.5 py-0.5 text-[9px] font-black rounded-md uppercase ${
                                  db.license?.tier === 'PRO'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                              >
                                PRO
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
                </div>
              ))}
            </div>
          </aside>

          {/* MAIN VIEW CONTENT AREA — ALL 18 PRODUCTION MODULES */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#FAF7F2] min-h-0">
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
                onRefresh={() => {
                  setDbTick((t) => t + 1);
                  showToast('Dashboard metrics refreshed');
                }}
              />
            )}

            {/* TAB 2: DIGITAL ORDERING & QR SUITE */}
            {activeTab === 'QR_ORDERING' && <QrOrderingModule />}

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
            {activeTab === 'MENU' && (
              <MenuCategoriesModule
                categories={categories}
                menuItems={menuItems}
                onOpenItemModal={(item) => {
                  setItemToEdit(item || null);
                  setIsItemModalOpen(true);
                }}
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
              <ReportBrandingSettings
                showToast={showToast}
                onUpdated={() => setDbTick((t) => t + 1)}
              />
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
                            ? 'bg-[#E66817] text-white shadow-xs'
                            : 'bg-[#FBF9F5] border border-slate-200 text-[#0B253A]'
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
                    className="w-full bg-[#FBF9F5] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold"
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
                  className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
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

        <JamanAiFloatingButton
          onClick={() => setIsAssistantOpen(true)}
          isOpen={isAssistantOpen}
          position="bottom-right"
          className="bottom-4! right-4! sm:bottom-6! sm:right-6!"
        />

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
        />
      </div>
    </JAMANVAARStartup>
  );
}

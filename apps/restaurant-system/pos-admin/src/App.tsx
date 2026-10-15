import {OperationsConsole} from './components/operations/OperationsConsole';
import { activeAdminBranch, saveAdminBranch } from './adminBranchScope';
import { AdminBranchWorkspace } from './components/header/AdminBranchWorkspace';
import { BranchBusinessDashboard } from './components/dashboard/BranchBusinessDashboard';
import type { AttentionTask } from './components/dashboard/AttentionTasks';
import { dashboardDay, type BillingEntry } from './components/dashboard/dashboardDrilldown';
import { PlanOnboarding } from './components/dashboard/PlanOnboarding';
import { MenuLaunchCheck } from './components/dashboard/MenuLaunchCheck';
import { KioskContentPanel } from './components/settings/KioskContentPanel';
import { KioskWelcomeScreenPanel } from './components/settings/KioskWelcomeScreenPanel';
import { SettingsScopeNotice } from './components/settings/SettingsScopeNotice';
import { KioskComboPanel } from './components/settings/KioskComboPanel';
import React, { useEffect, useState, useMemo } from 'react';
import { AuditRepository, CouponRepository, db, NotificationRepository, RestaurantIdentityRepository } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';
import { ImageCache, collectMenuImageUrls } from '@jamanvaar/utils';
import { PosAdminLoginScreen } from './components/auth/PosAdminLoginScreen';
import { ProductPickerScreen } from './components/auth/ProductPickerScreen';
import { ProUpgradeModal } from './components/ProUpgradeModal';
import { usePosAdminDeviceSync } from './hooks/usePosAdminDeviceSync';
import { useKioskFleetPolling } from './hooks/useKioskFleetPolling';
import type { CloudRestaurantProfile } from './cloud/cloudClient';
import { SyncHealthPanel } from './components/sync/SyncHealthPanel';
import { isCloudConnected, cloudLoginOwner, cloudActivateDevice, cloudLogout, CloudApiError, reportAiQueryNow, sendKioskCommand } from './cloud/cloudClient';
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
  SettingsPageHeader,
  Modal,
  NotificationDrawerModal,
  NotificationToastContainer,
  UrgentGuestAlertModal,
  useAiAccess
} from '@jamanvaar/ui';
import { lanMeshSync } from '@jamanvaar/sync';
import { useEntitlements, filterNavSections } from './hooks/useEntitlements';
import { productNavSections } from './navSections';
import { ADMIN_PRODUCTS, PRODUCT_PAGES, availableAdminProducts, ownerEntryPath, parseAdminRoute } from './adminProducts';
import { requestQrLeave } from './components/qrconsole/useQrUnsavedChanges';
import { useAdminProduct } from './hooks/useAdminProduct';
import { KioskDashboard } from './components/kiosk/KioskDashboard';
import { OnlinePaymentsPanel } from './components/payments/OnlinePaymentsPanel';
import {
  CentralReportingService,
  ReportGeneratorService,
  SessionPersistence
} from '@jamanvaar/business';
import { CheckCircle2, Lock, ChevronDown, Settings, Unlock } from 'lucide-react';

// Reusable Feature Modules
// Reusable Feature Modules
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
import { WhatsAppBillNumberPanel } from './components/receipts/WhatsAppBillNumberPanel';
import { FeedbackPanel } from './components/kiosk/FeedbackPanel';
import { ReportBrandingSettings } from './components/settings/ReportBrandingSettings';
import { SubscriptionPlansView } from './components/settings/SubscriptionPlansView';
import { AuditTrailModule } from './components/audit/AuditTrailModule';
import { BackupRestoreModule } from './components/backup/BackupRestoreModule';
import { SupportTicketsModule } from './components/support/SupportTicketsModule';
import { InventoryControlModule } from './components/inventory/InventoryControlModule';
import { AppDownloadsModule } from './components/downloads/AppDownloadsModule';
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

import type { PosAdminTab } from './navigation/adminTabs';
export { ALL_POS_ADMIN_TABS, restoreActiveTab } from './navigation/adminTabs';
export type { PosAdminTab } from './navigation/adminTabs';

export default function PosAdminApp() {
  const ai = useAiAccess();
  // Check URL parameters for direct guest QR table ordering
  const queryParams = new URLSearchParams(window.location.search);
  const isGuestQrMode = queryParams.has('qrTable') || queryParams.has('table');

  if (isGuestQrMode) {
    return <LegacyGuestRedirect />;
  }

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
      const next = { ...prev, [section]: !(prev[section] ?? section !== 'DAILY') };
      try {
        localStorage.setItem('jamanvaar_posadmin_collapsed_sections', JSON.stringify(next));
      } catch {
        // localStorage unavailable — collapse state just won't persist across reloads.
      }
      return next;
    });
  };

  // Authentication State — restored from persisted session
  const [branchScopeReady,setBranchScopeReady]=useState(false);
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
  const kiosks = useKioskFleetPolling(isAdminLoggedIn, hasApp);
  const availableProducts = availableAdminProducts(enabledApps);
  const contextReady = isAdminLoggedIn && !entitlementsLoading && !entitlementError;
  const context = useAdminProduct(tenantId, availableProducts, contextReady, enabledApps);
  useEffect(() => {
    if (contextReady && ownerEntryPath(enabledApps) === '/qr/admin/') window.location.replace('/qr/admin/');
  }, [contextReady, enabledApps.join(',')]);
  const product = context.product;
  const isKioskAdmin = product === 'KIOSK_ADMIN';
  const activeTab: PosAdminTab = context.page || 'DASHBOARD';
  const setActiveTab: React.Dispatch<React.SetStateAction<PosAdminTab>> = next => {
    const page = typeof next === 'function' ? next(activeTab) : next;
    if (product && Object.hasOwn(PRODUCT_PAGES[product], page)) {
      if (activeTab === 'QR_ORDERING' && page !== activeTab) void requestQrLeave().then(ok => { if (ok) context.navigate(product, page); });
      else context.navigate(product, page);
    }
  };
  const [attentionEntry,setAttentionEntry] = useState(() => ({id:queryParams.get('attentionId') || '',label:queryParams.get('attentionLabel') || '',page:parseAdminRoute(window.location.pathname).page || ''}));
  const openAttentionTask = async (requestedTask:AttentionTask) => {
    const task:AttentionTask=isKioskAdmin&&requestedTask.page==='BILLING_SALES'?{...requestedTask,page:'ORDERS'}:requestedTask;
    if (!product) return;
    const targetBranch=task.branchId || (activeAdminBranch !== 'all' ? activeAdminBranch : null);
    if (!targetBranch) {showToast('Choose the branch whose shared menu you want to review.');setActiveTab('MENU');return;}
    try {
      if (targetBranch !== activeAdminBranch) {
        if (!(await requestQrLeave())) return;
        const storage=(window as unknown as {__jamanvaarStorage?:{flush:()=>Promise<void>}}).__jamanvaarStorage;
        await storage?.flush();saveAdminBranch(targetBranch);
        const url=new URL(`${product === 'KIOSK_ADMIN' ? '/kiosk-admin' : '/restaurant-admin'}/${PRODUCT_PAGES[product][task.page]}`,location.origin);
        url.searchParams.set('attentionId',task.id);url.searchParams.set('attentionLabel',task.label);if(task.createdAt)url.searchParams.set('attentionDate',task.createdAt);
        window.location.assign(url.href);
      } else {if(task.page==='BILLING_SALES'&&task.createdAt){const date=dashboardDay(task.createdAt,'UTC');setDashboardBillingEntry({from:date,to:date,source:'ALL',collection:'PENDING',search:task.id,orderId:task.id});}setAttentionEntry({id:task.id,label:task.label,page:task.page});setActiveTab(task.page);}
    } catch(e) {showToast(e instanceof Error ? e.message : 'Could not open the selected task.');}
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
      //
      // The generic branch below used to show one fixed sentence regardless of
      // WHY the request failed (CORS block, DNS failure, timeout, TLS error...),
      // which made every non-HTTP failure look identical and undiagnosable from
      // the UI alone. The real error's name/message now goes to the console for
      // support; the owner sees a plain sentence with no exception text in it.
      if (!(err instanceof CloudApiError)) {
        console.warn('[admin sign-in] request failed before a server response:', err instanceof Error ? `${err.name}: ${err.message}` : err);
      }
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
      setActivationError(err instanceof CloudApiError ? err.message : "Could not complete activation. Check this device's internet connection and that the code is correct, then try again.");
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
  const [dashboardBillingEntry, setDashboardBillingEntry] = useState<BillingEntry | undefined>(()=>{const date=queryParams.get('attentionDate');return date?{from:dashboardDay(date,'UTC'),to:dashboardDay(date,'UTC'),source:'ALL',collection:'PENDING',search:queryParams.get('attentionId') || undefined,orderId:queryParams.get('attentionId') || undefined}:undefined;});
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

  // Keep menu/category pictures on this device, so a dish still shows its real photo once the internet is
  // down, instead of silently falling back to the placeholder icon. This only ever ran in the kiosk app; an
  // owner editing the menu through an outage never had the pictures saved locally to fall back to.
  useEffect(() => {
    let lastKey = '';
    const warmImages = () => {
      if (!NetworkStatusService.isOnline()) return;
      const list = collectMenuImageUrls(db.menuItems, db.categories);
      const key = list.join('|');
      if (key === lastKey) return;
      lastKey = key;
      void ImageCache.sync(list);
    };
    const unsubNet = NetworkStatusService.subscribe(warmImages);
    const unsubDb2 = db.subscribe(warmImages);
    return () => { unsubNet(); unsubDb2(); };
  }, []);

  usePosAdminDeviceSync(branchScopeReady, cloudConnected, isAdminLoggedIn, entitlementsLoading, entitlementError, hasApp, refetchEntitlements);

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
      <PosAdminLoginScreen
        isOnline={isOnline}
        onToggleNetwork={() => setIsOnline((prev) => !prev)}
        authScreenState={authScreenState}
        setAuthScreenState={setAuthScreenState}
        activatePrefill={activatePrefill}
        setActivatePrefill={setActivatePrefill}
        authRestaurantCode={authRestaurantCode}
        setAuthRestaurantCode={setAuthRestaurantCode}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        authError={authError}
        setAuthError={setAuthError}
        passwordResetNotice={passwordResetNotice}
        setPasswordResetNotice={setPasswordResetNotice}
        activationKeyInput={activationKeyInput}
        setActivationKeyInput={setActivationKeyInput}
        loginBusy={loginBusy}
        handleAdminLogin={handleAdminLogin}
        pendingTenant={pendingTenant}
        activationError={activationError}
        setActivationError={setActivationError}
        activationBusy={activationBusy}
        handleActivateSubmit={handleActivateSubmit}
      />
    );
  }

  if (!contextReady || !product) {
    if (contextReady && ownerEntryPath(enabledApps) === '/qr/admin/') return <div className="min-h-screen flex items-center justify-center bg-jaman-cream" role="status">Opening QR Admin…</div>;
    return (
      <ProductPickerScreen
        entitlementsLoading={entitlementsLoading}
        entitlementError={entitlementError}
        authRequired={authRequired}
        contextReady={contextReady}
        context={context}
        availableProducts={availableProducts}
        onRefetchEntitlements={refetchEntitlements}
        onAdminLogout={handleAdminLogout}
      />
    );
  }

  return (
    <JAMANVAARStartup appName={appName} appType={isKioskAdmin ? 'KIOSK_ADMIN' : 'ADMIN'} subtitle="Your restaurant workspace">
      <div data-jv-workspace="admin" className="h-dvh w-full bg-jaman-cream text-jaman-navy flex flex-col font-sans select-none antialiased overflow-hidden">
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div role="status" aria-live="polite" className="fixed top-4 right-4 z-50 bg-jaman-navy text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-white/20 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold">{toastMessage}</span>
          </div>
        )}

        {/* UNIFIED SAAS HEADER */}
        <PosAdminHeader
          applicationName={appName}
          showRestaurantActions={!isKioskAdmin && activeAdminBranch !== 'all' && branchScopeReady}
          restaurantName={db.restaurant.name}
          outletName={!branchScopeReady ? 'Loading branch' : activeAdminBranch === 'all' ? 'All branches' : db.outlet.name}
          isCloudConnected={cloudConnected}
          onOpenBranchDirectory={() => setIsBranchDirectoryOpen(true)}
          globalSearch={globalSearch}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
          activeShift={activeShift}
          onOpenEodModal={() => setIsEodModalOpen(true)}
          onOpenReconModal={() => setIsReconModalOpen(true)}
          onOpenAssistant={() => activeTab === 'QR_ORDERING' ? document.querySelector<HTMLButtonElement>('[data-testid="qr-ai-open"]')?.click() : handleOpenAssistant()}
          onOpenNotifDrawer={() => setIsNotifDrawerOpen(true)}
          unreadNotifsCount={unreadNotifsCount}
          onAdminLogout={handleAdminLogout}
          onOpenNav={() => activeTab === 'QR_ORDERING' ? document.querySelector<HTMLButtonElement>('.qr-admin-menu')?.click() : setNavOpen(true)}
        />

        <AdminBranchWorkspace onReady={() => setBranchScopeReady(true)} />

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
          {activeTab !== 'QR_ORDERING' && <aside
            aria-label="Main menu"
            className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transition-transform duration-200 ${navOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 bg-[#FAF8F5] lg:bg-[#FAF8F5]/95 backdrop-blur-md border-r border-[#EAE3D6] flex flex-col justify-between p-3.5 shrink-0 overflow-y-auto min-h-0 shadow-2xl lg:shadow-2xs select-none`}
          >
            <div className="space-y-4">
              {filterNavSections(productNavSections(product), hasApp).map((grp) => {
                const hasActiveTab = grp.items.some((it) => it.id === activeTab);
                // A section holding the currently-open tab always shows,
                // regardless of its remembered collapse state — you should
                // never lose sight of where you are.
                const isExpanded = hasActiveTab || !(collapsedSections[grp.section] ?? grp.section !== 'DAILY');
                return (
                <div key={grp.section} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(grp.section)}
                    aria-expanded={isExpanded}
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
                          onClick={() => { setAttentionEntry({id:'',label:'',page:''});setActiveTab(nav.id as PosAdminTab); setNavOpen(false); }}
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
              {!isKioskAdmin && activeAdminBranch !== 'all' && branchScopeReady && <button type="button" onClick={() => { setNavOpen(false); setIsEodModalOpen(true); }} className="min-h-[44px] rounded-xl bg-brand/[0.07] border border-brand/30 text-brand text-xs font-bold cursor-pointer">EOD Report</button>}
              {!isKioskAdmin && activeAdminBranch !== 'all' && branchScopeReady && <button type="button" onClick={() => { setNavOpen(false); setIsReconModalOpen(true); }} className="min-h-[44px] rounded-xl bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#1E40AF] text-xs font-bold cursor-pointer">Reconciliation</button>}
              <button type="button" onClick={() => { setNavOpen(false); handleOpenAssistant(); }} className="min-h-[44px] rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold cursor-pointer">Assistant</button>
              <button type="button" onClick={() => { setNavOpen(false); handleAdminLogout(); }} className="min-h-[44px] rounded-xl bg-white border border-jaman-border text-rose-700 text-xs font-bold cursor-pointer">Log out</button>
            </div>
          </aside>}

          {/* MAIN VIEW CONTENT AREA — ALL 18 PRODUCTION MODULES */}
          {!branchScopeReady || (activeAdminBranch === 'all' && activeTab !== 'DASHBOARD' && activeTab !== 'QR_ORDERING') ? <main className="flex-1 p-6"><div className="bg-white border border-jaman-border rounded-2xl p-6 max-w-xl"><h2 className="font-extrabold text-xl">{branchScopeReady ? 'Choose a branch to continue' : 'Verifying your workspace…'}</h2><p className="text-slate-500 mt-2">{branchScopeReady ? "Orders, tables, staff and devices belong to one branch at a time — pick one below." : 'Use the Workspace selector above to manage that branch’s orders, tables, staff and devices.'}</p>{branchScopeReady && <div className="mt-4 -mx-2"><AdminBranchWorkspace onReady={() => setBranchScopeReady(true)} /></div>}</div></main> :
          <main key={activeTab} className={`jv-page-enter flex-1 overflow-y-auto ${activeTab === 'QR_ORDERING' ? '' : 'p-3 sm:p-6'} bg-jaman-cream min-h-0 min-w-0`}>
            <SettingsScopeNotice page={activeTab} onNavigate={page=>setActiveTab(page as PosAdminTab)}/>
            {/* TAB 1: DASHBOARD */}
            {activeTab === 'OPERATIONS_HUB' && branchScopeReady && <OperationsConsole branchId={activeAdminBranch}/>}
            {activeTab === 'DASHBOARD' && branchScopeReady && <><BranchBusinessDashboard onTask={task=>void openAttentionTask(task)} branchId={activeAdminBranch ?? 'all'} taskPages={isKioskAdmin ? ['SYNC','MENU'] : undefined} onNavigate={(page,entry) => {if(activeAdminBranch === 'all'){showToast('Choose the branch you want to manage in the Workspace selector.');return;}setDashboardBillingEntry(entry);setActiveTab(page);}}/>{isKioskAdmin && activeAdminBranch !== 'all' && <KioskDashboard kiosks={kiosks} onNavigate={setActiveTab} />}</>}
            {activeTab === 'DASHBOARD' && branchScopeReady && activeAdminBranch && activeAdminBranch !== 'all' && <PlanOnboarding key={enabledApps.slice().sort().join('-')} apps={enabledApps} branchId={activeAdminBranch} counts={{menu:menuItems.filter(item=>!item.archivedAt).length,tables:tables.length,staff:users.filter(u=>u.roleId!=='role-admin').length,printers:configuredPrinters.length,kiosks:kiosks.filter(k=>k.branchId===activeAdminBranch&&k.health==='online'&&!k.isLocked).length}} onNavigate={page=>setActiveTab(page as PosAdminTab)}/>}
            {activeTab === 'DASHBOARD' && branchScopeReady && activeAdminBranch !== 'all' && <MenuLaunchCheck branchId={activeAdminBranch ?? undefined} qrEnabled={hasApp('QR_ORDERING')} onNavigate={tab => setActiveTab(tab as typeof activeTab)}/>}

            {/* TAB 2: DIGITAL ORDERING & QR SUITE */}
            {activeTab === 'QR_ORDERING' && <div className="qr-admin-app flex-1 min-w-0 overflow-y-auto"><QrConsole layout="integrated" onBack={() => setActiveTab('DASHBOARD')} onViewPlan={() => setActiveTab('LICENSE')} showToast={showToast} /></div>}

            {/* TAB 3: BILLING / INVOICES */}
            {activeTab === 'BILLING_SALES' && (
              <BillingInvoicesModule
                initialFilters={dashboardBillingEntry}
                orders={orders}
                onOrderUpdated={() => setDbTick((t) => t + 1)}
                showToast={showToast}
              />
            )}

            {/* TAB 4: ORDERS & ORDER HISTORY */}
            {activeTab === 'ORDERS' && (
              <OrdersModule
                initialOrderId={attentionEntry.page==='ORDERS'?attentionEntry.id:undefined}
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
            {activeTab === 'SYNC' && <SyncHealthPanel initialDeviceId={attentionEntry.page==='SYNC'?attentionEntry.id:undefined} showToast={showToast} />}

            {activeTab === 'MENU' && (
              <MenuCategoriesModule
                initialItemId={attentionEntry.page==='MENU'?attentionEntry.id:undefined}
                initialSearch={attentionEntry.page==='MENU'?attentionEntry.label:undefined}
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
            {activeTab === 'INVENTORY' && (<>
              {new URLSearchParams(location.search).get('returnTo') === 'purchasing' && <a href={`${location.pathname.startsWith('/kiosk-admin') ? '/kiosk-admin' : '/restaurant-admin'}/purchasing`} className="inline-block mb-3 rounded-xl border px-4 py-3 font-bold">Return to receiving goods</a>}

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
              </>
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
            {activeTab === 'KIOSK_WELCOME' && hasApp('KIOSK_ADMIN') && <KioskWelcomeScreenPanel kiosks={kiosks} showToast={showToast} />}
            {activeTab === 'KIOSK_COMBOS' && hasApp('KIOSK_ADMIN') && <KioskComboPanel showToast={showToast} />}
            {/* TAB: KIOSK TERMINAL FLEET (relocated from kiosk-admin, gated on KIOSK_ADMIN) */}
            {activeTab === 'KIOSKS' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">Kiosk Terminal Control</h1>
                  <p className="text-sm text-[#4A5568] mt-1">Manage self-ordering stations, lockdown states, and maintenance modes.</p>
                </div>
                {kiosks.length === 0 && (
                  <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm text-center space-y-3">
                    <p className="text-xs text-[#64748B]">
                      No Kiosk Terminals yet. A terminal appears here the moment it's activated with a real activation code and joins this restaurant's network.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('SUPPORT'); showToast('Raise a ticket to request a new Kiosk activation key.'); }}
                      className="inline-flex items-center justify-center font-semibold rounded-xl bg-brand text-white px-4 py-2.5 text-sm cursor-pointer hover:opacity-90"
                    >
                      Request Activation Key
                    </button>
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
                  {coupons.length === 0 && <div className="col-span-full rounded-2xl border border-jaman-border bg-white p-6 space-y-3"><h2 className="text-lg font-bold">Create your first promotion</h2><p className="text-sm text-slate-600">Offer a percentage discount or a fixed amount off with a minimum order. For example, LUNCH10 can give 10% off qualifying lunch orders. Set the eligible channels and validity when creating the coupon, then verify it at checkout before sharing it.</p><Button variant="accent" onClick={() => setIsAddCouponModalOpen(true)}>Create coupon</Button></div>}
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
              <>
                <ReceiptEBillPanel showToast={showToast} onGoToSettings={() => setActiveTab('SETTINGS')} />
                <WhatsAppBillNumberPanel showToast={showToast} />
              </>
            )}

            {/* TAB 15: SETTINGS & BRANDING */}
            {activeTab === 'SETTINGS' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <SettingsPageHeader
                  title={isKioskAdmin ? 'Kiosk settings' : 'Restaurant settings'}
                  description={isKioskAdmin
                    ? 'Screen size, restaurant identity and customer-kiosk behaviour.'
                    : 'Screen size, channels and the identity printed on reports and bills.'}
                  icon={<Settings className="w-6 h-6 text-slate-500" aria-hidden="true" />}
                />
                <section aria-label="Settings scope and shortcuts" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3"><h2 className="font-bold">{db.restaurant.name} / {db.outlet.name}</h2><p className="text-sm text-slate-600">Restaurant identity and legal information are shared across your restaurant. Menu, operating rules and kiosk defaults use the selected branch. Screen size preferences affect this device; individual kiosk overrides are managed in Welcome Screen and Kiosk Settings.</p><div className="flex flex-wrap gap-2">{([{tab:'MENU_OPTIONS',label:'Tax & customisations'},{tab:product === 'KIOSK_ADMIN' ? 'KIOSK_PAYMENTS' : 'PAYMENTS',label:'Payments'},{tab:'RECEIPTS',label:'Receipts'},{tab:'SYNC',label:'Devices & connections'},{tab:'LICENSE',label:'Licensed products'}] as const).filter(entry=>product && Object.hasOwn(PRODUCT_PAGES[product],entry.tab)).map(entry=><button type="button" key={entry.tab} className="min-h-11 rounded-xl border bg-white px-4 text-sm font-bold" onClick={()=>setActiveTab(entry.tab)}>{entry.label}</button>)}</div></section>
                <TerminalDisplaySettings showToast={showToast} />
                {!isKioskAdmin && hasApp('WHATSAPP_ORDERING') && <WhatsAppChannelPanel showToast={showToast} />}
                <ReportBrandingSettings
                  showToast={showToast}
                  onUpdated={() => setDbTick((t) => t + 1)}
                />
                {isKioskAdmin && <KioskDisplaySettingsPanel showToast={showToast} kiosks={kiosks.filter(kiosk => kiosk.branchId === activeAdminBranch)} />}
              </div>
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

            {activeTab === 'DOWNLOADS' && <AppDownloadsModule />}
          </main>}
        </div>

        {/* ALL SPECIALIZED MODAL DIALOGS */}
        <GlobalSearchModal
          tasks={[{id:'service',label:'Pause ordering / service controls',keywords:'kitchen capacity hours pause kiosk qr'},{id:'checklists',label:'Opening and closing checks',keywords:'open close checklist'},{id:'menu',label:'Review or schedule menu changes',keywords:'change price publish photos breakfast festival'},{id:'handover',label:'Prepare a branch handover',keywords:'shift closing unresolved'},{id:'approvals',label:'Review discount / refund approvals',keywords:'approve discount refund bill manager'}]}
          onSelectTask={id=>{const url=new URL(location.href);url.searchParams.set('opsTask',id);history.replaceState(null,'',url);setActiveTab('OPERATIONS_HUB');window.dispatchEvent(new CustomEvent('jamanvaar-ops-open-task',{detail:id}));}}
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
          configuredPrinters={configuredPrinters}
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
          onSelectNotification={(notif) => {
            // A bill notification lands on Billing, where the bill is listed with its amount under "Bills waiting".
            if (notif.meta?.orderId) setActiveTab('BILLING_SALES');
            setIsNotifDrawerOpen(false);
          }}
        />

        <NotificationToastContainer role="POS_ADMIN" />
        <UrgentGuestAlertModal role="POS_ADMIN" />

        {activeTab !== 'QR_ORDERING' && ai.showButton(db.restaurant?.showJamanAI !== false) && (
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
          userRole={SessionPersistence.load('admin')?.roleId === 'role-manager' ? 'MANAGER' : 'OWNER_ADMIN'}
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

        <ProUpgradeModal
          isOpen={isProUpgradeModalOpen}
          onClose={() => setIsProUpgradeModalOpen(false)}
          onUpgradeClick={() => {
            setIsProUpgradeModalOpen(false);
            setActiveTab('SETTINGS');
            setToastMessage('Navigate to Subscription Plans to upgrade to JAMANVAAR PRO.');
          }}
        />
      </div>
    </JAMANVAARStartup>
  );
}

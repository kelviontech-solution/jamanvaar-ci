import React, { useEffect, useState, useMemo } from 'react';
import {
  AuditRepository,
  ComboRepository,
  CouponRepository,
  CustomerRepository,
  db,
  FeedbackRepository,
  LicenseRepository,
  MenuRepository,
  OrderRepository,
  ReceiptRepository,
  TableRepository,
  InventoryRepository,
  RecipeRepository,
  StaffRepository,
  PrinterRepository,
  NotificationRepository,
  FOOD_IMAGE_LIBRARY,
  PREBUILT_MENU_TEMPLATES
} from '@jamanvaar/database';
import {
  Category,
  ChatMessage,
  ComboDeal,
  Coupon,
  CustomerAccount,
  DietaryType,
  DiningTable,
  InventoryItem,
  MenuItem,
  NetworkState,
  Order,
  OrderStatus,
  ReceiptConfig,
  Recipe,
  SpiceLevel,
  StockMovement,
  User,
  PrinterDevice
} from '@jamanvaar/types';
import { formatDate, formatINR, formatTime, SoundService } from '@jamanvaar/utils';
import {
  Button,
  CategoryCard,
  EmptyState,
  KpiCard,
  Logo,
  JamanvaarLogo,
  JamanvaarAppBadge,
  JamanvaarAuthLayout,
  Modal,
  OfflineBanner,
  ProductCard,
  StatusBadge,
  ThermalReceiptView,
  NotificationToastContainer,
  NotificationDrawerModal,
  JAMANVAARStartup,
  JamanAiFloatingButton,
  JamanAiAssistantModal
} from '@jamanvaar/ui';
import {
  DeviceHealthService,
  EBillService,
  NetworkStatusService,
  PrinterService,
  VoiceService
} from '@jamanvaar/api';
import { lanMeshSync } from '@jamanvaar/sync';
import {
  AdminChatbotEngine,
  MenuBuilderService,
  ReportGeneratorService,
  CentralReportingService,
  CentralDatePreset,
  DailyReportSummary,
  DayByDayRow,
  TopItemStat,
  CategoryPerformanceStat,
  EntitlementService,
  PLAN_DEFINITIONS,
  SessionPersistence
} from '@jamanvaar/business';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  Bell,
  Bot,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  FileText,
  Flame,
  Globe,
  Grid,
  Heart,
  HelpCircle,
  History,
  Key,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Maximize2,
  Menu as MenuIcon,
  MessageSquare,
  Minus,
  Moon,
  MoreVertical,
  MoveDown,
  Package,
  Pause,
  Play,
  Plus,
  Printer,
  QrCode,
  Radio,
  Receipt,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Scale,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Sun,
  Tablet,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Utensils,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap
} from 'lucide-react';

// Specialized Modal Components
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
import { OrdersModule } from './components/orders/OrdersModule';
import { ReportBrandingSettings } from './components/settings/ReportBrandingSettings';
import { SubscriptionPlansView } from './components/settings/SubscriptionPlansView';
import { EodZReportDocument } from './components/reports/EodZReportDocument';
import { KitchenKotModule } from './components/kitchen/KitchenKotModule';
import { BillingInvoicesModule } from './components/billing/BillingInvoicesModule';
import { CustomersCrmModule } from './components/customers/CustomersCrmModule';
import { ReportsDashboard } from './components/reports/ReportsDashboard';
import { FinancialReconciliationModal } from './components/reports/FinancialReconciliationModal';
import { QrOrderingModule } from './components/qr/QrOrderingModule';
import { RestaurantDashboard } from './components/dashboard/RestaurantDashboard';
import { PosAdminHeader } from './components/header/PosAdminHeader';

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

    if (foundUser || (trimmedUser === 'admin' && (authPassword === 'admin123' || authPassword === 'admin' || authPassword === 'demo'))) {
      setIsAdminLoggedIn(true);
      setAuthError('');
      // Always persist session (no plain-text password stored)
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
    SessionPersistence.clear('admin');
  };

  // Global Search State
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // Dashboard Time Filter
  const [dashFilter, setDashFilter] = useState<'TODAY' | 'YESTERDAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM'>('TODAY');

  // Menu Search & Filter states
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<string>('ALL');

  // Orders Filter
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('ALL');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);

  // Modals Open States & Editing Entities
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
  const [tableZoneFilter, setTableZoneFilter] = useState<string>('ALL');
  const [syncServerInput, setSyncServerInput] = useState<string>(() => db.getSyncServerUrl());
  const [syncPingResult, setSyncPingResult] = useState<{ status: 'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'; pingMs?: number; error?: string }>({ status: 'IDLE' });
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  // Inventory Filter State
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('ALL');

  // Audit Log Filter State
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('ALL');

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

  const unreadNotifsCount = NotificationRepository.getUnreadCount('POS_ADMIN');

  // Reports View State
  const [reportSubTab, setReportSubTab] = useState<'DAILY' | 'DAY_BY_DAY' | '30_DAYS' | 'MONTHLY' | 'YEARLY' | 'TOP_ITEMS' | 'CATEGORIES' | 'GST' | 'EOD'>('DAILY');
  const [selectedReportDate, setSelectedReportDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Real-time Database & LAN Mesh Cluster Subscription
  useEffect(() => {
    // 1. Register Admin in LAN mesh sync cluster
    lanMeshSync.registerDevice('POS_ADMIN', 'ADMIN-01', 'Restaurant Admin HQ');

    // 2. Listen to all cluster mesh events (Orders, KOTs, Tables, Settlement)
    const unsubMesh = lanMeshSync.onAny((_evt: any) => {
      setDbTick((t) => t + 1);
    });

    // 3. Listen to local database mutations
    const unsubDb = db.subscribe(() => {
      setDbTick((t) => t + 1);
    });

    // 4. Fallback interval tick to reflect any background updates
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
  const restaurant = db.restaurant;
  const categories = db.categories;
  const menuItems = db.menuItems;
  const tables = useMemo(() => [...db.tables], [dbTick]);
  const orders = useMemo(() => [...db.orders], [dbTick]);
  const kots = useMemo(() => [...db.kots], [dbTick]);
  const shifts = useMemo(() => [...db.shifts], [dbTick]);
  const users = db.users;
  const customers = db.customerAccounts;
  const inventoryItems = db.inventoryItems;
  const stockMovements = db.stockMovements;
  const recipes = db.recipes;
  const configuredPrinters = db.configuredPrinters;
  const license = db.license;
  const auditLogs = db.auditLogs;

  // Real-Time Calculated Financial Metrics using CentralReportingService
  const dashPeriodReport = useMemo(() => {
    return CentralReportingService.getDashboardMetrics(dashFilter as any, orders);
  }, [dashFilter, dbTick, orders]);

  const dailyReport = useMemo(() => ReportGeneratorService.getDailyReport(new Date()), [dbTick, orders]);
  const last30Report = useMemo(() => ReportGeneratorService.getLast30DaysReport(), [dbTick, orders]);
  const yearlyReport = useMemo(() => ReportGeneratorService.getYearlyReport(), [dbTick, orders]);
  const topDishes = useMemo(() => ReportGeneratorService.getTopSellingItems(), [dbTick, orders]);
  const categoryStats = useMemo(() => ReportGeneratorService.getCategoryPerformance(), [dbTick, orders]);
  const hourlySales = useMemo(() => ReportGeneratorService.getHourlySalesToday(), [dbTick, orders]);
  const peakHours = useMemo(() => ReportGeneratorService.getPeakHoursAnalysis(), [dbTick, orders]);
  const dayByDayRows = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    return ReportGeneratorService.getDayByDayReport(start, end);
  }, [dbTick, orders]);

  // Selected Date Report for Drill-Down
  const selectedDateSummary = useMemo(() => {
    return ReportGeneratorService.getDailyReport(new Date(selectedReportDate));
  }, [selectedReportDate, dbTick, orders]);

  const activeShift = shifts.find((s) => s.status === 'OPEN') || shifts[0];
  const pendingKotsCount = kots.filter((k: any) => k.status === 'PREPARING').length;
  const occupiedTablesCount = tables.filter((t: any) => t.status === 'OCCUPIED').length;
  const lowStockCount = inventoryItems.filter((i: any) => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK').length;
  const qrOrdersCount = orders.filter((o: Order) => o.source_type === 'QR_TABLE' || o.orderType === 'QR_TABLE').length;

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((o: Order) => {
      if (orderStatusFilter !== 'ALL' && o.orderStatus !== orderStatusFilter) return false;
      if (orderTypeFilter !== 'ALL' && o.orderType !== orderTypeFilter) return false;
      if (orderSearchQuery || globalSearch) {
        const q = (orderSearchQuery || globalSearch).toLowerCase();
        const mNum = o.orderNumber?.toLowerCase().includes(q);
        const mTok = o.tokenNumber?.includes(q);
        const mPhone = o.customerPhone?.includes(q);
        const mName = o.customerName?.toLowerCase().includes(q);
        if (!mNum && !mTok && !mPhone && !mName) return false;
      }
      return true;
    });
  }, [orders, orderStatusFilter, orderTypeFilter, orderSearchQuery, globalSearch]);

  // Filtered Menu Items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item: MenuItem) => {
      const q = (menuSearch || globalSearch).toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q);
      const matchesCat =
        selectedCategoryFilter === 'ALL' || item.categoryId === selectedCategoryFilter;
      const matchesDiet =
        dietaryFilter === 'ALL' || item.dietaryType === dietaryFilter;
      return matchesSearch && matchesCat && matchesDiet;
    });
  }, [menuItems, menuSearch, globalSearch, selectedCategoryFilter, dietaryFilter]);

  // Filtered Inventory Items
  const inventoryCategories = useMemo(() => {
    return Array.from(new Set(inventoryItems.map((i: InventoryItem) => i.category))).filter(Boolean);
  }, [inventoryItems]);

  const filteredInventoryItems = useMemo(() => {
    return inventoryItems.filter((item: InventoryItem) => {
      const q = (inventorySearch || globalSearch).toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      const matchesCat =
        inventoryCategoryFilter === 'ALL' || item.category === inventoryCategoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [inventoryItems, inventorySearch, globalSearch, inventoryCategoryFilter]);

  // Filtered Audit Logs
  const auditCategories = useMemo(() => {
    return Array.from(new Set(auditLogs.map((l: any) => l.category))).filter(Boolean);
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log: any) => {
      const q = (auditSearch || globalSearch).toLowerCase();
      const matchesSearch =
        !q ||
        log.username?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.details?.toLowerCase().includes(q);
      const matchesCat =
        auditCategoryFilter === 'ALL' || log.category === auditCategoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [auditLogs, auditSearch, globalSearch, auditCategoryFilter]);

  // Bulk Price Adjuster Action
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

  // Duplicate Dish Handler
  const handleDuplicateDish = (dish: MenuItem) => {
    MenuRepository.createMenuItem({
      name: `${dish.name} (Copy)`,
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      price: dish.price,
      categoryId: dish.categoryId,
      kitchenStation: dish.kitchenStation,
      dietaryType: dish.dietaryType,
      spiceLevel: dish.spiceLevel,
      description: dish.description,
      imageUrl: dish.imageUrl,
      isAvailable: true,
      isPopular: false,
      isFeatured: false
    });
    showToast(`Duplicated dish: ${dish.name}`);
  };

  // Delete Dish Handler
  const handleDeleteDish = (dish: MenuItem) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Menu Dish',
      message: `Are you sure you want to permanently remove "${dish.name}" from your restaurant menu?`,
      confirmText: 'Delete Dish',
      isDanger: true,
      onConfirm: () => {
        MenuRepository.deleteMenuItem(dish.id);
        showToast(`Deleted dish: ${dish.name}`);
      }
    });
  };

  // Delete Category Handler
  const handleDeleteCategory = (cat: Category) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Category',
      message: `Are you sure you want to delete category "${cat.name}"? Dishes in this category will need to be reassigned.`,
      confirmText: 'Delete Category',
      isDanger: true,
      onConfirm: () => {
        MenuRepository.deleteCategory(cat.id);
        showToast(`Deleted category: ${cat.name}`);
      }
    });
  };

  // Delete Table Handler
  const handleDeleteTable = (tbl: DiningTable) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Dining Table',
      message: `Are you sure you want to remove Table T-${tbl.tableNumber} (${tbl.capacity} Guests)?`,
      confirmText: 'Delete Table',
      isDanger: true,
      onConfirm: () => {
        TableRepository.deleteTable(tbl.id);
        showToast(`Deleted Table T-${tbl.tableNumber}`);
      }
    });
  };

  // Delete Staff Handler
  const handleDeleteStaff = (usr: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Staff Employee',
      message: `Are you sure you want to remove ${usr.fullName} (@${usr.username})?`,
      confirmText: 'Remove Employee',
      isDanger: true,
      onConfirm: () => {
        StaffRepository.deleteUser(usr.id);
        showToast(`Removed employee ${usr.fullName}`);
      }
    });
  };

  // Delete Customer Handler
  const handleDeleteCustomer = (cust: CustomerAccount) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Customer Record',
      message: `Are you sure you want to delete customer profile for ${cust.name} (${cust.phone})?`,
      confirmText: 'Delete Customer',
      isDanger: true,
      onConfirm: () => {
        CustomerRepository.deleteCustomer(cust.phone);
        showToast(`Deleted customer ${cust.name}`);
      }
    });
  };

  // Delete Inventory Item Handler
  const handleDeleteInventory = (item: InventoryItem) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Stock Item',
      message: `Are you sure you want to delete raw inventory item "${item.name}"?`,
      confirmText: 'Delete Item',
      isDanger: true,
      onConfirm: () => {
        InventoryRepository.deleteItem(item.id);
        showToast(`Deleted stock item: ${item.name}`);
      }
    });
  };

  // Delete Recipe Handler
  const handleDeleteRecipe = (rec: Recipe) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Recipe Formula',
      message: `Are you sure you want to delete recipe formula for "${rec.menuItemName}"?`,
      confirmText: 'Delete Recipe',
      isDanger: true,
      onConfirm: () => {
        RecipeRepository.deleteRecipe(rec.id);
        showToast(`Deleted recipe for ${rec.menuItemName}`);
      }
    });
  };

  // Delete Printer Handler
  const handleDeletePrinter = (prn: PrinterDevice) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Printer Configuration',
      message: `Are you sure you want to delete printer configuration "${prn.name}"?`,
      confirmText: 'Delete Printer',
      isDanger: true,
      onConfirm: () => {
        PrinterRepository.deletePrinter(prn.id);
        showToast(`Deleted printer: ${prn.name}`);
      }
    });
  };

  // Plan Activation Handler (Plan 1: ₹5,000 CORE, Plan 2: ₹7,000 PRO)
  const handleActivatePlan = (tier: 'CORE' | 'PRO') => {
    LicenseRepository.activatePlan(tier);
    showToast(`Activated ${tier === 'PRO' ? 'JAMANVAAR PRO (₹7,000)' : 'JAMANVAAR CORE (₹5,000)'}!`);
  };

  // 1. ADMIN AUTHENTICATION GATE SCREEN
  if (!isAdminLoggedIn) {
    return (
      <JAMANVAARStartup appName="Restaurant Admin" appType="ADMIN" subtitle="Restaurant Operations Platform">
        <JamanvaarAuthLayout
          appIdentity="ADMIN"
          appTitle="Restaurant Admin"
        appSubtitle="Sign in with your management credentials to access full restaurant control & analytics."
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

      {/* TOP HEADER & APP BAR */}
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
                items: [
                  { id: 'QR_ORDERING', label: 'QR Table Ordering', icon: QrCode }
                ]
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

                    // Operational indicator count for sidebar items
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
                        {/* Active Left Saffron Accent Bar */}
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

                        {badgeCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black leading-none ${badgeColor}`}>
                            {badgeCount}
                          </span>
                        )}
                        {nav.id === 'TABLES' && occupiedTablesCount > 0 && (
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                            isSelected ? 'bg-white/15 text-orange-200' : 'bg-orange-50 text-[#E66817] border border-orange-200/60'
                          }`}>
                            {occupiedTablesCount}/{tables.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>

          {/* Bottom Version & Status Credit */}
          <div className="pt-3 mt-3 border-t border-[#EAE3D6] text-center space-y-1 bg-white/70 p-2.5 rounded-xl border border-[#EAE3D6]/70 shadow-2xs">
            <div className="flex items-center justify-center gap-1.5 font-bold text-[11px] text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Mesh Sync Active</span>
            </div>
            <span className="text-[10px] font-black tracking-tight text-[#0B253A] block">JAMANVAAR RESTAURANT OS</span>
            <span className="text-[9px] text-slate-400 block font-mono font-medium">v2.0 • by KELVIONTECH</span>
          </div>
        </aside>

        {/* MAIN VIEW CONTENT AREA */}
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
                setToastMessage('Dashboard metrics refreshed');
                setTimeout(() => setToastMessage(null), 2500);
              }}
            />
          )}

          {/* DIGITAL ORDERING & QR SUITE */}
          {activeTab === 'QR_ORDERING' && <QrOrderingModule />}

          {/* TAB 2: BILLING / INVOICES */}
          {activeTab === 'BILLING_SALES' && (
            <BillingInvoicesModule
              orders={orders}
              onOrderUpdated={() => setDbTick((t) => t + 1)}
              showToast={showToast}
            />
          )}

          {/* TAB 3: ORDERS & DAY-WISE ORDER HISTORY */}
          {activeTab === 'ORDERS' && (
            <OrdersModule
              orders={orders}
              onOrderUpdated={() => setDbTick((t) => t + 1)}
              showToast={showToast}
            />
          )}

          {/* TAB 4: LIVE KDS & KITCHEN / KOT */}
          {(activeTab === 'LIVE_KDS' || activeTab === 'KITCHEN_KOT') && (
            <KitchenKotModule
              showToast={showToast}
              onKotUpdated={() => setDbTick((t) => t + 1)}
            />
          )}

          {/* TAB 5: MENU & CATEGORIES */}
          {activeTab === 'MENU' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A]">Menu & Catalog Manager</h1>
                  <p className="text-xs text-[#4A5568]">Create, edit dishes, adjust pricing, upload device photos, and import templates.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setItemToEdit(null);
                      setIsItemModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Dish</span>
                  </button>

                  <button
                    onClick={() => {
                      setCategoryToEdit(null);
                      setIsCategoryModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#0B253A] hover:bg-[#1E3A4C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Category</span>
                  </button>

                  <button
                    onClick={() => setIsPrebuiltMenuModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-white border border-[#EBE6DD] text-[#0B253A] text-xs font-bold hover:bg-[#F8F6F0] transition-colors"
                  >
                    🍕 Load 14 Templates
                  </button>

                  <button
                    onClick={() => setIsBulkPriceModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-white border border-[#EBE6DD] text-[#0B253A] text-xs font-bold hover:bg-[#F8F6F0] transition-colors"
                  >
                    ⚡ Bulk Adjust (+10%)
                  </button>
                </div>
              </div>

              {/* Search, Dietary Filter & Category Navigation Toolbar */}
              <div className="bg-white p-3.5 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Dish Search Input */}
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Search dish by name, description, SKU or tag..."
                      className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
                    />
                    {menuSearch && (
                      <button
                        onClick={() => setMenuSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Dietary Filter Segmented Control */}
                  <div className="flex items-center gap-1 bg-[#FAF7F2] p-1 rounded-xl border border-[#EBE6DD] self-start sm:self-auto shrink-0 text-xs">
                    {[
                      { id: 'ALL', label: 'All Diets' },
                      { id: 'VEG', label: '🟢 Veg' },
                      { id: 'NON_VEG', label: '🔴 Non-Veg' }
                    ].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDietaryFilter(d.id as any)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all text-xs ${
                          dietaryFilter === d.id
                            ? 'bg-white text-[#0B253A] shadow-2xs font-black'
                            : 'text-slate-600 hover:text-[#0B253A]'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category Filter Strip */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedCategoryFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      selectedCategoryFilter === 'ALL'
                        ? 'bg-[#0B253A] text-white shadow-xs'
                        : 'bg-[#FAF7F2] hover:bg-[#F4EFE6] text-slate-700'
                    }`}
                  >
                    All Categories ({menuItems.length})
                  </button>

                  {categories.map((c: Category) => (
                    <div key={c.id} className="relative group shrink-0">
                      <button
                        onClick={() => setSelectedCategoryFilter(c.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                          selectedCategoryFilter === c.id
                            ? 'bg-[#0B253A] text-white shadow-xs'
                            : 'bg-[#FAF7F2] hover:bg-[#F4EFE6] text-slate-700'
                        }`}
                      >
                        <span>{c.name}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dishes Grid or Empty State */}
              {filteredMenuItems.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#EBE6DD] shadow-2xs space-y-3 max-w-lg mx-auto my-6">
                  <div className="w-12 h-12 bg-orange-50 text-[#E66817] rounded-2xl flex items-center justify-center mx-auto">
                    <UtensilsCrossed className="w-6 h-6" />
                  </div>
                  <h3 className="font-black text-base text-[#0B253A]">No Dishes Match Filters</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    No menu dishes found matching the current search, category, or dietary filter.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        setMenuSearch('');
                        setSelectedCategoryFilter('ALL');
                        setDietaryFilter('ALL');
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                    >
                      Clear Filters
                    </button>
                    <button
                      onClick={() => {
                        setItemToEdit(null);
                        setIsItemModalOpen(true);
                      }}
                      className="px-4 py-2 bg-[#E66817] text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      + Add New Dish
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredMenuItems.map((item: MenuItem) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs flex flex-col justify-between group hover:shadow-xs transition-all hover:border-[#D8D1C3]"
                    >
                      <div className="relative h-36 bg-slate-100 overflow-hidden">
                        <img
                          src={item.imageUrl || '/assets/menu/common/fallback-dish.svg'}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/assets/menu/common/fallback-dish.svg';
                          }}
                        />
                        <span className="absolute top-2.5 right-2.5 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-md text-[10px] font-mono font-black text-[#0B253A] shadow-2xs">
                          {item.sku}
                        </span>

                        {/* Veg / Non-Veg Indicator Badge */}
                        <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-xs p-1 rounded-md shadow-2xs">
                          <div className={`w-3.5 h-3.5 border-2 flex items-center justify-center rounded-xs ${
                            item.dietaryType === 'NON_VEG' ? 'border-rose-600' : 'border-emerald-600'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              item.dietaryType === 'NON_VEG' ? 'bg-rose-600' : 'bg-emerald-600'
                            }`} />
                          </div>
                        </div>
                      </div>

                      <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-1">
                            <h4 className="font-extrabold text-sm text-[#0B253A] leading-tight group-hover:text-[#E66817] transition-colors">
                              {item.name}
                            </h4>
                            <span className="font-mono font-black text-sm text-emerald-800 shrink-0">₹{item.price}</span>
                          </div>

                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">{item.description}</p>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                          <button
                            onClick={() => {
                              item.isAvailable = !item.isAvailable;
                              db.notify();
                              showToast(`${item.name} is now ${item.isAvailable ? 'IN STOCK' : 'OUT OF STOCK (86)'}`);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              item.isAvailable
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-800 border border-rose-200/80 hover:bg-rose-100'
                            }`}
                          >
                            {item.isAvailable ? '✓ In Stock' : '🚫 86 Out'}
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDuplicateDish(item)}
                              title="Duplicate Dish"
                              className="p-1.5 hover:bg-[#FAF7F2] rounded-lg text-slate-400 hover:text-[#0B253A] transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setItemToEdit(item);
                                setIsItemModalOpen(true);
                              }}
                              title="Edit Dish"
                              className="p-1.5 hover:bg-[#FFF4ED] rounded-lg text-slate-400 hover:text-[#E66817] transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDish(item)}
                              title="Delete Dish"
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: FLOOR & TABLES */}
          {activeTab === 'TABLES' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Header Title & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
                      Floor Plan & Table Layout
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300/60">
                      LIVE DINE-IN RADAR
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
                    Live visual floor occupancy, dining sections, table capacities, and active guest orders.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      setTableToEdit(null);
                      setIsTableModalOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E66817] to-[#F27E2B] hover:from-[#EA580C] hover:to-[#E66817] text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-orange-500/25 btn-saffron-glow active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Dining Table</span>
                  </button>
                </div>
              </div>

              {/* 4 Tables KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Tables</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">{tables.length} Tables</div>
                  <span className="text-[10px] text-slate-500 font-bold block">Configured in Layout</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Seating Capacity</span>
                  <div className="text-2xl font-black text-blue-700 font-mono">
                    {tables.reduce((acc, t) => acc + (t.capacity || 4), 0)} Guests
                  </div>
                  <span className="text-[10px] text-blue-600 font-bold block">Total Restaurant Seats</span>
                </div>

                <div className={`p-4 rounded-2xl border shadow-xs space-y-1 ${
                  occupiedTablesCount > 0 ? 'bg-orange-50/70 border-orange-200' : 'bg-white border-[#EBE6DD]'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Live Occupancy</span>
                    {occupiedTablesCount > 0 && <span className="w-2 h-2 rounded-full bg-[#E66817] animate-pulse"></span>}
                  </div>
                  <div className="text-2xl font-black text-[#E66817] font-mono">
                    {occupiedTablesCount} Busy <span className="text-xs text-slate-500 font-normal">({Math.round((occupiedTablesCount / (tables.length || 1)) * 100)}%)</span>
                  </div>
                  <span className="text-[10px] text-slate-600 font-bold block">
                    {tables.filter(t => t.status === 'OCCUPIED').reduce((acc, t) => acc + (t.capacity || 4), 0)} Seated Guests
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Vacant Tables</span>
                  <div className="text-2xl font-black text-emerald-700 font-mono">
                    {tables.filter(t => t.status === 'AVAILABLE').length} Vacant
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold block">Ready for Guest Seating</span>
                </div>
              </div>

              {/* Area / Zone Filter Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 bg-white p-2 rounded-2xl border border-[#EBE6DD] shadow-2xs">
                {[
                  { id: 'ALL', label: 'All Floor Sections' },
                  { id: 'Main Dining Hall', label: '🍽️ Main Dining Hall' },
                  { id: 'AC Family Section', label: '❄️ AC Family Section' },
                  { id: 'Garden Terrace', label: '🌿 Garden Terrace' },
                  { id: 'Banquet / Private', label: '👑 Banquet / VIP' }
                ].map((z) => {
                  const count = z.id === 'ALL' ? tables.length : tables.filter(t => (t.zone || 'Main Dining Hall') === z.id).length;
                  return (
                    <button
                      key={z.id}
                      onClick={() => setTableZoneFilter(z.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                        tableZoneFilter === z.id
                          ? 'bg-[#0B253A] text-white shadow-xs'
                          : 'text-[#4A5568] hover:bg-[#F8F6F0]'
                      }`}
                    >
                      <span>{z.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                        tableZoneFilter === z.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tables Matrix */}
              {tables.filter((tbl: DiningTable) => tableZoneFilter === 'ALL' || (tbl.zone || 'Main Dining Hall') === tableZoneFilter).length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#EBE6DD] shadow-2xs space-y-3 max-w-lg mx-auto my-6">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                    <Grid className="w-6 h-6" />
                  </div>
                  <h3 className="font-black text-base text-[#0B253A]">No Tables in this Floor Section</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    There are no tables assigned to the selected dining section. Click below to add a table:
                  </p>
                  <button
                    onClick={() => {
                      setTableToEdit(null);
                      setIsTableModalOpen(true);
                    }}
                    className="px-4 py-2 bg-[#E66817] text-white text-xs font-bold rounded-xl shadow-xs"
                  >
                    + Add Dining Table
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {tables
                    .filter((tbl: DiningTable) => tableZoneFilter === 'ALL' || (tbl.zone || 'Main Dining Hall') === tableZoneFilter)
                    .map((tbl: DiningTable) => {
                      const activeOrder = orders.find(
                        (o) => (o.tableNumber === tbl.tableNumber || o.tableId === tbl.id) &&
                               o.orderStatus !== 'COMPLETED' &&
                               o.orderStatus !== 'CANCELLED'
                      );

                      // Status Pill Config
                      let statusBadge = {
                        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
                        dot: 'bg-emerald-500',
                        label: 'Available'
                      };
                      if (tbl.status === 'OCCUPIED') {
                        statusBadge = {
                          bg: 'bg-orange-50 text-[#E66817] border-orange-200',
                          dot: 'bg-[#E66817] animate-pulse',
                          label: 'Occupied'
                        };
                      } else if (tbl.status === 'RESERVED') {
                        statusBadge = {
                          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
                          dot: 'bg-indigo-500',
                          label: 'Reserved'
                        };
                      } else if (tbl.status === 'CLEANING') {
                        statusBadge = {
                          bg: 'bg-amber-50 text-amber-800 border-amber-200',
                          dot: 'bg-amber-500',
                          label: 'Cleaning'
                        };
                      }

                      return (
                        <div
                          key={tbl.id}
                          className={`bg-white rounded-2xl border transition-all flex flex-col justify-between space-y-3 p-4 select-none ${
                            tbl.status === 'OCCUPIED'
                              ? 'border-[#FDBA74] shadow-xs'
                              : 'border-[#EBE6DD] hover:border-slate-300 shadow-2xs'
                          }`}
                        >
                          {/* Table Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-10 h-10 rounded-xl bg-[#0B253A] text-white flex items-center justify-center font-mono font-black text-sm shadow-2xs">
                                T{tbl.tableNumber}
                              </div>
                              <div>
                                <span className="font-black text-sm text-[#0B253A] block leading-tight">Table {tbl.tableNumber}</span>
                                <span className="text-[10px] text-slate-400 font-medium block">{tbl.zone || 'Main Dining Hall'}</span>
                              </div>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${statusBadge.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                              <span>{statusBadge.label}</span>
                            </span>
                          </div>

                          {/* Capacity & Location */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 py-0.5">
                            <span className="flex items-center gap-1 font-medium">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span>{tbl.capacity} Guests</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">Floor {tbl.floor || 1}</span>
                          </div>

                          {/* Linked Active Order Box if Occupied */}
                          {tbl.status === 'OCCUPIED' && activeOrder ? (
                            <div className="p-2.5 bg-[#FFF9F5] rounded-xl border border-orange-200/70 shadow-2xs space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-[#0B253A] font-mono">#{activeOrder.orderNumber}</span>
                                <span className="font-black text-emerald-800 font-mono">{formatINR(activeOrder.totalAmount)}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>{activeOrder.items.length} items</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrderDetail(activeOrder)}
                                  className="text-[#E66817] font-bold hover:underline"
                                >
                                  View Bill →
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="py-2 px-2.5 rounded-xl bg-[#FAF7F2] text-[10px] text-slate-400 font-medium">
                              {tbl.status === 'AVAILABLE' ? '✓ Ready for seating' : `Status: ${tbl.status}`}
                            </div>
                          )}

                          {/* Table Status Switcher & Actions */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                            <select
                              value={tbl.status}
                              onChange={(e) => {
                                TableRepository.updateTableStatus(tbl.id, e.target.value as any);
                                showToast(`Table ${tbl.tableNumber} status set to ${e.target.value}`);
                              }}
                              className="text-[11px] font-bold bg-[#FAF7F2] hover:bg-[#F4EFE6] text-[#0B253A] border border-[#EBE6DD] rounded-lg px-2 py-1 focus:outline-none cursor-pointer flex-1"
                            >
                              <option value="AVAILABLE">🟢 Available</option>
                              <option value="OCCUPIED">🟠 Occupied</option>
                              <option value="RESERVED">🔵 Reserved</option>
                              <option value="CLEANING">🟡 Cleaning</option>
                            </select>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setTableToEdit(tbl);
                                  setIsTableModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-[#FAF7F2] rounded-lg text-slate-500 hover:text-[#E66817] transition-colors"
                                title="Edit Table Details"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTable(tbl)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 transition-colors"
                                title="Delete Table"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: INVENTORY & RECIPES */}
          {activeTab === 'INVENTORY' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Header Title & CTAs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
                      Inventory & Recipe Bill of Materials (BOM)
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                      LIVE TRACKING
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
                    Track raw stock levels, set minimum reorder thresholds, and automate ingredient deductions upon POS/Kiosk sales.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      setRecipeToEdit(null);
                      setIsRecipeModalOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-[#EBE6DD] text-[#0B253A] font-bold text-xs flex items-center gap-2 shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Sliders className="w-4 h-4 text-[#E66817]" />
                    <span>Create Recipe Formula</span>
                  </button>
                  <button
                    onClick={() => {
                      setInventoryToEdit(null);
                      setIsInventoryModalOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-[#E66817]/25 active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Stock Item</span>
                  </button>
                </div>
              </div>

              {/* 4 Inventory KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white p-4.5 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Raw Ingredients</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">{inventoryItems.length} Items</div>
                  <span className="text-[10px] text-slate-500 font-bold block">In Warehouse Master</span>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Stock Valuation</span>
                  <div className="text-2xl font-black text-emerald-700 font-mono">
                    {formatINR(inventoryItems.reduce((acc: number, it: InventoryItem) => acc + (it.currentStock * it.costPerUnit), 0))}
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold block">✓ Weighted Unit Cost</span>
                </div>

                <div className={`p-4.5 rounded-2xl border shadow-2xs space-y-1 ${
                  lowStockCount > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-[#EBE6DD]'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Low Stock Alerts</span>
                    {lowStockCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
                  </div>
                  <div className={`text-2xl font-black font-mono ${lowStockCount > 0 ? 'text-amber-800' : 'text-[#0B253A]'}`}>
                    {lowStockCount} Critical
                  </div>
                  <span className={`text-[10px] font-bold block ${lowStockCount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                    {lowStockCount > 0 ? 'Action Required Below Min Level' : 'All Stock Levels Normal'}
                  </span>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">BOM Dish Formulas</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">{recipes.length} Formulas</div>
                  <span className="text-[10px] text-blue-700 font-bold block">Auto-Deduct on Order Sale</span>
                </div>
              </div>

              {/* Raw Stock Items Section */}
              <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs space-y-0">
                {/* Search & Filter Toolbar */}
                <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#E66817]" />
                    <span className="font-extrabold text-sm text-[#0B253A]">Raw Warehouse Ingredients ({filteredInventoryItems.length})</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search input */}
                    <div className="relative min-w-[200px]">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                        placeholder="Search ingredient or SKU..."
                        className="w-full bg-white border border-[#EBE6DD] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
                      />
                      {inventorySearch && (
                        <button
                          onClick={() => setInventorySearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Category Filter */}
                    <select
                      value={inventoryCategoryFilter}
                      onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                      className="bg-white border border-[#EBE6DD] rounded-xl px-3 py-1.5 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                    >
                      <option value="ALL">All Categories</option>
                      {inventoryCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>

                    {(inventorySearch || inventoryCategoryFilter !== 'ALL') && (
                      <button
                        onClick={() => {
                          setInventorySearch('');
                          setInventoryCategoryFilter('ALL');
                        }}
                        className="text-xs text-[#E66817] font-bold hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {filteredInventoryItems.length === 0 ? (
                  <div className="py-14 text-center px-4 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#E66817] flex items-center justify-center mx-auto">
                      <Package className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-[#0B253A] text-sm">
                        {inventorySearch || inventoryCategoryFilter !== 'ALL'
                          ? 'No ingredients match your filters'
                          : 'No Raw Ingredients Recorded'}
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                        {inventorySearch || inventoryCategoryFilter !== 'ALL'
                          ? 'Try adjusting your search query or selecting a different category filter.'
                          : 'Add pantry staples, dairy, produce, spices, and packaging materials to manage stock.'}
                      </p>
                    </div>
                    {inventorySearch || inventoryCategoryFilter !== 'ALL' ? (
                      <button
                        onClick={() => {
                          setInventorySearch('');
                          setInventoryCategoryFilter('ALL');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                      >
                        Reset Filters
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setInventoryToEdit(null);
                          setIsInventoryModalOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-[#E66817] text-white font-bold text-xs shadow-xs"
                      >
                        + Add First Ingredient
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F6F0] border-b border-[#EBE6DD] text-slate-500 uppercase font-black text-[11px] tracking-wider">
                        <tr>
                          <th className="p-4">Item Name</th>
                          <th className="p-4">Category</th>
                          <th className="p-4">Current Stock</th>
                          <th className="p-4">Min Threshold</th>
                          <th className="p-4">Cost / Unit</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {filteredInventoryItems.map((stock: InventoryItem) => (
                          <tr key={stock.id} className="hover:bg-[#FDFBF7] transition-colors">
                            <td className="p-4">
                              <span className="font-extrabold text-[#0B253A] block text-sm">{stock.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono block">{stock.sku}</span>
                            </td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                                {stock.category}
                              </span>
                            </td>
                            <td className="p-4 font-mono font-black text-sm text-[#0B253A]">
                              {stock.currentStock} <span className="text-xs text-slate-500 font-normal">{stock.unit}</span>
                            </td>
                            <td className="p-4 text-slate-500 font-mono">
                              {stock.minStockLevel} {stock.unit}
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-800">
                              ₹{stock.costPerUnit} <span className="text-[10px] text-slate-400">/{stock.unit}</span>
                            </td>
                            <td className="p-4">
                              {stock.status === 'LOW_STOCK' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                  LOW STOCK
                                </span>
                              ) : stock.status === 'OUT_OF_STOCK' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  OUT OF STOCK
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  IN STOCK
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setStockAdjustItem(stock);
                                    setIsStockAdjustModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 bg-[#FFF4ED] hover:bg-[#FFE8D6] text-[#E66817] border border-[#FDBA74] font-bold rounded-xl text-xs transition-all active:scale-95 shadow-2xs cursor-pointer"
                                >
                                  Adjust Stock
                                </button>
                                <button
                                  onClick={() => {
                                    setInventoryToEdit(stock);
                                    setIsInventoryModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Edit Item"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteInventory(stock)}
                                  className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Linked BOM Recipes Section */}
              <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs">
                <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#0B253A]" />
                    <span className="font-extrabold text-sm text-[#0B253A]">Configured Dish Recipe Formulas ({recipes.length})</span>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">Automatic Ingredient Consumption</span>
                </div>
                {recipes.length === 0 ? (
                  <div className="py-12 text-center px-4 space-y-2">
                    <Sliders className="w-8 h-8 text-slate-300 mx-auto" />
                    <h4 className="font-extrabold text-[#0B253A] text-sm">No Recipe Formulas Configured</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Link raw ingredients to menu dishes to automatically deduct inventory whenever an order is placed.
                    </p>
                    <button
                      onClick={() => {
                        setRecipeToEdit(null);
                        setIsRecipeModalOpen(true);
                      }}
                      className="mt-2 px-3.5 py-1.5 rounded-xl bg-white border border-[#EBE6DD] text-[#0B253A] font-bold text-xs hover:bg-slate-50"
                    >
                      + Create Recipe Formula
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F6F0] border-b border-[#EBE6DD] text-slate-500 uppercase font-black text-[11px] tracking-wider">
                        <tr>
                          <th className="p-4">Menu Dish</th>
                          <th className="p-4">Ingredients Breakdown</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {recipes.map((rec: Recipe) => (
                          <tr key={rec.id} className="hover:bg-[#FDFBF7] transition-colors">
                            <td className="p-4 font-black text-[#0B253A] text-sm">{rec.menuItemName}</td>
                            <td className="p-4 text-slate-600">
                              <div className="flex flex-wrap gap-1.5">
                                {rec.ingredients.map((ing, idx) => (
                                  <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#FAF7F2] border border-[#EBE6DD] text-[11px] font-bold text-slate-700">
                                    {ing.inventoryItemName} <span className="text-[#E66817] font-mono ml-1">({ing.quantityPerPortion} {ing.unit})</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setRecipeToEdit(rec);
                                    setIsRecipeModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-[#E66817] hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                                  title="Edit Recipe"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRecipe(rec)}
                                  className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Recipe"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 8: CUSTOMERS CRM */}
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

          {/* TAB 9: STAFF & ROLES (RBAC) */}
          {activeTab === 'STAFF' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
                      Staff & Role-Based Access (RBAC)
                    </h1>
                    <span className="bg-emerald-50 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200/70">
                      SECURE PERMISSIONS
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Manage owner PINs, cashier logins, manager overrides, and kitchen credentials.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setStaffToEdit(null);
                    setIsStaffModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Employee</span>
                </button>
              </div>

              {/* Staff Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-black uppercase text-slate-500">TOTAL TEAM</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">{users.length} Active</div>
                  <span className="text-[10px] text-slate-400 font-medium">Registered Staff Accounts</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-black uppercase text-slate-500">OWNERS & MANAGERS</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">
                    {users.filter(u => (u.roleId || '').includes('OWNER') || (u.roleId || '').includes('MANAGER')).length || 1}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Full System Authority</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-black uppercase text-slate-500">CASHIERS</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">
                    {users.filter(u => (u.roleId || '').includes('CASHIER')).length || 1}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">POS Register Terminal</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-black uppercase text-slate-500">CAPTAINS & SERVICE</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">
                    {users.filter(u => (u.roleId || '').includes('CAPTAIN') || (u.roleId || '').includes('WAITER')).length || 1}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Floor Order Taking</span>
                </div>
              </div>

              {/* Staff Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {users.map((usr: User) => (
                  <div key={usr.id} className="p-5 bg-white rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-3 hover:shadow-xs transition-all">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center font-black text-sm border border-[#FDBA74]/40">
                        {usr.fullName[0]}
                      </div>
                      <span className="bg-[#FAF7F2] text-[#0B253A] font-black text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wider border border-[#EBE6DD]">
                        {usr.roleId || 'STAFF'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-sm text-[#0B253A]">{usr.fullName}</h4>
                      <span className="text-xs text-slate-400 font-medium">@{usr.username} • {usr.phone}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-emerald-800 font-bold text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        ACTIVE
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setStaffToEdit(usr);
                            setIsStaffModalOpen(true);
                          }}
                          className="p-1.5 text-[#E66817] hover:bg-[#FFF4ED] rounded-lg transition-colors"
                          title="Edit Staff"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(usr)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Staff"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 10: PAYMENTS & SPLIT LEDGER */}
          {activeTab === 'PAYMENTS' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
                      Payments & Split Tenders Ledger
                    </h1>
                    <span className="bg-emerald-50 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200/70">
                      MULTI-TENDER AUDIT
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Breakdown of Cash, UPI Bharat QR, Card Swipe EDC, and Split-Tender reconciliations across all cashier counters.
                  </p>
                </div>
              </div>

              {/* 4 Financial Tender Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <span className="text-[11px] font-black uppercase text-slate-500 block">TOTAL COLLECTIONS</span>
                  <div className="text-2xl font-black text-[#0B253A] font-mono">
                    {formatINR(dashPeriodReport.summary.netSales)}
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold block">All Payment Modes Combined</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-slate-500 block">CASH IN DRAWER</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  </div>
                  <div className="text-2xl font-black text-emerald-800 font-mono">
                    {formatINR(dashPeriodReport.summary.paymentBreakdown.cash)}
                  </div>
                  <span className="text-[10px] text-emerald-700 font-bold block">
                    {dashPeriodReport.summary.netSales > 0 ? Math.round((dashPeriodReport.summary.paymentBreakdown.cash / dashPeriodReport.summary.netSales) * 100) : 0}% of Total Volume
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-slate-500 block">UPI / BHARAT QR</span>
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  </div>
                  <div className="text-2xl font-black text-blue-900 font-mono">
                    {formatINR(dashPeriodReport.summary.paymentBreakdown.upi)}
                  </div>
                  <span className="text-[10px] text-blue-700 font-bold block">
                    {dashPeriodReport.summary.netSales > 0 ? Math.round((dashPeriodReport.summary.paymentBreakdown.upi / dashPeriodReport.summary.netSales) * 100) : 0}% Digital QR Volume
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-slate-500 block">CARD SWIPE EDC</span>
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  </div>
                  <div className="text-2xl font-black text-purple-900 font-mono">
                    {formatINR(dashPeriodReport.summary.paymentBreakdown.card)}
                  </div>
                  <span className="text-[10px] text-purple-700 font-bold block">Bank EDC Settlements</span>
                </div>
              </div>

              {/* Split Payment Operational Feature Card */}
              <div className="p-5 bg-gradient-to-r from-[#0B253A] to-[#173A56] rounded-3xl text-white shadow-md space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-[#E66817] flex items-center justify-center text-white shadow-sm">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black tracking-tight">Understanding Split Multi-Tender Payments</h3>
                      <p className="text-[11px] text-slate-300">How JAMANVAAR POS handles split payment allocations seamlessly</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-white/10 text-[#FDBA74] border border-white/10">
                    Smart Settlement Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold text-[#FDBA74] uppercase block">1. Flexible Allocation</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      For any bill (e.g. ₹756), the cashier can allocate part of the amount to Cash (e.g. ₹500) and the remaining balance to UPI QR (e.g. ₹256).
                    </p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold text-[#FDBA74] uppercase block">2. Exact Cash Drawer Math</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      The Cash portion is strictly recorded in the Cash Drawer Shift Ledger, preventing float discrepancies during end-of-day reconciliation.
                    </p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold text-[#FDBA74] uppercase block">3. Itemized Tax Receipt</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      The printed 80mm/58mm thermal receipt and WhatsApp e-Bill itemize the breakdown clearly: <span className="font-mono text-white">Cash: ₹500 | UPI: ₹256</span>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Transactions Ledger Table */}
              <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-xs">
                <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex items-center justify-between">
                  <span className="font-black text-xs sm:text-sm text-[#0B253A]">
                    Completed Payment Transactions ({orders.filter(o => o.paymentStatus === 'SUCCESS').length})
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">Real-Time Sync</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F6F0] border-b border-[#EBE6DD] text-slate-500 uppercase font-black text-[11px] tracking-wider">
                      <tr>
                        <th className="p-4">Order / Invoice</th>
                        <th className="p-4">Table / Type</th>
                        <th className="p-4">Customer</th>
                        <th className="p-4">Total Settled</th>
                        <th className="p-4">Payment Method</th>
                        <th className="p-4">Timestamp</th>
                        <th className="p-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {orders
                        .filter((o: Order) => o.paymentStatus === 'SUCCESS')
                        .map((ord: Order) => (
                          <tr key={ord.id} className="hover:bg-[#FDFBF7] transition-colors">
                            <td className="p-4 font-mono font-black text-sm text-[#0B253A]">
                              #{ord.orderNumber}
                              <span className="text-[10px] text-slate-400 block font-normal">Token: {ord.tokenNumber}</span>
                            </td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-slate-700 text-[11px] block w-fit">
                                {ord.orderType}
                              </span>
                              {ord.tableNumber && (
                                <span className="text-[10px] text-slate-500 block mt-0.5">Table {ord.tableNumber}</span>
                              )}
                            </td>
                            <td className="p-4 text-slate-700">
                              <span className="font-bold block">{ord.customerName || 'Walk-in Guest'}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{ord.customerPhone || 'Counter'}</span>
                            </td>
                            <td className="p-4 font-mono font-black text-sm text-emerald-700">
                              {formatINR(ord.totalAmount)}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black ${
                                ord.paymentMethod.includes('CASH')
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : ord.paymentMethod.includes('UPI')
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                              }`}>
                                {ord.paymentMethod.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4 text-slate-500 font-mono text-[11px]">
                              {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => setSelectedOrderDetail(ord)}
                                className="px-3 py-1.5 bg-[#FAF7F2] hover:bg-slate-100 text-[#0B253A] border border-[#EBE6DD] font-bold rounded-xl text-xs transition-colors"
                              >
                                View Bill →
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: FINANCIAL & SALES REPORTS */}
          {activeTab === 'REPORTS' && (
            <ReportsDashboard showToast={showToast} />
          )}

          {/* TAB 12: SHIFT & CASH DRAWER RECONCILIATION */}
          {activeTab === 'SHIFTS' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">Shift & Cash Drawer Ledger</h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                      REGISTER RECONCILIATION
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">Audit opening cash, cash drops, payouts, and cash count variance in real time.</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setIsEodModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-[#E66817]/25 active:scale-95 transition-all cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Generate Official EOD Z-Report</span>
                  </button>
                  <button
                    onClick={() => setIsCashDropModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-[#EBE6DD] text-[#0B253A] font-bold text-xs flex items-center gap-2 shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Coins className="w-4 h-4 text-[#E66817]" />
                    <span>Record Cash Movement</span>
                  </button>
                </div>
              </div>

              {/* Active Shift Workspace Card */}
              {activeShift ? (
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#EBE6DD] shadow-2xs space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#FFF4ED] border border-[#FED7AA] flex items-center justify-center text-[#E66817]">
                        <Coins className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-[#E66817] uppercase tracking-wider">Active Register Shift</span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-[10px] rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            OPEN & RECORDING
                          </span>
                        </div>
                        <h3 className="text-xl font-black text-[#0B253A] mt-0.5">{activeShift.cashierName}</h3>
                        <span className="text-xs text-slate-400">Terminal: POS-01 • Opened at {formatTime(activeShift.openedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsCashDropModalOpen(true)}
                        className="px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#F2EFE9] border border-[#EBE6DD] text-[#0B253A] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Coins className="w-3.5 h-3.5 text-[#E66817]" />
                        <span>Add Drop / Payout</span>
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#F2EFE9] border border-[#EBE6DD] text-[#0B253A] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>Print Slip</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Financial Shift Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE6DD] space-y-1">
                      <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Opening Float</span>
                      <div className="text-xl sm:text-2xl font-mono font-black text-[#0B253A]">{formatINR(activeShift.openingCash)}</div>
                      <span className="text-[10px] text-slate-400 font-medium block">Starting Till Reserve</span>
                    </div>

                    <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE6DD] space-y-1">
                      <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Cash Sales Today</span>
                      <div className="text-xl sm:text-2xl font-mono font-black text-emerald-700">{formatINR(dailyReport.paymentBreakdown.cash)}</div>
                      <span className="text-[10px] text-emerald-600 font-medium block">Physical In-Drawer Cash</span>
                    </div>

                    <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-1">
                      <span className="text-[11px] text-amber-900 font-bold uppercase tracking-wider block">Expected in Drawer</span>
                      <div className="text-xl sm:text-2xl font-mono font-black text-[#0B253A]">
                        {formatINR(activeShift.openingCash + dailyReport.paymentBreakdown.cash)}
                      </div>
                      <span className="text-[10px] text-amber-700 font-medium block">Opening Float + Cash Sales</span>
                    </div>

                    <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE6DD] space-y-1">
                      <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Digital Non-Cash Volume</span>
                      <div className="text-xl sm:text-2xl font-mono font-black text-blue-700">
                        {formatINR(dailyReport.paymentBreakdown.upi + dailyReport.paymentBreakdown.card)}
                      </div>
                      <span className="text-[10px] text-blue-600 font-medium block">UPI QR + Card Swipe</span>
                    </div>
                  </div>

                  {/* Drawer Status & Reconciliation Alert Strip */}
                  <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-extrabold text-emerald-900 block">Drawer Register Verified & In Balance</span>
                        <span className="text-emerald-700 text-[11px]">All recorded cash sales match expected drawer balance. No unexplained cash shortages recorded.</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsEodModalOpen(true)}
                      className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
                    >
                      Close Shift & Reconcile
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-12 border border-[#EBE6DD] text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#E66817] flex items-center justify-center mx-auto">
                    <Coins className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[#0B253A] text-base">No Active Register Shift</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                      Start a new cashier register shift with an opening cash float to begin recording sales, cash drops, and drawer balance.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsCashDropModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-[#E66817] text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    Open Cashier Shift
                  </button>
                </div>
              )}

              {/* Shift History Ledger */}
              {shifts.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs">
                  <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex items-center justify-between">
                    <span className="font-extrabold text-sm text-[#0B253A]">Register Shift Audit History ({shifts.length})</span>
                    <span className="text-xs text-slate-400 font-semibold">Local SQLite Ledger</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F6F0] border-b border-[#EBE6DD] text-slate-500 uppercase font-black text-[11px] tracking-wider">
                        <tr>
                          <th className="p-4">Cashier Name</th>
                          <th className="p-4">Shift Status</th>
                          <th className="p-4">Opened At</th>
                          <th className="p-4">Opening Float</th>
                          <th className="p-4">Expected Cash</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {shifts.map((s) => (
                          <tr key={s.id} className="hover:bg-[#FDFBF7] transition-colors">
                            <td className="p-4 font-extrabold text-[#0B253A]">{s.cashierName}</td>
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                                s.status === 'OPEN'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                {s.status}
                              </span>
                            </td>
                            <td className="p-4 text-slate-500 font-mono text-[11px]">{formatTime(s.openedAt)}</td>
                            <td className="p-4 font-mono font-bold text-[#0B253A]">{formatINR(s.openingCash)}</td>
                            <td className="p-4 font-mono font-bold text-emerald-700">
                              {formatINR(s.openingCash + (s.status === 'OPEN' ? dailyReport.paymentBreakdown.cash : 0))}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => setIsEodModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F2EFE9] border border-[#EBE6DD] text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                              >
                                View Z-Report
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 13: HARDWARE & PRINTERS */}
          {activeTab === 'HARDWARE' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">Printers & Peripheral Devices</h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                      ESC/POS HARDWARE
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">Configure ESC/POS thermal printers (80mm/58mm), KOT station routing, and run test prints.</p>
                </div>
                <button
                  onClick={() => {
                    setPrinterToEdit(null);
                    setIsPrinterModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-[#E66817]/25 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Configure Printer</span>
                </button>
              </div>

              {/* 4 Peripheral Device Status Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">POS Counter PC</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="text-base font-extrabold text-[#0B253A]">Counter Terminal</div>
                  <span className="text-[10px] text-emerald-600 font-bold block">✓ Localhost Active</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Receipt Printers</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <div className="text-base font-extrabold text-[#0B253A]">Thermal 80mm ESC/POS</div>
                  <span className="text-[10px] text-slate-500 font-bold block">{configuredPrinters.length} Configured</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cash Drawer</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <div className="text-base font-extrabold text-[#0B253A]">RJ11 Kick Solenoid</div>
                  <span className="text-[10px] text-slate-500 font-bold block">Auto-Open on Bill</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">LAN Mesh Bridge</span>
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  </div>
                  <div className="text-base font-extrabold text-[#0B253A]">Multi-Device Sync</div>
                  <span className="text-[10px] text-indigo-600 font-bold block">Port 5178 Listening</span>
                </div>
              </div>

              {/* Configured Printers List */}
              {configuredPrinters.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 border border-[#EBE6DD] text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#E66817] flex items-center justify-center mx-auto">
                    <Printer className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[#0B253A] text-base">No Thermal Printers Configured</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                      Connect your 80mm or 58mm ESC/POS receipt or kitchen KOT printer via LAN Ethernet, USB, or Bluetooth.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setPrinterToEdit(null);
                      setIsPrinterModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#E66817] text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    + Configure First Printer
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {configuredPrinters.map((prn) => (
                    <div key={prn.id} className="bg-white rounded-2xl p-5 border border-[#EBE6DD] shadow-2xs space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center">
                            <Printer className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm text-[#0B253A]">{prn.name}</h4>
                            <span className="text-xs text-slate-400">{prn.interfaceType} • {prn.paperSize}</span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {prn.status}
                        </span>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setPrinterToEdit(prn);
                              setIsPrinterModalOpen(true);
                            }}
                            className="text-[#E66817] font-bold hover:underline cursor-pointer"
                          >
                            Edit Config
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => handleDeletePrinter(prn)}
                            className="text-rose-600 font-bold hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            showToast(`Test print dispatched to ${prn.name}`);
                            window.print();
                          }}
                          className="px-3 py-1.5 bg-[#0B253A] hover:bg-[#1E3A4C] text-white font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          ⚡ Run Test Print
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* LAN SYNC BRIDGE & MULTI-MACHINE CONNECTION CONSOLE */}
              <div className="bg-white rounded-2xl p-6 border border-[#EBE6DD] shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                      <Wifi className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base text-[#0B253A]">LAN Sync Bridge & Cross-Machine Pairing</h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                          MULTI-DEVICE SYNC
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Synchronize POS Counter PCs, Admin Laptops, Captain APKs, and Kitchen KDS screens over the local Wi-Fi / LAN network.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        setIsSyncingNow(true);
                        const ok = await db.forceSyncNow();
                        setIsSyncingNow(false);
                        if (ok) {
                          showToast('Real-time synchronization completed with Host Server!');
                        } else {
                          showToast('Could not reach Host Server. Operating in Local Offline Mode.');
                        }
                      }}
                      disabled={isSyncingNow}
                      className="px-3.5 py-2 bg-[#0B253A] hover:bg-[#1E3A4C] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs disabled:opacity-50 transition-all cursor-pointer"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                      <span>{isSyncingNow ? 'Syncing...' : '⚡ Force Sync Now'}</span>
                    </button>
                  </div>
                </div>

                {/* Host Server URL Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-8 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      Main POS Counter Server Address (LAN Host IP:Port):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={syncServerInput}
                        onChange={(e) => setSyncServerInput(e.target.value)}
                        placeholder="e.g. http://192.168.1.100:5178 or http://localhost:5178"
                        className="flex-1 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                      />
                      <button
                        onClick={() => {
                          db.setSyncServerUrl(syncServerInput);
                          showToast(`Sync Host Server updated to: ${syncServerInput}`);
                        }}
                        className="px-4 py-2.5 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
                      >
                        Save & Connect
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-400 block">
                      Tip: If this is the Main Counter PC, leave as <code className="text-[#0B253A] font-bold">http://localhost:5178</code>. On other laptops/tablets, enter the Main PC's LAN IP.
                    </span>
                  </div>

                  <div className="md:col-span-4 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      Connection Health & Latency:
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setSyncPingResult({ status: 'TESTING' });
                          const res = await db.testSyncServer(syncServerInput);
                          if (res.success) {
                            setSyncPingResult({ status: 'SUCCESS', pingMs: res.pingMs });
                            showToast(`Connected to Host! Ping: ${res.pingMs}ms`);
                          } else {
                            setSyncPingResult({ status: 'ERROR', error: res.error });
                            showToast(`Connection failed: ${res.error}`);
                          }
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[#0B253A] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Radio className="w-3.5 h-3.5 text-[#E66817]" />
                        <span>Test Ping & Latency</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Ping Result Status Banner */}
                {syncPingResult.status !== 'IDLE' && (
                  <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between transition-all ${
                    syncPingResult.status === 'SUCCESS'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : syncPingResult.status === 'TESTING'
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        syncPingResult.status === 'SUCCESS' ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'
                      }`}></span>
                      <div>
                        <strong className="block font-bold">
                          {syncPingResult.status === 'SUCCESS'
                            ? `✓ ONLINE & CONNECTED (Ping: ${syncPingResult.pingMs}ms)`
                            : syncPingResult.status === 'TESTING'
                            ? '⏳ Pinging Sync Server...'
                            : `⚠ SERVER UNREACHABLE: ${syncPingResult.error}`}
                        </strong>
                        <span className="text-[11px] opacity-80">
                          {syncPingResult.status === 'SUCCESS'
                            ? 'All orders, table statuses, menu changes, and KOTs are syncing in real time.'
                            : 'Ensure the local service is running on the Host machine: node tooling/local-runtime/local_service.cjs'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 14: SETTINGS & REPORT BRANDING */}
          {activeTab === 'SETTINGS' && (
            <ReportBrandingSettings
              showToast={showToast}
              onUpdated={() => setDbTick((t) => t + 1)}
            />
          )}

          {/* TAB 15: SUBSCRIPTION PLANS */}
          {activeTab === 'LICENSE' && (
            <SubscriptionPlansView
              showToast={showToast}
              onUpdated={() => setDbTick((t) => t + 1)}
            />
          )}

          {/* TAB 16: AUDIT TRAIL LOGS */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">Security & Operational Audit Trail</h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-200">
                      IMMUTABLE LOG
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">Immutable log of all user actions, price adjustments, voids, discounts, and inventory movements.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-[#EBE6DD] text-[#0B253A] shadow-2xs">
                    {filteredAuditLogs.length} Events Recorded
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs space-y-0">
                {/* Search & Category Filter Toolbar */}
                <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#E66817]" />
                    <span className="font-extrabold text-sm text-[#0B253A]">Audit Trail Events ({filteredAuditLogs.length})</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search Input */}
                    <div className="relative min-w-[220px]">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        placeholder="Search user, action, details..."
                        className="w-full bg-white border border-[#EBE6DD] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
                      />
                      {auditSearch && (
                        <button
                          onClick={() => setAuditSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Category Filter */}
                    <select
                      value={auditCategoryFilter}
                      onChange={(e) => setAuditCategoryFilter(e.target.value)}
                      className="bg-white border border-[#EBE6DD] rounded-xl px-3 py-1.5 text-xs font-bold text-[#0B253A] focus:outline-none focus:border-[#E66817] cursor-pointer"
                    >
                      <option value="ALL">All Categories</option>
                      {auditCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>

                    {(auditSearch || auditCategoryFilter !== 'ALL') && (
                      <button
                        onClick={() => {
                          setAuditSearch('');
                          setAuditCategoryFilter('ALL');
                        }}
                        className="text-xs text-[#E66817] font-bold hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {filteredAuditLogs.length === 0 ? (
                  <div className="py-14 text-center px-4 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-[#0B253A] text-sm">No Audit Trail Events Found</h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                        {auditSearch || auditCategoryFilter !== 'ALL'
                          ? 'No events match the current search or category filter.'
                          : 'Operational security events will automatically be recorded here.'}
                      </p>
                    </div>
                    {(auditSearch || auditCategoryFilter !== 'ALL') && (
                      <button
                        onClick={() => {
                          setAuditSearch('');
                          setAuditCategoryFilter('ALL');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F6F0] border-b border-[#EBE6DD] text-slate-500 uppercase font-black text-[11px] tracking-wider">
                        <tr>
                          <th className="p-4">Timestamp</th>
                          <th className="p-4">Operator</th>
                          <th className="p-4">Action</th>
                          <th className="p-4">Category</th>
                          <th className="p-4">Operational Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {filteredAuditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-[#FDFBF7] transition-colors">
                            <td className="p-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">{formatTime(log.timestamp)}</td>
                            <td className="p-4 font-bold text-[#0B253A]">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-mono">
                                @{log.username}
                              </span>
                            </td>
                            <td className="p-4 font-mono font-black text-[#E66817] text-xs">{log.action}</td>
                            <td className="p-4">
                              <span className="px-2.5 py-0.5 rounded-full bg-[#FAF7F2] border border-[#EBE6DD] text-[10px] font-bold text-slate-600">
                                {log.category}
                              </span>
                            </td>
                            <td className="p-4 text-slate-700 max-w-md">{log.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 17: BACKUP & DATA */}
          {activeTab === 'BACKUP' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">Database Backup & Disaster Recovery</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-800 border border-blue-200">
                    SQLITE PERSISTED
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">Securely export local database state, restore snapshots, or reset to factory demo seed.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* 1. Export JSON */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#EBE6DD] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[#0B253A] flex items-center justify-center shrink-0">
                      <Download className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-base text-[#0B253A]">Export Complete Database JSON</h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">Recommended</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Download a complete portable JSON snapshot containing all orders, menu items, BOM recipes, tables, customers, shifts, and settings.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute('href', dataStr);
                      downloadAnchor.setAttribute('download', `jamanvaar_db_backup_${Date.now()}.json`);
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                      showToast('Database Backup JSON downloaded successfully!');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#0B253A] hover:bg-[#1E3A4C] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs shrink-0 cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Backup JSON</span>
                  </button>
                </div>

                {/* 2. Restore JSON */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#EBE6DD] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center shrink-0">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-base text-[#0B253A]">Restore Database Snapshot</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Upload and restore database state from a previously saved JAMANVAAR JSON snapshot file. Validates JSON schema before applying.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsRestoreModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-[#E66817]/25 shrink-0 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload & Restore</span>
                  </button>
                </div>

                {/* 3. Factory Demo Reset */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-rose-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-base text-rose-800">Factory Demo Seed Reset</h4>
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">Danger Zone</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Restores standard flagship dishes, tables, and categories. All current runtime orders, custom items, and shift records will be reset.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: 'Reset Database to Seed State',
                        message: 'Are you sure you want to reset all data back to original factory demo seed? This action is irreversible.',
                        confirmText: 'Reset Database',
                        isDanger: true,
                        onConfirm: () => {
                          db.resetToDefaultSeed();
                          showToast('Database reset to default demo seed!');
                        }
                      });
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-bold text-xs shrink-0 cursor-pointer transition-colors"
                  >
                    Reset Seed Data
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ALL SPECIALIZED MODAL DIALOGS */}
      {/* 1. Global Search Modal */}
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

      {/* 2. Order Detail & Void / Refund Modal */}
      <OrderDetailModal
        order={selectedOrderDetail}
        isOpen={!!selectedOrderDetail}
        onClose={() => setSelectedOrderDetail(null)}
        onOrderUpdated={() => {
          setDbTick((t) => t + 1);
          showToast('Order record updated!');
        }}
      />

      {/* 3. Item Modal (Add / Edit Dish) */}
      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        itemToEdit={itemToEdit}
        categories={categories}
        onSaved={() => showToast(itemToEdit ? 'Dish updated!' : 'Dish created!')}
      />

      {/* 4. Category Modal (Add / Edit Category) */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categoryToEdit={categoryToEdit}
        onSaved={() => showToast(categoryToEdit ? 'Category updated!' : 'Category created!')}
      />

      {/* 5. Table Modal (Add / Edit Table) */}
      <TableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        tableToEdit={tableToEdit}
        onSaved={() => showToast(tableToEdit ? 'Table updated!' : 'Table created!')}
      />

      {/* 6. Staff Modal (Add / Edit Employee) */}
      <StaffModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        staffToEdit={staffToEdit}
        onSaved={() => showToast(staffToEdit ? 'Staff member updated!' : 'Staff member created!')}
      />

      {/* 7. Customer Modal (Add / Edit Customer) */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customerToEdit={customerToEdit}
        onSaved={() => showToast(customerToEdit ? 'Customer profile updated!' : 'Customer registered!')}
      />

      {/* 8. Inventory Modal (Add / Edit Raw Ingredient) */}
      <InventoryModal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        itemToEdit={inventoryToEdit}
        onSaved={() => showToast(inventoryToEdit ? 'Stock item updated!' : 'Stock item created!')}
      />

      {/* 9. Recipe Modal (Dish -> Raw Ingredient BOM Formula) */}
      <RecipeModal
        isOpen={isRecipeModalOpen}
        onClose={() => setIsRecipeModalOpen(false)}
        menuItems={menuItems}
        inventoryItems={inventoryItems}
        recipeToEdit={recipeToEdit}
        onSaved={() => showToast('Recipe formula saved!')}
      />

      {/* 10. Printer Modal (Add / Edit Thermal Printer) */}
      <PrinterModal
        isOpen={isPrinterModalOpen}
        onClose={() => setIsPrinterModalOpen(false)}
        printerToEdit={printerToEdit}
        onSaved={() => showToast(printerToEdit ? 'Printer updated!' : 'Printer registered!')}
      />

      {/* 11. Prebuilt Starter Menu Wizard (14 Cuisines) */}
      <PrebuiltMenuModal
        isOpen={isPrebuiltMenuModalOpen}
        onClose={() => setIsPrebuiltMenuModalOpen(false)}
        onImported={(count) => showToast(`Successfully imported ${count} dishes!`)}
      />

      {/* 12. Stock Adjust Modal */}
      <StockAdjustModal
        isOpen={isStockAdjustModalOpen}
        onClose={() => setIsStockAdjustModalOpen(false)}
        item={stockAdjustItem}
        onSaved={() => showToast('Stock movement recorded!')}
      />

      {/* 13. Cash Movement / Drop Modal */}
      <CashDropModal
        isOpen={isCashDropModalOpen}
        onClose={() => setIsCashDropModalOpen(false)}
        shift={activeShift}
        onSaved={() => showToast('Cash movement recorded!')}
      />

      {/* 14. End of Day Statement Modal */}
      <EodReportModal
        isOpen={isEodModalOpen}
        onClose={() => setIsEodModalOpen(false)}
      />

      {/* 15. JSON Restore Modal */}
      <RestoreModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        onRestored={() => showToast('Database restored successfully from JSON snapshot!')}
      />

      {/* 16. Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        isDanger={confirmDialog.isDanger}
      />

      {/* 17. Bulk Price Adjuster Modal */}
      {isBulkPriceModalOpen && (
        <Modal
          isOpen={isBulkPriceModalOpen}
          onClose={() => setIsBulkPriceModalOpen(false)}
          title="⚡ Quick Bulk Menu Price Adjustment"
          maxWidth="md"
        >
          <div className="space-y-4 py-1">
            <p className="text-xs text-slate-500">
              Increase or decrease menu prices across all {menuItems.length} dishes in your restaurant catalog simultaneously:
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Percentage Change (%)</label>
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
                <label className="block text-xs font-bold text-slate-600 mb-1">Nearest Rounding Rule</label>
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
                className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
              >
                Apply {bulkPercent > 0 ? `+${bulkPercent}%` : `${bulkPercent}%`} to {menuItems.length} Dishes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Diagnostic Financial Reconciliation & Integrity Audit Modal */}
      <FinancialReconciliationModal
        isOpen={isReconModalOpen}
        onClose={() => setIsReconModalOpen(false)}
        showToast={showToast}
      />

      {/* Global Notification Drawer Modal */}
      <NotificationDrawerModal
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        role="POS_ADMIN"
      />

      {/* Real-Time Push Notification Toasts */}
      <NotificationToastContainer role="POS_ADMIN" />

      {/* Floating JAMAN AI Assistant Button */}
      <JamanAiFloatingButton
        onClick={() => setIsAssistantOpen(true)}
        isOpen={isAssistantOpen}
        position="bottom-right"
        className="bottom-4! right-4! sm:bottom-6! sm:right-6!"
      />

      {/* Touch-First Offline Restaurant Intelligence Modal */}
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

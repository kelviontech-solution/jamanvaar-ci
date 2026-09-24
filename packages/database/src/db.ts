import {
  AppNotification,
  AuditLog,
  BusinessDay,
  CashMovement,
  Category,
  ComboDeal,
  Coupon,
  CustomerAccount,
  CustomerFeedback,
  DeviceHealth,
  DeviceRecord,
  DiningTable,
  EodReport,
  HeldOrder,
  InventoryItem,
  KioskDevice,
  KOTRecord,
  LicenseInfo,
  LoyaltyTier,
  LoyaltyReward,
  StaffShiftSchedule,
  AttendanceRecord,
  MarketingCampaign,
  DeliveryRider,
  ManagerOverrideRequest,
  MenuItem,
  ModifierGroup,
  Offer,
  Order,
  Outlet,
  PaymentTransaction,
  PrinterDevice,
  PrintJob,
  Receipt,
  ReceiptConfig,
  ReceiptRecord,
  Recipe,
  Reservation,
  Restaurant,
  Role,
  ServiceRequest,
  ShiftRecord,
  StockMovement,
  SyncEvent,
  QrOrderingSettings,
  KioskDisplaySettings,
  WelcomeScreenSettings,
  TaxGroup,
  User,
  WaitlistEntry,
  Supplier,
  GoodsReceipt,
  InventoryBatch,
  StockCount
} from '@jamanvaar/types';

import { getGuestOrderBaseUrl } from './qr_order_url';

import {
  DEFAULT_QR_SETTINGS,
  DEFAULT_KIOSK_DISPLAY_SETTINGS,
  DEFAULT_WELCOME_SCREEN_SETTINGS,
  SEED_CATEGORIES,
  SEED_COUPONS,
  SEED_MENU_ITEMS,
  SEED_MODIFIER_GROUPS,
  SEED_OFFERS,
  SEED_OUTLET,
  SEED_RESTAURANT,
  SEED_ROLES,
  SEED_TABLES,
  SEED_TAX_GROUPS,
  SEED_USERS,
  generateSeedOrders,
  generateSeedShifts
} from './seed';
import { MenuImportRecord } from './menu_templates';

/**
 * Universal Database Client for JAMANVAAR
 * Runs with synchronous zero-latency local caching, persistent localStorage backing,
 * and transactional state safety.
 */
export class JamanvaarDatabase {
  private static instance: JamanvaarDatabase;

  public restaurant: Restaurant = { ...SEED_RESTAURANT };
  public outlet: Outlet = { ...SEED_OUTLET };
  public categories: Category[] = [...SEED_CATEGORIES];
  public modifierGroups: ModifierGroup[] = [...SEED_MODIFIER_GROUPS];
  public menuItems: MenuItem[] = [...SEED_MENU_ITEMS];
  public tables: DiningTable[] = SEED_TABLES.map((t) => ({ ...t }));
  public qrSettings: QrOrderingSettings = { ...DEFAULT_QR_SETTINGS };
  public kioskDisplaySettings: KioskDisplaySettings = { ...DEFAULT_KIOSK_DISPLAY_SETTINGS };
  public welcomeScreenSettings: WelcomeScreenSettings = { ...DEFAULT_WELCOME_SCREEN_SETTINGS };
  /** Set when the floor plan was deliberately started empty (a real restaurant), so an empty list is not mistaken for missing data on reload. */
  public floorPlanStartedEmpty = false;
  /** prefix ('K' for kiosk, '' for counter, etc.) -> ISO timestamp of the last manual token-counter
   *  reset an admin triggered. OrderRepository.nextTokenNumber ignores orders older than this when
   *  computing the next number for that prefix, so tokens can restart at 101 without deleting order
   *  history. See TokenSequenceRepository. */
  public tokenSequenceResets: Record<string, string> = {};

  public coupons: Coupon[] = [...SEED_COUPONS];
  public offers: Offer[] = [...SEED_OFFERS];
  public taxGroups: TaxGroup[] = [...SEED_TAX_GROUPS];
  public roles: Role[] = [...SEED_ROLES];
  public users: User[] = [...SEED_USERS];
  public devices: DeviceRecord[] = [];

  // Was 3 fabricated kiosk terminals with fake IPs/MAC addresses that never
  // corresponded to any real activated device (QA audit BUG-004). Real
  // entries are now upserted by KioskRepository.upsertFromHeartbeat as
  // actual Kiosk devices join the LAN mesh — see kiosk-admin's App.tsx.
  public kiosks: KioskDevice[] = [];

  public orders: Order[] = generateSeedOrders();

  // Was 3 fabricated CLOSED business days (Aug 29-31) with invented gross
  // sales/order counts, plus one fake "today, OPEN" day already showing
  // Rs.61,200 in sales before any real order existed. BusinessDayRepository
  // .getActiveBusinessDay() correctly bootstraps a real, all-zero "today"
  // business day on demand -- historical days are only ever added when a
  // real day actually closes.
  public businessDays: BusinessDay[] = [];


  public paymentTransactions: PaymentTransaction[] = [];
  public receipts: Receipt[] = [];
  public serviceRequests: ServiceRequest[] = [];
  public syncEvents: SyncEvent[] = [];
  public notifications: AppNotification[] = [];
  public menuImportHistory: MenuImportRecord[] = [];
  public shifts: ShiftRecord[] = generateSeedShifts();
  public cashMovements: CashMovement[] = [];
  // Was 4 fabricated kitchen tickets (kot-101..kot-104) referencing fake
  // orders (ord-1043..ord-1045) that don't exist in db.orders -- every
  // fresh install showed KDS/Admin Kitchen views a plausible-looking
  // "in preparation" queue that was entirely invented. Real KOTs are
  // created by KOTRepository.generateKOT when a real order is sent.
  public kots: KOTRecord[] = [];
  public heldOrders: HeldOrder[] = [];
  public managerOverrides: ManagerOverrideRequest[] = [];
  // Was one fabricated reservation ("Ketan Sheth") for table 16 — which
  // doesn't exist in the real 12-table floor plan (SEED_TABLES), a data
  // bug on top of being invented guest activity. Real reservations are
  // created through the actual Reservations UI.
  public reservations: Reservation[] = [];
  public waitlist: WaitlistEntry[] = [];
  public eodReports: EodReport[] = [];
  // Was one fabricated 5-star review referencing a fake order id — real
  // feedback is created by CustomerFeedback submission at the Kiosk.
  public feedbacks: CustomerFeedback[] = [];

  // Was 8 fabricated guest profiles with invented visit counts, loyalty
  // balances and lifetime-spend totals, none of it backed by any real order
  // — the exact "CRM shows guests who never existed" pattern the QA audit
  // flagged. Real profiles are created automatically the moment a real order
  // attaches a customer (see CustomerRepository.getOrCreateAccount /
  // earnPointsForOrder), so this starts empty rather than pre-populated with
  // invented history.
  public customerAccounts: CustomerAccount[] = [];

  public combos: ComboDeal[] = [
    {
      id: 'combo-biryani-feast',
      name: 'Royal Veg Biryani Feast Combo',
      description: 'Royal Veg Handi Dum Biryani + Boondi Raita + Chilled Cold Coffee + 2 pcs Shahi Gulab Jamun',
      translations: {
        hi: {
          name: 'रॉयल वेज बिरयानी फीस्ट कॉम्बो',
          description: 'रॉयल वेज हांडी दम बिरयानी + बूंदी रायता + ठंडी कोल्ड कॉफी + 2 पीस शाही गुलाब जामुन'
        },
        gu: {
          name: 'રોયલ વેજ બિરયાની ફિસ્ટ કોમ્બો',
          description: 'રોયલ વેજ હાંડી દમ બિરયાની + બૂંદી રાયતું + ઠંડી કોલ્ડ કોફી + 2 પીસ શાહી ગુલાબ જામુન'
        }
      },
      basePrice: 449,
      originalPrice: 560,
      savingsAmount: 111,
      mainItemIds: ['item-vgb-hnd'],
      sideItemIds: ['item-hbk'],
      drinkItemIds: ['item-cc-ice'],
      dessertItemIds: ['item-gj-2'],
      imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
      isAvailable: true,
      featured: true
    },
    {
      id: 'combo-paneer-meal',
      name: 'Maharaja Paneer Thali Combo',
      description: 'Paneer Butter Masala + 2x Butter Naan + Dal Makhani + Cold Coffee with Ice Cream',
      translations: {
        hi: {
          name: 'महाराजा पनीर थाली कॉम्बो',
          description: 'पनीर बटर मसाला + 2x बटर नान + दाल मखनी + कोल्ड कॉफी विथ आइसक्रीम'
        },
        gu: {
          name: 'મહારાજા પનીર થાળી કોમ્બો',
          description: 'પનીર બટર મસાલા + 2x બટર નાન + દાળ મખની + કોલ્ડ કોફી વિથ આઇસક્રીમ'
        }
      },
      basePrice: 429,
      originalPrice: 530,
      savingsAmount: 101,
      mainItemIds: ['item-pbm'],
      sideItemIds: ['item-bn'],
      drinkItemIds: ['item-cc-ice'],
      dessertItemIds: [],
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      isAvailable: true,
      featured: true
    }
  ];

  // Loyalty program — previously a single flat loyaltyPoints number on
  // CustomerAccount with no tiers, no automated earn rate, and no way to
  // spend points on anything specific.
  public loyaltyTiers: LoyaltyTier[] = [
    { id: 'tier-bronze', name: 'Bronze', minLifetimeSpend: 0, pointsMultiplier: 1, perks: ['Earn 1 point per ₹10 spent'], colorHex: '#B08D57' },
    { id: 'tier-silver', name: 'Silver', minLifetimeSpend: 5000, pointsMultiplier: 1.25, perks: ['25% faster points', 'Birthday month bonus'], colorHex: '#94A3B8' },
    { id: 'tier-gold', name: 'Gold', minLifetimeSpend: 15000, pointsMultiplier: 1.5, perks: ['50% faster points', 'Priority table booking'], colorHex: '#D4A017' },
    { id: 'tier-platinum', name: 'Platinum', minLifetimeSpend: 40000, pointsMultiplier: 2, perks: ['2x points', 'Complimentary dessert every visit'], colorHex: '#7C3AED' }
  ];

  public loyaltyRewards: LoyaltyReward[] = [
    { id: 'reward-dessert', name: 'Free Dessert', description: 'Any dessert on the menu, on the house', pointsCost: 100, isActive: true },
    { id: 'reward-100off', name: '₹100 Off Bill', description: 'Flat ₹100 off the total bill', pointsCost: 150, isActive: true },
    { id: 'reward-starter', name: 'Free Starter', description: 'Any starter under ₹250', pointsCost: 200, isActive: true },
    { id: 'reward-meal', name: 'Free Meal for Two', description: 'A full meal for two guests', pointsCost: 800, isActive: true }
  ];

  // Staff scheduling & attendance — previously nonexistent; StaffRepository
  // only ever managed login accounts, not who's rostered to work when or
  // whether they actually showed up.
  public staffSchedules: StaffShiftSchedule[] = [];
  public attendanceRecords: AttendanceRecord[] = [];

  // Marketing campaigns — previously only a per-customer, one-at-a-time
  // WhatsApp deep-link button with no saved segment or reusable message.
  public marketingCampaigns: MarketingCampaign[] = [];

  // Delivery riders — a DELIVERY order previously had an orderType and
  // nothing else: no roster, no assignment, no dispatch tracking.
  public deliveryRiders: DeliveryRider[] = [];

  public inventoryItems: InventoryItem[] = [
    {
      id: 'inv-paneer',
      name: 'Fresh Malai Paneer',
      sku: 'RAW-PAN-01',
      category: 'Dairy',
      unit: 'kg',
      currentStock: 18.5,
      minStockLevel: 5.0,
      reorderLevel: 8.0,
      costPerUnit: 340,
      supplierName: 'Amul Dairy Direct',
      status: 'IN_STOCK',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'inv-butter',
      name: 'Amul Salted Table Butter',
      sku: 'RAW-BUT-01',
      category: 'Dairy',
      unit: 'kg',
      currentStock: 4.2,
      minStockLevel: 5.0,
      reorderLevel: 10.0,
      costPerUnit: 520,
      supplierName: 'Amul Dairy Direct',
      status: 'LOW_STOCK',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'inv-rice',
      name: 'Royal Basmati Biryani Rice',
      sku: 'RAW-RIC-01',
      category: 'Grains & Pulses',
      unit: 'kg',
      currentStock: 65.0,
      minStockLevel: 15.0,
      reorderLevel: 25.0,
      costPerUnit: 140,
      supplierName: 'Daawat Grain Distributors',
      status: 'IN_STOCK',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'inv-cheese',
      name: 'Mozzarella Diced Pizza Cheese',
      sku: 'RAW-CHE-01',
      category: 'Dairy',
      unit: 'kg',
      currentStock: 12.0,
      minStockLevel: 4.0,
      reorderLevel: 8.0,
      costPerUnit: 480,
      supplierName: 'Go Cheese Wholesale',
      status: 'IN_STOCK',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'inv-flour',
      name: 'Refined Maida (Naan Flour)',
      sku: 'RAW-MAI-01',
      category: 'Grains & Pulses',
      unit: 'kg',
      currentStock: 40.0,
      minStockLevel: 10.0,
      reorderLevel: 20.0,
      costPerUnit: 45,
      supplierName: 'Patanjali Agro Hub',
      status: 'IN_STOCK',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'inv-coffee',
      name: 'Arabica Roasted Coffee Beans',
      sku: 'RAW-COF-01',
      category: 'Beverage Raw',
      unit: 'kg',
      currentStock: 1.5,
      minStockLevel: 2.0,
      reorderLevel: 5.0,
      costPerUnit: 850,
      supplierName: 'Chikmagalur Plantation Co',
      status: 'LOW_STOCK',
      updatedAt: new Date().toISOString()
    }
  ];

  public stockMovements: StockMovement[] = [
    {
      id: 'sm-1',
      itemId: 'inv-paneer',
      itemName: 'Fresh Malai Paneer',
      type: 'RESTOCK',
      quantityDelta: 20,
      unit: 'kg',
      costImpact: 6800,
      reason: 'Morning Dairy Delivery',
      performedBy: 'Amit Dave',
      timestamp: new Date(Date.now() - 14400000).toISOString()
    }
  ];

  public suppliers: Supplier[] = [];
  public goodsReceipts: GoodsReceipt[] = [];
  public inventoryBatches: InventoryBatch[] = [];
  public stockCounts: StockCount[] = [];

  public recipes: Recipe[] = [
    {
      id: 'rec-paneer-tikka',
      menuItemId: 'item-pt',
      menuItemName: 'Paneer Tikka (Tandoori)',
      ingredients: [
        { inventoryItemId: 'inv-paneer', inventoryItemName: 'Fresh Malai Paneer', quantityPerPortion: 0.2, unit: 'kg' },
        { inventoryItemId: 'inv-butter', inventoryItemName: 'Amul Salted Table Butter', quantityPerPortion: 0.03, unit: 'kg' }
      ],
      isActive: true
    },
    {
      id: 'rec-butter-naan',
      menuItemId: 'item-bn',
      menuItemName: 'Butter Naan',
      ingredients: [
        { inventoryItemId: 'inv-flour', inventoryItemName: 'Refined Maida (Naan Flour)', quantityPerPortion: 0.1, unit: 'kg' },
        { inventoryItemId: 'inv-butter', inventoryItemName: 'Amul Salted Table Butter', quantityPerPortion: 0.02, unit: 'kg' }
      ],
      isActive: true
    }
  ];

  public receiptConfig: ReceiptConfig = {
    restaurantName: 'JAMANVAAR Restaurant',
    address: 'Sindhu Bhavan Road, Bodakdev, Ahmedabad, Gujarat 380054',
    phone: '+91 79 4890 1234',
    gstin: '24ABCDE1234F1Z5', // matches SEED_RESTAURANT.gstin in seed.ts — these two used to seed different values with nothing to keep them in sync
    fssaiNumber: '10722001000452',
    footerMessage: 'Freshly Prepared • Zero Preservatives • Pure Heritage Taste',
    thankYouMessage: 'Thank you for dining at JAMANVAAR! Please visit again.',
    paperSize: '80mm',
    showCustomerPhone: true,
    showTaxBreakup: true,
    showTokenBig: true,
    enableWhatsApp: true,
    enableSms: true,
    enableEmail: true,
    enableQrReceipt: true
  };

  public receiptRecords: ReceiptRecord[] = [];
  public printJobs: PrintJob[] = [];
  public configuredPrinters: PrinterDevice[] = [
    {
      id: 'prn-kiosk-01',
      name: 'JAMANVAAR Thermal 80mm (Counter)',
      role: 'RECEIPT',
      driverName: 'Generic / Text Only (ESC/POS 80mm)',
      interfaceType: 'USB',
      port: 'USB001',
      paperSize: '80mm',
      status: 'READY',
      isDefault: true,
      isKioskBuiltIn: true,
      modelName: 'POS Thermal Direct Line 80mm (Auto-Cutter)',
      manufacturer: 'JAMANVAAR Hardware Integration HAL',
      assignedTerminalId: 'POS-01',
      lastTestAt: new Date().toISOString(),
      lastPrintAt: new Date().toISOString()
    },
    {
      id: 'prn-kitchen-01',
      name: 'Kitchen Main Thermal 80mm',
      role: 'KITCHEN',
      driverName: 'ESC/POS LAN Driver (80mm)',
      interfaceType: 'NETWORK_LAN',
      ipAddress: '192.168.1.150',
      port: '9100',
      paperSize: '80mm',
      status: 'READY',
      isDefault: false,
      isKioskBuiltIn: false,
      modelName: 'Kitchen Order Spooler K80',
      manufacturer: 'JAMANVAAR HAL',
      lastTestAt: new Date().toISOString()
    },
    {
      id: 'prn-tandoor-01',
      name: 'Tandoor Station Thermal 80mm',
      role: 'TANDOOR',
      driverName: 'ESC/POS LAN Driver (80mm)',
      interfaceType: 'NETWORK_LAN',
      ipAddress: '192.168.1.151',
      port: '9100',
      paperSize: '80mm',
      status: 'READY',
      isDefault: false,
      isKioskBuiltIn: false,
      modelName: 'Tandoor Heavy-Duty Thermal K80',
      manufacturer: 'JAMANVAAR HAL',
      lastTestAt: new Date().toISOString()
    },
    {
      id: 'prn-bar-01',
      name: 'Beverages & Bar Thermal 80mm',
      role: 'BAR',
      driverName: 'ESC/POS LAN Driver (80mm)',
      interfaceType: 'NETWORK_LAN',
      ipAddress: '192.168.1.152',
      port: '9100',
      paperSize: '80mm',
      status: 'READY',
      isDefault: false,
      isKioskBuiltIn: false,
      modelName: 'Bar Counter Thermal 80mm',
      manufacturer: 'JAMANVAAR HAL',
      lastTestAt: new Date().toISOString()
    },
    {
      id: 'prn-dessert-01',
      name: 'Dessert Counter Thermal 80mm',
      role: 'DESSERT',
      driverName: 'ESC/POS LAN Driver (80mm)',
      interfaceType: 'NETWORK_LAN',
      ipAddress: '192.168.1.153',
      port: '9100',
      paperSize: '80mm',
      status: 'READY',
      isDefault: false,
      isKioskBuiltIn: false,
      modelName: 'Sweet & Dessert Thermal 80mm',
      manufacturer: 'JAMANVAAR HAL',
      lastTestAt: new Date().toISOString()
    },
    {
      id: 'prn-report-01',
      name: 'Admin Reports Thermal 80mm',
      role: 'REPORT',
      driverName: 'Windows Thermal Driver',
      interfaceType: 'WINDOWS_DRIVER',
      paperSize: '80mm',
      status: 'READY',
      isDefault: false,
      isKioskBuiltIn: false,
      modelName: 'Back-Office Report Printer 80mm',
      manufacturer: 'JAMANVAAR HAL',
      lastTestAt: new Date().toISOString()
    },
    {
      id: 'prn-compact-58',
      name: 'JAMANVAAR Compact 58mm Thermal',
      role: 'GENERAL',
      driverName: 'ESC/POS 58mm Driver',
      interfaceType: 'SERIAL',
      port: 'COM3',
      paperSize: '58mm',
      status: 'READY',
      isDefault: false,
      isKioskBuiltIn: false,
      modelName: 'POS-58 Micro Thermal',
      manufacturer: 'JAMANVAAR HAL'
    }
  ];

  public license: LicenseInfo = {
    planName: 'JAMANVAAR PRO',
    tier: 'PRO',
    price: 7000,
    licenseKey: 'JAMAN-PRO-2026-AHM-8842-X',
    allowedDevicesCount: 5,
    activeDevicesCount: 2,
    status: 'ACTIVE',
    activatedAt: '2026-01-01T00:00:00Z',
    validUntil: '2027-12-31T23:59:59Z',
    restaurantId: 'rest-jamanvaar-ahmedabad',
    restaurantName: 'JAMANVAAR Traditional Dining',
    branchName: 'Ahmedabad Flagship Store',
    terminalId: 'POS-01',
    entitlements: {
      posTerminal: true,
      offlineBilling: true,
      dineInTakeawayDeliveryToken: true,
      menuManagement: true,
      foodCustomization: true,
      discountsAndGst: true,
      multiPaymentTenders: true,
      tableManagement: true,
      customerManagement: true,
      kotKdsRouting: true,
      receiptPrinting: true,
      shiftAndCashDrawer: true,
      salesAndGstReports: true,
      inventoryManagement: true,
      posAssistant: true,
      restaurantAdmin: true,
      captainApp: true,
      advancedCaptainReports: true,
      advancedServiceWorkflow: true,
      qrTableOrdering: true,
      selfOrderKiosk: true
    }
  };

  public auditLogs: AuditLog[] = [
    {
      id: 'aud-1',
      userId: 'usr-admin-1',
      username: 'admin',
      action: 'LOGIN_SUCCESS',
      category: 'AUTH',
      details: 'Super Admin logged into Terminal Kiosk Admin',
      timestamp: new Date(Date.now() - 7200000).toISOString()
    }
  ];

  public deviceHealth: DeviceHealth = {
    kioskId: 'KIOSK-01',
    status: 'ONLINE',
    isOnline: true,
    cpuUsagePercent: 14.2,
    ramUsagePercent: 32.8,
    storageFreeGb: 118.4,
    appVersion: '1.0.0',
    isPrinterOnline: true,
    isPaymentTerminalOnline: true,
    isTouchscreenResponsive: true,
    lastHeartbeat: new Date().toISOString(),
    pendingSyncEventsCount: 0
  };

  private customSyncServerUrl: string = '';
  // Tracks the LAN sync server's own SEC-005 pairing gate: /api/sync and
  // /api/events are Bearer-token-protected, and nothing here ever performs
  // the /devices/pair handshake that would obtain that token, so every
  // request is structurally guaranteed to 401 until a real pairing flow
  // exists. Rather than spam that rejection every 8 seconds forever (the
  // "LAN Sync 401 polling loop" from the QA audit), this stops retrying
  // after the first 401 instead of looping indefinitely.
  private serverSyncUnauthorized = false;
  private serverSyncPollTimer: ReturnType<typeof setInterval> | null = null;
  /** True once the local relay has refused this browser (it needs a pairing no screen performs yet). */
  public isLocalCoreUnauthorized(): boolean {
    return this.serverSyncUnauthorized;
  }

  public markLocalCoreUnauthorized(): void {
    this.serverSyncUnauthorized = true;
  }

  private listeners: Set<() => void> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  public getSyncServerUrl(): string {
    if (this.customSyncServerUrl && this.customSyncServerUrl.trim().length > 0) {
      return this.customSyncServerUrl.trim().replace(/\/+$/, '');
    }
    if (typeof localStorage !== 'undefined') {
      const customUrl = localStorage.getItem('jamanvaar_sync_server_url');
      if (customUrl && customUrl.trim().length > 0) {
        return customUrl.trim().replace(/\/+$/, '');
      }
    }
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      return `http://${window.location.hostname}:5178`;
    }
    return 'http://localhost:5178';
  }

  public setSyncServerUrl(url: string): void {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    this.customSyncServerUrl = cleanUrl;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('jamanvaar_sync_server_url', cleanUrl);
    }
    this.initServerSync();
    this.notify();
  }

  public async testSyncServer(url?: string): Promise<{ success: boolean; pingMs: number; error?: string }> {
    const targetUrl = (url || this.getSyncServerUrl()).replace(/\/+$/, '');
    const start = performance.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 1500) : null;

    try {
      const res = await fetch(`${targetUrl}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller?.signal
      });
      if (timeoutId) clearTimeout(timeoutId);
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        return { success: true, pingMs: elapsed };
      }
      return { success: false, pingMs: elapsed, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      const elapsed = Math.round(performance.now() - start);
      return { success: false, pingMs: elapsed, error: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Connection refused or host unreachable') };
    }
  }

  public async forceSyncNow(): Promise<boolean> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 1500) : null;
    try {
      const targetUrl = this.getSyncServerUrl();
      const res = await fetch(`${targetUrl}/api/sync`, { signal: controller?.signal });
      if (timeoutId) clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.orders && Array.isArray(data.orders)) {
          const map = new Map<string, Order>();
          this.orders.forEach((o) => map.set(o.id, o));
          data.orders.forEach((o: Order) => map.set(o.id, o));
          this.orders = Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        if (data.restaurant) this.restaurant = { ...this.restaurant, ...data.restaurant };
        if (data.outlet) this.outlet = { ...this.outlet, ...data.outlet };
        if (Array.isArray(data.categories)) this.categories = data.categories;
        if (Array.isArray(data.menuItems)) this.menuItems = data.menuItems;
        if (Array.isArray(data.tables)) this.tables = data.tables;
        if (Array.isArray(data.shifts)) this.shifts = data.shifts;
        if (Array.isArray(data.kots)) this.kots = data.kots;
        if (Array.isArray(data.inventoryItems)) this.inventoryItems = data.inventoryItems;
        if (Array.isArray(data.recipes)) this.recipes = data.recipes;
        if (Array.isArray(data.customerAccounts)) this.customerAccounts = data.customerAccounts;
        if (Array.isArray(data.users)) this.users = data.users;
        if (Array.isArray(data.roles)) this.roles = data.roles;
        this.saveToStorage();
        this.pushToServer();
        this.listeners.forEach((fn) => fn());
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private pushToServer(): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    if (this.serverSyncUnauthorized) return;
    try {
      fetch(`${this.getSyncServerUrl()}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant: this.restaurant,
          outlet: this.outlet,
          orders: this.orders,
          tables: this.tables,
          categories: this.categories,
          menuItems: this.menuItems,
          modifierGroups: this.modifierGroups,
          combos: this.combos,
          loyaltyTiers: this.loyaltyTiers,
          loyaltyRewards: this.loyaltyRewards,
          staffSchedules: this.staffSchedules,
          attendanceRecords: this.attendanceRecords,
          marketingCampaigns: this.marketingCampaigns,
          deliveryRiders: this.deliveryRiders,
          receiptConfig: this.receiptConfig,
          receiptRecords: this.receiptRecords,
          printJobs: this.printJobs,
          serviceRequests: this.serviceRequests,
          auditLogs: this.auditLogs,
          shifts: this.shifts,
          cashMovements: this.cashMovements,
          kots: this.kots,
          heldOrders: this.heldOrders,
          reservations: this.reservations,
          waitlist: this.waitlist,
          inventoryItems: this.inventoryItems,
          stockMovements: this.stockMovements,
          recipes: this.recipes,
          customerAccounts: this.customerAccounts,
          users: this.users,
          roles: this.roles,
          configuredPrinters: this.configuredPrinters,
          license: this.license,
          taxGroups: this.taxGroups
        })
      })
        .then((res) => {
          if (res.status === 401) this.serverSyncUnauthorized = true;
        })
        .catch(() => {});
    } catch {
      // Ignore network errors
    }
  }

  private initServerSync(): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

    // A prior call (e.g. setSyncServerUrl pointing at a new server) may have
    // left a poll timer and an unauthorized flag from the old target running
    // — clear both so re-syncing against a different server gets a fresh
    // attempt instead of inheriting the previous one's rejection.
    if (this.serverSyncPollTimer) {
      clearInterval(this.serverSyncPollTimer);
      this.serverSyncPollTimer = null;
    }
    this.serverSyncUnauthorized = false;

    // 1. Initial Pull from Sync Server
    fetch(`${this.getSyncServerUrl()}/api/sync`)
      .then((res) => {
        if (res.status === 401) {
          this.serverSyncUnauthorized = true;
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data && data.orders && Array.isArray(data.orders) && data.orders.length > 0) {
          const map = new Map<string, Order>();
          this.orders.forEach((o) => map.set(o.id, o));
          data.orders.forEach((o: Order) => map.set(o.id, o));
          this.orders = Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        if (data && data.restaurant) this.restaurant = { ...this.restaurant, ...data.restaurant };
        if (data && data.outlet) this.outlet = { ...this.outlet, ...data.outlet };
        if (data && Array.isArray(data.categories) && data.categories.length > 0) this.categories = data.categories;
        if (data && Array.isArray(data.menuItems) && data.menuItems.length > 0) this.menuItems = data.menuItems;
        if (data && Array.isArray(data.tables) && data.tables.length > 0) this.tables = data.tables;
        if (data && Array.isArray(data.shifts) && data.shifts.length > 0) this.shifts = data.shifts;
        if (data && Array.isArray(data.kots)) this.kots = data.kots;
        if (data && Array.isArray(data.heldOrders)) this.heldOrders = data.heldOrders;
        if (data && Array.isArray(data.reservations)) this.reservations = data.reservations;
        if (data && Array.isArray(data.waitlist)) this.waitlist = data.waitlist;
        if (data && Array.isArray(data.inventoryItems) && data.inventoryItems.length > 0) this.inventoryItems = data.inventoryItems;
        if (data && Array.isArray(data.stockMovements)) this.stockMovements = data.stockMovements;
        if (data && Array.isArray(data.recipes) && data.recipes.length > 0) this.recipes = data.recipes;
        if (data && Array.isArray(data.customerAccounts)) this.customerAccounts = data.customerAccounts;
        if (data && Array.isArray(data.users) && data.users.length > 0) this.users = data.users;
        if (data && Array.isArray(data.roles) && data.roles.length > 0) this.roles = data.roles;
        if (data && Array.isArray(data.configuredPrinters)) this.configuredPrinters = data.configuredPrinters;
        if (data && data.license) this.license = data.license;
        if (data && Array.isArray(data.taxGroups) && data.taxGroups.length > 0) this.taxGroups = data.taxGroups;
        
        // Ensure menu is NEVER empty
        if (!this.menuItems || this.menuItems.length === 0) {
          this.menuItems = [...SEED_MENU_ITEMS];
        }
        if (!this.categories || this.categories.length === 0) {
          this.categories = [...SEED_CATEGORIES];
        }
        this.listeners.forEach((fn) => fn());
      })
      .catch(() => {});

    // 2. Connect to Server-Sent Events for Real-Time Cross-Port Push
    try {
      if ('EventSource' in window) {
        const sse = new EventSource(`${this.getSyncServerUrl()}/api/events`);
        sse.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data || '{}');
            const evtType = parsed.event || parsed.type;

            if ((evtType === 'DB_UPDATE' || evtType === 'SYNC') && parsed.state) {
              if (parsed.state.orders && Array.isArray(parsed.state.orders) && parsed.state.orders.length > 0) {
                const map = new Map<string, Order>();
                this.orders.forEach((o) => map.set(o.id, o));
                parsed.state.orders.forEach((o: Order) => map.set(o.id, o));
                this.orders = Array.from(map.values()).sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
              }
              if (parsed.state.restaurant) this.restaurant = { ...this.restaurant, ...parsed.state.restaurant };
              if (parsed.state.outlet) this.outlet = { ...this.outlet, ...parsed.state.outlet };
              if (Array.isArray(parsed.state.categories) && parsed.state.categories.length > 0) this.categories = parsed.state.categories;
              if (Array.isArray(parsed.state.menuItems) && parsed.state.menuItems.length > 0) this.menuItems = parsed.state.menuItems;
              if (Array.isArray(parsed.state.shifts) && parsed.state.shifts.length > 0) this.shifts = parsed.state.shifts;
              if (Array.isArray(parsed.state.kots)) this.kots = parsed.state.kots;
              if (Array.isArray(parsed.state.heldOrders)) this.heldOrders = parsed.state.heldOrders;
              if (Array.isArray(parsed.state.tables) && parsed.state.tables.length > 0) this.tables = parsed.state.tables;
              if (Array.isArray(parsed.state.inventoryItems) && parsed.state.inventoryItems.length > 0) this.inventoryItems = parsed.state.inventoryItems;
              if (Array.isArray(parsed.state.stockMovements)) this.stockMovements = parsed.state.stockMovements;
              if (Array.isArray(parsed.state.recipes) && parsed.state.recipes.length > 0) this.recipes = parsed.state.recipes;
              if (Array.isArray(parsed.state.customerAccounts)) this.customerAccounts = parsed.state.customerAccounts;
              if (Array.isArray(parsed.state.users) && parsed.state.users.length > 0) this.users = parsed.state.users;
              if (Array.isArray(parsed.state.roles) && parsed.state.roles.length > 0) this.roles = parsed.state.roles;
              if (Array.isArray(parsed.state.configuredPrinters)) this.configuredPrinters = parsed.state.configuredPrinters;
              if (parsed.state.license) this.license = parsed.state.license;
              if (Array.isArray(parsed.state.taxGroups) && parsed.state.taxGroups.length > 0) this.taxGroups = parsed.state.taxGroups;
              
              if (!this.menuItems || this.menuItems.length === 0) {
                this.menuItems = [...SEED_MENU_ITEMS];
              }
              if (!this.categories || this.categories.length === 0) {
                this.categories = [...SEED_CATEGORIES];
              }
              this.listeners.forEach((fn) => fn());
            } else if (evtType === 'ORDER_CREATED' && parsed.order) {
              const ord = parsed.order as Order;
              const idx = this.orders.findIndex((o) => o.id === ord.id || o.orderNumber === ord.orderNumber);
              if (idx >= 0) this.orders[idx] = { ...this.orders[idx], ...ord };
              else this.orders.unshift(ord);
              this.listeners.forEach((fn) => fn());
            } else if (evtType === 'ORDER_STATUS_CHANGED' && parsed.orderId) {
              const ord = this.orders.find((o) => o.id === parsed.orderId);
              if (ord) {
                ord.orderStatus = parsed.orderStatus;
                this.listeners.forEach((fn) => fn());
              }
            }
          } catch (e) {}
        };
      }
    } catch (e) {}

    // 3. Fallback Interval Polling (every 8 seconds, zero feedback recursion)
    this.serverSyncPollTimer = setInterval(() => {
      if (this.serverSyncUnauthorized) {
        if (this.serverSyncPollTimer) {
          clearInterval(this.serverSyncPollTimer);
          this.serverSyncPollTimer = null;
        }
        return;
      }
      fetch(`${this.getSyncServerUrl()}/api/sync`)
        .then((res) => {
          if (res.status === 401) {
            this.serverSyncUnauthorized = true;
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (!data) return;
          if (data && data.orders && Array.isArray(data.orders)) {
            let changed = false;
            const map = new Map<string, Order>();
            this.orders.forEach((o) => map.set(o.id, o));
            data.orders.forEach((o: Order) => {
              if (!map.has(o.id) || JSON.stringify(map.get(o.id)) !== JSON.stringify(o)) {
                map.set(o.id, o);
                changed = true;
              }
            });
            if (changed) {
              this.orders = Array.from(map.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              this.listeners.forEach((fn) => fn());
            }
          }
        })
        .catch(() => {});
    }, 8000);
  }

  public readonly storagePrefix: string;
  public readonly clientType: 'UNIVERSAL' | 'POS' | 'POS_ADMIN' | 'KIOSK_USER' | 'KIOSK_ADMIN' | 'CAPTAIN' | 'KDS';
  private static instancesByRole: Map<string, JamanvaarDatabase> = new Map();

  private constructor(
    storagePrefix: string = 'jamanvaar_db_',
    clientType: 'UNIVERSAL' | 'POS' | 'POS_ADMIN' | 'KIOSK_USER' | 'KIOSK_ADMIN' | 'CAPTAIN' | 'KDS' = 'UNIVERSAL'
  ) {
    this.storagePrefix = storagePrefix;
    this.clientType = clientType;
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      try {
        if ('BroadcastChannel' in window) {
          this.broadcastChannel = new BroadcastChannel('jamanvaar_realtime_db_bus');
          this.broadcastChannel.onmessage = (ev) => {
            if (ev.data && ev.data.type === 'DB_SYNC') {
              this.loadFromStorage();
              this.listeners.forEach((fn) => fn());
            }
          };
        }
      } catch (e) {
        console.warn('BroadcastChannel setup error:', e);
      }

      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith(this.storagePrefix)) {
          this.loadFromStorage();
          this.listeners.forEach((fn) => fn());
        }
      });

      this.initServerSync();
    }
  }

  public static getInstance(): JamanvaarDatabase {
    if (!JamanvaarDatabase.instance) {
      JamanvaarDatabase.instance = new JamanvaarDatabase('jamanvaar_db_', 'UNIVERSAL');
    }
    return JamanvaarDatabase.instance;
  }

  public static getInstanceForRole(
    clientType: 'UNIVERSAL' | 'POS' | 'POS_ADMIN' | 'KIOSK_USER' | 'KIOSK_ADMIN' | 'CAPTAIN' | 'KDS',
    storagePrefix?: string
  ): JamanvaarDatabase {
    const key = `${clientType}_${storagePrefix || 'jamanvaar_' + clientType.toLowerCase() + '_db_'}`;
    if (!JamanvaarDatabase.instancesByRole.has(key)) {
      const dbInst = new JamanvaarDatabase(
        storagePrefix || `jamanvaar_${clientType.toLowerCase()}_db_`,
        clientType
      );
      JamanvaarDatabase.instancesByRole.set(key, dbInst);
    }
    return JamanvaarDatabase.instancesByRole.get(key)!;
  }

  /**
   * Last text written for each storage key (BUG-033). Saving used to rewrite all ~45 collections on
   * every change, including every stored order, audit log and print job. A collection whose text has
   * not changed is now left alone; the cache is dropped whenever storage may have changed under us.
   */
  private lastWritten = new Map<string, string>();

  private putIfChanged(fullKey: string, text: string): void {
    if (this.lastWritten.get(fullKey) === text) return;
    localStorage.setItem(fullKey, text);
    this.lastWritten.set(fullKey, text);
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const p = this.storagePrefix;
      const put = (name: string, value: unknown) => this.putIfChanged(`${p}${name}`, JSON.stringify(value));
      put('restaurant', this.restaurant);
      put('outlet', this.outlet);
      put('menu_items', this.menuItems);
      put('categories', this.categories);
      put('modifier_groups', this.modifierGroups);
      put('combos', this.combos);
      put('loyalty_tiers', this.loyaltyTiers);
      put('loyalty_rewards', this.loyaltyRewards);
      put('staff_schedules', this.staffSchedules);
      put('attendance_records', this.attendanceRecords);
      put('marketing_campaigns', this.marketingCampaigns);
      put('delivery_riders', this.deliveryRiders);
      put('receipt_config', this.receiptConfig);
      put('receipt_records', this.receiptRecords);
      put('print_jobs', this.printJobs);
      put('orders', this.orders);
      put('tables', this.tables);
      put('floor_plan_started_empty', this.floorPlanStartedEmpty);
      put('coupons', this.coupons);
      put('kiosks', this.kiosks);
      put('service_requests', this.serviceRequests);
      put('audit_logs', this.auditLogs);
      put('shifts', this.shifts);
      put('cash_movements', this.cashMovements);
      put('kots', this.kots);
      put('held_orders', this.heldOrders);
      put('reservations', this.reservations);
      put('waitlist', this.waitlist);
      put('inventory_items', this.inventoryItems);
      put('stock_movements', this.stockMovements);
      put('suppliers', this.suppliers);
      put('goods_receipts', this.goodsReceipts);
      put('inventory_batches', this.inventoryBatches);
      put('stock_counts', this.stockCounts);
      put('recipes', this.recipes);
      put('customer_accounts', this.customerAccounts);
      put('users', this.users);
      put('roles', this.roles);
      put('configured_printers', this.configuredPrinters);
      put('license', this.license);
      put('tax_groups', this.taxGroups);
      put('business_days', this.businessDays);
      put('eod_reports', this.eodReports);
      put('notifications', this.notifications);
      // BUG-HIGH-002 fix: syncEvents (the offline outbox queue — see
      // SyncOutboxEngine.queueEvent in @jamanvaar/sync) was never persisted
      // here, so any PENDING/FAILED event and its retry count was silently
      // lost on every reload or process restart — an offline-first system
      // whose own offline queue doesn't survive a restart.
      put('sync_events', this.syncEvents);
      put('kiosk_display_settings', this.kioskDisplaySettings);
      put('welcome_screen_settings', this.welcomeScreenSettings);
      put('token_sequence_resets', this.tokenSequenceResets);
      // qrSettings had the same gap syncEvents/kioskDisplaySettings used to
      // have — declared on this class but never actually persisted, so a
      // restaurant's QR ordering configuration (min/max order value, waiter
      // approval requirement, etc.) silently reverted to defaults on reload.
      put('qr_settings', this.qrSettings);
      localStorage.setItem(`${p}sync_timestamp`, Date.now().toString());
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    this.lastWritten.clear();
    try {
      const p = this.storagePrefix;
      const storedRest = localStorage.getItem(`${p}restaurant`);
      if (storedRest) {
        const parsed = JSON.parse(storedRest);
        this.restaurant = { ...SEED_RESTAURANT, ...parsed };
        if (this.restaurant && this.restaurant.legalName && (this.restaurant.legalName.includes('HOSPITALITY') || this.restaurant.legalName.includes('PVT LTD'))) {
          this.restaurant.legalName = 'JAMANVAAR by KELVIONTECH';
        }
        if (this.restaurant && this.restaurant.name && this.restaurant.name.includes('JAMANVAAR')) {
          this.restaurant.name = SEED_RESTAURANT.name;
        }
      } else {
        this.restaurant = { ...SEED_RESTAURANT };
      }

      const storedOutlet = localStorage.getItem(`${p}outlet`);
      if (storedOutlet) {
        this.outlet = { ...SEED_OUTLET, ...JSON.parse(storedOutlet) };
      }

      const storedItems = localStorage.getItem(`${p}menu_items`);
      if (storedItems) {
        const parsed = JSON.parse(storedItems);
        if (Array.isArray(parsed)) {
          // BUG-017: this used to drop every NON_VEG item and anything with "chicken" in its
          // name, then — if fewer than 8 items survived — throw away the WHOLE stored menu
          // and replace it with the demo seed menu. A real restaurant's own menu (especially
          // a small one, or one that sells non-veg food) could be destroyed just by loading
          // the app. It now loads exactly what was stored: no filtering, no reseeding.
          //
          // The only thing still backfilled is translations for an item that IS one of our
          // own bundled seed items (matched by id/sku) and doesn't have translations yet —
          // never applied to a restaurant's own items, and never touches imageUrl.
          const translationsMap = new Map<string, MenuItem['translations']>();
          SEED_MENU_ITEMS.forEach((s) => {
            if (s.translations) {
              translationsMap.set(s.id, s.translations);
              if (s.sku) translationsMap.set(s.sku, s.translations);
            }
          });

          this.menuItems = parsed.map((it: any) => {
            const seedTranslations = translationsMap.get(it.id) || translationsMap.get(it.sku);
            return seedTranslations && !it.translations ? { ...it, translations: seedTranslations } : it;
          });
        }
      }

      const storedCats = localStorage.getItem(`${p}categories`);
      if (storedCats) this.categories = JSON.parse(storedCats);

      const storedMods = localStorage.getItem(`${p}modifier_groups`);
      if (storedMods) this.modifierGroups = JSON.parse(storedMods);

      const storedCombos = localStorage.getItem(`${p}combos`);
      if (storedCombos) {
        try {
          const parsedCombos = JSON.parse(storedCombos);
          if (Array.isArray(parsedCombos)) {
            // Same stale-localStorage-vs-fresh-seed gap as menuItems above —
            // a browser that already saved combos before translations were
            // added to them would otherwise show combo names/descriptions
            // in English forever, regardless of the selected language.
            const comboTranslationsById: Record<string, ComboDeal['translations']> = {
              'combo-biryani-feast': {
                hi: { name: 'रॉयल वेज बिरयानी फीस्ट कॉम्बो', description: 'रॉयल वेज हांडी दम बिरयानी + बूंदी रायता + ठंडी कोल्ड कॉफी + 2 पीस शाही गुलाब जामुन' },
                gu: { name: 'રોયલ વેજ બિરયાની ફિસ્ટ કોમ્બો', description: 'રોયલ વેજ હાંડી દમ બિરયાની + બૂંદી રાયતું + ઠંડી કોલ્ડ કોફી + 2 પીસ શાહી ગુલાબ જામુન' }
              },
              'combo-paneer-meal': {
                hi: { name: 'महाराजा पनीर थाली कॉम्बो', description: 'पनीर बटर मसाला + 2x बटर नान + दाल मखनी + कोल्ड कॉफी विथ आइसक्रीम' },
                gu: { name: 'મહારાજા પનીર થાળી કોમ્બો', description: 'પનીર બટર મસાલા + 2x બટર નાન + દાળ મખની + કોલ્ડ કોફી વિથ આઇસક્રીમ' }
              }
            };
            this.combos = parsedCombos.map((c: ComboDeal) =>
              !c.translations && comboTranslationsById[c.id] ? { ...c, translations: comboTranslationsById[c.id] } : c
            );
          }
        } catch (_) {}
      }

      const storedLoyaltyTiers = localStorage.getItem(`${p}loyalty_tiers`);
      if (storedLoyaltyTiers) this.loyaltyTiers = JSON.parse(storedLoyaltyTiers);

      const storedLoyaltyRewards = localStorage.getItem(`${p}loyalty_rewards`);
      if (storedLoyaltyRewards) this.loyaltyRewards = JSON.parse(storedLoyaltyRewards);

      const storedStaffSchedules = localStorage.getItem(`${p}staff_schedules`);
      if (storedStaffSchedules) this.staffSchedules = JSON.parse(storedStaffSchedules);

      const storedAttendanceRecords = localStorage.getItem(`${p}attendance_records`);
      if (storedAttendanceRecords) this.attendanceRecords = JSON.parse(storedAttendanceRecords);

      const storedMarketingCampaigns = localStorage.getItem(`${p}marketing_campaigns`);
      if (storedMarketingCampaigns) this.marketingCampaigns = JSON.parse(storedMarketingCampaigns);

      const storedDeliveryRiders = localStorage.getItem(`${p}delivery_riders`);
      if (storedDeliveryRiders) this.deliveryRiders = JSON.parse(storedDeliveryRiders);

      const storedReceiptConfig = localStorage.getItem(`${p}receipt_config`);
      if (storedReceiptConfig) this.receiptConfig = JSON.parse(storedReceiptConfig);

      const storedReceiptRecords = localStorage.getItem(`${p}receipt_records`);
      if (storedReceiptRecords) this.receiptRecords = JSON.parse(storedReceiptRecords);

      const storedPrintJobs = localStorage.getItem(`${p}print_jobs`);
      if (storedPrintJobs) this.printJobs = JSON.parse(storedPrintJobs);

      const storedOrders = localStorage.getItem(`${p}orders`);
      if (storedOrders) {
        try {
          const parsed = JSON.parse(storedOrders);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const map = new Map<string, Order>();
            // Add fresh seed orders (which includes today's live orders)
            generateSeedOrders().forEach((o) => map.set(o.id, o));
            // Layer on stored orders so user-created orders take precedence
            parsed.forEach((o: Order) => map.set(o.id, o));
            this.orders = Array.from(map.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          } else {
            this.orders = generateSeedOrders();
          }
        } catch {
          this.orders = generateSeedOrders();
        }
      } else {
        this.orders = generateSeedOrders();
      }

      this.floorPlanStartedEmpty = localStorage.getItem(`${p}floor_plan_started_empty`) === 'true';
      const storedTables = localStorage.getItem(`${p}tables`);
      if (storedTables) {
        try {
          const parsedTables = JSON.parse(storedTables);
          // Only use stored tables if non-empty — unless the restaurant deliberately started with no
          // tables (BUG-115); otherwise fall back to the seed if an empty array was persisted.
          if (Array.isArray(parsedTables) && (parsedTables.length > 0 || this.floorPlanStartedEmpty)) {
            this.tables = parsedTables;
          } else {
            this.tables = SEED_TABLES.map((t) => ({ ...t }));
          }
        } catch {
          this.tables = SEED_TABLES.map((t) => ({ ...t }));
        }
      } else {
        this.tables = SEED_TABLES.map((t) => ({ ...t }));
      }

      // Guarantee all tables have valid, persistent qrToken, qrShortCode, and qrCodeUrl
      this.tables.forEach((t) => {
        const seedMatch = SEED_TABLES.find((st) => st.tableNumber === t.tableNumber);
        if (!t.qrToken) {
          t.qrToken = seedMatch?.qrToken || `jv_qr_tbl_${t.tableNumber}_${t.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        }
        if (!t.qrShortCode) {
          t.qrShortCode = seedMatch?.qrShortCode || `QR-TABLE-${t.tableNumber.padStart(3, '0')}`;
        }
        if (!t.qrStatus) {
          t.qrStatus = 'ACTIVE';
        }
        if (!t.qrCodeUrl) {
          // BUG-119: the app's configured public address, never a hardcoded localhost fallback.
          t.qrCodeUrl = `${getGuestOrderBaseUrl()}/?qrTable=${t.tableNumber}&token=${t.qrToken}`;
        }
      });

      const storedCoupons = localStorage.getItem(`${p}coupons`);
      if (storedCoupons) this.coupons = JSON.parse(storedCoupons);

      const storedKiosks = localStorage.getItem(`${p}kiosks`);
      if (storedKiosks) this.kiosks = JSON.parse(storedKiosks);

      const storedReqs = localStorage.getItem(`${p}service_requests`);
      if (storedReqs) this.serviceRequests = JSON.parse(storedReqs);

      const storedAudits = localStorage.getItem(`${p}audit_logs`);
      if (storedAudits) this.auditLogs = JSON.parse(storedAudits);

      const storedShifts = localStorage.getItem(`${p}shifts`);
      if (storedShifts) {
        try {
          const parsedShifts = JSON.parse(storedShifts);
          if (Array.isArray(parsedShifts) && parsedShifts.length > 0) {
            const todayStr = new Date().toDateString();
            // Verify active shift is for today; if from yesterday/older, close it and ensure fresh today shift
            const hasStaleActiveShift = parsedShifts.some(
              (s: ShiftRecord) => s.status === 'OPEN' && new Date(s.openedAt).toDateString() !== todayStr
            );
            if (hasStaleActiveShift) {
              parsedShifts.forEach((s: ShiftRecord) => {
                if (s.status === 'OPEN' && new Date(s.openedAt).toDateString() !== todayStr) {
                  s.status = 'CLOSED';
                  s.closedAt = s.closedAt || new Date(s.openedAt).toISOString();
                }
              });
              const freshSeed = generateSeedShifts();
              const activeSeed = freshSeed.find((s) => s.status === 'OPEN');
              if (activeSeed && !parsedShifts.some((s: ShiftRecord) => s.status === 'OPEN')) {
                parsedShifts.unshift(activeSeed);
              }
            }
            this.shifts = parsedShifts;
          } else {
            this.shifts = generateSeedShifts();
          }
        } catch {
          this.shifts = generateSeedShifts();
        }
      } else {
        this.shifts = generateSeedShifts();
      }

      const storedCashMovements = localStorage.getItem(`${p}cash_movements`);
      if (storedCashMovements) this.cashMovements = JSON.parse(storedCashMovements);

      const storedKots = localStorage.getItem(`${p}kots`);
      if (storedKots) this.kots = JSON.parse(storedKots);

      const storedHeld = localStorage.getItem(`${p}held_orders`);
      if (storedHeld) this.heldOrders = JSON.parse(storedHeld);

      const storedReservations = localStorage.getItem(`${p}reservations`);
      if (storedReservations) this.reservations = JSON.parse(storedReservations);

      const storedWaitlist = localStorage.getItem(`${p}waitlist`);
      if (storedWaitlist) this.waitlist = JSON.parse(storedWaitlist);

      const storedInventory = localStorage.getItem(`${p}inventory_items`);
      if (storedInventory) this.inventoryItems = JSON.parse(storedInventory);

      const storedMovements = localStorage.getItem(`${p}stock_movements`);
      if (storedMovements) this.stockMovements = JSON.parse(storedMovements);

      const storedSuppliers = localStorage.getItem(`${p}suppliers`);
      if (storedSuppliers) this.suppliers = JSON.parse(storedSuppliers);
      const storedReceipts = localStorage.getItem(`${p}goods_receipts`);
      if (storedReceipts) this.goodsReceipts = JSON.parse(storedReceipts);
      const storedBatches = localStorage.getItem(`${p}inventory_batches`);
      if (storedBatches) this.inventoryBatches = JSON.parse(storedBatches);
      const storedCounts = localStorage.getItem(`${p}stock_counts`);
      if (storedCounts) this.stockCounts = JSON.parse(storedCounts);

      const storedRecipes = localStorage.getItem(`${p}recipes`);
      if (storedRecipes) this.recipes = JSON.parse(storedRecipes);

      const storedCustomers = localStorage.getItem(`${p}customer_accounts`);
      if (storedCustomers) this.customerAccounts = JSON.parse(storedCustomers);

      const storedUsers = localStorage.getItem(`${p}users`);
      if (storedUsers) this.users = JSON.parse(storedUsers);

      const storedRoles = localStorage.getItem(`${p}roles`);
      if (storedRoles) this.roles = JSON.parse(storedRoles);

      const storedPrinters = localStorage.getItem(`${p}configured_printers`);
      if (storedPrinters) this.configuredPrinters = JSON.parse(storedPrinters);

      const storedLicense = localStorage.getItem(`${p}license`);
      if (storedLicense) this.license = JSON.parse(storedLicense);

      const storedTaxGroups = localStorage.getItem(`${p}tax_groups`);
      if (storedTaxGroups) this.taxGroups = JSON.parse(storedTaxGroups);

      const storedBusinessDays = localStorage.getItem(`${p}business_days`);
      if (storedBusinessDays) {
        try {
          const parsedDays = JSON.parse(storedBusinessDays);
          if (Array.isArray(parsedDays) && parsedDays.length > 0) {
            this.businessDays = parsedDays;
          }
        } catch (_) {}
      }

      const storedEodReports = localStorage.getItem(`${p}eod_reports`);
      if (storedEodReports) {
        try {
          const parsedReports = JSON.parse(storedEodReports);
          if (Array.isArray(parsedReports)) this.eodReports = parsedReports;
        } catch (_) {}
      }

      const storedNotifs = localStorage.getItem(`${p}notifications`);
      if (storedNotifs) {
        try {
          const parsedNotifs = JSON.parse(storedNotifs);
          if (Array.isArray(parsedNotifs)) this.notifications = parsedNotifs;
        } catch (_) {}
      }

      const storedSyncEvents = localStorage.getItem(`${p}sync_events`);
      if (storedSyncEvents) {
        try {
          const parsedSyncEvents = JSON.parse(storedSyncEvents);
          if (Array.isArray(parsedSyncEvents)) this.syncEvents = parsedSyncEvents;
        } catch (_) {}
      }

      const storedKioskDisplaySettings = localStorage.getItem(`${p}kiosk_display_settings`);
      if (storedKioskDisplaySettings) {
        try {
          this.kioskDisplaySettings = { ...DEFAULT_KIOSK_DISPLAY_SETTINGS, ...JSON.parse(storedKioskDisplaySettings) };
        } catch (_) {}
      }

      const storedWelcomeScreenSettings = localStorage.getItem(`${p}welcome_screen_settings`);
      if (storedWelcomeScreenSettings) {
        try {
          this.welcomeScreenSettings = { ...DEFAULT_WELCOME_SCREEN_SETTINGS, ...JSON.parse(storedWelcomeScreenSettings) };
        } catch (_) {}
      }

      const storedQrSettings = localStorage.getItem(`${p}qr_settings`);
      if (storedQrSettings) {
        try {
          this.qrSettings = { ...DEFAULT_QR_SETTINGS, ...JSON.parse(storedQrSettings) };
        } catch (_) {}
      }

      const storedTokenSequenceResets = localStorage.getItem(`${p}token_sequence_resets`);
      if (storedTokenSequenceResets) {
        try {
          const parsed = JSON.parse(storedTokenSequenceResets);
          if (parsed && typeof parsed === 'object') this.tokenSequenceResets = parsed;
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Storage load failed:', e);
    }
  }

  public updateRestaurant(data: Partial<Restaurant>): Restaurant {
    this.restaurant = {
      ...this.restaurant,
      ...data,
      updatedAt: new Date().toISOString()
    };
    this.notify();
    return this.restaurant;
  }

  public updateOutlet(data: Partial<Outlet>): Outlet {
    this.outlet = {
      ...this.outlet,
      ...data,
      updatedAt: new Date().toISOString()
    };
    this.notify();
    return this.outlet;
  }

  private batchDepth = 0;
  private batchDirty = false;

  /**
   * Runs `fn` and announces its changes once at the end (BUG-033). Settling a bill notifies about
   * ten times (order, receipt, print job, audit log, cash drawer...); inside a batch those collapse
   * into a single save, cloud push, broadcast and UI refresh. Batches nest; only the outermost one
   * flushes, and it flushes even if `fn` throws.
   */
  public batch<T>(fn: () => T): T {
    this.batchDepth += 1;
    try {
      return fn();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.batchDirty) {
        this.batchDirty = false;
        this.notify();
      }
    }
  }

  public notify(): void {
    if (this.batchDepth > 0) {
      this.batchDirty = true;
      return;
    }
    this.saveToStorage();
    this.pushToServer();
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({ type: 'DB_SYNC', timestamp: Date.now() });
      }
    } catch (e) {
      // Ignore broadcast errors
    }
    this.listeners.forEach((fn) => fn());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public resetToDefaultSeed(): void {
    this.restaurant = { ...SEED_RESTAURANT };
    this.outlet = { ...SEED_OUTLET };
    this.categories = [...SEED_CATEGORIES];
    this.modifierGroups = [...SEED_MODIFIER_GROUPS];
    this.menuItems = [...SEED_MENU_ITEMS];
    this.tables = SEED_TABLES.map((t) => ({ ...t }));
    this.floorPlanStartedEmpty = false;
    this.coupons = [...SEED_COUPONS];
    this.offers = [...SEED_OFFERS];
    this.taxGroups = [...SEED_TAX_GROUPS];
    this.shifts = generateSeedShifts();
    this.orders = generateSeedOrders();
    this.tokenSequenceResets = {};
    this.notify();
  }
}

export const db = JamanvaarDatabase.getInstance();

import { LocalRelayConnection, readRelayEvents } from './local_relay_connection';
import { KeyValueStore } from './key_value_store';
import { encryptCustomerAccountsForStorage, decodeStoredCustomerAccounts, generateDeviceKeyHex } from './pii_encryption';
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
  LoyaltyProgramSettings,
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
import type { DurableCommand, DurableCommandResult, DurableRecoverySnapshot, StoreOp } from './durable/sql_kv_engine';
import { protectRecovery } from './durable/protected_recovery';

// The complete set serialized by saveToStorage, including encrypted customers.
const FINANCIAL_STATE_FIELDS = [
  'restaurant', 'outlet', 'menuItems', 'categories', 'modifierGroups', 'combos', 'loyaltyTiers',
  'loyaltyRewards', 'loyaltyProgramSettings', 'staffSchedules', 'attendanceRecords', 'staffPayRates',
  'marketingCampaigns', 'deliveryRiders', 'receiptConfig', 'receiptRecords', 'paymentTransactions',
  'receipts', 'printJobs', 'orders', 'tables', 'floorPlanStartedEmpty', 'coupons', 'kiosks',
  'serviceRequests', 'auditLogs', 'shifts', 'cashMovements', 'kots', 'heldOrders', 'reservations',
  'waitlist', 'inventoryItems', 'stockMovements', 'suppliers', 'goodsReceipts', 'inventoryBatches',
  'stockCounts', 'recipes', 'customerAccounts', 'users', 'roles', 'configuredPrinters', 'license',
  'taxGroups', 'businessDays', 'eodReports', 'notifications', 'syncEvents', 'kioskDisplaySettings',
  'welcomeScreenSettings', 'tokenSequenceResets', 'qrSettings'
] as const;

interface FinancialIntent {
  version: 1;
  command: DurableCommand;
}

function parseRecoveryJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new Error('The saved operation is damaged. Keep this device intact for support; do not collect payment again.'); }
}

export interface FinancialMutationResult<T> {
  operationId: string;
  outcome: 'COMMITTED' | 'REPLAYED';
  result: T;
}

export interface PendingFinancialRecovery {
  operationId: string;
  orderId: string;
}

/**
 * Universal Database Client for JAMANVAAR
 * Runs with synchronous zero-latency local caching, persistent localStorage backing,
 * and transactional state safety.
 */
/** The storage shape the database needs: the browser's localStorage, or the SQLite-backed DurableStorage. */
export interface DbStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** True when writes made in the same tick are committed as one atomic transaction. */
  readonly atomicBatches?: boolean;
  commitCommand?(command: DurableCommand): Promise<DurableCommandResult>;
  flush?(): Promise<void>;
  exportRecovery?(scope: string): Promise<DurableRecoverySnapshot>;
  health?(): { ok: boolean; error: string | null; commitState?: 'CLOSED' | 'FAILED' | 'PENDING' | 'COMMITTED'; pendingWrites?: number };
  onRemoteChange?: ((ops: Array<{ op: 'set'; key: string; value: string } | { op: 'remove'; key: string }>) => void) | null;
  subscribeRemote?: (listener: NonNullable<DbStorage['onRemoteChange']>) => () => void;
}

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
    { id: 'reward-100off', name: '₹100 Off Bill', description: 'Flat ₹100 off the total bill', pointsCost: 150, isActive: true, discountKind: 'FIXED', discountAmount: 100 },
    { id: 'reward-starter', name: 'Free Starter', description: 'Any starter under ₹250', pointsCost: 200, isActive: true },
    { id: 'reward-meal', name: 'Free Meal for Two', description: 'A full meal for two guests', pointsCost: 800, isActive: true }
  ];

  // The base earn rate every tier's multiplier is applied on top of — a single-row "collection" so it
  // reuses the same sync mechanism as loyaltyTiers/loyaltyRewards. Default matches the rate that used to
  // be hardcoded (1 point per ₹10 spent), so an existing restaurant's program behaves the same until an
  // admin actually changes it.
  public loyaltyProgramSettings: LoyaltyProgramSettings[] = [{ id: 'default', earnPoints: 1, perRupeesSpent: 10 }];

  // Staff scheduling & attendance — previously nonexistent; StaffRepository
  // only ever managed login accounts, not who's rostered to work when or
  // whether they actually showed up.
  public staffSchedules: StaffShiftSchedule[] = [];
  public attendanceRecords: AttendanceRecord[] = [];
  /** Hourly pay by staff id (rupees). Kept on this device only: staff records sync to every terminal, and wages must not. */
  public staffPayRates: Record<string, number> = {};

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

  private readonly initialReceiptConfig = { ...this.receiptConfig };

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
  private serverSyncUnauthorized = false;
  private serverSyncConnected = false;
  private serverSyncScope = '';
  private serverSyncGeneration = 0;
  private serverSyncPollTimer: ReturnType<typeof setInterval> | null = null;
  private serverSyncStream: AbortController | null = null;
  private relayFingerprint(): string { return JSON.stringify([this.getSyncServerUrl(), LocalRelayConnection.scope()]); }
  public isLocalCorePaired(): boolean { return !!LocalRelayConnection.token(this.getSyncServerUrl()); }
  public isLocalCoreConnected(): boolean { return this.serverSyncConnected && this.serverSyncScope === this.relayFingerprint(); }
  /** Storage boot must restore pairing after the app's tenant-scoped store is attached. */
  public refreshLocalCoreConnection(): void { this.initServerSync(); }
  public unpairLocalCore(): void { LocalRelayConnection.forget(this.getSyncServerUrl()); this.markLocalCoreUnauthorized(); }
  public resetKioskConfiguration(): void {
    this.kioskDisplaySettings = structuredClone(DEFAULT_KIOSK_DISPLAY_SETTINGS);
    this.welcomeScreenSettings = { ...DEFAULT_WELCOME_SCREEN_SETTINGS };
    this.receiptConfig = { ...this.initialReceiptConfig, restaurantName: '', address: '', phone: '', gstin: '', fssaiNumber: '' };
  }
  public async pairLocalCore(pin: string, url = this.getSyncServerUrl()): Promise<void> {
    await LocalRelayConnection.pair(url, pin);
    this.setSyncServerUrl(url);
    if (!await this.forceSyncNow(true)) throw new Error('Pairing saved, but Local Core did not complete the first sync. Check the server and reconnect.');
  }
  public async localCoreFetch(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.legacySyncEnabled()) throw new Error('Local Core transport is unavailable for this app address.');
    const scope = this.relayFingerprint();
    const response = await LocalRelayConnection.request(this.getSyncServerUrl(), path, init);
    if (response.status === 401 && scope === this.relayFingerprint()) this.markLocalCoreUnauthorized();
    return response;
  }
  private legacySyncEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    const configured = this.customSyncServerUrl || KeyValueStore.get('jamanvaar_sync_server_url');
    if (!window.location) return false;
    if (configured) return window.location.protocol !== 'https:' || configured.startsWith('https://');
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  }
  /** True when this restaurant/branch has no saved pairing or the server rejected it. */
  public isLocalCoreUnauthorized(): boolean {
    return !this.isLocalCorePaired() || this.serverSyncUnauthorized;
  }

  public markLocalCoreUnauthorized(): void {
    this.serverSyncUnauthorized = true;
    this.serverSyncConnected = false;
    this.serverSyncStream?.abort();
    this.listeners.forEach(fn => fn());
  }

  private listeners: Set<() => void> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  public getSyncServerUrl(): string {
    if (this.customSyncServerUrl && this.customSyncServerUrl.trim().length > 0) {
      return this.customSyncServerUrl.trim().replace(/\/+$/, '');
    }
    const customUrl = KeyValueStore.get('jamanvaar_sync_server_url');
    if (customUrl && customUrl.trim().length > 0) {
      return customUrl.trim().replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      return `http://${window.location.hostname}:5178`;
    }
    return 'http://localhost:5178';
  }

  /** Health address of this app's Local Core, or undefined when no Local Core is set up here (cloud sync is used alone). */
  public localCoreHealthUrl(): string | undefined {
    return this.legacySyncEnabled() ? `${this.getSyncServerUrl()}/api/health` : undefined;
  }

  public setSyncServerUrl(url: string): void {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    this.customSyncServerUrl = cleanUrl;
    KeyValueStore.set('jamanvaar_sync_server_url', cleanUrl);
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

  private relayOrderIsNewer(incoming: Order, current: Order): boolean {
    const incomingTime = Date.parse(incoming.updatedAt || incoming.createdAt || '') || 0;
    const currentTime = Date.parse(current.updatedAt || current.createdAt || '') || 0;
    return incomingTime > currentTime;
  }

  public async forceSyncNow(publish = false): Promise<boolean> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 1500) : null;
    try {
      const scope = this.relayFingerprint();
      const res = await this.localCoreFetch(`/api/sync`, { signal: controller?.signal });
      if (timeoutId) clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (scope !== this.relayFingerprint()) return false;
        this.serverSyncConnected = true;
        // An empty new relay is not an authoritative empty restaurant snapshot.
        if (!data._relayInitialized) {
          if (publish) this.pushToServer();
          this.listeners.forEach(fn => fn());
          return true;
        }
        if (data && data.orders && Array.isArray(data.orders)) {
          const map = new Map<string, Order>();
          this.orders.forEach((o) => map.set(o.id, o));
          data.orders.forEach((o: Order) => { const existing = map.get(o.id); if (!existing || this.relayOrderIsNewer(o, existing)) map.set(o.id, o); });
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
        this.saveToStorage();
        if (publish) this.pushToServer();
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
    if (!this.legacySyncEnabled()) return;
    if (this.isLocalCoreUnauthorized()) return;
    try {
      this.localCoreFetch(`/api/sync`, {
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
          staffPayRates: this.staffPayRates,
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
          configuredPrinters: this.configuredPrinters,
          taxGroups: this.taxGroups
        })
      }).catch(() => {});
    } catch {
      // Ignore network errors
    }
  }

  private initServerSync(): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    this.serverSyncStream?.abort();
    this.serverSyncStream = null;
    if (this.serverSyncPollTimer) clearInterval(this.serverSyncPollTimer);
    this.serverSyncPollTimer = null;
    this.serverSyncConnected = false;
    this.serverSyncScope = this.relayFingerprint();
    const generation = ++this.serverSyncGeneration;
    if (!this.legacySyncEnabled() || !this.isLocalCorePaired()) {
      this.serverSyncUnauthorized = true;
      return;
    }
    this.serverSyncUnauthorized = false;
    const current = () => generation === this.serverSyncGeneration && this.serverSyncScope === this.relayFingerprint();
    const startStream = async () => {
      if (!current() || this.serverSyncStream || this.isLocalCoreUnauthorized()) return;
      const controller = new AbortController();
      this.serverSyncStream = controller;
      try {
        const response = await this.localCoreFetch('/api/events', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await readRelayEvents(response, raw => {
          if (!current()) return;
          try {
            const parsed = JSON.parse(raw || '{}');
            const evtType = parsed.event || parsed.type;

            if ((evtType === 'DB_UPDATE' || evtType === 'SYNC') && parsed.state) {
              if (parsed.state.orders && Array.isArray(parsed.state.orders)) {
                const map = new Map<string, Order>();
                this.orders.forEach((o) => map.set(o.id, o));
                parsed.state.orders.forEach((o: Order) => { const existing = map.get(o.id); if (!existing || this.relayOrderIsNewer(o, existing)) map.set(o.id, o); });
                this.orders = Array.from(map.values()).sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
              }
              if (parsed.state.restaurant) this.restaurant = { ...this.restaurant, ...parsed.state.restaurant };
              if (parsed.state.outlet) this.outlet = { ...this.outlet, ...parsed.state.outlet };
              if (Array.isArray(parsed.state.categories)) this.categories = parsed.state.categories;
              if (Array.isArray(parsed.state.menuItems)) this.menuItems = parsed.state.menuItems;
              if (Array.isArray(parsed.state.shifts)) this.shifts = parsed.state.shifts;
              if (Array.isArray(parsed.state.kots)) this.kots = parsed.state.kots;
              if (Array.isArray(parsed.state.heldOrders)) this.heldOrders = parsed.state.heldOrders;
              if (Array.isArray(parsed.state.tables)) this.tables = parsed.state.tables;
              if (Array.isArray(parsed.state.inventoryItems)) this.inventoryItems = parsed.state.inventoryItems;
              if (Array.isArray(parsed.state.stockMovements)) this.stockMovements = parsed.state.stockMovements;
              if (Array.isArray(parsed.state.recipes)) this.recipes = parsed.state.recipes;
              if (Array.isArray(parsed.state.customerAccounts)) this.customerAccounts = parsed.state.customerAccounts;
              if (Array.isArray(parsed.state.configuredPrinters)) this.configuredPrinters = parsed.state.configuredPrinters;
              if (Array.isArray(parsed.state.taxGroups)) this.taxGroups = parsed.state.taxGroups;
              
              this.listeners.forEach((fn) => fn());
            } else if (evtType === 'ORDER_CREATED' && parsed.order) {
              const ord = parsed.order as Order;
              const idx = this.orders.findIndex((o) => o.id === ord.id || o.orderNumber === ord.orderNumber);
              if (idx >= 0) { if (this.relayOrderIsNewer(ord, this.orders[idx])) this.orders[idx] = { ...this.orders[idx], ...ord }; }
              else this.orders.unshift(ord);
              this.listeners.forEach((fn) => fn());
            } else if (evtType === 'ORDER_STATUS_CHANGED' && parsed.orderId) {
              const ord = this.orders.find((o) => o.id === parsed.orderId);
              if (ord) {
                if (parsed.order && !this.relayOrderIsNewer(parsed.order, ord)) return;
                Object.assign(ord, parsed.order || { orderStatus: parsed.orderStatus });
                this.listeners.forEach((fn) => fn());
              }
            }

            this.saveToStorage();
          } catch { /* Ignore malformed event frames. */ }
        });
      } catch { /* The existing fallback interval reconnects after a successful sync. */ }
      finally { if (this.serverSyncStream === controller) this.serverSyncStream = null; }
    };
    let pulling = false;
    const pull = async () => {
      if (!current()) { this.initServerSync(); return; }
      if (pulling || this.isLocalCoreUnauthorized()) return;
      pulling = true;
      try {
        if (await this.forceSyncNow() && current()) void startStream();
        else if (current()) { this.serverSyncConnected = false; this.listeners.forEach(fn => fn()); }
      } finally { pulling = false; }
    };
    void pull();
    this.serverSyncPollTimer = setInterval(() => {
      if (this.isLocalCoreUnauthorized()) {
        if (this.serverSyncPollTimer) clearInterval(this.serverSyncPollTimer);
        this.serverSyncPollTimer = null;
        return;
      }
      void pull();
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
            // SQLite's own scoped channel applies persisted changes before notifying.
            // The old global bus fired before that write completed, reloading stale
            // follower caches (and waking unrelated apps on the same production origin).
            if (!this.store?.subscribeRemote && ev.data?.type === 'DB_SYNC'
              && ev.data.scope === KeyValueStore.browserKey(this.storagePrefix)) {
              this.loadFromStorage();
              this.listeners.forEach((fn) => fn());
            }
          };
        }
      } catch (e) {
        console.warn('BroadcastChannel setup error:', e);
      }

      window.addEventListener('storage', (e) => {
        if (!this.store?.subscribeRemote && e.key?.startsWith(KeyValueStore.browserKey(this.storagePrefix))) {
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

  /**
   * Where collections are persisted. Until a durable store is attached this is the browser's localStorage;
   * once attached (see attachDurableStorage) it is SQLite, read synchronously from memory and written
   * atomically in the background.
   */
  private store: DbStorage | null = null;
  private unsubscribeStore: (() => void) | null = null;

  private ls(): DbStorage | null {
    if (this.store) return this.store;
    try {
      return typeof localStorage === 'undefined' ? null : (localStorage as unknown as DbStorage);
    } catch {
      return null;
    }
  }

  /** Switches this database to a durable store and reloads everything from it. Call once at startup, before the UI renders. */
  public discardUnscopedCache(): void {
    for (const key of Object.keys(this)) {
      const record = this as unknown as Record<string, unknown>;
      if (Array.isArray(record[key]) && key !== 'roles') record[key] = [];
    }
    this.restaurant = { ...SEED_RESTAURANT };
    this.outlet = { ...SEED_OUTLET };
    this.qrSettings = { ...DEFAULT_QR_SETTINGS };
    this.kioskDisplaySettings = { ...DEFAULT_KIOSK_DISPLAY_SETTINGS };
    this.welcomeScreenSettings = { ...DEFAULT_WELCOME_SCREEN_SETTINGS };
    this.receiptConfig = { ...this.initialReceiptConfig };
    this.roles = [...SEED_ROLES];
    this.tokenSequenceResets = {};
    this.floorPlanStartedEmpty = false;
  }

  public attachDurableStorage(store: DbStorage): void {
    if (this.financialBusy) throw new Error('Finish or recover the pending checkout before switching local storage.');
    this.store = store;
    this.lastWritten.clear();
    this.persistenceError = null;
    this.loadFromStorage();
    // Another window on this machine changed the shared database: adopt its data, as the old storage event did.
    this.unsubscribeStore?.();
    const onRemoteChange: NonNullable<DbStorage['onRemoteChange']> = (ops) => {
      if (!ops.some((op) => op.key.startsWith(this.storagePrefix))) return;
      // The command compares these changes inside SQLite. Do not replace the
      // isolated preparation or expose an unacknowledged result to subscribers.
      if (this.financialBusy) return;
      for (const op of ops) {
        if (op.op === 'set') this.lastWritten.set(op.key, op.value);
        else this.lastWritten.delete(op.key);
      }
      this.loadFromStorage();
      this.listeners.forEach((fn) => fn());
    };
    if (store.subscribeRemote) this.unsubscribeStore = store.subscribeRemote(onRemoteChange);
    else {
      const previous = store.onRemoteChange;
      store.onRemoteChange = (ops) => { previous?.(ops); onRemoteChange(ops); };
    }
    this.listeners.forEach((fn) => fn());
  }

  /** Storage prefixes of every database instance, for the one-time import from localStorage. */
  public static knownPrefixes(): string[] {
    const prefixes = new Set<string>([JamanvaarDatabase.getInstance().storagePrefix]);
    for (const inst of JamanvaarDatabase.instancesByRole.values()) prefixes.add(inst.storagePrefix);
    return [...prefixes];
  }

  public static attachDurableStorageToAll(store: DbStorage): void {
    JamanvaarDatabase.getInstance().attachDurableStorage(store);
    for (const inst of JamanvaarDatabase.instancesByRole.values()) inst.attachDurableStorage(store);
  }

  private putIfChanged(fullKey: string, text: string): void {
    const localStorage = this.ls();
    if (!localStorage || this.lastWritten.get(fullKey) === text) return;
    localStorage.setItem(fullKey, text);
    this.lastWritten.set(fullKey, text);
  }

  private piiKeyHex: string | null = null;
  private lastCustomerAccountsPlaintext: string | null = null;
  private lastCustomerAccountsCiphertext: string | null = null;

  /**
   * security-audit LOW-pos-admin-02: the AES key that encrypts customerAccounts at rest (see
   * pii_encryption.ts), generated once per device/role and read through this.ls() directly --
   * never through KeyValueStore, whose own attach() happens in a separate step from
   * attachDurableStorage() (see browser_boot.ts) and is not guaranteed to run first. Reading
   * it any other way risks silently generating a fresh key before the real one is attached,
   * which would make every existing customer record undecryptable on next load.
   */
  private getOrCreatePiiKeyHex(): string {
    const localStorage = this.ls();
    const storageKey = `${this.storagePrefix}pii_key`;
    if (localStorage) {
      const existing = localStorage.getItem(storageKey);
      if (existing) {
        this.piiKeyHex = existing;
        return existing;
      }
    }
    if (this.piiKeyHex) return this.piiKeyHex;
    const fresh = generateDeviceKeyHex();
    this.piiKeyHex = fresh;
    localStorage?.setItem(storageKey, fresh);
    return fresh;
  }

  /** Last save failure (quota full, storage unavailable...), or null when the last save succeeded. */
  private persistenceError: string | null = null;

  /** Whether the last attempt to save to local storage succeeded. A failing store means recent changes exist only in memory. */
  public getPersistenceHealth(): { ok: boolean; error: string | null } {
    // A durable store writes in the background, so its failures surface here rather than as an exception.
    const background = this.store?.health?.();
    if (background && !background.ok) return { ok: false, error: background.error };
    return { ok: this.persistenceError === null, error: this.persistenceError };
  }

  /** Wait for already queued collections before acknowledging an external cursor.
   * This is an ordering barrier, not a replacement for financial command replay.
   * Legacy synchronous storage retains its existing behavior.
   */
  public async flushPersistence(): Promise<void> {
    if (this.financialBusy) throw new Error('A financial operation is being saved; retry synchronization afterwards.');
    const storage = this.store;
    await storage?.flush?.();
    if (storage !== this.store) throw new Error('Local storage changed during synchronization.');
    const health = this.getPersistenceHealth();
    if (!health.ok) throw new Error(health.error || 'Local changes have not been saved.');
  }

  private journalKey(): string {
    return `${this.storagePrefix}__journal`;
  }

  /**
   * Writes a set of changed collections so a crash part-way through cannot leave some of them
   * updated and others not. The full set is first written to ONE journal entry (a single setItem is
   * atomic); the collections are then written individually and the journal removed. On startup a
   * surviving journal is replayed (see recoverJournal), so a save is either fully applied or never
   * started. A single changed collection needs no journal.
   */
  private commitPending(pending: Map<string, string>): void {
    if (pending.size === 0) return;
    const localStorage = this.ls();
    if (!localStorage) return;
    const journalKey = this.journalKey();
    let journaled = false;
    // A store that already commits one tick's writes as a single transaction needs no separate journal.
    if (pending.size > 1 && !this.store?.atomicBatches) {
      try {
        localStorage.setItem(journalKey, JSON.stringify(Object.fromEntries(pending)));
        journaled = true;
      } catch {
        // Could not journal (e.g. quota): fall through to direct writes; failures are reported below.
      }
    }
    for (const [key, text] of pending) {
      localStorage.setItem(key, text);
      this.lastWritten.set(key, text);
    }
    if (journaled) localStorage.removeItem(journalKey);
  }

  /** Replays a journal left by a save that was interrupted, restoring all-or-nothing behaviour. */
  private recoverJournal(): void {
    const localStorage = this.ls();
    if (!localStorage) return;
    const journalKey = this.journalKey();
    const raw = localStorage.getItem(journalKey);
    if (!raw) return;
    try {
      const entries = JSON.parse(raw) as Record<string, string>;
      for (const [key, text] of Object.entries(entries)) localStorage.setItem(key, text);
    } catch {
      // A corrupt journal cannot be replayed; the collections on disk are the last consistent state.
    }
    try {
      localStorage.removeItem(journalKey);
    } catch {
      // Ignore: replaying it again later is harmless.
    }
  }

  private saveToStorage(): void {
    const localStorage = this.ls();
    if (!localStorage) return;
    try {
      const p = this.storagePrefix;
      const pending = new Map<string, string>();
      const put = (name: string, value: unknown) => {
        const key = `${p}${name}`;
        const text = JSON.stringify(value);
        if (this.lastWritten.get(key) !== text) pending.set(key, text);
      };
      put('restaurant', this.restaurant);
      put('outlet', this.outlet);
      put('menu_items', this.menuItems);
      put('categories', this.categories);
      put('modifier_groups', this.modifierGroups);
      put('combos', this.combos);
      put('loyalty_tiers', this.loyaltyTiers);
      put('loyalty_rewards', this.loyaltyRewards);
      put('loyalty_program_settings', this.loyaltyProgramSettings);
      put('staff_schedules', this.staffSchedules);
      put('attendance_records', this.attendanceRecords);
      put('staff_pay_rates', this.staffPayRates);
      put('marketing_campaigns', this.marketingCampaigns);
      put('delivery_riders', this.deliveryRiders);
      put('receipt_config', this.receiptConfig);
      put('receipt_records', this.receiptRecords);
      put('payment_transactions', this.paymentTransactions);
      put('receipts', this.receipts);
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
      // security-audit LOW-pos-admin-02: customer PII is encrypted at rest -- see pii_encryption.ts.
      // AES-GCM's nonce must differ every call, so re-encrypting on every save would make
      // customer_accounts always look "changed" to the lastWritten dedup above (BUG-033),
      // rewriting it on every notify() even when nothing in it actually changed. Caching by
      // plaintext keeps that optimization: only re-encrypt when the real content differs.
      const customersPlaintext = JSON.stringify(this.customerAccounts);
      if (customersPlaintext !== this.lastCustomerAccountsPlaintext) {
        this.lastCustomerAccountsPlaintext = customersPlaintext;
        this.lastCustomerAccountsCiphertext = encryptCustomerAccountsForStorage(this.customerAccounts, this.getOrCreatePiiKeyHex());
      }
      if (this.lastCustomerAccountsCiphertext !== null) put('customer_accounts', this.lastCustomerAccountsCiphertext);
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
      this.commitPending(pending);
      localStorage.setItem(`${p}sync_timestamp`, Date.now().toString());
      this.persistenceError = null;
    } catch (e) {
      // Never swallow this: the changes exist only in memory until a later save succeeds.
      this.persistenceError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('Local storage save failed - recent changes are not yet persisted:', e);
    }
  }

  private loadFromStorage(): void {
    const localStorage = this.ls();
    if (!localStorage) return;
    this.lastWritten.clear();
    this.recoverJournal();
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

      const storedLoyaltyProgramSettings = localStorage.getItem(`${p}loyalty_program_settings`);
      if (storedLoyaltyProgramSettings) this.loyaltyProgramSettings = JSON.parse(storedLoyaltyProgramSettings);

      const storedStaffSchedules = localStorage.getItem(`${p}staff_schedules`);
      if (storedStaffSchedules) this.staffSchedules = JSON.parse(storedStaffSchedules);

      const storedAttendanceRecords = localStorage.getItem(`${p}attendance_records`);
      if (storedAttendanceRecords) this.attendanceRecords = JSON.parse(storedAttendanceRecords);

      const storedPayRates = localStorage.getItem(`${p}staff_pay_rates`);
      if (storedPayRates) this.staffPayRates = JSON.parse(storedPayRates);

      const storedMarketingCampaigns = localStorage.getItem(`${p}marketing_campaigns`);
      if (storedMarketingCampaigns) this.marketingCampaigns = JSON.parse(storedMarketingCampaigns);

      const storedDeliveryRiders = localStorage.getItem(`${p}delivery_riders`);
      if (storedDeliveryRiders) this.deliveryRiders = JSON.parse(storedDeliveryRiders);

      const storedReceiptConfig = localStorage.getItem(`${p}receipt_config`);
      if (storedReceiptConfig) this.receiptConfig = JSON.parse(storedReceiptConfig);

      const storedReceiptRecords = localStorage.getItem(`${p}receipt_records`);
      if (storedReceiptRecords) this.receiptRecords = JSON.parse(storedReceiptRecords);

      const storedPaymentTransactions = localStorage.getItem(`${p}payment_transactions`);
      if (storedPaymentTransactions) this.paymentTransactions = JSON.parse(storedPaymentTransactions);
      const storedFinancialReceipts = localStorage.getItem(`${p}receipts`);
      if (storedFinancialReceipts) this.receipts = JSON.parse(storedFinancialReceipts);

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

      // security-audit LOW-pos-admin-02: customer PII is encrypted at rest -- see pii_encryption.ts.
      const storedCustomers = localStorage.getItem(`${p}customer_accounts`);
      if (storedCustomers) this.customerAccounts = decodeStoredCustomerAccounts(storedCustomers, this.getOrCreatePiiKeyHex());

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
  private transactionEffects: Array<Array<() => void>> = [];
  private financialBusy = false;
  private financialPreparing = false;
  private financialBaseline: Record<string, unknown> | null = null;

  public supportsFinancialCommands(): boolean { return !!this.store?.commitCommand && !!this.store.flush; }

  public hasPendingFinancialMutation(): boolean {
    return this.financialBusy || !!this.store?.getItem(`${this.storagePrefix}financial_command_pending`);
  }

  /** Only references are exposed to recovery UI; never the stored command or customer payload. */
  public getPendingFinancialRecovery(): PendingFinancialRecovery | null {
    if (this.financialBusy) throw new Error('A local save is still running. Wait before reviewing recovery.');
    const raw = this.store?.getItem(`${this.storagePrefix}financial_command_pending`);
    if (!raw) return null;
    const intent = parseRecoveryJson(raw) as FinancialIntent;
    const command = intent?.command;
    if (intent?.version !== 1 || !command || typeof command.operationId !== 'string' || !command.operationId.startsWith(`${this.storagePrefix}financial:`) ||
        !/^[a-f0-9]{64}$/.test(command.requestFingerprint) || !Array.isArray(command.ops) || !Array.isArray(command.expected) || typeof command.result !== 'string' ||
        command.ops.some(op => !op || typeof op.key !== 'string' || !op.key.startsWith(this.storagePrefix) || !['set', 'remove'].includes(op.op)) ||
        command.expected.some(entry => !entry || typeof entry.key !== 'string' || !entry.key.startsWith(this.storagePrefix))) throw new Error('The saved operation needs support review. Do not collect payment again.');
    const result = parseRecoveryJson(command.result) as { orderId?: unknown } | null;
    if (!result || typeof result.orderId !== 'string' || !result.orderId) throw new Error('The saved operation has no bill reference. Keep this device intact for support review.');
    const ordersOp = command.ops.find(op => op.op === 'set' && op.key === `${this.storagePrefix}orders`);
    const preparedOrders = ordersOp?.op === 'set' ? parseRecoveryJson(ordersOp.value) : [];
    if (!Array.isArray(preparedOrders)) throw new Error('The saved bill data needs support review.');
    const order = preparedOrders.find(order => order.id === result.orderId);
    // An unchanged result may already exist (for example an acknowledged no-op).
    const target = order ?? this.orders.find(order => order.id === result.orderId);
    if (!target || target.restaurantId !== this.restaurant.id || target.outletId !== this.outlet.id) throw new Error('The saved bill does not match this restaurant and branch. Open the original account for recovery.');
    return { operationId: command.operationId, orderId: result.orderId };
  }

  /** Resume only the exact prepared command, without reconstructing the cart or repeating hardware effects.
   * The caller must review/adopt its bill before acknowledging the operation.
   */
  public async recoverPendingFinancialMutation(expectedOperationId: string): Promise<FinancialMutationResult<{ orderId: string }>> {
    const pending = this.getPendingFinancialRecovery();
    if (!pending || pending.operationId !== expectedOperationId) throw new Error('The pending operation changed. Review its current bill before retrying.');
    const intent = JSON.parse(this.store!.getItem(`${this.storagePrefix}financial_command_pending`)!) as FinancialIntent;
    return this.commitFinancialMutation<{ orderId: string }>(intent.command.requestFingerprint, () => {
      throw new Error('The original operation is no longer available. A replacement collection was not created.');
    });
  }

  public getStorageStatus() {
    const mode = this.supportsFinancialCommands() ? 'SQLITE' as const : this.ls() ? 'LEGACY' as const : 'MEMORY' as const;
    const health = this.getPersistenceHealth();
    const backend = this.store?.health?.();
    return { mode, ok: mode !== 'MEMORY' && health.ok, error: health.error,
      commitState: backend?.commitState, pendingWrites: backend?.pendingWrites ?? 0 };
  }

  /** Business-data snapshot, deliberately excluding storage internals and local encryption keys. */
  public exportOperationalSnapshot(): Record<string, unknown> {
    if (this.financialBusy) throw new Error('Finish or recover the pending checkout before exporting a snapshot.');
    const record = this as unknown as Record<string, unknown>;
    return structuredClone(Object.fromEntries(FINANCIAL_STATE_FIELDS.map(field => [field, record[field]])));
  }

  public localRecoveryScope(): string { return JSON.stringify([this.restaurant.id, this.outlet.id]); }

  public async exportProtectedLocalRecovery(passphrase: string): Promise<string> {
    if (this.financialBusy) throw new Error('Finish or recover the pending checkout before creating a recovery backup.');
    if (!this.store?.exportRecovery) throw new Error('Complete device recovery requires SQLite storage. A JSON business snapshot is not a substitute.');
    return protectRecovery(await this.store.exportRecovery(this.localRecoveryScope()), passphrase);
  }

  /** A business JSON import must never replace live financial/replay history or tenant ownership. */
  public async assertOperationalRestoreSafe(snapshot: Record<string, unknown>): Promise<void> {
    if (this.financialBusy) throw new Error('Finish or recover the pending checkout before restoring data.');
    const restaurant = snapshot.restaurant as { id?: unknown } | undefined;
    const branch = snapshot.outlet as { id?: unknown } | undefined;
    if ((restaurant?.id && restaurant.id !== this.restaurant.id) || (branch?.id && branch.id !== this.outlet.id)) throw new Error('This snapshot belongs to a different restaurant or branch. Open the matching account; this import cannot change ownership.');
    const financialFields = ['orders', 'paymentTransactions', 'receipts', 'receiptRecords', 'shifts', 'cashMovements', 'stockMovements', 'inventoryItems', 'inventoryBatches', 'customerAccounts', 'syncEvents'];
    if (!financialFields.some(field => snapshot[field] !== undefined)) return;
    if (this.orders.length || this.paymentTransactions.length || this.cashMovements.length) throw new Error('This device already has financial history. A JSON snapshot cannot overwrite it. Use reviewed menu import for menu changes or complete recovery into an empty target.');
    if (this.supportsFinancialCommands()) {
      // Even an apparently empty tab may share SQLite with another window.
      // A check-then-overwrite would race its first checkout. Financial restore
      // is exclusively the engine's atomic empty-target recovery operation.
      throw new Error('SQLite operation history must be restored with its data. JSON snapshots omit replay protection; complete device recovery requires an empty target.');
    }
  }

  /**
   * Prepare real repository mutations in isolated collections, retain the exact
   * command before attempting it, and publish only its SQLite acknowledgement.
   * prepare MUST be synchronous and have no direct UI/hardware/network effects;
   * repository afterTransaction deliveries are deferred automatically.
   */
  public async commitFinancialMutation<T>(requestFingerprint: string, prepare: () => T): Promise<FinancialMutationResult<T>> {
    if (!/^[a-f0-9]{64}$/.test(requestFingerprint)) throw new Error('A SHA-256 financial request fingerprint is required');
    const storage = this.store;
    if (!storage?.commitCommand || !storage.flush) throw new Error('Safe checkout needs SQLite storage. Your draft is preserved; restore storage before collecting payment.');
    if (this.financialBusy || this.batchDepth) throw new Error('Another local operation is being saved. Wait before trying again.');
    this.financialBusy = true;
    const record = this as unknown as Record<string, unknown>;
    this.financialBaseline = Object.fromEntries(FINANCIAL_STATE_FIELDS.map(field => [field, structuredClone(record[field])]));
    const intentKey = `${this.storagePrefix}financial_command_pending`;
    let effects: Array<() => void> = [];
    try {
      let raw = storage.getItem(intentKey);
      // A lost command acknowledgement may leave health failed with no pending
      // writes. Retry its saved command directly; a flush cannot resolve it.
      if (!raw) {
        await storage.flush(); raw = storage.getItem(intentKey);
        // A sibling window may have committed while the flush was pending.
        // Prepare from its current acknowledged data, not our older cache.
        this.loadFromStorage();
        this.financialBaseline = Object.fromEntries(FINANCIAL_STATE_FIELDS.map(field => [field, structuredClone(record[field])]));
      }
      let intent: FinancialIntent;
      if (raw) {
        intent = JSON.parse(raw) as FinancialIntent;
        if (intent.version !== 1 || intent.command?.requestFingerprint !== requestFingerprint) throw new Error('An earlier checkout needs recovery. Retry its original cart and payment choice, or ask a manager to open Settings → Local DB & Sync → Finish an interrupted save. Do not start another collection.');
      } else {
        const originalWritten = this.lastWritten;
        const originalState = Object.fromEntries(FINANCIAL_STATE_FIELDS.map(field => [field, record[field]]));
        const originalMeta = [this.piiKeyHex, this.lastCustomerAccountsPlaintext, this.lastCustomerAccountsCiphertext, this.persistenceError] as const;
        const expected = new Map<string, string | null>();
        const changes = new Map<string, StoreOp>();
        const read = (key: string) => {
          if (!expected.has(key)) expected.set(key, storage.getItem(key));
          const change = changes.get(key);
          return change ? change.op === 'set' ? change.value : null : expected.get(key)!;
        };
        const staging: DbStorage = {
          atomicBatches: true,
          getItem: read,
          setItem: (key, value) => { read(key); changes.set(key, { op: 'set', key, value }); },
          removeItem: key => { read(key); changes.set(key, { op: 'remove', key }); }
        };
        let result: T;
        this.financialPreparing = true;
        this.transactionEffects.push(effects);
        try {
          for (const field of FINANCIAL_STATE_FIELDS) record[field] = structuredClone(record[field]);
          this.store = staging;
          // Include every persisted collection as a dependency, even if this
          // particular sale did not change it (prices, stock and roles included).
          this.lastWritten = new Map();
          result = prepare();
          if (result && typeof (result as { then?: unknown }).then === 'function') throw new Error('Financial preparation must be synchronous');
          this.saveToStorage();
          if (this.persistenceError) throw new Error(this.persistenceError);
          const encoded = JSON.stringify(result);
          if (encoded === undefined) throw new Error('Financial preparation needs JSON result references');
          intent = { version: 1, command: {
            operationId: `${this.storagePrefix}financial:${generateDeviceKeyHex()}`,
            requestFingerprint,
            expected: [...expected].map(([key, value]) => ({ key, value })),
            ops: [...changes.values()].filter(op => op.op === 'set' ? op.value !== expected.get(op.key) : expected.get(op.key) !== null),
            result: encoded
          } };
        } finally {
          Object.assign(this, originalState);
          this.store = storage;
          this.lastWritten = originalWritten;
          [this.piiKeyHex, this.lastCustomerAccountsPlaintext, this.lastCustomerAccountsCiphertext, this.persistenceError] = originalMeta;
          this.transactionEffects.pop();
          this.financialPreparing = false;
          this.batchDirty = false;
        }
        raw = JSON.stringify(intent!);
        // An interrupted preparation can waste a leased number, but cannot
        // expose a sale. The saved command carries its original order IDs.
        await storage.commitCommand({
          operationId: `${intent!.command.operationId}:prepare`, requestFingerprint,
          expected: [{ key: intentKey, value: null }],
          ops: [{ op: 'set', key: intentKey, value: raw }], result: '{}'
        });
      }
      const command = intent!.command;
      if (!command.operationId.startsWith(`${this.storagePrefix}financial:`) ||
          command.ops.some(op => !op.key.startsWith(this.storagePrefix) || op.key === intentKey) ||
          command.expected.some(entry => !entry.key.startsWith(this.storagePrefix) || entry.key === intentKey)) throw new Error('Invalid local financial recovery scope');
      let outcome: DurableCommandResult;
      try {
        outcome = await storage.commitCommand({ ...command, expected: [...command.expected, { key: intentKey, value: raw }] });
      } catch (error) {
        if ((error as { code?: string })?.code === 'LOCAL_VERSION_CONFLICT') {
          // SQLite proved this financial command did not apply. Release only
          // this exact intent, so an explicit review can produce a new command.
          // Unknown outcomes and ID reuse are deliberately never discarded.
          await storage.commitCommand({ operationId: `${command.operationId}:discard-rejected`, requestFingerprint,
            expected: [{ key: intentKey, value: raw }], ops: [{ op: 'remove', key: intentKey }], result: '{}' });
          this.loadFromStorage(); this.financialBaseline = null;
        }
        throw error;
      }
      this.loadFromStorage();
      this.financialBaseline = null;
      this.financialBusy = false;
      for (const listener of this.listeners) {
        try { listener(); } catch { console.error('Local view refresh failed; the bill remains saved'); }
      }
      // Replay never automatically repeats a drawer pulse, printer dispatch or
      // the original relay request. The persisted order remains uploadable.
      if (outcome.outcome === 'COMMITTED') for (const effect of effects) {
        try { effect(); } catch { console.error('Post-commit delivery failed; the bill remains saved'); }
      }
      try { this.pushToServer(); } catch { console.error('Order upload deferred; the bill remains saved'); }
      return { operationId: command.operationId, outcome: outcome.outcome, result: JSON.parse(outcome.result) as T };
    } finally {
      if (this.financialBaseline) Object.assign(this, this.financialBaseline);
      this.financialBaseline = null;
      this.financialBusy = false;
    }
  }

  /** Call only after the UI has adopted the recovered receipt and cleared its draft. */
  public async acknowledgeFinancialMutation(operationId: string): Promise<void> {
    const storage = this.store;
    if (!storage?.commitCommand) throw new Error('Financial recovery storage is unavailable');
    const key = `${this.storagePrefix}financial_command_pending`;
    const raw = storage.getItem(key);
    if (!raw) return;
    const intent = JSON.parse(raw) as FinancialIntent;
    if (intent.command.operationId !== operationId) throw new Error('A different financial operation needs recovery');
    await storage.commitCommand({ operationId: `${operationId}:ack`, requestFingerprint: intent.command.requestFingerprint,
      expected: [{ key, value: raw }], ops: [{ op: 'remove', key }], result: '{}' });
  }

  /** Defer external relay/hardware work until the enclosing synchronous mutation has succeeded. */
  public afterTransaction(effect: () => void): void {
    const current = this.transactionEffects[this.transactionEffects.length - 1];
    if (current) current.push(effect); else effect();
  }

  /**
   * Runs `fn` and announces its changes once at the end (BUG-033). Settling a bill notifies about
   * ten times (order, receipt, print job, audit log, cash drawer...); inside a batch those collapse
   * into a single save, cloud push, broadcast and UI refresh. Batches nest; only the outermost one
   * flushes, and it flushes even if `fn` throws.
   */
  public batch<T>(fn: () => T): T {
    if (this.financialBusy && !this.financialPreparing) throw new Error('A checkout is being saved. Wait before changing local data.');
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

  /**
   * Runs `fn` as one unit: its changes are announced/saved once (like batch), and if it throws, every
   * collection the core order/KOT/stock/cash flows touch is restored to how it was before `fn` ran,
   * so a failure half-way through can never leave an order without its KOT or a sale without its stock movement.
   */
  public transaction<T>(fn: () => T): T {
    const names = [
      'orders', 'kots', 'syncEvents', 'inventoryItems', 'stockMovements', 'cashMovements', 'shifts',
      'receiptRecords', 'printJobs', 'auditLogs', 'businessDays', 'heldOrders', 'customerAccounts', 'tables',
      // Consuming stock also changes FIFO batches, counted dish stock, availability
      // and low-stock alerts. These must roll back with the sale and movement rows.
      'inventoryBatches', 'menuItems', 'notifications', 'paymentTransactions', 'receipts'
    ] as const;
    const self = this as unknown as Record<string, unknown[]>;
    const snapshot = names.map((n) => [n, structuredClone(self[n])] as const);
    const effects: Array<() => void> = [];
    this.transactionEffects.push(effects);
    let result: T;
    try {
      result = this.batch(() => {
        try {
          const value = fn();
          if (value && typeof (value as { then?: unknown }).then === 'function') throw new Error('Database transactions require a synchronous mutation');
          return value;
        } catch (err) {
          // Restore BEFORE batch() emits its one notification/save. Otherwise a
          // failed mutation was briefly persisted and broadcast before rollback.
          for (const [n, saved] of snapshot) {
            const live = self[n];
            if (Array.isArray(live)) live.splice(0, live.length, ...(saved as unknown[]));
            else self[n] = saved as unknown[];
          }
          this.batchDirty = true;
          throw err;
        }
      });
    } finally { this.transactionEffects.pop(); }
    const parent = this.transactionEffects[this.transactionEffects.length - 1];
    if (parent) parent.push(...effects);
    else for (const effect of effects) {
      // A relay failure cannot turn a committed local mutation back into a failed
      // collection and invite the cashier to collect it again.
      try { effect(); } catch { console.error('Post-transaction delivery failed; the local mutation remains recorded'); }
    }
    return result;
  }

  public notify(): void {
    if (this.financialPreparing) { this.batchDirty = true; return; }
    if (this.financialBusy) {
      // Legacy repositories mutate before notify(). Restore that attempted
      // mutation instead of allowing it to overwrite a pending command.
      if (this.financialBaseline) Object.assign(this, structuredClone(this.financialBaseline));
      throw new Error('A checkout is being saved. Your change was not applied; try it after saving finishes.');
    }
    if (this.batchDepth > 0) {
      this.batchDirty = true;
      return;
    }
    if (typeof window !== 'undefined' && this.serverSyncScope !== this.relayFingerprint()) this.initServerSync();
    this.saveToStorage();
    this.pushToServer();
    try {
      if (this.broadcastChannel && !this.store?.subscribeRemote) {
        this.broadcastChannel.postMessage({ type: 'DB_SYNC', scope: KeyValueStore.browserKey(this.storagePrefix), timestamp: Date.now() });
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

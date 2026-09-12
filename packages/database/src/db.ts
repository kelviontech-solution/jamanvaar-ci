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
  WaitlistEntry
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
  public tables: DiningTable[] = [...SEED_TABLES];
  public qrSettings: QrOrderingSettings = { ...DEFAULT_QR_SETTINGS };
  public kioskDisplaySettings: KioskDisplaySettings = { ...DEFAULT_KIOSK_DISPLAY_SETTINGS };
  public welcomeScreenSettings: WelcomeScreenSettings = { ...DEFAULT_WELCOME_SCREEN_SETTINGS };
  public coupons: Coupon[] = [...SEED_COUPONS];
  public offers: Offer[] = [...SEED_OFFERS];
  public taxGroups: TaxGroup[] = [...SEED_TAX_GROUPS];
  public roles: Role[] = [...SEED_ROLES];
  public users: User[] = [...SEED_USERS];
  public devices: DeviceRecord[] = [];

  public kiosks: KioskDevice[] = [
    {
      id: 'kiosk-01',
      outletId: 'out-ahmedabad-central',
      kioskCode: 'KIOSK-01',
      name: 'Main Lobby Kiosk #1',
      locationDescription: 'Ground Floor Entry',
      status: 'ONLINE',
      orderTypesAllowed: ['DINE_IN', 'TAKEAWAY'],
      allowCashAtCounter: true,
      defaultLanguage: 'en',
      idleTimeoutSeconds: 60,
      ipAddress: '192.168.1.101',
      macAddress: 'AA:BB:CC:11:22:33',
      appVersion: '1.0.0',
      lastHeartbeat: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      isLocked: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-08-25T08:00:00Z'
    },
    {
      id: 'kiosk-02',
      outletId: 'out-ahmedabad-central',
      kioskCode: 'KIOSK-02',
      name: 'Dining Area Kiosk #2',
      locationDescription: 'Main Dining Hall Central',
      status: 'ONLINE',
      orderTypesAllowed: ['DINE_IN', 'TAKEAWAY'],
      allowCashAtCounter: true,
      defaultLanguage: 'en',
      idleTimeoutSeconds: 60,
      ipAddress: '192.168.1.102',
      macAddress: 'AA:BB:CC:11:22:34',
      appVersion: '1.0.0',
      lastHeartbeat: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      isLocked: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-08-25T08:00:00Z'
    },
    {
      id: 'kiosk-03',
      outletId: 'out-ahmedabad-central',
      kioskCode: 'KIOSK-03',
      name: 'Express Takeaway Kiosk #3',
      locationDescription: 'Takeaway Counter Wing',
      status: 'OFFLINE',
      orderTypesAllowed: ['TAKEAWAY'],
      allowCashAtCounter: true,
      defaultLanguage: 'en',
      idleTimeoutSeconds: 60,
      ipAddress: '192.168.1.103',
      macAddress: 'AA:BB:CC:11:22:35',
      appVersion: '1.0.0',
      lastHeartbeat: new Date(Date.now() - 3600000).toISOString(),
      lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
      isLocked: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-08-25T08:00:00Z'
    }
  ];

  public orders: Order[] = generateSeedOrders();

  public businessDays: BusinessDay[] = [
    {
      id: 'BD-20260831',
      businessDate: '2026-08-31',
      displayDate: '31 August 2026',
      openedAt: new Date(Date.now() - 28800000).toISOString(),
      openedBy: 'Amit Dave (Lead Cashier)',
      status: 'OPEN',
      openingCash: 2000,
      cashIn: 500,
      cashOut: 300,
      grossSales: 61200,
      discounts: 900,
      netSales: 59583,
      tax: 2836,
      totalCollected: 59583,
      cashSales: 20011,
      upiSales: 15361,
      cardSales: 12576,
      otherPayments: 11635,
      orderCount: 83,
      completedOrderCount: 80,
      cancelledOrderCount: 2,
      refundedOrderCount: 1,
      dineInCount: 50,
      takeawayCount: 20,
      deliveryCount: 8,
      tokenCount: 5,
      terminalId: 'POS-01',
      createdAt: '2026-08-31T08:00:00.000Z',
      updatedAt: '2026-08-31T20:00:00.000Z'
    },
    {
      id: 'BD-20260830',
      businessDate: '2026-08-30',
      displayDate: '30 August 2026',
      openedAt: '2026-08-30T08:00:00.000Z',
      closedAt: '2026-08-31T02:15:00.000Z',
      openedBy: 'Amit Dave (Lead Cashier)',
      closedBy: 'Rahul Sharma (Cashier)',
      status: 'CLOSED',
      openingCash: 2000,
      closingCash: 20200,
      expectedCash: 20200,
      cashVariance: 0,
      varianceReason: 'Balanced',
      cashIn: 0,
      cashOut: 0,
      grossSales: 53500,
      discounts: 1020,
      netSales: 52480,
      tax: 2499,
      totalCollected: 52480,
      cashSales: 18200,
      upiSales: 21000,
      cardSales: 13280,
      otherPayments: 0,
      orderCount: 74,
      completedOrderCount: 72,
      cancelledOrderCount: 1,
      refundedOrderCount: 1,
      dineInCount: 44,
      takeawayCount: 20,
      deliveryCount: 6,
      tokenCount: 4,
      terminalId: 'POS-01',
      createdAt: '2026-08-30T08:00:00.000Z',
      updatedAt: '2026-08-31T02:15:00.000Z'
    },
    {
      id: 'BD-20260829',
      businessDate: '2026-08-29',
      displayDate: '29 August 2026',
      openedAt: '2026-08-29T08:00:00.000Z',
      closedAt: '2026-08-30T01:45:00.000Z',
      openedBy: 'Amit Dave (Lead Cashier)',
      closedBy: 'Amit Dave (Lead Cashier)',
      status: 'CLOSED',
      openingCash: 2000,
      closingCash: 18500,
      expectedCash: 18500,
      cashVariance: 0,
      varianceReason: 'Balanced',
      cashIn: 0,
      cashOut: 0,
      grossSales: 49800,
      discounts: 880,
      netSales: 48920,
      tax: 2329,
      totalCollected: 48920,
      cashSales: 16500,
      upiSales: 19420,
      cardSales: 13000,
      otherPayments: 0,
      orderCount: 68,
      completedOrderCount: 67,
      cancelledOrderCount: 1,
      refundedOrderCount: 0,
      dineInCount: 40,
      takeawayCount: 18,
      deliveryCount: 6,
      tokenCount: 4,
      terminalId: 'POS-01',
      createdAt: '2026-08-29T08:00:00.000Z',
      updatedAt: '2026-08-30T01:45:00.000Z'
    }
  ];

  public paymentTransactions: PaymentTransaction[] = [];
  public receipts: Receipt[] = [];
  public serviceRequests: ServiceRequest[] = [];
  public syncEvents: SyncEvent[] = [];
  public notifications: AppNotification[] = [];
  public menuImportHistory: MenuImportRecord[] = [];
  public shifts: ShiftRecord[] = generateSeedShifts();
  public cashMovements: CashMovement[] = [];
  public kots: KOTRecord[] = [
    {
      id: 'kot-101',
      kotNumber: 'KOT-01',
      orderId: 'ord-1043',
      orderNumber: 'ORD-43',
      tokenNumber: '101',
      tableNumber: '3',
      orderType: 'DINE_IN',
      station: 'Main Kitchen',
      type: 'FIRST',
      items: [
        {
          id: 'koti-1',
          menuItemId: 'item-pt',
          name: 'Paneer Tikka (Tandoori)',
          quantity: 2,
          modifiers: [{ groupId: 'mod-addons', groupName: 'Add-Ons', optionId: 'opt-cheese', optionName: 'Extra Cheese', priceDelta: 35 }],
          specialInstructions: 'Less Spicy, Extra Chutney',
          kitchenStation: 'Main Kitchen',
          status: 'PREPARING'
        },
        {
          id: 'koti-3',
          menuItemId: 'item-dm',
          name: 'Dal Makhani (Maa Ki Dal)',
          quantity: 1,
          modifiers: [],
          kitchenStation: 'Main Kitchen',
          status: 'PREPARING'
        }
      ],
      serverName: 'Rahul Sharma',
      cashierName: 'Amit Dave',
      createdAt: new Date(Date.now() - 480000).toISOString(),
      printed: true,
      status: 'PREPARING'
    },
    {
      id: 'kot-102',
      kotNumber: 'KOT-02',
      orderId: 'ord-1043',
      orderNumber: 'ORD-43',
      tokenNumber: '101',
      tableNumber: '3',
      orderType: 'DINE_IN',
      station: 'Tandoor',
      type: 'FIRST',
      items: [
        {
          id: 'koti-4',
          menuItemId: 'item-bn',
          name: 'Butter Naan',
          quantity: 3,
          modifiers: [],
          specialInstructions: 'Crispy, Extra Butter',
          kitchenStation: 'Tandoor',
          status: 'PREPARING'
        },
        {
          id: 'koti-5',
          menuItemId: 'item-gn',
          name: 'Garlic Butter Naan',
          quantity: 2,
          modifiers: [],
          kitchenStation: 'Tandoor',
          status: 'PREPARING'
        }
      ],
      serverName: 'Rahul Sharma',
      cashierName: 'Amit Dave',
      createdAt: new Date(Date.now() - 420000).toISOString(),
      printed: true,
      status: 'PREPARING'
    },
    {
      id: 'kot-103',
      kotNumber: 'KOT-03',
      orderId: 'ord-1044',
      orderNumber: 'ORD-44',
      tokenNumber: '102',
      tableNumber: '1',
      orderType: 'DINE_IN',
      station: 'Bar',
      type: 'FIRST',
      items: [
        {
          id: 'koti-6',
          menuItemId: 'item-lassi',
          name: 'Royal Mango Lassi',
          quantity: 2,
          modifiers: [],
          specialInstructions: 'Chilled, Less Sweet',
          kitchenStation: 'Bar',
          status: 'READY'
        },
        {
          id: 'koti-7',
          menuItemId: 'item-chai',
          name: 'Special Masala Chai',
          quantity: 2,
          modifiers: [],
          kitchenStation: 'Bar',
          status: 'READY'
        }
      ],
      serverName: 'Vikram Mehta',
      cashierName: 'Amit Dave',
      createdAt: new Date(Date.now() - 720000).toISOString(),
      printed: true,
      status: 'READY'
    },
    {
      id: 'kot-104',
      kotNumber: 'KOT-04',
      orderId: 'ord-1045',
      orderNumber: 'ORD-45',
      tokenNumber: '104',
      orderType: 'TAKEAWAY',
      station: 'Dessert',
      type: 'FIRST',
      items: [
        {
          id: 'koti-8',
          menuItemId: 'item-gj',
          name: 'Gulab Jamun with Rabdi (2 Pcs)',
          quantity: 2,
          modifiers: [],
          specialInstructions: 'Pack in warm container',
          kitchenStation: 'Dessert',
          status: 'PREPARING'
        }
      ],
      serverName: 'Amit Dave',
      cashierName: 'Amit Dave',
      createdAt: new Date(Date.now() - 180000).toISOString(),
      printed: true,
      status: 'PREPARING'
    }
  ];
  public heldOrders: HeldOrder[] = [];
  public managerOverrides: ManagerOverrideRequest[] = [];
  public reservations: Reservation[] = [
    {
      id: 'res-01',
      customerName: 'Ketan Sheth',
      customerPhone: '9825012345',
      guestCount: 6,
      tableNumber: '16',
      tableId: 'tbl-16',
      reservationTime: new Date(Date.now() + 7200000).toISOString(),
      status: 'CONFIRMED',
      specialRequests: 'AC section, Family celebration',
      createdAt: new Date(Date.now() - 86400000).toISOString()
    }
  ];
  public waitlist: WaitlistEntry[] = [];
  public eodReports: EodReport[] = [];
  public feedbacks: CustomerFeedback[] = [
    {
      id: 'fb-1',
      orderId: 'ord-1043',
      kioskId: 'KIOSK-01',
      rating: 5,
      tags: ['Food Quality', 'Speed of Service'],
      comments: 'Authentic flavors and super fast touch kiosk ordering!',
      createdAt: new Date(Date.now() - 3600000).toISOString()
    }
  ];

  public customerAccounts: CustomerAccount[] = [
    {
      phone: '9876543210',
      name: 'Ramesh Patel',
      email: 'ramesh.patel@gmail.com',
      address: 'A-402, Satellite Towers, Satellite, Ahmedabad',
      dob: '1984-09-12',
      anniversary: '2010-12-08',
      notes: 'Prefers mild spices and table near window. VIP regular guest.',
      tags: ['VIP', 'FAMILY'],
      loyaltyPoints: 340,
      favoriteItemIds: ['item-pt', 'item-dm', 'item-bn'],
      recentOrderIds: ['ord-1043', 'ord-9901'],
      totalVisits: 8,
      totalSpend: 14850,
      createdAt: '2026-01-15T10:30:00.000Z',
      lastVisitAt: new Date(Date.now() - 7200000).toISOString()
    },
    {
      phone: '9822334455',
      name: 'Dr. Neha Shah',
      email: 'dr.neha.shah@apollo.org',
      address: 'Flat 6B, Orchid Elegance, Bodakdev, Ahmedabad',
      dob: '1990-08-31',
      anniversary: '2018-02-14',
      notes: 'Strict Jain preparation only (no onion, no garlic).',
      tags: ['VIP', 'JAIN'],
      loyaltyPoints: 260,
      favoriteItemIds: ['item-guj-thali', 'item-gj'],
      recentOrderIds: ['ord-9902', 'ord-1044'],
      totalVisits: 6,
      totalSpend: 9240,
      createdAt: '2026-02-10T14:15:00.000Z',
      lastVisitAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      phone: '9899001122',
      name: 'Amit Verma',
      email: 'amit.verma@techcorp.in',
      address: 'Plot 12, Prahlad Nagar Garden Road, Ahmedabad',
      dob: '1988-11-20',
      notes: 'Corporate client. Always requests GST invoice with company details.',
      tags: ['CORPORATE', 'REGULAR'],
      loyaltyPoints: 180,
      favoriteItemIds: ['item-vbir', 'item-cc-ice'],
      recentOrderIds: ['ord-9903'],
      totalVisits: 5,
      totalSpend: 7890,
      createdAt: '2026-03-01T11:00:00.000Z',
      lastVisitAt: new Date(Date.now() - 172800000).toISOString()
    },
    {
      phone: '9811223344',
      name: 'Priya Joshi',
      email: 'priya.joshi@designstudio.com',
      address: '301, Shivalik High Street, Vastrapur, Ahmedabad',
      dob: '1995-04-18',
      anniversary: '2022-11-25',
      notes: 'Vegan preference. Loves fresh mint beverages and tandoori starters.',
      tags: ['REGULAR', 'VEGAN'],
      loyaltyPoints: 150,
      favoriteItemIds: ['item-corn', 'item-pt'],
      recentOrderIds: ['ord-9904'],
      totalVisits: 4,
      totalSpend: 4680,
      createdAt: '2026-04-12T16:20:00.000Z',
      lastVisitAt: new Date(Date.now() - 259200000).toISOString()
    },
    {
      phone: '9833445566',
      name: 'Sanjay Mehta',
      email: 'sanjay.mehta@investments.co',
      address: 'B-12, Heritage Bungalows, SG Highway, Ahmedabad',
      dob: '1976-06-05',
      anniversary: '2002-05-10',
      notes: 'Loves Royal Dum Biryani. Family weekend regular.',
      tags: ['VIP', 'FAMILY'],
      loyaltyPoints: 490,
      favoriteItemIds: ['item-vbir', 'item-dm', 'item-bn'],
      recentOrderIds: ['ord-9905'],
      totalVisits: 9,
      totalSpend: 18720,
      createdAt: '2026-01-05T09:00:00.000Z',
      lastVisitAt: new Date(Date.now() - 345600000).toISOString()
    },
    {
      phone: '9844556677',
      name: 'Kavita Reddy',
      email: 'kavita.reddy@gmail.com',
      address: 'A-201, Maple Tree Garden, Memnagar, Ahmedabad',
      dob: '1992-10-15',
      notes: 'Enjoys desserts and starters.',
      tags: ['REGULAR'],
      loyaltyPoints: 90,
      favoriteItemIds: ['item-gj', 'item-corn'],
      recentOrderIds: [],
      totalVisits: 3,
      totalSpend: 3150,
      createdAt: '2026-05-18T12:00:00.000Z',
      lastVisitAt: new Date(Date.now() - 604800000).toISOString()
    },
    {
      phone: '9855667788',
      name: 'Rajesh Gupta',
      email: 'rajesh.gupta@consulting.in',
      address: '404, Titanium City Center, Anandnagar, Ahmedabad',
      dob: '1982-01-22',
      notes: 'Quick counter takeaway guest.',
      tags: ['CORPORATE'],
      loyaltyPoints: 60,
      favoriteItemIds: ['item-vbir'],
      recentOrderIds: [],
      totalVisits: 2,
      totalSpend: 1640,
      createdAt: '2026-06-25T15:30:00.000Z',
      lastVisitAt: new Date(Date.now() - 1209600000).toISOString()
    },
    {
      phone: '9866778899',
      name: 'Ananya Desai',
      email: 'ananya.desai@outlook.com',
      address: '702, Shaligram Plus, Thaltej, Ahmedabad',
      dob: '1998-07-09',
      notes: 'College group regular for Cold Coffee & Starters.',
      tags: ['REGULAR'],
      loyaltyPoints: 110,
      favoriteItemIds: ['item-cc-ice', 'item-corn'],
      recentOrderIds: [],
      totalVisits: 3,
      totalSpend: 2850,
      createdAt: '2026-07-10T17:45:00.000Z',
      lastVisitAt: new Date(Date.now() - 1814400000).toISOString()
    }
  ];

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
    gstin: '24AAAAA0000A1Z5',
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
      }).catch(() => {});
    } catch {
      // Ignore network errors
    }
  }

  private initServerSync(): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

    // 1. Initial Pull from Sync Server
    fetch(`${this.getSyncServerUrl()}/api/sync`)
      .then((res) => res.json())
      .then((data) => {
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
    setInterval(() => {
      fetch(`${this.getSyncServerUrl()}/api/sync`)
        .then((res) => res.json())
        .then((data) => {
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

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const p = this.storagePrefix;
      localStorage.setItem(`${p}restaurant`, JSON.stringify(this.restaurant));
      localStorage.setItem(`${p}outlet`, JSON.stringify(this.outlet));
      localStorage.setItem(`${p}menu_items`, JSON.stringify(this.menuItems));
      localStorage.setItem(`${p}categories`, JSON.stringify(this.categories));
      localStorage.setItem(`${p}modifier_groups`, JSON.stringify(this.modifierGroups));
      localStorage.setItem(`${p}combos`, JSON.stringify(this.combos));
      localStorage.setItem(`${p}loyalty_tiers`, JSON.stringify(this.loyaltyTiers));
      localStorage.setItem(`${p}loyalty_rewards`, JSON.stringify(this.loyaltyRewards));
      localStorage.setItem(`${p}staff_schedules`, JSON.stringify(this.staffSchedules));
      localStorage.setItem(`${p}attendance_records`, JSON.stringify(this.attendanceRecords));
      localStorage.setItem(`${p}marketing_campaigns`, JSON.stringify(this.marketingCampaigns));
      localStorage.setItem(`${p}delivery_riders`, JSON.stringify(this.deliveryRiders));
      localStorage.setItem(`${p}receipt_config`, JSON.stringify(this.receiptConfig));
      localStorage.setItem(`${p}receipt_records`, JSON.stringify(this.receiptRecords));
      localStorage.setItem(`${p}print_jobs`, JSON.stringify(this.printJobs));
      localStorage.setItem(`${p}orders`, JSON.stringify(this.orders));
      localStorage.setItem(`${p}tables`, JSON.stringify(this.tables));
      localStorage.setItem(`${p}coupons`, JSON.stringify(this.coupons));
      localStorage.setItem(`${p}kiosks`, JSON.stringify(this.kiosks));
      localStorage.setItem(`${p}service_requests`, JSON.stringify(this.serviceRequests));
      localStorage.setItem(`${p}audit_logs`, JSON.stringify(this.auditLogs));
      localStorage.setItem(`${p}shifts`, JSON.stringify(this.shifts));
      localStorage.setItem(`${p}cash_movements`, JSON.stringify(this.cashMovements));
      localStorage.setItem(`${p}kots`, JSON.stringify(this.kots));
      localStorage.setItem(`${p}held_orders`, JSON.stringify(this.heldOrders));
      localStorage.setItem(`${p}reservations`, JSON.stringify(this.reservations));
      localStorage.setItem(`${p}waitlist`, JSON.stringify(this.waitlist));
      localStorage.setItem(`${p}inventory_items`, JSON.stringify(this.inventoryItems));
      localStorage.setItem(`${p}stock_movements`, JSON.stringify(this.stockMovements));
      localStorage.setItem(`${p}recipes`, JSON.stringify(this.recipes));
      localStorage.setItem(`${p}customer_accounts`, JSON.stringify(this.customerAccounts));
      localStorage.setItem(`${p}users`, JSON.stringify(this.users));
      localStorage.setItem(`${p}roles`, JSON.stringify(this.roles));
      localStorage.setItem(`${p}configured_printers`, JSON.stringify(this.configuredPrinters));
      localStorage.setItem(`${p}license`, JSON.stringify(this.license));
      localStorage.setItem(`${p}tax_groups`, JSON.stringify(this.taxGroups));
      localStorage.setItem(`${p}business_days`, JSON.stringify(this.businessDays));
      localStorage.setItem(`${p}eod_reports`, JSON.stringify(this.eodReports));
      localStorage.setItem(`${p}notifications`, JSON.stringify(this.notifications));
      // BUG-HIGH-002 fix: syncEvents (the offline outbox queue — see
      // SyncOutboxEngine.queueEvent in @jamanvaar/sync) was never persisted
      // here, so any PENDING/FAILED event and its retry count was silently
      // lost on every reload or process restart — an offline-first system
      // whose own offline queue doesn't survive a restart.
      localStorage.setItem(`${p}sync_events`, JSON.stringify(this.syncEvents));
      localStorage.setItem(`${p}kiosk_display_settings`, JSON.stringify(this.kioskDisplaySettings));
      localStorage.setItem(`${p}welcome_screen_settings`, JSON.stringify(this.welcomeScreenSettings));
      // qrSettings had the same gap syncEvents/kioskDisplaySettings used to
      // have — declared on this class but never actually persisted, so a
      // restaurant's QR ordering configuration (min/max order value, waiter
      // approval requirement, etc.) silently reverted to defaults on reload.
      localStorage.setItem(`${p}qr_settings`, JSON.stringify(this.qrSettings));
      localStorage.setItem(`${p}sync_timestamp`, Date.now().toString());
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
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
          const seedMap = new Map<string, string>();
          // Backfills menu-content translations onto items a browser already
          // persisted before those translations existed in seed.ts — without
          // this, a customer's localStorage forever shows English item names
          // no matter what languages get added to the seed data later.
          const translationsMap = new Map<string, MenuItem['translations']>();
          SEED_MENU_ITEMS.forEach((s) => {
            if (s.imageUrl) {
              seedMap.set(s.id, s.imageUrl);
              if (s.sku) seedMap.set(s.sku, s.imageUrl);
            }
            if (s.translations) {
              translationsMap.set(s.id, s.translations);
              if (s.sku) translationsMap.set(s.sku, s.translations);
            }
          });

          const cleanItems = parsed
            .filter((it: any) => it.dietaryType !== 'NON_VEG' && !it.name?.toLowerCase().includes('chicken'))
            .map((it: any) => {
              const seedTranslations = translationsMap.get(it.id) || translationsMap.get(it.sku);
              const withTranslations = seedTranslations && !it.translations ? { ...it, translations: seedTranslations } : it;

              if (seedMap.has(it.id)) {
                return { ...withTranslations, imageUrl: seedMap.get(it.id)! };
              }
              if (seedMap.has(it.sku)) {
                return { ...withTranslations, imageUrl: seedMap.get(it.sku)! };
              }
              const nameLower = (it.name || '').toLowerCase();
              if (nameLower.includes('hara bhara')) return { ...withTranslations, imageUrl: '/assets/menu/north-indian/hara-bhara-kebab.jpg' };
              if (nameLower.includes('crispy corn')) return { ...withTranslations, imageUrl: '/assets/menu/fast-food/peri-peri-fries.jpg' };
              if (nameLower.includes('cigar rolls') || nameLower.includes('cheese corn')) return { ...withTranslations, imageUrl: '/assets/menu/chinese/momos.jpg' };
              if (nameLower.includes('paneer tikka')) return { ...withTranslations, imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' };
              if (nameLower.includes('dal makhani')) return { ...withTranslations, imageUrl: '/assets/menu/north-indian/dal-makhani.jpg' };
              if (nameLower.includes('paneer butter') || nameLower.includes('paneer makhani')) return { ...withTranslations, imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' };
              if (nameLower.includes('butter naan')) return { ...withTranslations, imageUrl: '/assets/menu/north-indian/butter-naan.jpg' };
              if (nameLower.includes('garlic') && nameLower.includes('naan')) return { ...withTranslations, imageUrl: '/assets/menu/pizza/garlic-bread.jpg' };
              if (nameLower.includes('biryani')) return { ...withTranslations, imageUrl: '/assets/menu/north-indian/biryani.jpg' };
              if (nameLower.includes('coffee') || nameLower.includes('frappe')) return { ...withTranslations, imageUrl: '/assets/menu/cafe/frappe.jpg' };
              if (nameLower.includes('gulab jamun')) return { ...withTranslations, imageUrl: '/assets/menu/north-indian/gulab-jamun.jpg' };
              if (nameLower.includes('thali')) return { ...withTranslations, imageUrl: '/assets/menu/gujarati/thali.jpg' };
              return withTranslations;
            });
          if (cleanItems.length >= 8) {
            this.menuItems = cleanItems;
          } else {
            this.menuItems = [...SEED_MENU_ITEMS];
          }
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

      const storedTables = localStorage.getItem(`${p}tables`);
      if (storedTables) {
        try {
          const parsedTables = JSON.parse(storedTables);
          // Only use stored tables if non-empty; fall back to seed if empty array was persisted
          if (Array.isArray(parsedTables) && parsedTables.length > 0) {
            this.tables = parsedTables;
          } else {
            this.tables = [...SEED_TABLES];
          }
        } catch {
          this.tables = [...SEED_TABLES];
        }
      } else {
        this.tables = [...SEED_TABLES];
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
          t.qrCodeUrl = `http://localhost:5176/?qrTable=${t.tableNumber}&token=${t.qrToken}`;
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

  public notify(): void {
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
    this.tables = [...SEED_TABLES];
    this.coupons = [...SEED_COUPONS];
    this.offers = [...SEED_OFFERS];
    this.taxGroups = [...SEED_TAX_GROUPS];
    this.shifts = generateSeedShifts();
    this.orders = generateSeedOrders();
    this.notify();
  }
}

export const db = JamanvaarDatabase.getInstance();

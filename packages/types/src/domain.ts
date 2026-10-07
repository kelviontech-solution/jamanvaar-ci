import {
  DietaryType,
  KioskStatus,
  KOTStatus,
  KOTType,
  ManagerOverrideAction,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  ServiceRequestStatus,
  ServiceRequestType,
  ShiftStatus,
  SpiceLevel,
  SyncEventStatus,
  SyncEventType,
  TableStatus
} from './enums';

export interface DiscountConfig {
  enabled: boolean;
  maxPercentage: number;
  maxFixedAmount: number;
  allowItemLevel: boolean;
  allowBillLevel: boolean;
  allowPercentage: boolean;
  allowFixed: boolean;
  requireReason: boolean;
  requireManagerApproval: boolean;
  managerApprovalThresholdPercent: number;
  managerApprovalThresholdAmount: number;
  allowedReasons: string[];
  enableDiscountCodes: boolean;
}

export interface InstantBillConfig {
  enabled: boolean;
  paymentMethod: PaymentMethod;
  autoPrint: boolean;
  askConfirmation: boolean;
  defaultOrderType: OrderType;
  sendKotBeforeBill: boolean;
  allowedRoles?: string[];
}

export interface Restaurant {
  id: string;
  name: string;
  /** A stock count worth more than this (rupees) needs a manager's approval. */
  stockAdjustmentApprovalLimit?: number;
  legalName?: string;
  tagline?: string;
  logoUrl?: string;
  currency: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  fssaiNumber?: string;
  msmeNumber?: string;
  website?: string;
  footerText?: string;
  primaryColor?: string;
  secondaryColor?: string;
  ownerName?: string;
  managerName?: string;
  instantBillConfig?: InstantBillConfig;
  discountConfig?: DiscountConfig;
  // Per-restaurant opt-out for the JAMAN AI floating assistant widget in
  // POS/Captain/Restaurant Admin — layered on top of the platform-wide
  // ApplicationEntitlement toggle in Super Admin, which only gates whether
  // the *feature* exists at all, not whether an individual restaurant wants
  // the widget visible. Undefined means shown (opt-out, not opt-in).
  showJamanAI?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Outlet {
  id: string;
  restaurantId: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KioskDevice {
  id: string;
  outletId: string;
  kioskCode: string;
  name: string;
  locationDescription?: string;
  status: KioskStatus;
  orderTypesAllowed: OrderType[];
  allowCashAtCounter: boolean;
  defaultLanguage: string;
  idleTimeoutSeconds: number;
  ipAddress?: string;
  macAddress?: string;
  appVersion: string;
  lastHeartbeat?: string;
  lastSyncAt?: string;
  isLocked: boolean;
  lockReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KioskSession {
  sessionId: string;
  kioskId: string;
  outletId: string;
  orderType?: OrderType;
  tableId?: string;
  guestCount?: number;
  customerPhone?: string;
  customerName?: string;
  startedAt: string;
  lastActiveAt: string;
  status: 'ACTIVE' | 'ORDER_PLACED' | 'EXPIRED' | 'CANCELLED';
  metadata?: Record<string, any>;
}

export interface User {
  id: string;
  restaurantId: string;
  branchId?: string;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  roleId: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** A planned work shift for one staff member on one date — distinct from ShiftRecord, which is a cashier's cash-drawer/till session, not a work roster entry. */
export interface StaffShiftSchedule {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm, 24h
  endTime: string; // HH:mm, 24h
  roleLabel?: string; // e.g. 'Cashier', 'Waiter', 'Kitchen' — free text, independent of the login roleId
  notes?: string;
  createdAt: string;
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'ON_LEAVE';

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  clockInAt?: string; // ISO timestamp
  clockOutAt?: string; // ISO timestamp
  status: AttendanceStatus;
  notes?: string;
}

/**
 * A saved audience filter for a marketing campaign — real conditions matched
 * against actual CustomerAccount data, not a mock segment. All fields are
 * optional and AND together; leaving a field unset means "don't filter on this".
 */
export interface CustomerSegmentFilter {
  tags?: string[]; // customer must have at least one of these tags
  minTierId?: string; // customer's computed LoyaltyTier must be at or above this tier's rank
  minLifetimeSpend?: number;
  inactiveForDays?: number; // customer's lastVisitAt is at least this many days ago (or never visited)
  birthdayThisMonth?: boolean;
}

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED';

/**
 * A WhatsApp outreach campaign. There is no WhatsApp Business API/bulk-send
 * backend in this system — sending still opens one wa.me deep link per
 * recipient, the same real constraint the previous single-customer button
 * had. What this adds is a saved, reusable segment + message template and a
 * tracked send queue, instead of re-picking one customer and one message
 * every single time.
 */
export interface MarketingCampaign {
  id: string;
  name: string;
  messageTemplate: string; // may include {{name}} merge tag
  segmentFilter: CustomerSegmentFilter;
  status: CampaignStatus;
  sentToPhones: string[]; // recipients already sent to, to avoid re-sending on resume
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystemRole?: boolean;
}

export interface Category {
  id: string;
  outletId?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  iconName?: string;
  sortOrder: number;
  isActive: boolean;
  /** Whether QR guests see this category (default yes). */
  qrVisible?: boolean;
  itemCount?: number;
  translations?: Record<string, { name: string; description?: string }>;
  /** When this category was last changed on any device (cross-device sync: the newer change wins). */
  updatedAt?: string;
  parentId?: string;
  templateCategoryKey?: string;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number; // e.g. +₹30 for extra cheese
  isDefault?: boolean;
  isAvailable: boolean;
  sortOrder: number;
  description?: string;
  imageUrl?: string;
  dietaryType?: DietaryType;
  translations?: Record<string, { name: string }>;
}

export interface ModifierGroup {
  id: string;
  name: string;
  description?: string;
  minSelections: number; // 0 for optional, 1+ for required
  maxSelections: number;
  isRequired: boolean;
  options: ModifierOption[];
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  subcategory?: string;
  outletId?: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  basePrice?: number;
  takeawayPrice?: number;
  dineInPrice?: number;
  imageUrl?: string;
  dietaryType: DietaryType;
  spiceLevel: SpiceLevel;
  isPopular: boolean;
  isNew: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  soldOutReason?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  prepTimeMinutes: number;
  calories?: number;
  servingSize?: string;
  allergens: string[];
  modifierGroupIds: string[];
  modifierGroups?: ModifierGroup[];
  taxGroupId?: string;
  sortOrder: number;
  kitchenStation?: string;
  isDigitalMenuVisible?: boolean;
  isQrOrderingEnabled?: boolean;
  /** Ordering rules a restaurant sets per dish (QR guests). Absent means 1 to 50, notes allowed. */
  minQuantity?: number;
  maxQuantity?: number;
  allowInstructions?: boolean;
  /** Where this dish may be sold. When present it must include the channel; when absent the per-channel switches above apply. */
  salesChannels?: Array<'POS' | 'KIOSK' | 'QR' | 'CAPTAIN'>;
  /** Restrict the dish to these branches (empty or absent: every branch). */
  branchIds?: string[];
  isKioskEnabled?: boolean;
  imagePrompt?: string;
  imageSource?: string;
  imageSourceUrl?: string;
  imageLicense?: string;
  imageApproved?: boolean;
  translations?: Record<string, { name: string; description?: string }>;
  /** When this dish was last changed on any device (cross-device sync: the newer change wins). */
  updatedAt?: string;
  tags?: string[];
  templateItemKey?: string;
  archivedAt?: string;
  archiveReason?: string;
}

export interface ComboItemSlot {
  id: string;
  comboId: string;
  slotName: string; // e.g., 'Main Course', 'Beverage', 'Side'
  allowedCategoryIds?: string[];
  allowedItemIds?: string[];
  defaultItemId?: string;
  isRequired: boolean;
  priceDelta: number;
}

export interface Combo {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  comboPrice: number;
  originalPrice?: number;
  slots: ComboItemSlot[];
  isActive: boolean;
  dietaryType: DietaryType;
  sortOrder: number;
}

export interface TaxGroup {
  id: string;
  name: string;
  cgstPercent: number; // e.g. 2.5
  sgstPercent: number; // e.g. 2.5
  igstPercent: number; // e.g. 5.0
  isInclusive: boolean; // default true for restaurants
  isActive: boolean;
  /** Charged on dishes with no tax group of their own. Only one active group should carry it. */
  isDefault?: boolean;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FLAT' | 'BOGO';
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  bannerImageUrl?: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  channel: 'ALL' | 'KIOSK_ONLY' | 'POS_ONLY';
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FLAT';
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usageCount: number;
  perCustomerLimit?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  /** When this coupon was last changed on any device (cross-device sync: the newer change wins). */
  updatedAt?: string;
}

export interface DiningTable {
  id: string;
  outletId: string;
  /** The cloud branch this table belongs to, when the restaurant runs several. A QR code for the table can only open in this branch. */
  branchId?: string;
  tableNumber: string;
  capacity: number;
  currentGuests?: number;
  zone: string; // e.g., 'Main Hall', 'AC Section', 'Balcony'
  floor: number;
  /** Retired: QR codes are minted, versioned and revoked by the cloud. These only remain so old saved data still loads; they are never synced or used. */
  qrCodeUrl?: string;
  qrShortCode?: string;
  qrToken?: string;
  qrStatus?: 'ACTIVE' | 'INACTIVE' | 'DISABLED';
  lastOrderId?: string;
  lastOrderTime?: string;
  totalOrdersToday?: number;
  totalRevenueToday?: number;
  status: TableStatus;
  currentOrderId?: string;
  isActive: boolean;
  /** Who seated the table (the waiter's staff id and name) — drives Captain's "My tables". */
  openedById?: string;
  openedByName?: string;
  /** Time of the last change to the table's layout or state, used to decide which device's version wins when tables sync. */
  updatedAt?: string;
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface CartItem {
  cartItemId: string;
  menuItemId: string;
  item: MenuItem;
  quantity: number;
  unitPrice: number;
  selectedModifiers: SelectedModifier[];
  specialInstructions?: string;
  itemTotal: number;
  itemDiscountPercent?: number;
  itemDiscountAmount?: number;
  discountReason?: string;
  /** Id of the order line this cart line became when it was first sent to the kitchen. */
  orderItemId?: string;
  /** The seat (or guest number) this dish was taken for. */
  seat?: number;
  /** How many of this line's quantity have already been sent to the kitchen (KOT). */
  kotSentQty?: number;
  taxSnapshot?: OrderItem['snapshot'];
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountType?: 'PERCENTAGE' | 'FIXED' | 'COUPON' | 'NONE';
  discountValue?: number;
  discountScope?: 'BILL' | 'ITEMS';
  discountReason?: string;
  discountCode?: string;
  appliedCoupon?: Coupon;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  serviceChargeAmount: number;
  tipAmount: number;
  roundOffAmount: number;
  totalPayable: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  modifiers: SelectedModifier[];
  specialInstructions?: string;
  totalPrice: number;
  itemDiscountPercent?: number;
  itemDiscountAmount?: number;
  discountReason?: string;
  kitchenStatus?: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  /**
   * Counts how many times the kitchen status of this dish was deliberately moved backwards (a recall from Ready/Served) or
   * cancelled. Progress otherwise only moves forward; a copy with a higher revision replaces one with a lower revision.
   */
  statusRev?: number;
  /** Which course of the meal the dish belongs to ('COURSE_1' starters, 'COURSE_2' mains, 'COURSE_3' dessert). */
  course?: string;
  /** Why a sent dish was cancelled (the line stays on the order at no charge so the kitchen and the bill agree). */
  cancelReason?: string;
  /** What the line was worth (rupees) before it was cancelled. The line itself drops to zero; this keeps the loss reportable. */
  cancelledAmount?: number;
  cancelledBy?: string;
  cancelledAt?: string;
  /** The seat (or guest number) the waiter took this dish for, so the bill can be split by seat. */
  seat?: number;
  /** When the dish was sent to the kitchen, and when the cook marked it done. Kept on the order line so every device (and the prep-time report) sees the real times. */
  sentAt?: string;
  readyAt?: string;
  /** What this line was priced with when it was ordered (QR orders): never recalculated from the current menu. */
  snapshot?: { menuVersion?: number; basePrice?: number; taxGroupId?: string; taxRateBp?: number; taxInclusive?: boolean; lineTax?: number };
  /** Kitchen routing retained with the ordered line for offline/replay fidelity. */
  kitchenStation?: string;
}

export type BusinessDayStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'REOPENED';

export interface BusinessDaySnapshot {
  grossSalesSnapshot: number;
  discountSnapshot: number;
  taxSnapshot: number;
  netSalesSnapshot: number;
  paymentSnapshot: {
    cash: number;
    upi: number;
    card: number;
    split: number;
    other: number;
  };
  orderCountSnapshot: number;
  completedOrderCountSnapshot: number;
  cancelledOrderCountSnapshot: number;
  refundedOrderCountSnapshot: number;
  cashDrawerSnapshot: {
    openingCash: number;
    cashSales: number;
    cashIn: number;
    cashOut: number;
    expectedCash: number;
    actualCash: number;
    variance: number;
    varianceReason?: string;
  };
  topItemsSnapshot: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export interface BusinessDay {
  id: string;
  businessDate: string;
  displayDate: string;
  openedAt: string;
  closedAt?: string;
  openedBy: string;
  closedBy?: string;
  status: BusinessDayStatus;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  cashVariance?: number;
  varianceReason?: string;
  cashIn?: number;
  cashOut?: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  totalCollected: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  otherPayments: number;
  orderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  refundedOrderCount: number;
  dineInCount: number;
  takeawayCount: number;
  deliveryCount: number;
  tokenCount: number;
  terminalId?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  snapshot?: BusinessDaySnapshot;
  createdAt: string;
  updatedAt: string;
}

/** One tender line of a settled bill (a split bill has several). */
export interface PaymentSplit {
  method: 'CASH' | 'UPI' | 'CARD' | 'WALLET' | 'HOUSE_ACCOUNT';
  amount: number;
  reference?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  tokenNumber: string;
  businessDayId?: string;
  shiftId?: string;
  restaurantId: string;
  outletId: string;
  kioskId: string;
  sessionId: string;
  idempotencyKey: string;
  orderType: OrderType;
  tableId?: string;
  tableNumber?: string;
  guestCount?: number;
  customerPhone?: string;
  customerName?: string;
  /** Loyalty points this order has already credited to customerPhone, if any — also the idempotency
   *  marker, so a re-settlement attempt or a page reload never credits the same order twice. */
  loyaltyPointsEarned?: number;
  cashierName?: string;
  captainName?: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  discountType?: 'PERCENTAGE' | 'FIXED' | 'COUPON' | 'NONE';
  discountValue?: number;
  discountScope?: 'BILL' | 'ITEMS';
  discountReason?: string;
  discountCode?: string;
  discountAppliedBy?: string;
  discountAppliedAt?: string;
  discountApprovalStatus?: 'AUTO' | 'APPROVED' | 'PENDING';
  couponCode?: string;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  serviceChargeAmount: number;
  tipAmount: number;
  roundOffAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentTransactionId?: string;
  /** Rupees actually returned to the guest; retained for partial-refund reporting. */
  refundAmount?: number;
  /** Operational kitchen urgency; it never changes prices, payment or service status. */
  kitchenPriority?: 'NORMAL' | 'URGENT';
  kitchenPriorityRev?: number;
  kitchenPriorityChangeId?: string;
  orderStatus: OrderStatus;
  estimatedWaitMinutes: number;
  tenderedAmount?: number;
  changeAmount?: number;
  /** The real tender lines for a SPLIT bill — what was actually paid with each method. */
  paymentSplits?: PaymentSplit[];
  createdAt: string;
  updatedAt: string;
  pickupCounter?: string;
  source_type?: 'KIOSK' | 'POS' | 'CAPTAIN' | 'QR_TABLE' | 'ONLINE' | 'OTHER';
  /** The device that accepted this order (QR orders wait for exactly one POS to accept them). First accept wins, everywhere. */
  acceptedByDeviceId?: string;
  customerNotes?: string;
  /** Set when the guest's table asked for the bill. The order owns this: the table's "Bill requested" state and the counter's notification are derived from it. */
  billRequestedAt?: string;
  /** The split-by-seat note the captain gave with the bill request, if any. */
  billSplitNote?: string;
  kitchenRouting?: {
    stationBreakdown: Record<string, number>;
    summaryText: string;
  };
  acknowledgementStage?:
    | 'ORDER_CREATED_LOCALLY'
    | 'ORDER_ACCEPTED_BY_CLOUD'
    | 'ORDER_RECEIVED_BY_POS'
    | 'ORDER_SENT_TO_KDS'
    | 'ORDER_PREPARING'
    | 'ORDER_READY'
    | 'ORDER_COMPLETED';
  timeline?: Array<{
    status: string;
    title: string;
    timestamp: string;
    note?: string;
    actor?: string;
  }>;
  /** The server's sequence number and version of this order as last received or acknowledged. Used to order changes without trusting any device clock. */
  remoteSeq?: number;
  remoteSyncVersion?: number;
  syncStatus?: 'SAVED_LOCALLY' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'DEAD_LETTER';
  /** Failed push attempts since the last success; drives backoff and dead-lettering. */
  syncAttempts?: number;
  /** Epoch ms before which the outbox will not retry this order. */
  syncNextAttemptAt?: number;
  syncLastError?: string;
  eBillStatus?: ReceiptDeliveryStatus;
  eBillMethod?: ReceiptDeliveryMethod;
  eBillRecipient?: string;
  isSynced: boolean;
  eBillDispatched?: boolean;
  // Delivery dispatch — previously a DELIVERY order had an orderType and
  // nothing else: no address, no rider, no way to track it out the door.
  deliveryAddress?: string;
  riderId?: string;
  riderName?: string;
  deliveryStatus?: DeliveryStatus;
  dispatchedAt?: string;
  deliveredAt?: string;
  /** Quantity of each order line whose recipe stock has already been consumed, keyed by order item id (BUG-044: makes stock deduction idempotent per line). */
  stockConsumedQty?: Record<string, number>;
}

export type DeliveryStatus = 'UNASSIGNED' | 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';

export interface DeliveryRider {
  id: string;
  name: string;
  phone: string;
  vehicleType: 'BIKE' | 'SCOOTER' | 'BICYCLE' | 'CAR' | 'ON_FOOT';
  vehicleNumber?: string;
  isActive: boolean;
  createdAt: string;
}

export interface QrOrderingSettings {
  isQrOrderingActive: boolean;
  allowCustomerOrdering: boolean;
  allowCustomerModifications: boolean;
  allowSpecialInstructions: boolean;
  allowRepeatOrdering: boolean;
  requireWaiterApproval: boolean;
  autoSendToKitchen: boolean;
  showOrderStatusTimeline: boolean;
  allowCustomerCancellation: boolean;
  minOrderValue: number;
  maxOrderValue: number;
  tableQrTemplate: 'ELEGANT' | 'MODERN' | 'MINIMAL' | 'PREMIUM' | 'SIGNATURE';
  enableNotificationSound: boolean;
  welcomeMessage?: string;
}

export type VoiceStyle = 'STANDARD' | 'SHORT' | 'DISABLED';
/** Browser speech synthesis/recognition is only verified for these three locales so far. */
export type VoiceLanguage = 'en' | 'hi' | 'gu';
/**
 * Every written language the kiosk's own i18n dictionary (packages/i18n) covers — broader than
 * VoiceLanguage, since adding a language to text browsing/ordering doesn't require (and isn't
 * gated on) verified voice-assistant support for it. Duplicated here rather than importing
 * @jamanvaar/i18n's own SupportedLanguage, since packages/types stays dependency-free.
 */
export type DisplayLanguage = 'en' | 'hi' | 'gu' | 'mr' | 'ta' | 'te' | 'kn';

/**
 * Kiosk Admin/Super Admin-configurable customer-kiosk behavior — previously
 * hardcoded as literal constants inside the kiosk app itself (which
 * languages to offer and how long before the idle-timeout warning/reset
 * fires). This is the config surface those constants should read from
 * instead. Deliberately does NOT duplicate the welcome-screen tagline —
 * that's already correctly per-language through the i18n system
 * (packages/i18n), and a second, non-localized override field here would
 * just create two conflicting sources of truth for the same text.
 */
export interface KioskDisplaySettings {
  logoUrl?: string;
  accentColor?: string;
  texts?: Partial<Record<DisplayLanguage, Record<string, string>>>;
  enabledLanguages: DisplayLanguage[];
  defaultLanguage: DisplayLanguage;
  /** Seconds of no touch/interaction before the idle warning appears. */
  idleWarningAfterSeconds: number;
  /** Seconds the idle warning counts down before the session resets. */
  idleResetCountdownSeconds: number;
}

/**
 * Kiosk Admin-editable content for the customer kiosk's first (Welcome)
 * screen. Every text field is an optional literal override — when unset,
 * the kiosk falls back to its normal translated i18n copy, so a restaurant
 * that never touches this panel sees the same fully-localized screen as
 * before. An override is shown as-is (not re-translated per language),
 * which is an intentional trade-off: it's the simplest way to let an admin
 * customize this screen without building a full per-language CMS for it.
 */
export interface WelcomeScreenPresentation {
  headingText?: string;
  subtitleText?: string;
  startOrderButtonText?: string;
  supportingText?: string;
  /** Indian heritage-inspired corner artwork. Default on. */
  showHeritageArtwork: boolean;
  /** Default OFF per product spec — most restaurants start with no
   *  welcome-screen promo and opt in later. */
  showPromoBanner: boolean;
  promoBannerText?: string;
  /** Full-bleed photo behind the welcome screen. Unset falls back to the bundled default
   *  (/language-selection-bg.png) so an existing install sees no change until an admin picks one. */
  backgroundImageUrl?: string;
  backgroundLandscapeImageUrl?: string;
  backgroundId?: string;
  backgroundFit?: 'cover' | 'contain';
  backgroundPositionX?: number;
  backgroundPositionY?: number;
  backgroundZoom?: number;
  restaurantName?: string;
  logoUrl?: string;
  overlayOpacity?: number;
}

export interface WelcomeScreenSettings extends WelcomeScreenPresentation {
  customBackgrounds?: Array<{ id: string; name: string; imageUrl: string; width: number; height: number }>;
  /** Overrides are carried in the existing authenticated branch configuration. */
  deviceOverrides?: Record<string, WelcomeScreenPresentation>;
}

export interface VoiceConfig {
  enabled: boolean;
  style: VoiceStyle;
  language: VoiceLanguage;
  volume: number; // 0 to 1
  rate: number; // 0.5 to 2
  pitch: number; // 0.5 to 2
  confirmationVoiceEnabled: boolean;
  readyVoiceEnabled: boolean;
  quietMode: boolean;
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  idempotencyKey: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: 'UPI_GATEWAY' | 'CARD_POS' | 'CASH_DESK' | 'MOCK_TEST';
  gatewayTransactionId?: string;
  qrPayload?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  orderId: string;
  receiptNumber: string;
  contentFormatted: string;
  isPrinted: boolean;
  printedAt?: string;
  digitalUrl?: string;
}

export interface ServiceRequest {
  id: string;
  kioskId: string;
  tableNumber?: string;
  sessionId?: string;
  type: ServiceRequestType;
  notes?: string;
  status: ServiceRequestStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface DeviceHealth {
  kioskId: string;
  status: KioskStatus;
  isOnline: boolean;
  // null when this build has no way to read the real value (no native
  // system-info / hardware bridge available) — never a fabricated number.
  cpuUsagePercent: number | null;
  ramUsagePercent: number | null;
  storageFreeGb: number | null;
  appVersion: string;
  isPrinterOnline: boolean;
  isPaymentTerminalOnline: boolean | null;
  isTouchscreenResponsive: boolean | null;
  lastHeartbeat: string;
  pendingSyncEventsCount: number;
}

export interface DeviceRecord {
  id: string;
  name: string;
  type: 'POS' | 'KDS' | 'CAPTAIN' | 'KIOSK';
  platform?: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSync?: string;
  isPrimary?: boolean;
}

export interface SyncEvent {
  id: string;
  kioskId: string;
  eventType: SyncEventType;
  payload: any;
  status: SyncEventStatus;
  retryCount: number;
  lastAttemptAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  username?: string;
  kioskId?: string;
  action: string;
  category: string; // 'MENU', 'PRICING', 'ORDER', 'DEVICE', 'AUTH', 'SETTINGS', 'STAFF_OVERRIDE'
  details: string;
  ipAddress?: string;
  timestamp: string;
}

export interface CustomerFeedback {
  id: string;
  orderId?: string;
  kioskId: string;
  rating: number; // 1 to 5 stars
  tags: string[]; // 'Food Quality', 'Speed', 'Cleanliness', 'Packaging'
  comments?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerAccount {
  phone: string;
  name?: string;
  email?: string;
  address?: string;
  dob?: string; // YYYY-MM-DD Birthday
  anniversary?: string; // YYYY-MM-DD Anniversary
  notes?: string;
  tags?: string[]; // 'VIP' | 'REGULAR' | 'CORPORATE' | 'FAMILY' | 'VEGAN' | 'JAIN'
  loyaltyPoints: number; // e.g. 150 pts = ₹150 redeemable
  favoriteItemIds: string[];
  recentOrderIds: string[];
  totalVisits?: number;
  totalSpend?: number;
  createdAt?: string;
  lastVisitAt?: string;
  /** When this profile was last changed on any device (cross-device sync: the newer change wins). */
  updatedAt?: string;
}

/**
 * A spend-based tier that multiplies how fast a customer earns points —
 * evolves the previous flat "1 point per ₹10, no tiers" ledger. Tiers are
 * ordered by `minLifetimeSpend`; a customer's tier is whichever is the
 * highest one their `CustomerAccount.totalSpend` clears.
 */
export interface LoyaltyTier {
  id: string;
  name: string;
  minLifetimeSpend: number;
  pointsMultiplier: number; // e.g. 1 = base rate, 1.5 = 50% faster earning
  perks: string[];
  colorHex: string;
}

/** A catalog entry a customer can redeem points against, instead of a flat 1pt = ₹1 assumption. */
export interface LoyaltyReward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  isActive: boolean;
}

/**
 * The base earn rate before any tier multiplier — the admin's direct answer to "how many points do I
 * give". A single-row collection (id is always 'default') synced the same way as every other admin-edited
 * list (tiers, rewards), so it gets the same diffing and conflict resolution for free instead of a second,
 * bespoke single-object sync mechanism.
 */
export interface LoyaltyProgramSettings {
  id: 'default';
  /** Points earned per perRupeesSpent of the bill, e.g. earnPoints: 1, perRupeesSpent: 10 -> "1 point per ₹10 spent". */
  earnPoints: number;
  perRupeesSpent: number;
  updatedAt?: string;
}

export type PlanTier = 'CORE' | 'PRO';

export interface PlanEntitlements {
  posTerminal: boolean;
  offlineBilling: boolean;
  dineInTakeawayDeliveryToken: boolean;
  menuManagement: boolean;
  foodCustomization: boolean;
  discountsAndGst: boolean;
  multiPaymentTenders: boolean;
  tableManagement: boolean;
  customerManagement: boolean;
  kotKdsRouting: boolean;
  receiptPrinting: boolean;
  shiftAndCashDrawer: boolean;
  salesAndGstReports: boolean;
  inventoryManagement: boolean;
  posAssistant: boolean;
  restaurantAdmin: boolean;
  captainApp: boolean;
  advancedCaptainReports: boolean;
  advancedServiceWorkflow: boolean;
  qrTableOrdering?: boolean;
  /** Self-Order Kiosk + Kiosk Admin — a real, distinct PRO-tier feature
   *  (AppCode.KIOSK / KIOSK_ADMIN in cloud/api) that this entitlement list
   *  never represented at all until now, so it never showed up anywhere
   *  a plan's feature set was displayed or gated. */
  selfOrderKiosk?: boolean;
}

/**
 * Operational QR-ordering controls owned by the PLATFORM (Super Admin), not by
 * the restaurant. The plan entitlement (`PlanEntitlements.qrTableOrdering`)
 * decides whether the restaurant is *sold* QR ordering; this decides whether
 * the platform is currently *allowing* it and within what limits.
 *
 * A restaurant admin must never be able to widen these — they arrive only from
 * a verified cloud sync (see LicenseRepository.applyPlatformQrControl) and the
 * guest ordering path enforces them on every scan.
 */
export interface PlatformQrControl {
  /** Platform kill-switch. False blocks every guest scan regardless of plan. */
  qrOrderingEnabled: boolean;
  /** Hard ceiling on simultaneously QR-active tables. */
  maxActiveTables: number;
  /** Null means the platform sets no daily order ceiling. */
  maxOrdersPerDay: number | null;
  digitalMenu: boolean;
  guestCustomization: boolean;
  liveOrderTracking: boolean;
  qrAnalytics: boolean;
  onlinePayments: boolean;
  /** When this control block was last received from the platform. */
  syncedAt: string;
}

/** Real QR usage measured from this restaurant's own order data. */
export interface QrUsageSnapshot {
  activeTables: number;
  ordersToday: number;
  revenueToday: number;
  reportedAt: string;
}

export interface LicenseInfo {
  planName: string;
  tier: PlanTier;
  price: number;
  billingPeriod?: string;
  licenseKey: string;
  allowedDevicesCount: number;
  activeDevicesCount: number;
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED';
  activatedAt?: string;
  validUntil: string;
  restaurantId: string;
  restaurantName?: string;
  branchName?: string;
  terminalId?: string;
  entitlements: PlanEntitlements;
  /** Set only when this license was written via a cryptographically verified path (ENT-001 fix) — absent for test/legacy-set data. */
  verifiedAt?: string;
  verificationSource?: 'cloud-sync' | 'offline-certificate';
  /**
   * Platform-owned QR controls. Absent means the platform has never pushed a
   * control block, in which case the plan entitlement alone governs and no
   * extra platform restriction applies.
   */
  platformQrControl?: PlatformQrControl;
}

export interface ComboDeal {
  id: string;
  name: string;
  description: string;
  translations?: Record<string, { name: string; description?: string }>;
  basePrice: number;
  originalPrice: number;
  savingsAmount: number;
  mainItemIds: string[];
  sideItemIds: string[];
  drinkItemIds: string[];
  dessertItemIds: string[];
  imageUrl?: string;
  isAvailable: boolean;
  featured?: boolean;
  /** When this combo was last changed on any device (cross-device sync: the newer change wins). */
  updatedAt?: string;
}

export interface RecommendationRule {
  id: string;
  triggerItemId?: string;
  triggerCategoryId?: string;
  recommendedItemIds: string[];
  explanation: string; // e.g. "Customers often pair Butter Naan with Paneer Lababdar"
  discountDelta?: number;
  isActive: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'ASSISTANT';
  text: string;
  timestamp: string;
  suggestions?: string[];
  actionItems?: MenuItem[];
  actionCombos?: ComboDeal[];
  actionLink?: string;
  requiresConfirmation?: boolean;
  pendingActionPayload?: {
    action: string;
    targetId?: string;
    details?: string;
  };
}

export type NetworkState = 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'SYNCING' | 'DEGRADED';

export type ReceiptDeliveryMethod = 'PRINT' | 'WHATSAPP' | 'SMS' | 'EMAIL' | 'QR' | 'SKIP';
export type ReceiptDeliveryStatus = 'NOT_REQUESTED' | 'REQUESTED' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
export type ReceiptPaperSize = '58mm' | '80mm';

export interface ReceiptConfig {
  /** The restaurant's own logo, printed at the top of its receipts (optional). */
  logoUrl?: string;
  restaurantName: string;
  address: string;
  phone: string;
  gstin: string;
  fssaiNumber: string;
  footerMessage: string;
  thankYouMessage: string;
  paperSize: ReceiptPaperSize;
  showCustomerPhone: boolean;
  showTaxBreakup: boolean;
  showTokenBig: boolean;
  enableWhatsApp: boolean;
  enableSms: boolean;
  enableEmail: boolean;
  enableQrReceipt: boolean;
  /** @deprecated Receipts and KOTs are standard black and white; this value is ignored. Was: hex highlight color for the token badge and totals rule.
   *  Default (unset) is the JAMANVAAR brand orange. A physical thermal printout stays
   *  black-and-white regardless — thermal printer hardware cannot print color. */
  accentColor?: string;
  /** A cash bill can carry a faint diagonal watermark (word in cashWatermarkText). Off unless set to true. */
  showCashWatermark?: boolean;
  /** The word repeated in that watermark (default "CASH"). */
  cashWatermarkText?: string;
  /** @deprecated Ignored: the KOT preview is black on white. Was: background color of the on-screen Kitchen Order Ticket preview (the kiosk's own "what got
   *  sent to the kitchen" card, not the physical KOT printout, which is monochrome). Must stay a
   *  dark tone for the light ticket text to stay legible, so this is chosen from a curated set
   *  rather than an arbitrary hex. Default (unset) is JAMANVAAR navy. */
  kotThemeColor?: string;
}

export interface ReceiptRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  tokenNumber: string;
  deliveryMethod: ReceiptDeliveryMethod;
  deliveryStatus: ReceiptDeliveryStatus;
  recipient: string; // phone / email (masked for privacy)
  paperSize?: ReceiptPaperSize;
  content: string;
  createdAt: string;
  sentAt?: string;
  errorMessage?: string;
}

export type PrinterInterfaceType = 'USB' | 'SERIAL' | 'NETWORK_LAN' | 'WINDOWS_DRIVER' | 'VIRTUAL_EMULATOR';
export type PrinterHardwareStatus = 'READY' | 'OFFLINE' | 'PAPER_OUT' | 'ERROR' | 'BUSY' | 'UNKNOWN';
export type PrinterRole = 'RECEIPT' | 'KITCHEN' | 'BAR' | 'TANDOOR' | 'DESSERT' | 'REPORT' | 'GENERAL';

export interface PrinterDevice {
  id: string;
  name: string;
  role?: PrinterRole;
  driverName?: string;
  /** The printer's name in Windows (Printers & scanners); USB and driver printers print through it. */
  systemPrinterName?: string;
  interfaceType: PrinterInterfaceType;
  port?: string;
  /** Serial speed for a SERIAL printer; 9600 when not set. */
  baudRate?: number;
  ipAddress?: string;
  paperSize: ReceiptPaperSize;
  status: PrinterHardwareStatus;
  isDefault: boolean;
  isKioskBuiltIn: boolean;
  modelName: string;
  manufacturer?: string;
  assignedTerminalId?: string;
  lastTestAt?: string;
  lastPrintAt?: string;
  lastError?: string;
}

export type PrintJobStatus = 'QUEUED' | 'PENDING' | 'PRINTING' | 'PRINTED' | 'SUCCESS' | 'FAILED' | 'RETRYING';
export type PrintJobType = 'RECEIPT_80MM' | 'RECEIPT_58MM' | 'KOT_TICKET' | 'TEST_PAGE' | 'SHIFT_REPORT';

export interface PrintJob {
  id: string;
  type?: PrintJobType;
  orderId?: string;
  orderNumber?: string;
  tokenNumber?: string;
  kotId?: string;
  kotNumber?: string;
  receiptId?: string;
  printerId: string;
  printerName?: string;
  targetStation?: string;
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  rawEscPos?: string;
  rawPayload?: string;
  formattedText?: string;
  paperSize: ReceiptPaperSize;
  createdAt: string;
  printedAt?: string;
  completedAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  errorMessage?: string;
  isReprint?: boolean;
}

export interface GeneratedReport {
  id: string;
  title: string;
  reportType: 'DAILY_SALES' | 'ITEM_SALES' | 'CATEGORY_SALES' | 'PAYMENT_MIX' | 'KIOSK_PERFORMANCE' | 'TAX_GST';
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  summaryMetrics: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    totalDiscount: number;
    totalTax: number;
  };
  rows: Array<{
    label: string;
    metric1: string | number;
    metric2?: string | number;
    metric3?: string | number;
    metric4?: string | number;
  }>;
}

export interface SplitPaymentPortion {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  status: PaymentStatus;
}

export interface ShiftRecord {
  id: string;
  /** This device's Nth shift ever opened (B2-046) — the display label used to be the last 2 digits of the shift id's millisecond timestamp, which looked like a sequence number but wasn't one. */
  shiftNumber?: number;
  posId: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  status: ShiftStatus;
  openingCash: number;
  closingCash?: number;
  expectedCash: number;
  actualCash?: number;
  cashVariance?: number;
  totalCashSales: number;
  totalUpiSales: number;
  totalCardSales: number;
  totalSales: number;
  totalDiscounts: number;
  totalOrders: number;
  notes?: string;
  /** B2-056: cross-device sync change time (CollectionSync) — POS pushes, Restaurant Admin pulls. */
  updatedAt?: string;
}

export interface CashMovement {
  id: string;
  shiftId: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  reason: string;
  cashierName: string;
  authorizedBy?: string;
  timestamp: string;
  /** B2-056: cross-device sync change time (CollectionSync) — POS pushes, Restaurant Admin pulls. */
  updatedAt?: string;
}

export interface KOTItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  modifiers: SelectedModifier[];
  specialInstructions?: string;
  kitchenStation: string;
  status: KOTStatus;
  isDelta?: boolean;
  /** The order line this ticket line cooks. Set for every ticket made from now on; older tickets are matched by menuItemId. */
  orderItemId?: string;
  course?: string;
  /** Dining seat copied from the order line for kitchen delivery and reprints. */
  seat?: number;
  /** Mirrors OrderItem.statusRev, so a recall on one device reaches the ticket on every other. */
  rev?: number;
  cancelReason?: string;
  /** When the cook marked this dish done (per-dish status on the kitchen screen). */
  readyAt?: string;
}

export interface KOTRecord {
  id: string;
  kotNumber: string; // e.g. KOT-01
  orderId: string;
  orderNumber: string;
  tokenNumber: string;
  tableNumber?: string;
  orderType: OrderType;
  station: string; // 'Main Kitchen', 'Tandoor', 'Bar', 'Dessert'
  type: KOTType;
  items: KOTItem[];
  serverName?: string;
  cashierName: string;
  createdAt: string;
  readyAt?: string;
  servedAt?: string;
  printed: boolean;
  status: KOTStatus;
  /** Order-level free-text note (e.g. allergy/dietary instructions), distinct from per-item specialInstructions. */
  orderNotes?: string;
}

export type KOT = KOTRecord;

export interface HeldOrder {
  id: string;
  label: string;
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  cart: Cart;
  totalAmount: number;
  itemCount: number;
  heldAt: string;
  cashierName: string;
  notes?: string;
}

export interface ManagerOverrideRequest {
  id: string;
  action: ManagerOverrideAction;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  approved: boolean;
  details?: Record<string, any>;
  timestamp: string;
}

export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  tableNumber?: string;
  tableId?: string;
  reservationTime: string;
  status: 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
  specialRequests?: string;
  depositAmount?: number;
  createdAt: string;
  /** When the booking last changed; the newest change wins when devices sync it. */
  updatedAt?: string;
}

export interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  queuePosition: number;
  estimatedWaitMinutes: number;
  status: 'WAITING' | 'SEATED' | 'CANCELLED' | 'CALLED';
  notes?: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  outletId?: string;
  name: string;
  sku: string;
  category: string;
  unit: string; // 'kg', 'ltr', 'pcs', 'grams', 'boxes'
  currentStock: number;
  /** Immutable stock before ledger movements; synced masters never overwrite the live balance. */
  openingStock?: number;
  minStockLevel: number;
  reorderLevel: number;
  costPerUnit: number;
  supplierName?: string;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  lastRestockedAt?: string;
  updatedAt: string;
}

export type WastageReasonCode =
  | 'KITCHEN_PREP_TRIM'
  | 'DROPPED_SPILLED'
  | 'EXPIRED_SPOILED'
  | 'QUALITY_REJECT'
  | 'CUSTOMER_RETURN'
  | 'OTHER';

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'PURCHASE' | 'RESTOCK' | 'SALE' | 'SALE_REVERSAL' | 'WASTE' | 'SPOILAGE' | 'ADJUSTMENT';
  quantityDelta: number;
  unit: string;
  costImpact?: number;
  orderId?: string;
  reason: string;
  // Structured reason taxonomy + optional photo evidence — only ever set for
  // WASTE/SPOILAGE movements logged through the dedicated wastage workflow,
  // as opposed to the free-text reason every other movement type still uses.
  wastageReasonCode?: WastageReasonCode;
  photoUrl?: string;
  performedBy: string;
  timestamp: string;
  /** Set once the movement is acknowledged by the cloud ledger; unset means still to be pushed. */
  syncedAt?: string;
  /** True for a mirror of a movement made on another device (already in the ledger, never pushed). */
  remote?: boolean;
}

/** Someone the restaurant buys stock from (BUG-046). */
export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  paymentTerms?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptLine {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  expiryDate?: string;
  lineTotal: number;
}

/** A delivery booked into stock (a goods-received note). */
export interface GoodsReceipt {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber?: string;
  receivedAt: string;
  receivedBy: string;
  lines: GoodsReceiptLine[];
  totalCost: number;
  notes?: string;
}

/** Stock from one delivery line, tracked so what expires first is used first. */
export interface InventoryBatch {
  id: string;
  itemId: string;
  receiptId: string;
  receivedAt: string;
  expiryDate?: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number;
}

export interface StockCountLine {
  itemId: string;
  itemName: string;
  unit: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  varianceValue: number;
}

export interface StockCount {
  id: string;
  number: string;
  countedAt: string;
  countedBy: string;
  approvedBy?: string;
  lines: StockCountLine[];
  totalVarianceValue: number;
  note?: string;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  inventoryItemName: string;
  quantityPerPortion: number;
  unit: string;
}

export interface Recipe {
  id: string;
  menuItemId: string;
  menuItemName: string;
  ingredients: RecipeIngredient[];
  preparationNotes?: string;
  isActive: boolean;
}

export interface DraftCartSession {
  id: string;
  terminalId: string;
  orderType: OrderType;
  selectedTableId?: string;
  selectedTableNumber?: string;
  guestCount: number;
  customerPhone?: string;
  customerName?: string;
  cart: Cart;
  billDiscountPercent: number;
  billDiscountFlat: number;
  notes?: string;
  updatedAt: string;
}

export interface CaptainPermissions {
  CAN_REQUEST_BILL: boolean;
  CAN_VIEW_BILL: boolean;
  CAN_PRINT_BILL: boolean;
  CAN_ACCEPT_CASH: boolean;
  CAN_ACCEPT_UPI: boolean;
  CAN_ACCEPT_CARD: boolean;
  CAN_SETTLE_ORDER: boolean;
  CAN_APPLY_DISCOUNT: boolean;
  CAN_VOID_ITEM: boolean;
  CAN_TRANSFER_TABLE: boolean;
  CAN_MERGE_TABLE: boolean;
}

export interface CaptainProfile {
  id: string;
  employeeId: string;
  name: string;
  pin: string;
  role: 'CAPTAIN' | 'HEAD_WAITER' | 'FLOOR_MANAGER';
  assignedTableIds: string[];
  assignedTableNumbers: string[];
  activeShiftId?: string;
  shiftStartTime?: string;
  permissions: CaptainPermissions;
}

export interface FoodReadyItem {
  id: string;
  kotId: string;
  kotNumber: string;
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  itemId: string;
  dishName: string;
  quantity: number;
  modifiers: string[];
  specialInstructions?: string;
  station: string;
  readyAt: string;
  elapsedSeconds: number;
  isServed: boolean;
  servedAt?: string;
  servedBy?: string;
}

export type NotificationType =
  | 'BUSINESS_DAY_CLOSED'
  | 'BUSINESS_DAY_STARTED'
  | 'NEW_ORDER_CREATED'
  | 'KOT_CREATED'
  | 'KOT_READY'
  | 'FOOD_READY'
  | 'BILL_REQUESTED'
  | 'BILL_SETTLED'
  | 'PAYMENT_COMPLETED'
  | 'TABLE_OPENED'
  | 'TABLE_CLEARED'
  | 'LOW_STOCK'
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'MANAGER_ALERT'
  | 'GUEST_HELP';

export type NotificationRole = 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'ALL';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  targetRoles?: NotificationRole[];
  tableNumber?: string;
  meta?: Record<string, any>;
}

export interface BusinessDayPreCloseCheck {
  day: BusinessDay;
  activeOrdersCount: number;
  unpaidOrdersCount: number;
  pendingKotCount: number;
  unclosedShiftsCount: number;
  expectedCash: number;
  isReadyToClose: boolean;
  warnings: string[];
}

export interface CaptainNotification {
  id: string;
  type: 'FOOD_READY' | 'KOT_DELAYED' | 'BILL_READY' | 'TABLE_ASSIGNED' | 'TABLE_TRANSFER' | 'MANAGER_MESSAGE' | 'GUEST_HELP' | 'SYNC_ISSUE';
  title: string;
  message: string;
  tableNumber?: string;
  timestamp: string;
  isRead: boolean;
}

export interface EodReportBranding {
  restaurantName: string;
  legalName?: string;
  tagline?: string;
  logoUrl?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  gstin: string;
  fssaiNumber: string;
  msmeNumber?: string;
  website?: string;
  footerText?: string;
  primaryColor?: string;
  secondaryColor?: string;
  ownerName?: string;
  managerName?: string;
}

export interface EodReport {
  id: string; // EOD-YYYYMMDD-001
  businessDate: string; // YYYY-MM-DD
  displayDate: string; // e.g. 30 August 2026
  shiftId: string;
  shiftName: string;
  cashierId: string;
  cashierName: string;
  terminalId: string;
  openingFloat: number;
  closingFloat: number;
  shiftDuration: string; // e.g. "09:00 AM → 11:58 PM"
  ordersSettled: number;
  customersServed: number;
  tablesServed: number;

  // Daily Summary (Gross / Net / AOV)
  grossRevenue: number;
  netRevenue: number;
  avgBillValue: number;

  // Sales Breakdown by Department / Category
  salesBreakdown: {
    foodSales: number;
    beverageSales: number;
    dessertSales: number;
    otherSales: number;
    grossSales: number;
  };

  // Discounts & Refunds
  discountsAndRefunds: {
    manualDiscount: number;
    loyaltyDiscount: number;
    couponDiscount: number;
    refundsAmount: number;
    netDiscount: number;
  };

  // GST Tax Summary
  gstSummary: {
    taxableValue: number;
    cgstAmount: number; // 2.5%
    sgstAmount: number; // 2.5%
    totalTax: number; // 5%
    roundOff: number;
    finalCollection: number;
  };

  // Payment Settlement
  paymentSettlement: {
    cash: { count: number; amount: number };
    upi: { count: number; amount: number };
    card: { count: number; amount: number };
    wallet: { count: number; amount: number };
    houseAccount: { count: number; amount: number };
    splitPayment: { count: number; amount: number };
    totalCollection: number;
  };

  // Split Payment Summary Breakdown
  splitSummary: {
    cashUpiCount: number;
    cashCardCount: number;
    upiCardCount: number;
    otherSplitCount: number;
    totalSplitBills: number;
  };

  // Cash Drawer Reconciliation
  cashDrawer: {
    openingFloat: number;
    cashSales: number;
    cashRefund: number;
    cashPaidOut: number;
    expectedDrawer: number;
    actualDrawer: number;
    difference: number;
    isBalanced: boolean;
  };

  // Order Type Distribution
  orderTypeSummary: {
    dineIn: number;
    takeaway: number;
    delivery: number;
    token: number;
  };

  // Top Selling Items (Rank, Dish, Qty, Revenue)
  topSellingItems: Array<{
    rank: number;
    name: string;
    quantity: number;
    revenue: number;
  }>;

  // Top Categories (Category Name, Revenue)
  topCategories: Array<{
    name: string;
    revenue: number;
  }>;

  // Best Performing Captain
  captainPerformance: Array<{
    name: string;
    orders: number;
    sales: number;
  }>;

  // Cashier Performance
  cashierPerformance: Array<{
    name: string;
    bills: number;
    collection: number;
  }>;

  // Table Utilization
  tableUtilization: {
    topTables: Array<{
      tableNumber: string;
      revenue: number;
    }>;
    avgDiningTimeMinutes: number;
  };

  // Inventory Low Stock Alert
  lowStockInventory: Array<{
    name: string;
    currentStock: number;
    unit: string;
  }>;

  // Manager Notes & Signatures
  managerNotes: string;
  generatedAt: string; // ISO
  generatedAtFormatted: string; // 30 Aug 2026 11:58 PM
  generatedBy: string;
  status: 'DRAFT' | 'LOCKED' | 'SYNCED';
  branding: EodReportBranding;
}


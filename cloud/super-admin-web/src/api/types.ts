export const ENTITLEMENT_KEYS = [
  'posTerminal',
  'offlineBilling',
  'dineInTakeawayDeliveryToken',
  'menuManagement',
  'foodCustomization',
  'discountsAndGst',
  'multiPaymentTenders',
  'tableManagement',
  'customerManagement',
  'kotKdsRouting',
  'receiptPrinting',
  'shiftAndCashDrawer',
  'salesAndGstReports',
  'inventoryManagement',
  'posAssistant',
  'restaurantAdmin',
  'captainApp',
  'advancedCaptainReports',
  'advancedServiceWorkflow',
  'qrTableOrdering'
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];
export type Entitlements = Record<EntitlementKey, boolean>;

export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  posTerminal: 'POS Terminal',
  offlineBilling: 'Offline Billing',
  dineInTakeawayDeliveryToken: 'Dine-in / Takeaway / Delivery / Token',
  menuManagement: 'Menu Management',
  foodCustomization: 'Food Customization',
  discountsAndGst: 'Discounts & GST',
  multiPaymentTenders: 'Multi-Payment Tenders',
  tableManagement: 'Table Management',
  customerManagement: 'Customer Management',
  kotKdsRouting: 'KOT / KDS Routing',
  receiptPrinting: 'Receipt Printing',
  shiftAndCashDrawer: 'Shift & Cash Drawer',
  salesAndGstReports: 'Sales & GST Reports',
  inventoryManagement: 'Inventory Management',
  posAssistant: 'POS Assistant (JAMAN AI)',
  restaurantAdmin: 'Restaurant Admin',
  captainApp: 'Captain App',
  advancedCaptainReports: 'Advanced Captain Reports',
  advancedServiceWorkflow: 'Advanced Service Workflow',
  qrTableOrdering: 'QR Table Ordering & Standees'
};

export interface Plan {
  id: string;
  tier: 'CORE' | 'PRO' | 'ENTERPRISE';
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  maxBranches: number;
  maxDevices: number;
  maxUsers: number;
  entitlements: Entitlements;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  _count?: { subscriptions: number };
}

export interface PlanDetail extends Plan {
  subscriptions: Array<Subscription & { restaurant: { id: string; name: string; status: string } }>;
}

export interface Subscription {
  id: string;
  restaurantId: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED';
  startDate: string;
  expiresAt: string;
  trialEndsAt: string | null;
  plan: Plan;
}

export interface SubscriptionListItem extends Subscription {
  restaurant: { id: string; name: string; status: string };
}

export interface RestaurantCore {
  id: string;
  name: string;
  legalName: string | null;
  address?: string | null;
  city: string | null;
  state: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: string;
}

/** GET /api/v1/restaurants — carries _count instead of the full related rows. */
export interface RestaurantListItem extends RestaurantCore {
  _count: { branches: number; devices: number };
  users?: Array<{ id: string; fullName: string; email: string; phone: string | null }>;
  subscriptions: Subscription[];
}

export interface Branch {
  id: string;
  restaurantId: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  restaurant?: { id: string; name: string };
  _count?: { devices: number; users: number };
}

export interface TenantUser {
  id: string;
  restaurantId: string;
  email: string;
  fullName: string;
  role: string;
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED';
  phone: string | null;
  invitedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  restaurant?: { id: string; name: string; status: string };
}

export interface ActivationKey {
  id: string;
  code: string;
  restaurantId: string;
  status: 'ACTIVE' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';
  allowedDeviceType: 'POS' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'ANY';
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
  restaurant?: { id: string; name: string };
}

export interface Device {
  id: string;
  restaurantId: string;
  branchId: string | null;
  type: 'POS' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'POS_ADMIN';
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  name?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  osPlatform?: string | null;
  isLocked?: boolean;
  lockReason?: string | null;
  lockedAt?: string | null;
  pendingSyncCount?: number;
  syncError?: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastBackupAt: string | null;
  syncStatus: string | null;
  activatedAt: string | null;
  createdAt: string;
  restaurant?: { id: string; name: string };
  branch?: { id: string; name: string } | null;
}

export type DeviceCommandType =
  | 'LOCK'
  | 'UNLOCK'
  | 'FORCE_LOGOUT'
  | 'REVOKE_SESSION'
  | 'REVOKE_AUTH'
  | 'REQUEST_SYNC'
  | 'REQUEST_HEALTH'
  | 'APP_UPDATE'
  | 'RESTART_APP'
  | 'CLEAR_CACHE'
  | 'REQUEST_DIAGNOSTICS'
  | 'DISABLE_DEVICE'
  | 'ENABLE_DEVICE'
  | 'WIPE_LOCAL_DATA';

export type DeviceCommandStatus =
  | 'PENDING'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface DeviceCommand {
  id: string;
  deviceId: string;
  restaurantId: string;
  commandType: DeviceCommandType;
  status: DeviceCommandStatus;
  payload?: any;
  result?: any;
  errorMessage?: string | null;
  issuedById?: string | null;
  issuedAt: string;
  acknowledgedAt?: string | null;
  executedAt?: string | null;
  expiresAt: string;
}

export interface Backup {
  id: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantCity?: string | null;
  method: 'MANUAL' | 'AUTOMATIC';
  status: 'COMPLETED' | 'FAILED';
  sizeBytes: number;
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'CORRUPT';
  verifiedAt?: string | null;
  createdAt: string;
  errorMessage: string | null;
  device: { id: string; type: string } | null;
}

export interface MasterMenuCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  _count?: { items: number };
}

export interface MasterMenuItem {
  id: string;
  categoryId: string;
  category?: { id: string; name: string };
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  basePrice: number;
  preparationTimeMinutes: number;
  dietaryType: 'VEG' | 'NON_VEG' | 'VEGAN' | 'JAIN' | 'SWAMINARAYAN';
  isAvailable: boolean;
  allergens?: string[] | null;
  tags?: string[] | null;
  taxRate: number;
  hsnCode?: string | null;
  recipe?: any;
  createdAt: string;
  _count?: { syndications: number };
}

export interface SyncEventLog {
  id: string;
  restaurantId: string;
  restaurant?: { id: string; name: string };
  branchId?: string | null;
  deviceId?: string | null;
  device?: { id: string; type: string; name?: string } | null;
  entityType: string;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  latencyMs: number;
  payloadSize: number;
  errorMessage?: string | null;
  timestamp: string;
}

export interface SyncConflict {
  id: string;
  restaurantId: string;
  restaurant?: { id: string; name: string };
  branchId?: string | null;
  deviceId?: string | null;
  device?: { id: string; type: string; name?: string } | null;
  entityType: string;
  entityId: string;
  localVersion: any;
  cloudVersion: any;
  reason: string;
  resolution: 'PENDING' | 'CLOUD_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE';
  resolvedAt?: string | null;
  createdAt: string;
}

export interface PlatformTelemetry {
  database: {
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    latencyMs: number;
    activeConnections: number;
    sizeMb: number;
  };
  process: {
    uptimeSeconds: number;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    nodeVersion: string;
  };
  timestamp: string;
}

export interface SyncMetrics {
  events24h: number;
  failures24h: number;
  successRatePercent: number;
  activeSyncingDevices: number;
  pendingConflicts: number;
}

export interface OfflineExtension {
  id: string;
  restaurantId: string;
  restaurant?: { id: string; name: string; city?: string | null };
  branchId?: string | null;
  deviceId?: string | null;
  device?: { id: string; type: string; name?: string } | null;
  extensionDays: number;
  reason: string;
  requestedBy: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  certificatePayload: string;
  certificateSignature: string;
  validFrom: string;
  validUntil: string;
  createdAt: string;
}

export interface RestaurantSandbox {
  id: string;
  sourceRestaurantId: string;
  sourceRestaurant?: { id: string; name: string; city?: string | null };
  name: string;
  environmentKey: string;
  status: 'ACTIVE' | 'CREATING' | 'EXPIRED' | 'DELETED';
  config: any;
  expiresAt: string;
  createdAt: string;
}

/** GET /api/v1/restaurants/:id — carries the full related rows instead of _count. */
export interface RestaurantDetail extends RestaurantCore {
  gstin: string | null;
  fssaiNumber: string | null;
  address: string | null;
  country: string;
  timezone: string;
  currency: string;
  defaultLanguage: string;
  branches: Branch[];
  users: TenantUser[];
  devices: Device[];
  activationKeys: ActivationKey[];
  subscriptions: Subscription[];
}

export interface CreateRestaurantInput {
  name: string;
  legalName?: string;
  gstin?: string;
  fssaiNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  defaultLanguage?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
}

export interface AuditLogRow {
  id: string;
  actorType: 'PLATFORM' | 'TENANT' | 'SYSTEM';
  actorId: string | null;
  restaurantId: string | null;
  action: string;
  category: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export interface SystemHealth {
  api: 'UP';
  database: 'UP' | 'DOWN';
  databaseLatencyMs: number | null;
  uptimeSeconds: number;
  timestamp: string;
  nodeVersion: string;
  arch: string;
  platform: string;
}

export interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface DashboardOperationsTelemetry {
  platformHealth: {
    apiStatus: 'UP';
    databaseStatus: 'HEALTHY' | 'DOWN';
    databaseLatencyMs: number;
    activeConnections: number;
    uptimeSeconds: number;
  };
  syncHealth: {
    events24h: number;
    failures24h: number;
    successRatePercent: number;
    pendingConflicts: number;
  };
  backupHealth: {
    totalBackups: number;
    completedBackups: number;
    failedBackups: number;
    lastBackupAt: string | null;
  };
  fleetHealth: {
    connectivityPercent: number;
    byType: Array<{ type: string; count: number }>;
  };
}

export interface DashboardSummary {
  totalRestaurants: number;
  activeRestaurants: number;
  suspendedRestaurants: number;
  trialRestaurants?: number;
  totalBranches: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiringSubscriptions: number;
  registeredDevices: number;
  onlineDevices: number;
  offlineDevices?: number;
  newRestaurantsThisMonth: number;
  mrr: number;
  arr: number;
  pendingInvoices?: number;
  overdueInvoices?: number;
  pendingInvoiceAmount?: number;
  planDistribution: Array<{ planId: string; planName: string; subscriptionCount: number }>;
  recentActivity: AuditLogRow[];
  operations?: DashboardOperationsTelemetry;
  trends?: {
    growth: Array<{ month: string; count: number }>;
    revenue: Array<{ month: string; revenue: number }>;
  };
}

// ---------------------------------------------------------------------------
// Billing & Invoices
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'PAST_DUE' | 'VOID' | 'REFUNDED';
export type PaymentMethod = 'MANUAL' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'CHEQUE' | 'GATEWAY';

export interface Payment {
  id: string;
  invoiceId: string;
  restaurantId: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber: string | null;
  receiptNumber?: string | null;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface TaxBreakup {
  isIntraState: boolean;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  totalAmount: number;
  sacCode: string;
  description: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  restaurantId: string;
  subscriptionId: string | null;
  planId: string | null;
  amount: number; // paise
  taxAmount: number; // paise
  totalAmount: number; // paise
  currency: string;
  status: InvoiceStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  restaurant?: {
    id: string;
    name: string;
    legalName?: string;
    city?: string;
    state?: string;
    address?: string;
    gstin?: string;
    fssaiNumber?: string;
    users?: Array<{ fullName: string; email: string; phone?: string | null }>;
  };
  plan?: { id: string; name: string; tier: string; priceMonthly?: number };
  subscription?: { id: string; status: string; expiresAt: string };
  payments?: Payment[];
  taxBreakup?: TaxBreakup;
  totalPaid?: number;
  balanceDue?: number;
  paymentStatus?: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
}

export interface BillingSummary {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  pastDueInvoices: number;
  totalCollected: number; // in rupees
  pendingAmount: number; // in rupees
  collectionRatePercent?: number;
}

export interface ReceiptData {
  receiptNumber: string;
  paymentDate: string;
  invoiceNumber: string;
  invoiceId: string;
  transactionId: string;
  paymentMethod: string;
  paymentStatus: string;
  amountPaid: number;
  amountPaidRupees: string;
  totalInvoiceAmount: number;
  totalPaid: number;
  balanceDue: number;
  currency: string;
  planName: string;
  planTier: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  receivedFrom: {
    restaurantName: string;
    legalName: string;
    address: string | null;
    city: string | null;
    state: string | null;
    gstin: string | null;
    ownerName: string;
    ownerEmail: string;
  };
  seller: {
    companyName: string;
    tagline: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    gstin: string;
    pan: string;
    sacCode: string;
    supportEmail: string;
  };
  taxBreakup: TaxBreakup;
}

// ---------------------------------------------------------------------------
// JAMAN AI Engine & Assistant Configuration
// ---------------------------------------------------------------------------

export interface AiCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export interface AiQuestionItem {
  id: string;
  category: string;
  label: string;
  icon: string;
  intent: string;
  minPlanTier: 'CORE' | 'PRO';
  priorityScore: number;
  isEnabled: boolean;
  isCustom?: boolean;
  targetDomain?: 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS';
  calculationType?: 'SUM' | 'COUNT' | 'AVG' | 'RATIO' | 'TOP_LIST';
  filterField?: string;
  filterValue?: string;
  displayUnit?: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'MINUTES';
}

export interface AiGlobalSettings {
  mode: 'OFFLINE_RULE_BASED' | 'HYBRID_LLM';
  delayedKotMinutes: number;
  lowStockThreshold: number;
  cashDrawerVarianceThreshold: number;
  proactiveAlertsEnabled: boolean;
  corePlanTeaserEnabled: boolean;
  dailyQueryLimitPro: number;
  engineLatencyMs: number;
}

export interface AiTelemetry {
  totalQueries: number;
  todayQueries: number;
  activeProTenants: number;
  totalActiveTenants: number;
  adoptionRatePercent: number;
  topIntent: string;
  topIntents: Array<{ intent: string; count: number }>;
  latencyMs: number;
}

export interface AiAssistantConfigResponse {
  categories: AiCategory[];
  questions: AiQuestionItem[];
  settings: AiGlobalSettings;
  telemetry: AiTelemetry;
}

// ---------------------------------------------------------------------------
// Applications & Releases
// ---------------------------------------------------------------------------

export interface AppRelease {
  id: string;
  appCode: string;
  version: string;
  channel: 'STABLE' | 'BETA';
  minSupportedVersion: string | null;
  supportedPlatforms: string[];
  releaseNotes: string | null;
  downloadUrl: string | null;
  isMandatory: boolean;
  releasedAt: string;
  createdAt: string;
}

export interface ApplicationSummary {
  code: string;
  name: string;
  category: string;
  description: string;
  defaultPort?: number;
  currentVersion: string;
  channel: 'STABLE' | 'BETA';
  minSupportedVersion: string | null;
  supportedPlatforms: string[];
  downloadUrl: string | null;
  releaseNotes: string | null;
  releasedAt: string | null;
  totalDevices: number;
  activeDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  recentReleases: AppRelease[];
}

// ---------------------------------------------------------------------------
// Support & Diagnostics
// ---------------------------------------------------------------------------

export interface SearchResult {
  restaurants: RestaurantCore[];
  owners: TenantUser[];
  devices: Device[];
  activationKeys: ActivationKey[];
}

export interface RestaurantDiagnostics {
  restaurant: RestaurantCore & { legalName: string | null; gstin: string | null };
  owners: TenantUser[];
  branches: Branch[];
  activeSubscription: Subscription | null;
  subscriptionsHistory: Subscription[];
  devices: Device[];
  onlineDevicesCount: number;
  activationKeys: ActivationKey[];
  recentAudits: AuditLogRow[];
  entitlements: Record<string, boolean> | null;
}

// ---------------------------------------------------------------------------
// Platform Settings
// ---------------------------------------------------------------------------

export interface PlatformSetting {
  id: string;
  key: string;
  value: any;
  category: string;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Platform Team & RBAC
// ---------------------------------------------------------------------------

export type PlatformRole =
  | 'PLATFORM_OWNER'
  | 'SUPER_ADMIN'
  | 'PLATFORM_OPS'
  | 'SUPPORT_ADMIN'
  | 'FINANCE_ADMIN'
  | 'READ_ONLY';

export interface PlatformTeamUser {
  id: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  status: 'ACTIVE' | 'DISABLED' | 'PENDING_ACTIVATION';
  invitedAt: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Support Tickets
// ---------------------------------------------------------------------------

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TicketPersonRef {
  id: string;
  fullName: string;
  email?: string;
}

export interface SupportTicket {
  id: string;
  restaurantId: string | null;
  restaurant: { id: string; name: string } | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToId: string | null;
  assignedTo: TicketPersonRef | null;
  createdById: string;
  createdBy: TicketPersonRef;
  slaDueAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  author: { id: string; fullName: string };
  body: string;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicket {
  comments: TicketComment[];
}

export interface CreateRestaurantInput {
  name: string;
  city?: string;
  state?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  ownerPassword?: string;
}

export interface RestaurantReport {
  restaurant: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    status: string;
  };
  subscription: {
    planName: string;
    tier: string;
    status: string;
    priceMonthly: number;
    expiresAt: string;
  } | null;
  metrics: {
    branchesCount: number;
    devicesCount: number;
    activeDevices: number;
    offlineDevices: number;
    deviceTypeBreakdown: Record<string, number>;
    totalInvoices: number;
    totalBilled: number;
    collectedRevenue: number;
    outstandingReceivables: number;
    backupsCount: number;
    lastBackupAt: string | null;
    lastBackupStatus: string | null;
    syncEventsCount: number;
    pendingConflictsCount: number;
  };
}


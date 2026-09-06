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

interface RestaurantCore {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: string;
}

/** GET /api/v1/restaurants — carries _count instead of the full related rows. */
export interface RestaurantListItem extends RestaurantCore {
  _count: { branches: number; devices: number };
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
  type: 'POS' | 'CAPTAIN' | 'KDS' | 'KIOSK';
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
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

export interface Backup {
  id: string;
  method: 'MANUAL' | 'AUTOMATIC';
  status: 'COMPLETED' | 'FAILED';
  sizeBytes: number;
  createdAt: string;
  errorMessage: string | null;
  device: { id: string; type: string } | null;
}

/** GET /api/v1/restaurants/:id — carries the full related rows instead of _count. */
export interface RestaurantDetail extends RestaurantCore {
  legalName: string | null;
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
}

export interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface DashboardSummary {
  totalRestaurants: number;
  activeRestaurants: number;
  suspendedRestaurants: number;
  totalBranches: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiringSubscriptions: number;
  registeredDevices: number;
  onlineDevices: number;
  newRestaurantsThisMonth: number;
  mrr: number;
  arr: number;
  planDistribution: Array<{ planId: string; planName: string; subscriptionCount: number }>;
  recentActivity: AuditLogRow[];
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
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
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
  restaurant?: { id: string; name: string; legalName?: string; city?: string; gstin?: string };
  plan?: { id: string; name: string; tier: string };
  payments?: Payment[];
}

export interface BillingSummary {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  pastDueInvoices: number;
  totalCollected: number; // in rupees
  pendingAmount: number; // in rupees
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


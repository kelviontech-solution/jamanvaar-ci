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
  'advancedServiceWorkflow'
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
  advancedServiceWorkflow: 'Advanced Service Workflow'
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
  activatedAt: string | null;
  createdAt: string;
  restaurant?: { id: string; name: string };
  branch?: { id: string; name: string } | null;
}

/** GET /api/v1/restaurants/:id — carries the full related rows instead of _count. */
export interface RestaurantDetail extends RestaurantCore {
  legalName: string | null;
  gstin: string | null;
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

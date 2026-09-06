import type { PlanEntitlements } from './domain';

/**
 * Single source of truth for the granular, marketing-facing feature lists shown on
 * plan comparison screens (e.g. Restaurant Admin's Subscription Plans view).
 *
 * These groups are descriptive detail underneath the real enforcement mechanism —
 * the 19 boolean flags on `PlanEntitlements` (packages/types/src/domain.ts), which is
 * what `Plan.entitlements` actually stores in cloud/api and what any future
 * entitlement check gates on. `entitlementKeys` on each group is a best-effort tag
 * back to the flag(s) that conceptually govern it; some groups span more than one key
 * because the 19-flag schema is coarser than this marketing catalog.
 */
export interface PlanFeatureGroup {
  id: string;
  title: string;
  /** Icon identifier the UI resolves to a component locally — this package has no UI dependency. */
  iconName: string;
  entitlementKeys: (keyof PlanEntitlements)[];
  isFlagship?: boolean;
  features: string[];
}

export const CORE_PLAN_FEATURE_GROUPS: PlanFeatureGroup[] = [
  {
    id: 'pos_billing',
    title: '1. POS & Fast Billing',
    iconName: 'UtensilsCrossed',
    entitlementKeys: ['posTerminal', 'dineInTakeawayDeliveryToken'],
    features: [
      'Fast Counter Billing',
      'New Order Creation',
      'Dine-In Orders',
      'Takeaway Orders',
      'Delivery Orders',
      'Token Orders',
      'Item Search',
      'SKU Search',
      'Category-Based Menu',
      'Quick Add Items',
      'Item Quantity Control',
      'Item Customization',
      'Item Modifiers',
      'Special Instructions',
      'Order Notes',
      'Customer Attachment',
      'Repeat Previous Order',
      'Hold Order',
      'Recall Held Order',
      'Order Editing',
      'Discount Application',
      'Automatic Tax Calculation',
      'Bill Preview',
      'Bill Generation',
      'Bill Reopening',
      'Invoice Numbering',
      'Token Number Generation',
      'Fast Touch-Friendly POS Interface'
    ]
  },
  {
    id: 'payments_cash',
    title: '2. Payments & Cash Drawer',
    iconName: 'Banknote',
    entitlementKeys: ['multiPaymentTenders', 'shiftAndCashDrawer'],
    features: [
      'Cash Payment',
      'UPI Payment',
      'BharatQR Payment',
      'Card Payment',
      'Split Payment',
      'Multiple Payment Methods',
      'Payment Settlement',
      'Cash Tender Entry',
      'Automatic Change Calculation',
      'Cash Drawer Management',
      'Opening Cash / Float',
      'Closing Cash',
      'Cash Variance',
      'Cashier Shift Tracking',
      'Payment History',
      'Refund Management',
      'Payment Status Tracking',
      'Daily Cash Collection',
      'Payment Reconciliation'
    ]
  },
  {
    id: 'table_floor',
    title: '3. Table & Floor Management',
    iconName: 'LayoutGrid',
    entitlementKeys: ['tableManagement'],
    features: [
      'Visual Floor Plan',
      'Multiple Restaurant Sections',
      'Table Creation',
      'Table Numbering',
      'Table Capacity',
      'Available Table Status',
      'Occupied Table Status',
      'Reserved Table Status',
      'Table Order Management',
      'Guest Count',
      'Open Table',
      'Close Table',
      'Transfer Table',
      'Merge Tables',
      'Split Table',
      'Move Order Between Tables',
      'Table-Based Billing',
      'Table Occupancy Tracking',
      'Table Turnover Tracking',
      'Real-Time Table Status'
    ]
  },
  {
    id: 'kitchen_kot',
    title: '4. Kitchen / KOT / Basic KDS',
    iconName: 'ChefHat',
    entitlementKeys: ['kotKdsRouting'],
    features: [
      'KOT Creation',
      'KOT Sending',
      'KOT Printing',
      'KOT Reprinting',
      'Kitchen Order Queue',
      'Kitchen Station Routing',
      'Kitchen Station Assignment',
      'Order Preparing Status',
      'Order Ready Status',
      'Order Completed Status',
      'Food Ready Notification',
      'KOT Cancellation',
      'KOT Modification',
      'Kitchen Notes',
      'Order Priority',
      'Kitchen Order Timing',
      'Basic KDS',
      'Pending KOT Tracking',
      'Kitchen Availability Status'
    ]
  },
  {
    id: 'menu_inventory',
    title: '5. Menu & Inventory',
    iconName: 'Package',
    entitlementKeys: ['menuManagement', 'foodCustomization', 'inventoryManagement'],
    features: [
      'Menu Management',
      'Category Management',
      'Dish Management',
      'Dish Images',
      'Dish Descriptions',
      'Dish SKU',
      'Dish Pricing',
      'Veg / Jain / Non-Veg Classification',
      'Dish Availability',
      'Mark Dish Available',
      'Mark Dish Unavailable',
      'Kitchen Station Assignment',
      'Modifier Management',
      'Recipe Information',
      'Inventory Tracking',
      'Low Stock Status',
      'Item Availability Management',
      'Inventory Search',
      'Category Filtering',
      'Starter Menu Import',
      'Bulk Menu Management'
    ]
  },
  {
    id: 'reports_gst',
    title: '6. Reports & GST',
    iconName: 'BarChart3',
    entitlementKeys: ['salesAndGstReports', 'discountsAndGst'],
    features: [
      'Daily Sales Report',
      'Order Report',
      'Payment Report',
      'Cash Report',
      'GST Report',
      'CGST / SGST Breakdown',
      'Discount Report',
      'Top Selling Dishes',
      'Dish Velocity',
      'Average Order Value',
      'Sales by Order Type',
      'Sales by Payment Method',
      'Cashier Performance',
      'Shift Performance',
      'Date-Based Reports',
      'Custom Date Reports',
      'Monthly Reports',
      'Yearly Reports',
      'Report Preview',
      'Print Reports',
      'PDF Reports',
      'CSV Export'
    ]
  },
  {
    id: 'offline_ops',
    title: '7. Offline-First Operations',
    iconName: 'HardDrive',
    entitlementKeys: ['offlineBilling'],
    features: [
      'Local SQLite Database',
      'Offline Billing',
      'Offline Order Creation',
      'Offline Menu Access',
      'Offline Table Management',
      'Offline KOT Queue',
      'Offline Reports',
      'Local Print Queue',
      'Offline Payment Recording',
      'Automatic Sync When Online',
      'Sync Retry',
      'Local Data Persistence',
      'Connection Status',
      'Local Engine Status',
      'Offline-First POS Operation'
    ]
  },
  {
    id: 'printing_hw',
    title: '8. Printing & Hardware',
    iconName: 'Printer',
    entitlementKeys: ['receiptPrinting'],
    features: [
      '58mm Thermal Printer Support',
      '80mm Thermal Printer Support',
      'ESC/POS Printing',
      'Automatic Printer Detection',
      'Receipt Printing',
      'KOT Printing',
      'Report Printing',
      'Reprint Receipt',
      'Print Queue',
      'Printer Status',
      'Printer Test Print',
      'Auto-Print After Payment',
      'Auto-Print KOT',
      'Cash Drawer Trigger',
      'Printer Configuration'
    ]
  },
  {
    id: 'customer_mgmt',
    title: '9. Customer Management',
    iconName: 'Users',
    entitlementKeys: ['customerManagement'],
    features: [
      'Customer Database',
      'Customer Search',
      'Customer Phone Number',
      'Customer Order History',
      'Customer Visit History',
      'Customer Spending History',
      'Customer Notes',
      'Loyalty Points',
      'Repeat Customer Tracking',
      'Customer Information on Bills'
    ]
  },
  {
    id: 'restaurant_admin',
    title: '10. Restaurant Administration',
    iconName: 'Settings',
    entitlementKeys: ['restaurantAdmin'],
    features: [
      'Restaurant Settings',
      'Branch Information',
      'Tax Configuration',
      'Bill Configuration',
      'Printer Configuration',
      'Kitchen Configuration',
      'Menu Configuration',
      'User Management',
      'Role Management',
      'Cashier Management',
      'Device Configuration',
      'License Management',
      'Subscription Management',
      'Audit Records'
    ]
  }
];

/** PRO-exclusive groups — everything in CORE_PLAN_FEATURE_GROUPS is included in PRO in addition to these. */
export const PRO_PLAN_FEATURE_GROUPS: PlanFeatureGroup[] = [
  {
    id: 'captain',
    title: '1. Wireless Captain / Waiter App',
    iconName: 'Smartphone',
    entitlementKeys: ['captainApp'],
    isFlagship: true,
    features: [
      'Captain Login',
      'Waiter Login',
      'Staff Profile',
      'Assigned Tables',
      'My Tables',
      'Table Availability',
      'Table Occupancy',
      'Table-Side Ordering',
      'Browse Menu',
      'Search Dishes',
      'Add Items',
      'Modify Quantity',
      'Item Modifiers',
      'Special Instructions',
      'Customer Attachment',
      'Table Notes',
      'Send Order to POS',
      'Send Order to Kitchen',
      'Course-Based Ordering',
      'Course Dispatch',
      'Order Status Tracking',
      'Preparing Status',
      'Food Ready Status',
      'Food Ready Notification',
      'Bill Request',
      'View Bill',
      'Payment Request',
      'Reorder',
      'Repeat Previous Order',
      'Table Transfer',
      'Table Merge',
      'Table Split',
      'Captain Order Attribution',
      'Waiter Performance',
      'Orders Handled',
      'Captain Sales Tracking',
      'Offline Captain Mode',
      'Automatic POS Synchronization',
      'Real-Time Updates'
    ]
  },
  {
    id: 'qr_kiosk',
    title: '2. QR Table Ordering & Kiosk',
    iconName: 'QrCode',
    entitlementKeys: ['qrTableOrdering', 'advancedServiceWorkflow'],
    features: [
      'Table QR Code',
      'Unique QR per Table',
      'Scan-to-Order',
      'Digital Menu',
      'Digital Categories',
      'Dish Images',
      'Dish Descriptions',
      'Dish Customization',
      'Modifiers',
      'Customer Cart',
      'Quantity Selection',
      'Special Instructions',
      'Table Identification',
      'Order Submission',
      'POS Order Reception',
      'Kitchen Order Routing',
      'Order Status',
      'QR Order Tracking',
      'Kiosk Integration',
      'Kiosk Touch Ordering',
      'Kiosk Menu',
      'Kiosk Cart',
      'Kiosk Order Confirmation',
      'Kiosk Token Generation',
      'Kiosk POS Synchronization',
      'Kiosk KDS Synchronization',
      'Kiosk Printer Integration',
      'Multiple Ordering Channels'
    ]
  },
  {
    id: 'sync',
    title: '3. Real-Time Multi-Machine Mesh Sync',
    iconName: 'Network',
    entitlementKeys: ['advancedServiceWorkflow'],
    features: [
      'POS ↔ Captain Sync',
      'POS ↔ KDS Sync',
      'POS ↔ Kiosk Sync',
      'Captain ↔ KDS Sync',
      'Kiosk ↔ KDS Sync',
      'Real-Time Order Sync',
      'Real-Time Table Sync',
      'Real-Time Menu Sync',
      'Real-Time Availability Sync',
      'Real-Time Order Status Sync',
      'Bill Status Synchronization',
      'Device Presence',
      'Online / Offline Device Status',
      'Automatic Reconnection',
      'Sync Retry',
      'Offline Queue',
      'Pending Sync Queue',
      'Conflict Handling',
      'Duplicate Prevention',
      'Event Synchronization',
      'Device Health Monitoring',
      'Multi-Machine Restaurant Network'
    ]
  },
  {
    id: 'kds',
    title: '4. Advanced Multi-Station KDS',
    iconName: 'ChefHat',
    entitlementKeys: ['kotKdsRouting'],
    features: [
      'Multiple Kitchen Stations',
      'Main Kitchen',
      'Tandoor Station',
      'Curry Station',
      'Beverage Station',
      'Dessert Station',
      'Biryani Station',
      'Station-Based KOT Routing',
      'Automatic Order Routing',
      'Course Routing',
      'Kitchen Queue',
      'Priority Orders',
      'Preparing Orders',
      'Ready Orders',
      'Completed Orders',
      'Food Ready Notifications',
      'Delayed KOT Detection',
      'Order Preparation Timer',
      'Station Performance',
      'Kitchen Performance',
      'KOT Reprinting',
      'KOT Modification',
      'KOT Cancellation',
      'Real-Time KDS Updates',
      'Multi-Screen KDS',
      'Kitchen Load Visibility'
    ]
  },
  {
    id: 'ai',
    title: '5. JAMANVAAR AI Restaurant Assistant',
    iconName: 'Bot',
    entitlementKeys: ['posAssistant'],
    features: [
      "Today's Sales Questions",
      "Today's Order Questions",
      'Average Order Value Analysis',
      'Payment Analysis',
      'Cash Analysis',
      'Kitchen Analysis',
      'Delayed KOT Analysis',
      'Table Occupancy Analysis',
      'Menu Performance Analysis',
      'Top Selling Dish Analysis',
      'Slow Selling Dish Analysis',
      'Sales Trend Analysis',
      'Customer Analysis',
      'Restaurant Performance Questions',
      'Operational Insights',
      'Low Stock Insights',
      'Low Availability Insights',
      'Business Summary',
      'Daily Restaurant Summary',
      'Management Questions',
      'Natural Language Restaurant Queries',
      'Offline Local AI Intelligence',
      'Local Database-Based Answers'
    ]
  },
  {
    id: 'analytics',
    title: '6. Advanced Analytics + CRM + Live Monitoring',
    iconName: 'BarChart3',
    entitlementKeys: ['advancedCaptainReports', 'salesAndGstReports'],
    features: [
      'Advanced Sales Analytics',
      'Hourly Sales Analysis',
      'Day-of-Week Analysis',
      'Sales Heatmaps',
      'Channel Performance',
      'POS vs Captain vs Kiosk',
      'Table Utilization',
      'Table Turnover',
      'Average Order Value',
      'Dish Velocity',
      'Category Performance',
      'Gross Sales',
      'Net Sales',
      'Discount Analysis',
      'GST Analysis',
      'Payment Mix',
      'Cash Performance',
      'UPI Performance',
      'Card Performance',
      'Customer Lifetime Value',
      'Repeat Customer Analysis',
      'Customer Visit Frequency',
      'Customer Spending Patterns',
      'Captain Sales Attribution',
      'Orders Handled by Captain',
      'Waiter Performance',
      'KOT Performance',
      'Kitchen Timing',
      'Delayed Order Detection',
      'Low Stock Alerts',
      'Low Availability Alerts',
      'Live POS Monitoring',
      'Live Captain Monitoring',
      'Live KDS Monitoring',
      'Live Kiosk Monitoring',
      'Printer Monitoring',
      'Device Monitoring',
      'Sync Monitoring',
      'Operational Alerts',
      'Historical Comparisons',
      'Daily vs Weekly Comparison',
      'Monthly Performance Analysis',
      'Restaurant Flow Metrics'
    ]
  }
];

export function countFeatures(groups: PlanFeatureGroup[]): number {
  return groups.reduce((sum, g) => sum + g.features.length, 0);
}

export const CORE_DEFAULT_ENTITLEMENTS: PlanEntitlements = {
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
  posAssistant: true, // Basic Assistant in Core
  restaurantAdmin: true,
  captainApp: false,
  advancedCaptainReports: false,
  advancedServiceWorkflow: false,
  qrTableOrdering: false
};

export const PRO_DEFAULT_ENTITLEMENTS: PlanEntitlements = {
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
  qrTableOrdering: true
};

export const PRO_EXCLUSIVE_KEYS: (keyof PlanEntitlements)[] = [
  'captainApp',
  'advancedCaptainReports',
  'advancedServiceWorkflow',
  'qrTableOrdering'
];

export const CORE_KEYS: (keyof PlanEntitlements)[] = [
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
  'restaurantAdmin'
];

export function resolveTierEntitlements(
  tier: 'CORE' | 'PRO' | 'ENTERPRISE',
  customOverrides?: Partial<PlanEntitlements>
): PlanEntitlements {
  if (tier === 'CORE') {
    return {
      ...CORE_DEFAULT_ENTITLEMENTS,
      ...(customOverrides || {}),
      // Enforce Pro exclusive features remain false for Core tier unless upgraded
      captainApp: false,
      advancedCaptainReports: false,
      advancedServiceWorkflow: false,
      qrTableOrdering: false
    };
  }

  // PRO or ENTERPRISE inherits everything in Core plus Pro exclusive
  return {
    ...PRO_DEFAULT_ENTITLEMENTS,
    ...(customOverrides || {})
  };
}

/** Operational groupings mapping to the 7 core SaaS sections in Super Admin & Restaurant Admin */
export interface OperationalModuleCategory {
  id: string;
  name: string;
  description: string;
  isProExclusive?: boolean;
  entitlementKeys: (keyof PlanEntitlements)[];
  catalogGroupIds: string[];
}

export const OPERATIONAL_MODULE_CATEGORIES: OperationalModuleCategory[] = [
  {
    id: 'pos_billing',
    name: '1. POS & Fast Billing',
    description: 'High-speed counter billing, token order creation, dine-in/takeaway, order hold/recall, discounts and automated taxes.',
    entitlementKeys: ['posTerminal', 'dineInTakeawayDeliveryToken'],
    catalogGroupIds: ['pos_billing']
  },
  {
    id: 'payments_cash',
    name: '2. Payments & Cash Drawer',
    description: 'Cash, UPI/BharatQR, card, split payments, cashier shifts, float management, change calculation and cash variance tracking.',
    entitlementKeys: ['multiPaymentTenders', 'shiftAndCashDrawer'],
    catalogGroupIds: ['payments_cash']
  },
  {
    id: 'table_floor',
    name: '3. Table & Floor Management',
    description: 'Visual floor plan, multi-zone dining (AC, Terrace, Main Hall), table occupancy status, table merge, split and transfer.',
    entitlementKeys: ['tableManagement'],
    catalogGroupIds: ['table_floor']
  },
  {
    id: 'kitchen_kot',
    name: '4. Kitchen, KOT & KDS',
    description: 'KOT generation, kitchen timers, multi-station kitchen routing, preparing/ready tracking and station load balancing.',
    entitlementKeys: ['kotKdsRouting'],
    catalogGroupIds: ['kitchen_kot', 'kds']
  },
  {
    id: 'menu_inventory',
    name: '5. Menu & Inventory Management',
    description: 'Categorized menu, item modifiers, recipe costing, 86 dish availability toggles, stock adjustments and low stock alerts.',
    entitlementKeys: ['menuManagement', 'foodCustomization', 'inventoryManagement'],
    catalogGroupIds: ['menu_inventory']
  },
  {
    id: 'reports_admin',
    name: '6. Reports, GST & Administration',
    description: 'Statutory 5% GST reporting (CGST/SGST), daily sales summaries, cashier performance, customer CRM, printer setup and RBAC.',
    entitlementKeys: ['salesAndGstReports', 'discountsAndGst', 'offlineBilling', 'receiptPrinting', 'customerManagement', 'restaurantAdmin'],
    catalogGroupIds: ['reports_gst', 'offline_ops', 'printing_hw', 'customer_mgmt', 'restaurant_admin']
  },
  {
    id: 'connected_ecosystem',
    name: '7. Connected Restaurant Ecosystem',
    description: 'Wireless Captain app for table-side ordering, QR table scan-to-order, self-service kiosk, real-time multi-terminal mesh sync, JAMAN AI assistant and advanced analytics.',
    isProExclusive: true,
    entitlementKeys: ['captainApp', 'advancedCaptainReports', 'advancedServiceWorkflow', 'qrTableOrdering', 'posAssistant'],
    catalogGroupIds: ['captain', 'qr_kiosk', 'sync', 'ai', 'analytics']
  }
];


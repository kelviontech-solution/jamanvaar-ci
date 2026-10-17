export type PosAdminTab =
  | 'OPERATIONS_HUB'
  | 'DASHBOARD'
  | 'QR_ORDERING'
  | 'BILLING_SALES'
  | 'ORDERS'
  | 'LIVE_KDS'
  | 'MENU'
  | 'MENU_OPTIONS'
  | 'TABLES'
  | 'RESERVATIONS'
  | 'KITCHEN_KOT'
  | 'INVENTORY'
  | 'CUSTOMERS'
  | 'STAFF'
  | 'PAYMENTS'
  | 'REPORTS'
  | 'SHIFTS'
  | 'HARDWARE'
  | 'SYNC'
  | 'SETTINGS'
  | 'LICENSE'
  | 'AUDIT'
  | 'BACKUP'
  | 'SUPPORT'
  | 'INVENTORY_CONTROL'
  | 'KIOSK_EXPERIENCE'
  | 'KIOSK_DESIGN'
  | 'KIOSK_WELCOME'
  | 'KIOSK_COMBOS'
  | 'KIOSKS'
  | 'COUPONS'
  | 'RECEIPTS'
  | 'TEMPLATES'
  | 'KIOSK_PAYMENTS'
  | 'FEEDBACK'
  | 'DOWNLOADS';

/** The real production tab list, as a runtime array -- restoreActiveTab validates against this
 *  (not a hardcoded fixture), so a test can prove every actual tab round-trips, and the array
 *  can't silently drift out of sync with the PosAdminTab type above (TS flags it if they diverge). */
export const ALL_POS_ADMIN_TABS: readonly PosAdminTab[] = [
  'OPERATIONS_HUB', 'DASHBOARD', 'QR_ORDERING', 'BILLING_SALES', 'ORDERS', 'LIVE_KDS', 'MENU', 'MENU_OPTIONS',
  'TABLES', 'RESERVATIONS', 'KITCHEN_KOT', 'INVENTORY', 'CUSTOMERS', 'STAFF', 'PAYMENTS',
  'REPORTS', 'SHIFTS', 'HARDWARE', 'SYNC', 'SETTINGS', 'LICENSE', 'AUDIT', 'BACKUP', 'SUPPORT',
  'INVENTORY_CONTROL', 'KIOSK_EXPERIENCE', 'KIOSK_DESIGN', 'KIOSK_WELCOME', 'KIOSK_COMBOS', 'KIOSKS', 'COUPONS', 'RECEIPTS', 'TEMPLATES', 'KIOSK_PAYMENTS', 'FEEDBACK', 'DOWNLOADS'
];



/** Compatibility validator for callers of the old tab API. Routing now restores product and page together. */
export function restoreActiveTab(stored: string | null): PosAdminTab {
  return stored && (ALL_POS_ADMIN_TABS as readonly string[]).includes(stored) ? (stored as PosAdminTab) : 'DASHBOARD';
}


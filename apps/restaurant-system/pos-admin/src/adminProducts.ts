import type { AppCode } from './cloud/cloudClient';
import type { PosAdminTab } from './App';

export type AdminProduct = 'POS_ADMIN' | 'KIOSK_ADMIN';
export const ADMIN_PRODUCTS = {
  POS_ADMIN: { name: 'Restaurant Admin', root: '/restaurant-admin/', description: 'Restaurant operations, floor, inventory and billing' },
  KIOSK_ADMIN: { name: 'Kiosk Admin', root: '/kiosk-admin/', description: 'Customer kiosks, menu, appearance and payments' }
} as const;

// A page belongs to a product explicitly. The physical console's POS_ADMIN device identity
// is never used as proof of a product entitlement.
export const PRODUCT_PAGES: Record<AdminProduct, Partial<Record<PosAdminTab, string>>> = {
  POS_ADMIN: {
    DASHBOARD: 'dashboard', BILLING_SALES: 'billing', ORDERS: 'orders', LIVE_KDS: 'live-kitchen',
    TABLES: 'tables', RESERVATIONS: 'reservations', KITCHEN_KOT: 'kitchen', QR_ORDERING: 'qr-ordering',
    MENU: 'menu', MENU_OPTIONS: 'options', INVENTORY: 'inventory', INVENTORY_CONTROL: 'purchasing',
    CUSTOMERS: 'customers', STAFF: 'staff', PAYMENTS: 'payments', COUPONS: 'coupons', SHIFTS: 'shifts',
    REPORTS: 'reports', HARDWARE: 'printers', RECEIPTS: 'receipts', SYNC: 'sync', SETTINGS: 'settings',
    LICENSE: 'subscription', AUDIT: 'audit', BACKUP: 'backup', SUPPORT: 'support', TEMPLATES: 'templates'
  },
  KIOSK_ADMIN: {
    DASHBOARD: 'dashboard', KIOSKS: 'terminals', MENU: 'menu', TEMPLATES: 'templates', MENU_OPTIONS: 'options',
    KIOSK_DESIGN: 'appearance', KIOSK_WELCOME: 'welcome-screen', KIOSK_COMBOS: 'combos', COUPONS: 'coupons', ORDERS: 'orders',
    LIVE_KDS: 'kitchen', TABLES: 'tables', STAFF: 'staff', KIOSK_PAYMENTS: 'payments',
    FEEDBACK: 'feedback', REPORTS: 'reports', HARDWARE: 'printers', RECEIPTS: 'receipts', SYNC: 'sync',
    SETTINGS: 'settings', LICENSE: 'subscription', AUDIT: 'audit', BACKUP: 'backup', SUPPORT: 'support'
  }
};

export interface AdminRoute { product: AdminProduct | null; page: PosAdminTab | null; invalid: boolean }
export function parseAdminRoute(pathname: string): AdminRoute {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length || (parts.length === 1 && parts[0] === 'pos-admin')) return { product: null, page: null, invalid: false };
  const product = parts[0] === 'kiosk-admin' ? 'KIOSK_ADMIN'
    : parts[0] === 'restaurant-admin' || parts[0] === 'pos-admin' ? 'POS_ADMIN' : null;
  if (!product) return { product: null, page: null, invalid: true };
  const page = parts.length === 1 ? 'DASHBOARD'
    : Object.entries(PRODUCT_PAGES[product]).find(([, slug]) => slug === parts[1])?.[0] as PosAdminTab | undefined;
  return { product, page: page ?? null, invalid: !page || parts.length > 2 };
}
export function adminPagePath(product: AdminProduct, page: PosAdminTab): string {
  const slug = PRODUCT_PAGES[product][page];
  if (!slug) throw new Error('This page does not belong to the selected application.');
  return ADMIN_PRODUCTS[product].root + slug;
}
export function availableAdminProducts(apps: readonly AppCode[]): AdminProduct[] {
  return (['POS_ADMIN', 'KIOSK_ADMIN'] as const).filter(app => apps.includes(app));
}
export interface AdminPreference { product?: AdminProduct; pages?: Partial<Record<AdminProduct, PosAdminTab>> }
export function readAdminPreference(raw: string | null): AdminPreference {
  try {
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object') return {};
    const product = value.product === 'POS_ADMIN' || value.product === 'KIOSK_ADMIN' ? value.product : undefined;
    const pages: AdminPreference['pages'] = {};
    for (const app of ['POS_ADMIN', 'KIOSK_ADMIN'] as const) {
      const page = value.pages?.[app];
      if (typeof page === 'string' && Object.hasOwn(PRODUCT_PAGES[app], page)) pages[app] = page as PosAdminTab;
    }
    return { product, pages };
  } catch { return {}; }
}
export function resolveAdminRoute(route: AdminRoute, available: readonly AdminProduct[], saved: AdminPreference): AdminRoute {
  if (route.product || route.invalid) return route;
  const product = saved.product && available.includes(saved.product) ? saved.product : available.length === 1 ? available[0] : null;
  return { product, page: product ? saved.pages?.[product] || 'DASHBOARD' : null, invalid: false };
}

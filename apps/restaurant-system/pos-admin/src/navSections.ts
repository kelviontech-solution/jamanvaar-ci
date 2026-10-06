import {
  Activity,
  Award,
  CalendarClock,
  Coins,
  CreditCard,
  Database,
  DollarSign,
  Flame,
  Grid,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Tablet,
  Tag,
  TrendingUp,
  Truck,
  UtensilsCrossed,
  Users
} from 'lucide-react';
import type { GatedNavSection, NavSectionItem } from './hooks/useEntitlements';

/**
 * The sidebar's nav structure, as its own module so it's directly importable by a test (proving
 * the real production data gates KIOSKS — not a fixture that merely looks like it) without
 * needing component-render test infrastructure this app doesn't have.
 */
export const NAV_SECTIONS: Array<GatedNavSection<NavSectionItem>> = [
  {
    section: 'OPERATIONS',
    items: [
      { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'BILLING_SALES', label: 'Billing / Invoices', icon: DollarSign, requiresApp: 'POS_ADMIN' },
      { id: 'ORDERS', label: 'Orders', icon: ShoppingBag, requiresApp: 'POS_ADMIN' },
      { id: 'LIVE_KDS', label: 'Live Orders / KDS', icon: Flame, requiresApp: 'POS_ADMIN' },
      { id: 'TABLES', label: 'Floor / Tables', icon: Grid, requiresApp: 'POS_ADMIN' },
      { id: 'RESERVATIONS', label: 'Reservations', icon: CalendarClock, requiresApp: 'POS_ADMIN' },
      { id: 'KITCHEN_KOT', label: 'Kitchen / KOT', icon: Activity, requiresApp: 'POS_ADMIN' }
    ]
  },
  {
    section: 'DIGITAL ORDERING',
    items: [{ id: 'QR_ORDERING', label: 'QR Table Ordering', icon: QrCode }]
  },
  {
    section: 'MENU & INVENTORY',
    items: [
      { id: 'MENU', label: 'Menu & Categories', icon: UtensilsCrossed, requiresAnyApp: ['POS_ADMIN', 'KIOSK_ADMIN'] },
      { id: 'MENU_OPTIONS', label: 'Customisations & Tax', icon: Sliders, requiresAnyApp: ['POS_ADMIN', 'KIOSK_ADMIN'] },
      { id: 'INVENTORY', label: 'Inventory & Recipes', icon: Package, requiresApp: 'POS_ADMIN' },
      { id: 'INVENTORY_CONTROL', label: 'Purchasing & Stock Control', icon: Truck, requiresApp: 'POS_ADMIN' }
    ]
  },
  {
    section: 'PEOPLE & CASH',
    items: [
      { id: 'CUSTOMERS', label: 'Customers CRM', icon: Heart, requiresApp: 'POS_ADMIN' },
      { id: 'STAFF', label: 'Staff & Roles (RBAC)', icon: Users, requiresApp: 'POS_ADMIN' },
      { id: 'PAYMENTS', label: 'Payments & Split', icon: CreditCard, requiresApp: 'POS_ADMIN' },
      { id: 'COUPONS', label: 'Offers & Coupons', icon: Tag },
      { id: 'SHIFTS', label: 'Shift & Cash Drawer', icon: Coins, requiresApp: 'POS_ADMIN' }
    ]
  },
  {
    section: 'KIOSK',
    items: [{ id: 'KIOSKS', label: 'Kiosk Terminals', icon: Tablet, requiresApp: 'KIOSK_ADMIN' }, { id: 'KIOSK_DESIGN', label: 'Kiosk Appearance & Content', icon: Sliders, requiresApp: 'KIOSK_ADMIN' }, { id: 'KIOSK_COMBOS', label: 'Kiosk Combos & Deals', icon: Tag, requiresApp: 'KIOSK_ADMIN' }]
  },
  {
    section: 'ANALYTICS & SYSTEM',
    items: [
      { id: 'REPORTS', label: 'Reports & Analytics', icon: TrendingUp },
      { id: 'HARDWARE', label: 'Printers & Devices', icon: Printer },
      { id: 'RECEIPTS', label: 'Receipt & E-Bill', icon: Receipt },
      { id: 'SYNC', label: 'Sync & Devices', icon: RefreshCw },
      { id: 'SETTINGS', label: 'Restaurant Settings', icon: Settings },
      { id: 'LICENSE', label: 'Subscription Plans', icon: Award },
      { id: 'AUDIT', label: 'Audit Trail Logs', icon: ShieldCheck },
      { id: 'BACKUP', label: 'Backup & Restore', icon: Database },
      { id: 'SUPPORT', label: 'Help & Support', icon: LifeBuoy }
    ]
  }
];

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
      { id: 'BILLING_SALES', label: 'Billing / Invoices', icon: DollarSign },
      { id: 'ORDERS', label: 'Orders', icon: ShoppingBag },
      { id: 'LIVE_KDS', label: 'Live Orders / KDS', icon: Flame },
      { id: 'TABLES', label: 'Floor / Tables', icon: Grid },
      { id: 'RESERVATIONS', label: 'Reservations', icon: CalendarClock },
      { id: 'KITCHEN_KOT', label: 'Kitchen / KOT', icon: Activity }
    ]
  },
  {
    section: 'DIGITAL ORDERING',
    items: [{ id: 'QR_ORDERING', label: 'QR Table Ordering', icon: QrCode }]
  },
  {
    section: 'MENU & INVENTORY',
    items: [
      { id: 'MENU', label: 'Menu & Categories', icon: UtensilsCrossed },
      { id: 'MENU_OPTIONS', label: 'Customisations & Tax', icon: Sliders },
      { id: 'INVENTORY', label: 'Inventory & Recipes', icon: Package },
      { id: 'INVENTORY_CONTROL', label: 'Purchasing & Stock Control', icon: Truck }
    ]
  },
  {
    section: 'PEOPLE & CASH',
    items: [
      { id: 'CUSTOMERS', label: 'Customers CRM', icon: Heart },
      { id: 'STAFF', label: 'Staff & Roles (RBAC)', icon: Users },
      { id: 'PAYMENTS', label: 'Payments & Split', icon: CreditCard },
      { id: 'COUPONS', label: 'Offers & Coupons', icon: Tag },
      { id: 'SHIFTS', label: 'Shift & Cash Drawer', icon: Coins }
    ]
  },
  {
    section: 'KIOSK',
    items: [{ id: 'KIOSKS', label: 'Kiosk Terminals', icon: Tablet, requiresApp: 'KIOSK_ADMIN' }]
  },
  {
    section: 'ANALYTICS & SYSTEM',
    items: [
      { id: 'REPORTS', label: 'Reports & Analytics', icon: TrendingUp },
      { id: 'HARDWARE', label: 'Printers & Devices', icon: Printer },
      { id: 'SYNC', label: 'Sync & Devices', icon: RefreshCw },
      { id: 'SETTINGS', label: 'Restaurant Settings', icon: Settings },
      { id: 'LICENSE', label: 'Subscription Plans', icon: Award },
      { id: 'AUDIT', label: 'Audit Trail Logs', icon: ShieldCheck },
      { id: 'BACKUP', label: 'Backup & Restore', icon: Database },
      { id: 'SUPPORT', label: 'Help & Support', icon: LifeBuoy }
    ]
  }
];

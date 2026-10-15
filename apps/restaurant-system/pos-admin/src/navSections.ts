import {
  Activity,
  Award,
  CalendarClock,
  Coins,
  CreditCard,
  Database,
  DollarSign,
  Download,
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
import { PRODUCT_PAGES, type AdminProduct } from './adminProducts';

/**
 * The sidebar's nav structure, as its own module so it's directly importable by a test (proving
 * the real production data gates KIOSKS — not a fixture that merely looks like it) without
 * needing component-render test infrastructure this app doesn't have.
 */
export const NAV_SECTIONS: Array<GatedNavSection<NavSectionItem>> = [
  {
    section: 'OPERATIONS',
    items: [
      { id: 'OPERATIONS_HUB', label: 'Operations hub', icon: Activity },
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
    items: [{ id: 'QR_ORDERING', label: 'QR Ordering', icon: QrCode, requiresApp: 'QR_ORDERING' }]
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
      { id: 'SUPPORT', label: 'Help & Support', icon: LifeBuoy },
      { id: 'DOWNLOADS', label: 'App Downloads', icon: Download }
    ]
  }
];

/** Product shells share components, not one combined list of tasks. */
export function productNavSections(product: AdminProduct): Array<GatedNavSection<NavSectionItem>> {
  if (product === 'POS_ADMIN') {
    const items = new Map(NAV_SECTIONS.flatMap(g => g.items).map(i => [i.id,i]));
    const groups: Array<[string,string[]]> = [
      ['DAILY',['DASHBOARD','ORDERS','MENU','CUSTOMERS','SYNC']],
      ['OPERATIONS',['OPERATIONS_HUB','BILLING_SALES','SHIFTS','LIVE_KDS','KITCHEN_KOT','TABLES','RESERVATIONS','INVENTORY','INVENTORY_CONTROL']],
      ['KIOSK MANAGEMENT',['KIOSKS','KIOSK_WELCOME','KIOSK_DESIGN','KIOSK_COMBOS','KIOSK_PAYMENTS','FEEDBACK']],
      ['QR ORDERING',['QR_ORDERING']],
      ['REPORTS',['REPORTS','AUDIT']],
      ['SETUP',['TEMPLATES','MENU_OPTIONS','COUPONS','STAFF','PAYMENTS','HARDWARE','RECEIPTS','SETTINGS','LICENSE','BACKUP','SUPPORT','DOWNLOADS']],
    ];
    items.set('KIOSK_WELCOME',{id:'KIOSK_WELCOME',label:'Welcome screens',icon:Tablet,requiresApp:'KIOSK_ADMIN'});
    items.set('TEMPLATES',{id:'TEMPLATES',label:'Menu templates',icon:UtensilsCrossed,requiresApp:'POS_ADMIN'});
    items.set('KIOSK_PAYMENTS',{id:'KIOSK_PAYMENTS',label:'Kiosk payment settings',icon:CreditCard,requiresApp:'KIOSK_ADMIN'});
    items.set('FEEDBACK',{id:'FEEDBACK',label:'Kiosk feedback',icon:Heart,requiresApp:'KIOSK_ADMIN'});
    const labels: Record<string,string> = {DASHBOARD:'Today',MENU:'Menu',STAFF:'Team & permissions',CUSTOMERS:'Customers & loyalty',KITCHEN_KOT:'Kitchen tickets',LIVE_KDS:'Kitchen progress',SYNC:'Devices & sync',AUDIT:'Activity history',SHIFTS:'Register shifts & cash'};
    return groups.map(([section,ids]) => ({section,items:ids.filter(id => items.has(id) && Object.hasOwn(PRODUCT_PAGES.POS_ADMIN,id)).map(id => ({...items.get(id)!,label:labels[id] ?? items.get(id)!.label}))}));
  }
  const existing = new Map(NAV_SECTIONS.flatMap(group => group.items).map(item => [item.id, item]));
  const sections = [
    ['DAILY', ['DASHBOARD', 'ORDERS', 'MENU', 'SYNC']],
    ['OPERATIONS', ['OPERATIONS_HUB','LIVE_KDS', 'TABLES', 'REPORTS', 'FEEDBACK']],
    ['KIOSK MANAGEMENT', ['KIOSKS', 'KIOSK_WELCOME', 'KIOSK_DESIGN', 'KIOSK_COMBOS']],
    ['QR ORDERING', ['QR_ORDERING']],
    ['SETUP', ['TEMPLATES', 'MENU_OPTIONS', 'COUPONS', 'KIOSK_PAYMENTS', 'RECEIPTS', 'HARDWARE', 'STAFF', 'SETTINGS', 'LICENSE', 'AUDIT', 'BACKUP', 'SUPPORT', 'DOWNLOADS']]
  ] as const;
  const additions: Record<string, NavSectionItem> = {
    KIOSK_WELCOME: { id: 'KIOSK_WELCOME', label: 'Kiosk Welcome Screen', icon: Tablet },
    TEMPLATES: { id: 'TEMPLATES', label: 'Menu Templates', icon: UtensilsCrossed },
    KIOSK_PAYMENTS: { id: 'KIOSK_PAYMENTS', label: 'Payments & Payouts', icon: CreditCard },
    FEEDBACK: { id: 'FEEDBACK', label: 'Customer Feedback', icon: Heart }
  };
  return sections.map(([section, ids]) => ({ section, items: ids.map(id => {
    const item = existing.get(id) || additions[id];
    return { ...item, label: id === 'SETTINGS' ? 'Kiosk Settings' : id === 'DASHBOARD' ? 'Today' : id === 'SYNC' ? 'Devices & sync' : id === 'MENU' ? 'Menu' : item.label,
      requiresApp: id === 'QR_ORDERING' ? 'QR_ORDERING' as const : 'KIOSK_ADMIN' as const, requiresAnyApp: undefined };
  }) }));
}

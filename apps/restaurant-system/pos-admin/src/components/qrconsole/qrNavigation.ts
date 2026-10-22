import {
  Users,
  LayoutDashboard,
  UtensilsCrossed,
  QrCode,
  Palette,
  ReceiptText,
  CreditCard,
  Clock3,
  ChartNoAxesCombined,
  Settings2,
  Sparkles,
  BellRing,
  CalendarClock,
  CalendarCheck,
  ChartColumnIncreasing,
  Paintbrush,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

export const QR_PAGES = [
 {id:'RECEIPTS',label:'Bills & receipts',group:'Payments',icon:ReceiptText,description:'Customise guest bills and PDF receipts for this branch.'},
 {id:'WEBSITE_QR',label:'Restaurant Page QR',group:'Website & QR',icon:QrCode,description:'Design and print the QR that opens your restaurant website. Separate from table ordering codes.'},
 {id:'RESTAURANT_PAGE',label:'Restaurant website',group:'Website & QR',icon:Paintbrush,description:'Design your mobile website, publish it and share your restaurant QR.'},
 {id:'OPERATIONS',label:'Operations Hub',group:'Orders & service',icon:LayoutDashboard,description:'Branch service controls, guest follow-up, handovers and acceptance.'},
 {id:'ONBOARDING',label:'Guided Menu Setup',group:'Menu',icon:UtensilsCrossed,description:'Load cuisine templates, review pricing and publish your shared guest menu.'},
 {id:'ACCEPTANCE',label:'Payment Acceptance',group:'Payments',icon:CreditCard,description:'Check configuration and record a real phone checkout against verified payment.'},
 {id:'RECONCILIATION',label:'Collection Reconciliation',group:'Payments',icon:ReceiptText,description:'Close the day using collection-date totals by collector, method and branch.'},
 {id:'CALENDAR',label:'Pickup Calendar',group:'Orders & service',icon:CalendarClock,description:'Review booked pickup slots and complete guest handovers.'},
 {id:'RESERVATIONS',label:'Reservations',group:'Orders & service',icon:CalendarCheck,description:'Confirm, decline or seat table requests sent from your restaurant website.'},
 {id:'PRINTPACK',label:'QR Print Packs',group:'Website & QR',icon:QrCode,description:'Download branded cards, print sheets and replacement inventory together.'},
  {id:"CRM",label:"Customers & Loyalty",group:"Customers",icon:Users,description:"Manage shared customers, point balances, rewards and verified visit history."},
  {
    id: "OVERVIEW",
    label: "Today",
    group: "Today",
    icon: LayoutDashboard,
    description:
      "Your branch at a glance. Keep orders moving and your guest experience ready.",
  },
  {
    id: "ORDERS",
    label: "QR Orders",
    group: "Orders & service",
    icon: ReceiptText,
    description:
      "Follow every guest order, verify payments and manage kitchen progress.",
  },
  {
    id: "SERVICE",
    label: "Service Requests",
    group: "Orders & service",
    icon: BellRing,
    description: "Respond to table requests and keep your floor team in sync.",
  },
  {
    id: "MENU",
    label: "Menu & Availability",
    group: "Menu",
    icon: UtensilsCrossed,
    description:
      "Create dishes, organise categories and publish the menu your guests see.",
  },
  {
    id: "TABLES",
    label: "Tables & QR",
    group: "Website & QR",
    icon: QrCode,
    description: "Connect each table to the right menu and manage its QR code.",
  },
  {
    id: "DESIGN",
    label: "Table QR Design",
    group: "Website & QR",
    icon: Palette,
    description: "Design cards that open table ordering directly. Restaurant Page QR posters have their own design workspace.",
  },
  {
    id: "BRAND",
    label: "Customer Branding",
    group: "Website & QR",
    icon: Paintbrush,
    description:
      "Preview and personalise your customer menu before applying changes.",
  },
  {
    id: "PAYMENTS",
    label: "Payments",
    group: "Payments",
    icon: CreditCard,
    description:
      "Control online checkout and counter payments with clear collection status.",
  },
  {
    id: "RULES",
    label: "Ordering Rules",
    group: "Settings",
    icon: Clock3,
    description:
      "Set opening hours, preparation time and the ordering modes you offer.",
  },
  {
    id: "PICKUP",
    label: "Pickup Scheduling",
    group: "Settings",
    icon: CalendarClock,
    description:
      "Offer takeaway slots that respect your branch hours and kitchen capacity.",
  },
  {
    id: "SETTINGS",
    label: "QR Settings",
    group: "Settings",
    icon: Settings2,
    description: "Manage core ordering settings and customer-facing messages.",
  },
  {
    id: "ADVANCED",
    label: "Guest engagement",
    group: "Customers",
    icon: Sparkles,
    description:
      "Configure licensed languages, loyalty, promotions and operational tools.",
  },
  {
    id: "ANALYTICS",
    label: "Analytics",
    group: "Today",
    icon: ChartNoAxesCombined,
    description:
      "Understand real orders, verified collections and your ordering funnel.",
  },
  {
    id: "PERFORMANCE",
    label: "Menu Performance",
    group: "Menu",
    icon: ChartColumnIncreasing,
    description:
      "See which dishes turn browsing into orders using actual sales data.",
  },
  {
    id: "SUPPORT",
    label: "Help & Support",
    group: "Settings",
    icon: LifeBuoy,
    description:
      "Raise a problem or feature request and follow the JAMANVAAR team's replies by ticket number.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  description: string;
}>;
export type QrTab = (typeof QR_PAGES)[number]["id"];
// U03: QR Settings, Ordering Rules, Payment Settings, Advanced Features and Operations used to
// scatter across "Launch setup" and "Advanced configuration" with no coherent story — Operations
// was already consolidated under "Live operations" (quick service controls stay there, first),
// and the rest now sit under the three groups the audit asked for: Guest experience, Payments,
// Service rules. "Restaurant default vs. branch override" is already called out per-page by the
// scope banner in QrConsole.tsx (see the tab list there) — unaffected by this reshuffle.
export const QR_GROUP_ORDER = ['Today', 'Orders & service', 'Menu', 'Website & QR', 'Customers', 'Payments', 'Settings'];
const TASK_ORDER: QrTab[] = ['OVERVIEW','ANALYTICS','ORDERS','SERVICE','CALENDAR','RESERVATIONS','OPERATIONS','MENU','ONBOARDING','PERFORMANCE','RESTAURANT_PAGE','WEBSITE_QR','TABLES','DESIGN','PRINTPACK','BRAND','CRM','ADVANCED','PAYMENTS','ACCEPTANCE','RECONCILIATION','RECEIPTS','RULES','PICKUP','SETTINGS','SUPPORT'];
export const QR_NAVIGATION = [...QR_PAGES].sort((a,b) => {
  const rank = (group: string) => {const index = QR_GROUP_ORDER.indexOf(group);return index < 0 ? QR_GROUP_ORDER.length : index;};
  return rank(a.group) - rank(b.group) || TASK_ORDER.indexOf(a.id) - TASK_ORDER.indexOf(b.id);
});
export const QR_ADVANCED_SECTIONS = [
  "Settings",
  "Translations",
  "Promotions",
  "Feedback",
  "Alerts",
  "Collections",
  "License",
] as const;
export function currentQrFeature(): string {
  const value = new URLSearchParams(location.search).get("feature");
  return QR_ADVANCED_SECTIONS.find((s) => s === value) ?? "Settings";
}
export function filterQrNavigation(query: string) {
  const search = query.trim().toLowerCase();
  return QR_NAVIGATION.filter(page => !search || `${page.label} ${page.description} ${page.group} ${page.id === 'ADVANCED' ? QR_ADVANCED_SECTIONS.join(' ') : ''}`.toLowerCase().includes(search));
}
export function currentQrTab(): QrTab {
  const value = new URLSearchParams(location.search).get("tab");
  return QR_PAGES.find((p) => p.id === value)?.id ?? "OVERVIEW";
}

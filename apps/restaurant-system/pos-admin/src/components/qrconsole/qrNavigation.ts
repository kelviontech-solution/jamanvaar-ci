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
 {id:'RESTAURANT_PAGE',label:'Business Page',group:'Branding',icon:Paintbrush,description:'Design your business website, branch contacts and mobile welcome page.'},
 {id:'OPERATIONS',label:'Operations Hub',group:'Live operations',icon:LayoutDashboard,description:'Branch service controls, guest follow-up, handovers and acceptance.'},
 {id:'ONBOARDING',label:'Guided Menu Setup',group:'Launch setup',icon:UtensilsCrossed,description:'Load cuisine templates, review pricing and publish your shared guest menu.'},
 {id:'ACCEPTANCE',label:'Payment Acceptance',group:'Payments',icon:CreditCard,description:'Check configuration and record a real phone checkout against verified payment.'},
 {id:'RECONCILIATION',label:'Collection Reconciliation',group:'Insights',icon:ReceiptText,description:'Close the day using collection-date totals by collector, method and branch.'},
 {id:'CALENDAR',label:'Pickup Calendar',group:'Live operations',icon:CalendarClock,description:'Review booked pickup slots and complete guest handovers.'},
 {id:'RESERVATIONS',label:'Reservations',group:'Live operations',icon:CalendarCheck,description:'Confirm, decline or seat table requests sent from your restaurant website.'},
 {id:'PRINTPACK',label:'QR Print Packs',group:'Branding',icon:QrCode,description:'Download branded cards, print sheets and replacement inventory together.'},
  {id:"CRM",label:"Customers & Loyalty",group:"Menu & guests",icon:Users,description:"Manage shared customers, point balances, rewards and verified visit history."},
  {
    id: "OVERVIEW",
    label: "Overview",
    group: "Live operations",
    icon: LayoutDashboard,
    description:
      "Your branch at a glance. Keep orders moving and your guest experience ready.",
  },
  {
    id: "ORDERS",
    label: "QR Orders",
    group: "Live operations",
    icon: ReceiptText,
    description:
      "Follow every guest order, verify payments and manage kitchen progress.",
  },
  {
    id: "SERVICE",
    label: "Service Requests",
    group: "Live operations",
    icon: BellRing,
    description: "Respond to table requests and keep your floor team in sync.",
  },
  {
    id: "MENU",
    label: "Menu & Availability",
    group: "Menu & guests",
    icon: UtensilsCrossed,
    description:
      "Create dishes, organise categories and publish the menu your guests see.",
  },
  {
    id: "TABLES",
    label: "Tables & QR",
    group: "Launch setup",
    icon: QrCode,
    description: "Connect each table to the right menu and manage its QR code.",
  },
  {
    id: "DESIGN",
    label: "QR Design Studio",
    group: "Branding",
    icon: Palette,
    description: "Make table cards that feel at home in your restaurant.",
  },
  {
    id: "BRAND",
    label: "Customer Branding",
    group: "Branding",
    icon: Paintbrush,
    description:
      "Preview and personalise your customer menu before applying changes.",
  },
  {
    id: "PAYMENTS",
    label: "Payment Settings",
    group: "Payments",
    icon: CreditCard,
    description:
      "Control online checkout and counter payments with clear collection status.",
  },
  {
    id: "RULES",
    label: "Ordering Rules",
    group: "Service rules",
    icon: Clock3,
    description:
      "Set opening hours, preparation time and the ordering modes you offer.",
  },
  {
    id: "PICKUP",
    label: "Pickup Scheduling",
    group: "Service rules",
    icon: CalendarClock,
    description:
      "Offer takeaway slots that respect your branch hours and kitchen capacity.",
  },
  {
    id: "SETTINGS",
    label: "QR Settings",
    group: "Guest experience",
    icon: Settings2,
    description: "Manage core ordering settings and customer-facing messages.",
  },
  {
    id: "ADVANCED",
    label: "Advanced Features",
    group: "Service rules",
    icon: Sparkles,
    description:
      "Configure licensed languages, loyalty, promotions and operational tools.",
  },
  {
    id: "ANALYTICS",
    label: "Analytics",
    group: "Insights",
    icon: ChartNoAxesCombined,
    description:
      "Understand real orders, verified collections and your ordering funnel.",
  },
  {
    id: "PERFORMANCE",
    label: "Menu Performance",
    group: "Insights",
    icon: ChartColumnIncreasing,
    description:
      "See which dishes turn browsing into orders using actual sales data.",
  },
  {
    id: "SUPPORT",
    label: "Help & Support",
    group: "Help",
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
const GROUP_ORDER = ['Live operations', 'Launch setup', 'Guest experience', 'Menu & guests', 'Payments', 'Service rules', 'Branding', 'Insights', 'Help'];
const TASK_ORDER: QrTab[] = ['OVERVIEW','OPERATIONS','ORDERS','SERVICE','CALENDAR','RESERVATIONS','MENU','CRM','ONBOARDING','TABLES','PAYMENTS','ACCEPTANCE','RULES','BRAND','RESTAURANT_PAGE','DESIGN','PRINTPACK','ANALYTICS','RECONCILIATION','PERFORMANCE','PICKUP','SETTINGS','ADVANCED','SUPPORT'];
export const QR_NAVIGATION = [...QR_PAGES].sort((a,b) => {
  const rank = (group: string) => {const index = GROUP_ORDER.indexOf(group);return index < 0 ? GROUP_ORDER.length : index;};
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
export function currentQrTab(): QrTab {
  const value = new URLSearchParams(location.search).get("tab");
  return QR_PAGES.find((p) => p.id === value)?.id ?? "OVERVIEW";
}

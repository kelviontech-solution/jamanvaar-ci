import {
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
  ChartColumnIncreasing,
  Paintbrush,
  type LucideIcon,
} from "lucide-react";

export const QR_PAGES = [
  {
    id: "OVERVIEW",
    label: "Overview",
    group: "Today & orders",
    icon: LayoutDashboard,
    description:
      "Your branch at a glance. Keep orders moving and your guest experience ready.",
  },
  {
    id: "ORDERS",
    label: "QR Orders",
    group: "Today & orders",
    icon: ReceiptText,
    description:
      "Follow every guest order, verify payments and manage kitchen progress.",
  },
  {
    id: "SERVICE",
    label: "Service Requests",
    group: "Today & orders",
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
    group: "Tables & guest experience",
    icon: QrCode,
    description: "Connect each table to the right menu and manage its QR code.",
  },
  {
    id: "DESIGN",
    label: "QR Design Studio",
    group: "Tables & guest experience",
    icon: Palette,
    description: "Make table cards that feel at home in your restaurant.",
  },
  {
    id: "BRAND",
    label: "Customer Branding",
    group: "Tables & guest experience",
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
    label: "Advanced Features",
    group: "Settings",
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
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  description: string;
}>;
export type QrTab = (typeof QR_PAGES)[number]["id"];
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

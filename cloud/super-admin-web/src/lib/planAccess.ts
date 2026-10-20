import { APP_CODE_LABELS, ENTITLEMENT_LABELS, type AppCode, type Plan } from '../api/types';
const scope: Record<string, AppCode[]> = {
  posTerminal: ['POS'],
  offlineBilling: ['POS', 'KIOSK'],
  dineInTakeawayDeliveryToken: ['POS', 'KIOSK', 'CAPTAIN'],
  menuManagement: ['POS_ADMIN', 'KIOSK_ADMIN', 'QR_ORDERING'],
  foodCustomization: ['POS', 'KIOSK', 'CAPTAIN', 'QR_ORDERING'],
  discountsAndGst: ['POS', 'KIOSK'],
  multiPaymentTenders: ['POS'],
  tableManagement: ['POS_ADMIN', 'CAPTAIN', 'QR_ORDERING'],
  customerManagement: ['POS_ADMIN', 'POS'],
  kotKdsRouting: ['KDS', 'POS', 'KIOSK', 'CAPTAIN'],
  receiptPrinting: ['POS', 'KIOSK'],
  shiftAndCashDrawer: ['POS', 'POS_ADMIN'],
  salesAndGstReports: ['POS_ADMIN'],
  inventoryManagement: ['POS_ADMIN'],
  posAssistant: ['POS', 'POS_ADMIN', 'KIOSK_ADMIN', 'QR_ORDERING'],
  restaurantAdmin: ['POS_ADMIN'],
  captainApp: ['CAPTAIN'],
  advancedCaptainReports: ['CAPTAIN'],
  advancedServiceWorkflow: ['CAPTAIN'],
  qrTableOrdering: ['QR_ORDERING'],
  selfOrderKiosk: ['KIOSK', 'KIOSK_ADMIN']
};
const labels: Record<string, string> = {
  ...ENTITLEMENT_LABELS,
  qrRestaurantPage: 'Restaurant website & Page QR',
  qrBranding: 'QR customer branding',
  qrLoyalty: 'QR customers & loyalty',
  qrMenuAnalytics: 'Menu performance',
  qrMultilingual: 'Multiple languages',
  qrPromotions: 'QR promotions',
  qrKitchenCapacity: 'Kitchen capacity controls',
  qrReservations: 'Table reservations',
  qrLocations: 'Branch locations',
  qrFeedback: 'Guest feedback',
  qrGroupOrdering: 'Group ordering',
  qrSplitPayment: 'QR split payments',
  qrNotifications: 'Customer notifications',
  qrOrderHistory: 'QR order history',
  qrUsageLimits: 'QR usage limits',
  qrInventorySync: 'QR inventory integration',
  qrAccessibility: 'QR accessibility',
  qrMultiBranch: 'Multiple QR branches'
};
export function planFeatureSummary(plan: Plan, applications: readonly AppCode[] = plan.defaultApps ?? []) {
  const definitions = new Map(plan.featureDefinitions?.map((feature) => [feature.key, feature]));
  const included: Array<{ key: string; label: string }> = [],
    outsideSelection: Array<{ key: string; label: string }> = [];
  for (const [key, value] of Object.entries(plan.entitlements || {}))
    if (value === true) {
      const definition = definitions.get(key),
        required = key.startsWith('qr') ? (['QR_ORDERING'] as AppCode[]) : (scope[key] ?? (definition?.appCode ? [definition.appCode] : null));
      const label = key === 'posAssistant' && !applications.includes('POS')
        ? 'JAMAN AI assistant'
        : definition?.name || labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2');
      (required && !required.some((app) => applications.includes(app)) ? outsideSelection : included).push({ key, label });
    }
  return { included, outsideSelection };
}
export const productNames = (apps: readonly AppCode[]) => apps.map((app) => APP_CODE_LABELS[app]);
export function onboardingKeyTypes(apps: readonly AppCode[]) {
  return apps.filter((app) => app !== 'WHATSAPP_ORDERING' && !(app === 'QR_ORDERING' && (apps.includes('POS_ADMIN') || apps.includes('KIOSK_ADMIN'))));
}
/** Explicit editor action; does not silently rewrite existing subscriptions or plan records. */
export function qrOnlyFeatures(flags: Record<string, boolean>) {
  return Object.fromEntries(
    Object.entries(flags).map(([key, value]) => [key, key.startsWith('qr') || !scope[key] || scope[key].includes('QR_ORDERING') ? value : false])
  );
}

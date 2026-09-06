import { z } from 'zod';

/**
 * Mirrors packages/types/src/domain.ts's PlanEntitlements interface exactly —
 * the cloud Plan model reuses the same feature-flag vocabulary the local
 * runtime's license_entitlements.ts already established, rather than
 * inventing a second naming scheme for the same concept.
 */
export const ENTITLEMENT_KEYS = [
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
  'restaurantAdmin',
  'captainApp',
  'advancedCaptainReports',
  'advancedServiceWorkflow',
  'qrTableOrdering'
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const entitlementsSchema = z
  .object(Object.fromEntries(ENTITLEMENT_KEYS.map((k) => [k, z.boolean()])) as Record<EntitlementKey, z.ZodBoolean>)
  .partial()
  .transform((val) => {
    const full: Record<string, boolean> = {};
    for (const key of ENTITLEMENT_KEYS) full[key] = val[key] ?? false;
    return full;
  });

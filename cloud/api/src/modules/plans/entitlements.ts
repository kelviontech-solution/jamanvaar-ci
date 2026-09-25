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
  'qrTableOrdering',
  'selfOrderKiosk'
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

/**
 * Shape-only validation (any string key -> boolean). Key validity is checked against the live
 * Feature.legacyEntitlementKey column in PlansService.assertValidEntitlementKeys, since this
 * runs synchronously inside the shared ZodValidationPipe.
 */
export const entitlementsSchema = z.record(z.string(), z.boolean());

import type { Prisma } from '@prisma/client';

export type AdminApp = 'POS_ADMIN' | 'KIOSK_ADMIN' | 'QR_ORDERING';
const BOTH: readonly AdminApp[] = ['POS_ADMIN', 'KIOSK_ADMIN'];
const RESTAURANT_ENTITIES = new Set(['CUSTOMER', 'INVENTORY_ITEM', 'RECIPE', 'SUPPLIER', 'PAYMENT_TRANSACTION', 'SHIFT', 'CASH_MOVEMENT', 'RESERVATION']);

/** Existing resource permissions, independent of any browser-supplied product preference. */
export function requiredConsoleApps(pathname: string): readonly AdminApp[] {
  let path = pathname.split('?')[0];
  // Express decodes route parameters. Authorize the same resource, so encoding a letter
  // in INVENTORY_ITEM cannot bypass the restaurant-only check.
  try { path = decodeURIComponent(path); } catch { /* Express rejects malformed escapes */ }
  if (/^\/api\/v1\/restaurant\/qr(?:\/|$)/.test(path)) return ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'];
  if (/^\/api\/v1\/menu\/(?:preview|publish|branch-overrides)\/?$/.test(path)) return ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'];
  const entity = /^\/api\/v1\/entity-sync\/([^/]+)\/?$/.exec(path)?.[1];
  // This existing atomic record also carries shared receipt/brand/printer settings.
  // Both owner consoles must retain access; customer Kiosk still cannot write it.
  if(entity&&['MENU_ITEM','MENU_CATEGORY','MODIFIER_GROUP','TAX_GROUP'].includes(entity))return ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'];
  if (entity && RESTAURANT_ENTITIES.has(entity)) return ['POS_ADMIN'];
  if (/^\/api\/v1\/inventory(?:\/|$)/.test(path)) return ['POS_ADMIN'];
  if (/^\/api\/v1\/tenant\/payment-connection(?:\/|$)/.test(path)) return ['KIOSK_ADMIN'];
  return BOTH;
}

export async function enabledConsoleApps(tx: Prisma.TransactionClient, restaurantId: string): Promise<AdminApp[]> {
  const rows = await tx.applicationEntitlement.findMany({
    where: { appCode: { in: [...BOTH] }, enabled: true, subscription: {
      restaurantId, status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { gt: new Date() }
    } }, select: { appCode: true }
  });
  return [...new Set(rows.map(row => row.appCode as AdminApp))];
}

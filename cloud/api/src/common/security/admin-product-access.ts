import { branchLicense } from './branch-license';
import type { Prisma } from '@prisma/client';

export type AdminApp = 'POS_ADMIN' | 'KIOSK_ADMIN' | 'QR_ORDERING';
const BOTH: readonly AdminApp[] = ['POS_ADMIN', 'KIOSK_ADMIN'];
// A restaurant can be licensed for QR Ordering alone, with no POS_ADMIN/KIOSK_ADMIN entitlement
// at all (DeviceAuthGuard already treats QR_ORDERING as a peer of the other two for a POS_ADMIN-
// typed device) -- enabledConsoleApps must look for it too, or a solo-QR restaurant resolves to
// zero enabled apps here even though its own device authenticates fine.
const ALL_ADMIN_APPS: readonly AdminApp[] = ['POS_ADMIN', 'KIOSK_ADMIN', 'QR_ORDERING'];
const RESTAURANT_ENTITIES = new Set(['CUSTOMER', 'INVENTORY_ITEM', 'RECIPE', 'SUPPLIER', 'PAYMENT_TRANSACTION', 'SHIFT', 'CASH_MOVEMENT', 'RESERVATION']);

/** Existing resource permissions, independent of any browser-supplied product preference. */
export function requiredConsoleApps(pathname: string): readonly AdminApp[] {
  let path = pathname.split('?')[0];
  // Express decodes route parameters. Authorize the same resource, so encoding a letter
  // in INVENTORY_ITEM cannot bypass the restaurant-only check.
  try { path = decodeURIComponent(path); } catch { /* Express rejects malformed escapes */ }
  if (/^\/api\/v1\/tenant\/operations(?:\/|$)/.test(path)) return ALL_ADMIN_APPS;
  if (/^\/api\/v1\/restaurant\/qr(?:\/|$)/.test(path)) return ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'];
  if (/^\/api\/v1\/devices\/me\/(?:ai-config|ai-telemetry)\/?$/.test(path)) return ALL_ADMIN_APPS;
  // Q01: `version`/`draft-status` are the same read-only menu-readiness family as
  // preview/publish/branch-overrides below, but were missing from this list, so they fell through
  // to the `BOTH` fallback and excluded QR_ORDERING -- a QR-only restaurant (no POS_ADMIN/
  // KIOSK_ADMIN entitlement at all) got a 403 from Guided Menu Setup calling draft-status, despite
  // QR being fully active, because the menu these endpoints serve is shared by every console.
  if (/^\/api\/v1\/menu\/(?:version|draft-status|preview|publish|branch-overrides)\/?$/.test(path)) return ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'];
  const entity = /^\/api\/v1\/entity-sync\/([^/]+)\/?$/.exec(path)?.[1];
  // This existing atomic record also carries shared receipt/brand/printer settings.
  // Both owner consoles must retain access; customer Kiosk still cannot write it.
  if(entity&&['MENU_ITEM','MENU_CATEGORY','MODIFIER_GROUP','TAX_GROUP'].includes(entity))return ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'];
  if (entity && RESTAURANT_ENTITIES.has(entity)) return ['POS_ADMIN'];
  if (/^\/api\/v1\/inventory(?:\/|$)/.test(path)) return ['POS_ADMIN'];
  if (/^\/api\/v1\/tenant\/payment-connection(?:\/|$)/.test(path)) return ['KIOSK_ADMIN'];
  return BOTH;
}

export async function enabledConsoleApps(tx: Prisma.TransactionClient, restaurantId: string, branchId?: string | null): Promise<AdminApp[]> {
  const rows = await tx.applicationEntitlement.findMany({
    where: { appCode: { in: [...ALL_ADMIN_APPS] }, enabled: true, subscription: {
      restaurantId, status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { gt: new Date() }
    } }, select: { appCode: true }
  });
  const apps = [...new Set(rows.map(row => row.appCode as AdminApp))];
  const grants = await Promise.all(apps.map(async app => { const row = await branchLicense(tx, restaurantId, branchId, app); return !row || row.enabled && (!row.expiresAt || row.expiresAt > new Date()) ? app : null; }));
  return grants.filter((app): app is AdminApp => app !== null);
}

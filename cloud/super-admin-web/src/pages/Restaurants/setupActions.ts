import type { Area } from '../../auth/access';
import type { AppCode } from '../../api/types';

export type SetupTab = 'overview' | 'applications' | 'subscription' | 'branches' | 'branch-access' | 'devices' | 'owner' | 'menu' | 'handover';
export type SetupAction = { tab: SetupTab; label: string; area: Area; ownerTask?: string };
export type SetupProduct = { appCode: AppCode; purchased: boolean; enabled: boolean; configured: boolean; ready: boolean; reason: string; nextAction?: string };
export function productAction(product: SetupProduct): SetupAction {
  if (!product.purchased) return { tab: 'subscription', label: 'Review purchased plan', area: 'subscriptions' };
  if (!product.enabled) return { tab: 'branch-access', label: 'Review branch access', area: 'restaurants' };
  if (!product.configured) return ['POS', 'CAPTAIN', 'KIOSK', 'QR_ORDERING'].includes(product.appCode)
    ? { tab: 'menu', label: 'Publish branch menu', area: 'catalog' }
    : { tab: 'devices', label: 'Connect or check device', area: 'devices' };
  if (!product.ready) return ['POS', 'CAPTAIN', 'KIOSK', 'QR_ORDERING'].includes(product.appCode)
    ? { tab: 'handover', label: 'Run channel acceptance', area: 'restaurants', ownerTask: 'acceptance' }
    : { tab: 'devices', label: 'Check device connection', area: 'devices' };
  return { tab: 'handover', label: 'Review handover', area: 'restaurants' };
}
export function checkAction(check: { id: string; page?: string }): SetupAction {
  if (check.page === 'MENU') return { tab: 'menu', label: 'Open menu', area: 'catalog' };
  if (check.page === 'KIOSKS') return { tab: 'devices', label: 'Check kiosk delivery', area: 'devices' };
  if (check.page === 'TABLES' || check.page === 'FLOOR') return { tab: 'handover', label: 'Open table setup', area: 'restaurants', ownerTask: 'tables' };
  return { tab: 'handover', label: 'Open channel acceptance', area: 'restaurants', ownerTask: 'acceptance' };
}
export function ownerConsoleTask(base: string, branchId: string, task: string = 'acceptance') {
  const root = base.replace(/\/+$/, '').replace(/\/(restaurant-admin|pos-admin|kiosk-admin)$/, '');
  const url = new URL(root + '/restaurant-admin/' + (task === 'tables' ? 'tables' : 'operations'));
  url.searchParams.set('branchId', branchId);
  if (task !== 'tables') url.searchParams.set('opsTask', task === 'handover' ? 'handover' : 'acceptance');
  return url.toString();
}

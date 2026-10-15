import { KeyValueStore } from '@jamanvaar/database';
export interface CashierSettings {
  favoriteItemIds: string[];
  quickAmounts: number[];
  paymentMethods: string[];
  barcodeAliases: Record<string, string>;
}
export const DEFAULT_CASHIER_SETTINGS: CashierSettings = {
  favoriteItemIds: [],
  quickAmounts: [100, 200, 500, 1000, 2000, 5000],
  paymentMethods: ['CASH', 'UPI', 'CARD', 'WALLET', 'HOUSE_ACCOUNT'],
  barcodeAliases: {}
};
function cacheKey() {
  return `jamanvaar-cashier-speed:${KeyValueStore.get('jamanvaar_tenant_id') ?? ''}:${KeyValueStore.get('jamanvaar_bound_branch_id') ?? ''}`;
}
export function cashierSettings(): CashierSettings {
  try {
    const data = JSON.parse(KeyValueStore.get(cacheKey()) ?? 'null');
    return data && Array.isArray(data.quickAmounts) && Array.isArray(data.paymentMethods) ? { ...DEFAULT_CASHIER_SETTINGS, ...data } : DEFAULT_CASHIER_SETTINGS;
  } catch {
    return DEFAULT_CASHIER_SETTINGS;
  }
}
export function saveCashierSettings(data: CashierSettings) {
  KeyValueStore.set(cacheKey(), JSON.stringify(data));
  window.dispatchEvent(new Event('jamanvaar-cashier-settings'));
}

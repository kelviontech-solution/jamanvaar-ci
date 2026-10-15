import { ORDER_SOURCE_LABELS } from '@jamanvaar/utils';

export interface BillingEntry { from: string; to: string; source: string; collection: 'ALL' | 'PENDING'; search?: string; orderId?:string }
export type OwnerTaskPage = 'BILLING_SALES' | 'SYNC' | 'MENU' | 'INVENTORY' | 'SHIFTS';
export function dashboardDay(value: string, timezone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Dashboard dates could not be verified. Refresh before opening bills.');
  const parts = new Intl.DateTimeFormat('en', {timeZone: timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function billingEntry(scope: {from:string;to:string;timezone:string}, source: string, collection: BillingEntry['collection'], search?: string): BillingEntry {
  const localSource = source === 'QR' ? 'QR_TABLE' : source;
  if (localSource !== 'ALL' && !Object.hasOwn(ORDER_SOURCE_LABELS,localSource)) throw new Error('This source has a separate ordering workspace. Select All sources or POS, Captain, Kiosk or QR to open the billing ledger.');
  return {from:dashboardDay(scope.from,scope.timezone),to:dashboardDay(scope.to,scope.timezone),source:localSource,collection,search};
}

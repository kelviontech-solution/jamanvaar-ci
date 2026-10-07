import type { DiningTable, KOTRecord, MenuItem } from '@jamanvaar/types';

export function currentTableKots(table: Pick<DiningTable, 'currentOrderId'>, kots: KOTRecord[]): KOTRecord[] {
  return table.currentOrderId ? kots.filter(k => k.orderId === table.currentOrderId) : [];
}

export function matchesCaptainTicket(kot: KOTRecord, search: string): boolean {
  const query = search.trim().toLowerCase().replace(/^#/, '');
  if (query && search.trim().startsWith('#')) return kot.tokenNumber.toLowerCase().replace(/^#/, '') === query;
  return !query || [kot.tokenNumber, kot.orderNumber, kot.kotNumber, kot.tableNumber, kot.station, ...kot.items.map(i => i.name)]
    .some(value => value?.toLowerCase().includes(query));
}

export function matchesCaptainDiet(item: Pick<MenuItem, 'dietaryType'>, filter: string): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'VEG') return ['VEG', 'VEGAN', 'JAIN'].includes(item.dietaryType);
  return item.dietaryType === filter;
}

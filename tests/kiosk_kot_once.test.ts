import { describe, it, expect, beforeEach } from 'vitest';
import { db, KOTRepository } from '@jamanvaar/database';

const items = (stations: string[]) =>
  stations.map((kitchenStation, i) => ({
    id: `koti-line-${i}`,
    orderItemId: `line-${i}`,
    menuItemId: `m-${i}`,
    name: `Dish ${i}`,
    quantity: 1,
    modifiers: [],
    kitchenStation,
    status: 'PREPARING' as const
  }));

const kiosk = (orderId: string, stations: string[]) =>
  KOTRepository.generateKOT({
    orderId,
    orderNumber: 'MAIN-20261007-202',
    tokenNumber: 'K-116',
    orderType: 'DINE_IN',
    items: items(stations) as any,
    cashierName: 'Kiosk Self-Order',
    idBase: `kot-${orderId}-r1`,
    numberBase: 'KOT-MAIN-20261007-202'
  });

describe('a kiosk order gets its kitchen tickets once', () => {
  beforeEach(() => {
    db.kots = [];
  });

  it('one station makes one ticket, and a repeat makes none', () => {
    expect(kiosk('ord-1', ['Main Kitchen'])).toHaveLength(1);
    expect(kiosk('ord-1', ['Main Kitchen'])).toHaveLength(0);
    expect(KOTRepository.getKOTsForOrder('ord-1')).toHaveLength(1);
  });

  it('two stations make two tickets, and a repeat adds none', () => {
    expect(kiosk('ord-2', ['Main Kitchen', 'Starters'])).toHaveLength(2);
    expect(kiosk('ord-2', ['Main Kitchen', 'Starters'])).toHaveLength(0);
    expect(KOTRepository.getKOTsForOrder('ord-2')).toHaveLength(2);
  });

  it('the ticket is the same one every time: same id and number', () => {
    const [first] = kiosk('ord-3', ['Main Kitchen']);
    kiosk('ord-3', ['Main Kitchen']);
    const [only] = KOTRepository.getKOTsForOrder('ord-3');
    expect(only.id).toBe(first.id);
    expect(only.kotNumber).toBe(first.kotNumber);
  });
});

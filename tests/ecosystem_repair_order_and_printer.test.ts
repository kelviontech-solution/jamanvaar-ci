import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';
import type { MenuItem, ModifierGroup, PrinterDevice, SelectedModifier } from '@jamanvaar/types';
import { useCaptainStore } from '../apps/restaurant-system/captain/src/store/captainStore';

describe('ecosystem repair: Captain order validity', () => {
  const item = { id: 'repair-meal', name: 'Meal', price: 100, isAvailable: true, modifierGroupIds: ['bread'], minQuantity: 2, maxQuantity: 3 } as MenuItem;
  const groups = [
    {
      id: 'bread',
      name: 'Bread',
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
      options: [{ id: 'roti', name: 'Roti', priceDelta: 0, isAvailable: true }]
    }
  ] as ModifierGroup[];
  const choice: SelectedModifier = { groupId: 'bread', groupName: 'Bread', optionId: 'roti', optionName: 'Roti', priceDelta: 0 };
  let previousItems: MenuItem[];
  let previousGroups: ModifierGroup[];
  beforeEach(() => {
    previousItems = db.menuItems;
    previousGroups = db.modifierGroups;
    db.menuItems = [item];
    db.modifierGroups = groups;
    useCaptainStore.setState({ cartItems: [] });
  });
  afterEach(() => {
    db.menuItems = previousItems;
    db.modifierGroups = previousGroups;
    useCaptainStore.setState({ cartItems: [] });
  });

  it('rejects direct-store adds missing required choices, including callers bypassing the modal', () => {
    useCaptainStore.getState().addItemToCart(item, [], '', 'COURSE_1', 1);
    expect(useCaptainStore.getState().cartItems).toHaveLength(0);
  });
  it('rejects unknown or unavailable choices instead of accepting a matching group ID', () => {
    useCaptainStore.getState().addItemToCart(item, [{ ...choice, optionId: 'unknown' }]);
    expect(useCaptainStore.getState().cartItems).toHaveLength(0);
  });
  it('starts at the minimum, caps repeated additions and removes below-minimum lines', () => {
    useCaptainStore.getState().addItemToCart(item, [choice], '', 'COURSE_1', 1);
    expect(useCaptainStore.getState().cartItems[0].quantity).toBe(2);
    useCaptainStore.getState().addItemToCart(item, [choice], '', 'COURSE_1', 2);
    expect(useCaptainStore.getState().cartItems[0].quantity).toBe(3);
    const id = useCaptainStore.getState().cartItems[0].id;
    useCaptainStore.getState().updateCartQuantity(id, -2);
    expect(useCaptainStore.getState().cartItems).toHaveLength(0);
  });
});

describe('ecosystem repair: printer configuration is not hardware evidence', () => {
  let original: PrinterDevice[];
  beforeEach(() => {
    original = db.configuredPrinters;
  });
  afterEach(() => {
    db.configuredPrinters = original;
  });
  it.each(['OFFLINE', 'ERROR', 'UNKNOWN'] as const)('preserves the known %s state and last actual test', (status) => {
    db.configuredPrinters = [
      { id: 'repair-printer', name: 'Printer', paperSize: '80mm', interfaceType: 'NETWORK_LAN', status, lastTestAt: '2026-01-01T00:00:00Z' }
    ] as PrinterDevice[];
    expect(PrinterService.autoConfigureKioskPrinter().success).toBe(true);
    expect(db.configuredPrinters[0].status).toBe(status);
    expect(db.configuredPrinters[0].lastTestAt).toBe('2026-01-01T00:00:00Z');
  });
});

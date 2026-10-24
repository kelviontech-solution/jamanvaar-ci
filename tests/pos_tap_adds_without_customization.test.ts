import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

const pos = () => usePosStore.getState();
const sizeGroup = (withDefault: boolean) => ({
  id: 'grp-size', name: 'Size', minSelections: 1, maxSelections: 1, isRequired: true, sortOrder: 1, kind: 'SIZE' as const,
  options: [
    { id: 'opt-reg', name: 'Regular', priceDelta: 0, isDefault: withDefault, isAvailable: true, sortOrder: 1 },
    { id: 'opt-lrg', name: 'Large', priceDelta: 100, isDefault: false, isAvailable: true, sortOrder: 2 }
  ]
});
const pizza = (groupId: string, extra: object = {}) => ({ ...db.menuItems[0], id: 'tap-pizza', name: 'Tap Pizza', price: 249, isAvailable: true, modifierGroupIds: [groupId], ...extra });

beforeEach(() => {
  db.resetToDefaultSeed();
  pos().clearCart();
  pos().setCustomizingItem(null as never);
});

describe('tapping a dish card', () => {
  it('adds a dish whose required choice has a default straight to the order, with that default', () => {
    db.modifierGroups.push(sizeGroup(true) as never);
    const item = pizza('grp-size');
    db.menuItems.push(item as never);
    pos().quickAddOrCustomize(item as never);
    expect(pos().customizingItem).toBeFalsy();
    expect(pos().cart.items).toHaveLength(1);
    expect(pos().cart.items[0].selectedModifiers.map((m) => m.optionName)).toEqual(['Regular']);
    expect(pos().cart.items[0].quantity).toBe(1);
  });

  it('adds the minimum quantity when the dish has one', () => {
    db.modifierGroups.push(sizeGroup(true) as never);
    const item = pizza('grp-size', { minQuantity: 2 });
    db.menuItems.push(item as never);
    pos().quickAddOrCustomize(item as never);
    expect(pos().cart.items[0].quantity).toBe(2);
  });

  it('adds a dish with no options directly', () => {
    const item = { ...db.menuItems[0], id: 'plain', isAvailable: true, modifierGroupIds: [] };
    db.menuItems.push(item as never);
    pos().quickAddOrCustomize(item as never);
    expect(pos().cart.items).toHaveLength(1);
  });

  it('still opens customization when a required choice has no default, so no required choice is left unmade', () => {
    db.modifierGroups.push(sizeGroup(false) as never);
    const item = pizza('grp-size');
    db.menuItems.push(item as never);
    pos().quickAddOrCustomize(item as never);
    expect(pos().cart.items).toHaveLength(0);
    expect(pos().customizingItem?.id).toBe('tap-pizza');
  });

  it('opens customization from the edit control regardless of defaults', () => {
    db.modifierGroups.push(sizeGroup(true) as never);
    const item = pizza('grp-size');
    pos().setCustomizingItem(item as never);
    expect(pos().customizingItem?.id).toBe('tap-pizza');
  });
});

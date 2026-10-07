import { describe, it, expect } from 'vitest';
import { calculateCart, priceOrderLines, resolveDefaultTaxGroup } from '@jamanvaar/business';
import { SEED_TAX_GROUPS } from '@jamanvaar/database';
import type { CartItem, TaxGroup } from '@jamanvaar/types';

const gst18: TaxGroup = { id: 'gst18', name: 'GST 18%', cgstPercent: 9, sgstPercent: 9, igstPercent: 18, isInclusive: false, isActive: true };
const gst5Exclusive: TaxGroup = { id: 'gst5x', name: 'GST 5% exclusive', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: false, isActive: true };

const line = (price: number, taxGroupId?: string) => ({ item: { id: `m-${price}-${taxGroupId ?? 'none'}`, name: 'Dish', price, taxGroupId, categoryId: 'c', isAvailable: true }, quantity: 1, selectedModifiers: [] }) as unknown as CartItem;

describe('a dish with no tax group of its own is charged the default GST', () => {
  it('the seeded 5% group is the default, so a plain dish carries GST on the bill', () => {
    const cart = calculateCart({ items: [line(100)], taxGroups: SEED_TAX_GROUPS, roundToRupee: false });
    expect(cart.taxAmount).toBe(4.76); // 5% inclusive in ₹100: 100 × 5 / 105
    expect(cart.cgstAmount).toBe(2.38);
    expect(cart.sgstAmount).toBe(2.38);
    expect(cart.totalPayable).toBe(100);
  });

  it('an exclusive default is added on top of the dish price', () => {
    const cart = calculateCart({ items: [line(100)], taxGroups: [{ ...gst5Exclusive, isDefault: true }], roundToRupee: false });
    expect(cart.taxAmount).toBe(5);
    expect(cart.totalPayable).toBe(105);
  });

  it('a dish whose tax group was deleted or switched off falls back to the default', () => {
    const groups = [{ ...gst5Exclusive, isDefault: true }, gst18];
    expect(calculateCart({ items: [line(100, 'deleted-group')], taxGroups: groups, roundToRupee: false }).taxAmount).toBe(5);
    expect(calculateCart({ items: [line(100, 'gst18')], taxGroups: groups.map((g) => (g.id === 'gst18' ? { ...g, isActive: false } : g)), roundToRupee: false }).taxAmount).toBe(5);
  });

  it('a dish with its own group keeps that group rather than the default', () => {
    const cart = calculateCart({ items: [line(100, 'gst18')], taxGroups: [{ ...gst5Exclusive, isDefault: true }, gst18], roundToRupee: false });
    expect(cart.taxAmount).toBe(18);
  });

  it('with several groups and none flagged as default, dishes without a group stay untaxed', () => {
    const cart = calculateCart({ items: [line(100)], taxGroups: [gst5Exclusive, gst18], roundToRupee: false });
    expect(cart.taxAmount).toBe(0);
  });

  it('an inactive group is never the default', () => {
    expect(calculateCart({ items: [line(100)], taxGroups: [{ ...gst5Exclusive, isDefault: true, isActive: false }], roundToRupee: false }).taxAmount).toBe(0);
  });

  it('a single active group is the default even when it is not flagged', () => {
    expect(calculateCart({ items: [line(100)], taxGroups: [gst5Exclusive], roundToRupee: false }).taxAmount).toBe(5);
  });

  it('captain-style priced orders carry the default too, so they no longer show ₹0 GST', () => {
    const priced = priceOrderLines([{ menuItemId: 'x', unitPrice: 100, quantity: 2 }], { menuItems: [], taxGroups: SEED_TAX_GROUPS });
    expect(priced.taxAmount).toBe(9.52);
  });

  it('resolveDefaultTaxGroup picks the flagged active group, then the only active group, else nothing', () => {
    expect(resolveDefaultTaxGroup([gst18, { ...gst5Exclusive, isDefault: true }])?.id).toBe('gst5x');
    expect(resolveDefaultTaxGroup([gst18])?.id).toBe('gst18');
    expect(resolveDefaultTaxGroup([gst18, gst5Exclusive])).toBeUndefined();
  });
});

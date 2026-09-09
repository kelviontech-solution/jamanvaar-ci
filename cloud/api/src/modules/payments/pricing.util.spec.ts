import { describe, it, expect } from 'vitest';
import { priceCart, PriceValidationError, MenuSnapshotItemLookup } from './pricing.util';

function menuMap(items: MenuSnapshotItemLookup[]): Map<string, MenuSnapshotItemLookup> {
  return new Map(items.map((i) => [i.externalItemId, i]));
}

const thali: MenuSnapshotItemLookup = {
  externalItemId: 'thali-1',
  name: 'Gujarati Thali',
  basePrice: 25000, // 250.00
  taxRate: 500, // 5%
  isAvailable: true,
  modifierGroups: [
    {
      id: 'spice',
      name: 'Spice Level',
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'mild', name: 'Mild', priceDelta: 0 },
        { id: 'extra-hot', name: 'Extra Hot', priceDelta: 1000 }
      ]
    }
  ]
};

describe('pricing.util priceCart', () => {
  it('computes subtotal, tax, and total in paise for a simple item with no modifiers', () => {
    const item: MenuSnapshotItemLookup = { ...thali, modifierGroups: [] };
    const result = priceCart([{ externalItemId: 'thali-1', quantity: 2, selectedOptionIds: [] }], menuMap([item]));
    expect(result.subtotal).toBe(50000);
    expect(result.taxAmount).toBe(2500);
    expect(result.totalAmount).toBe(52500);
  });

  it('adds modifier price deltas into the unit price', () => {
    const result = priceCart(
      [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: ['extra-hot'] }],
      menuMap([thali])
    );
    expect(result.lines[0].unitPrice).toBe(26000);
    expect(result.subtotal).toBe(26000);
  });

  it('rejects an unknown menu item', () => {
    expect(() => priceCart([{ externalItemId: 'ghost', quantity: 1, selectedOptionIds: [] }], menuMap([thali]))).toThrow(
      PriceValidationError
    );
  });

  it('rejects an unavailable item', () => {
    const unavailable = { ...thali, isAvailable: false };
    expect(() =>
      priceCart([{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: ['mild'] }], menuMap([unavailable]))
    ).toThrow(PriceValidationError);
  });

  it('rejects a missing required modifier selection', () => {
    expect(() => priceCart([{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }], menuMap([thali]))).toThrow(
      /Spice Level/
    );
  });

  it('rejects an unknown modifier option id', () => {
    expect(() =>
      priceCart([{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: ['does-not-exist'] }], menuMap([thali]))
    ).toThrow(PriceValidationError);
  });

  it('rejects a quantity below 1', () => {
    expect(() =>
      priceCart([{ externalItemId: 'thali-1', quantity: 0, selectedOptionIds: ['mild'] }], menuMap([thali]))
    ).toThrow(PriceValidationError);
  });

  it('rejects an empty cart', () => {
    expect(() => priceCart([], menuMap([thali]))).toThrow(PriceValidationError);
  });
});

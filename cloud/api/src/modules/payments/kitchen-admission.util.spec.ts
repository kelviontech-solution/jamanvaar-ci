import { describe, it, expect } from 'vitest';
import { kitchenMatchesPaidBasket } from './kitchen-admission.util';

describe('paid basket kitchen admission', () => {
  const plain = { externalItemId: 'pizza', quantity: 2, unitPrice: 10000, modifiers: [] };
  it('allows quantity splits and repeated identical paid lines without false rejection', () => {
    const split = [{ menuItemId: 'pizza', quantity: 1, unitPrice: 10000 }, { menuItemId: 'pizza', quantity: 1, unitPrice: 10000 }];
    expect(kitchenMatchesPaidBasket([plain], split)).toBe(true);
    expect(kitchenMatchesPaidBasket([{ ...plain, quantity: 1 }, { ...plain, quantity: 1 }], split)).toBe(true);
  });
  it('keeps differently selected free options separate even when unit prices are equal', () => {
    const paid = ['mild', 'hot'].map(id => ({ ...plain, quantity: 1, modifiers: [{ id }] }));
    const delivered = ['mild', 'hot'].map(optionId => ({ menuItemId: 'pizza', quantity: 1, unitPrice: 10000, modifierDetails: [{ optionId }] }));
    expect(kitchenMatchesPaidBasket(paid, delivered)).toBe(true);
    expect(kitchenMatchesPaidBasket(paid, delivered.map(line => ({ ...line, modifierDetails: [{ optionId: 'mild' }] })))).toBe(false);
  });
  it('rejects missing, excess, wrong-priced and unidentified kitchen lines', () => {
    for (const line of [{ menuItemId: 'pizza', quantity: 1, unitPrice: 10000 }, { menuItemId: 'pizza', quantity: 3, unitPrice: 10000 }, { menuItemId: 'pizza', quantity: 2, unitPrice: 9999 }, { menuItemId: 'other', quantity: 2, unitPrice: 10000 }]) {
      expect(kitchenMatchesPaidBasket([plain], [line])).toBe(false);
    }
    expect(kitchenMatchesPaidBasket([], [])).toBe(false);
  });
});

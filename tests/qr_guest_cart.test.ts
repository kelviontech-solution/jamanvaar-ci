import { describe, it, expect } from 'vitest';
import { addLine, emptyCart, estimatedSubtotal, itemCount, lineKey, parseCart, removeLine, setQuantity, toOrderItems, unavailableLines, withAttempt, MAX_LINE_QUANTITY } from '../apps/qr-guest/src/cart';
import { summarizeStations } from '../packages/database/src/kitchen_routing';

const pizza = { itemId: 'pizza', name: 'Paneer Pizza', unitPrice: 284, quantity: 1, optionIds: ['cheese', 'large'], optionNames: ['Cheese', 'Large'] };

describe('the guest cart (browser-only, never authoritative)', () => {
  it('the same dish with the same options and note is one line; different options are separate lines', () => {
    let c = addLine(emptyCart(), pizza);
    c = addLine(c, { ...pizza, optionIds: ['large', 'cheese'] }); // same options, different order
    expect(c.lines).toHaveLength(1);
    expect(c.lines[0].quantity).toBe(2);
    c = addLine(c, { ...pizza, optionIds: ['large'] });
    c = addLine(c, { ...pizza, note: 'no onion' });
    expect(c.lines).toHaveLength(3);
    expect(lineKey('a', ['b', 'a'], ' Note ')).toBe(lineKey('a', ['a', 'b'], 'note'));
  });

  it('quantities are capped and non-positive quantities remove the line', () => {
    let c = addLine(emptyCart(), { ...pizza, quantity: 999 });
    expect(c.lines[0].quantity).toBe(MAX_LINE_QUANTITY);
    c = setQuantity(c, c.lines[0].key, 3);
    expect(itemCount(c)).toBe(3);
    c = setQuantity(c, c.lines[0].key, 0);
    expect(c.lines).toEqual([]);
  });

  it('shows a display subtotal but sends the server only identifiers and choices, never a price', () => {
    const c = addLine(addLine(emptyCart(), { ...pizza, quantity: 2 }), { itemId: 'coffee', name: 'Cold Coffee', unitPrice: 120, quantity: 1, optionIds: [], optionNames: [] });
    expect(estimatedSubtotal(c)).toBe(688);
    const sent = toOrderItems(c);
    expect(sent).toEqual([{ itemId: 'pizza', quantity: 2, optionIds: ['cheese', 'large'] }, { itemId: 'coffee', quantity: 1, optionIds: [] }]);
    expect(JSON.stringify(sent)).not.toMatch(/price|total|restaurant|branch|table/i);
  });

  it('a retry of the same cart reuses one attempt key (so it can only ever be one order); changing the cart starts a new attempt', () => {
    let n = 0;
    const key = () => `attempt-${++n}`;
    let c = withAttempt(addLine(emptyCart(), pizza), key);
    expect(c.attemptKey).toBe('attempt-1');
    expect(withAttempt(c, key).attemptKey).toBe('attempt-1'); // pressing "Place order" again after a timeout
    c = addLine(c, { ...pizza, quantity: 1 });
    expect(c.attemptKey).toBeNull();
    expect(withAttempt(c, key).attemptKey).toBe('attempt-2');
  });

  it('lines whose dish disappeared from the menu are reported', () => {
    const c = addLine(addLine(emptyCart(), pizza), { itemId: 'gone', name: 'Gone', unitPrice: 10, quantity: 1, optionIds: [], optionNames: [] });
    expect(unavailableLines(c, new Set(['pizza'])).map((l) => l.itemId)).toEqual(['gone']);
    expect(removeLine(c, c.lines[1].key).lines).toHaveLength(1);
  });

  it('a saved cart survives a refresh, and a damaged or hostile one is discarded instead of breaking the page', () => {
    const c = addLine(emptyCart(), pizza);
    expect(parseCart(JSON.stringify(c)).lines[0].itemId).toBe('pizza');
    expect(parseCart('not json').lines).toEqual([]);
    expect(parseCart(JSON.stringify({ lines: [{ itemId: 1 }, null, { itemId: 'x', quantity: -3 }] })).lines).toEqual([]);
    expect(parseCart(JSON.stringify({ lines: [{ itemId: 'x', quantity: 9999, optionIds: 'no' }] })).lines[0]).toMatchObject({ quantity: MAX_LINE_QUANTITY, optionIds: [] });
    expect(parseCart(null).lines).toEqual([]);
  });
});

describe('kitchen station summary reads the restaurant\'s own data', () => {
  it('groups by each dish\'s assigned station, whatever it is called, and falls back to the main kitchen', () => {
    const items = [
      { menuItemId: 'a', name: 'Anything', quantity: 2, kitchenStation: 'Wok' },
      { menuItemId: 'b', name: 'Something', quantity: 1, kitchenStation: 'Wok' },
      { menuItemId: 'c', name: 'Naan', quantity: 3 }
    ] as never;
    const s = summarizeStations(items);
    expect(s.stationBreakdown).toEqual({ Wok: 3, 'Main Kitchen': 3 });
    expect(s.summaryText).toBe('Wok: 3 items • Main Kitchen: 3 items');
  });
});

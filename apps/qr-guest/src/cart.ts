/**
 * The guest's cart. It lives in the browser only and holds NOTHING authoritative: prices shown while browsing are
 * for display, and the amount actually charged is always the server's (a quote before ordering, the confirmation after).
 * Pure functions, no browser APIs, so the rules are testable and identical wherever the page runs.
 */
export interface CartLine {
  /** Same dish with the same options and note is one line. */
  key: string;
  itemId: string;
  name: string;
  /** Display price of one unit including chosen options, in rupees. */
  unitPrice: number;
  quantity: number;
  optionIds: string[];
  optionNames: string[];
  note?: string;
}

export interface Cart {
  lines: CartLine[];
  /** Identifies one submission attempt. Sent with the order so a retry, refresh or double tap can never create a second order. */
  attemptKey: string | null;
}

export const MAX_LINE_QUANTITY = 50;
export const MAX_LINES = 50;

export const emptyCart = (): Cart => ({ lines: [], attemptKey: null });

export function lineKey(itemId: string, optionIds: string[], note?: string): string {
  return `${itemId}|${[...optionIds].sort().join(',')}|${(note ?? '').trim().toLowerCase()}`;
}

/** Any change to the cart makes the next submission a new attempt (a different order from a failed earlier one). */
const touched = (lines: CartLine[]): Cart => ({ lines, attemptKey: null });

export function addLine(cart: Cart, line: Omit<CartLine, 'key'>): Cart {
  const key = lineKey(line.itemId, line.optionIds, line.note);
  const existing = cart.lines.find((l) => l.key === key);
  if (existing) {
    return touched(cart.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + line.quantity) } : l)));
  }
  if (cart.lines.length >= MAX_LINES) return cart;
  return touched([...cart.lines, { ...line, key, quantity: Math.min(MAX_LINE_QUANTITY, Math.max(1, line.quantity)) }]);
}

export function setQuantity(cart: Cart, key: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, key);
  return touched(cart.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)) } : l)));
}

export function removeLine(cart: Cart, key: string): Cart {
  return touched(cart.lines.filter((l) => l.key !== key));
}

export const itemCount = (cart: Cart): number => cart.lines.reduce((n, l) => n + l.quantity, 0);

/** Display-only estimate before the server prices the cart. Rounded to paise so it never shows fractions of a paisa. */
export const estimatedSubtotal = (cart: Cart): number => Math.round(cart.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100;

/** The attempt key for the cart as it is right now: created once, reused for every retry of the same cart. */
export function withAttempt(cart: Cart, newKey: () => string): Cart {
  return cart.attemptKey ? cart : { ...cart, attemptKey: newKey() };
}

/** What the server is sent: identifiers and choices only. Never a price, total, restaurant, branch or table. */
export function toOrderItems(cart: Cart): Array<{ itemId: string; quantity: number; optionIds: string[]; note?: string }> {
  return cart.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, ...(l.note ? { note: l.note } : {}) }));
}

/** After the menu changes, lines whose dish is gone or sold out are reported so the guest can remove them. */
export function unavailableLines(cart: Cart, availableItemIds: Set<string>): CartLine[] {
  return cart.lines.filter((l) => !availableItemIds.has(l.itemId));
}

export function parseCart(raw: string | null): Cart {
  if (!raw) return emptyCart();
  try {
    const v = JSON.parse(raw) as Partial<Cart>;
    if (!v || !Array.isArray(v.lines)) return emptyCart();
    const lines = v.lines
      .filter((l): l is CartLine => !!l && typeof l.itemId === 'string' && typeof l.quantity === 'number' && l.quantity >= 1)
      .map((l) => ({ ...l, quantity: Math.min(MAX_LINE_QUANTITY, Math.floor(l.quantity)), optionIds: Array.isArray(l.optionIds) ? l.optionIds : [], optionNames: Array.isArray(l.optionNames) ? l.optionNames : [] }));
    return { lines, attemptKey: typeof v.attemptKey === 'string' ? v.attemptKey : null };
  } catch {
    return emptyCart();
  }
}

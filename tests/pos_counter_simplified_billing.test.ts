import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pos = (file: string) => readFileSync(join(__dirname, '../apps/restaurant-system/pos/src', file), 'utf8');

describe('POS counter: simplified order panel', () => {
  const cart = pos('components/cart/PosCart.tsx');
  it('shows only dish and quantity per line, never per-item prices, SKU or unit price', () => {
    expect(cart).not.toMatch(/ci\.itemTotal/);
    expect(cart).not.toMatch(/ci\.unitPrice/);
    expect(cart).not.toMatch(/ci\.item\.sku/);
    expect(cart).not.toMatch(/@ ₹/);
  });
  it('shows one total only, in the PAY button, with no subtotal, GST or round-off rows', () => {
    expect(cart).toContain('PAY ₹{cart.totalPayable}');
    expect(cart).not.toContain('Total Payable');
    expect(cart).not.toMatch(/Subtotal/);
    expect(cart).not.toMatch(/cart\.taxAmount/);
    expect(cart).not.toMatch(/roundOffAmount/);
  });
  it('drops the suggestion strip but keeps every action and its handler', () => {
    expect(cart).not.toContain('Frequently Paired');
    for (const label of ['Hold Order', 'Clear All', 'Discount', 'Instant Bill', 'Attach Customer', 'Chef Notes', '↻ Repeat Last Order']) {
      expect(cart).toContain(label);
    }
    for (const call of ['holdCurrentOrder()', 'clearCart()', 'executeInstantBill()', 'handleSendKot', 'setIsPaymentOpen(true)', 'setIsDiscountModalOpen(true)', 'handleCancelSentItem']) {
      expect(cart).toContain(call);
    }
  });
  it('keeps the kitchen-sent protection: sent dishes still go through the cancel-reason flow', () => {
    expect(cart).toMatch(/if \(atSentFloor\) \{ void handleCancelSentItem/);
    expect(cart).toMatch(/if \(isSent\) \{ void handleCancelSentItem/);
  });
});

describe('POS counter: dish grid and toolbar', () => {
  it('adds a dish with one tap and leaves quantity to the order panel', () => {
    const card = pos('components/menu/PosProductCard.tsx');
    expect(card).toContain('quickAddOrCustomize(item)');
    expect(card).not.toContain('updateItemQuantity');
    expect(card).not.toContain('{item.sku}');
    expect(card).toContain('Customize ${item.name}');
  });
  it('removes the duplicate quick-add chip strip and keeps one food-type control', () => {
    const catalog = pos('components/menu/PosCatalog.tsx');
    expect(catalog).not.toContain('QUICK:');
    expect(catalog).not.toContain('popularQuickAddItems');
    expect(catalog).toContain('aria-label="Food type"');
  });
  it('shows the order panel beside the dishes from 1024px', () => {
    expect(pos('index.css')).toMatch(/@media \(min-width: 1024px\) \{\s*\.pos-mobile-cart-bar \{ display: none; \}/);
  });
});

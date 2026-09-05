import { describe, expect, it } from 'vitest';
import { AdminChatbotEngine, CustomerChatbotEngine } from '../packages/business/src';

describe('CustomerChatbotEngine', () => {
  it('should answer vegetarian inquiries with real menu items', () => {
    const res = CustomerChatbotEngine.processQuery('What vegetarian food do you have?');
    expect(res.sender).toBe('ASSISTANT');
    expect(res.actionItems).toBeDefined();
    expect(res.actionItems!.length).toBeGreaterThan(0);
    res.actionItems!.forEach((item) => {
      expect(item.dietaryType).toBe('VEG');
    });
  });

  it('should provide active promotional coupons when asked for offers', () => {
    const res = CustomerChatbotEngine.processQuery('Show today\'s offers and coupons');
    expect(res.text).toContain('promo coupons');
  });

  it('should explain payment options offline', () => {
    const res = CustomerChatbotEngine.processQuery('How do I pay with UPI or Card?');
    expect(res.text).toContain('UPI Dynamic QR');
  });
});

describe('AdminChatbotEngine', () => {
  it('should calculate today\'s sales from actual orders', () => {
    const res = AdminChatbotEngine.processQuery('How much did I sell today?');
    expect(res.sender).toBe('ASSISTANT');
    expect(res.text).toContain('Today\'s Revenue Overview');
  });

  it('should summarize top best-selling items', () => {
    const res = AdminChatbotEngine.processQuery('Show top 10 items');
    expect(res.text).toContain('Top Best-Selling Dishes');
  });
});

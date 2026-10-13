import { describe, expect, it } from 'vitest';
import { guestErrorMessage } from '../apps/qr-guest/src/guestErrors';

describe('customer-safe QR errors', () => {
  it('replaces gateway payload diagnostics with an actionable payment recovery message', () => {
    const message = guestErrorMessage('Razorpay payment link creation failed: incorrect JSON object received - faulty key: customer', 'PAYMENT_FAILED');
    expect(message).toContain('try again');
    expect(message).toContain('pay at counter');
    expect(message).not.toMatch(/JSON|faulty key|customer$/);
  });
  it('preserves actionable menu and restaurant rules', () => {
    expect(guestErrorMessage('This dish is sold out. Please choose another dish.')).toBe('This dish is sold out. Please choose another dish.');
    expect(guestErrorMessage('Minimum order is ₹200.')).toBe('Minimum order is ₹200.');
  });
});

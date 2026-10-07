import { describe, it, expect } from 'vitest';
import { isOrderStillSyncingMessage } from '@jamanvaar/api';

describe('a fresh kiosk order emailing its bill retries only while it is still syncing', () => {
  it('recognizes the server\'s own "not yet synced" wording', () => {
    expect(isOrderStillSyncingMessage('Order not found — if you just placed this order, wait a few seconds for it to sync and try again')).toBe(true);
  });

  it('does not retry a real failure: bad email, no payment, or email not configured', () => {
    expect(isOrderStillSyncingMessage('Please enter a valid email address')).toBe(false);
    expect(isOrderStillSyncingMessage('Cannot email an invoice for an order with no successful payment (status: PENDING)')).toBe(false);
    expect(isOrderStillSyncingMessage('Email is not configured on this server (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD)')).toBe(false);
    expect(isOrderStillSyncingMessage('Email receipts are disabled by this restaurant')).toBe(false);
  });
});

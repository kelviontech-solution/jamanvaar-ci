import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(32)
};

describe('env.validation: Razorpay and payment vars', () => {
  it('boots successfully with none of the Razorpay/payment vars set', () => {
    const result = validateEnv(baseEnv);
    expect(result.RAZORPAY_KEY_ID).toBeUndefined();
    expect(result.PAYMENT_CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
  });

  it('accepts a full Razorpay configuration', () => {
    const result = validateEnv({
      ...baseEnv,
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'test-secret',
      RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret',
      PAYMENT_CREDENTIAL_ENCRYPTION_KEY: 'base64-key-value'
    });
    expect(result.RAZORPAY_KEY_ID).toBe('rzp_test_key');
    expect(result.RAZORPAY_WEBHOOK_SECRET).toBe('test-webhook-secret');
  });
});

import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(32)
};

describe('env.validation — Cashfree/payment vars', () => {
  it('boots successfully with none of the Cashfree/payment vars set', () => {
    const result = validateEnv(baseEnv);
    expect(result.CASHFREE_ENVIRONMENT).toBe('sandbox');
    expect(result.CASHFREE_API_VERSION).toBe('2025-01-01');
    expect(result.CASHFREE_CLIENT_ID).toBeUndefined();
    expect(result.PAYMENT_CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
  });

  it('accepts a full Cashfree configuration', () => {
    const result = validateEnv({
      ...baseEnv,
      CASHFREE_CLIENT_ID: 'test-client-id',
      CASHFREE_CLIENT_SECRET: 'test-secret',
      CASHFREE_ENVIRONMENT: 'production',
      CASHFREE_WEBHOOK_SECRET: 'test-webhook-secret',
      PAYMENT_CREDENTIAL_ENCRYPTION_KEY: 'base64-key-value'
    });
    expect(result.CASHFREE_ENVIRONMENT).toBe('production');
    expect(result.CASHFREE_CLIENT_ID).toBe('test-client-id');
  });

  it('rejects an invalid CASHFREE_ENVIRONMENT value', () => {
    expect(() => validateEnv({ ...baseEnv, CASHFREE_ENVIRONMENT: 'staging' })).toThrow();
  });
});

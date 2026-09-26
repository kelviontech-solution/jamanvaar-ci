import { describe, it, expect } from 'vitest';
import { isStrongSecret, productionConfigProblems, validateEnv } from '../src/config/env.validation';
import { bodyLimitFor, DEFAULT_BODY_LIMIT } from '../src/common/body-limits';
import { redactUrl } from '../src/common/request-context';
import { mayRead, mayWrite, staffVisibleTo } from '../src/modules/entity-sync/entity-authority';

const goodSecret = 'q8Zr3Kx7Lm2Vw9Ty4Bn6Hc1Jd5Fg0Sa8Pe';

describe('production configuration gate (F-04)', () => {
  it('rejects placeholders, short and repeated secrets', () => {
    expect(isStrongSecret('changeme-changeme-changeme-changeme')).toBe(false);
    expect(isStrongSecret('a'.repeat(40))).toBe(false);
    expect(isStrongSecret('short')).toBe(false);
    expect(isStrongSecret(goodSecret)).toBe(true);
  });
  it('production refuses to boot on a weak secret or localhost CORS, and accepts a sound config', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_ACCESS_SECRET: goodSecret, CORS_ALLOWED_ORIGINS: 'https://admin.example.com' };
    expect(() => validateEnv(base)).not.toThrow();
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'a'.repeat(40) })).toThrow(/Unsafe production configuration/);
    expect(() => validateEnv({ ...base, CORS_ALLOWED_ORIGINS: 'http://localhost:5173' })).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() => validateEnv({ ...base, CORS_ALLOWED_ORIGINS: undefined })).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(productionConfigProblems({ ...base, BACKUP_ENCRYPTION_KEY_B64: 'AAAA' })).toHaveLength(1);
  });
  it('development is not gated', () => {
    expect(() => validateEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgres://x', JWT_ACCESS_SECRET: 'x'.repeat(32) })).not.toThrow();
  });
});

describe('per-route body limits (F-13)', () => {
  it('anonymous callers never get a large limit', () => {
    expect(bodyLimitFor('/api/v1/entity-sync/MENU_ITEM', false)).toBe(DEFAULT_BODY_LIMIT);
    expect(bodyLimitFor('/api/v1/entity-sync/MENU_ITEM', true)).toBeGreaterThan(DEFAULT_BODY_LIMIT);
  });
  it('public QR routes are tiny even with a header', () => {
    expect(bodyLimitFor('/api/v1/public/qr/abc/orders', true)).toBeLessThanOrEqual(32 * 1024);
  });
});

describe('log redaction (F-20)', () => {
  it('hides legacy QR tokens and order references', () => {
    expect(redactUrl('/api/v1/qr-guest/menu?token=SECRET123')).not.toContain('SECRET123');
    expect(redactUrl('/api/v1/qr-guest/orders/ORDER-REF-1/status')).not.toContain('ORDER-REF-1');
  });
});

describe('entity authority (F-01/F-02)', () => {
  it('a kiosk or kitchen screen cannot write prices, staff, customers or cash', () => {
    for (const t of ['KIOSK', 'KDS', 'CAPTAIN'] as const) {
      for (const e of ['MENU_ITEM', 'TAX_GROUP', 'STAFF_USER', 'CUSTOMER', 'CASH_MOVEMENT', 'PAYMENT_TRANSACTION'] as const) expect(mayWrite(e, t)).toBe(false);
    }
  });
  it('a public kiosk cannot read customers, shifts or payments', () => {
    for (const e of ['CUSTOMER', 'SHIFT', 'CASH_MOVEMENT', 'PAYMENT_TRANSACTION'] as const) expect(mayRead(e, 'KIOSK')).toBe(false);
  });
  it('a kiosk only sees staff it may sign in, and never a chef or captain record on the wrong terminal', () => {
    expect(staffVisibleTo('KDS', { roleId: 'role-cashier' })).toBe(false);
    expect(staffVisibleTo('KDS', { roleId: 'role-chef' })).toBe(true);
    expect(staffVisibleTo('POS_ADMIN', { roleId: 'role-cashier' })).toBe(true);
  });
});

describe('ticket attachments fit the request limit (base64 of a 2 MB file)', () => {
  it('signed-in callers get room for both ticket routes, anonymous callers do not', () => {
    for (const p of ['/api/v1/tenant/support-tickets/abc/attachments', '/api/v1/support-tickets/abc/attachments']) {
      expect(bodyLimitFor(p, true)).toBeGreaterThanOrEqual(2.8 * 1024 * 1024);
      expect(bodyLimitFor(p, false)).toBe(DEFAULT_BODY_LIMIT);
    }
  });
});

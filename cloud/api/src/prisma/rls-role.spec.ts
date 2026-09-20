import { describe, it, expect } from 'vitest';
import { assessRlsRole } from './rls-role';

/**
 * BUG-075: the API connected as the `postgres` superuser, and Postgres superusers ignore
 * row-level security even when it is FORCED, so every tenant-isolation policy was decorative.
 */
describe('assessRlsRole', () => {
  const app = { name: 'jamanvaar_app', superuser: false, bypassRls: false };

  it('accepts an ordinary role in every environment', () => {
    for (const env of ['development', 'test', 'production'] as const) {
      expect(assessRlsRole(app, env)).toEqual({ enforced: true });
    }
  });

  it('refuses to run in production as a superuser', () => {
    const r = assessRlsRole({ name: 'postgres', superuser: true, bypassRls: true }, 'production');
    expect(r).toMatchObject({ enforced: false, fatal: true });
    expect((r as { message: string }).message).toMatch(/postgres/);
    expect((r as { message: string }).message).toMatch(/superuser/i);
  });

  it('refuses to run in production as a role with BYPASSRLS, even if it is not a superuser', () => {
    expect(assessRlsRole({ name: 'app', superuser: false, bypassRls: true }, 'production')).toMatchObject({ enforced: false, fatal: true });
  });

  it('only warns outside production, so local development keeps working', () => {
    const r = assessRlsRole({ name: 'postgres', superuser: true, bypassRls: true }, 'development');
    expect(r).toMatchObject({ enforced: false, fatal: false });
    expect((r as { message: string }).message).toMatch(/not enforced/i);
  });
});

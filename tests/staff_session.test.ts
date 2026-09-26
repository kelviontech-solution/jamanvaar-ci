import { describe, it, expect, beforeEach } from 'vitest';
import { StaffSession } from '@jamanvaar/sync';

const store: Record<string, string> = {};
(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; }
};
const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 201 })) as unknown as (p: string, i?: RequestInit) => Promise<Response>;
const denied = (async () => new Response('{}', { status: 403 })) as unknown as (p: string, i?: RequestInit) => Promise<Response>;
const offline = (async () => { throw new Error('offline'); }) as unknown as (p: string, i?: RequestInit) => Promise<Response>;
const future = () => new Date(Date.now() + 3600_000).toISOString();

describe('per-staff sign-in proof held by the terminal', () => {
  beforeEach(() => StaffSession.clear());

  it('keeps the signed session after the server accepts the PIN, and drops it on sign-out', async () => {
    expect(await StaffSession.signIn('1234', ok({ sessionToken: 'tok', expiresAt: future(), staffId: 'u1', staffName: 'A', roleId: 'role-cashier' }))).toBe(true);
    expect(StaffSession.sessionToken()).toBe('tok');
    StaffSession.clear();
    expect(StaffSession.sessionToken()).toBeUndefined();
  });

  it('holds no proof when the server refuses or is unreachable, and never throws', async () => {
    expect(await StaffSession.signIn('1234', denied)).toBe(false);
    expect(await StaffSession.signIn('1234', offline)).toBe(false);
    expect(StaffSession.sessionToken()).toBeUndefined();
  });

  it('a new sign-in replaces the previous person, and an expired proof is not used', async () => {
    await StaffSession.signIn('1', ok({ sessionToken: 'first', expiresAt: future(), staffId: 'u1', staffName: 'A', roleId: 'r' }));
    await StaffSession.signIn('2', ok({ sessionToken: 'second', expiresAt: future(), staffId: 'u2', staffName: 'B', roleId: 'r' }));
    expect(StaffSession.sessionToken()).toBe('second');
    await StaffSession.signIn('3', ok({ sessionToken: 'old', expiresAt: new Date(Date.now() - 1000).toISOString(), staffId: 'u3', staffName: 'C', roleId: 'r' }));
    expect(StaffSession.sessionToken()).toBeUndefined();
  });

  it('a manager approval is kept separately from the session', async () => {
    await StaffSession.signIn('1', ok({ sessionToken: 'sess', expiresAt: future(), staffId: 'u1', staffName: 'A', roleId: 'r' }));
    expect(await StaffSession.approve('9', ok({ approvalToken: 'appr', approvalExpiresAt: future(), staffName: 'M' }))).toBe(true);
    expect(StaffSession.approvalToken()).toBe('appr');
    expect(StaffSession.sessionToken()).toBe('sess');
  });
});

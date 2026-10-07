import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, KeyValueStore } from '@jamanvaar/database';

/**
 * Local Core is an optional server on the restaurant's own network. The public website cannot reach it, so the
 * sign-in screens must not health-check it there (that is what showed "Unreachable" on every app). Where it is
 * set up, the check still runs.
 */
describe('Local Core health check only where Local Core is set up', () => {
  beforeEach(() => {
    KeyValueStore.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the public HTTPS site has no Local Core health check', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'system.kelviontech.in' } });
    expect(db.localCoreHealthUrl()).toBeUndefined();
  });

  it('a local development page keeps the Local Core health check', () => {
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'localhost' } });
    expect(db.localCoreHealthUrl()).toMatch(/\/api\/health$/);
  });
});

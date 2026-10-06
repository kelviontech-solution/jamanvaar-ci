import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { BranchCore } from '../packages/branch-core/src/core';
import { BranchStore } from '../packages/branch-core/src/store';
import { createServer } from '../packages/branch-core/src/server';
import { CloudUplink } from '../packages/branch-core/src/uplink';

const roster = (enabledApps = ['KIOSK', 'KIOSK_ADMIN']) => ({
  restaurant: { id: 'rest-A', name: 'Test', status: 'ACTIVE' }, branches: [],
  subscription: { active: true, expiresAt: null, enabledApps },
  devices: [['admin', 'POS_ADMIN'], ['kiosk', 'KIOSK'], ['pos', 'POS']].map(([id, type]) => ({
    id, type, name: id, branchId: 'br-A', status: 'ACTIVE', isLocked: false,
    tokenHash: createHash('sha256').update(`token-${id}`).digest('hex'), appEnabled: true
  }))
});
const setup = () => {
  const store = new BranchStore(':memory:');
  const core = new BranchCore(store, { restaurantId: 'rest-A', branchId: 'br-A', branchCode: 'A' });
  core.applyRoster(roster());
  return { core, store };
};

describe('admin product permissions on Branch Core', () => {
  it('authenticates the shared physical admin on a kiosk-only plan and limits console resources', () => {
    const { core, store } = setup();
    try {
      const admin = core.authenticate('token-admin');
      expect(() => core.assertConsoleResource(admin, '/api/v1/entity-sync/MENU_ITEM')).not.toThrow();
      expect(() => core.assertConsoleResource(admin, '/api/v1/entity-sync/KIOSK_CONFIGURATION')).not.toThrow();
      for (const path of ['/api/v1/entity-sync/CUSTOMER', '/api/v1/entity-sync/%49NVENTORY_ITEM', '/api/v1/inventory/movements'])
        expect(() => core.assertConsoleResource(admin, path)).toThrow(/not enabled/);
      core.applyRoster(roster(['KIOSK_ADMIN', 'POS_ADMIN']));
      expect(() => core.assertConsoleResource(admin, '/api/v1/inventory/movements')).not.toThrow();
    } finally { store.close(); }
  });

  it('enforces resource permissions over the real local HTTP boundary', async () => {
    const { core, store } = setup();
    const server = createServer(core);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const get = (path: string) => fetch(base + path, { headers: { Authorization: 'Bearer token-admin' } });
    try {
      expect((await get('/api/v1/entity-sync/MENU_ITEM')).status).toBe(200);
      const denied = await get('/api/v1/entity-sync/CUSTOMER');
      expect(denied.status).toBe(403);
      expect((await denied.json()).code).toBe('PRODUCT_ACCESS_DENIED');
      expect((await get('/api/v1/inventory/balances')).status).toBe(403);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      store.close();
    }
  });

  it('limits kiosk-only fleet and commands despite the shared POS_ADMIN device type', () => {
    const { core, store } = setup();
    try {
      const admin = core.authenticate('token-admin');
      expect(core.fleet(admin).devices.map(d => d.id)).toEqual(['kiosk']);
      expect(() => core.issueCommand(admin, 'pos', { commandType: 'LOCK' })).toThrow(/only manage kiosks/);
      expect(core.issueCommand(admin, 'kiosk', { commandType: 'FORCE_LOGOUT' }).status).toBe('PENDING');
      core.applyRoster(roster(['POS_ADMIN', 'POS']));
      expect(() => core.issueCommand(admin, 'kiosk', { commandType: 'LOCK' })).toThrow(/not enabled/);
    } finally { store.close(); }
  });

  it('skips unlicensed cloud resources and resumes them when the roster enables Restaurant Admin', async () => {
    const { core, store } = setup();
    let apps = ['KIOSK', 'KIOSK_ADMIN'];
    const paths: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      paths.push(path);
      if (!apps.includes('POS_ADMIN') && /inventory\/|entity-sync\/(?:CUSTOMER|SHIFT|CASH_MOVEMENT|RESERVATION)\?/.test(path))
        return new Response('{}', { status: 403 });
      return new Response(JSON.stringify(path.endsWith('/roster') ? roster(apps) : {
        entities: [], orders: [], movements: [], latestSeq: 0, hasMore: false
      }), { status: 200 });
    });
    try {
      const uplink = new CloudUplink(core, { cloudBase: 'https://qa.invalid', deviceToken: 'token-admin', fetchImpl });
      expect((await uplink.syncOnce()).error).toBeUndefined();
      expect(paths.some(p => p.includes('/entity-sync/KIOSK_CONFIGURATION?'))).toBe(true);
      expect(paths.some(p => p.includes('/entity-sync/MENU_ITEM?'))).toBe(true);
      expect(paths.some(p => p.includes('/inventory/') || p.includes('/entity-sync/CUSTOMER?'))).toBe(false);
      paths.length = 0;
      apps = ['KIOSK', 'KIOSK_ADMIN', 'POS_ADMIN'];
      expect((await uplink.syncOnce()).error).toBeUndefined();
      expect(paths.some(p => p.includes('/inventory/movements'))).toBe(true);
      expect(paths.some(p => p.includes('/entity-sync/CUSTOMER?'))).toBe(true);
    } finally { store.close(); }
  });
});

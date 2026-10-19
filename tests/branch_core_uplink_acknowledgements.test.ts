import { describe, expect, it } from 'vitest';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';
import { CloudUplink } from '../packages/branch-core/src/uplink';
import { createHash } from 'node:crypto';

const roster = {
  restaurant: { id: 'restaurant', name: 'Test', status: 'ACTIVE' }, branches: [], devices: [{ id: 'core-admin', name: 'Core admin', isLocked: false, type: 'POS_ADMIN', status: 'ACTIVE', branchId: 'branch', tokenHash: createHash('sha256').update('fixture').digest('hex'), appEnabled: true }],
  subscription: { active: true, expiresAt: null, enabledApps: ['POS_ADMIN', 'KIOSK_ADMIN'] }
};
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('Branch Core cloud acknowledgement identity', () => {
  it('refuses credential transport over non-loopback HTTP and URLs containing embedded credentials', () => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'branch', branchCode: 'B' });
    try {
      for (const cloudBase of ['http://restaurant.example', 'http://192.168.1.20', 'https://user:secret@restaurant.example', 'https://restaurant.example?token=secret']) expect(() => new CloudUplink(core, { cloudBase, deviceToken: 'fixture' })).toThrow('require HTTPS');
      for (const cloudBase of ['https://restaurant.example/', 'http://127.0.0.1:3001', 'http://localhost:3001', 'http://[::1]:3001']) expect(() => new CloudUplink(core, { cloudBase, deviceToken: 'fixture' })).not.toThrow();
    } finally { store.close(); }
  });
  it.each(['order', 'movement'] as const)('matches reordered %s results by the original reference and retains an omitted result', async kind => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'branch', branchCode: 'B' });
    const idField = kind === 'order' ? 'externalOrderId' : 'movementId';
    for (const id of ['first', 'second', 'missing']) store.run('INSERT INTO cloud_outbox (kind, dedupe_key, payload, created_at) VALUES (?, ?, ?, ?)', kind, id, JSON.stringify({ [idField]: id }), Date.now());
    const fetchImpl: typeof fetch = async (input, init) => {
      const path = String(input);
      if (path.endsWith('/roster')) return response(roster);
      if (init?.method === 'POST' && path.endsWith(kind === 'order' ? '/orders/sync' : '/inventory/movements')) return response({ results: [
        { [idField]: 'second', status: 'ok' }, { [idField]: 'first', status: 'error', error: 'Review required' }, { [idField]: 'unsolicited', status: 'ok' }
      ] });
      return response({ entities: [], orders: [], movements: [], latestSeq: 0, hasMore: false });
    };
    try {
      const result = await new CloudUplink(core, { cloudBase: 'https://fixture.invalid', deviceToken: 'fixture', fetchImpl }).syncOnce();
      expect(result.error).toBeUndefined(); expect(result.uploaded).toBe(1);
      expect(store.all('SELECT dedupe_key, status, attempts FROM cloud_outbox ORDER BY id')).toEqual([
        { dedupe_key: 'first', status: 'PENDING', attempts: 1 },
        { dedupe_key: 'second', status: 'SENT', attempts: 0 },
        { dedupe_key: 'missing', status: 'PENDING', attempts: 1 }
      ]);
    } finally { store.close(); }
  });

  it('ignores unsolicited and duplicate catalog acknowledgements and preserves an edit changed away and back during upload', async () => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'branch', branchCode: 'B' });
    const first = { id: 'dish', name: 'Original', updatedAt: '2026-10-01T00:00:00Z' };
    core.pushEntities({ id: 'admin' }, 'MENU_ITEM', [{ externalId: 'dish', payload: first }, { externalId: 'duplicate', payload: { ...first, id: 'duplicate' } }]);
    const fetchImpl: typeof fetch = async (input, init) => {
      const path = String(input);
      if (path.endsWith('/roster')) return response(roster);
      if (init?.method === 'POST' && path.endsWith('/entity-sync/MENU_ITEM')) {
        core.pushEntities({ id: 'admin' }, 'MENU_ITEM', [{ externalId: 'dish', payload: { ...first, name: 'Other edit' }, baseSyncVersion: 1 }]);
        core.pushEntities({ id: 'admin' }, 'MENU_ITEM', [{ externalId: 'dish', payload: first, baseSyncVersion: 2 }]);
        core.pushEntities({ id: 'admin' }, 'MENU_ITEM', [{ externalId: 'unsolicited', payload: { ...first, id: 'unsolicited' } }]);
        return response({ results: [ { externalId: 'dish', status: 'ok' }, { externalId: 'unsolicited', status: 'ok' }, { externalId: 'duplicate', status: 'ok' }, { externalId: 'duplicate', status: 'error' } ] });
      }
      return response({ entities: [], orders: [], movements: [], latestSeq: 0, hasMore: false });
    };
    try {
      await new CloudUplink(core, { cloudBase: 'https://fixture.invalid', deviceToken: 'fixture', fetchImpl }).syncOnce();
      expect(core.dirtyEntities().map(record => record.externalId).sort()).toEqual(['dish', 'duplicate', 'unsolicited']);
      expect(core.dirtyEntities().find(record => record.externalId === 'dish')?.syncVersion).toBe(3);
    } finally { store.close(); }
  });
});

import { describe, expect, it } from 'vitest';
import { BranchCore } from '../packages/branch-core/src/core';
import { BranchStore } from '../packages/branch-core/src/store';
import { CloudUplink } from '../packages/branch-core/src/uplink';
import { createHash } from 'node:crypto';

const branches = ['a', 'b', 'c', 'd', 'e'];
const roster = (ids = branches) => ({ restaurant: { id: 'restaurant', name: 'Test', status: 'ACTIVE' },
  restaurantBranchCount: ids.length,
  branches: ids.map(id => ({ id, name: id, code: id.toUpperCase(), timezone: 'Asia/Kolkata', status: 'ACTIVE' })), devices: [],
  subscription: { active: true, expiresAt: null, enabledApps: ['POS_ADMIN', 'KIOSK_ADMIN'] } });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const order = (branchId: string | null) => ({ branchId, externalOrderId: `bill-${branchId}`, orderType: 'TAKEAWAY', status: 'NEW', items: [], subtotal: 0, taxAmount: 0, totalAmount: 0, syncVersion: 1, updatedAt: '2026-10-18T00:00:00Z' });
const movement = (branchId: string | null) => ({ branchId, movementId: `stock-${branchId}`, itemId: 'rice', itemName: 'Rice', type: 'PURCHASE', quantityDelta: 1, unit: 'kg', occurredAt: '2026-10-18T00:00:00Z' });

describe('restaurant-wide cloud credential on a branch-local Core', () => {
  it.each([null, 'b'])('retains local financial uploads when the cloud credential is bound to %s instead of this branch', async credentialBranch => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'a', branchCode: 'A' });
    core.ingestOrders({ id: 'local-pos', type: 'POS' }, [order('a')]);
    const paths: string[] = [];
    const fetchImpl: typeof fetch = async input => {
      paths.push(String(input));
      return json({ ...roster(), devices: [{ id: 'core-admin', name: 'Core admin', isLocked: false, type: 'POS_ADMIN', branchId: credentialBranch, status: 'ACTIVE', appEnabled: true, tokenHash: createHash('sha256').update('fixture').digest('hex') }] });
    };
    try {
      const result = await new CloudUplink(core, { cloudBase: 'https://fixture.invalid', deviceToken: 'fixture', fetchImpl }).syncOnce();
      expect(result.error).toContain('BRANCH_BOUND_CORE_CREDENTIAL_REQUIRED'); expect(paths).toHaveLength(1);
      expect(core.dueOutbox('order', 100)).toHaveLength(1);
      expect(core.pullOrders(0).orders).toHaveLength(1);
    } finally { store.close(); }
  });
  it.each(['a', 'b'])('imports only branch %s records from mixed five-branch pages and advances global cursors', async branchId => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId, branchCode: branchId.toUpperCase() });
    const fetchImpl: typeof fetch = async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/roster')) return json(roster());
      if (url.pathname.endsWith('/orders/sync')) return json({ orders: [...branches.map(order), order(null)], latestSeq: 60, hasMore: false });
      if (url.pathname.endsWith('/inventory/movements')) return json({ movements: [...branches.map(movement), movement(null)], latestSeq: 70, hasMore: false });
      const type = url.pathname.split('/entity-sync/')[1];
      if (['DINING_TABLE', 'RESERVATION', 'STAFF_USER', 'MENU_ITEM'].includes(type)) return json({ entities: [...branches, null].map(id => ({ externalId: `${type}-${id}`, payload: { id: `${type}-${id}`, name: `Record ${id}`, branchId: id, updatedAt: '2026-10-18T00:00:00Z' } })), latestSeq: 80, hasMore: false });
      return json({ entities: [], orders: [], movements: [], latestSeq: 0, hasMore: false });
    };
    try {
      const result = await new CloudUplink(core, { cloudBase: 'https://fixture.invalid', deviceToken: 'owner-fixture', fetchImpl }).syncOnce();
      expect(result.error).toBeUndefined();
      expect(core.pullOrders(0).orders.map(row => row.externalOrderId)).toEqual([`bill-${branchId}`]);
      expect(store.all('SELECT movement_id FROM movements')).toEqual([{ movement_id: `stock-${branchId}` }]);
      for (const type of ['DINING_TABLE', 'RESERVATION']) expect(core.pullEntities(type).entities.map(row => row.externalId)).toEqual([`${type}-${branchId}`]);
      for (const type of ['STAFF_USER', 'MENU_ITEM']) expect(core.pullEntities(type).entities.map(row => row.externalId)).toEqual([`${type}-${branchId}`, `${type}-null`]);
      expect(store.getConfig('cloud_cursor_orders')).toBe('60'); expect(store.getConfig('cloud_cursor_movements')).toBe('70');
      expect(store.getConfig('cloud_seq_DINING_TABLE')).toBe('80');
    } finally { store.close(); }
  });

  it('accepts legacy unscoped operational rows only when the roster proves exactly one matching branch', async () => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'a', branchCode: 'A' });
    const fetchImpl: typeof fetch = async input => {
      const path = String(input);
      if (path.endsWith('/roster')) return json(roster(['a']));
      if (path.includes('/orders/sync?')) return json({ orders: [order(null)], latestSeq: 1, hasMore: false });
      if (path.includes('/inventory/movements?')) return json({ movements: [movement(null)], latestSeq: 1, hasMore: false });
      return json({ entities: [], orders: [], movements: [], latestSeq: 0, hasMore: false });
    };
    try {
      expect((await new CloudUplink(core, { cloudBase: 'https://fixture.invalid', deviceToken: 'fixture', fetchImpl }).syncOnce()).error).toBeUndefined();
      expect(core.pullOrders(0).orders.map(row => row.externalOrderId)).toEqual(['bill-null']);
      expect(store.all('SELECT movement_id FROM movements')).toEqual([{ movement_id: 'stock-null' }]);
    } finally { store.close(); }
  });

  it('does not infer single-branch ownership from a credential that can see only one of five branches', async () => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'a', branchCode: 'A' });
    const fetchImpl: typeof fetch = async input => {
      const path = String(input);
      if (path.endsWith('/roster')) return json({ ...roster(['a']), restaurantBranchCount: 5 });
      if (path.includes('/orders/sync?')) return json({ orders: [order(null)], latestSeq: 1, hasMore: false });
      if (path.includes('/inventory/movements?')) return json({ movements: [movement(null)], latestSeq: 1, hasMore: false });
      return json({ entities: [], orders: [], movements: [], latestSeq: 0, hasMore: false });
    };
    try {
      expect((await new CloudUplink(core, { cloudBase: 'https://fixture.invalid', deviceToken: 'fixture', fetchImpl }).syncOnce()).error).toBeUndefined();
      expect(core.pullOrders(0).orders).toEqual([]); expect(core.pullMovements(0).movements).toEqual([]);
    } finally { store.close(); }
  });

  it('rejects a roster for another restaurant before changing trust or uploading any pending data', async () => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'a', branchCode: 'A' });
    core.applyRoster(roster());
    const priorContact = store.getConfig('last_cloud_contact'), paths: string[] = [];
    const fetchImpl: typeof fetch = async input => { paths.push(String(input)); return json({ ...roster(), restaurant: { id: 'other', name: 'Other', status: 'ACTIVE' } }); };
    try {
      const result = await new CloudUplink(core, { cloudBase: 'https://fixture.invalid', deviceToken: 'wrong-fixture', fetchImpl }).syncOnce();
      expect(result.error).toContain('another restaurant'); expect(paths).toHaveLength(1);
      expect(JSON.parse(store.getConfig('restaurant')!).id).toBe('restaurant'); expect(store.getConfig('last_cloud_contact')).toBe(priorContact);
      expect(core.ingestOrders({ id: 'staff', type: 'POS' }, [order('b')]).results[0]).toMatchObject({ status: 'error', error: expect.stringContaining('WRONG_BRANCH') });
      expect(core.pullOrders(0).orders).toEqual([]);
    } finally { store.close(); }
  });

  it('quarantines unknown historical cloud rows in a multi-branch mirror without deleting unsent local work', () => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'restaurant', branchId: 'a', branchCode: 'A' });
    core.applyRoster(roster());
    try {
      core.ingestOrders({ id: 'pos', type: 'POS' }, [order('a')]);
      // Emulate pre-fix cloud imports lacking branch provenance.
      store.run("INSERT INTO orders (external_order_id, order_type, status, items, subtotal, tax_amount, total_amount, device_id, seq, created_at, updated_at) VALUES ('old-cloud', 'TAKEAWAY', 'NEW', '[]', 0, 0, 0, 'cloud', 999, 0, 0)");
      store.run("INSERT INTO movements (movement_id, device_id, item_id, item_name, type, quantity_delta, unit, reason, occurred_at, seq) VALUES ('old-stock', 'cloud', 'rice', 'Rice', 'PURCHASE', 900, 'kg', '', '2026-10-18', 999)");
      store.run("INSERT INTO entities (entity_type, external_id, payload, updated_at, seq) VALUES ('DINING_TABLE', 'old-table', ?, 0, 999)", JSON.stringify({ id: 'old-table', branchId: 'b' }));
      expect(core.pullOrders(0).orders.map(row => row.externalOrderId)).toEqual(['bill-a']);
      expect(core.pullMovements(0).movements).toEqual([]); expect(core.balances()).toEqual([]);
      expect(core.pullEntities('DINING_TABLE').entities).toEqual([]);
      expect(core.status().branchScopeReview).toMatchObject({ required: true, unscopedCloudOrders: 1, unscopedCloudMovements: 1 });
      expect(core.dueOutbox('order', 100)).toHaveLength(1);
      expect(store.get("SELECT external_order_id FROM orders WHERE external_order_id='old-cloud'")).toBeDefined();
      expect(store.get("SELECT movement_id FROM movements WHERE movement_id='old-stock'")).toBeDefined();
      // A new authoritative replay supplies branch provenance, not a guess.
      core.ingestOrders({ id: 'cloud', type: 'POS_ADMIN' }, [{ ...order('a'), externalOrderId: 'old-cloud' }], 'cloud');
      expect(core.pushMovements({ id: 'cloud' }, [{ ...movement('a'), movementId: 'old-stock' }], 'cloud').results[0]).toMatchObject({ status: 'error', error: expect.stringContaining('RECOVERY_REVIEW_REQUIRED') });
      expect(core.balances()).toEqual([]);
      core.pushMovements({ id: 'cloud' }, [{ ...movement('a'), quantityDelta: 900, movementId: 'old-stock' }], 'cloud');
      expect(core.pullOrders(0).orders.map(row => row.externalOrderId)).toContain('old-cloud');
      expect(core.pullMovements(0).movements.map(row => row.movementId)).toEqual(['old-stock']);
      expect(core.balances()[0].netQuantity).toBe(900);
      expect(core.status().branchScopeReview.required).toBe(false);
    } finally { store.close(); }
  });
});

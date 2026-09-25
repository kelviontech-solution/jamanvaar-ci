import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { BranchStore, SCHEMA_VERSION } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';
import { createServer } from '../packages/branch-core/src/server';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const BRANCH = 'br-ahd';
const DAY = 86_400_000;

interface Harness {
  core: BranchCore;
  store: BranchStore;
  base: string;
  clock: { now: number };
  close(): Promise<void>;
  call(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }>;
}

function device(id: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, type, name: id, branchId: BRANCH, status: 'ACTIVE', isLocked: false, tokenHash: sha(`tok-${id}`), appEnabled: true, ...extra };
}
const tok = (id: string) => `tok-${id}`;

const ROSTER = () => ({
  restaurant: { id: 'rest-1', name: 'Demo', status: 'ACTIVE' },
  branches: [{ id: BRANCH, name: 'Ahmedabad', code: 'AHD', timezone: 'Asia/Kolkata', status: 'ACTIVE' }],
  subscription: { active: true, expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), enabledApps: ['POS', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'POS_ADMIN', 'CAPTAIN'] },
  devices: [
    device('pos1', 'POS'), device('pos2', 'POS'), device('kds1', 'KDS'), device('kiosk1', 'KIOSK'), device('kioskadmin', 'KIOSK_ADMIN'),
    device('admin', 'POS_ADMIN', { branchId: null }), device('captain1', 'CAPTAIN')
  ]
});

async function start(opts: { file?: string; withRoster?: boolean; appDirs?: Record<string, string> } = {}): Promise<Harness> {
  const store = new BranchStore(opts.file ?? ':memory:');
  const clock = { now: Date.now() };
  const core = new BranchCore(store, { restaurantId: 'rest-1', branchId: BRANCH, branchCode: 'AHD', now: () => clock.now });
  if (opts.withRoster !== false) core.applyRoster(ROSTER());
  const server = createServer(core, { appDirs: opts.appDirs, recheckMs: 150 });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    core, store, base, clock,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => { try { store.close(); } catch { /* closed */ } resolve(); }); }),
    call: async (token, method, path, body) => {
      const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    }
  };
}

const item = (id: string, kitchenStatus?: string) => ({ externalItemId: id, name: id, quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000, ...(kitchenStatus ? { kitchenStatus } : {}) });
const order = (id: string, extra: Record<string, unknown> = {}) => ({
  externalOrderId: id, orderType: 'DINE_IN', status: 'NEW', items: [item(`${id}-a`, 'PENDING')], subtotal: 1000, taxAmount: 50, discountAmount: 0, totalAmount: 1050, updatedAt: new Date().toISOString(), ...extra
});

let dir: string;
let h: Harness | null = null;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'jv-core-')); });
afterEach(async () => { await h?.close(); h = null; try { rmSync(dir, { recursive: true, force: true }); } catch { /* file still closing */ } });

describe('Branch Core: authorization (works with the internet down)', () => {
  it('rejects unknown and missing credentials, and refuses everything until it has its device list', async () => {
    h = await start({ withRoster: false });
    expect((await h.call(tok('pos1'), 'GET', '/api/v1/orders/sync?afterSeq=0')).status).toBe(401);

    h.core.applyRoster(ROSTER());
    expect((await h.call('nope', 'GET', '/api/v1/orders/sync?afterSeq=0')).status).toBe(401);
    expect((await fetch(h.base + '/api/v1/orders/sync?afterSeq=0')).status).toBe(401);
    expect((await h.call(tok('pos1'), 'GET', '/api/v1/orders/sync?afterSeq=0')).status).toBe(200);
  });

  it('a core that never reached the cloud authorizes nobody', async () => {
    h = await start({ withRoster: false });
    h.store.run("INSERT INTO devices (id, type, status, token_hash, updated_at) VALUES ('pos1','POS','ACTIVE', ?, 0)", sha(tok('pos1')));
    const r = await h.call(tok('pos1'), 'GET', '/api/v1/orders/sync?afterSeq=0');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('BRANCH_CORE_NOT_SYNCED');
  });

  it('enforces revoked devices, another branch, disabled apps, suspended restaurants and locked devices', async () => {
    h = await start();
    const roster = ROSTER();
    roster.devices.push(device('revoked', 'POS', { status: 'REVOKED' }), device('otherbranch', 'POS', { branchId: 'br-other' }), device('nokds', 'KDS', { appEnabled: false }), device('locked', 'POS', { isLocked: true }));
    h.core.applyRoster(roster);
    const get = (id: string) => h!.call(tok(id), 'GET', '/api/v1/orders/sync?afterSeq=0');
    expect((await get('revoked')).body.code).toBe('DEVICE_REVOKED');
    expect((await get('otherbranch')).body.code).toBe('WRONG_BRANCH');
    expect((await get('nokds')).body.code).toBe('APP_DISABLED');
    expect((await get('locked')).body.code).toBe('DEVICE_LOCKED');
    expect((await h.call(tok('locked'), 'PATCH', '/api/v1/devices/me/heartbeat', {})).status).toBe(200); // a locked device may still check in

    roster.restaurant.status = 'SUSPENDED';
    h.core.applyRoster(roster);
    expect((await get('pos1')).body.code).toBe('RESTAURANT_SUSPENDED');
  });

  it('a device dropped from the cloud roster stops being trusted', async () => {
    h = await start();
    const roster = ROSTER();
    roster.devices = roster.devices.filter((d) => d.id !== 'pos2');
    h.core.applyRoster(roster);
    expect((await h.call(tok('pos2'), 'GET', '/api/v1/orders/sync?afterSeq=0')).body.code).toBe('DEVICE_REVOKED');
  });

  it('offline policy: keeps working for 7 days after last cloud contact even past subscription expiry, then stops', async () => {
    h = await start();
    h.clock.now += 6 * DAY;
    expect((await h.call(tok('pos1'), 'GET', '/api/v1/orders/sync?afterSeq=0')).status).toBe(200);
    h.clock.now += 2 * DAY;
    const r = await h.call(tok('pos1'), 'GET', '/api/v1/orders/sync?afterSeq=0');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OFFLINE_LIMIT');
    h.core.noteCloudContact(); // internet returns
    expect((await h.call(tok('pos1'), 'GET', '/api/v1/orders/sync?afterSeq=0')).status).toBe(200);
  });

  it('a lapsed subscription reported by the cloud switches every device off at once', async () => {
    h = await start();
    const roster = ROSTER();
    roster.subscription.active = false;
    h.core.applyRoster(roster);
    expect((await h.call(tok('pos1'), 'GET', '/api/v1/orders/sync?afterSeq=0')).body.code).toBe('SUBSCRIPTION_INACTIVE');
  });
});

describe('Branch Core: POS -> Core -> KDS with no internet', () => {
  it('a POS order reaches the KDS by cursor, in sequence, and the KDS can recover everything it missed', async () => {
    h = await start();
    const first = await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [order('o1', { eventId: 'POS1-E1' }), order('o2', { eventId: 'POS1-E2' })] });
    expect(first.status).toBe(201);
    expect(first.body.results.map((r: any) => r.status)).toEqual(['ok', 'ok']);

    const pull = await h.call(tok('kds1'), 'GET', '/api/v1/orders/sync?afterSeq=0');
    expect(pull.body.orders.map((o: any) => o.externalOrderId)).toEqual(['o1', 'o2']);
    expect(pull.body.orders[1].seq).toBe(pull.body.orders[0].seq + 1);
    const caughtUp = await h.call(tok('kds1'), 'GET', `/api/v1/orders/sync?afterSeq=${pull.body.latestSeq}`);
    expect(caughtUp.body.orders).toHaveLength(0);
  });

  it('wakes the KDS in real time (and not the sender), and the wake-up carries no data', async () => {
    h = await start();
    const events: string[] = [];
    const open = async (id: string, sink: string[]) => {
      const ctl = new AbortController();
      const res = await fetch(h!.base + '/api/v1/realtime/stream', { headers: { Authorization: `Bearer ${tok(id)}` }, signal: ctl.signal });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      void (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; sink.push(dec.decode(value)); } } catch { /* aborted */ } })();
      return ctl;
    };
    const kdsSink: string[] = []; const posSink: string[] = [];
    const a = await open('kds1', kdsSink); const b = await open('pos1', posSink);
    await new Promise((r) => setTimeout(r, 80));
    await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [order('live-1', { eventId: 'L1' })] });
    await new Promise((r) => setTimeout(r, 120));
    expect(kdsSink.join('')).toContain('event: change');
    expect(kdsSink.join('')).not.toContain('live-1');
    expect(posSink.join('')).not.toContain('event: change');
    a.abort(); b.abort();
    void events;
  });

  it('ends the stream of a device that is revoked while connected', async () => {
    h = await start();
    const sink: string[] = [];
    const ctl = new AbortController();
    const res = await fetch(h.base + '/api/v1/realtime/stream', { headers: { Authorization: `Bearer ${tok('kds1')}` }, signal: ctl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    void (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; sink.push(dec.decode(value)); } } catch { /* aborted */ } })();
    await new Promise((r) => setTimeout(r, 60));
    const roster = ROSTER();
    roster.devices = roster.devices.map((d) => (d.id === 'kds1' ? { ...d, status: 'REVOKED' } : d));
    h.core.applyRoster(roster);
    await new Promise((r) => setTimeout(r, 400));
    expect(sink.join('')).toContain('event: revoked');
    ctl.abort();
  });

  it('Kiosk, Captain and POS orders all go through the same pipeline into the same sequence', async () => {
    h = await start();
    await h.call(tok('kiosk1'), 'POST', '/api/v1/orders/sync', { events: [order('k-1', { eventId: 'K1', meta: { sourceType: 'KIOSK' } })] });
    await h.call(tok('captain1'), 'POST', '/api/v1/orders/sync', { events: [order('c-1', { eventId: 'C1', meta: { sourceType: 'CAPTAIN' } })] });
    await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [order('p-1', { eventId: 'P1' })] });
    const pull = await h.call(tok('kds1'), 'GET', '/api/v1/orders/sync?afterSeq=0');
    expect(pull.body.orders.map((o: any) => o.externalOrderId)).toEqual(['k-1', 'c-1', 'p-1']);
    expect(pull.body.orders.map((o: any) => o.seq)).toEqual([1, 2, 3]);
  });
});

describe('Branch Core: exactly-once and crash safety', () => {
  it('a retried event changes nothing, even across a restart of the core', async () => {
    const file = join(dir, 'core.sqlite3');
    h = await start({ file });
    const evt = order('idem-1', { eventId: 'POS1-IDEM' });
    const first = await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [evt] });
    expect(first.body.results[0]).toMatchObject({ status: 'ok', syncVersion: 1 });
    await h.close();

    h = await start({ file, withRoster: false });
    h.core.noteCloudContact();
    const retry = await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [evt] });
    expect(retry.body.results[0]).toMatchObject({ status: 'ok', syncVersion: 1, duplicate: true });
    expect(h.store.get<{ n: number }>('SELECT COUNT(*) AS n FROM orders')!.n).toBe(1);
  });

  it('orders, the sequence and the pending-cloud queue survive a restart', async () => {
    const file = join(dir, 'core.sqlite3');
    h = await start({ file });
    await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [order('r1', { eventId: 'R1' }), order('r2', { eventId: 'R2' })] });
    const before = h.core.status();
    await h.close();

    h = await start({ file, withRoster: false });
    h.core.noteCloudContact();
    const after = h.core.status();
    expect(after.sequence).toBe(before.sequence);
    expect(after.pendingCloudEvents).toBe(2);
    const more = await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [order('r3', { eventId: 'R3' })] });
    expect(more.status).toBe(201);
    expect(h.core.status().sequence).toBe(before.sequence + 1); // continues, never reuses
  });

  it('a crash in the middle of a batch leaves all of it or none of it', async () => {
    h = await start();
    const bad = { ...order('crash-2', { eventId: 'CR2' }), items: 'not-a-list' };
    const res = await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [order('crash-1', { eventId: 'CR1' }), bad] });
    expect(res.body.results.map((r: any) => r.status)).toEqual(['ok', 'error']);
    // A hard failure inside the transaction rolls the whole batch back.
    expect(() => h!.store.transaction(() => { h!.store.run("INSERT INTO config (key, value) VALUES ('x','1')"); throw new Error('power cut'); })).toThrow('power cut');
    expect(h.store.getConfig('x')).toBeNull();
  });

  it('refuses a database written by a newer version, and upgrades an older one in place', async () => {
    const file = join(dir, 'ver.sqlite3');
    const s = new BranchStore(file);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    s.run("INSERT INTO config (key, value) VALUES ('keep','me')");
    s.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    s.close();
    expect(() => new BranchStore(file)).toThrow(/newer than this Branch Core/);

    const s2 = new (BranchStore as any)(file.replace('ver', 'fresh'));
    expect(s2.schemaVersion).toBe(SCHEMA_VERSION);
    s2.close();
  });
});

describe('Branch Core: multi-device business rules', () => {
  it('two terminals cannot both pay one order', async () => {
    h = await start();
    const paid = (txn: string) => order('pay-1', { status: 'COMPLETED', paymentStatus: 'SUCCESS', paymentMethod: 'CASH', meta: { paymentTransactionId: txn } });
    expect((await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [{ ...paid('T-A'), eventId: 'PA' }] })).body.results[0].status).toBe('ok');
    const second = await h.call(tok('pos2'), 'POST', '/api/v1/orders/sync', { events: [{ ...paid('T-B'), eventId: 'PB' }] });
    expect(second.body.results[0]).toMatchObject({ status: 'error', error: expect.stringContaining('ORDER_ALREADY_PAID') });
    expect(h.core.status().unresolvedConflicts).toBe(1);
    const revert = await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [{ ...paid('T-A'), paymentStatus: 'PENDING', eventId: 'PC' }] });
    expect(revert.body.results[0].status).toBe('error');
  });

  it('two devices adding to one order keep each other\'s items, and the kitchen\'s progress is never undone', async () => {
    h = await start();
    await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [{ ...order('m-1'), items: [item('a', 'PENDING')], eventId: 'M1' }] });
    await h.call(tok('captain1'), 'POST', '/api/v1/orders/sync', { events: [{ ...order('m-1'), items: [item('c', 'PENDING')], eventId: 'M2' }] });
    await h.call(tok('kds1'), 'POST', '/api/v1/orders/sync', { events: [{ ...order('m-1'), items: [item('a', 'READY')], eventId: 'M3' }] });
    await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [{ ...order('m-1'), items: [item('a', 'PENDING')], eventId: 'M4' }] });
    const o = (await h.call(tok('kds1'), 'GET', '/api/v1/orders/sync?afterSeq=0')).body.orders[0];
    expect(o.items.map((i: any) => i.externalItemId).sort()).toEqual(['a', 'c']);
    expect(o.items.find((i: any) => i.externalItemId === 'a').kitchenStatus).toBe('READY');
  });

  it('inventory movements from two terminals add up, and a retry counts once', async () => {
    h = await start();
    const mv = (id: string, d: number) => ({ movementId: id, itemId: 'paneer', itemName: 'Paneer', type: 'SALE', quantityDelta: d, unit: 'kg', reason: 'sale', occurredAt: new Date().toISOString() });
    await Promise.all([
      h.call(tok('pos1'), 'POST', '/api/v1/inventory/movements', { movements: [mv('A1', -7)] }),
      h.call(tok('pos2'), 'POST', '/api/v1/inventory/movements', { movements: [mv('B1', -6)] })
    ]);
    const retry = await h.call(tok('pos1'), 'POST', '/api/v1/inventory/movements', { movements: [mv('A1', -7)] });
    expect(retry.body.results[0].duplicate).toBe(true);
    const bal = await h.call(tok('admin'), 'GET', '/api/v1/inventory/balances');
    expect(bal.body[0]).toMatchObject({ itemId: 'paneer', netQuantity: -13, movementCount: 2 });
  });

  it('order and KOT numbers leased to different terminals never overlap, and continue after a restart', async () => {
    const file = join(dir, 'num.sqlite3');
    h = await start({ file });
    const [a, b] = await Promise.all([
      h.call(tok('pos1'), 'POST', '/api/v1/sync/number-leases', { kind: 'ORDER', count: 50 }),
      h.call(tok('pos2'), 'POST', '/api/v1/sync/number-leases', { kind: 'ORDER', count: 50 })
    ]);
    const ranges = [a.body, b.body].map((l: any) => [l.start, l.start + l.count - 1]).sort((x: number[], y: number[]) => x[0] - y[0]);
    expect(ranges[0][1]).toBeLessThan(ranges[1][0]);
    expect(a.body.prefix).toBe('AHD');
    await h.close();
    h = await start({ file, withRoster: false });
    h.core.noteCloudContact();
    const c = await h.call(tok('pos1'), 'POST', '/api/v1/sync/number-leases', { kind: 'ORDER', count: 10 });
    expect(c.body.start).toBe(ranges[1][1] + 1);
  });

  it('Kiosk Admin manages the whole kiosk fleet locally: fleet view, commands, idempotent send, redelivery', async () => {
    h = await start();
    await h.call(tok('kiosk1'), 'PATCH', '/api/v1/devices/me/heartbeat', { pendingSyncCount: 3, appVersion: '1.4.2', syncError: null });
    const fleet = await h.call(tok('kioskadmin'), 'GET', '/api/v1/devices/me/fleet');
    expect(fleet.body.devices.map((d: any) => d.type)).toEqual(['KIOSK', 'KIOSK_ADMIN']);
    expect(fleet.body.devices.find((d: any) => d.id === 'kiosk1')).toMatchObject({ health: 'online', pendingSyncCount: 3, appVersion: '1.4.2' });

    const body = { commandType: 'REQUEST_SYNC', idempotencyKey: 'once' };
    const a = await h.call(tok('kioskadmin'), 'POST', '/api/v1/devices/me/fleet/kiosk1/commands', body);
    const b = await h.call(tok('kioskadmin'), 'POST', '/api/v1/devices/me/fleet/kiosk1/commands', body);
    expect(b.body.id).toBe(a.body.id);

    expect((await h.call(tok('kioskadmin'), 'POST', '/api/v1/devices/me/fleet/pos1/commands', { commandType: 'REQUEST_SYNC' })).status).toBe(403);
    expect((await h.call(tok('pos1'), 'POST', '/api/v1/devices/me/fleet/kiosk1/commands', { commandType: 'REQUEST_SYNC' })).status).toBe(403);
    expect((await h.call(tok('kioskadmin'), 'POST', '/api/v1/devices/me/fleet/kiosk1/commands', { commandType: 'WIPE_LOCAL_DATA' })).status).toBe(400);

    const got = await h.call(tok('kiosk1'), 'GET', '/api/v1/devices/me/commands');
    expect(got.body.map((c: any) => c.id)).toContain(a.body.id);
    h.clock.now += 3 * 60_000;
    expect((await h.call(tok('kiosk1'), 'GET', '/api/v1/devices/me/commands')).body.map((c: any) => c.id)).toContain(a.body.id);
    await h.call(tok('kiosk1'), 'POST', `/api/v1/devices/me/commands/${a.body.id}/ack`, { status: 'SUCCEEDED' });
    h.clock.now += 3 * 60_000;
    expect((await h.call(tok('kiosk1'), 'GET', '/api/v1/devices/me/commands')).body).toHaveLength(0);
  });

  it('locking a kiosk from the console takes effect on its next request', async () => {
    h = await start();
    await h.call(tok('kioskadmin'), 'POST', '/api/v1/devices/me/fleet/kiosk1/commands', { commandType: 'LOCK', payload: { reason: 'Maintenance' } });
    const r = await h.call(tok('kiosk1'), 'GET', '/api/v1/orders/sync?afterSeq=0');
    expect(r.body.code).toBe('DEVICE_LOCKED');
    await h.call(tok('kioskadmin'), 'POST', '/api/v1/devices/me/fleet/kiosk1/commands', { commandType: 'UNLOCK' });
    expect((await h.call(tok('kiosk1'), 'GET', '/api/v1/orders/sync?afterSeq=0')).status).toBe(200);
  });
});

describe('Branch Core: serving the KDS with no internet, and support status', () => {
  it('serves the built KDS app itself, so a TV can load it with the internet down', async () => {
    const kds = join(dir, 'kds');
    mkdirSync(kds, { recursive: true });
    writeFileSync(join(kds, 'index.html'), '<html><body>KDS</body></html>');
    h = await start({ appDirs: { kds } });
    const res = await fetch(h.base + '/apps/kds/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('KDS');
    expect((await fetch(h.base + '/apps/kds/some/deep/route')).status).toBe(200); // single-page app fallback
    expect((await fetch(h.base + '/apps/kds/../../etc/passwd')).status).not.toBe(500);
    expect((await fetch(h.base + '/apps/unknown/')).status).toBe(404);
  });

  it('reports its own health for diagnostics, only to an admin console', async () => {
    h = await start();
    await h.call(tok('pos1'), 'POST', '/api/v1/orders/sync', { events: [order('s1', { eventId: 'S1' })] });
    const s = await h.call(tok('admin'), 'GET', '/api/v1/branch-core/status');
    expect(s.body).toMatchObject({ branchId: BRANCH, pendingCloudEvents: 1, failedCloudEvents: 0, cloud: 'CONNECTED', schemaVersion: SCHEMA_VERSION });
    expect((await h.call(tok('pos1'), 'GET', '/api/v1/branch-core/status')).status).toBe(403);
    expect((await fetch(h.base + '/health')).status).toBe(200);
    expect(await (await fetch(h.base + '/discover')).json()).toMatchObject({ service: 'jamanvaar-branch-core', branchCode: 'AHD' });
  });
});

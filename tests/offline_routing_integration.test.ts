import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';
import { createServer } from '../packages/branch-core/src/server';
import { SyncOutboxEngine, type OrderSyncTransport } from '../packages/sync/src/outbox';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { OrderRepository } from '../packages/database/src/repositories';
import { db } from '../packages/database/src/db';

/**
 * The real app-side pieces (repository, outbox, resolver) talking to a real Branch Core over HTTP, with a
 * stand-in cloud, through every connectivity state: this is "the restaurant keeps working with the internet
 * down, and nothing is lost or duplicated when things come back".
 */
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const TOKEN = 'tok-pos-1';

let core: BranchCore;
let coreServer: http.Server;
let coreUrl: string;
let cloudServer: http.Server;
let cloudUrl: string;
let cloudReceived: Array<{ path: string; body: any }>;
const net = { coreUp: true, cloudUp: true };
const ls = new Map<string, string>();

function listen(server: http.Server): Promise<string> {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

/** A network where either server can be switched off, as the restaurant's router / internet would. */
function gatedFetch(url: string, init?: RequestInit): Promise<Response> {
  const toCore = url.startsWith(coreUrl);
  if ((toCore && !net.coreUp) || (!toCore && !net.cloudUp)) return Promise.reject(new TypeError('fetch failed'));
  return fetch(url, init);
}

/** Exactly what an app's cloudClient does: authenticate as the device, route via the resolver. */
const transport: OrderSyncTransport = {
  async push(events) {
    const res = await EndpointResolver.fetch('/api/v1/orders/sync', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });
    if (!res.ok) throw new Error(`push ${res.status}`);
    return res.json();
  },
  async pull(cursor) {
    const q = !cursor ? '' : cursor.startsWith('seq:') ? `?afterSeq=${cursor.slice(4)}` : `?since=${encodeURIComponent(cursor)}`;
    const res = await EndpointResolver.fetch(`/api/v1/orders/sync${q}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`pull ${res.status}`);
    return res.json();
  }
};

function newOrder(id: string) {
  return OrderRepository.createOrder({
    id, items: [{ id: `oi-${id}`, menuItemId: 'm', name: 'Tea', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' }] as never,
    subtotal: 100, totalAmount: 105, orderType: 'TAKEAWAY', idempotencyKey: `idem-${id}`, paymentStatus: 'SUCCESS', paymentMethod: 'CASH_AT_COUNTER'
  } as never);
}
const coreOrders = () => core.store.all<{ external_order_id: string }>('SELECT external_order_id FROM orders').map((r) => r.external_order_id);

beforeEach(async () => {
  ls.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) };
  net.coreUp = true;
  net.cloudUp = true;
  cloudReceived = [];

  core = new BranchCore(new BranchStore(':memory:'), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD' });
  core.applyRoster({
    restaurant: { id: 'rest-1', name: 'Demo', status: 'ACTIVE' },
    branches: [{ id: 'br-1', name: 'A', code: 'AHD', timezone: 'Asia/Kolkata', status: 'ACTIVE' }],
    subscription: { active: true, expiresAt: null, enabledApps: ['POS', 'KDS'] },
    devices: [{ id: 'pos-1', type: 'POS', name: 'POS 1', branchId: 'br-1', status: 'ACTIVE', isLocked: false, tokenHash: sha(TOKEN), appEnabled: true }]
  });
  coreServer = createServer(core);
  coreUrl = await listen(coreServer);

  cloudServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      cloudReceived.push({ path: req.url ?? '', body: raw ? JSON.parse(raw) : null });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: (raw ? JSON.parse(raw).events ?? [] : []).map((e: any) => ({ externalOrderId: e.externalOrderId, status: 'ok' })), orders: [], latestSeq: 0, serverTime: new Date().toISOString() }));
    });
  });
  cloudUrl = await listen(cloudServer);

  EndpointResolver.reset();
  EndpointResolver.setTransport(gatedFetch);
  EndpointResolver.configure({ cloudBase: cloudUrl, coreUrl });
  db.orders.length = 0;
  db.syncEvents.length = 0;
  db.kots.length = 0;
  SyncOutboxEngine.configureTransport(transport);
});

afterEach(async () => {
  SyncOutboxEngine.configureTransport(null);
  EndpointResolver.setTransport(null);
  EndpointResolver.reset();
  await new Promise<void>((r) => { coreServer.closeAllConnections?.(); coreServer.close(() => r()); });
  await new Promise<void>((r) => { cloudServer.closeAllConnections?.(); cloudServer.close(() => r()); });
  core.store.close();
  db.orders.length = 0;
});

describe('an app working through every connectivity state', () => {
  it('internet UP + core UP: the order goes to the Branch Core, not the cloud', async () => {
    const o = newOrder('route-1');
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(o.syncStatus).toBe('SYNCED');
    expect(coreOrders()).toContain('route-1');
    expect(cloudReceived.filter((c) => c.path.includes('orders/sync'))).toHaveLength(0);
    expect(EndpointResolver.mode()).toBe('LOCAL'); // core answered; the cloud has not been needed
  });

  it('INTERNET DOWN, core UP: the whole flow still works, and the KDS can read the order from the core', async () => {
    net.cloudUp = false;
    const o = newOrder('local-1');
    expect(o.paymentStatus).toBe('SUCCESS'); // cash bill created locally
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(o.syncStatus).toBe('SYNCED');

    const kds = await fetch(`${coreUrl}/api/v1/orders/sync?afterSeq=0`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect((await kds.json()).orders.map((x: any) => x.externalOrderId)).toEqual(['local-1']);
  });

  it('CORE DOWN, internet UP: the order falls back to the cloud in the same call', async () => {
    net.coreUp = false;
    const o = newOrder('fallback-1');
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(o.syncStatus).toBe('SYNCED');
    expect(cloudReceived.some((c) => c.path.includes('orders/sync') && c.body.events[0].externalOrderId === 'fallback-1')).toBe(true);
    expect(coreOrders()).toEqual([]);
  });

  it('EVERYTHING DOWN: the order is saved locally and waits; when a server returns it syncs exactly once', async () => {
    net.coreUp = false;
    net.cloudUp = false;
    const o = newOrder('dark-1');
    const first = await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(first.failed).toBe(1);
    expect(o.syncStatus).toBe('FAILED');
    expect(db.orders.some((x) => x.id === 'dark-1')).toBe(true); // never lost
    expect(o.syncNextAttemptAt).toBeGreaterThan(Date.now()); // backing off, not hammering

    net.coreUp = true;
    EndpointResolver.reset();
    EndpointResolver.setTransport(gatedFetch);
    EndpointResolver.configure({ cloudBase: cloudUrl, coreUrl });
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(o.syncStatus).toBe('SYNCED');
    expect(coreOrders().filter((id) => id === 'dark-1')).toHaveLength(1);

    // A second push of the same state (a lost acknowledgement) creates nothing new.
    o.syncStatus = 'SAVED_LOCALLY';
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(coreOrders().filter((id) => id === 'dark-1')).toHaveLength(1);
    expect(core.store.get<{ sync_version: number }>('SELECT sync_version FROM orders WHERE external_order_id = ?', 'dark-1')!.sync_version).toBe(1);
  });

  it('the app restarts mid-outage: pending orders are still there and go out afterwards', async () => {
    net.coreUp = false;
    net.cloudUp = false;
    newOrder('restart-1');
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    const persisted = JSON.parse(JSON.stringify(db.orders.find((x) => x.id === 'restart-1')));
    expect(persisted.syncStatus).toBe('FAILED');

    net.coreUp = true;
    EndpointResolver.reset();
    EndpointResolver.setTransport(gatedFetch);
    EndpointResolver.configure({ cloudBase: cloudUrl, coreUrl });
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(coreOrders()).toContain('restart-1');
  });

  it('keeps separate sync cursors for the core and the cloud', async () => {
    newOrder('cur-1');
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    await SyncOutboxEngine.catchUpFromCloud();
    expect(ls.get('jamanvaar_order_sync_cursor:core')).toMatch(/^seq:\d+$/);
    expect(ls.has('jamanvaar_order_sync_cursor')).toBe(false); // the cloud's own cursor is untouched
  });

  it('a revoked device is refused by the core and does not silently fall back to the cloud for local traffic', async () => {
    core.applyRoster({
      restaurant: { id: 'rest-1', name: 'Demo', status: 'ACTIVE' },
      branches: [{ id: 'br-1', name: 'A', code: 'AHD', timezone: 'Asia/Kolkata', status: 'ACTIVE' }],
      subscription: { active: true, expiresAt: null, enabledApps: ['POS'] },
      devices: [{ id: 'pos-1', type: 'POS', name: 'POS 1', branchId: 'br-1', status: 'REVOKED', isLocked: false, tokenHash: sha(TOKEN), appEnabled: true }]
    });
    const o = newOrder('revoked-1');
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(o.syncStatus).toBe('FAILED'); // the core answered 401: a real answer, not an outage
    expect(cloudReceived.filter((c) => c.path.includes('orders/sync'))).toHaveLength(0);
  });
});

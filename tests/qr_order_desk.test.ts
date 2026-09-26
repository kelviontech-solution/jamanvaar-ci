import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { db } from '../packages/database/src/db';
import { KOTRepository } from '../packages/database/src/repositories';
import { KeyValueStore } from '../packages/database/src/key_value_store';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';
import { createServer } from '../packages/branch-core/src/server';
import { SyncOutboxEngine, type OrderSyncTransport } from '../packages/sync/src/outbox';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { QrOrderDesk } from '../packages/sync/src/qr_order_desk';

/**
 * A guest's QR order arriving at the restaurant: every terminal builds the identical kitchen ticket from it, exactly
 * one terminal accepts it and prints, and a terminal that lost the claim (even one that accepted at the very same
 * moment, before it could see the other's claim) prints nothing.
 */
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
let core: BranchCore;
let server: http.Server;
let coreUrl: string;
let currentToken = 'tok-pos1';

const transport: OrderSyncTransport = {
  async push(events) {
    const res = await EndpointResolver.fetch('/api/v1/orders/sync', { method: 'POST', headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });
    if (!res.ok) throw new Error(`push ${res.status}`);
    return res.json();
  },
  async pull(cursor) {
    const q = !cursor ? '' : cursor.startsWith('seq:') ? `?afterSeq=${cursor.slice(4)}` : `?since=${encodeURIComponent(cursor)}`;
    const res = await EndpointResolver.fetch(`/api/v1/orders/sync${q}`, { headers: { Authorization: `Bearer ${currentToken}` } });
    if (!res.ok) throw new Error(`pull ${res.status}`);
    return res.json();
  }
};

const ls = new Map<string, string>();
const qrEvent = (id: string, extra: Record<string, unknown> = {}) => ({
  externalOrderId: id, orderType: 'DINE_IN', status: 'NEW', tableLabel: '12',
  items: [
    { externalItemId: `${id}-pizza`, name: 'Paneer Pizza', quantity: 2, unitPrice: 24900, modifiers: [], lineTotal: 49800, kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' },
    { externalItemId: `${id}-coffee`, name: 'Cold Coffee', quantity: 1, unitPrice: 12000, modifiers: [], lineTotal: 12000, kitchenStatus: 'PENDING', kitchenStation: 'Bar' }
  ],
  subtotal: 61800, taxAmount: 3090, discountAmount: 0, totalAmount: 64890, paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER',
  meta: { sourceType: 'QR_TABLE', tokenNumber: 'QR-7', orderNumber: 'QR-7', customerName: 'Guest' }, updatedAt: new Date().toISOString(), ...extra
});

const snapshot = () => ({ orders: JSON.parse(JSON.stringify(db.orders)), kots: JSON.parse(JSON.stringify(db.kots)) });
const restore = (s: { orders: unknown[]; kots: unknown[] }) => { db.orders = JSON.parse(JSON.stringify(s.orders)); db.kots = JSON.parse(JSON.stringify(s.kots)); };

beforeEach(async () => {
  ls.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) };
  KeyValueStore.reset();
  core = new BranchCore(new BranchStore(':memory:'), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD' });
  core.applyRoster({
    restaurant: { id: 'rest-1', name: 'Demo', status: 'ACTIVE' },
    branches: [{ id: 'br-1', name: 'A', code: 'AHD', timezone: 'Asia/Kolkata', status: 'ACTIVE' }],
    subscription: { active: true, expiresAt: null, enabledApps: ['POS'] },
    devices: [
      { id: 'pos-1', type: 'POS', name: 'POS 1', branchId: 'br-1', status: 'ACTIVE', isLocked: false, tokenHash: sha('tok-pos1'), appEnabled: true },
      { id: 'pos-2', type: 'POS', name: 'POS 2', branchId: 'br-1', status: 'ACTIVE', isLocked: false, tokenHash: sha('tok-pos2'), appEnabled: true }
    ]
  });
  server = createServer(core);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  coreUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  EndpointResolver.reset();
  EndpointResolver.configure({ cloudBase: 'http://127.0.0.1:1', coreUrl });
  SyncOutboxEngine.configureTransport(transport);
  db.orders.length = 0;
  db.kots.length = 0;
  currentToken = 'tok-pos1';
});
afterEach(async () => {
  SyncOutboxEngine.configureTransport(null);
  EndpointResolver.reset();
  await new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
  core.store.close();
  db.orders.length = 0;
  db.kots.length = 0;
});

const arrive = (id: string) => core.ingestOrders({ id: 'cloud', type: 'POS_ADMIN', branchId: null }, [qrEvent(id)], 'cloud');
const pull = async () => { ls.clear(); await SyncOutboxEngine.catchUpFromCloud(); };

describe('a QR order at the counter', () => {
  it('arrives as an ordinary NEW order marked as QR, with the guest\'s order number', async () => {
    arrive('qr-a1');
    await pull();
    const o = db.orders.find((x) => x.id === 'qr-a1')!;
    expect(o).toMatchObject({ source_type: 'QR_TABLE', orderStatus: 'NEW', orderNumber: 'QR-7', tableNumber: '12', customerName: 'Guest' });
    expect(QrOrderDesk.pending().map((x) => x.id)).toEqual(['qr-a1']);
  });

  it('every terminal builds the SAME kitchen tickets: same ids, same numbers, no counters or clocks involved', async () => {
    arrive('qr-a2');
    await pull();
    const first = KOTRepository.getKOTsForOrder('qr-a2').map((k) => ({ id: k.id, n: k.kotNumber, s: k.station })).sort((a, b) => a.s.localeCompare(b.s));
    expect(first).toEqual([
      { id: 'kot-qr-a2-r1-bar', n: 'KOT-QR-7-1', s: 'Bar' },
      { id: 'kot-qr-a2-r1-main-kitchen', n: 'KOT-QR-7-2', s: 'Main Kitchen' }
    ]);
    // A second terminal, starting from nothing, derives exactly the same tickets.
    db.orders.length = 0;
    db.kots.length = 0;
    currentToken = 'tok-pos2';
    await pull();
    const second = KOTRepository.getKOTsForOrder('qr-a2').map((k) => ({ id: k.id, n: k.kotNumber, s: k.station })).sort((a, b) => a.s.localeCompare(b.s));
    expect(second).toEqual(first);
  });

  it('pulling the same order again never creates a second ticket', async () => {
    arrive('qr-a3');
    await pull();
    await pull();
    await pull();
    expect(KOTRepository.getKOTsForOrder('qr-a3')).toHaveLength(2);
  });

  it('an add-on round becomes round 2 with its own deterministic ticket', async () => {
    arrive('qr-a4');
    await pull();
    core.ingestOrders({ id: 'cloud', type: 'POS_ADMIN', branchId: null }, [qrEvent('qr-a4', {
      items: [
        ...qrEvent('qr-a4').items,
        { externalItemId: 'qr-a4-naan', name: 'Naan', quantity: 2, unitPrice: 4000, modifiers: [], lineTotal: 8000, kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' }
      ],
      updatedAt: new Date(Date.now() + 5000).toISOString()
    })], 'cloud');
    await pull();
    const ids = KOTRepository.getKOTsForOrder('qr-a4').map((k) => k.id).sort();
    expect(ids).toEqual(['kot-qr-a4-r1-bar', 'kot-qr-a4-r1-main-kitchen', 'kot-qr-a4-r2']);
    expect(KOTRepository.getKOTsForOrder('qr-a4').find((k) => k.id === 'kot-qr-a4-r2')!.kotNumber).toBe('KOT-QR-7-R2');
  });

  it('accepting prints each ticket once, moves the order to PREPARING and records who accepted it', async () => {
    arrive('qr-b1');
    await pull();
    const printed: string[] = [];
    const r = await QrOrderDesk.accept('qr-b1', { deviceId: 'pos-1', actor: 'Asha', print: (k) => void printed.push(k.id) });
    expect(r).toEqual({ status: 'ACCEPTED', printed: 2 });
    expect(printed).toHaveLength(2);
    const o = db.orders.find((x) => x.id === 'qr-b1')!;
    expect(o).toMatchObject({ orderStatus: 'PREPARING', acceptedByDeviceId: 'pos-1' });
    expect(core.store.get<{ status: string }>('SELECT status FROM orders WHERE external_order_id = ?', 'qr-b1')!.status).toBe('PREPARING');
    // pressing Accept again prints nothing more
    expect(await QrOrderDesk.accept('qr-b1', { deviceId: 'pos-1', actor: 'Asha', print: (k) => void printed.push(k.id) })).toEqual({ status: 'ACCEPTED', printed: 0 });
    expect(printed).toHaveLength(2);
  });

  it('a second terminal that sees the order already accepted cannot accept or print it', async () => {
    arrive('qr-b2');
    await pull();
    await QrOrderDesk.accept('qr-b2', { deviceId: 'pos-1', actor: 'Asha', print: () => undefined });
    db.orders.length = 0;
    db.kots.length = 0;
    currentToken = 'tok-pos2';
    await pull();
    const printed: string[] = [];
    const r = await QrOrderDesk.accept('qr-b2', { deviceId: 'pos-2', actor: 'Ravi', print: (k) => void printed.push(k.id) });
    expect(r.status).toBe('ALREADY_ACCEPTED');
    expect(printed).toEqual([]);
  });

  it('two terminals pressing Accept at the same moment: one wins everywhere, and only the winner prints', async () => {
    arrive('qr-b3');
    await pull();
    const both = snapshot(); // both terminals hold the order as NEW

    const printedBy: Record<string, string[]> = { 'pos-1': [], 'pos-2': [] };
    currentToken = 'tok-pos1';
    restore(both);
    const one = await QrOrderDesk.accept('qr-b3', { deviceId: 'pos-1', actor: 'Asha', print: (k) => void printedBy['pos-1'].push(k.id) });

    // The second terminal has not heard about the first: it still believes the order is NEW.
    currentToken = 'tok-pos2';
    restore(both);
    ls.clear();
    const two = await QrOrderDesk.accept('qr-b3', { deviceId: 'pos-2', actor: 'Ravi', print: (k) => void printedBy['pos-2'].push(k.id) });

    expect(one.status).toBe('ACCEPTED');
    expect(two.status).toBe('ALREADY_ACCEPTED');
    expect(printedBy['pos-1']).toHaveLength(2);
    expect(printedBy['pos-2']).toEqual([]);
    expect(JSON.parse(core.store.get<{ meta: string }>('SELECT meta FROM orders WHERE external_order_id = ?', 'qr-b3')!.meta).acceptedBy).toBe('pos-1');
  });

  it('a terminal working alone (no server reachable) accepts and prints; the claim is sent when a server returns', async () => {
    arrive('qr-b4');
    await pull();
    await new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
    const printed: string[] = [];
    const r = await QrOrderDesk.accept('qr-b4', { deviceId: 'pos-1', actor: 'Asha', print: (k) => void printed.push(k.id) });
    expect(r).toEqual({ status: 'ACCEPTED', printed: 2 });
    expect(db.orders.find((o) => o.id === 'qr-b4')!.syncStatus).not.toBe('SYNCED');
  });

  it('declining cancels the order for everyone and prints nothing', async () => {
    arrive('qr-b5');
    await pull();
    const r = await QrOrderDesk.reject('qr-b5', { deviceId: 'pos-1', actor: 'Asha', reason: 'Kitchen closed' });
    expect(r.status).toBe('REJECTED');
    expect(core.store.get<{ status: string }>('SELECT status FROM orders WHERE external_order_id = ?', 'qr-b5')!.status).toBe('CANCELLED');
  });
});

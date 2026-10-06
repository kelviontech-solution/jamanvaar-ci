import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

let server: ChildProcess;
let pin: string;
let port: number;
let base: string;
let dir: string;
async function start() {
  server = spawn(process.execPath, ['tooling/local-runtime/local_service.cjs'], { env: { ...process.env, JAMANVAAR_LOCAL_PORT: '0', JAMANVAAR_LOCAL_DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local relay startup timed out')), 5000);
    server.stdout!.on('data', data => {
      output += data.toString();
      const p = /URL: http:\/\/[^:]+:(\d+)/.exec(output);
      const n = /pairing\): (\d{6})/i.exec(output) || /devices\/pair\): (\d{6})/.exec(output);
      if (p && n) { port = Number(p[1]); base = `http://127.0.0.1:${port}`; pin = n[1]; clearTimeout(timeout); resolve(); }
    });
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Local relay exited ${code}`)); });
  });
}
async function stop() { if (server && server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited; } }
async function pair(restaurantId = 'qa-a', branchId = 'qa-branch-a') {
  const response = await fetch(`${base}/devices/pair`, { method: 'POST', body: JSON.stringify({ pairingPin: pin, restaurantId, branchId }) });
  expect(response.status).toBe(200); return (await response.json()).serviceKey as string;
}
async function request(token: string, pathname: string, method = 'GET', payload?: unknown) {
  return fetch(`${base}${pathname}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
}
beforeAll(async () => {
  const parent = path.resolve('.jamanvaar'); mkdirSync(parent, { recursive: true }); dir = mkdtempSync(path.join(parent, 'relay-test-')); await start();
}, 10000);
afterAll(async () => { await stop(); if (dir && path.resolve(dir).startsWith(path.resolve('.jamanvaar') + path.sep)) rmSync(dir, { recursive: true, force: true }); });
describe('running Local Core relay', () => {
  it('is reachable but refuses data and SSE until paired', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    for (const route of ['/api/sync', '/api/events', '/api/orders', '/devices']) expect((await fetch(`${base}${route}`)).status).toBe(401);
  });
  it('persists separate state for different restaurants and branches', async () => {
    const a = await pair(); const b = await pair('qa-b'); const branchB = await pair('qa-a', 'qa-branch-b');
    expect((await request(a, '/api/sync', 'POST', { orders: [{ id: 'qa-order-a' }], menuItems: [{ id: 'qa-menu-a' }] })).status).toBe(200);
    expect((await (await request(a, '/api/sync')).json()).orders[0].id).toBe('qa-order-a');
    for (const token of [b, branchB]) expect((await (await request(token, '/api/sync')).json()).orders).toEqual([]);
  });
  it('does not allow a token to be changed to access another scope', async () => {
    const token = await pair(); const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ restaurantId: 'qa-b', branchId: 'qa-branch-a' })).toString('base64url');
    expect((await request(parts.join('.'), '/api/sync')).status).toBe(401);
    expect((await fetch(`${base}/api/events?serviceKey=${encodeURIComponent(token)}`)).status).toBe(401);
  });
  it('delivers authenticated real-time events only within the paired branch', async () => {
    const a = await pair(); const b = await pair('qa-b');
    const abortA = new AbortController(); const abortB = new AbortController();
    try {
      const responseA = await fetch(`${base}/api/events`, { headers: { Authorization: `Bearer ${a}` }, signal: abortA.signal });
      const responseB = await fetch(`${base}/api/events`, { headers: { Authorization: `Bearer ${b}` }, signal: abortB.signal });
      expect(responseA.status).toBe(200); const readerA = responseA.body!.getReader(); const readerB = responseB.body!.getReader();
      await readerA.read(); await readerB.read();
      await request(a, '/api/sync', 'POST', { orders: [{ id: 'qa-order-a', orderStatus: 'READY', updatedAt: new Date().toISOString() }] });
      expect(new TextDecoder().decode((await readerA.read()).value)).toContain('READY');
      await request(b, '/api/sync', 'POST', { orders: [{ id: 'qa-order-b' }] });
      const bMessage = new TextDecoder().decode((await readerB.read()).value);
      expect(bMessage).toContain('qa-order-b'); expect(bMessage).not.toContain('qa-order-a');
    } finally { abortA.abort(); abortB.abort(); }
  });
  it('cannot change cloud entitlement or staff authorization through relay snapshots', async () => {
    const token = await pair(); await request(token, '/api/sync', 'POST', { license: { modules: { admin: true } }, roles: [{ id: 'owner' }], users: [{ id: 'intruder' }] });
    const state = await (await request(token, '/api/sync')).json(); expect(state.license).toBeUndefined(); expect(state.users).toBeUndefined(); expect(state.roles).toBeUndefined();
  });
  it('preserves final prices and rejects an older snapshot after a kitchen status change', async () => {
    const token = await pair('qa-finance');
    const order = { id: 'priced', createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', orderStatus: 'PREPARING', subtotal: 100, taxAmount: 18, totalAmount: 118, items: [] };
    await request(token, '/api/sync', 'POST', { orders: [order] });
    await request(token, '/api/orders/priced/status', 'PATCH', { status: 'READY' });
    await request(token, '/api/sync', 'POST', { orders: [order] });
    const latest = (await (await request(token, '/api/sync')).json()).orders[0];
    expect(latest.orderStatus).toBe('READY'); expect(latest.totalAmount).toBe(118); expect(latest.taxAmount).toBe(18);
  });
  it('distinguishes fresh relay state from a deliberate empty menu', async () => {
    const token = await pair('qa-menu');
    expect((await (await request(token, '/api/sync')).json())._relayInitialized).toBeUndefined();
    await request(token, '/api/sync', 'POST', { menuItems: [{ id: 'last-dish' }] });
    await request(token, '/api/sync', 'POST', { menuItems: [] });
    const state = await (await request(token, '/api/sync')).json();
    expect(state._relayInitialized).toBe(true); expect(state.menuItems).toEqual([]);
  });
  it('keeps persisted scoped tokens and order state valid after a server restart', async () => {
    const token = await pair(); await stop(); await start();
    const state = await (await request(token, '/api/sync')).json(); expect(state.orders.some((o: any) => o.id === 'qa-order-a')).toBe(true);
  });
  it('rate limits incorrect PIN guesses and never exposes the token over health', async () => {
    const wrong = pin === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await fetch(`${base}/devices/pair`, { method: 'POST', body: JSON.stringify({ pairingPin: wrong }) })).status).toBe(401);
    const locked = await fetch(`${base}/devices/pair`, { method: 'POST', body: JSON.stringify({ pairingPin: pin }) });
    expect(locked.status).toBe(429); expect(locked.headers.get('Retry-After')).toBeTruthy();
    const health = await (await fetch(`${base}/api/health`)).json(); expect(health.serviceKey).toBeUndefined(); expect(health.pairingPin).toBeUndefined();
  });
});

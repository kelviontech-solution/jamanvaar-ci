import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { db } from '../packages/database/src/db';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { connectionStatus, normaliseCoreUrl, probeCore, saveCoreUrl, collectDiagnostics } from '../packages/sync/src/diagnostics';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';
import { createServer } from '../packages/branch-core/src/server';

beforeEach(() => { EndpointResolver.reset(); EndpointResolver.configure({ cloudBase: 'https://cloud.example' }); db.orders.length = 0; db.syncEvents.length = 0; });
afterEach(() => { EndpointResolver.setCoreUrl(null); EndpointResolver.reset(); db.orders.length = 0; });

describe('connection status wording', () => {
  it('ONLINE when the cloud answered', async () => {
    await EndpointResolver.fetch('/api/v1/payments/orders', {}, (async () => new Response('{}', { status: 200 })) as never);
    expect(connectionStatus()).toMatchObject({ label: 'ONLINE ● Connected', tone: 'ok' });
  });
  it('LOCAL OFFLINE when only the core answers', async () => {
    EndpointResolver.configure({ cloudBase: 'https://cloud.example', coreUrl: 'http://core.local:5178' });
    await EndpointResolver.fetch('/api/v1/orders/sync', {}, (async (u: string) => { if (u.startsWith('https://cloud')) throw new TypeError('x'); return new Response('{}'); }) as never);
    expect(connectionStatus()).toMatchObject({ label: 'LOCAL OFFLINE ● Working locally', tone: 'local' });
  });
  it('SYNCING while changes are being sent, SYNC ERROR when some could not be', async () => {
    await EndpointResolver.fetch('/api/v1/payments/orders', {}, (async () => new Response('{}')) as never);
    db.orders.push({ id: 'p', syncStatus: 'SAVED_LOCALLY' } as never);
    expect(connectionStatus().label).toBe('SYNCING');
    db.orders.push({ id: 'f', syncStatus: 'FAILED' } as never);
    expect(connectionStatus()).toMatchObject({ label: 'SYNC ERROR ⚠', tone: 'error' });
  });
  it('with nothing reachable and changes waiting it says they are saved and will send automatically', async () => {
    await expect(EndpointResolver.fetch('/api/v1/orders/sync', {}, (async () => { throw new TypeError('x'); }) as never)).rejects.toThrow();
    db.orders.push({ id: 'p', syncStatus: 'SAVED_LOCALLY' } as never);
    const s = connectionStatus();
    expect(s.label).toBe('LOCAL OFFLINE ● Working locally');
    expect(s.detail).toMatch(/saved on this device/);
  });
});

describe('Branch Core address: typed or paired, never hard-coded', () => {
  it('normalises what people type', () => {
    expect(normaliseCoreUrl('192.168.1.10')).toBe('http://192.168.1.10:5178');
    expect(normaliseCoreUrl(' 192.168.1.10:6000 ')).toBe('http://192.168.1.10:6000');
    expect(normaliseCoreUrl('https://core.shop.local')).toBe('https://core.shop.local');
    expect(normaliseCoreUrl('')).toBeNull();
  });

  it('saves the address only when a real Branch Core answers there', async () => {
    const core = new BranchCore(new BranchStore(':memory:'), { restaurantId: 'r', branchId: 'b', branchCode: 'AHD' });
    const server = createServer(core);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = `127.0.0.1:${(server.address() as AddressInfo).port}`;

    const probe = await probeCore(addr);
    expect(probe).toMatchObject({ reachable: true, branchCode: 'AHD' });
    expect((await saveCoreUrl(addr)).saved).toBe(true);
    expect(EndpointResolver.getCoreUrl()).toBe(`http://${addr}`);
    expect(collectDiagnostics('1.0').coreUrl).toBe(`http://${addr}`);

    EndpointResolver.setCoreUrl(null);
    const notACore = http.createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"hello":1}'); });
    await new Promise<void>((r) => notACore.listen(0, '127.0.0.1', r));
    const bad = await saveCoreUrl(`127.0.0.1:${(notACore.address() as AddressInfo).port}`);
    expect(bad.saved).toBe(false);
    expect(bad.message).toMatch(/not a JAMANVAAR Branch Core/);
    expect((await saveCoreUrl('10.255.255.1:1')).saved).toBe(false);
    expect(EndpointResolver.getCoreUrl()).toBeNull();

    for (const s of [server, notACore]) await new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); });
    core.store.close();
  });
});

import { describe, it, expect } from 'vitest';
import { startDiscoveryResponder, discoverBranchCores } from '../packages/branch-core/src/discovery';

describe('Branch Core LAN discovery', () => {
  it('answers a probe with where it lives and nothing sensitive', async () => {
    const responder = await startDiscoveryResponder({ port: 0, httpPort: 5178, restaurantId: 'JM9876543210', branchCode: 'AHD', host: '192.168.1.20' });
    const found = await discoverBranchCores({ port: responder.port, address: '127.0.0.1', timeoutMs: 400 });
    responder.close();
    expect(found).toEqual([{ service: 'jamanvaar-branch-core', url: 'http://192.168.1.20:5178', restaurantId: 'JM9876543210', branchCode: 'AHD' }]);
    expect(Object.keys(found[0]).sort()).toEqual(['branchCode', 'restaurantId', 'service', 'url']);
  });

  it('finds nothing when no core is listening (the device falls back to its configured address)', async () => {
    const found = await discoverBranchCores({ port: 59999, address: '127.0.0.1', timeoutMs: 250 });
    expect(found).toEqual([]);
  });

  it('ignores traffic that is not a JAMANVAAR probe', async () => {
    const responder = await startDiscoveryResponder({ port: 0, httpPort: 5178, restaurantId: 'R', branchCode: 'B' });
    const dgram = await import('node:dgram');
    const s = dgram.createSocket('udp4');
    const got: string[] = [];
    s.on('message', (m) => got.push(m.toString()));
    await new Promise<void>((r) => s.bind(0, r));
    s.send('hello', responder.port, '127.0.0.1');
    await new Promise((r) => setTimeout(r, 200));
    s.close();
    responder.close();
    expect(got).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { probeCore } from '@jamanvaar/sync';

const answer = (restaurantId: string) =>
  (async () => new Response(JSON.stringify({ service: 'jamanvaar-branch-core', restaurantId, branchCode: 'B1', schemaVersion: 1 }), { status: 200 })) as unknown as typeof fetch;

describe('Branch Core pairing checks whose core it is (F-08)', () => {
  it('refuses a core that belongs to a different restaurant', async () => {
    const r = await probeCore('192.168.1.10:5178', 1000, answer('rest-other'), 'rest-mine');
    expect(r.reachable).toBe(false);
    expect(r.error).toMatch(/different restaurant/);
  });
  it('accepts its own restaurant\'s core, and any core when the device has no restaurant yet', async () => {
    expect((await probeCore('192.168.1.10:5178', 1000, answer('rest-mine'), 'rest-mine')).reachable).toBe(true);
    expect((await probeCore('192.168.1.10:5178', 1000, answer('rest-any'))).reachable).toBe(true);
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  assertBranchAccepting,
  branchServiceState,
  DEFAULT_SERVICE_POLICY,
  servicePolicySchema,
} from './operations-policy';
function db(policy: object | null, count = 0) {
  return {
    order: { findMany: vi.fn().mockResolvedValue([]) },
    syncedEntity: { findUnique: vi.fn().mockResolvedValue(policy ? { payload: policy } : null) },
    branch: { findFirst: vi.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
    syncedOrder: { count: vi.fn().mockResolvedValue(count) },
  } as any;
}
const now = new Date('2026-10-15T06:00:00Z');
describe('shared branch service policy', () => {
  it('reserves capacity for pending online kiosk checkouts', async () => {
    const tx = db({ ...DEFAULT_SERVICE_POLICY, maxPendingOrders: 1 });
    tx.order.findMany.mockResolvedValue([{ externalOrderId: 'checkout' }]);
    expect((await branchServiceState(tx, 'r', 'b', 'QR', now)).available).toBe(false);
  });
  it('does not count the same kiosk checkout twice after ingestion', async () => {
    const tx = db({ ...DEFAULT_SERVICE_POLICY, maxPendingOrders: 2 }, 1);
    tx.order.findMany.mockResolvedValue([{ externalOrderId: 'checkout' }]);
    tx.syncedOrder.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    expect((await branchServiceState(tx, 'r', 'b', 'KIOSK', now)).available).toBe(true);
  });
  it('preserves always-open behavior before configuration', async () => {
    expect((await branchServiceState(db(null), 'r', 'b', 'QR', now)).available).toBe(true);
  });
  it.each(['QR', 'KIOSK'] as const)('blocks a new %s order while paused', async (channel) => {
    expect(
      await branchServiceState(
        db({ ...DEFAULT_SERVICE_POLICY, pausedUntil: '2026-10-15T07:00:00Z', message: 'Kitchen break' }),
        'r',
        'b',
        channel,
        now,
      ),
    ).toMatchObject({ available: false, message: 'Kitchen break' });
  });
  it('does not apply policy to a channel the owner excluded', async () => {
    expect(
      (
        await branchServiceState(
          db({ ...DEFAULT_SERVICE_POLICY, channels: ['QR'], pausedUntil: '2026-10-15T07:00:00Z' }),
          'r',
          'b',
          'KIOSK',
          now,
        )
      ).available,
    ).toBe(true);
  });
  it('expires a temporary pause', async () => {
    expect(
      (
        await branchServiceState(
          db({ ...DEFAULT_SERVICE_POLICY, pausedUntil: '2026-10-15T05:59:59Z' }),
          'r',
          'b',
          'QR',
          now,
        )
      ).available,
    ).toBe(true);
  });
  it('checks branch-local opening hours', async () => {
    expect(
      (
        await branchServiceState(
          db({ ...DEFAULT_SERVICE_POLICY, hours: [{ day: 4, open: '12:00', close: '14:00' }] }),
          'r',
          'b',
          'QR',
          now,
        )
      ).available,
    ).toBe(false);
  });
  it('shares kitchen capacity across channels and scopes the query', async () => {
    const tx = db({ ...DEFAULT_SERVICE_POLICY, maxPendingOrders: 3 }, 3);
    expect((await branchServiceState(tx, 'r', 'b', 'KIOSK', now)).available).toBe(false);
    expect(tx.syncedOrder.count.mock.calls[0][0].where).toMatchObject({ restaurantId: 'r', branchId: 'b' });
  });
  it('allows the last available slot', async () => {
    expect(
      (
        await branchServiceState(
          db({ ...DEFAULT_SERVICE_POLICY, maxPendingOrders: 3 }, 2),
          'r',
          'b',
          'QR',
          now,
        )
      ).available,
    ).toBe(true);
  });
  it('rejects paused admission with a stable conflict code', async () => {
    await expect(
      assertBranchAccepting(
        db({ ...DEFAULT_SERVICE_POLICY, pausedUntil: new Date(Date.now() + 60000).toISOString() }),
        'r',
        'b',
        'QR',
      ),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_ORDERING_PAUSED' } });
  });
  it.each([
    { maxPendingOrders: -1 },
    { preparationMinutes: 0 },
    { channels: ['POS'] },
    { hours: [{ day: 7, open: '09:00', close: '18:00' }] },
    { hours: [{ day: 1, open: '99:00', close: '18:00' }] },
    { restaurantId: 'foreign' },
    { expectedVersion: -1 },
    { pausedUntil: 'tomorrow' },
  ])('rejects invalid settings %j', (patch) => {
    expect(
      servicePolicySchema.safeParse({ ...DEFAULT_SERVICE_POLICY, expectedVersion: 0, ...patch }).success,
    ).toBe(false);
  });
});

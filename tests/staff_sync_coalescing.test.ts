import { expect, it, vi } from 'vitest';
import { EntitySyncEngine } from '../packages/sync/src/entity_sync';
import { syncStaffUsers } from '../packages/sync/src/staff_sync';

it('a completed staff pull releases sign-in callers even when another invalidation is queued', async () => {
  let releaseFirst!: () => void, releaseSecond!: () => void;
  const firstGate = new Promise<void>(r => { releaseFirst = r; });
  const secondGate = new Promise<void>(r => { releaseSecond = r; });
  let started!: () => void;
  const firstStarted = new Promise<void>(r => { started = r; });
  const pull = vi.spyOn(EntitySyncEngine, 'catchUp').mockImplementationOnce(async () => { started();await firstGate;return { pulled: 0 }; }).mockImplementation(async () => { await secondGate;return { pulled: 0 }; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const first = syncStaffUsers({ push: false });
    await firstStarted;
    const overlapping = syncStaffUsers({ push: false });
    releaseFirst();
    await Promise.race([Promise.all([first, overlapping]),new Promise((_,reject) => { timer=setTimeout(() => reject(new Error('Completed staff pass is still waiting for a future pass')), 1000); })]);
    expect(pull).toHaveBeenCalledTimes(2);
  } finally {
    clearTimeout(timer);releaseFirst();releaseSecond();
    await syncStaffUsers({ push: false }).catch(() => undefined);
    pull.mockRestore();
  }
});

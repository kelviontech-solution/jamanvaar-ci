import { db, KeyValueStore, StaffRepository } from '@jamanvaar/database';
import type { User } from '@jamanvaar/types';
import { EntitySyncEngine } from './entity_sync';

const ACK_KEY = 'jamanvaar_staff_sync_ack_v2';
let inFlight: Promise<void> | null = null;
let again = false;
let pushNext = false;

export function pendingStaffChanges(): number {
  let acknowledged: Record<string, string> = {};
  try { acknowledged = JSON.parse(KeyValueStore.get(ACK_KEY) ?? '{}'); } catch { /* recover from cloud */ }
  return db.users.filter((user) => acknowledged[user.id] !== JSON.stringify(StaffRepository.toSyncPayload(user))).length;
}

export function syncStaffUsers(opts: { push: boolean }): Promise<void> {
  EntitySyncEngine.registerWakeUp('STAFF_USER', () => syncStaffUsers(opts));
  pushNext ||= opts.push;
  if (inFlight) { again = true; return inFlight; }
  inFlight = (async () => {
    do {
      again = false;
      const push = pushNext; pushNext = false;
      let acknowledged: Record<string, string> = {};
      try { acknowledged = JSON.parse(KeyValueStore.get(ACK_KEY) ?? '{}'); } catch { /* start over */ }
      await EntitySyncEngine.catchUp('STAFF_USER', (remote) => {
        StaffRepository.applyRemoteUser(remote.payload);
        const user = db.users.find((u) => u.id === remote.externalId);
        // Only acknowledge the server copy, never an unsent local edit which rejected it.
        if (user && user.updatedAt === remote.payload.updatedAt) acknowledged[user.id] = JSON.stringify(StaffRepository.toSyncPayload(user));
      });
      if (push) {
        const records = db.users.map((u) => ({ externalId: u.id, payload: StaffRepository.toSyncPayload(u) }))
          .filter((r) => acknowledged[r.externalId] !== JSON.stringify(r.payload));
        for (let i = 0; i < records.length; i += 200) {
          const batch = records.slice(i, i + 200);
          const result = await EntitySyncEngine.pushSnapshot('STAFF_USER', batch);
          if (result.failed || result.processed !== batch.length) break;
          batch.forEach((r) => { acknowledged[r.externalId] = JSON.stringify(r.payload); });
        }
      }
      KeyValueStore.set(ACK_KEY, JSON.stringify(acknowledged));
    } while (again);
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Every terminal login screen's PIN check: a plain `StaffRepository.verifyPin` only sees
 * whatever this device has already pulled, and that pull runs on its own ~15s tick (plus
 * whatever Restaurant Admin takes to push) — so a PIN issued seconds ago, tried on a
 * different device, looks exactly like a wrong PIN. This probes the already-local data
 * first (free, instant, the common case) without spending one of the 5 lockout strikes;
 * only on a miss does it pull once and check again, so the one real strike is charged
 * against the final, synced answer.
 */
export async function verifyPinWithSync(pin: string, restaurantId?: string, userId?: string): Promise<{ user: User; isManager: boolean } | null> {
  const first = await StaffRepository.verifyPin(pin, restaurantId, { countFailure: false, userId });
  if (first) return first;
  await syncStaffUsers({ push: false }).catch(() => undefined);
  return StaffRepository.verifyPin(pin, restaurantId, { userId });
}

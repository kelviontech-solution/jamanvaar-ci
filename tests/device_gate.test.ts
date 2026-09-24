import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceGate } from '@jamanvaar/sync';

/**
 * BUG-049 / BUG-068 / BUG-077: terminals ignored every refusal from the cloud
 * and opened from a stored token, so disabling an app, locking or revoking a
 * device changed nothing on screen. DeviceGate turns those refusals (and a
 * heartbeat that says "locked", and being offline for too long) into a lock
 * state the app shows as a lock screen.
 */
describe('DeviceGate', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    DeviceGate.reset();
    DeviceGate.consumeDisconnectReason(); // drain any reason left over from a previous test
  });

  it('starts unlocked', () => {
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('locks on a refusal that carries a known reason code', async () => {
    await DeviceGate.observe(json(403, { code: 'APP_DISABLED', message: 'POS is not enabled for this restaurant.' }));
    const s = DeviceGate.getState();
    expect(s.locked).toBe(true);
    expect(s.code).toBe('APP_DISABLED');
    expect(s.message).toMatch(/not enabled/);
  });

  it('keeps the lock reason for a MDM lock', async () => {
    await DeviceGate.observe(json(403, { code: 'DEVICE_LOCKED', message: 'Locked by admin.', reason: 'Stolen terminal' }));
    expect(DeviceGate.getState().reason).toBe('Stolen terminal');
  });

  // BUG-145 follow-up: a revoked device (or any rejected credential — see below) is this ONE terminal's own
  // saved sign-in going bad, fixed in seconds by activating again, not a decision about the restaurant. It
  // must never block the screen — see the identity-invalid tests further down.
  it('a revoked device (401) does not lock the terminal', async () => {
    DeviceGate.onIdentityInvalid(() => undefined);
    await DeviceGate.observe(json(401, { code: 'DEVICE_REVOKED', message: 'Revoked.' }));
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('does not lock on a refusal without a known code (an ordinary permission error)', async () => {
    await DeviceGate.observe(json(403, { message: 'Forbidden resource' }));
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('does not lock on an unrelated code', async () => {
    await DeviceGate.observe(json(403, { code: 'SOMETHING_ELSE' }));
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('a successful cloud response clears a cloud-imposed lock and records the check-in', async () => {
    await DeviceGate.observe(json(403, { code: 'SUBSCRIPTION_INACTIVE', message: 'No subscription.' }));
    expect(DeviceGate.getState().locked).toBe(true);
    await DeviceGate.observe(json(200, { ok: true }));
    expect(DeviceGate.getState().locked).toBe(false);
    expect(DeviceGate.getState().lastCheckInAt).toBeTruthy();
  });

  it('a heartbeat that says locked locks with its reason, and one that says unlocked releases it', () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: true, lockReason: 'Under investigation' });
    expect(DeviceGate.getState().locked).toBe(true);
    expect(DeviceGate.getState().code).toBe('DEVICE_LOCKED');
    expect(DeviceGate.getState().reason).toBe('Under investigation');

    DeviceGate.applyHeartbeat({ ok: true, locked: false, lockReason: null });
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('a heartbeat that says the branch was deactivated locks with the branch reason (BUG-048)', () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: true, lockCode: 'BRANCH_INACTIVE', lockReason: 'Branch "Closing Branch" has been deactivated.' });
    expect(DeviceGate.getState()).toMatchObject({ locked: true, code: 'BRANCH_INACTIVE', reason: 'Branch "Closing Branch" has been deactivated.' });
    DeviceGate.applyHeartbeat({ ok: true, locked: false, lockReason: null });
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('a refused call carrying BRANCH_INACTIVE locks the terminal', async () => {
    await DeviceGate.observe(json(403, { code: 'BRANCH_INACTIVE', message: 'This branch has been deactivated.' }));
    expect(DeviceGate.getState()).toMatchObject({ locked: true, code: 'BRANCH_INACTIVE' });
  });

  it('locks after the offline grace period without any successful check-in', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    DeviceGate.setLastCheckIn(eightDaysAgo);
    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState().locked).toBe(true);
    expect(DeviceGate.getState().code).toBe('OFFLINE_LIMIT');
  });

  it('does not lock inside the offline grace period, or before the first ever check-in', () => {
    DeviceGate.setLastCheckIn(new Date(Date.now() - 2 * 86400000).toISOString());
    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState().locked).toBe(false);

    DeviceGate.reset();
    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('an offline-limit lock is released by the next successful check-in', async () => {
    DeviceGate.setLastCheckIn(new Date(Date.now() - 9 * 86400000).toISOString());
    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState().locked).toBe(true);
    await DeviceGate.observe(json(200, { ok: true }));
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('an unlocked heartbeat releases an offline-limit lock (the cloud accepted this device)', () => {
    DeviceGate.setLastCheckIn(new Date(Date.now() - 9 * 86400000).toISOString());
    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState().locked).toBe(true);
    DeviceGate.applyHeartbeat({ ok: true, locked: false, lockReason: null });
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('a locked terminal is still allowed to call /devices/me, and that success must not clear the lock', async () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: true, lockReason: 'Stolen' });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => json(200, { ok: true, locked: true })) as typeof fetch;
    try {
      await DeviceGate.gatedFetch('http://x/api/v1/devices/me/heartbeat', { method: 'PATCH' });
      expect(DeviceGate.getState().locked).toBe(true);
      // any other endpoint succeeding proves the terminal is allowed again
      await DeviceGate.gatedFetch('http://x/api/v1/orders/sync');
      expect(DeviceGate.getState().locked).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('notifies subscribers when the state changes', async () => {
    let calls = 0;
    const unsub = DeviceGate.subscribe(() => calls++);
    await DeviceGate.observe(json(403, { code: 'APP_DISABLED', message: 'x' }));
    expect(calls).toBeGreaterThanOrEqual(1);
    unsub();
    const before = calls;
    await DeviceGate.observe(json(200, {}));
    expect(calls).toBe(before);
  });

  // BUG-143: an unrelated successful call used to clear a mandatory-update lock, and the next heartbeat
  // locked it again, so the screen popped up and vanished on its own.
  it('a mandatory-update lock is NOT cleared by an unrelated successful call (BUG-143)', async () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: false, update: { latestVersion: '2.0.0', mandatory: true, downloadUrl: null, releaseNotes: null } as never });
    expect(DeviceGate.getState()).toMatchObject({ locked: true, code: 'UPDATE_REQUIRED' });
    await DeviceGate.observe(json(200, { ok: true }));
    expect(DeviceGate.getState()).toMatchObject({ locked: true, code: 'UPDATE_REQUIRED' });
  });

  it('a mandatory-update lock is cleared only by a heartbeat that no longer asks for it (BUG-143)', () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: false, update: { latestVersion: '2.0.0', mandatory: true, downloadUrl: null, releaseNotes: null } as never });
    expect(DeviceGate.getState().locked).toBe(true);
    DeviceGate.applyHeartbeat({ ok: true, locked: false, update: null });
    expect(DeviceGate.getState().locked).toBe(false);
  });

  // BUG-145: the cloud refuses an unknown/inactive device credential with INVALID_DEVICE_CREDENTIAL, which
  // was not a lock code at all, so the terminal kept showing stale data with no sign it had lost the cloud.
  //
  // BUG-145 follow-up: locking the whole screen for this was itself wrong — a restaurant mid-service must
  // never be walled off by something a fresh activation key fixes in seconds, and there was no way back to
  // the activation screen from behind the lock at all ("going round and round"). It is now handled
  // automatically: the app that registered `onIdentityInvalid` unbinds itself and reloads into its own
  // ordinary activation screen, which explains why via `consumeDisconnectReason()` — never a lock screen.
  describe('a rejected device credential (BUG-145 follow-up: never locks, always self-heals)', () => {
    it('does not lock the terminal', async () => {
      DeviceGate.onIdentityInvalid(() => undefined);
      await DeviceGate.observe(json(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'Invalid device credential.' }));
      expect(DeviceGate.getState().locked).toBe(false);
    });

    it('calls the app-registered handler exactly once, and remembers why for the activation screen', async () => {
      let calls = 0;
      DeviceGate.onIdentityInvalid(() => { calls++; });
      await DeviceGate.observe(json(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'Invalid device credential.' }));
      expect(calls).toBe(1);
      expect(DeviceGate.consumeDisconnectReason()).toMatch(/re-?activate/i);
    });

    it('does not call the handler again for further 401s on the way out (the app is already reloading)', async () => {
      let calls = 0;
      DeviceGate.onIdentityInvalid(() => { calls++; });
      await DeviceGate.observe(json(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'x' }));
      await DeviceGate.observe(json(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'x' }));
      await DeviceGate.observe(json(401, { code: 'DEVICE_REVOKED', message: 'x' }));
      expect(calls).toBe(1);
    });

    it('a fresh reset() (a real reload landing on the activation screen) allows the next invalid credential to be handled again', async () => {
      let calls = 0;
      DeviceGate.onIdentityInvalid(() => { calls++; });
      await DeviceGate.observe(json(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'x' }));
      DeviceGate.reset();
      await DeviceGate.observe(json(401, { code: 'INVALID_DEVICE_CREDENTIAL', message: 'x' }));
      expect(calls).toBe(2);
    });

    it('the disconnect reason is read once and then gone (DEVICE_REVOKED passes through the server message)', async () => {
      DeviceGate.onIdentityInvalid(() => undefined);
      await DeviceGate.observe(json(401, { code: 'DEVICE_REVOKED', message: 'Please re-activate.' }));
      expect(DeviceGate.consumeDisconnectReason()).toBe('Please re-activate.');
      expect(DeviceGate.consumeDisconnectReason()).toBeNull();
    });
  });
});

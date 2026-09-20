import { describe, it, expect, beforeEach } from 'vitest';
import { AppUpdate, DeviceGate, verifyOfflineExtension } from '@jamanvaar/sync';

/**
 * BUG-065 / 076 / 077: publishing a release changed nothing on any terminal, an emergency offline
 * extension was never delivered or checked, and the signing key had no id, so it could not be rotated.
 */
const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { privateKey: pair.privateKey, publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) };
}

async function sign(privateKey: CryptoKey, payload: object) {
  const json = JSON.stringify(payload);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(json));
  return { payload: b64url(new TextEncoder().encode(json)), signature: b64url(sig) };
}

const soon = () => new Date(Date.now() + 3 * 86400_000).toISOString();
const extPayload = (over: object = {}) => ({
  type: 'EMERGENCY_OFFLINE_EXTENSION', restaurantId: 'rest-1', branchId: null, deviceId: null, extensionDays: 3,
  validFrom: new Date().toISOString(), validUntil: soon(), approvedBy: 'admin@x.com', reason: 'fibre cut', ...over
});

describe('AppUpdate', () => {
  beforeEach(() => AppUpdate.reset());

  it('shows an optional update, and hides it once dismissed until a newer version appears', () => {
    AppUpdate.apply({ latestVersion: '2.0.0', mandatory: false, downloadUrl: 'https://x/2.exe', releaseNotes: null });
    expect(AppUpdate.getVisible()).toMatchObject({ latestVersion: '2.0.0' });

    AppUpdate.dismiss();
    expect(AppUpdate.getVisible()).toBeNull();
    AppUpdate.apply({ latestVersion: '2.0.0', mandatory: false, downloadUrl: null, releaseNotes: null });
    expect(AppUpdate.getVisible()).toBeNull(); // same version: stays dismissed

    AppUpdate.apply({ latestVersion: '2.1.0', mandatory: false, downloadUrl: null, releaseNotes: null });
    expect(AppUpdate.getVisible()).toMatchObject({ latestVersion: '2.1.0' });
  });

  it('clears when the terminal is current', () => {
    AppUpdate.apply({ latestVersion: '2.0.0', mandatory: false, downloadUrl: null, releaseNotes: null });
    AppUpdate.apply(null);
    expect(AppUpdate.getVisible()).toBeNull();
  });

  it('a mandatory update cannot be dismissed', () => {
    AppUpdate.apply({ latestVersion: '3.0.0', mandatory: true, downloadUrl: null, releaseNotes: null });
    AppUpdate.dismiss();
    expect(AppUpdate.getVisible()).toMatchObject({ mandatory: true });
  });
});

describe('DeviceGate and updates', () => {
  beforeEach(() => {
    DeviceGate.reset();
    AppUpdate.reset();
  });

  it('a mandatory update locks the terminal with the version and download link, and releases once current', () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: false, update: { latestVersion: '3.0.0', mandatory: true, downloadUrl: 'https://x/3.exe', releaseNotes: null } });
    expect(DeviceGate.getState()).toMatchObject({ locked: true, code: 'UPDATE_REQUIRED' });
    expect(DeviceGate.getState().reason).toContain('3.0.0');
    expect(DeviceGate.getState().reason).toContain('https://x/3.exe');

    DeviceGate.applyHeartbeat({ ok: true, locked: false, update: null });
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('an optional update never locks the terminal', () => {
    DeviceGate.applyHeartbeat({ ok: true, locked: false, update: { latestVersion: '3.0.0', mandatory: false, downloadUrl: null, releaseNotes: null } });
    expect(DeviceGate.getState().locked).toBe(false);
    expect(AppUpdate.getVisible()).toMatchObject({ latestVersion: '3.0.0' });
  });
});

describe('verifyOfflineExtension (BUG-077) with key ids (BUG-076)', () => {
  it('accepts a genuine, unexpired extension and returns its payload', async () => {
    const { privateKey, publicJwk } = await keyPair();
    const signed = await sign(privateKey, extPayload({ kid: 'k1' }));
    const r = await verifyOfflineExtension(signed.payload, signed.signature, { keys: [{ kid: 'k1', jwk: publicJwk }] });
    expect(r).toMatchObject({ type: 'EMERGENCY_OFFLINE_EXTENSION', restaurantId: 'rest-1' });
  });

  it('rejects a tampered payload, a signature from another key, an expired one, and the wrong type', async () => {
    const good = await keyPair();
    const other = await keyPair();
    const keys = [{ kid: 'k1', jwk: good.publicJwk }];

    const signed = await sign(good.privateKey, extPayload({ kid: 'k1' }));
    const forgedPayload = b64url(new TextEncoder().encode(JSON.stringify(extPayload({ kid: 'k1', validUntil: new Date(Date.now() + 999 * 86400_000).toISOString() }))));
    expect(await verifyOfflineExtension(forgedPayload, signed.signature, { keys })).toBeNull();

    const foreign = await sign(other.privateKey, extPayload({ kid: 'k1' }));
    expect(await verifyOfflineExtension(foreign.payload, foreign.signature, { keys })).toBeNull();

    const expired = await sign(good.privateKey, extPayload({ kid: 'k1', validUntil: new Date(Date.now() - 1000).toISOString() }));
    expect(await verifyOfflineExtension(expired.payload, expired.signature, { keys })).toBeNull();

    const wrongType = await sign(good.privateKey, extPayload({ kid: 'k1', type: 'SOMETHING_ELSE' }));
    expect(await verifyOfflineExtension(wrongType.payload, wrongType.signature, { keys })).toBeNull();
  });

  it('rotates: the new key verifies by its kid, the old one still verifies old certificates, and an unknown kid falls back to trying every key', async () => {
    const oldPair = await keyPair();
    const newPair = await keyPair();
    const keys = [{ kid: 'k1', jwk: oldPair.publicJwk }, { kid: 'k2', jwk: newPair.publicJwk }];

    const signedNew = await sign(newPair.privateKey, extPayload({ kid: 'k2' }));
    expect(await verifyOfflineExtension(signedNew.payload, signedNew.signature, { keys })).not.toBeNull();

    const signedOld = await sign(oldPair.privateKey, extPayload({ kid: 'k1' }));
    expect(await verifyOfflineExtension(signedOld.payload, signedOld.signature, { keys })).not.toBeNull();

    // Certificates from before key ids existed carry no kid.
    const noKid = await sign(oldPair.privateKey, extPayload());
    expect(await verifyOfflineExtension(noKid.payload, noKid.signature, { keys })).not.toBeNull();
  });
});

describe('DeviceGate offline extension (BUG-077)', () => {
  beforeEach(() => DeviceGate.reset());

  it('lifts the offline lock for the length of a verified extension, and locks again when it ends', async () => {
    const { privateKey, publicJwk } = await keyPair();
    DeviceGate.configureTrustedKeys([{ kid: 'k1', jwk: publicJwk }]);
    const nineDaysAgo = new Date(Date.now() - 9 * 86400_000).toISOString();

    DeviceGate.setLastCheckIn(nineDaysAgo);
    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState()).toMatchObject({ locked: true, code: 'OFFLINE_LIMIT' });

    const signed = await sign(privateKey, extPayload({ kid: 'k1' }));
    const ok = await DeviceGate.applyExtension({ payload: signed.payload, signature: signed.signature, validUntil: soon() }, { restaurantId: 'rest-1' });
    expect(ok).toBe(true);
    expect(DeviceGate.getState().locked).toBe(false);

    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState().locked).toBe(false); // still inside the extension

    DeviceGate.evaluateOffline(Date.now() + 4 * 86400_000, 7); // past the extension's end
    expect(DeviceGate.getState()).toMatchObject({ locked: true, code: 'OFFLINE_LIMIT' });
  });

  it('ignores an extension that is forged, or issued for another restaurant', async () => {
    const { privateKey, publicJwk } = await keyPair();
    DeviceGate.configureTrustedKeys([{ kid: 'k1', jwk: publicJwk }]);
    DeviceGate.setLastCheckIn(new Date(Date.now() - 9 * 86400_000).toISOString());
    DeviceGate.evaluateOffline(Date.now(), 7);

    const elsewhere = await sign(privateKey, extPayload({ kid: 'k1', restaurantId: 'someone-else' }));
    expect(await DeviceGate.applyExtension({ payload: elsewhere.payload, signature: elsewhere.signature, validUntil: soon() }, { restaurantId: 'rest-1' })).toBe(false);

    const good = await sign(privateKey, extPayload({ kid: 'k1' }));
    expect(await DeviceGate.applyExtension({ payload: good.payload, signature: 'AAAA' + good.signature.slice(4), validUntil: soon() }, { restaurantId: 'rest-1' })).toBe(false);
    expect(DeviceGate.getState().locked).toBe(true);
  });

  it('is told about the extension in the heartbeat answer', async () => {
    const { privateKey, publicJwk } = await keyPair();
    DeviceGate.configureTrustedKeys([{ kid: 'k1', jwk: publicJwk }]);
    DeviceGate.setLastCheckIn(new Date(Date.now() - 9 * 86400_000).toISOString());
    DeviceGate.evaluateOffline(Date.now(), 7);
    const signed = await sign(privateKey, extPayload({ kid: 'k1' }));

    await DeviceGate.applyHeartbeatAsync({ ok: true, locked: false, extension: { payload: signed.payload, signature: signed.signature, validUntil: soon() } }, { restaurantId: 'rest-1' });
    expect(DeviceGate.getState().graceUntil).toBeTruthy();
  });
});

describe('DeviceGate pasted extension code (BUG-077)', () => {
  beforeEach(() => DeviceGate.reset());

  it('accepts a code an operator pastes while offline, using the restaurant remembered from earlier heartbeats', async () => {
    const { privateKey, publicJwk } = await keyPair();
    DeviceGate.configureTrustedKeys([{ kid: 'k1', jwk: publicJwk }]);
    // An earlier heartbeat told the gate which restaurant this terminal belongs to.
    await DeviceGate.applyHeartbeatAsync({ ok: true, locked: false }, { restaurantId: 'rest-1' });
    DeviceGate.setLastCheckIn(new Date(Date.now() - 9 * 86400_000).toISOString());
    DeviceGate.evaluateOffline(Date.now(), 7);
    expect(DeviceGate.getState().locked).toBe(true);

    const signed = await sign(privateKey, extPayload({ kid: 'k1' }));
    expect(await DeviceGate.applyExtensionCode(`${signed.payload}.${signed.signature}`)).toEqual({ ok: true });
    expect(DeviceGate.getState().locked).toBe(false);
  });

  it('explains why a code was refused', async () => {
    const { privateKey, publicJwk } = await keyPair();
    DeviceGate.configureTrustedKeys([{ kid: 'k1', jwk: publicJwk }]);
    expect(await DeviceGate.applyExtensionCode('not a code')).toMatchObject({ ok: false, reason: expect.stringMatching(/format/i) });

    const signed = await sign(privateKey, extPayload({ kid: 'k1' }));
    // Nothing remembered about which restaurant this terminal is: cannot tell whose code it is.
    expect(await DeviceGate.applyExtensionCode(`${signed.payload}.${signed.signature}`)).toMatchObject({ ok: false, reason: expect.stringMatching(/activated/i) });

    await DeviceGate.applyHeartbeatAsync({ ok: true, locked: false }, { restaurantId: 'rest-1' });
    expect(await DeviceGate.applyExtensionCode(`${signed.payload}.AAAA${signed.signature.slice(4)}`)).toMatchObject({ ok: false, reason: expect.stringMatching(/valid|signature|expired|restaurant/i) });
  });
});

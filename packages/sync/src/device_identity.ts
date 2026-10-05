/**
 * Device-bound keys for every terminal (POS, POS Admin, Captain, KDS, Kiosk, Kiosk Admin). A terminal generates an
 * ECDSA P-256 key pair in the browser the first time it runs, keeps it as a non-extractable IndexedDB-stored
 * CryptoKey for as long as this profile exists, and sends only the public half to the server once, at activation.
 * Every call this module signs after that proves it came from that one browser profile: nothing exfiltrated by
 * copying the device's bearer token (a plain string) can reproduce a signature, because the private key that
 * produces one never leaves this device and is never exported by this code.
 *
 * Shared by every terminal app (not duplicated per app) so cloud/api's DeviceSignatureGuard only has to verify one
 * canonical signing scheme, whichever device type sent the request.
 */

const DB_NAME = 'jamanvaar-device-keys';
const STORE = 'keys';

export interface DeviceKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}

const cache = new Map<string, DeviceKeyPair | null>();

function supported(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Returns this terminal's key pair for the given device type, generating and persisting one the first time it is
 * called for that type. Keyed by device type (not shared) so, for example, a combined POS+POS Admin browser
 * profile keeps two independent identities. Returns null on a browser with no WebCrypto/IndexedDB — requests then
 * go unsigned, exactly like a terminal activated before this shipped; the server only requires a signature from a
 * device whose public key it actually has on file.
 */
export async function getOrCreateDeviceKeyPair(deviceType: string): Promise<DeviceKeyPair | null> {
  if (!supported()) return null;
  if (cache.has(deviceType)) return cache.get(deviceType) ?? null;
  const record = `kiosk-keypair:${deviceType}`;
  try {
    const stored = await idbGet<CryptoKeyPair>(record);
    if (stored?.privateKey && stored.publicKey) {
      const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', stored.publicKey);
      const pair = { publicKeyJwk, privateKey: stored.privateKey };
      cache.set(deviceType, pair);
      return pair;
    }
    // extractable: true only so the *public* half can be exported once, below, to send to the server — the private
    // key is never exported by this code, and nothing here hands it to any caller.
    const generated = await window.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    await idbSet(record, generated);
    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', generated.publicKey);
    const pair = { publicKeyJwk, privateKey: generated.privateKey };
    cache.set(deviceType, pair);
    return pair;
  } catch (err) {
    console.error(`Device key pair unavailable for ${deviceType}; requests will go unsigned:`, err);
    cache.set(deviceType, null);
    return null;
  }
}

/** This terminal's public key for the given device type, to send once at activation. Null when unsupported. */
export async function getDevicePublicKeyJwk(deviceType: string): Promise<JsonWebKey | null> {
  const pair = await getOrCreateDeviceKeyPair(deviceType);
  return pair?.publicKeyJwk ?? null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await window.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64FromBuffer(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Signs one request: `${method}\n${path}\n${timestamp}\n${sha256Hex(body)}`, over the exact body bytes about to be
 * sent — never a re-serialization, since that could drift (key order, whitespace) from what the server hashes.
 * Returns null when this device type has no key pair, in which case the caller sends the request unsigned.
 */
export async function signDeviceRequest(deviceType: string, method: string, path: string, body: string): Promise<{ signature: string; timestamp: string } | null> {
  const pair = await getOrCreateDeviceKeyPair(deviceType);
  if (!pair) return null;
  const encoder = new TextEncoder();
  const timestamp = String(Date.now());
  const bodyHash = await sha256Hex(encoder.encode(body));
  const payload = encoder.encode(`${method}\n${path}\n${timestamp}\n${bodyHash}`);
  const signatureBuf = await window.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, payload as BufferSource);
  return { signature: base64FromBuffer(signatureBuf), timestamp };
}

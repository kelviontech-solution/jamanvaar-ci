/**
 * Device-bound keys for payment requests. The terminal generates an ECDSA P-256 key pair in the browser the first
 * time it runs, keeps the key pair (as an IndexedDB-stored CryptoKey object, not exportable bytes) for as long as
 * this profile exists, and sends only the public half to the server once, at activation. From then on, every
 * payment request is signed with the private key, which never leaves this device.
 *
 * This is what makes a copied device token alone useless against the payment routes: DeviceSignatureGuard on the
 * server refuses a request from this device's token unless it also carries a signature the registered public key
 * verifies, and nothing exfiltrated by copying the token (a string) can reproduce that signature.
 */

const DB_NAME = 'jamanvaar-device-keys';
const STORE = 'keys';
const KEY_RECORD = 'kiosk-keypair';

interface DeviceKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}

let cached: DeviceKeyPair | null | undefined;

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
 * Returns this terminal's key pair, generating and persisting one the first time it is called. Returns null on a
 * browser with no WebCrypto/IndexedDB (payment requests then go unsigned, exactly like a terminal activated before
 * this shipped — the server only requires a signature from a device whose public key it actually has on file).
 */
export async function getOrCreateDeviceKeyPair(): Promise<DeviceKeyPair | null> {
  if (!supported()) return null;
  if (cached !== undefined) return cached;
  try {
    const stored = await idbGet<CryptoKeyPair>(KEY_RECORD);
    if (stored?.privateKey && stored.publicKey) {
      const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', stored.publicKey);
      cached = { publicKeyJwk, privateKey: stored.privateKey };
      return cached;
    }
    // extractable: true only so the *public* half can be exported once, below, to send to the server — the private
    // key is never exported by this code, and nothing here hands it to any caller.
    const pair = await window.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    await idbSet(KEY_RECORD, pair);
    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', pair.publicKey);
    cached = { publicKeyJwk, privateKey: pair.privateKey };
    return cached;
  } catch (err) {
    console.error('Device key pair unavailable; payment requests will go unsigned:', err);
    cached = null;
    return null;
  }
}

/** This terminal's public key, to send once at activation. Null when WebCrypto/IndexedDB is unavailable. */
export async function getDevicePublicKeyJwk(): Promise<JsonWebKey | null> {
  const pair = await getOrCreateDeviceKeyPair();
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
 * Signs one request: the same canonical string DeviceSignatureGuard recomputes server-side
 * (`${method}\n${path}\n${timestamp}\n${sha256Hex(body)}`), over the exact body bytes about to be sent — never a
 * re-serialization, since that could drift (key order, whitespace) from what the server actually hashes.
 * Returns null when this device has no key pair, in which case the caller sends the request unsigned.
 */
export async function signDeviceRequest(method: string, path: string, body: string): Promise<{ signature: string; timestamp: string } | null> {
  const pair = await getOrCreateDeviceKeyPair();
  if (!pair) return null;
  const encoder = new TextEncoder();
  const timestamp = String(Date.now());
  const bodyHash = await sha256Hex(encoder.encode(body));
  const payload = encoder.encode(`${method}\n${path}\n${timestamp}\n${bodyHash}`);
  const signatureBuf = await window.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, payload as BufferSource);
  return { signature: base64FromBuffer(signatureBuf), timestamp };
}

import type { DurableRecoverySnapshot } from './sql_kv_engine';

const FORMAT = 'jamanvaar-protected-local-recovery';
const ITERATIONS = 600_000;
const MAX_BYTES = 64 * 1024 * 1024;
const encoder = new TextEncoder();

interface ProtectedRecovery {
  format: typeof FORMAT;
  version: 1;
  scope: string;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
}

function cryptoPort(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) throw new Error('Secure backup encryption is unavailable on this device.');
  return globalThis.crypto;
}
function encode(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16_384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return btoa(binary);
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function keyFor(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const port = cryptoPort();
  const input = await port.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return port.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: salt as BufferSource }, input,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function aad(scope: string): Uint8Array { return encoder.encode(JSON.stringify([FORMAT, 1, scope, ITERATIONS])); }
function assertSnapshot(snapshot: DurableRecoverySnapshot, scope: string): void {
  if (snapshot?.format !== 'jamanvaar-local-recovery' || snapshot.version !== 1 || snapshot.scope !== scope ||
      !snapshot.values || typeof snapshot.values !== 'object' || Array.isArray(snapshot.values) || !Array.isArray(snapshot.commands) ||
      Object.values(snapshot.values).some(value => typeof value !== 'string')) throw new Error('Invalid complete local recovery snapshot.');
}

/** Never returns plaintext keys/customer data to a download caller. Passwords are not stored. */
export async function protectRecovery(snapshot: DurableRecoverySnapshot, passphrase: string): Promise<string> {
  if (passphrase.length < 12 || passphrase.length > 1024) throw new Error('Use a recovery passphrase between 12 and 1024 characters.');
  if (!snapshot.scope || snapshot.scope.length > 256) throw new Error('A valid recovery scope is required.');
  assertSnapshot(snapshot, snapshot.scope);
  const plain = encoder.encode(JSON.stringify(snapshot));
  if (plain.byteLength > MAX_BYTES) throw new Error('This local snapshot exceeds the supported recovery file size.');
  const salt = cryptoPort().getRandomValues(new Uint8Array(16)), iv = cryptoPort().getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoPort().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(snapshot.scope) as BufferSource, tagLength: 128 }, await keyFor(passphrase, salt), plain);
  const envelope: ProtectedRecovery = { format: FORMAT, version: 1, scope: snapshot.scope, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    cipher: 'AES-256-GCM', salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
  return JSON.stringify(envelope);
}

/** Decrypt/verify only; installing recovery still requires a separate empty-target transaction. */
export async function unprotectRecovery(file: string, passphrase: string, expectedScope: string): Promise<DurableRecoverySnapshot> {
  if (file.length > MAX_BYTES * 1.5 || passphrase.length < 12 || passphrase.length > 1024) throw new Error('Invalid recovery file size or passphrase.');
  const envelope = JSON.parse(file) as ProtectedRecovery;
  if (!envelope || envelope.format !== FORMAT || envelope.version !== 1 || envelope.scope !== expectedScope || !expectedScope ||
      envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS || envelope.cipher !== 'AES-256-GCM' ||
      typeof envelope.salt !== 'string' || envelope.salt.length !== 24 || typeof envelope.iv !== 'string' || envelope.iv.length !== 16 ||
      typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length < 24) throw new Error('Recovery format or restaurant/branch scope does not match.');
  try {
    const salt = decode(envelope.salt), iv = decode(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw Error('Invalid encryption parameters');
    const plain = await cryptoPort().subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(expectedScope) as BufferSource, tagLength: 128 },
      await keyFor(passphrase, salt), decode(envelope.ciphertext) as BufferSource);
    if (plain.byteLength > MAX_BYTES) throw Error('Recovery data too large');
    const snapshot = JSON.parse(new TextDecoder().decode(plain)) as DurableRecoverySnapshot;
    assertSnapshot(snapshot, expectedScope);
    return snapshot;
  } catch { throw new Error('The passphrase is incorrect or this recovery file is damaged. No data was changed.'); }
}

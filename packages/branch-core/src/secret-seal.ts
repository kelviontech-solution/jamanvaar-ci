import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { protectWindowsKey } from './windows-key-protection';

/**
 * The cloud credential of a branch must not sit readable inside the database file (which is copied by backups, support bundles and
 * disk images). It is sealed with AES-256-GCM under a key kept in a separate owner-only file. This protects the database file when it
 * travels on its own. Windows also seals the key with the current user's DPAPI; access to the logged-in OS account remains privileged.
 */
const PREFIX = 'enc1:';

function keyFor(dataDir: string): Buffer {
  const file = path.join(dataDir, 'core.key');
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim();
    if (stored.startsWith('dpapi1:')) return protectWindowsKey(Buffer.from(stored.slice(7), 'base64'), true);
    const key = Buffer.from(stored, 'base64');
    if (key.length !== 32) throw new Error('Invalid Branch Core encryption key');
    // Migrate legacy keys without changing the AES key, so existing encrypted values remain readable.
    if (process.platform === 'win32') writeFileSync(file, 'dpapi1:' + protectWindowsKey(key).toString('base64'), { mode: 0o600 });
    return key;
  }
  const key = randomBytes(32);
  const stored = process.platform === 'win32' ? 'dpapi1:' + protectWindowsKey(key).toString('base64') : key.toString('base64');
  try { writeFileSync(file, stored, { mode: 0o600, flag: 'wx' }); }
  catch (err) { if ((err as NodeJS.ErrnoException).code === 'EEXIST') return keyFor(dataDir); throw err; }
  try { chmodSync(file, 0o600); } catch { /* best effort */ }
  return key;
}

export function sealSecret(dataDir: string, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFor(dataDir), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

/** Reads a sealed value; a value stored before sealing existed (no prefix) is returned as is. */
export function openSecret(dataDir: string, stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const d = createDecipheriv('aes-256-gcm', keyFor(dataDir), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

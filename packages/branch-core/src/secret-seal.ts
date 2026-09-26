import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The cloud credential of a branch must not sit readable inside the database file (which is copied by backups, support bundles and
 * disk images). It is sealed with AES-256-GCM under a key kept in a separate owner-only file. This protects the database file when it
 * travels on its own; someone with the whole data directory on a logged-in machine is out of scope (that needs the OS keystore).
 */
const PREFIX = 'enc1:';

function keyFor(dataDir: string): Buffer {
  const file = path.join(dataDir, 'core.key');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64'), { mode: 0o600 });
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

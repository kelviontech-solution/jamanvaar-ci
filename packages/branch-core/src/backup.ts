import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BranchStore, SCHEMA_VERSION } from './store';

/**
 * Encrypted local backups of the Branch Core database.
 *
 * A backup is a consistent SQLite snapshot (VACUUM INTO, safe while the core is running) encrypted with
 * AES-256-GCM under a key derived from a passphrase (scrypt). File layout:
 *   "JVBK1" | salt(16) | iv(12) | authTag(16) | ciphertext
 * A wrong passphrase or a modified/truncated file fails authentication and is refused: it is never
 * partially restored. Restore validates the snapshot (integrity check, schema not newer than this build)
 * before it replaces anything, and keeps the previous database beside it.
 */
const MAGIC = Buffer.from('JVBK1');
const PREFIX = 'branch-core-';
const SUFFIX = '.jvbk';

export class BackupError extends Error {
  constructor(public code: 'WRONG_PASSPHRASE_OR_CORRUPT' | 'NOT_A_BACKUP' | 'INVALID_SNAPSHOT' | 'TOO_NEW', message: string) {
    super(message);
  }
}

function key(passphrase: string, salt: Buffer): Buffer {
  if (!passphrase || passphrase.length < 8) throw new Error('Backup passphrase must be at least 8 characters');
  return scryptSync(passphrase, salt, 32);
}

export function encryptBytes(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBytes(blob: Buffer, passphrase: string): Buffer {
  if (blob.length < MAGIC.length + 44 || !blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError('NOT_A_BACKUP', 'This file is not a JAMANVAAR backup');
  let o = MAGIC.length;
  const salt = blob.subarray(o, (o += 16));
  const iv = blob.subarray(o, (o += 12));
  const tag = blob.subarray(o, (o += 16));
  const decipher = createDecipheriv('aes-256-gcm', key(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(blob.subarray(o)), decipher.final()]);
  } catch {
    throw new BackupError('WRONG_PASSPHRASE_OR_CORRUPT', 'Wrong passphrase, or the backup file is damaged');
  }
}

/** Writes one encrypted backup into `dir` and prunes old ones, keeping the newest `keep`. */
export function createBackup(store: BranchStore, dir: string, passphrase: string, opts: { keep?: number; now?: () => number } = {}): { file: string; bytes: number } {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date(opts.now?.() ?? Date.now()).toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const snapshot = path.join(dir, `.${PREFIX}${stamp}.tmp.sqlite`);
  rmSync(snapshot, { force: true });
  store.db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  try {
    const file = path.join(dir, `${PREFIX}${stamp}${SUFFIX}`);
    const encrypted = encryptBytes(readFileSync(snapshot), passphrase);
    // Write then rename so a crash never leaves a half-written backup that looks complete.
    writeFileSync(`${file}.part`, encrypted);
    renameSync(`${file}.part`, file);
    prune(dir, opts.keep ?? 14);
    return { file, bytes: encrypted.length };
  } finally {
    rmSync(snapshot, { force: true });
  }
}

export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX)).sort();
}

function prune(dir: string, keep: number): void {
  const all = listBackups(dir);
  for (const f of all.slice(0, Math.max(0, all.length - keep))) rmSync(path.join(dir, f), { force: true });
}

/**
 * Replaces the database file at `dbPath` with the backup's contents. The core must be stopped. The previous
 * file is kept as `<db>.before-restore` so a bad restore can be undone.
 */
export function restoreBackup(backupFile: string, passphrase: string, dbPath: string): { schemaVersion: number } {
  const plain = decryptBytes(readFileSync(backupFile), passphrase);
  const candidate = `${dbPath}.restoring`;
  writeFileSync(candidate, plain);
  let version: number;
  try {
    const check = new DatabaseSync(candidate);
    try {
      const ok = check.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (ok.integrity_check !== 'ok') throw new BackupError('INVALID_SNAPSHOT', 'The backup failed its integrity check');
      version = Number((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    } finally {
      check.close();
    }
    if (version > SCHEMA_VERSION) throw new BackupError('TOO_NEW', `The backup is from a newer version (${version}); update this Branch Core first`);
  } catch (e) {
    rmSync(candidate, { force: true });
    throw e;
  }
  if (existsSync(dbPath)) renameSync(dbPath, `${dbPath}.before-restore`);
  for (const ext of ['-wal', '-shm']) rmSync(`${dbPath}${ext}`, { force: true });
  renameSync(candidate, dbPath);
  return { schemaVersion: version };
}

/** Runs backups on a schedule while the core is up. */
export class BackupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  lastResult: { at: number; file?: string; error?: string } | null = null;

  constructor(private store: BranchStore, private opts: { dir: string; passphrase: string; everyMs?: number; keep?: number }) {}

  runNow(): { file: string; bytes: number } | null {
    try {
      const r = createBackup(this.store, this.opts.dir, this.opts.passphrase, { keep: this.opts.keep });
      this.lastResult = { at: Date.now(), file: r.file };
      return r;
    } catch (e) {
      this.lastResult = { at: Date.now(), error: e instanceof Error ? e.message : String(e) };
      return null;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.runNow(), this.opts.everyMs ?? 6 * 60 * 60_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  age(): number | null {
    const newest = listBackups(this.opts.dir).pop();
    return newest ? Date.now() - statSync(path.join(this.opts.dir, newest)).mtimeMs : null;
  }
}

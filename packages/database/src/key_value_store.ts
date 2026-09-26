import type { DbStorage } from './db';

/**
 * The storage port for small values that are not collections: sync cursors, applied menu version, the
 * Branch Core address, device-gate state, dismissed notices. Code that owns such a value talks to this
 * port and never to a browser storage API, so a shell without `localStorage` (a native SQLite store on
 * Android, a Tauri store on Windows) only has to provide one adapter.
 *
 * Backends, in order: the durable SQLite store once attached (same atomic, cross-window database as the
 * restaurant data), otherwise `localStorage` if this runtime has one. With neither, reads return null and writes are dropped: callers that need a session-only fallback keep their own (a shared module-level map would leak state between separate device instances). A value that is
 * only in the old `localStorage` is copied into the durable store the first time it is read, so switching
 * to SQLite loses no cursor or setting.
 */
function browserStorage(): DbStorage | null {
  try {
    const ls = (globalThis as { localStorage?: DbStorage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export class KeyValueStore {
  private static durable: DbStorage | null = null;

  /** Called once at startup after the durable database is opened. */
  static attach(storage: DbStorage | null): void {
    this.durable = storage;
  }

  static reset(): void {
    this.durable = null;
  }

  static get(key: string): string | null {
    try {
      if (this.durable) {
        const v = this.durable.getItem(key);
        if (v !== null) return v;
        const legacy = browserStorage()?.getItem(key) ?? null;
        if (legacy !== null) this.durable.setItem(key, legacy); // one-time migration
        return legacy;
      }
      const ls = browserStorage();
      if (ls) return ls.getItem(key);
    } catch {
      // unreadable storage behaves as empty
    }
    return null;
  }

  static set(key: string, value: string): void {
    try {
      const target = this.durable ?? browserStorage();
      if (target) {
        target.setItem(key, value);
        return;
      }
    } catch {
      // storage full or blocked: the caller's in-memory state still applies for this session
    }
  }

  static remove(key: string): void {
    try {
      (this.durable ?? browserStorage())?.removeItem(key);
      if (this.durable) browserStorage()?.removeItem(key);
    } catch {
      // nothing to remove from
    }
  }
}

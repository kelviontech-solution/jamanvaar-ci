import { KeyValueStore } from '@jamanvaar/database';
/**
 * PlatformNotice: the announcement the platform team publishes (currently
 * maintenance mode) as seen by a restaurant app. It arrives in a terminal's
 * heartbeat answer or, for Restaurant Admin, from a poll. It is remembered so it
 * still shows offline, expires on its own end time, and can be dismissed for the
 * session. It never blocks selling: the apps are offline-first.
 */
export interface PlatformNoticeData {
  kind: 'MAINTENANCE';
  message: string;
  startsAt: string | null;
  endsAt: string | null;
}

const STORAGE_KEY = 'jamanvaar_platform_notice_v1';

const memory: { value: string | null } = { value: null };

function load(): PlatformNoticeData | null {
  try {
    const raw = KeyValueStore.get(STORAGE_KEY) ?? memory.value;
    return raw ? (JSON.parse(raw) as PlatformNoticeData) : null;
  } catch {
    return null;
  }
}

function save(value: PlatformNoticeData | null): void {
  const raw = value ? JSON.stringify(value) : null;
  try {
    memory.value = raw;
    if (raw) KeyValueStore.set(STORAGE_KEY, raw);
    else KeyValueStore.remove(STORAGE_KEY);
  } catch {
    memory.value = raw;
  }
}

export class PlatformNotice {
  private static current: PlatformNoticeData | null = load();
  /** The message the user dismissed. Kept for the session only, so it comes back on the next launch. */
  private static dismissedMessage: string | null = null;
  private static listeners = new Set<() => void>();

  private static emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The notice, unless its end time has passed. */
  static get(nowMs: number = Date.now()): PlatformNoticeData | null {
    const n = this.current;
    if (!n) return null;
    if (n.endsAt && Date.parse(n.endsAt) <= nowMs) return null;
    return n;
  }

  /** What the banner should show: the notice, unless the user dismissed this very message. */
  static getVisible(nowMs: number = Date.now()): PlatformNoticeData | null {
    const n = this.get(nowMs);
    return n && n.message !== this.dismissedMessage ? n : null;
  }

  static set(notice: PlatformNoticeData | null): void {
    this.current = notice;
    save(notice);
    this.emit();
  }

  /** Apply the `notice` field of a cloud answer. `undefined` means an older API that says nothing: keep what we have. */
  static apply(notice: PlatformNoticeData | null | undefined): void {
    if (notice === undefined) return;
    this.set(notice);
  }

  static dismiss(): void {
    this.dismissedMessage = this.current?.message ?? null;
    this.emit();
  }

  static reset(): void {
    memory.value = null;
    this.dismissedMessage = null;
    this.set(null);
  }
}

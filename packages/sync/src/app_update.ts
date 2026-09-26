import { KeyValueStore } from '@jamanvaar/database';
/**
 * "A newer version of this app is available" (BUG-065). The cloud puts an offer in every heartbeat
 * answer; this keeps the latest one, lets the operator dismiss an optional one for that version, and
 * never lets a mandatory one be dismissed (DeviceGate turns that into a lock screen).
 */
export interface AppUpdateOffer {
  latestVersion: string;
  mandatory: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
}

const STORAGE_KEY = 'jamanvaar_app_update_v1';
const memory: { value: string | null } = { value: null };

interface Stored {
  offer: AppUpdateOffer | null;
  dismissedVersion: string | null;
}

function read(): Stored {
  try {
    const raw = KeyValueStore.get(STORAGE_KEY) ?? memory.value;
    return raw ? (JSON.parse(raw) as Stored) : { offer: null, dismissedVersion: null };
  } catch {
    return { offer: null, dismissedVersion: null };
  }
}

function write(state: Stored): void {
  const raw = JSON.stringify(state);
  try {
    memory.value = raw;
    KeyValueStore.set(STORAGE_KEY, raw);
  } catch {
    memory.value = raw;
  }
}

export class AppUpdate {
  private static state: Stored = read();
  private static listeners = new Set<() => void>();

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static set(next: Stored): void {
    this.state = next;
    write(next);
    this.listeners.forEach((fn) => fn());
  }

  static reset(): void {
    memory.value = null;
    this.set({ offer: null, dismissedVersion: null });
  }

  /** Feed the `update` field of a heartbeat answer (null/undefined = this terminal is current). */
  static apply(offer: AppUpdateOffer | null | undefined): void {
    this.set({ offer: offer ?? null, dismissedVersion: this.state.dismissedVersion });
  }

  /** The offer to show, or null when there is none or the operator dismissed this version. */
  static getVisible(): AppUpdateOffer | null {
    const { offer, dismissedVersion } = this.state;
    if (!offer) return null;
    if (!offer.mandatory && dismissedVersion === offer.latestVersion) return null;
    return offer;
  }

  static dismiss(): void {
    const { offer } = this.state;
    if (!offer || offer.mandatory) return;
    this.set({ offer, dismissedVersion: offer.latestVersion });
  }
}

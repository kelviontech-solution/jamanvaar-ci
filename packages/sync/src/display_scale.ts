import { KeyValueStore } from '@jamanvaar/database';
/**
 * How big everything is on a terminal (BUG-008). The POS used to open at an unexplained 130% that nothing
 * controlled. The size now comes from the restaurant's default (set in Restaurant Admin, delivered with the
 * heartbeat) unless the person at this terminal picked their own, and is 100% when nothing is set.
 * It is applied as a page zoom, which scales everything, including fixed pixel sizes.
 */
export const MIN_DISPLAY_SCALE = 70;
export const MAX_DISPLAY_SCALE = 150;
export const DEFAULT_DISPLAY_SCALE = 100;

const CLOUD_KEY = 'jamanvaar_display_scale_cloud';
const LOCAL_KEY = 'jamanvaar_display_scale_local';

type ZoomTarget = { style: { zoom: string } };

const clamp = (n: number) => Math.min(MAX_DISPLAY_SCALE, Math.max(MIN_DISPLAY_SCALE, Math.round(n)));
const usable = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function read(key: string): number | null {
  try {
    const raw = KeyValueStore.get(key);
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return usable(n) ? clamp(n) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: number | null) {
  try {
    if (value === null) KeyValueStore.remove(key);
    else KeyValueStore.set(key, String(value));
  } catch {
    // storage can be unavailable; the value still applies for this session
  }
}

export class DisplayScale {
  private static cloud: number | null = read(CLOUD_KEY);
  private static local: number | null = read(LOCAL_KEY);
  private static listeners = new Set<() => void>();
  private static lastEffective = DisplayScale.getEffective();

  static getCloudDefault(): number {
    return this.cloud ?? DEFAULT_DISPLAY_SCALE;
  }

  static getLocalOverride(): number | null {
    return this.local;
  }

  static getEffective(): number {
    return this.local ?? this.cloud ?? DEFAULT_DISPLAY_SCALE;
  }

  /** The restaurant's default, as delivered with the heartbeat. Anything unusable is ignored. */
  static setCloudDefault(value: unknown): void {
    if (!usable(value)) return;
    this.cloud = clamp(value);
    write(CLOUD_KEY, this.cloud);
    this.changed();
  }

  /** A size chosen on this terminal; null goes back to the restaurant's default. */
  static setLocalOverride(value: number | null): void {
    this.local = value === null ? null : usable(value) ? clamp(value) : this.local;
    write(LOCAL_KEY, this.local);
    this.changed();
  }

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static changed(): void {
    const now = this.getEffective();
    if (now === this.lastEffective) return;
    this.lastEffective = now;
    this.applyToDocument();
    this.listeners.forEach((fn) => fn());
  }

  /** Sets the page zoom; 100% clears it so the app renders exactly as designed. */
  static applyToDocument(root?: ZoomTarget): void {
    const target = root ?? (typeof document !== 'undefined' ? (document.documentElement as unknown as ZoomTarget) : undefined);
    if (!target) return;
    const scale = this.getEffective();
    target.style.zoom = scale === DEFAULT_DISPLAY_SCALE ? '' : String(scale / 100);
  }

  /** Test helper: forget everything held in memory and in storage. */
  static reset(): void {
    this.cloud = null;
    this.local = null;
    write(CLOUD_KEY, null);
    write(LOCAL_KEY, null);
    this.lastEffective = this.getEffective();
    this.listeners.clear();
  }

  static reloadFromStorage(): void {
    this.cloud = read(CLOUD_KEY);
    this.local = read(LOCAL_KEY);
    this.lastEffective = this.getEffective();
  }
}

// Apply as soon as the app loads, so the first paint is already the right size.
if (typeof document !== 'undefined') DisplayScale.applyToDocument();

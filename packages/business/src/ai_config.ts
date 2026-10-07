import { DeviceGate } from '@jamanvaar/sync';
import { KeyValueStore, TenantIsolation } from '@jamanvaar/database';

/**
 * What the cloud says JAMAN AI may do for THIS restaurant (BUG-056/057), cached on the terminal so it keeps
 * working offline. It replaces two things that were wrong: the app's own hardcoded copy of the question
 * list and thresholds, and a fake local licence that decided who gets AI.
 *
 *   ON      the assistant works, answering from the catalogue the cloud sent
 *   LOCKED  the button stays visible with a lock, and opens a teaser instead of answering
 *   OFF     hidden
 *
 * Until the cloud has answered at least once nothing is known, and the button stays hidden: a terminal
 * must not offer something the platform has not granted.
 */
export type AiAccessState = 'ON' | 'LOCKED' | 'OFF';

export interface AiThresholds {
  delayedKotMinutes: number;
  lowStockThreshold: number;
  cashDrawerVarianceThreshold: number;
  proactiveAlertsEnabled: boolean;
}

export interface AiCloudQuestion {
  id: string;
  category: string;
  label: string;
  icon: string;
  intent: string;
  priorityScore: number;
  targetDomain?: 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS';
  calculationType?: 'SUM' | 'COUNT' | 'AVG' | 'RATIO' | 'TOP_LIST';
  filterField?: string;
  filterValue?: string;
  displayUnit?: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'MINUTES';
}

export interface AiCloudConfig {
  state: AiAccessState | string;
  settings: AiThresholds;
  questions: AiCloudQuestion[];
  teaser: Array<{ label: string; icon: string }>;
  limitReached: boolean;
  remainingToday: number | null;
  fetchedAt?: string;
}

export const DEFAULT_AI_THRESHOLDS: AiThresholds = {
  delayedKotMinutes: 15,
  lowStockThreshold: 3,
  cashDrawerVarianceThreshold: 500,
  proactiveAlertsEnabled: true
};

// Never reuse the old origin-wide cache: different applications and restaurants shared it.
const storageKey = () => KeyValueStore.browserKey(`jamanvaar_ai_config_v2:${TenantIsolation.current() ?? 'unbound'}`);
const scope = storageKey;
const memory = new Map<string, AiCloudConfig>();
function read(): AiCloudConfig | null {
  try { return JSON.parse(KeyValueStore.get(storageKey()) ?? 'null') ?? memory.get(scope()) ?? null; }
  catch { return null; }
}
function write(cfg: AiCloudConfig | null): void {
  if (cfg) { memory.set(scope(), cfg); KeyValueStore.set(storageKey(), JSON.stringify(cfg)); }
  else { memory.delete(scope()); KeyValueStore.remove(storageKey()); }
}
export interface AiRefreshOptions { apiBase: string; deviceToken: string; }
let refreshOptions: AiRefreshOptions | null = null;
let activeRequest: { key: string; promise: Promise<boolean> } | null = null;
let generation = 0;

export class AiConfig {
  private static config: AiCloudConfig | null = null;
  private static loadedScope: string | null = null;
  private static revision = 0;

  private static ensureScope(): void {
    const current = scope();
    if (current !== this.loadedScope) {
      this.loadedScope = current;
      this.config = read();
      this.revision++;
      refreshOptions = null;
      generation++;
    }
  }

  static getRevision(): number { this.ensureScope(); return this.revision; }
  private static listeners = new Set<() => void>();

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static set(next: AiCloudConfig | null): void {
    this.ensureScope();
    this.config = next;
    this.revision++;
    write(next);
    this.listeners.forEach((fn) => fn());
  }

  static reset(): void {
    generation++;
    refreshOptions = null;
    this.set(null);
  }

  /** Only for tests: forget the in-memory copy and read what was persisted. */
  static reloadFromStorage(): void {
    this.ensureScope();
    this.config = read();
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }

  static apply(cfg: AiCloudConfig | null): void {
    this.set(cfg ? { ...cfg, fetchedAt: new Date().toISOString() } : null);
  }

  static getFetchedAt(): string | null {
    this.ensureScope();
    return this.config?.fetchedAt ?? null;
  }

  static isKnown(): boolean {
    this.ensureScope();
    return this.config !== null;
  }

  static getState(): AiAccessState {
    this.ensureScope();
    const s = this.config?.state;
    return s === 'ON' || s === 'LOCKED' ? s : 'OFF';
  }

  /** The assistant may answer questions. */
  static isEnabled(): boolean {
    return this.getState() === 'ON';
  }

  /**
   * Whether to draw the AI button. The owner's local "show JAMAN AI" preference can only hide something
   * that is ON: it can never turn on what the platform locked, and it does not hide the lock.
   */
  static shouldShowButton(ownerWantsIt: boolean): boolean {
    // The owner's "hide it" always wins, including over the upgrade teaser shown on a locked plan.
    if (!ownerWantsIt) return false;
    const state = this.getState();
    if (state === 'OFF') return false;
    return true;
  }

  static getSettings(): AiThresholds {
    this.ensureScope();
    return { ...DEFAULT_AI_THRESHOLDS, ...(this.config?.settings ?? {}) };
  }

  static getTeaser(): Array<{ label: string; icon: string }> {
    this.ensureScope();
    return this.config?.teaser ?? [];
  }

  /**
   * Is this question on offer? Before the cloud catalogue is known nothing is filtered, so a terminal
   * that has just been activated is not left with an empty list; once known, only what it enables shows.
   */
  static isIntentEnabled(intent: string): boolean {
    this.ensureScope();
    const questions = this.config?.questions;
    if (!questions || questions.length === 0) return !this.isKnown();
    return questions.some((q) => q.intent === intent);
  }

  static getQuestions(): AiCloudQuestion[] {
    this.ensureScope();
    return this.config?.questions ?? [];
  }

  /** False once the day's limit has been reached. */
  static canQuery(): boolean {
    this.ensureScope();
    return this.isEnabled() && !(this.config?.limitReached ?? false);
  }

  /** Called with the answer to a telemetry post so the limit is enforced on the terminal too. */
  static noteUsage(u: { limitReached?: boolean; remainingToday?: number | null }): void {
    this.ensureScope();
    if (!this.config) return;
    this.set({ ...this.config, limitReached: u.limitReached ?? this.config.limitReached, remainingToday: u.remainingToday ?? this.config.remainingToday });
  }
}

/** The label with the configured number in it: "Delayed KOTs (> 25 mins)". */
export function delayedKotLabel(minutes: number = AiConfig.getSettings().delayedKotMinutes): string {
  return `Delayed KOTs (> ${minutes} mins)`;
}

/** Refresh the cached decision from the cloud with the terminal's own credential. Best effort: offline keeps the last one. */
export async function refreshAiConfig(opts: AiRefreshOptions): Promise<boolean> {
  AiConfig.getRevision(); // scope must be established before capturing the active session
  refreshOptions = opts;
  const expectedScope = scope(), expectedGeneration = generation;
  const key = `${expectedScope}:${opts.apiBase}:${opts.deviceToken}`;
  if (activeRequest?.key === key) return activeRequest.promise;
  const promise = (async () => {
    try {
      const res = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/ai-config`, {
        headers: { Authorization: `Bearer ${opts.deviceToken}` }
      });
      if (!res.ok) return false;
      const cfg = await res.json() as AiCloudConfig;
      if (scope() !== expectedScope || generation !== expectedGeneration || refreshOptions?.deviceToken !== opts.deviceToken || refreshOptions?.apiBase !== opts.apiBase) return false;
      if (!['ON', 'LOCKED', 'OFF'].includes(cfg.state) || !Array.isArray(cfg.questions)) return false;
      AiConfig.apply(cfg);
      return true;
    } catch { return false; }
  })();
  activeRequest = { key, promise };
  try { return await promise; }
  finally { if (activeRequest?.promise === promise) activeRequest = null; }
}

/** User-triggered retry uses only the current terminal's credential, never a saved foreign token. */
export async function refreshConfiguredAi(): Promise<boolean> {
  AiConfig.getRevision();
  return refreshOptions ? refreshAiConfig(refreshOptions) : false;
}

/** Existing heartbeats refresh settings at most once per minute; concurrent callers share a request. */
export async function refreshAiConfigIfStale(opts: AiRefreshOptions, maxAgeMs = 60_000): Promise<boolean> {
  const fetchedAt = AiConfig.getFetchedAt();
  refreshOptions = opts;
  if (fetchedAt && maxAgeMs > 0 && Date.now() - new Date(fetchedAt).getTime() < maxAgeMs) return true;
  return refreshAiConfig(opts);
}

/** Tell the cloud a question was answered, with how long it took, and honour the daily limit it reports. */
export async function reportAiQuery(opts: { apiBase: string; deviceToken: string; intent: string; latencyMs: number }): Promise<void> {
  const expectedScope = scope(), expectedGeneration = generation;
  try {
    const res = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/ai-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.deviceToken}` },
      body: JSON.stringify({ intent: opts.intent, latencyMs: Math.round(opts.latencyMs) })
    });
    if (res.ok && expectedScope === scope() && expectedGeneration === generation) AiConfig.noteUsage((await res.json()) as { limitReached?: boolean; remainingToday?: number | null });
  } catch {
    // Offline: the question was still answered locally.
  }
}

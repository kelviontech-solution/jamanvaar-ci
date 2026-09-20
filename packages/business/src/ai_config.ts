import { DeviceGate } from '@jamanvaar/sync';

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

const STORAGE_KEY = 'jamanvaar_ai_config_v1';
const memory: { value: string | null } = { value: null };

function read(): AiCloudConfig | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : memory.value;
    return raw ? (JSON.parse(raw) as AiCloudConfig) : null;
  } catch {
    return null;
  }
}

function write(cfg: AiCloudConfig | null): void {
  const raw = cfg ? JSON.stringify(cfg) : null;
  try {
    if (typeof localStorage !== 'undefined') {
      if (raw) localStorage.setItem(STORAGE_KEY, raw);
      else localStorage.removeItem(STORAGE_KEY);
    } else memory.value = raw;
  } catch {
    memory.value = raw;
  }
}

export class AiConfig {
  private static config: AiCloudConfig | null = read();
  private static listeners = new Set<() => void>();

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static set(next: AiCloudConfig | null): void {
    this.config = next;
    write(next);
    this.listeners.forEach((fn) => fn());
  }

  static reset(): void {
    memory.value = null;
    this.set(null);
  }

  /** Only for tests: forget the in-memory copy and read what was persisted. */
  static reloadFromStorage(): void {
    this.config = read();
  }

  static apply(cfg: AiCloudConfig | null): void {
    this.set(cfg ? { ...cfg, fetchedAt: new Date().toISOString() } : null);
  }

  static getFetchedAt(): string | null {
    return this.config?.fetchedAt ?? null;
  }

  static isKnown(): boolean {
    return this.config !== null;
  }

  static getState(): AiAccessState {
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
    const state = this.getState();
    if (state === 'OFF') return false;
    if (state === 'LOCKED') return true;
    return ownerWantsIt;
  }

  static getSettings(): AiThresholds {
    return { ...DEFAULT_AI_THRESHOLDS, ...(this.config?.settings ?? {}) };
  }

  static getTeaser(): Array<{ label: string; icon: string }> {
    return this.config?.teaser ?? [];
  }

  /**
   * Is this question on offer? Before the cloud catalogue is known nothing is filtered, so a terminal
   * that has just been activated is not left with an empty list; once known, only what it enables shows.
   */
  static isIntentEnabled(intent: string): boolean {
    const questions = this.config?.questions;
    if (!questions || questions.length === 0) return !this.isKnown();
    return questions.some((q) => q.intent === intent);
  }

  static getQuestions(): AiCloudQuestion[] {
    return this.config?.questions ?? [];
  }

  /** False once the day's limit has been reached. */
  static canQuery(): boolean {
    return !(this.config?.limitReached ?? false);
  }

  /** Called with the answer to a telemetry post so the limit is enforced on the terminal too. */
  static noteUsage(u: { limitReached?: boolean; remainingToday?: number | null }): void {
    if (!this.config) return;
    this.set({ ...this.config, limitReached: u.limitReached ?? this.config.limitReached, remainingToday: u.remainingToday ?? this.config.remainingToday });
  }
}

/** The label with the configured number in it: "Delayed KOTs (> 25 mins)". */
export function delayedKotLabel(minutes: number = AiConfig.getSettings().delayedKotMinutes): string {
  return `Delayed KOTs (> ${minutes} mins)`;
}

/** Refresh the cached decision from the cloud with the terminal's own credential. Best effort: offline keeps the last one. */
export async function refreshAiConfig(opts: { apiBase: string; deviceToken: string }): Promise<boolean> {
  try {
    const res = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/ai-config`, {
      headers: { Authorization: `Bearer ${opts.deviceToken}` }
    });
    if (!res.ok) return false;
    AiConfig.apply((await res.json()) as AiCloudConfig);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refresh only when the cached decision is older than `maxAgeMs` (default 5 minutes), so it can ride on the
 * terminal heartbeat without hitting the cloud every few seconds. Pass 0 to force a refresh.
 */
export async function refreshAiConfigIfStale(opts: { apiBase: string; deviceToken: string }, maxAgeMs = 5 * 60_000): Promise<boolean> {
  const fetchedAt = AiConfig.getFetchedAt();
  if (fetchedAt && maxAgeMs > 0 && Date.now() - new Date(fetchedAt).getTime() < maxAgeMs) return true;
  return refreshAiConfig(opts);
}

/** Tell the cloud a question was answered, with how long it took, and honour the daily limit it reports. */
export async function reportAiQuery(opts: { apiBase: string; deviceToken: string; intent: string; latencyMs: number }): Promise<void> {
  try {
    const res = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/ai-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.deviceToken}` },
      body: JSON.stringify({ intent: opts.intent, latencyMs: Math.round(opts.latencyMs) })
    });
    if (res.ok) AiConfig.noteUsage((await res.json()) as { limitReached?: boolean; remainingToday?: number | null });
  } catch {
    // Offline: the question was still answered locally.
  }
}

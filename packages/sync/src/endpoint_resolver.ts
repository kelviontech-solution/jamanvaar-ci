/**
 * Decides, for every request, whether a device talks to the restaurant's Branch Core or to the cloud.
 *
 * Operational traffic (orders, stock movements, menu/staff sync, number leases, realtime, heartbeat and
 * commands) goes to the Branch Core when one is configured and reachable, so the branch keeps running with
 * the internet down. Everything that inherently needs the cloud (activation, payments, licensing, guest QR)
 * always goes to the cloud. If the preferred server cannot be reached the same call is retried on the
 * other one, and a server that just failed is not tried again for a short cool-down.
 *
 * Only *connectivity* failures trigger fallback. A reachable server answering 401 or 409 is a real answer.
 * Every operational request carries an event id the server applies once, so retrying on the other server
 * can never duplicate anything. Sync cursors are per server (serverKeyFor): a position on one server means
 * nothing on the other.
 */

import { KeyValueStore } from '@jamanvaar/database';
import { PaymentPolicy } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';
import { fetchWithDeadline } from '@jamanvaar/api';

export type Responder = 'core' | 'cloud';
export type ConnectionMode = 'ONLINE' | 'LOCAL' | 'OFFLINE';

const OPERATIONAL_PREFIXES = [
  '/api/v1/orders/sync',
  '/api/v1/inventory/',
  '/api/v1/sync/',
  '/api/v1/entity-sync/',
  '/api/v1/realtime/',
  '/api/v1/devices/me/heartbeat',
  '/api/v1/devices/me/commands',
  '/api/v1/devices/me/fleet'
];
// NOT operational, on purpose: the Branch Core does not serve /api/v1/menu/* (menu version, publishing) or /devices/me/sync-issues.
// They were listed here, so with a core configured they went to it and got a 404 that the resolver rightly treats as a real answer
// (no fallback). Those are cloud facts and go to the cloud.

export function isOperationalPath(path: string): boolean {
  const p = path.split('?')[0];
  return OPERATIONAL_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix.endsWith('/') ? prefix : prefix + '/') || p === prefix.replace(/\/$/, ''));
}

const CORE_URL_KEY = 'jamanvaar_branch_core_url';
const COOL_DOWN_MS = 15_000;
const STATE_TTL_MS = 60_000;

interface Health {
  ok: boolean;
  at: number;
}

export class EndpointResolver {
  private static cloudBase = '';
  private static coreUrl: string | null = null;
  private static health: Record<Responder, Health | null> = { core: null, cloud: null };
  private static responder: Responder | null = null;
  private static readonly responses = new WeakMap<Response, Responder>();
  private static identity: string | null = null;

  static setIdentity(identity: string | null): void { this.identity = identity; }
  static responderFor(response: Response): Responder | undefined { return this.responses.get(response); }
  private static now: () => number = Date.now;
  private static listeners = new Set<() => void>();

  static reset(opts: { now?: () => number } = {}): void {
    this.cloudBase = '';
    this.coreUrl = null;
    this.health = { core: null, cloud: null };
    this.responder = null;
    this.identity = null;
    this.lastOkAt = null;
    this.now = opts.now ?? Date.now;
  }

  /** `coreUrl` defaults to the address saved at setup (the key-value store) so every app on this machine agrees. */
  static configure(opts: { cloudBase: string; coreUrl?: string | null }): void {
    this.cloudBase = opts.cloudBase.replace(/\/+$/, '');
    const saved = (() => {
      try {
        return KeyValueStore.get(CORE_URL_KEY);
      } catch {
        return null;
      }
    })();
    const chosen = opts.coreUrl === undefined ? saved : opts.coreUrl;
    this.coreUrl = chosen ? chosen.replace(/\/+$/, '') : null;
  }

  /** Points every app on this machine at a Branch Core (or removes it). */
  static setCoreUrl(url: string | null): void {
    this.coreUrl = url ? url.replace(/\/+$/, '') : null;
    this.health.core = null;
    try {
      {
        if (url) KeyValueStore.set(CORE_URL_KEY, url);
        else KeyValueStore.remove(CORE_URL_KEY);
      }
    } catch {
      // storage unavailable: the address applies for this session only
    }
    this.emit();
  }

  static getCoreUrl(): string | null {
    return this.coreUrl;
  }

  static subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private static emit(): void {
    this.listeners.forEach((l) => l());
  }

  private static coolingDown(r: Responder): boolean {
    const h = this.health[r];
    return !!h && !h.ok && this.now() - h.at < COOL_DOWN_MS;
  }

  private static lastOkAt: number | null = null;

  /** Milliseconds since any server (cloud or branch core) last answered a request; null if none has answered yet this session. */
  static msSinceLastContact(): number | null {
    return this.lastOkAt === null ? null : Math.max(0, this.now() - this.lastOkAt);
  }

  private static mark(r: Responder, ok: boolean): void {
    const changed = this.health[r]?.ok !== ok;
    this.health[r] = { ok, at: this.now() };
    if (ok) this.lastOkAt = this.now();
    if (ok) this.responder = r;
    if (changed) this.emit();
    this.publishReachability();
  }

  /** True only if a request to the cloud itself succeeded recently. Being on Wi-Fi does not count. */
  static internetVerified(): boolean {
    const h = this.health.cloud;
    return !!h && h.ok && this.now() - h.at < STATE_TTL_MS;
  }

  private static publishReachability(): void {
    PaymentPolicy.setInternetVerifier(() => this.internetVerified());
    if (this.health.cloud || this.health.core) NetworkStatusService.reportReachability(this.internetVerified() ? 'ONLINE' : this.mode() === 'LOCAL' ? 'LOCAL' : 'OFFLINE');
  }

  /** Which server a request for `path` would go to right now. */
  static serverKeyFor(path: string): Responder {
    if (this.coreUrl && isOperationalPath(path) && !this.coolingDown('core')) return 'core';
    return 'cloud';
  }

  static baseFor(path: string): string {
    return this.serverKeyFor(path) === 'core' ? (this.coreUrl as string) : this.cloudBase;
  }

  /** Sets the cloud address if nothing has configured it yet (used by shared code that is handed an apiBase). */
  static ensureConfigured(cloudBase: string): void {
    if (!this.cloudBase) this.configure({ cloudBase });
  }

  /** A storage key for a sync cursor that is specific to the server that will answer `path`. The cloud keeps the original key. */
  static cursorKey(baseKey: string, path: string): string {
    const scoped = this.identity ? `${baseKey}:device:${this.identity}` : baseKey;
    return this.serverKeyFor(path) === 'core' ? `${scoped}:core` : scoped;
  }

  /** Who answered the most recent successful request. */
  static lastResponder(): Responder | null {
    return this.responder;
  }

  static mode(): ConnectionMode {
    const fresh = (r: Responder) => {
      const h = this.health[r];
      return !!h && h.ok && this.now() - h.at < STATE_TTL_MS;
    };
    if (fresh('cloud')) return 'ONLINE';
    if (fresh('core')) return 'LOCAL';
    // Nothing has succeeded recently. If a server has never failed either we have not looked yet: assume the best.
    const failed = (r: Responder) => this.health[r] && !this.health[r]!.ok;
    if (failed('cloud') || failed('core')) return 'OFFLINE';
    return this.coreUrl ? 'LOCAL' : 'ONLINE';
  }

  private static transport: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

  /** The function that performs the actual request (apps set this to DeviceGate.gatedFetch so lock/revocation answers are observed). */
  static setTransport(fn: ((url: string, init?: RequestInit) => Promise<Response>) | null): void {
    this.transport = fn;
  }

  static async fetch(path: string, init: RequestInit = {}, doFetch: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => this.transport ? this.transport(u, i) : fetchWithDeadline(u, i)): Promise<Response> {
    const first = this.serverKeyFor(path);
    const order: Responder[] = this.coreUrl && isOperationalPath(path) ? (first === 'core' ? ['core', 'cloud'] : ['cloud', 'core']) : ['cloud'];
    let lastError: unknown;
    for (const r of order) {
      const base = r === 'core' ? this.coreUrl : this.cloudBase;
      if (!base) continue;
      try {
        const res = await doFetch(`${base}${path}`, init);
        this.responses.set(res, r);
        this.mark(r, true);
        return res;
      } catch (err) {
        this.mark(r, false);
        lastError = err;
      }
    }
    throw lastError ?? new TypeError('No server configured');
  }
}

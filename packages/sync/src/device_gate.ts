/**
 * DeviceGate: what a terminal knows about whether the platform still allows it
 * to run. The cloud refuses a terminal with a machine-readable `code` when its
 * app was disabled, the device was locked or revoked, or the restaurant or
 * subscription is no longer active (see cloud/api DeviceAuthGuard). Terminals
 * used to ignore those refusals and open from a stored token, so none of these
 * had any effect on screen. The gate turns them into a lock state that the app
 * renders as a lock screen, and also locks a terminal that has not checked in
 * for longer than its offline grace period (apps are offline-first, so a
 * limited offline window is allowed, not unlimited).
 */
import { KeyValueStore } from '@jamanvaar/database';
import { DisplayScale } from './display_scale';
import { LICENSE_PUBLIC_KEYS, type LicensePublicKey } from '@jamanvaar/config';
import { AppUpdate, type AppUpdateOffer } from './app_update';
import { PlatformNotice, type PlatformNoticeData } from './platform_notice';
import { verifyOfflineExtension } from './offline_extension';

export type DeviceGateCode =
  | 'DEVICE_REVOKED'
  | 'RESTAURANT_SUSPENDED'
  | 'RESTAURANT_INACTIVE'
  | 'SUBSCRIPTION_INACTIVE'
  | 'APP_DISABLED'
  | 'BRANCH_INACTIVE'
  | 'DEVICE_LOCKED'
  | 'INVALID_DEVICE_CREDENTIAL'
  | 'UPDATE_REQUIRED'
  | 'OFFLINE_LIMIT';

export interface DeviceGateState {
  locked: boolean;
  code?: DeviceGateCode;
  message?: string;
  reason?: string;
  since?: string;
  lastCheckInAt?: string;
  /** Set by a verified emergency extension: the offline limit is not enforced before this time. */
  graceUntil?: string;
  /** Who this terminal is, remembered from its own heartbeats, so a pasted code can be checked offline. */
  restaurantId?: string;
  branchId?: string | null;
  deviceId?: string | null;
}

const CLOUD_LOCK_CODES: DeviceGateCode[] = [
  'DEVICE_REVOKED',
  'RESTAURANT_SUSPENDED',
  'RESTAURANT_INACTIVE',
  'SUBSCRIPTION_INACTIVE',
  'APP_DISABLED',
  'BRANCH_INACTIVE',
  'DEVICE_LOCKED',
  // BUG-145: the cloud does not recognise this terminal's credential at all (device removed, database restored,
  // token corrupted). Every call fails until it is activated again.
  'INVALID_DEVICE_CREDENTIAL'
];

/**
 * These two are not a platform decision about the RESTAURANT (suspended, disabled, out of subscription) — they
 * mean this one physical terminal's own saved credential is dead (a device row removed some other way than
 * revoke, a database restore, a corrupted token, or an admin's deliberate revoke of this specific terminal).
 * The fix is always the same and always available immediately: activate this terminal again.
 *
 * A restaurant that is mid-service should never be walled off by a full-screen "locked" modal over something a
 * fresh activation key fixes in seconds — that used to leave staff staring at a dead screen with no way out
 * ("going round and round" — BUG-145 follow-up). Instead the terminal quietly unbinds itself (the registered
 * app clears its own stored restaurant/device keys and reloads into its own ordinary activation screen — the
 * exact same screen used the first time this terminal was ever set up) and that screen explains why, the same
 * way a real login page explains "your session expired" instead of the whole site refusing to render.
 */
const IDENTITY_INVALID_CODES: ReadonlySet<DeviceGateCode> = new Set(['DEVICE_REVOKED', 'INVALID_DEVICE_CREDENTIAL']);

const STORAGE_KEY = 'jamanvaar_device_gate_v1';
/** Survives `reset()` on purpose: the whole point is that the terminal's OWN activation screen shows it next. */
const DISCONNECT_REASON_KEY = 'jamanvaar_device_disconnect_reason_v1';
export const DEFAULT_OFFLINE_GRACE_DAYS = 7;

const memory: { value: string | null; disconnectReason: string | null } = { value: null, disconnectReason: null };

function readStorage(): DeviceGateState | null {
  try {
    const raw = KeyValueStore.get(STORAGE_KEY) ?? memory.value;
    return raw ? (JSON.parse(raw) as DeviceGateState) : null;
  } catch {
    return null;
  }
}

function writeStorage(state: DeviceGateState): void {
  const raw = JSON.stringify(state);
  try {
    memory.value = raw;
    KeyValueStore.set(STORAGE_KEY, raw);
  } catch {
    memory.value = raw;
  }
}

const MESSAGES: Record<DeviceGateCode, string> = {
  DEVICE_REVOKED: 'This terminal was revoked by your platform administrator. Please activate it again with a new activation key.',
  RESTAURANT_SUSPENDED: 'This restaurant account is suspended. Please contact your platform administrator.',
  RESTAURANT_INACTIVE: 'This restaurant account is no longer active.',
  SUBSCRIPTION_INACTIVE: 'This restaurant has no active subscription. Please contact your platform administrator.',
  APP_DISABLED: 'This application is not enabled for your restaurant. Please contact your platform administrator.',
  BRANCH_INACTIVE: 'This branch has been deactivated. Please contact your platform administrator.',
  DEVICE_LOCKED: 'This terminal has been locked by your platform administrator.',
  INVALID_DEVICE_CREDENTIAL: "This terminal's sign-in with JAMANVAAR is no longer valid, so it cannot sync. Please re-activate it with a new activation key, or contact your platform administrator.",
  UPDATE_REQUIRED: 'A required update must be installed before this terminal can be used.',
  OFFLINE_LIMIT: 'This terminal has been offline for too long. Connect to the internet so it can check in with JAMANVAAR.'
};

export interface HeartbeatAnswer {
  ok?: boolean;
  locked?: boolean;
  lockCode?: string | null;
  lockReason?: string | null;
  notice?: PlatformNoticeData | null;
  update?: AppUpdateOffer | null;
  extension?: { payload: string; signature: string; validUntil?: string } | null;
  /** The restaurant's default display size in percent (BUG-008). */
  displayScalePercent?: number;
  /** KDS only: the kitchen station Restaurant Admin assigned to this screen, or null when it chooses. */
  station?: string | null;
}

const STATION_KEY = 'jamanvaar_assigned_kitchen_station_v1';

/** The kitchen station the cloud assigned to this KDS screen (null when none: the screen chooses). Survives a restart. */
let assignedMemory: string | null = null;

export function getAssignedStation(): string | null {
  try {
    return KeyValueStore.get(STATION_KEY) || assignedMemory;
  } catch {
    return assignedMemory;
  }
}

export function setAssignedStation(station: string | null): void {
  assignedMemory = station; // in memory too, so a device without usable storage still follows the assignment this session
  try {
    if (station) KeyValueStore.set(STATION_KEY, station);
    else KeyValueStore.remove(STATION_KEY);
  } catch {
    /* storage unavailable: the screen keeps its current choice */
  }
}

export class DeviceGate {
  private static state: DeviceGateState = readStorage() ?? { locked: false };
  private static listeners = new Set<() => void>();

  static getState(): DeviceGateState {
    return { ...this.state };
  }

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static set(next: DeviceGateState): void {
    this.state = next;
    writeStorage(next);
    this.listeners.forEach((fn) => fn());
  }

  /** Forget everything (used by tests and when a device is re-activated). */
  static reset(): void {
    memory.value = null;
    this.identityInvalidHandled = false;
    this.set({ locked: false });
  }

  /**
   * Registered once, at boot, by each app: how THIS app clears its own saved restaurant id and device
   * credential and gets itself back to its own activation/connect screen (e.g. `resetTerminal()` in that
   * app's `cloudClient.ts`, then a reload). `DeviceGate` itself has no idea what an app's storage keys are
   * called, so it only calls whatever the app registered — this is what actually happens automatically the
   * moment an invalid credential is detected; nothing is shown to the person operating the terminal until
   * their own app's activation screen appears with `consumeDisconnectReason()`'s explanation on it.
   */
  private static identityInvalidHandler: (() => void) | null = null;
  private static identityInvalidHandled = false;

  static onIdentityInvalid(handler: () => void): void {
    this.identityInvalidHandler = handler;
  }

  /** Remembered across the reload `onIdentityInvalid`'s handler triggers, so the activation screen can explain why. */
  static rememberDisconnectReason(message: string): void {
    try {
      memory.disconnectReason = message;
      KeyValueStore.set(DISCONNECT_REASON_KEY, message);
    } catch {
      memory.disconnectReason = message;
    }
  }

  /**
   * Read without clearing it — safe to call more than once for the same reason (React 18 StrictMode calls a
   * `useState` lazy initializer twice on purpose; reading here must never itself be the thing that makes the
   * second call see nothing). The activation screen uses this to decide what to display.
   */
  static peekDisconnectReason(): string | null {
    try {
      return KeyValueStore.get(DISCONNECT_REASON_KEY) ?? memory.disconnectReason;
    } catch {
      return null;
    }
  }

  /** Marks it as shown, so it does not reappear on a later visit. Safe to call more than once (or never). */
  static consumeDisconnectReason(): string | null {
    const value = this.peekDisconnectReason();
    try {
      memory.disconnectReason = null;
      KeyValueStore.remove(DISCONNECT_REASON_KEY);
      memory.disconnectReason = null;
    } catch {
      memory.disconnectReason = null;
    }
    return value;
  }

  /**
   * This terminal's own saved credential is dead (BUG-145 follow-up). Unlike every other lock reason, this is
   * never shown as a blocking screen: the restaurant may be mid-service, and everything this terminal does
   * locally still works. It only means cloud sync for this device is broken until someone re-activates it —
   * exactly like a "reconnect your account" banner in any ordinary SaaS product, not an outage.
   */
  private static handleIdentityInvalid(code: DeviceGateCode, message?: string): void {
    if (this.identityInvalidHandled) return; // one reload is enough; further 401s on the way out are expected
    this.identityInvalidHandled = true;
    this.rememberDisconnectReason(message || MESSAGES[code]);
    this.identityInvalidHandler?.();
  }

  /**
   * The person at a locked terminal chooses to leave this restaurant's binding: clears the lock and runs the app's own
   * "forget this restaurant and device, go back to activation" handler. This is the way out of a lock screen that will not clear
   * (the restaurant stays suspended, or the key entered belongs to a different restaurant).
   */
  static disconnectTerminal(): void {
    this.rememberDisconnectReason('This terminal was disconnected. Enter an activation key to connect it again.');
    this.reset();
    this.identityInvalidHandled = true;
    if (this.identityInvalidHandler) this.identityInvalidHandler();
    else if (typeof window !== 'undefined') window.location.reload();
  }

  static setLastCheckIn(iso: string): void {
    this.set({ ...this.state, lastCheckInAt: iso });
  }

  private static lock(code: DeviceGateCode, message?: string, reason?: string): void {
    this.set({
      ...this.state,
      locked: true,
      code,
      message: message || MESSAGES[code],
      reason,
      since: this.state.locked && this.state.code === code ? this.state.since : new Date().toISOString()
    });
  }

  /**
   * A successful cloud response: the terminal is allowed. Clears any lock and records the check-in.
   * A mandatory-update lock is the exception (BUG-143): an ordinary call succeeding proves the credential
   * and subscription are fine but says nothing about whether the update was installed, so only a heartbeat
   * that no longer asks for the update (`releaseUpdateLock`) may clear it - otherwise every unrelated
   * request would clear the lock and the next heartbeat would raise it again, so it flickered.
   */
  static reportSuccess(opts: { releaseUpdateLock?: boolean } = {}): void {
    if (this.state.locked && this.state.code === 'UPDATE_REQUIRED' && !opts.releaseUpdateLock) {
      this.set({ ...this.state, lastCheckInAt: new Date().toISOString() });
      return;
    }
    this.set({ locked: false, lastCheckInAt: new Date().toISOString(), ...this.remembered() });
  }

  /** What survives a clear: the extension window and who this terminal is. */
  private static remembered(): Partial<DeviceGateState> {
    const { graceUntil, restaurantId, branchId, deviceId } = this.state;
    return { ...(graceUntil ? { graceUntil } : {}), ...(restaurantId ? { restaurantId } : {}), ...(branchId !== undefined ? { branchId } : {}), ...(deviceId !== undefined ? { deviceId } : {}) };
  }

  private static trustedKeys: LicensePublicKey[] = LICENSE_PUBLIC_KEYS;

  /** Only for tests: which public keys to trust when verifying an extension. */
  static configureTrustedKeys(keys: LicensePublicKey[]): void {
    this.trustedKeys = keys;
  }

  /**
   * A signed emergency offline extension (BUG-077): verified here against the built-in public keys, so it
   * works with no connection. While it is valid the offline limit is not enforced, and a terminal already
   * locked for being offline is released. Returns false, changing nothing, for anything that does not
   * verify or that was issued for another restaurant, branch or terminal.
   */
  static async applyExtension(
    ext: { payload: string; signature: string; validUntil?: string } | null | undefined,
    ctx: { restaurantId?: string; branchId?: string | null; deviceId?: string | null } = {}
  ): Promise<boolean> {
    if (!ext) return false;
    const payload = await verifyOfflineExtension(ext.payload, ext.signature, { keys: this.trustedKeys });
    if (!payload) return false;
    // Without this terminal own restaurant we cannot tell whose extension this is.
    if (!ctx.restaurantId || payload.restaurantId !== ctx.restaurantId) return false;
    if (payload.branchId && payload.branchId !== ctx.branchId) return false;
    if (payload.deviceId && payload.deviceId !== ctx.deviceId) return false;

    const current = this.state.graceUntil ? new Date(this.state.graceUntil).getTime() : 0;
    const until = Math.max(current, new Date(payload.validUntil).getTime());
    const lifted = this.state.locked && this.state.code === 'OFFLINE_LIMIT';
    this.set({ ...this.state, graceUntil: new Date(until).toISOString(), ...(lifted ? { locked: false, code: undefined, message: undefined, reason: undefined } : {}) });
    return true;
  }

  /**
   * Inspect the response of any cloud call the terminal makes. A success only
   * proves the terminal is allowed again when the endpoint is one a locked
   * terminal cannot reach; `/devices/me/*` stays reachable while locked, so
   * pass `provesAllowed: false` for those.
   */
  static async observe(res: Response, provesAllowed: boolean = true): Promise<void> {
    if (res.ok) {
      if (provesAllowed) this.reportSuccess();
      return;
    }
    if (res.status !== 401 && res.status !== 403) return;
    try {
      const body = (await res.clone().json()) as { code?: string; message?: string; reason?: string };
      const code = body?.code as DeviceGateCode | undefined;
      if (!code || !CLOUD_LOCK_CODES.includes(code)) return;
      if (IDENTITY_INVALID_CODES.has(code)) {
        // The server's wording for a rejected credential is a bare 'Invalid device credential.'; ours says what to do.
        this.handleIdentityInvalid(code, code === 'INVALID_DEVICE_CREDENTIAL' ? undefined : body.message);
      } else {
        this.lock(code, body.message, body.reason);
      }
    } catch {
      // Not JSON: an ordinary error, not a platform decision.
    }
  }

  /** The heartbeat answer tells a locked terminal it is locked (it may still check in while locked). */
  static applyHeartbeat(body: HeartbeatAnswer): void {
    // The same answer carries the platform announcement (maintenance etc.).
    PlatformNotice.apply(body.notice);
    // ...and the restaurant's default display size (BUG-008).
    DisplayScale.setCloudDefault(body.displayScalePercent);
    // ...and, for a KDS screen, the kitchen station Restaurant Admin assigned to it.
    if (body.station !== undefined) setAssignedStation(body.station);
    // ...and whether a newer version of this app exists (BUG-065).
    AppUpdate.apply(body.update);
    if (body.locked) {
      this.lock(body.lockCode === 'BRANCH_INACTIVE' ? 'BRANCH_INACTIVE' : 'DEVICE_LOCKED', undefined, body.lockReason ?? undefined);
    } else if (body.update?.mandatory) {
      // A mandatory update is not a suggestion: the terminal cannot be used until it is installed.
      this.lock('UPDATE_REQUIRED', undefined, `Update to version ${body.update.latestVersion} to continue.${body.update.downloadUrl ? ` Download: ${body.update.downloadUrl}` : ''}`);
    } else {
      // The heartbeat passed every cloud check (device, restaurant, subscription, app) and no longer asks for an
      // update, so any lock is stale.
      this.reportSuccess({ releaseUpdateLock: true });
    }
  }

  /** The heartbeat answer plus the emergency extension it may carry (verified before it is trusted). */
  static async applyHeartbeatAsync(body: HeartbeatAnswer, ctx: { restaurantId?: string; branchId?: string | null; deviceId?: string | null } = {}): Promise<void> {
    if (ctx.restaurantId) this.set({ ...this.state, restaurantId: ctx.restaurantId, branchId: ctx.branchId ?? null, deviceId: ctx.deviceId ?? null });
    this.applyHeartbeat(body);
    if (body.extension) await this.applyExtension(body.extension, ctx);
  }

  /**
   * An extension code (`payload.signature`) an operator pastes on a locked, offline terminal. Uses the
   * restaurant this terminal remembered from its earlier heartbeats; a terminal that never checked in
   * has nothing to compare against, so it refuses rather than trusting any restaurant's code.
   */
  static async applyExtensionCode(code: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const parts = code.trim().split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'That is not in the right format. Paste the whole code you were given.' };
    const { restaurantId, branchId, deviceId } = this.state;
    if (!restaurantId) return { ok: false, reason: 'This terminal has not been activated on the internet yet, so it cannot check whose code this is.' };
    const ok = await this.applyExtension({ payload: parts[0], signature: parts[1] }, { restaurantId, branchId, deviceId });
    return ok ? { ok: true } : { ok: false, reason: 'That code is not valid for this terminal (bad signature, expired, or issued for another restaurant or terminal).' };
  }

  /** Lock a terminal that has gone longer than the grace period without any successful check-in. */
  static evaluateOffline(nowMs: number = Date.now(), graceDays: number = DEFAULT_OFFLINE_GRACE_DAYS): void {
    const last = this.state.lastCheckInAt;
    if (!last) return; // never checked in yet (fresh activation): nothing to compare against
    // A verified extension covers the terminal until its end date.
    if (this.state.graceUntil && nowMs < new Date(this.state.graceUntil).getTime()) return;
    const ageDays = (nowMs - new Date(last).getTime()) / 86400000;
    if (ageDays > graceDays) this.lock('OFFLINE_LIMIT');
  }

  /** fetch() that feeds every response through the gate. */
  static async gatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init);
    await this.observe(res, !/\/devices\/me(\/|\?|$)/.test(String(input)));
    return res;
  }
}

/**
 * JAMANVAAR Session Persistence Service
 * =======================================
 * Offline-first, multi-app session persistence.
 * Stores auth tokens in localStorage under namespaced keys.
 * NEVER stores plain-text passwords or PINs.
 *
 * Key schema: jamanvaar:session:<app>
 * Apps: pos | admin | captain | kds | kiosk-admin | kiosk-user
 */

export type JamanAppType = 'pos' | 'admin' | 'captain' | 'kds' | 'kiosk-admin' | 'kiosk-user';

export type AuthStatus =
  | 'AUTH_LOADING'     // App startup: checking persisted session
  | 'AUTHENTICATED'    // Valid session found/restored
  | 'UNAUTHENTICATED'  // No valid session → show login
  | 'AUTH_EXPIRED'     // Session was found but is expired
  | 'AUTH_LOGGING_OUT'; // Logout in progress

export interface PersistedSession {
  /** Unique session token (non-sensitive) */
  sessionToken: string;
  /** App namespace — prevents cross-app session bleed */
  appType: JamanAppType;
  /** User identity */
  userId: string;
  fullName: string;
  roleId: string;
  /** Restaurant context */
  restaurantId: string;
  /** Terminal/Station context */
  terminalId?: string;
  stationId?: string;
  stationName?: string;
  /** Business day context */
  businessDayId?: string;
  /** Active POS tab to restore navigation */
  activeTab?: string;
  /**
   * security-audit LOW-05: whether the terminal was locked when this session
   * was last touched. Persisted (not just held in component/store state) so
   * a webview reload — Ctrl+R, a crash-recovery "Restore Workspace" button,
   * or the accelerator itself — restores a locked terminal locked, instead of
   * silently dropping back into the previously signed-in user's unlocked
   * session with no PIN prompt.
   */
  locked?: boolean;
  /** Expiry timestamp (ms since epoch) */
  expiresAt: number;
  /** Wall-clock of last activity (used for lock-after-inactivity) */
  lastActiveAt: number;
}

const SESSION_VERSION = 1;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function storageKey(app: JamanAppType): string {
  return `jamanvaar:session:${app}:v${SESSION_VERSION}`;
}

/** Generate a non-cryptographic session token (sufficient for offline-first) */
function generateToken(): string {
  const rand = () => Math.random().toString(36).slice(2);
  return `${rand()}${rand()}${Date.now().toString(36)}`;
}

export const SessionPersistence = {
  /**
   * Save a session after successful login.
   * Must NOT include passwords or PINs.
   */
  save(app: JamanAppType, data: Omit<PersistedSession, 'sessionToken' | 'expiresAt' | 'lastActiveAt' | 'appType'>): PersistedSession {
    const session: PersistedSession = {
      ...data,
      appType: app,
      sessionToken: generateToken(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      lastActiveAt: Date.now()
    };
    try {
      localStorage.setItem(storageKey(app), JSON.stringify(session));
    } catch {
      // localStorage may be unavailable (private mode, storage full) — fail silently
    }
    return session;
  },

  /** Load and validate a session for a specific app. Returns null if missing/expired. */
  load(app: JamanAppType): PersistedSession | null {
    try {
      const raw = localStorage.getItem(storageKey(app));
      if (!raw) return null;
      const session = JSON.parse(raw) as PersistedSession;
      // Guard: must belong to this app
      if (session.appType !== app) return null;
      // Guard: must not be expired
      if (Date.now() > session.expiresAt) {
        SessionPersistence.clear(app);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  /** Touch last-active timestamp to extend inactivity window */
  touch(app: JamanAppType): void {
    try {
      const raw = localStorage.getItem(storageKey(app));
      if (!raw) return;
      const session = JSON.parse(raw) as PersistedSession;
      session.lastActiveAt = Date.now();
      localStorage.setItem(storageKey(app), JSON.stringify(session));
    } catch {
      // silently ignore
    }
  },

  /** Update a field inside the active session (e.g. activeTab) */
  update(app: JamanAppType, patch: Partial<PersistedSession>): void {
    try {
      const raw = localStorage.getItem(storageKey(app));
      if (!raw) return;
      const session = { ...JSON.parse(raw) as PersistedSession, ...patch };
      localStorage.setItem(storageKey(app), JSON.stringify(session));
    } catch {
      // silently ignore
    }
  },

  /** Clear the session for a specific app (called on logout) */
  clear(app: JamanAppType): void {
    try {
      localStorage.removeItem(storageKey(app));
    } catch {
      // silently ignore
    }
  },

  /** Check whether a valid (non-expired) session exists */
  isValid(app: JamanAppType): boolean {
    return SessionPersistence.load(app) !== null;
  }
};

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: Array<{ path: string; message: string }>
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Called when a signed-in session can no longer be used (revoked, signed out elsewhere, expired). */
let sessionEndedHandler: (() => void) | null = null;
export function onSessionEnded(handler: (() => void) | null) {
  sessionEndedHandler = handler;
}

async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/platform-auth/refresh`, {
    method: 'POST',
    credentials: 'include'
  });
  if (!res.ok) {
    accessToken = null;
    return false;
  }
  const body = await res.json();
  accessToken = body.accessToken;
  return true;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  skipAuthRetry?: boolean;
}

/**
 * After a page reload there is no access token in memory, only the refresh cookie. Sending the request anyway
 * meant every page load produced a wasted 401 (twice: /platform/me and /platform/system-health) before the
 * session was resumed (BUG-163). Resume the session first, then send the request with the token.
 */
async function resumeSessionIfNeeded(path: string): Promise<boolean> {
  if (accessToken !== null || path.startsWith('/api/v1/platform-auth/')) return false;
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  await refreshInFlight;
  return true;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // If the session was just tried and there is none, a 401 needs no second attempt.
  const triedResume = await resumeSessionIfNeeded(path);
  if (triedResume) options = { ...options, skipAuthRetry: true };
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401 && !options.skipAuthRetry) {
    const hadSession = accessToken !== null;
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    const refreshed = await refreshInFlight;
    if (refreshed) {
      return rawRequest<T>(path, { ...options, skipAuthRetry: true });
    }
    if (hadSession) sessionEndedHandler?.();
  }

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(data?.message ?? `Request failed (${res.status})`, res.status, data?.issues);
  }
  return data as T;
}

/** An authenticated file download (the response is not JSON, so it cannot go through `rawRequest`). */
async function download(path: string, retried = false): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
  if (res.status === 401 && !retried) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    if (await refreshInFlight) return download(path, true);
  }
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      message = (await res.json()).message ?? message;
    } catch {
      // not JSON
    }
    throw new ApiError(message, res.status);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  return { blob: await res.blob(), filename: /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null };
}

export const api = {
  download,
  get: <T>(path: string) => rawRequest<T>(path),
  post: <T>(path: string, body?: unknown) => rawRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => rawRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => rawRequest<T>(path, { method: 'DELETE' })
};

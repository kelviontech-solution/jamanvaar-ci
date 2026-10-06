/** Deadlines cover receiving the response body as well as connecting. Streams opt out explicitly. */
export class RequestTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';
  constructor(public readonly timeoutMs: number) {
    super(`The server did not complete the request within ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = 'RequestTimeoutError';
  }
}

export function requestDeadline(url: string): number {
  return /\/(backups|reports|export|attachments)(\/|\?|$)/.test(url) ? 90_000 : 30_000;
}

export async function fetchWithDeadline(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = requestDeadline(String(input)), fetcher: typeof fetch = fetch): Promise<Response> {
  const controller = new AbortController();
  let expired = false;
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetcher(input, { ...init, signal: controller.signal });
    const body = response.body ? await response.arrayBuffer() : null;
    const complete = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    Object.defineProperty(complete, 'url', { value: response.url });
    return complete;
  } catch (error) {
    if (expired) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

/** Refresh cookies/tokens are shared by tabs. Keep rotation in one browser lock. */
export async function withSessionLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? await locks.request(`jamanvaar-session-${name}`, action) : await action();
}

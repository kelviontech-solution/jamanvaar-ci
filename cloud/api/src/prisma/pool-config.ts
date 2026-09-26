/**
 * Connection-pool sizing from the environment, applied to the database URL only where the URL does not already say.
 * DB_POOL_SIZE -> connection_limit, DB_POOL_TIMEOUT_SECONDS -> pool_timeout (how long a query waits for a free connection
 * before failing fast instead of hanging). With N API instances, N x DB_POOL_SIZE must stay under PostgreSQL max_connections.
 */
export function withPoolParams(url: string | undefined, env: Record<string, string | undefined>): string | undefined {
  if (!url) return url;
  const add: string[] = [];
  const size = Number(env.DB_POOL_SIZE);
  const timeout = Number(env.DB_POOL_TIMEOUT_SECONDS);
  if (Number.isInteger(size) && size > 0 && !/[?&]connection_limit=/.test(url)) add.push(`connection_limit=${size}`);
  if (Number.isFinite(timeout) && timeout > 0 && !/[?&]pool_timeout=/.test(url)) add.push(`pool_timeout=${timeout}`);
  if (add.length === 0) return url;
  return url + (url.includes('?') ? '&' : '?') + add.join('&');
}

/** Interactive-transaction limits: how long to wait to start one, and how long one may run. */
export function transactionOptions(env: Record<string, string | undefined>): { maxWait: number; timeout: number } {
  const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
  return { maxWait: n(env.DB_TX_MAX_WAIT_MS, 5_000), timeout: n(env.DB_TX_TIMEOUT_MS, 15_000) };
}

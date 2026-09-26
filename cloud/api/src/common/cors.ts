/**
 * Which browser origins may call the API. The restaurant apps and consoles (credentialed) come from the configured
 * list. The public QR ordering routes are different: they carry no credentials at all, and are called from the
 * ordering website, so they accept exactly that website's origin and nothing else, without credentials.
 */
export interface CorsInputs {
  allowedOrigins: string[];
  /** Origins of the customer ordering website (from QR_ORDER_BASE_URL, plus QR_ALLOWED_ORIGINS). */
  qrOrigins: string[];
}

export type CorsDecision = { origin: boolean; credentials: boolean; methods?: string[]; allowedHeaders?: string[]; exposedHeaders?: string[] };

const PUBLIC_QR_PATH = /^\/api\/v1\/(public\/qr|qr-guest)(\/|\?|$)/;

export function corsFor(inputs: CorsInputs, path: string, origin: string | undefined): CorsDecision {
  if (PUBLIC_QR_PATH.test(path)) {
    return {
      origin: !!origin && inputs.qrOrigins.includes(origin),
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-QR-Session', 'If-None-Match'],
      exposedHeaders: ['ETag']
    };
  }
  return { origin: !!origin && inputs.allowedOrigins.includes(origin), credentials: true };
}

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The ordering website's origins: configured ones, and the local development port when not in production. */
export function qrOriginsFrom(env: { QR_ORDER_BASE_URL?: string; QR_ALLOWED_ORIGINS?: string; NODE_ENV?: string }): string[] {
  const out = new Set<string>();
  const base = originOf(env.QR_ORDER_BASE_URL);
  if (base) out.add(base);
  for (const o of (env.QR_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const parsed = originOf(o);
    if (parsed) out.add(parsed);
  }
  if (env.NODE_ENV !== 'production') out.add('http://localhost:5190');
  return [...out];
}

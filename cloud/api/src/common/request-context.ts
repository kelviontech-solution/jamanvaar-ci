import { randomUUID } from 'node:crypto';

/** A caller-supplied request id is kept only if it is short and plain; otherwise a fresh one is made. */
export function requestIdFrom(header: unknown): string {
  return typeof header === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(header) ? header : randomUUID();
}

/** Logs must never carry a customer's QR token or an order reference: they are the whole credential for that table or order. */
export function redactUrl(url: string): string {
  return url
    .replace(/(\/api\/v1\/public\/qr\/orders\/)[^/?#]+/, '$1:orderRef')
    .replace(/(\/api\/v1\/public\/qr\/)(?!orders\/|session)[^/?#]+/, '$1:token')
    .replace(/(\/q\/)[^/?#]+/, '$1:token');
}

/** Keep catalog identities portable; resolve bundled pictures at display time for each app. */
export function resolveMenuImage(source: string | undefined, options: { pathname?: string; apiBase?: string } = {}): string | undefined {
  if (!source) return undefined;
  const pathname = options.pathname ?? (typeof window === 'undefined' ? '/' : window.location.pathname);
  const prefix = /^\/(restaurant-admin|kiosk-admin|pos-admin|pos|captain|kds|kiosk|qr|q)(?:\/|$)/.exec(pathname)?.[0].replace(/\/$/, '') ?? '';
  const asset = source.replace(/^\/(?:restaurant-admin|kiosk-admin|pos-admin|pos|captain|kds|kiosk|qr|q)(?=\/assets\/(?:menu|branding)\/)/, '');
  if (/^\/assets\/(?:menu|branding)\//.test(asset)) return `${prefix}${asset}`;
  const image = /^img:([a-f0-9]{64})$/.exec(source);
  const url = image ? `/api/v1/public/qr/images/${image[1]}` : source;
  if (url.startsWith('/api/') && options.apiBase) return `${options.apiBase.replace(/\/+$/, '')}${url}`;
  return url;
}

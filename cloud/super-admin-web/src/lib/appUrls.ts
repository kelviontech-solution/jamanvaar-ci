type BrowserAddress = { origin: string; hostname: string };
const localHost = (host: string) =>
  host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '::1' || host === '0.0.0.0' || /^127\./.test(host);
/** Reject development/private-credential links when the console is hosted publicly. */
export function resolveAppUrl(configured: string | undefined, address: BrowserAddress, path: string, localDefault: string) {
  const local = localHost(address.hostname),
    fallback = local ? localDefault : new URL(path, address.origin).href;
  if (configured?.trim())
    try {
      const url = new URL(configured.trim());
      if (!url.username && !url.password && ['https:', 'http:'].includes(url.protocol) && (local || (url.protocol === 'https:' && !localHost(url.hostname))))
        return url.href.replace(/\/+$/, '');
    } catch {
      /* Use the current deployed origin rather than a broken build-time address. */
    }
  return fallback.replace(/\/+$/, '');
}
const address = typeof location === 'undefined' ? { origin: 'http://localhost:5180', hostname: 'localhost' } : location;
export const RESTAURANT_ADMIN_URL = resolveAppUrl(import.meta.env.VITE_RESTAURANT_ADMIN_URL, address, '/restaurant-admin/', 'http://localhost:5176');
export const QR_ADMIN_URL = resolveAppUrl(import.meta.env.VITE_QR_ADMIN_URL, address, '/qr/login/', 'http://localhost:5176/qr/login');
// Kiosk management is part of Restaurant Admin; legacy deployment overrides must not revive the retired app.
export const KIOSK_ADMIN_URL = RESTAURANT_ADMIN_URL;

export function ownerPortal(apps: readonly string[]) {
  return apps.includes('POS_ADMIN')
    ? { name: 'Restaurant Admin', url: RESTAURANT_ADMIN_URL }
    : apps.includes('KIOSK_ADMIN')
      ? { name: 'Kiosk Admin', url: KIOSK_ADMIN_URL }
      : apps.includes('QR_ORDERING')
        ? { name: 'QR Admin', url: QR_ADMIN_URL }
        : { name: 'Restaurant Admin', url: RESTAURANT_ADMIN_URL };
}

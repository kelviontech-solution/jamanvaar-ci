/** Only public setup context travels in this URL. Never include an activation key. */
export function kioskSetupLink(base: string | undefined | null, restaurantCode: string | null, branchId: string): string | null {
  if (!base || !restaurantCode) return null;
  try {
    const url = new URL(base);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) return null;
    url.search = '';
    url.hash = '';
    url.searchParams.set('restaurantCode', restaurantCode);
    url.searchParams.set('branchId', branchId);
    return url.href;
  } catch {
    return null;
  }
}
export const KIOSK_KEY_REQUEST_SUBJECT = 'Kiosk activation key';

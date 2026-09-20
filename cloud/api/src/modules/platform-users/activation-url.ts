/**
 * The link emailed to an invited teammate. The one-time token goes in the URL FRAGMENT: unlike a
 * query string it is never sent to a server, so it stays out of access logs, proxies and
 * Referer headers (BUG-081). Without a configured site URL this falls back to localhost, which is
 * only usable on the machine running the app - PlatformUsersService warns about that at startup.
 */
export function buildActivationUrl(baseUrl: string | undefined, email: string, activationToken: string): string {
  const base = (baseUrl || 'http://localhost:5180').replace(/\/$/, '');
  return `${base}/activate#email=${encodeURIComponent(email)}&token=${encodeURIComponent(activationToken)}`;
}

/**
 * An approximate, human-readable place for a sign-in, shown in the session list so a person can
 * spot a session that is not theirs (BUG-094).
 *
 * There is no GeoIP database here on purpose: a lookup would send every sign-in IP to a third
 * party, or ship a large database that goes stale. Instead the place comes from the CDN or proxy
 * in front of the API when it provides one (Cloudflare, Vercel and generic geo headers), and
 * private addresses are labelled as the local network. It is informational only, never used for
 * access decisions, so a spoofed header cannot grant anything.
 */
type Headers = Record<string, string | string[] | undefined> | undefined;

const CITY_HEADERS = ['cf-ipcity', 'x-vercel-ip-city', 'x-geo-city', 'x-appengine-city'];
const COUNTRY_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'x-geo-country', 'x-appengine-country'];
// XX = unknown, T1 = Tor exit; neither says anything useful about where a person is.
const UNKNOWN_COUNTRIES = new Set(['XX', 'T1', 'ZZ', '']);

function first(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const raw = headers?.[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && value.trim()) return value;
  }
  return null;
}

function clean(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // keep the raw text
  }
  return decoded.replace(/[^\p{L}\p{N} .,'-]/gu, '').trim().slice(0, 60);
}

export function isPrivateAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase().replace(/^::ffff:/, '');
  if (v === '::1' || v === 'localhost') return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(v) && v.includes(':')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(v);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

export function describeLocation(ip: string | null | undefined, headers: Headers): string | null {
  const cityRaw = first(headers, CITY_HEADERS);
  const countryRaw = first(headers, COUNTRY_HEADERS);
  const city = cityRaw ? clean(cityRaw) : '';
  const country = countryRaw && !UNKNOWN_COUNTRIES.has(countryRaw.trim().toUpperCase()) ? clean(countryRaw).toUpperCase() : '';
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  if (ip && isPrivateAddress(ip)) return 'Local network';
  return null;
}

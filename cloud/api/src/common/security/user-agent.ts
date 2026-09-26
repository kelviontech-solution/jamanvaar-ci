/** A short, human description of a browser from its User-Agent header, e.g. "Chrome 126 on Windows". */
export function describeDevice(userAgent?: string | null): string {
  // A sign-in that sent no User-Agent at all did not come from a web browser (a script, an API client or an integration test).
  if (!userAgent) return 'API client (no browser)';
  const ua = userAgent;

  let browser = 'Browser';
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Edg(?:e|A|iOS)?\/(\d+)/))) browser = `Edge ${m[1]}`;
  else if ((m = ua.match(/OPR\/(\d+)/))) browser = `Opera ${m[1]}`;
  else if ((m = ua.match(/(?:Firefox|FxiOS)\/(\d+)/))) browser = `Firefox ${m[1]}`;
  else if ((m = ua.match(/(?:Chrome|CriOS)\/(\d+)/))) browser = `Chrome ${m[1]}`;
  else if ((m = ua.match(/Version\/(\d+).*Safari/))) browser = `Safari ${m[1]}`;
  else if (/curl|node|axios|python|postman/i.test(ua)) browser = 'API client';

  let os = '';
  if (/iPhone/.test(ua)) os = 'iOS';
  else if (/iPad/.test(ua)) os = 'iPadOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (browser === 'Browser' && !os) return userAgent.length > 40 ? `${userAgent.slice(0, 40)}…` : userAgent; // unrecognised: show what it said
  return os ? `${browser} on ${os}` : browser;
}

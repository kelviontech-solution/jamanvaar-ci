/** A short, human description of a browser from its User-Agent header, e.g. "Chrome 126 on Windows". */
export function describeDevice(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown device';
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

  return os ? `${browser} on ${os}` : browser;
}

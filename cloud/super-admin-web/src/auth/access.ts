/**
 * Front-end mirror of the API's role -> area table. The API is the authority
 * (it returns 403); this only decides what the menu, pages and buttons show,
 * using the permissions the server sends with the signed-in user.
 */
export type Area =
  | 'self' | 'restaurants' | 'subscriptions' | 'billing' | 'devices' | 'ops'
  | 'licensing' | 'support' | 'catalog' | 'audit' | 'reports' | 'team' | 'settings';

export type AccessLevel = 'read' | 'write';
export type Permissions = Partial<Record<Area, AccessLevel>>;

const ROUTE_AREAS: Array<{ prefix: string; area: Area }> = [
  { prefix: '/restaurants', area: 'restaurants' },
  { prefix: '/owners', area: 'restaurants' },
  { prefix: '/branches', area: 'restaurants' },
  { prefix: '/subscriptions', area: 'subscriptions' },
  { prefix: '/plans', area: 'subscriptions' },
  { prefix: '/entitlements', area: 'subscriptions' },
  { prefix: '/feature-catalog', area: 'subscriptions' },
  { prefix: '/billing', area: 'billing' },
  { prefix: '/payment-connections', area: 'billing' },
  { prefix: '/activation-keys', area: 'devices' },
  { prefix: '/devices', area: 'devices' },
  { prefix: '/applications', area: 'ops' },
  { prefix: '/sync-monitor', area: 'ops' },
  { prefix: '/backups', area: 'ops' },
  { prefix: '/system-health', area: 'ops' },
  { prefix: '/sandboxes', area: 'ops' },
  { prefix: '/offline-policy', area: 'licensing' },
  { prefix: '/support', area: 'support' },
  { prefix: '/tickets', area: 'support' },
  { prefix: '/qr-ordering', area: 'catalog' },
  { prefix: '/ai-assistant', area: 'catalog' },
  { prefix: '/catalog', area: 'catalog' },
  { prefix: '/reports', area: 'reports' },
  { prefix: '/audit-logs', area: 'audit' },
  { prefix: '/team', area: 'team' },
  { prefix: '/settings', area: 'settings' },
  { prefix: '/notifications', area: 'self' },
  { prefix: '/profile', area: 'self' }
];

/** The area a page belongs to. The dashboard ("/") is part of reports. */
export function areaForRoute(pathname: string): Area | null {
  if (pathname === '/' || pathname === '/dashboard') return 'reports';
  const hit = ROUTE_AREAS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
  return hit ? hit.area : null;
}

export function hasAccess(permissions: Permissions | undefined, area: Area | null, level: AccessLevel = 'read'): boolean {
  if (!permissions) return false;
  if (area === null) return false;
  const granted = permissions[area];
  if (!granted) return false;
  return level === 'read' ? true : granted === 'write';
}

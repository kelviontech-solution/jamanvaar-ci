/**
 * Role-based access control for platform (Super Admin) team members.
 *
 * Every platform endpoint belongs to an *area*. A role is granted 'read' or
 * 'write' on each area (write includes read). Anything a role is not granted
 * is denied, and a path that maps to no area is only open to the two
 * owner-level roles (deny by default). The same table is sent to the web app
 * so the menu and buttons match what the server will actually allow.
 */
export type PlatformRoleName =
  | 'PLATFORM_OWNER'
  | 'SUPER_ADMIN'
  | 'PLATFORM_OPS'
  | 'SUPPORT_ADMIN'
  | 'FINANCE_ADMIN'
  | 'READ_ONLY';

export type Area =
  | 'self'
  | 'restaurants'
  | 'subscriptions'
  | 'billing'
  | 'devices'
  | 'ops'
  | 'licensing'
  | 'support'
  | 'catalog'
  | 'audit'
  | 'reports'
  | 'team'
  | 'settings';

export type AccessLevel = 'read' | 'write';

const ALL_AREAS: Area[] = [
  'self', 'restaurants', 'subscriptions', 'billing', 'devices', 'ops',
  'licensing', 'support', 'catalog', 'audit', 'reports', 'team', 'settings'
];

function grant(spec: Partial<Record<Area, AccessLevel>>): Partial<Record<Area, AccessLevel>> {
  return { self: 'write', ...spec };
}

const everything = (level: AccessLevel): Partial<Record<Area, AccessLevel>> =>
  Object.fromEntries(ALL_AREAS.map((a) => [a, level])) as Partial<Record<Area, AccessLevel>>;

export const ROLE_ACCESS: Record<PlatformRoleName, Partial<Record<Area, AccessLevel>>> = {
  PLATFORM_OWNER: everything('write'),
  SUPER_ADMIN: { ...everything('write'), settings: 'read' },
  PLATFORM_OPS: grant({
    restaurants: 'read', subscriptions: 'read', devices: 'write', ops: 'write', licensing: 'write',
    support: 'read', catalog: 'read', audit: 'read', reports: 'read', team: 'read'
  }),
  SUPPORT_ADMIN: grant({
    restaurants: 'read', subscriptions: 'read', devices: 'read', ops: 'read', support: 'write',
    catalog: 'read', audit: 'read', reports: 'read', team: 'read'
  }),
  FINANCE_ADMIN: grant({
    restaurants: 'read', subscriptions: 'write', billing: 'write', audit: 'read', reports: 'read', team: 'read'
  }),
  READ_ONLY: grant({
    restaurants: 'read', subscriptions: 'read', billing: 'read', devices: 'read', ops: 'read',
    support: 'read', catalog: 'read', audit: 'read', reports: 'read', team: 'read'
  })
};

/** Ordered: the first matching prefix wins, so the more specific ones come first. */
const AREA_RULES: Array<{ test: (p: string) => boolean; area: Area }> = [
  { test: (p) => /^\/api\/v1\/restaurants\/[^/]+\/backups(\/|$)/.test(p), area: 'ops' },
  { test: (p) => /^\/api\/v1\/restaurants\/[^/]+\/license-certificate(\/|$)/.test(p), area: 'licensing' },
  { test: (p) => /^\/api\/v1\/restaurants\/[^/]+\/payment-connection(\/|$)/.test(p), area: 'billing' },
  { test: (p) => /^\/api\/v1\/(restaurants|owners|branches)(\/|$)/.test(p), area: 'restaurants' },
  { test: (p) => /^\/api\/v1\/(subscriptions|plans)(\/|$)/.test(p), area: 'subscriptions' },
  { test: (p) => /^\/api\/v1\/(invoices|payments|payment-connections)(\/|$)/.test(p), area: 'billing' },
  { test: (p) => /^\/api\/v1\/(activation-keys|devices)(\/|$)/.test(p), area: 'devices' },
  { test: (p) => /^\/api\/v1\/(applications)(\/|$)/.test(p), area: 'ops' },
  { test: (p) => /^\/api\/v1\/platform\/(telemetry|system-health|sandboxes|backups|jobs)(\/|$)/.test(p), area: 'ops' },
  { test: (p) => /^\/api\/v1\/platform\/offline-policy(\/|$)/.test(p), area: 'licensing' },
  { test: (p) => /^\/api\/v1\/(support|support-tickets)(\/|$)/.test(p), area: 'support' },
  { test: (p) => /^\/api\/v1\/(master-catalog|ai-assistant|qr-ordering)(\/|$)/.test(p), area: 'catalog' },
  { test: (p) => /^\/api\/v1\/audit-logs(\/|$)/.test(p), area: 'audit' },
  { test: (p) => /^\/api\/v1\/platform\/(dashboard|reports)(\/|$)/.test(p), area: 'reports' },
  { test: (p) => /^\/api\/v1\/platform-users(\/|$)/.test(p), area: 'team' },
  { test: (p) => /^\/api\/v1\/platform\/settings(\/|$)/.test(p), area: 'settings' },
  { test: (p) => /^\/api\/v1\/platform-auth(\/|$)/.test(p), area: 'self' },
  { test: (p) => /^\/api\/v1\/platform\/(me|sessions|notifications)(\/|$)/.test(p), area: 'self' }
];

export function areaForPath(rawPath: string): Area | null {
  const path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
  const rule = AREA_RULES.find((r) => r.test(path));
  return rule ? rule.area : null;
}

const OWNER_LEVEL: PlatformRoleName[] = ['PLATFORM_OWNER', 'SUPER_ADMIN'];

export function requiredLevel(method: string): AccessLevel {
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? 'read' : 'write';
}

export function canAccess(role: PlatformRoleName, area: Area | null, method: string): boolean {
  const table = ROLE_ACCESS[role];
  if (!table) return false;
  if (area === null) return OWNER_LEVEL.includes(role);
  const granted = table[area];
  if (!granted) return false;
  return requiredLevel(method) === 'read' ? true : granted === 'write';
}

export function permissionsForRole(role: PlatformRoleName): Partial<Record<Area, AccessLevel>> {
  return { ...(ROLE_ACCESS[role] || {}) };
}

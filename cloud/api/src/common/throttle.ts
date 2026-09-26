import { Throttle } from '@nestjs/throttler';

/**
 * Limit for the endpoints terminals poll (order, table, message and entity sync, heartbeat).
 * All of a restaurant's terminals reach the cloud through one router, so they share one address;
 * the global 120 requests a minute per address is less than a handful of terminals legitimately
 * send, and made POS miss staff, menu and table sync ("429 Too Many Requests"). These endpoints
 * require a valid device credential, so a much higher ceiling is safe; everything else keeps the
 * strict global limit.
 */
// The limit is per ADDRESS, and a whole branch (POS, Kiosks, Captains, KDS) shares one. The sustained-load run (30 terminals, 267 requests
// a second, far above real use) showed 1500 a minute is exhausted in seconds by one busy branch, so the ceiling is 12000 and is
// configurable (DEVICE_SYNC_RPM) for very large sites or carrier-grade NAT.
export const DEVICE_SYNC_REQUESTS_PER_MINUTE = Number(process.env.DEVICE_SYNC_RPM) > 0 ? Number(process.env.DEVICE_SYNC_RPM) : 12_000;

export const DeviceSyncThrottle = () => Throttle({ default: { limit: DEVICE_SYNC_REQUESTS_PER_MINUTE, ttl: 60_000 } });

/**
 * QR guest ordering (BUG-119) has no device credential and no login at all — it is deliberately reachable by
 * anyone who scanned a table's QR code — so it keeps its own, much lower ceiling per address rather than the
 * device-trusted one above. Several diners at one restaurant can share a single WiFi/NAT address, so this is
 * higher than the platform's ordinary 120/min default but far below a device's, and the write path (placing an
 * order) is stricter than the read path (loading the menu).
 */
export const QR_GUEST_READ_REQUESTS_PER_MINUTE = 60;
export const QR_GUEST_ORDER_REQUESTS_PER_MINUTE = 12;

export const QrGuestReadThrottle = () => Throttle({ default: { limit: QR_GUEST_READ_REQUESTS_PER_MINUTE, ttl: 60_000 } });
export const QrGuestOrderThrottle = () => Throttle({ default: { limit: QR_GUEST_ORDER_REQUESTS_PER_MINUTE, ttl: 60_000 } });

/**
 * Restaurant-code lookup and owner-auth endpoints (Phase 9) are reachable with no credential at
 * all — the global 120/min/IP default is sized for ordinary authenticated app traffic, not for
 * an enumeration/brute-force-sensitive public endpoint. This is independent of, and on top of,
 * the per-account lockout TenantAuthService already enforces (see its LOGIN_MAX_ATTEMPTS/
 * RESET_MAX_ATTEMPTS) — that stops one account being brute-forced; this stops one address
 * spraying many different accounts.
 */
export const PUBLIC_AUTH_REQUESTS_PER_MINUTE = Number(process.env.PUBLIC_AUTH_RPM) > 0 ? Number(process.env.PUBLIC_AUTH_RPM) : 20;

export const PublicAuthThrottle = () => Throttle({ default: { limit: PUBLIC_AUTH_REQUESTS_PER_MINUTE, ttl: 60_000 } });

import { Throttle } from '@nestjs/throttler';

/**
 * Limit for the endpoints terminals poll (order, table, message and entity sync, heartbeat).
 * All of a restaurant's terminals reach the cloud through one router, so they share one address;
 * the global 120 requests a minute per address is less than a handful of terminals legitimately
 * send, and made POS miss staff, menu and table sync ("429 Too Many Requests"). These endpoints
 * require a valid device credential, so a much higher ceiling is safe; everything else keeps the
 * strict global limit.
 */
export const DEVICE_SYNC_REQUESTS_PER_MINUTE = 1500;

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

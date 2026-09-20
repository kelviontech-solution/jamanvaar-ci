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

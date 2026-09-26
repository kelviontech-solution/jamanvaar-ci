import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subscription } from 'rxjs';
import { RealtimeBus } from '../../common/realtime/realtime-bus';

/**
 * A scan is resolved with about eight small queries (code, restaurant, branch, subscription, entitlement, settings, table).
 * A busy table repeats that for every request, so the result is kept for a very short time. Safety comes from three things:
 * the entry is keyed by the unguessable token and holds only that token's own restaurant; a revoke, disable, regenerate or
 * settings change drops every entry of that restaurant on ALL instances immediately (PostgreSQL NOTIFY); and anything changed
 * elsewhere (a plan downgrade) is picked up when the entry expires, at most QR_RESOLVE_CACHE_MS later (default 2 s, 0 = off).
 * Failures are never cached, so a bad token always reaches the database limiter.
 */
@Injectable()
export class QrResolutionCache<T extends { restaurant: { id: string } }> implements OnModuleDestroy {
  private readonly ttl: number;
  private readonly entries = new Map<string, { at: number; value: T }>();
  private readonly sub: Subscription;
  readonly stats = { hits: 0, misses: 0, invalidations: 0 };

  constructor(config: ConfigService, private readonly bus: RealtimeBus) {
    const v = Number(config.get<string>('QR_RESOLVE_CACHE_MS'));
    this.ttl = Number.isFinite(v) && v >= 0 ? v : 2000;
    this.sub = bus.invalidations$.subscribe((rid) => this.drop(rid));
  }

  onModuleDestroy(): void {
    this.sub.unsubscribe();
  }

  get(token: string): T | undefined {
    if (this.ttl === 0) return undefined;
    const hit = this.entries.get(token);
    if (hit && Date.now() - hit.at < this.ttl) { this.stats.hits++; return hit.value; }
    if (hit) this.entries.delete(token);
    this.stats.misses++;
    return undefined;
  }

  set(token: string, value: T): void {
    if (this.ttl === 0) return;
    if (this.entries.size > 5000) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(token, { at: Date.now(), value });
  }

  private drop(restaurantId: string): void {
    this.stats.invalidations++;
    for (const [k, v] of this.entries) if (v.value.restaurant.id === restaurantId) this.entries.delete(k);
  }

  /** Call after any change to a restaurant's codes or QR settings. */
  invalidate(restaurantId: string): void {
    this.bus.publishInvalidation(restaurantId);
  }
}

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RealtimeBus } from '../../common/realtime/realtime-bus';

/**
 * Anything that can change whether a QR code may be served (a plan, a subscription, an application entitlement, a restaurant or
 * branch status, a platform QR override) is a platform-side write. After one succeeds, every cached QR resolution on every API
 * instance is dropped, so a downgrade or suspension takes effect at once rather than when the short cache entry expires.
 */
const AFFECTS_QR = /^\/api\/v1\/(subscriptions|plans|restaurants|branches|application-entitlements|qr-ordering|activation-keys|devices\/(?!me(\/|\?|$))|devices\/me\/fleet|tenant\/branches|tenant\/qr-ordering|restaurants\/[^/]+\/applications|subscriptions\/[^/]+\/applications)(\/|\?|$)?/;

@Injectable()
export class QrCacheFlushInterceptor implements NestInterceptor {
  constructor(private readonly bus: RealtimeBus) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string; url?: string }>();
    const path = req.originalUrl ?? req.url ?? '';
    if (!req.method || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || !AFFECTS_QR.test(path)) return next.handle();
    return next.handle().pipe(tap(() => this.bus.publishInvalidation('*')));
  }
}

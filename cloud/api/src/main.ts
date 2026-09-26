import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { redactUrl, requestIdFrom } from './common/request-context';
import { bodyLimitFor } from './common/body-limits';
import { json, raw, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsFor, qrOriginsFrom } from './common/cors';

async function bootstrap() {
  // Default body size (~100kb) is too small for a full restaurant database
  // backup upload (see modules/backups) — bodyParser: false + manual json()
  // lets that one route accept up to 20MB while everything else is unaffected.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // The Cashfree webhook needs the exact raw request bytes for HMAC signature
  // verification (see CashfreeGatewayService.verifyWebhookSignature) — this
  // path-scoped raw() must be registered before the blanket json() below.
  // body-parser's own "already parsed" check (req._body) then makes json()
  // skip this one path instead of double-consuming the request stream, so
  // every other route is unaffected.
  app.use('/api/v1/payments/cashfree/webhook', raw({ type: '*/*', limit: '1mb' }));
  // Body size depends on the route (see common/body-limits.ts): small by default, large only where pictures and backups really go.
  const jsonParsers = new Map<number, ReturnType<typeof json>>();
  app.use((req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const limit = bodyLimitFor(req.originalUrl ?? req.url ?? '', typeof req.headers.authorization === 'string' && req.headers.authorization.length > 0);
    let parser = jsonParsers.get(limit);
    if (!parser) { parser = json({ limit }); jsonParsers.set(limit, parser); }
    parser(req, res, next);
  });
  app.use(urlencoded({ extended: true, limit: '64kb' }));
  // Behind a reverse proxy the connecting address is the proxy's: say how many proxies there are so per-address limits see the real caller.
  // Never `true`: that would let any caller choose their own address.
  const trustProxy = app.get(ConfigService).get<string>('TRUST_PROXY');
  if (trustProxy !== undefined && trustProxy !== '') app.getHttpAdapter().getInstance().set('trust proxy', Number(trustProxy));
  const config = app.get(ConfigService);

  // HTTP Security Headers (SEC-012 fix)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );
  app.use(cookieParser());

  // NestJS's default Logger only prints bootstrap events (module init, route
  // mapping) once at startup — it never logs individual requests. Without
  // this, the terminal stays silent while the app is actually being used,
  // making it impossible to verify which APIs fired from the UI.
  const httpLogger = new Logger('HTTP');
  app.use((req: import('express').Request, res: import('express').Response, next: () => void) => {
    const start = Date.now();
    // Every request gets an id, returned to the caller so a support conversation can quote it and logs can be followed.
    const requestId = requestIdFrom(req.headers['x-request-id']);
    (req as unknown as { requestId: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      httpLogger.log(`${requestId} ${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  // The local development consoles are only a default outside production; production must list its own origins (an unset list allows none).
  const devOrigins = 'http://localhost:5180,http://localhost:5176,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5177,http://localhost:5179';
  const allowedOrigins = (
    config.get<string>('CORS_ALLOWED_ORIGINS') ?? (config.get<string>('NODE_ENV') === 'production' ? '' : devOrigins)
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const qrOrigins = qrOriginsFrom({ QR_ORDER_BASE_URL: config.get<string>('QR_ORDER_BASE_URL'), QR_ALLOWED_ORIGINS: config.get<string>('QR_ALLOWED_ORIGINS'), NODE_ENV: config.get<string>('NODE_ENV') });
  // Per-request decision: consoles and terminals by the configured list, the public QR routes by the ordering website only.
  app.enableCors(((req: { url?: string; headers: { origin?: string } }, callback: (err: Error | null, options?: Record<string, unknown>) => void) => {
    callback(null, corsFor({ allowedOrigins, qrOrigins }, req.url ?? '/', req.headers.origin));
  }) as never);

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`JAMANVAAR cloud API listening on :${port}`);
}

bootstrap();

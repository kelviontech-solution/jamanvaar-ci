import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { redactUrl, requestIdFrom } from './common/request-context';
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
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
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

  const allowedOrigins = (
    config.get<string>('CORS_ALLOWED_ORIGINS') ??
      'http://localhost:5180,http://localhost:5176,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5177,http://localhost:5179'
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

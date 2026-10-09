import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { redactUrl, requestIdFrom } from './common/request-context';
import { installBodyParsers } from './common/body-limits';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsFor, qrOriginsFrom } from './common/cors';

async function bootstrap() {
  // Default body size (~100kb) is too small for a full restaurant database
  // backup upload (see modules/backups) — bodyParser: false + manual json()
  // lets that one route accept up to 20MB while everything else is unaffected.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // The Razorpay webhook needs the exact raw request bytes for HMAC signature
  // verification (see RazorpayGatewayService.verifyWebhookSignature) — this
  // path-scoped raw() must be registered before the blanket json() below.
  // body-parser's own "already parsed" check (req._body) then makes json()
  // skip this one path instead of double-consuming the request stream, so
  // every other route is unaffected.
  installBodyParsers(app);
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
    res.on('close', () => {
      if (res.writableFinished) return;
      const message = `${requestId} ${req.method} ${redactUrl(req.originalUrl)} connection closed after ${Date.now() - start}ms`;
      if (req.headers.accept?.includes('text/event-stream')) httpLogger.debug(message);
      else httpLogger.warn(message);
    });
    next();
  });

  // The local development consoles are only a default outside production; production must list its own origins (an unset list allows none).
  const devOrigins = 'http://localhost:5180,http://localhost:5176,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5177,http://localhost:5179';
  // Every officially-shipped POS/Admin/Kiosk/Captain/KDS desktop and Android build is a Tauri
  // app, and Tauri maps its own custom-scheme frontend to this fixed origin on Windows and
  // Android (http://tauri.localhost; tauri://localhost on older Tauri/other platforms) --
  // never the console's own https://system.kelviontech.in origin. This has nothing to do with
  // which restaurant or deployment is calling in, so it is not something CORS_ALLOWED_ORIGINS
  // should need to list per-environment -- every installed terminal app needs it, always.
  const tauriAppOrigins = ['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'];
  const allowedOrigins = [
    ...(
      config.get<string>('CORS_ALLOWED_ORIGINS') ?? (config.get<string>('NODE_ENV') === 'production' ? '' : devOrigins)
    )
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    ...tauriAppOrigins
  ];
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

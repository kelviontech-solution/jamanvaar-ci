import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, raw, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

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
  const allowedOrigins = (
    config.get<string>('CORS_ALLOWED_ORIGINS') ?? 'http://localhost:5180,http://localhost:5176'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`JAMANVAAR cloud API listening on :${port}`);
}

bootstrap();

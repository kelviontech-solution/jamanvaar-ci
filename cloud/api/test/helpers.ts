import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { vi } from 'vitest';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/** email -> most recently emailed 6-digit code, captured by the spy createTestApp() installs. */
const lastOtpByEmail = new Map<string, string>();

export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();

  // Sign-in now emails a 6-digit OTP before a session is issued (platform-auth login flow).
  // Every test that needs a real session needs that code, and none of them should be sending
  // real mail through the (real, configured) SMTP account during a test run — so this one spy,
  // installed centrally for every app instance, captures the code and swallows the send. Tests
  // that specifically exercise email delivery (e.g. password-reset.e2e.spec.ts) still install
  // their own spy afterwards, which simply replaces this one.
  vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, _subject, html) => {
    const match = /(\d{6})<\/span>/.exec(html);
    if (match) lastOtpByEmail.set(to, match[1]);
    return true;
  });

  return app;
}

/**
 * Completes the platform-auth two-step sign-in (POST login -> emailed OTP -> POST verify-otp)
 * and returns the verify-otp response, so existing call sites that used to read
 * `.body.accessToken` / `.body.user` / `.headers['set-cookie']` straight off a single /login
 * call keep working unchanged aside from swapping which function they call.
 */
export async function platformLogin(app: INestApplication, email: string, password: string): Promise<request.Response> {
  const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password });
  if (loginRes.status !== 200) return loginRes;
  const otp = lastOtpByEmail.get(email);
  if (!otp) throw new Error(`platformLogin: no OTP was captured for ${email} — did createTestApp() run for this app?`);
  return request(app.getHttpServer()).post('/api/v1/platform-auth/verify-otp').send({ otpToken: loginRes.body.otpToken, otp });
}

/** Low bcrypt cost factor — correctness matters here, not production hashing speed. */
export async function createTestPlatformUser(
  prisma: PrismaService,
  opts: { email: string; password: string; role?: 'PLATFORM_OWNER' | 'SUPER_ADMIN' | 'PLATFORM_OPS' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN' | 'READ_ONLY' }
) {
  return prisma.platformUser.create({
    data: {
      email: opts.email,
      passwordHash: await bcrypt.hash(opts.password, 4),
      fullName: 'Test Platform User',
      role: opts.role ?? 'PLATFORM_OWNER',
      status: 'ACTIVE'
    }
  });
}

export function extractCookie(
  setCookieHeader: string | string[] | undefined,
  name: string
): string | undefined {
  const values = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  const raw = values.find((c) => c.startsWith(`${name}=`));
  return raw?.split(';')[0]?.split('=')[1];
}

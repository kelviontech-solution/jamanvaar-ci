import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { vi } from 'vitest';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { installBodyParsers } from '../src/common/body-limits';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';
import { StaffSessionService } from '../src/modules/entity-sync/staff-session.service';
import { hashOpaqueToken } from '../src/common/security/token.util';

/** An explicitly authorized finance fixture. Real refund guards still verify scope, signature, expiry and current staff role. */
export async function refundManagerSession(app: INestApplication, prisma: PrismaService, deviceToken: string): Promise<string> {
  const device = await prisma.runAsPlatform(tx => tx.device.findUniqueOrThrow({ where: { deviceTokenHash: hashOpaqueToken(deviceToken) } }));
  const staffId = `refund-manager-${device.id}`;
  await prisma.runAsTenant(device.restaurantId, tx => tx.syncedEntity.upsert({
    where: { restaurantId_entityType_externalId: { restaurantId: device.restaurantId, entityType: 'STAFF_USER', externalId: staffId } },
    create: { restaurantId: device.restaurantId, entityType: 'STAFF_USER', externalId: staffId, payload: { id: staffId, fullName: 'Verified Refund Manager', roleId: 'role-manager', isActive: true } },
    update: {}
  }));
  return app.get(StaffSessionService).issue('session', { restaurantId: device.restaurantId, deviceId: device.id, staffId, role: 'role-manager', name: 'Verified Refund Manager' }).token;
}

/** Finance fixtures confirm durable kitchen admission, rather than pretending a local receipt is a delivered KOT. */
export async function admitPaidKioskOrder(prisma: PrismaService, paymentId: string): Promise<void> {
  await prisma.runAsPlatform(async tx => {
    const payment = await tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    const original = payment.order;
    const lines = Array.isArray(original.items) && original.items.length ? original.items as any[] : [{ externalItemId: 'qa-kitchen-item', name: 'QA Kitchen Item', quantity: 1, unitPrice: payment.amount }];
    await tx.order.update({ where: { id: original.id }, data: { status: 'PAID', items: lines } });
    const branchId = original.kioskId ? (await tx.device.findUnique({ where: { id: original.kioskId } }))?.branchId : original.branchId;
    await tx.syncedOrder.upsert({
      where: { restaurantId_externalOrderId: { restaurantId: payment.restaurantId, externalOrderId: original.externalOrderId } },
      create: { restaurantId: payment.restaurantId, externalOrderId: original.externalOrderId, branchId, source: 'KIOSK', orderType: 'TAKEAWAY', status: 'CONFIRMED', subtotal: original.subtotal, taxAmount: original.taxAmount, totalAmount: payment.amount, discountAmount: 0, paymentStatus: 'SUCCESS', paymentMethod: 'UPI', items: lines.map((l,i) => ({ externalItemId: `qa-line-${i}`, menuItemId: l.externalItemId, name: l.name, unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.unitPrice * l.quantity, modifiers: (l.modifiers ?? []).map((m: any) => m.name), modifierDetails: (l.modifiers ?? []).map((m: any) => ({ optionId: m.id, optionName: m.name, priceDelta: m.priceDelta })), kitchenStatus: 'PENDING' })) },
      update: {}
    });
  });
}

/** email -> most recently emailed 6-digit code, captured by the spy createTestApp() installs. */
const lastOtpByEmail = new Map<string, string>();

export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  // Same body parsers and size limits as the real server (see common/body-limits.ts).
  const app = moduleRef.createNestApplication({ bodyParser: false });
  installBodyParsers(app);
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

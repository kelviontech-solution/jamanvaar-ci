import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  return app;
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

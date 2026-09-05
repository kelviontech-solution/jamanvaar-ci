import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every tenant-owned table (Restaurant, Branch, User, Device, Subscription,
 * ActivationKey) has Postgres Row-Level Security enabled and FORCED — see
 * prisma/migrations/*_init/migration.sql. RLS reads two session variables:
 *
 *   app.is_platform_context  — 'true' for an authenticated Super Admin action
 *   app.current_restaurant_id — the tenant a scoped request is allowed to see
 *
 * Postgres session variables only exist inside a transaction/connection, so
 * these context wrappers are the ONLY sanctioned way to touch a tenant-owned
 * table. A query run through the bare `PrismaService` (not through one of
 * these) sets neither variable — the RLS policy then denies every row,
 * fail-closed, not merely "the app forgot to filter."
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Runs `fn` with platform-level RLS context — full cross-tenant visibility, always audited by the caller. */
  async runAsPlatform<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_context = 'true'`);
      return fn(tx);
    });
  }

  /** Runs `fn` scoped to exactly one restaurant's RLS context. */
  async runAsTenant<T>(restaurantId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    // Postgres SET does not support bind parameters for the value, so this is
    // interpolated — the UUID-shape check below is what keeps that safe, not
    // the caller's discipline.
    if (!UUID_RE.test(restaurantId)) {
      throw new BadRequestException('Invalid tenant context');
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_restaurant_id = '${restaurantId}'`);
      return fn(tx);
    });
  }
}

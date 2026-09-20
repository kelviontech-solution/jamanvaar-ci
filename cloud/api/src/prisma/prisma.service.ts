import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { assessRlsRole } from './rls-role';

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
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.checkRlsRole();
  }

  /** Fails startup in production, and warns elsewhere, when the connected role would bypass RLS (BUG-075). */
  private async checkRlsRole() {
    const rows = await this.$queryRaw<{ name: string; superuser: boolean; bypassrls: boolean }[]>`
      SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS bypassrls FROM pg_roles WHERE rolname = current_user
    `;
    if (!rows[0]) return;
    const result = assessRlsRole({ name: rows[0].name, superuser: rows[0].superuser, bypassRls: rows[0].bypassrls }, process.env.NODE_ENV);
    if (result.enforced) return;
    if (result.fatal) throw new Error(result.message);
    this.logger.warn(result.message);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private platformClient: Prisma.TransactionClient | null = null;

  /**
   * A platform-context view of the client for platform-wide services (reports, audit, catalog...).
   * Every call runs in its own runAsPlatform transaction, so it works under row-level security instead
   * of only by the accident of connecting as a superuser (BUG-075). Use `runAsPlatform` directly when
   * several statements must share one transaction.
   */
  get platformDb(): Prisma.TransactionClient {
    if (!this.platformClient) {
      this.platformClient = new Proxy({} as Record<string, unknown>, {
        get: (_target, model: string) =>
          new Proxy({} as Record<string, unknown>, {
            get: (_t, operation: string) => (...args: unknown[]) =>
              this.runAsPlatform((tx) => ((tx as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>)[model][operation](...args)) as Promise<unknown>)
          })
      }) as unknown as Prisma.TransactionClient;
    }
    return this.platformClient;
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

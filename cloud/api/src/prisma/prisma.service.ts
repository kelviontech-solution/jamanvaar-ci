import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { assessRlsRole } from './rls-role';
import * as fs from 'fs';
import * as path from 'path';

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
    await this.checkMigrationsApplied();
  }

  /**
   * B2-004: after a `git pull` that added a migration, `nest start --watch` failed to recompile
   * (the Prisma Client didn't yet have the new columns) and the watcher just kept the previous
   * build running — every route depending on the pulled change silently 404'd or misbehaved, with
   * nothing in the terminal or the apps saying why. This can't retroactively fix *that* stale
   * process (it never got to run this new code either), but it closes the gap for every run after:
   * compares this checkout's `prisma/migrations/*` folders against what `_prisma_migrations`
   * records as applied, and fails loudly instead of serving silently behind schema. Same
   * fail-in-production / warn-elsewhere shape as `checkRlsRole` above (BUG-075).
   */
  private async checkMigrationsApplied() {
    let migrationDirs: string[];
    try {
      const migrationsPath = path.join(__dirname, '..', '..', '..', 'prisma', 'migrations');
      migrationDirs = fs
        .readdirSync(migrationsPath, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // Can't locate the migrations folder from here (an unusual deployment layout) - this is a
      // dev-convenience check, not a hard requirement, so skip rather than block startup on it.
      return;
    }
    if (migrationDirs.length === 0) return;

    let applied: Set<string>;
    try {
      const rows = await this.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
      `;
      applied = new Set(rows.map((r) => r.migration_name));
    } catch {
      // The migrations table itself doesn't exist yet (a genuinely fresh database) - `prisma
      // migrate deploy` handles that case on its own; nothing for this check to add here.
      return;
    }

    const pending = migrationDirs.filter((name) => !applied.has(name));
    if (pending.length === 0) return;

    const message =
      `Database is behind ${pending.length} migration(s) not yet applied: ${pending.join(', ')}. ` +
      `Run "npm run prisma:deploy --workspace=@jamanvaar/cloud-api" (or "prisma migrate deploy" from cloud/api), ` +
      `then restart the API - it was about to silently serve a build that doesn't match the connected database.`;
    if (process.env.NODE_ENV === 'production') throw new Error(message);
    this.logger.warn(message);
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

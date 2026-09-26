import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Small shared counters in PostgreSQL (the same `RateCounter` table the QR limiter uses), for "no more than N of these in this
 * window" decisions that must hold across every API instance and survive a restart. Keys are hashed, never stored as given.
 */
@Injectable()
export class DbCounters {
  constructor(private readonly prisma: PrismaService) {}

  private key(k: string): string {
    return createHash('sha256').update(`dbc:${k}`).digest('base64url').slice(0, 22);
  }

  /** How many times `k` was recorded in the current window. */
  async count(k: string, windowMs: number): Promise<number> {
    const window = Math.floor(Date.now() / windowMs);
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`SELECT "count" FROM "RateCounter" WHERE "key" = ${this.key(k)} AND "windowStart" = ${window}::bigint`
    );
    return rows[0] ? Number(rows[0].count) : 0;
  }

  /** Records one occurrence of `k` in the current window and returns the new count. */
  async add(k: string, windowMs: number): Promise<number> {
    const window = Math.floor(Date.now() / windowMs);
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      INSERT INTO "RateCounter" AS c ("key", "windowStart", "count") VALUES (${this.key(k)}, ${window}::bigint, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = c."count" + 1
      RETURNING "count"`);
    return Number(rows[0].count);
  }
}

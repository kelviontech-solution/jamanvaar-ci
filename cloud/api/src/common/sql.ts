import { Prisma } from '@prisma/client';

/**
 * Prisma sends a Date in a raw query as timestamptz, while our columns are UTC `timestamp`s, so an
 * unconverted comparison is skewed by the server's UTC offset. Always wrap Date parameters in this.
 */
export const ts = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

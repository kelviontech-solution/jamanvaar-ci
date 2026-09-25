import { Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

export const numberLeaseSchema = z.object({
  kind: z.enum(['ORDER', 'KOT']),
  count: z.number().int().min(1).max(500)
});
export type NumberLeaseDto = z.infer<typeof numberLeaseSchema>;

/** YYYYMMDD of `now` in the given IANA timezone (falls back to Asia/Kolkata for an unknown zone). */
export function businessDateIn(timezone: string, now: Date = new Date()): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}${get('month')}${get('day')}`;
}

@Injectable()
export class NumberLeasesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserves `count` consecutive numbers for this device. The counter row is locked for the rest of
   * the transaction, so concurrent leases can never overlap, and the reservation is permanent: a
   * device that never uses its block simply leaves a gap, never a duplicate.
   */
  async lease(device: Device, dto: NumberLeaseDto) {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const branch = device.branchId ? await tx.branch.findUnique({ where: { id: device.branchId } }) : null;
      const restaurant = branch ? null : await tx.restaurant.findUnique({ where: { id: device.restaurantId }, select: { timezone: true } });
      const timezone = branch?.timezone ?? restaurant?.timezone ?? 'Asia/Kolkata';
      const prefix = branch?.code ?? 'MAIN';
      const businessDate = businessDateIn(timezone);
      const scope = device.branchId ?? '_';

      const rows = await tx.$queryRaw<{ next: number }[]>`
        INSERT INTO "NumberSequence" ("restaurantId", "scope", "kind", "businessDate", "next")
        VALUES (${device.restaurantId}, ${scope}, ${dto.kind}, ${businessDate}, ${dto.count + 1})
        ON CONFLICT ("restaurantId", "scope", "kind", "businessDate")
        DO UPDATE SET "next" = "NumberSequence"."next" + ${dto.count}
        RETURNING "next"`;
      const next = Number(rows[0].next);
      return { kind: dto.kind, prefix, businessDate, start: next - dto.count, count: dto.count };
    });
  }
}

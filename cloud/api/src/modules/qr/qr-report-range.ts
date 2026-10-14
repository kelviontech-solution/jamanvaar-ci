import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
export async function qrReportRange(tx: Prisma.TransactionClient, restaurantId: string, branchId: string | null | undefined, from?: string, to?: string) {
  for (const day of [from, to])
    if (
      day &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day + 'T00:00:00Z')) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day)
    )
      throw new BadRequestException('Choose valid calendar dates');
  const restaurant = await tx.restaurant.findFirstOrThrow({ where: { id: restaurantId }, select: { timezone: true } }),
    branch = branchId ? await tx.branch.findFirst({ where: { id: branchId, restaurantId }, select: { timezone: true } }) : null;
  const timezone = branch?.timezone || restaurant.timezone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const first = from || new Date(Date.parse(today + 'T12:00:00Z') - 6 * 86400000).toISOString().slice(0, 10),
    last = to || today;
  const [range] = await tx.$queryRaw<Array<{ start: Date; end: Date }>>(
    Prisma.sql`SELECT (${first}::date::timestamp AT TIME ZONE ${timezone}) AS start,((${last}::date+1)::timestamp AT TIME ZONE ${timezone}) AS end`
  );
  if (range.end <= range.start || range.end.getTime() - range.start.getTime() > 367 * 86400000)
    throw new BadRequestException('Choose a valid date range of up to one year');
  return { ...range, timezone };
}

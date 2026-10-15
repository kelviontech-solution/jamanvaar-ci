import type { Prisma } from '@prisma/client';
const terminal = new Set(['READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'VOID', 'VOIDED', 'REFUNDED', 'DRAFT']);
export function estimateWait(active: { status: string; items: unknown }[], history: { createdAt: Date; items: unknown; meta: unknown }[], fallback: number) {
  const units = (items: unknown) =>
    Array.isArray(items)
      ? items.reduce((n, l) => n + (!['READY', 'SERVED', 'CANCELLED'].includes(l.kitchenStatus) ? Math.max(0, Number(l.quantity) || 0) : 0), 0)
      : 0;
  const waiting = active.filter((o) => !terminal.has(o.status)),
    backlogUnits = waiting.reduce((n, o) => n + units(o.items), 0);
  const samples = history
    .flatMap((o) => {
      const meta = o.meta as any,
        events = [...(meta?.operationHistory ?? []), ...(meta?.qrStatusHistory ?? [])];
      const ready = events.find((e: any) => ['READY', 'SERVED', 'COMPLETED'].includes(e.status ?? e.action));
      const at =
        ready?.at ??
        (Array.isArray(o.items)
          ? o.items
              .map((l) => l.readyAt)
              .filter(Boolean)
              .sort()
              .at(-1)
          : null);
      const minutes = at ? (Date.parse(at) - o.createdAt.getTime()) / 60000 : 0;
      return minutes >= 1 && minutes <= 240 ? [minutes] : [];
    })
    .sort((a, b) => a - b);
  const base = samples.length >= 5 ? samples[Math.floor((samples.length - 1) * 0.75)] : Math.max(1, fallback);
  // Three concurrent tickets is an explicit conservative operating assumption, not a promised SLA.
  const minutes = Math.min(240, Math.ceil(base * Math.max(1, Math.ceil((waiting.length + 1) / 3))));
  return {
    estimateMinutes: minutes,
    minMinutes: Math.max(1, Math.floor(minutes * 0.8)),
    maxMinutes: Math.ceil(minutes * 1.25),
    backlogOrders: waiting.length,
    backlogUnits,
    sampleCount: samples.length,
    basis: samples.length >= 5 ? 'RECENT_PREPARATION_HISTORY' : 'CONFIGURED_PREPARATION_TIME',
    message: `About ${Math.max(1, Math.floor(minutes * 0.8))}–${Math.ceil(minutes * 1.25)} minutes`,
    generatedAt: new Date().toISOString()
  };
}
export async function branchWaitEstimate(tx: Prisma.TransactionClient, restaurantId: string, branchId: string, fallback = 20) {
  const where = { restaurantId, branchId };
  const policy = await tx.syncedEntity.findUnique({
    where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'OPS_SERVICE', externalId: branchId } }
  });
  const preparation = (policy?.payload as { preparationMinutes?: unknown } | null)?.preparationMinutes;
  if (typeof preparation === 'number' && preparation >= 1 && preparation <= 240) fallback = preparation;
  const [active, history] = await Promise.all([
    tx.syncedOrder.findMany({ where: { ...where, status: { notIn: [...terminal] } }, select: { status: true, items: true }, take: 1000 }),
    tx.syncedOrder.findMany({
      where: { ...where, status: { in: ['READY', 'SERVED', 'COMPLETED'] }, createdAt: { gte: new Date(Date.now() - 28 * 86400000) } },
      select: { createdAt: true, items: true, meta: true },
      orderBy: { createdAt: 'desc' },
      take: 250
    })
  ]);
  return estimateWait(active, history, fallback);
}

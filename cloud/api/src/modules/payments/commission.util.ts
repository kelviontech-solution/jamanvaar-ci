import { PrismaService } from '../../prisma/prisma.service';

export const PAYMENT_DEFAULT_COMMISSION_BPS_KEY = 'PAYMENT_DEFAULT_COMMISSION_BPS';

export async function getDefaultCommissionBps(prisma: PrismaService): Promise<number> {
  const row = await prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY } }));
  const value = row?.value as { bps?: number } | undefined;
  return typeof value?.bps === 'number' ? value.bps : 0;
}

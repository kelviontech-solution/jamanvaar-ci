import { ForbiddenException } from '@nestjs/common';
import { AppCode, Prisma } from '@prisma/client';

export async function branchLicense(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  branchId: string | null | undefined,
  appCode: AppCode,
  now = new Date()
) {
  if (!branchId) return null;
  const branch = await tx.branch.findFirst({ where: { id: branchId, restaurantId, status: 'ACTIVE' }, select: { id: true } });
  if (!branch) throw new ForbiddenException('Branch is not active in this restaurant');
  return tx.branchProductLicense.findFirst({
    where: { restaurantId, branchId, appCode, cancelledAt: null, effectiveAt: { lte: now } },
    orderBy: [{ effectiveAt: 'desc' }, { revision: 'desc' }]
  });
}
export async function applyBranchLicense<T extends { enabled: boolean; reason: string; limits: Record<string, unknown>; validUntil: string | null }>(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  branchId: string | null | undefined,
  appCode: AppCode,
  base: T
): Promise<T> {
  if (!branchId || !base.enabled) return base;
  const license = await branchLicense(tx, restaurantId, branchId, appCode);
  if (!license) return base;
  if (!license.enabled || (license.expiresAt && license.expiresAt <= new Date()))
    return { ...base, enabled: false, reason: 'BRANCH_PRODUCT_DISABLED', limits: {} };
  return {
    ...base,
    limits: {
      ...base.limits,
      ...Object.fromEntries(license.disabledFeatures.map((k) => [k, false])),
      ...(license.deviceQuota === null ? {} : { branchDeviceQuota: license.deviceQuota })
    },
    validUntil: license.expiresAt && (!base.validUntil || license.expiresAt < new Date(base.validUntil)) ? license.expiresAt.toISOString() : base.validUntil
  };
}
export async function assertBranchProduct(tx: Prisma.TransactionClient, restaurantId: string, branchId: string | null | undefined, appCode: AppCode) {
  const license = await branchLicense(tx, restaurantId, branchId, appCode);
  if (license && (!license.enabled || (license.expiresAt && license.expiresAt <= new Date())))
    throw new ForbiddenException({
      code: 'BRANCH_PRODUCT_DISABLED',
      message: `${appCode} is not active for this branch. Ask your owner or platform administrator.`
    });
  return license;
}

import { AppCode, Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

export interface FeatureCatalogEntry {
  category: string;
  description: string;
  /** Other AppCodes that must be enabled for this one to make sense. Checked on disable only. */
  dependsOn: AppCode[];
}

/**
 * Builds the AppCode catalog from the live Feature table: only rows with an appCode take part,
 * and dependsOn resolves each dependsOnFeatureIds entry to that feature's own appCode.
 */
export async function getFeatureCatalog(tx: TxClient): Promise<Record<AppCode, FeatureCatalogEntry>> {
  const features = await tx.feature.findMany({
    where: { appCode: { not: null } },
    include: { category: true }
  });
  const byId = new Map(features.map((f) => [f.id, f]));

  const catalog = {} as Record<AppCode, FeatureCatalogEntry>;
  for (const f of features) {
    if (!f.appCode) continue;
    const dependsOn = f.dependsOnFeatureIds
      .map((id) => byId.get(id)?.appCode)
      .filter((code): code is AppCode => code !== null && code !== undefined);
    catalog[f.appCode] = { category: f.category.name, description: f.description, dependsOn };
  }
  return catalog;
}

/** Which of the given enabled app codes declare a dependency on `appCode` — used to refuse disabling a prerequisite still in use. */
export async function getDependentsOf(tx: TxClient, appCode: AppCode, enabledAppCodes: AppCode[]): Promise<AppCode[]> {
  const catalog = await getFeatureCatalog(tx);
  return enabledAppCodes.filter((candidate) => catalog[candidate]?.dependsOn.includes(appCode));
}

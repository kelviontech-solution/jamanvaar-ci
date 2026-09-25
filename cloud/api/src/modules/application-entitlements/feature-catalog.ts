import { AppCode } from '@prisma/client';

export interface FeatureCatalogEntry {
  category: string;
  description: string;
  /** Other AppCodes that must be enabled for this one to make sense. Checked on disable only. */
  dependsOn: AppCode[];
}

export const FEATURE_CATALOG: Record<AppCode, FeatureCatalogEntry> = {
  POS: {
    category: 'RESTAURANT_CORE',
    description: 'Point-of-sale terminal — takes orders and processes bills.',
    dependsOn: []
  },
  POS_ADMIN: {
    category: 'RESTAURANT_CORE',
    description: 'Back-office console for managing menu, staff and settings.',
    dependsOn: ['POS']
  },
  CAPTAIN: {
    category: 'RESTAURANT_ADDON',
    description: 'Waiter-facing tableside ordering app.',
    dependsOn: []
  },
  KDS: {
    category: 'RESTAURANT_ADDON',
    description: 'Kitchen display screen showing incoming orders.',
    dependsOn: []
  },
  QR_ORDERING: {
    category: 'RESTAURANT_ADDON',
    description: "Guest self-ordering from a table's QR code.",
    dependsOn: []
  },
  KIOSK: {
    category: 'KIOSK_CORE',
    description: 'Self-service ordering kiosk terminal.',
    dependsOn: []
  },
  KIOSK_ADMIN: {
    category: 'KIOSK_CORE',
    description: 'Back-office console for managing kiosk menu and settings.',
    dependsOn: ['KIOSK']
  }
};

/** Which of the given enabled app codes declare a dependency on `appCode` — used to refuse disabling a prerequisite still in use by an active dependent. */
export function dependentsOf(appCode: AppCode, enabledAppCodes: AppCode[]): AppCode[] {
  return enabledAppCodes.filter((candidate) => FEATURE_CATALOG[candidate].dependsOn.includes(appCode));
}

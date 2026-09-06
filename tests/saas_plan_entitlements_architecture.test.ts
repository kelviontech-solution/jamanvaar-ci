import { describe, it, expect, beforeEach } from 'vitest';
import {
  CORE_PLAN_FEATURE_GROUPS,
  PRO_PLAN_FEATURE_GROUPS,
  OPERATIONAL_MODULE_CATEGORIES,
  CORE_DEFAULT_ENTITLEMENTS,
  PRO_DEFAULT_ENTITLEMENTS,
  PRO_EXCLUSIVE_KEYS,
  CORE_KEYS,
  resolveTierEntitlements,
  countFeatures
} from '@jamanvaar/types';
import { EntitlementService } from '@jamanvaar/business';
import { LicenseRepository } from '@jamanvaar/database';

describe('JAMANVAAR SaaS Plan Entitlements & Core/Pro Inheritance Architecture', () => {
  beforeEach(() => {
    // Reset to clean Core plan before each test
    LicenseRepository.activatePlan('CORE');
  });

  it('1. Canonical Feature Catalog Counts match exact business specifications', () => {
    const coreCount = countFeatures(CORE_PLAN_FEATURE_GROUPS);
    const proExclusiveCount = countFeatures(PRO_PLAN_FEATURE_GROUPS);
    const totalCount = coreCount + proExclusiveCount;

    // Must match 183 Base Features and 181 Exclusive Capabilities (364 Total)
    expect(coreCount).toBe(183);
    expect(proExclusiveCount).toBe(181);
    expect(totalCount).toBe(364);

    // 10 Core groups and 6 Pro exclusive groups
    expect(CORE_PLAN_FEATURE_GROUPS.length).toBe(10);
    expect(PRO_PLAN_FEATURE_GROUPS.length).toBe(6);
  });

  it('2. Operational Categories accurately structure the 7 SaaS business sections', () => {
    expect(OPERATIONAL_MODULE_CATEGORIES.length).toBe(7);

    const pos = OPERATIONAL_MODULE_CATEGORIES.find((c) => c.id === 'pos_billing');
    expect(pos?.entitlementKeys).toContain('posTerminal');
    expect(pos?.entitlementKeys).toContain('dineInTakeawayDeliveryToken');

    const ecosystem = OPERATIONAL_MODULE_CATEGORIES.find((c) => c.id === 'connected_ecosystem');
    expect(ecosystem?.isProExclusive).toBe(true);
    expect(ecosystem?.entitlementKeys).toContain('captainApp');
    expect(ecosystem?.entitlementKeys).toContain('qrTableOrdering');
    expect(ecosystem?.entitlementKeys).toContain('advancedServiceWorkflow');
  });

  it('3. Core Entitlements Resolution enables Core and locks Pro exclusives', () => {
    const coreResolved = resolveTierEntitlements('CORE');

    // All Core keys are enabled
    for (const key of CORE_KEYS) {
      expect(coreResolved[key]).toBe(true);
    }

    // All Pro exclusive keys are strictly disabled
    for (const key of PRO_EXCLUSIVE_KEYS) {
      expect(coreResolved[key]).toBe(false);
    }
  });

  it('4. Pro Entitlements Resolution deterministically inherits Core + unlocks Pro exclusives', () => {
    const proResolved = resolveTierEntitlements('PRO');

    // Every Core key must be enabled in Pro (100% inheritance)
    for (const key of CORE_KEYS) {
      expect(proResolved[key]).toBe(true);
    }

    // Every Pro exclusive key must be enabled in Pro
    for (const key of PRO_EXCLUSIVE_KEYS) {
      expect(proResolved[key]).toBe(true);
    }
  });

  it('5. EntitlementService enforces multi-level access control for Core (₹5,000)', () => {
    LicenseRepository.activatePlan('CORE');

    expect(EntitlementService.isFeatureEnabled('posTerminal')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('menuManagement')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('tableManagement')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('offlineBilling')).toBe(true);

    // Pro exclusives are locked
    expect(EntitlementService.checkCaptainAppAccess().allowed).toBe(false);
    expect(EntitlementService.checkQrOrderingAccess().allowed).toBe(false);
    expect(EntitlementService.checkAdvancedAnalyticsAccess().allowed).toBe(false);
    expect(EntitlementService.checkAdvancedKdsAccess().allowed).toBe(false);
  });

  it('6. EntitlementService unlocks full connected suite when upgraded to Pro (₹7,000)', () => {
    LicenseRepository.activatePlan('PRO');

    expect(EntitlementService.isFeatureEnabled('posTerminal')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('menuManagement')).toBe(true);

    // Pro exclusives unlocked
    expect(EntitlementService.checkCaptainAppAccess().allowed).toBe(true);
    expect(EntitlementService.checkQrOrderingAccess().allowed).toBe(true);
    expect(EntitlementService.checkAiAssistantAccess().allowed).toBe(true);
    expect(EntitlementService.checkAdvancedAnalyticsAccess().allowed).toBe(true);
    expect(EntitlementService.checkAdvancedKdsAccess().allowed).toBe(true);
  });

  it('7. Downgrade from Pro to Core disables Pro features cleanly without breaking Core runtime', () => {
    // 1. Start on PRO
    LicenseRepository.activatePlan('PRO');
    expect(EntitlementService.checkQrOrderingAccess().allowed).toBe(true);
    expect(EntitlementService.checkCaptainAppAccess().allowed).toBe(true);

    // 2. Downgrade to CORE
    LicenseRepository.activatePlan('CORE');
    expect(EntitlementService.checkQrOrderingAccess().allowed).toBe(false);
    expect(EntitlementService.checkCaptainAppAccess().allowed).toBe(false);

    // Core billing, tables, KOT, inventory remain 100% active
    expect(EntitlementService.isFeatureEnabled('posTerminal')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('tableManagement')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('kotKdsRouting')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('inventoryManagement')).toBe(true);
  });
});

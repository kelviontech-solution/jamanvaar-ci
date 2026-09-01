import { describe, it, expect, beforeEach } from 'vitest';
import { db, LicenseRepository } from '@jamanvaar/database';
import { EntitlementService, PLAN_DEFINITIONS } from '@jamanvaar/business';

describe('JAMANVAAR Restaurant Suite — Plan & License Entitlement Engine', () => {
  beforeEach(() => {
    LicenseRepository.activatePlan('PRO');
  });

  it('should define CORE (₹5,000) and PRO (₹7,000) with complete feature matrices', () => {
    expect(PLAN_DEFINITIONS.CORE.price).toBe(5000);
    expect(PLAN_DEFINITIONS.PRO.price).toBe(7000);
    expect(PLAN_DEFINITIONS.CORE.name).toBe('JAMANVAAR CORE');
    expect(PLAN_DEFINITIONS.PRO.name).toBe('JAMANVAAR PRO');

    // PRO must include Captain App
    const proCaptain = PLAN_DEFINITIONS.PRO.features.find((f) => f.name.includes('Captain'));
    expect(proCaptain?.included).toBe(true);

    // CORE must NOT include Captain App
    const coreCaptain = PLAN_DEFINITIONS.CORE.features.find((f) => f.name.includes('Captain'));
    expect(coreCaptain?.included).toBe(false);
  });

  it('should grant full POS and Captain access under JAMANVAAR PRO', () => {
    LicenseRepository.activatePlan('PRO');
    const license = EntitlementService.getActiveLicense();

    expect(license.tier).toBe('PRO');
    expect(license.price).toBe(7000);
    expect(EntitlementService.isFeatureEnabled('posTerminal')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('kotKdsRouting')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('captainApp')).toBe(true);

    const access = EntitlementService.checkCaptainAppAccess();
    expect(access.allowed).toBe(true);
  });

  it('should restrict Captain App when JAMANVAAR CORE is active', () => {
    LicenseRepository.activatePlan('CORE');
    const license = EntitlementService.getActiveLicense();

    expect(license.tier).toBe('CORE');
    expect(license.price).toBe(5000);
    expect(EntitlementService.isFeatureEnabled('posTerminal')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('offlineBilling')).toBe(true);
    expect(EntitlementService.isFeatureEnabled('captainApp')).toBe(false);

    const access = EntitlementService.checkCaptainAppAccess();
    expect(access.allowed).toBe(false);
    expect(access.message).toContain('Captain App is available in JAMANVAAR PRO');
  });

  it('should support instant offline dealer license activation', () => {
    LicenseRepository.activatePlan('PRO', 'JAMAN-DEALER-PRO-9921');
    const license = EntitlementService.getActiveLicense();

    expect(license.licenseKey).toBe('JAMAN-DEALER-PRO-9921');
    expect(license.tier).toBe('PRO');
    expect(license.status).toBe('ACTIVE');
  });
});

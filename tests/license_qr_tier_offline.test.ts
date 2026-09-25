import { describe, it, expect, afterEach, vi } from 'vitest';
import { LicenseRepository } from '@jamanvaar/database';
import { EntitlementService } from '@jamanvaar/business';

function withLicense(tier: string, entitlements: Record<string, boolean> = {}) {
  vi.spyOn(LicenseRepository, 'getLicense').mockReturnValue({ tier, entitlements } as never);
}

describe('license certificate tiers beyond CORE/PRO', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a QR-tier restaurant is granted Captain, KDS routing, analytics and QR ordering', () => {
    withLicense('QR', { captainApp: true, advancedCaptainReports: true, qrTableOrdering: true });
    expect(EntitlementService.checkCaptainAppAccess().allowed).toBe(true);
    expect(EntitlementService.checkAdvancedKdsAccess().allowed).toBe(true);
    expect(EntitlementService.checkAdvancedAnalyticsAccess().allowed).toBe(true);
    expect(EntitlementService.checkQrOrderingAccess().allowed).toBe(true);
  });

  it('ENTERPRISE is treated as at least PRO', () => {
    withLicense('ENTERPRISE', { captainApp: true, qrTableOrdering: true });
    expect(EntitlementService.checkCaptainAppAccess().allowed).toBe(true);
  });

  it('QR ordering always reports that it needs internet, even when entitled', () => {
    withLicense('QR', { qrTableOrdering: true });
    expect(EntitlementService.checkQrOrderingAccess().requiresInternet).toBe(true);
  });

  it('CORE stays locked out of QR ordering', () => {
    withLicense('CORE', {});
    expect(EntitlementService.checkQrOrderingAccess().allowed).toBe(false);
  });

  it('a QR-tier plan with qrTableOrdering explicitly false is denied', () => {
    withLicense('QR', { qrTableOrdering: false });
    expect(EntitlementService.checkQrOrderingAccess().allowed).toBe(false);
  });
});

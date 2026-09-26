import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  LicenseRepository,
  captainDb,
  StaffRepository
} from '@jamanvaar/database';
import { EntitlementService } from '@jamanvaar/business';

// NOTE (2026-09-06 audit correction): this suite's original "4. SEC-002" test
// below only ever proved that EntitlementService correctly reads whatever tier
// LicenseRepository.activatePlan() was last called with — it never proved the
// tier itself couldn't be set without authorization, which was the actual
// vulnerability (see docs/reports/SECURITY_CODE_QUALITY_AUDIT.md, ENT-001).
// The real regression coverage for "can a restaurant escalate its own plan"
// now lives in tests/license_certificate.test.ts, which tests that
// LicenseRepository.setVerifiedLicense() is only reachable through a
// cryptographically verified certificate. Kept here unchanged (renamed only)
// because it's still valid coverage of a different thing: that entitlement
// flags are computed correctly once a tier is set.
describe('JAMANVAAR Security Audit Remediation Verification Suite', () => {
  beforeEach(() => {
    // Reset license to standard CORE by default
    LicenseRepository.activatePlan('CORE');
  });

  // SEC-003 / SEC-004 (QR ordering payment and modifier price tampering) are now enforced and tested on the server:
  // cloud/api/test/qr-ordering-saas.e2e.spec.ts (client prices, totals and unknown options are rejected, orders stay unpaid).

  describe('2. SEC-007: Captain App SaaS Entitlement Enforcement', () => {
    it('should lock out Captain App when restaurant is on JAMANVAAR CORE (₹5,000)', () => {
      LicenseRepository.activatePlan('CORE');

      const check = EntitlementService.checkCaptainAppAccess();
      expect(check.allowed).toBe(false);
      expect(check.tier).toBe('CORE');
      expect(check.message).toContain('JAMANVAAR PRO');
    });

    it('should permit Captain App when restaurant is upgraded to JAMANVAAR PRO (₹7,000)', () => {
      LicenseRepository.activatePlan('PRO');

      const check = EntitlementService.checkCaptainAppAccess();
      expect(check.allowed).toBe(true);
      expect(check.tier).toBe('PRO');
    });
  });

  describe('3. SEC-006: Captain App Database-backed PIN Authentication', () => {
    it('a real, Restaurant-Admin-issued PIN authenticates against the captain database pool; nothing else does', async () => {
      // BUG-005/006: no seeded demo staff or plaintext PINs any more — a captain's PIN is
      // issued by StaffRepository (shared with captainDb; see captain_db.ts) and stored hashed.
      const captain = await StaffRepository.createUser({ fullName: 'Test Captain', username: 'testcaptain', roleId: 'role-captain' });
      expect(captainDb.users.some((u) => u.id === captain.id)).toBe(true);

      const verified = await StaffRepository.verifyPin(captain.issuedPin!);
      expect(verified?.user.id).toBe(captain.id);

      // A random guessed PIN must not authenticate.
      const guesses = ['0000', '1111', '9999'].filter((g) => g !== captain.issuedPin);
      for (const guess of guesses) {
        expect(await StaffRepository.verifyPin(guess)).toBeNull();
      }
    });
  });

  describe('4. Entitlement flags follow tier correctly (NOT a test of ENT-001/SEC-002 — see tests/license_certificate.test.ts for that)', () => {
    it('PRO tier must include captainApp and qrTableOrdering while CORE tier excludes them', () => {
      LicenseRepository.activatePlan('CORE');
      expect(EntitlementService.isFeatureEnabled('posTerminal')).toBe(true);
      expect(EntitlementService.isFeatureEnabled('captainApp')).toBe(false);
      expect(EntitlementService.isFeatureEnabled('qrTableOrdering')).toBe(false);

      LicenseRepository.activatePlan('PRO');
      expect(EntitlementService.isFeatureEnabled('posTerminal')).toBe(true);
      expect(EntitlementService.isFeatureEnabled('captainApp')).toBe(true);
      expect(EntitlementService.isFeatureEnabled('qrTableOrdering')).toBe(true);
    });
  });
});

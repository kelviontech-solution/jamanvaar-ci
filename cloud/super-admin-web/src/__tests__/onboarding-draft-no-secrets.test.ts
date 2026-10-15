import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * security-audit: the onboarding wizard's resumable localStorage draft used to include the new
 * owner's plaintext initial password (in the default 'set_now' mode, a real, permanent login
 * credential) and a live ownerActivationToken, directly contradicting the file's own comment
 * claiming one-time secrets are excluded. Neither is cleared on logout, so either could sit in
 * localStorage indefinitely. This file's render environment has no DOM (vitest runs with
 * environment: 'node'), so the fix is pinned at the source level, matching the convention in
 * access-parity.test.ts elsewhere in this package.
 */
describe('OnboardRestaurantPage: the resumable draft never persists owner secrets', () => {
  const src = readFileSync(join(__dirname, '../pages/Onboarding/OnboardRestaurantPage.tsx'), 'utf8');

  it('OnboardingDraft.owner type excludes initialPassword', () => {
    expect(src).toMatch(/type PersistedOwnerForm = Omit<OwnerForm, 'initialPassword'>/);
    const start = src.indexOf('interface OnboardingDraft');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 400);
    expect(block).toMatch(/owner:\s*PersistedOwnerForm/);
    expect(block).not.toMatch(/ownerActivationToken/);
  });

  it('the autosave effect strips initialPassword out of owner before persisting', () => {
    const start = src.indexOf('const { initialPassword: _initialPassword, ...ownerWithoutPassword } = owner;');
    expect(start).toBeGreaterThan(-1);
    const draftLiteralStart = src.indexOf('const draft: OnboardingDraft', start);
    const draftLiteral = src.slice(draftLiteralStart, draftLiteralStart + 300);
    expect(draftLiteral).toMatch(/owner:\s*ownerWithoutPassword/);
    expect(draftLiteral).not.toMatch(/ownerActivationToken/);
  });

  it('resumeDraft regenerates a fresh password instead of restoring one from the draft', () => {
    const start = src.indexOf('function resumeDraft()');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 700);
    expect(block).toMatch(/setOwner\(\{\s*\.\.\.pendingDraft\.owner,\s*initialPassword:\s*generateSecurePassword\(\)\s*\}\)/);
    expect(block).not.toMatch(/setOwnerActivationToken\(pendingDraft\.ownerActivationToken\)/);
  });

  it('no other secret-shaped field was smuggled back into the persisted draft object', () => {
    // Belt-and-braces: confirm no key in the literal draft object (not the safely-renamed
    // ownerWithoutPassword variable, whose own name incidentally contains "password") looks like a
    // raw credential/token field.
    const start = src.indexOf('const draft: OnboardingDraft');
    const end = src.indexOf('};', start);
    const draftBlock = src.slice(start, end);
    expect(draftBlock).not.toMatch(/initialPassword:|ownerActivationToken:|secret:/i);
  });
});

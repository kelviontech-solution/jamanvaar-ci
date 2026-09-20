import { describe, it, expect } from 'vitest';
import { passwordProblems } from './password';
import { buildActivationUrl } from '../../modules/platform-users/activation-url';

/**
 * BUG-081: a platform account controls the whole platform but only needed 8 characters of
 * anything; and the invitation link went to `localhost` when a base URL was not configured and
 * carried the one-time token in the query string (so in server logs and referrers).
 */
describe('platform password rules', () => {
  it('accepts a long password with letters and a number or symbol', () => {
    expect(passwordProblems('Tr1cky-horse-staple')).toEqual([]);
    expect(passwordProblems('correct horse battery staple 9')).toEqual([]);
  });

  it('rejects short, single-class and very common passwords, saying why', () => {
    expect(passwordProblems('short1')[0]).toMatch(/at least 10/);
    expect(passwordProblems('onlylettersonly').join(' ')).toMatch(/number|symbol/i);
    expect(passwordProblems('12345678901234').join(' ')).toMatch(/letter/i);
    expect(passwordProblems('password1234').join(' ')).toMatch(/common/i);
    expect(passwordProblems('Password123456').join(' ')).toMatch(/common/i);
  });
});

describe('invitation link', () => {
  it('uses the configured site URL and keeps the one-time token in the URL fragment, not the query string', () => {
    const url = buildActivationUrl('https://admin.jamanvaar.app/', 'new.person@example.com', 'tok_123');
    expect(url).toBe('https://admin.jamanvaar.app/activate#email=new.person%40example.com&token=tok_123');
    expect(url).not.toContain('?');
  });

  it('says so when no site URL is configured (a localhost fallback is not usable by an invitee)', () => {
    const url = buildActivationUrl(undefined, 'a@b.co', 't');
    expect(url).toMatch(/^http:\/\/localhost:5180\/activate#/);
  });
});

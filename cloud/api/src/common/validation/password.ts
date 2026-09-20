import { z } from 'zod';

/**
 * A platform account controls the whole platform, but only ever needed 8 characters of anything
 * (BUG-081). Length, a mix of character types and a common-password check, with reasons.
 */
// A common word followed by nothing but digits ("Password123456", "welcome2024") is not a strong
// password however long the digit tail is.
const COMMON_BASES = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'letmein', 'welcome', 'admin', 'administrator', 'iloveyou',
  'abc', 'abcd', 'abcdef', 'jamanvaar', 'changeme', 'trustno', 'monkey', 'dragon', 'football', 'login', 'secret'
]);

export function passwordProblems(pw: string): string[] {
  const problems: string[] = [];
  if (pw.length < 10) problems.push('Password must be at least 10 characters.');
  if (!/[A-Za-z]/.test(pw)) problems.push('Password must include a letter.');
  if (!/[0-9]/.test(pw) && !/[^A-Za-z0-9]/.test(pw)) problems.push('Password must include a number or a symbol.');
  const base = pw.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/[0-9]+$/, '');
  if (COMMON_BASES.has(base)) problems.push('That password is too common. Choose something less guessable.');
  return problems;
}

export const strongPassword = z.string().superRefine((pw, ctx) => {
  passwordProblems(pw).forEach((message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message }));
});

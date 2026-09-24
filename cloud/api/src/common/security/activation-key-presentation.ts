/**
 * security-audit HIGH-02: an unredeemed activation key's `code` is a bearer credential —
 * presenting it to a caller is equivalent to handing them a device token for that
 * restaurant (POST /api/v1/activation/redeem is public and takes only the code). This
 * used to be shown in full to ANY platform role holding `devices:'read'` (READ_ONLY,
 * SUPPORT_ADMIN), and to every reader of `/support/search`/`/support/diagnostics`
 * regardless of role. Shared by `activation-keys.service.ts` and `support.service.ts` so
 * both present it the same way: the full code only to a caller who could also have
 * generated one themselves (`devices:'write'`), everyone else gets `codeLast4`.
 */
export function redactActivationKeyCode<T extends { code: string; status: string; expiresAt: Date }>(
  key: T,
  now: Date,
  canSeeFullCode: boolean
): Omit<T, 'code'> & { code: string | null; codeLast4: string; lifecycle: 'AVAILABLE' | 'REDEEMED' | 'REVOKED' | 'EXPIRED' } {
  const lifecycle: 'AVAILABLE' | 'REDEEMED' | 'REVOKED' | 'EXPIRED' =
    key.status === 'REDEEMED' ? 'REDEEMED'
    : key.status === 'REVOKED' ? 'REVOKED'
    : key.status === 'EXPIRED' || key.expiresAt <= now ? 'EXPIRED'
    : 'AVAILABLE';
  return {
    ...key,
    lifecycle,
    code: lifecycle === 'AVAILABLE' && canSeeFullCode ? key.code : null,
    codeLast4: key.code.slice(-4)
  };
}

import { z } from 'zod';

export const generateActivationKeySchema = z.object({
  restaurantId: z.string().uuid(),
  subscriptionId: z.string().optional(),
  allowedDeviceType: z.enum(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'ANY']).default('ANY'),
  // B2-050: a key created already expired (e.g. `2020-01-01`) used to be accepted (201) and listed
  // as Active/Available right up until someone tried to redeem it — only then did the date check
  // (already correct) refuse it with 410. Reject dead-on-arrival keys at creation instead.
  expiresAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: 'expiresAt must be in the future' }),
  /** BUG-048: the branch the terminal that redeems this key belongs to. */
  branchId: z.string().uuid().optional(),
  /** Becomes the terminal's name, e.g. "Counter 1". */
  label: z.string().trim().min(1).max(80).optional(),
  /** Keys generated together (a welcome kit) share a batch. */
  batchId: z.string().trim().min(1).max(60).optional(),
  /** Reinstall / replacement: the existing terminal this key re-binds. It is revoked when the key is redeemed and its seat is reused. */
  replacesDeviceId: z.string().uuid().optional()
});
export type GenerateActivationKeyDto = z.infer<typeof generateActivationKeySchema>;

// A device redeeming a code isn't authenticated yet (that's the whole point of
// this endpoint) — 'ANY' is deliberately excluded here since it's only a valid
// *allowance* on the key, never a real device's own identity.
// A device-bound ECDSA P-256 public key (https://www.w3.org/TR/WebCryptoAPI/), generated on the device itself and
// never leaving it as a private key. Only a Kiosk registers one today (see DeviceSignatureGuard).
const devicePublicKeyJwkSchema = z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string(), y: z.string() }).passthrough();

export const redeemActivationKeySchema = z.object({
  code: z.string().trim().min(1),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN']),
  appVersion: z.string().optional(),
  publicKeyJwk: devicePublicKeyJwkSchema.optional()
});
export type RedeemActivationKeyDto = z.infer<typeof redeemActivationKeySchema>;

export const bulkRevokeKeysSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Choose at least one key').max(200)
});

export const bulkKeysSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Choose at least one key').max(200)
});

/** Bringing a key back: an optional new expiry when the old one has passed (default 30 days from now). */
export const reactivateKeySchema = z.object({
  expiresAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: 'expiresAt must be in the future' }).optional()
});
export type ReactivateKeyDto = z.infer<typeof reactivateKeySchema>;

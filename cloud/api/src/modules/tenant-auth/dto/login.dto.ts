import { z } from 'zod';
import { strongPassword } from '../../../common/validation/password';

// Tenant login accepts email + password, and optionally a restaurantId (if already known)
// and deviceId/deviceToken (for checking whether this device has already been activated).
export const tenantLoginSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().optional(),
  deviceToken: z.string().optional(),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN']).optional(),
  appVersion: z.string().optional(),
  // Opt-in: include the refresh token directly in the response body, for
  // cross-origin non-browser clients (e.g. Kiosk Admin's Tauri webview) that
  // can't rely on the httpOnly/sameSite=lax cookie on cross-origin fetch.
  returnRefreshToken: z.boolean().optional(),
  // Opt-in: reject this login unless the matched user's role is OWNER or MANAGER.
  adminOnly: z.boolean().optional()
});
export type TenantLoginDto = z.infer<typeof tenantLoginSchema>;

// Owner-only login (spec sections 5/33): no email, just the restaurant's customer-facing ID +
// the owner's password. Manager/Staff keep using tenantLoginSchema above unchanged.
export const loginOwnerSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase().optional(),
  // Already-resolved internal id, for a device that's connected and knows which restaurant it
  // belongs to (e.g. Kiosk Admin's daily login) — no need to make it re-type/remember the code.
  restaurantId: z.string().uuid().optional(),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().optional(),
  deviceToken: z.string().optional(),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN']).optional(),
  appVersion: z.string().optional(),
  returnRefreshToken: z.boolean().optional()
}).refine((v) => Boolean(v.restaurantCode || v.restaurantId), {
  message: 'Either restaurantCode or restaurantId is required',
  path: ['restaurantCode']
});
export type LoginOwnerDto = z.infer<typeof loginOwnerSchema>;

export const forgotPasswordOwnerSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase().optional(),
  restaurantId: z.string().uuid().optional()
}).refine((v) => Boolean(v.restaurantCode || v.restaurantId), {
  message: 'Either restaurantCode or restaurantId is required',
  path: ['restaurantCode']
});
export type ForgotPasswordOwnerDto = z.infer<typeof forgotPasswordOwnerSchema>;

export const resetPasswordOwnerSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase().optional(),
  restaurantId: z.string().uuid().optional(),
  otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
  newPassword: strongPassword
}).refine((v) => Boolean(v.restaurantCode || v.restaurantId), {
  message: 'Either restaurantCode or restaurantId is required',
  path: ['restaurantCode']
});
export type ResetPasswordOwnerDto = z.infer<typeof resetPasswordOwnerSchema>;

// A device-bound ECDSA P-256 public key (https://www.w3.org/TR/WebCryptoAPI/), generated on the device itself and
// never leaving it as a private key (see packages/sync's device_identity.ts and DeviceSignatureGuard).
const devicePublicKeyJwkSchema = z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string(), y: z.string() }).passthrough();

export const activateDeviceSchema = z.object({
  activationSessionToken: z.string().min(1, 'Activation session token is required'),
  activationKey: z.string().trim().min(1, 'Activation key is required'),
  deviceId: z.string().optional(),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN']).default('POS_ADMIN'),
  deviceName: z.string().optional(),
  appVersion: z.string().optional(),
  publicKeyJwk: devicePublicKeyJwkSchema.optional()
});
export type ActivateDeviceDto = z.infer<typeof activateDeviceSchema>;

export const tenantRefreshSchema = z.object({
  refreshToken: z.string().optional()
});
export type TenantRefreshDto = z.infer<typeof tenantRefreshSchema>;

// One-time bootstrap for a PENDING_ACTIVATION owner/staff user created with passwordHash=null
// (see RestaurantsService.createRestaurant). Not a general "forgot password" flow.
// B2-048: all four password fields below were `z.string().min(8, …)` — 8 characters, no
// character-class or common-password check at all, unlike the platform side's
// `strongPassword` rule. Confirmed live: '12345678' was accepted and saved as a real owner
// password via the change-password endpoint. These are the credentials for the account that
// controls a restaurant's staff, devices and cloud login — same rule as everywhere else now.
export const setInitialPasswordSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  activationToken: z.string().min(1, 'Activation token is required'),
  newPassword: strongPassword
});
export type SetInitialPasswordDto = z.infer<typeof setInitialPasswordSchema>;

export const activateOwnerSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase().min(1, 'Restaurant ID is required'),
  email: z.string().trim().toLowerCase().email(),
  activationToken: z.string().trim().min(1, 'Invitation token is required'),
  newPassword: strongPassword
});
export type ActivateOwnerDto = z.infer<typeof activateOwnerSchema>;

export const tenantChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword
});
export type TenantChangePasswordDto = z.infer<typeof tenantChangePasswordSchema>;

// Restaurant Admin (OWNER) self-service login creation for other apps/devices
// (Captain, etc.) — unlike RestaurantsService.createRestaurant's owner invite,
// this sets the password immediately (no separate set-initial-password step)
// since the owner is choosing/handing over the credential directly, the same
// way Super Admin's onboarding "set now" mode works.
export const createTenantStaffUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(1, 'Full name is required'),
  role: z.enum(['MANAGER', 'STAFF']).default('STAFF'),
  phone: z.string().trim().optional(),
  password: strongPassword
});
export type CreateTenantStaffUserDto = z.infer<typeof createTenantStaffUserSchema>;

export const setTenantUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED'])
});
export type SetTenantUserStatusDto = z.infer<typeof setTenantUserStatusSchema>;

// "Forgot password" (BUG-142): ask for a one-time code by email, then use it to choose a new password.
export const forgotPasswordSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email()
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
  newPassword: strongPassword
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

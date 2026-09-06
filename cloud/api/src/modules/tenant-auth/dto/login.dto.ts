import { z } from 'zod';

// Tenant User.email is only unique WITHIN a restaurant (@@unique([restaurantId, email])),
// not globally — so a tenant login must always be scoped to a restaurantId, unlike
// platform login which only needs an email. The client (e.g. Restaurant Admin) already
// knows its own restaurantId from local activation/provisioning.
export const tenantLoginSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required')
});
export type TenantLoginDto = z.infer<typeof tenantLoginSchema>;

// One-time bootstrap for a PENDING_ACTIVATION owner/staff user created with passwordHash=null
// (see RestaurantsService.createRestaurant). Not a general "forgot password" flow.
export const setInitialPasswordSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  activationToken: z.string().min(1, 'Activation token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
});
export type SetInitialPasswordDto = z.infer<typeof setInitialPasswordSchema>;

export const tenantChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
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
  password: z.string().min(8, 'Password must be at least 8 characters')
});
export type CreateTenantStaffUserDto = z.infer<typeof createTenantStaffUserSchema>;

export const setTenantUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED'])
});
export type SetTenantUserStatusDto = z.infer<typeof setTenantUserStatusSchema>;

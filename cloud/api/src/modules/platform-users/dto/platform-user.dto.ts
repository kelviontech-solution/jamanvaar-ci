import { strongPassword } from '../../../common/validation/password';
import { z } from 'zod';

export const PLATFORM_ROLES = [
  'PLATFORM_OWNER',
  'SUPER_ADMIN',
  'PLATFORM_OPS',
  'SUPPORT_ADMIN',
  'FINANCE_ADMIN',
  'READ_ONLY'
] as const;

export const inviteTeammateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2),
  role: z.enum(PLATFORM_ROLES)
});
export type InviteTeammateDto = z.infer<typeof inviteTeammateSchema>;

export const updateRoleSchema = z.object({
  role: z.enum(PLATFORM_ROLES)
});
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

export const activateTeammateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  activationToken: z.string().min(10),
  password: strongPassword
});
export type ActivateTeammateDto = z.infer<typeof activateTeammateSchema>;

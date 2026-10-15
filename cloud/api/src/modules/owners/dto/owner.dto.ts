import { z } from 'zod';
import { strongPassword } from '../../../common/validation/password';

export const updateOwnerSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  phone: z.string().trim().optional()
});
export type UpdateOwnerDto = z.infer<typeof updateOwnerSchema>;

// security-audit HIGH owners-reset-password-01: this is the one path into an owner's login
// password that didn't require the same strongPassword policy every other path already does
// (setInitialPasswordSchema, activateOwnerSchema, tenantChangePasswordSchema -- see login.dto.ts's
// own B2-048 comment).
export const resetOwnerPasswordSchema = z.object({
  password: strongPassword
});
export type ResetOwnerPasswordDto = z.infer<typeof resetOwnerPasswordSchema>;

import { strongPassword } from '../../../common/validation/password';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required')
});

export type LoginDto = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

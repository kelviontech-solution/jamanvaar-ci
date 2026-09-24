import { strongPassword } from '../../../common/validation/password';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required')
});

export type LoginDto = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  otpToken: z.string().min(1),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code')
});
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({
  otpToken: z.string().min(1)
});
export type ResendOtpDto = z.infer<typeof resendOtpSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

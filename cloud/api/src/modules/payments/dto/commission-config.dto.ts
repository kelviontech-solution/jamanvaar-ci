import { z } from 'zod';

// `password` is optional at the schema (shape) level -- whether it's actually required is an
// authorization question, enforced by requireStepUpPassword() in the service layer, not a
// parsing question. A missing or wrong password both fail the same way there: 403, not 400.
export const setCommissionConfigSchema = z.object({
  defaultBps: z.number().int().min(0).max(10000),
  password: z.string().min(1).optional()
});
export type SetCommissionConfigDto = z.infer<typeof setCommissionConfigSchema>;

export const setCommissionOverrideSchema = z.object({
  overrideBps: z.number().int().min(0).max(10000).nullable(),
  password: z.string().min(1).optional()
});
export type SetCommissionOverrideDto = z.infer<typeof setCommissionOverrideSchema>;

export const stepUpPasswordSchema = z.object({
  password: z.string().min(1).optional()
});
export type StepUpPasswordDto = z.infer<typeof stepUpPasswordSchema>;

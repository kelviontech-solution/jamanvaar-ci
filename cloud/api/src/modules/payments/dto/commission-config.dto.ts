import { z } from 'zod';

export const setCommissionConfigSchema = z.object({
  defaultBps: z.number().int().min(0).max(10000)
});
export type SetCommissionConfigDto = z.infer<typeof setCommissionConfigSchema>;

export const setCommissionOverrideSchema = z.object({
  overrideBps: z.number().int().min(0).max(10000).nullable()
});
export type SetCommissionOverrideDto = z.infer<typeof setCommissionOverrideSchema>;

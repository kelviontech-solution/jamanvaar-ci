import { z } from 'zod';

export const MIN_DISPLAY_SCALE = 70;
export const MAX_DISPLAY_SCALE = 150;

export const displayScaleSchema = z.object({
  displayScalePercent: z
    .number({ invalid_type_error: 'Display size must be a number' })
    .int('Display size must be a whole number')
    .min(MIN_DISPLAY_SCALE, `Display size cannot be below ${MIN_DISPLAY_SCALE}%`)
    .max(MAX_DISPLAY_SCALE, `Display size cannot be above ${MAX_DISPLAY_SCALE}%`)
});

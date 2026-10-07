import { z } from 'zod';

export const WELCOME_POLICY_KEY = 'platform.kioskWelcome';
const access = z.object({ maxDesigns: z.number().int().min(1).max(100), allowedIds: z.array(z.string().min(1).max(100)).max(100).nullable() }).strict();
export const welcomePolicySchema = z.object({
  maxDesigns: z.number().int().min(1).max(100),
  enabledIds: z.array(z.string().min(1).max(100)).max(100).nullable(),
  restaurantAccess: z.record(z.string().uuid(), access).refine(v => Object.keys(v).length <= 1000, 'Too many restaurant overrides.')
}).strict().superRefine((v, ctx) => {
  for (const [path, ids] of [['enabledIds', v.enabledIds], ...Object.entries(v.restaurantAccess).map(([id, a]) => [`restaurantAccess.${id}.allowedIds`, a.allowedIds])] as Array<[string, string[] | null]>) {
    if (ids && new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [path], message: 'Select each design only once.' });
  }
});
export type WelcomePolicy = z.infer<typeof welcomePolicySchema>;
export const DEFAULT_WELCOME_POLICY: WelcomePolicy = { maxDesigns: 100, enabledIds: null, restaurantAccess: {} };

import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const qrRulesSchema = z.object({
  hours: z.array(z.object({ day: z.number().int().min(0).max(6), open: time, close: time }).strict()).max(21),
  pausedUntil: z.string().datetime().nullable(),
  minimumOrderPaise: z.number().int().min(0).max(10_000_000),
  preparationMinutes: z.number().int().min(0).max(240),
  maxPendingOrders: z.number().int().min(0).max(10000),
  maxOrdersPerWindow: z.number().int().min(0).max(10000),
  windowMinutes: z.number().int().min(1).max(240),
  customerInstructions: z.string().trim().max(500),
  paymentInstructions: z.string().trim().max(300),
  orderingModes: z.array(z.enum(['DINE_IN', 'TAKEAWAY'])).min(1).max(2)
}).partial().strict();
export type QrRules = Required<z.infer<typeof qrRulesSchema>>;
export const DEFAULT_QR_RULES: QrRules = { hours: [], pausedUntil: null, minimumOrderPaise: 0, preparationMinutes: 20, maxPendingOrders: 0, maxOrdersPerWindow: 0, windowMinutes: 15, customerInstructions: '', paymentInstructions: '', orderingModes: ['DINE_IN', 'TAKEAWAY'] };

/** Uses the restaurant timezone; overnight intervals belong to their opening day. Empty schedule is always open. */
export function orderingAvailability(rules: QrRules, timezone: string, now = new Date()) {
  if (rules.pausedUntil && new Date(rules.pausedUntil) > now) return { available: false, message: 'Ordering is temporarily paused. Please ask the team or try again later.' };
  if (!rules.hours.length) return { available: true, message: '' };
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
  const minute = Number(part('hour')) * 60 + Number(part('minute'));
  const toMinute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const open = rules.hours.some(h => {
    const start = toMinute(h.open), end = toMinute(h.close);
    if (start === end) return h.day === day;
    return end > start ? h.day === day && minute >= start && minute < end : (h.day === day && minute >= start) || ((h.day + 1) % 7 === day && minute < end);
  });
  return { available: open, message: open ? '' : 'Online ordering is closed outside our ordering hours. Please ask a team member.' };
}

import { z } from 'zod';
const text = (n: number) => z.string().trim().max(n);
const https = (hosts?: string[]) =>
  text(1200).refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && !u.username && !u.password && (!hosts || hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h)));
    } catch {
      return false;
    }
  }, 'Use a valid HTTPS link for this service');
// Image values stored here are server-created content hashes, never arbitrary remote fetch targets.
const image = z.string().regex(/^(?:|img:[a-f0-9]{64})$/);
const timestamp = z.union([z.literal(''), z.string().datetime({ offset: true })]);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const intervals = z
  .array(z.object({ start: clock, end: clock }).strict())
  .max(4)
  .refine((rows) => rows.every((row) => row.start !== row.end), 'Opening and closing times must differ')
  .refine((rows) => {
    const spans = rows
      .map((row) => {
        const start = Number(row.start.slice(0, 2)) * 60 + Number(row.start.slice(3));
        let end = Number(row.end.slice(0, 2)) * 60 + Number(row.end.slice(3));
        if (end < start) end += 1440;
        return { start, end };
      })
      .sort((a, b) => a.start - b.start);
    return spans.every((span, index) => index === 0 || span.start >= spans[index - 1].end);
  }, 'Hours must not overlap');
export const restaurantBusinessHoursSchema = z
  .object({
    timezone: text(80).refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, 'Choose a valid IANA timezone'),
    weekly: z
      .array(z.object({ day: z.number().int().min(0).max(6), intervals }).strict())
      .length(7)
      .refine((rows) => new Set(rows.map((row) => row.day)).size === 7, 'Choose each weekday once'),
    exceptions: z
      .array(
        z
          .object({
            date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Use a valid calendar date'),
            intervals
          })
          .strict()
      )
      .max(40)
      .refine((rows) => new Set(rows.map((row) => row.date)).size === rows.length, 'Choose each exception date once')
  })
  .strict();
const translation = z
  .object({
    title: text(100).optional(),
    tagline: text(100).optional(),
    welcome: text(400).optional(),
    about: text(2000).optional(),
    hours: text(600).optional(),
    notice: text(250).optional(),
    footer: text(250).optional()
  })
  .strict();
export const restaurantPageSchema = z
  .object({
    businessHours: restaurantBusinessHoursSchema.nullable().default(null),
    seo: z
      .object({ title: text(80), description: text(180), imageUrl: image })
      .strict()
      .default({ title: '', description: '', imageUrl: '' }),
    translations: z.record(z.enum(['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn', 'bn']), translation).default({}),
    defaultLanguage: z.enum(['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn', 'bn']).default('en'),
    noticeStart: timestamp.default(''),
    noticeEnd: timestamp.default(''),
    engagementEnabled: z.boolean().default(false),
    heroPositionX: z.number().int().min(0).max(100).default(50),
    enabled: z.boolean(),
    entryMode: z.enum(['MENU', 'PAGE']),
    template: z.enum(['HERITAGE', 'CAFE', 'MODERN', 'INDIAN']),
    title: text(100),
    tagline: text(100),
    welcome: text(400),
    about: text(2000),
    accent: z.string().regex(/^#[a-f0-9]{6}$/i),
    logoUrl: image,
    heroUrl: image,
    heroPosition: z.number().int().min(0).max(100),
    gallery: z.array(z.object({ url: image.refine(Boolean, 'Choose a gallery photo'), caption: text(120) }).strict()).max(8),
    featuredItemIds: z.array(text(128).min(1)).max(8),
    sections: z.array(z.enum(['FEATURED', 'ABOUT', 'GALLERY', 'VISIT'])).max(4),
    phone: text(20).refine((v) => !v || /^\+?[0-9 ()-]{6,20}$/.test(v), 'Enter a valid phone number'),
    whatsapp: text(16).refine((v) => !v || /^\+?[1-9][0-9]{7,14}$/.test(v), 'Use country code and digits'),
    instagram: https(['instagram.com']),
    mapsUrl: https(['google.com', 'google.co.in', 'maps.app.goo.gl', 'goo.gl']),
    reviewUrl: https(['google.com', 'google.co.in', 'g.page', 'maps.app.goo.gl', 'goo.gl']),
    address: text(500),
    hours: text(600),
    notice: text(250),
    footer: text(250),
    testimonials: z
      .array(z.object({ quote: text(300).refine(Boolean, 'Add the quote'), author: text(60).refine(Boolean, 'Add who said it') }).strict())
      .max(6)
      .default([]),
    press: z
      .array(z.object({ label: text(120).refine(Boolean, 'Add a label'), url: https() }).strict())
      .max(8)
      .default([])
  })
  .strict()
  .refine((v) => !v.noticeStart || !v.noticeEnd || Date.parse(v.noticeEnd) > Date.parse(v.noticeStart), 'Notice end must be after its start')
  .refine((v) => new Set(v.sections).size === v.sections.length, 'Choose each section once')
  .refine((v) => new Set(v.featuredItemIds).size === v.featuredItemIds.length, 'Choose each featured dish once');
export type RestaurantPageInput = z.infer<typeof restaurantPageSchema>;
export const websiteQrPrintDesignSchema = z
  .object({
    template: z.enum(['website', 'website-minimal', 'website-cafe']),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    instruction: text(48).min(1),
    footer: text(100),
    showLogo: z.boolean(),
    layout: z.enum(['CARD', 'TENT', 'LABEL'])
  })
  .strict();
export type WebsiteQrPrintDesign = z.infer<typeof websiteQrPrintDesignSchema>;
export const pageCopySchema = z
  .object({
    version: z.number().int().nonnegative(),
    targets: z.array(z.string().min(1).max(128)).min(1).max(20),
    groups: z
      .array(z.enum(['DESIGN', 'STORY', 'PHOTOS', 'CONTACT', 'BEHAVIOUR']))
      .min(1)
      .max(5)
  })
  .strict()
  .refine((v) => new Set(v.targets).size === v.targets.length && new Set(v.groups).size === v.groups.length, 'Select each branch and content group once');
export type PageCopyInput = z.infer<typeof pageCopySchema>;
export const pageEventSchema = z
  .object({ type: z.enum(['PAGE_VIEW', 'MENU_OPEN', 'CALL_CLICK', 'WHATSAPP_CLICK', 'DIRECTIONS_CLICK', 'INSTAGRAM_CLICK', 'REVIEW_CLICK']) })
  .strict();

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
    translations: z.record(z.enum(['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn', 'bn']), translation).default({}),
    defaultLanguage: z.enum(['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn', 'bn']).default('en'),
    noticeStart: timestamp.default(''),
    noticeEnd: timestamp.default(''),
    engagementEnabled: z.boolean().default(false),
    heroPositionX: z.number().int().min(0).max(100).default(50),
    enabled: z.boolean(),
    entryMode: z.enum(['MENU', 'PAGE']),
    template: z.enum(['HERITAGE', 'CAFE', 'MODERN']),
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
    footer: text(250)
  })
  .strict()
  .refine((v) => !v.noticeStart || !v.noticeEnd || Date.parse(v.noticeEnd) > Date.parse(v.noticeStart), 'Notice end must be after its start')
  .refine((v) => new Set(v.sections).size === v.sections.length, 'Choose each section once')
  .refine((v) => new Set(v.featuredItemIds).size === v.featuredItemIds.length, 'Choose each featured dish once');
export type RestaurantPageInput = z.infer<typeof restaurantPageSchema>;
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

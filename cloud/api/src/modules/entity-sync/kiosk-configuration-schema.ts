import { z } from 'zod';

const language = z.enum(['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn']);
const text = z.string().max(2000);
const image = z.string().max(4_000_000).refine(v => !v || /^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v) || /^data:image\/(png|jpeg|webp);base64,/i.test(v), 'Use an HTTP(S), local asset, PNG, JPEG or WebP image.');
const display = z.object({
  enabledLanguages: z.array(language).min(1).max(7), defaultLanguage: language,
  idleWarningAfterSeconds: z.number().int().min(5).max(3600), idleResetCountdownSeconds: z.number().int().min(3).max(120),
  logoUrl: image.optional(), accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  texts: z.record(language, z.record(z.string().max(100), text).refine(v => Object.keys(v).length <= 500)).optional()
}).strict().refine(v => v.enabledLanguages.includes(v.defaultLanguage), 'Default language must be enabled.');
const welcome = z.object({ headingText: text.optional(), subtitleText: text.optional(), startOrderButtonText: text.optional(), supportingText: text.optional(), showHeritageArtwork: z.boolean(), showPromoBanner: z.boolean(), promoBannerText: text.optional(), backgroundImageUrl: image.optional() }).strict();
const receipt = z.object({
  logoUrl: image.optional(), restaurantName: text, address: text, phone: text, gstin: text, fssaiNumber: text, footerMessage: text, thankYouMessage: text,
  paperSize: z.enum(['58mm', '80mm']), showCustomerPhone: z.boolean(), showTaxBreakup: z.boolean(), showTokenBig: z.boolean(), enableWhatsApp: z.boolean(), enableSms: z.boolean(), enableEmail: z.boolean(), enableQrReceipt: z.boolean(),
  accentColor: text.optional(), showCashWatermark: z.boolean().optional(), cashWatermarkText: text.optional(), kotThemeColor: text.optional()
}).strict();
export const kioskConfigurationSchema = z.object({ branchId: z.string().min(1).max(128).optional(), updatedAt: z.string().datetime(), display, welcome, receipt }).strict();

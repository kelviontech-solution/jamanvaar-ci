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
const welcomePresentation = z.object({
  headingText: z.string().max(200).optional(), subtitleText: z.string().max(300).optional(),
  startOrderButtonText: z.string().max(60).optional(), supportingText: z.string().max(180).optional(),
  showHeritageArtwork: z.boolean(), showPromoBanner: z.boolean(), promoBannerText: z.string().max(200).optional(),
  backgroundImageUrl: image.optional(), backgroundId: z.string().max(100).optional(),
  backgroundLandscapeImageUrl: image.optional(),
  backgroundFit: z.enum(['cover', 'contain']).optional(), backgroundPositionX: z.number().min(0).max(100).optional(),
  backgroundPositionY: z.number().min(0).max(100).optional(), backgroundZoom: z.number().min(1).max(1.8).optional(),
  restaurantName: z.string().max(160).optional(), logoUrl: image.optional(), overlayOpacity: z.number().min(0).max(0.85).optional()
}).strict();
const welcome = welcomePresentation.extend({
  customBackgrounds: z.array(z.object({ id: z.string().max(100).regex(/^custom-[a-z0-9-]+$/i), name: z.string().min(1).max(80),
    imageUrl: z.string().max(620000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/),
    width: z.number().int().min(1).max(1920), height: z.number().int().min(1).max(1920) }).strict()).max(3).refine(v => new Set(v.map(b => b.id)).size === v.length, 'Custom background IDs must be unique.').optional(),
  deviceOverrides: z.record(z.string().min(1).max(128), welcomePresentation).refine(v => Object.keys(v).length <= 100, 'Too many kiosk overrides.').optional()
}).strict();
const receipt = z.object({
  logoUrl: image.optional(), restaurantName: text, address: text, phone: text, gstin: text, fssaiNumber: text, footerMessage: text, thankYouMessage: text,
  paperSize: z.enum(['58mm', '80mm']), showCustomerPhone: z.boolean(), showTaxBreakup: z.boolean(), showTokenBig: z.boolean(), enableWhatsApp: z.boolean(), enableSms: z.boolean(), enableEmail: z.boolean(), enableQrReceipt: z.boolean(),
  accentColor: text.optional(), showCashWatermark: z.boolean().optional(), cashWatermarkText: text.optional(), kotThemeColor: text.optional(),
  upiId: text.optional(), upiPayeeName: text.optional(), showUpiQrOnReceipt: z.boolean().optional()
}).strict();
export const kioskConfigurationSchema = z.object({ branchId: z.string().min(1).max(128).optional(), updatedAt: z.string().datetime(), display, welcome, receipt }).strict();

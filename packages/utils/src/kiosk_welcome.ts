import type { WelcomeScreenPresentation, WelcomeScreenSettings } from '@jamanvaar/types';

const base = '/assets/branding/kiosk-welcome-v1';
export const KIOSK_WELCOME_BACKGROUNDS = [
  ['royal-indian-dining', 'Royal Indian Dining', 'Indian Heritage'],
  ['modern-indian-dining', 'Modern Indian Dining', 'Contemporary'],
  ['gujarati-thali', 'Gujarati Thali', 'Regional Cuisine'],
  ['north-indian-cuisine', 'North Indian Cuisine', 'Regional Cuisine'],
  ['south-indian-cuisine', 'South Indian Cuisine', 'Regional Cuisine'],
  ['indian-street-food', 'Indian Street Food', 'Casual Dining'],
  ['premium-biryani', 'Premium Biryani', 'Signature Cuisine'],
  ['vegetarian-garden', 'Vegetarian Garden', 'Fresh & Vegetarian'],
  ['cafe-casual-dining', 'Café & Casual Dining', 'Café'],
  ['heritage-desserts', 'Heritage Sweets', 'Desserts'],
  ['midnight-spice', 'Midnight Spice', 'Dark & Dramatic'],
  ['terracotta-table', 'Terracotta Table', 'Rustic & Earthy'],
  ['teal-pop-kitchen', 'Teal Pop Kitchen', 'Modern & Playful'],
  ['botanical-bistro', 'Botanical Bistro', 'Botanical & Fresh'],
  ['pastel-patisserie', 'Pastel Patisserie', 'Café & Pastel'],
  ['urban-street-kitchen', 'Urban Street Kitchen', 'Bold & Urban']
].map(([id, name, category]) => ({ id, name, category, imageUrl: `${base}/${id}.webp`, landscapeImageUrl: `${base}/${id}-landscape.webp`, thumbnailUrl: `${base}/${id}-landscape-thumb.webp` }));
export const DEFAULT_KIOSK_WELCOME_BACKGROUND = KIOSK_WELCOME_BACKGROUNDS[0];
export const DEFAULT_WELCOME_PRESENTATION: WelcomeScreenPresentation = {
  backgroundId: DEFAULT_KIOSK_WELCOME_BACKGROUND.id, backgroundFit: 'cover',
  backgroundPositionX: 50, backgroundPositionY: 50, backgroundZoom: 1,
  overlayOpacity: 0.2, showHeritageArtwork: false, showPromoBanner: false
};
export function welcomePresentation(settings: WelcomeScreenSettings, deviceId?: string): WelcomeScreenPresentation {
  const { customBackgrounds: _custom, deviceOverrides, ...branch } = settings;
  const override = deviceId ? deviceOverrides?.[deviceId] : undefined;
  const presentation = { ...DEFAULT_WELCOME_PRESENTATION, ...branch, ...override };
  if (override?.backgroundId && override.backgroundId !== branch.backgroundId) {
    presentation.backgroundImageUrl = override.backgroundImageUrl;
    presentation.backgroundLandscapeImageUrl = override.backgroundLandscapeImageUrl;
  }
  if ((override?.backgroundImageUrl && !override.backgroundId) || (!override?.backgroundId && branch.backgroundImageUrl && !branch.backgroundId)) presentation.backgroundId = undefined;
  return presentation;
}
export function welcomeBackgroundUrl(settings: WelcomeScreenPresentation, custom: WelcomeScreenSettings['customBackgrounds'] = []): string {
  if (settings.backgroundId) {
    return custom?.find(b => b.id === settings.backgroundId)?.imageUrl
      || KIOSK_WELCOME_BACKGROUNDS.find(b => b.id === settings.backgroundId)?.imageUrl
      || settings.backgroundImageUrl
      || DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl;
  }
  return settings.backgroundImageUrl || DEFAULT_KIOSK_WELCOME_BACKGROUND.imageUrl;
}
/** Built-in scenes have a wide companion; custom photos retain the owner's chosen fit and focal point. */
export function welcomeLandscapeUrl(portraitUrl: string, configuredLandscape?: string): string {
  return configuredLandscape || KIOSK_WELCOME_BACKGROUNDS.find(background => background.imageUrl === portraitUrl)?.landscapeImageUrl || portraitUrl;
}
/** Reject executable/external-app schemes before assigning any image source. */
export function isWelcomeImageUrl(value: string): boolean {
  return !value || /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value) || /^data:image\/(png|jpeg|webp);base64,/i.test(value);
}
export const CUSTOM_WELCOME_MAX_BYTES = 450 * 1024;
export const CUSTOM_WELCOME_MAX_COUNT = 3;
/** Decode before re-encoding: a forged MIME type never becomes a stored image. Originals are not stored. */
export async function optimizeWelcomeUpload(file: File): Promise<{ imageUrl: string; width: number; height: number; warning?: string }> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw Error('Choose an image under 12 MB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw Error('This file could not be decoded as an image.'); });
  try {
    if (bitmap.width < 640 || bitmap.height < 640 || bitmap.width > 12000 || bitmap.height > 12000) throw Error('Use an image at least 640 × 640 and no more than 12000 pixels on either side.');
    const ratio = bitmap.width / bitmap.height;
    if (ratio < 0.3 || ratio > 3) throw Error('Use a portrait or landscape photo rather than a very narrow strip.');
    const factor = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * factor); canvas.height = Math.round(bitmap.height * factor);
    const context = canvas.getContext('2d'); if (!context) throw Error('Image optimization is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let imageUrl = '';
    for (const quality of [0.82, 0.72, 0.6, 0.45]) {
      imageUrl = canvas.toDataURL('image/webp', quality);
      if (!imageUrl.startsWith('data:image/webp;')) throw Error('Your browser cannot optimize WebP images. Use a current browser.');
      if (Math.ceil(imageUrl.split(',')[1].length * 3 / 4) <= CUSTOM_WELCOME_MAX_BYTES) break;
    }
    if (Math.ceil(imageUrl.split(',')[1].length * 3 / 4) > CUSTOM_WELCOME_MAX_BYTES) throw Error('This image is too detailed to optimize. Choose a simpler background.');
    return { imageUrl, width: canvas.width, height: canvas.height, warning: bitmap.width < 1080 || bitmap.height < 1080 ? 'A higher-resolution image will look sharper. Recommended master: 1080 × 1920 portrait.' : undefined };
  } finally { bitmap.close(); }
}

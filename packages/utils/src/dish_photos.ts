import templatePhotos from './template_photo_catalog.json';
type TemplatePhoto = { id: string; kind?: string; name: string; file: string; cuisine: string; category: string; legacy: string[]; templateId?: string; slug?: string; categoryName?: string; description?: string };
export const TEMPLATE_DISH_PHOTOS = (templatePhotos as TemplatePhoto[]).filter(photo => photo.kind !== 'category');
export const TEMPLATE_CATEGORY_PHOTOS = (templatePhotos as TemplatePhoto[]).filter(photo => photo.kind === 'category');
/** Description-matched starter photos. Restaurant uploads and external URLs always win. */
export const STARTER_DISH_PHOTOS = [
  { file: 'royal-gujarati-thali', names: ['Royal Gujarati Grand Thali', 'Gujarati Grand Thali', 'Authentic Gujarati Special Thali'], legacy: ['gujarati/thali.jpg', 'thali/gujarati-thali.jpg'] },
  { file: 'deluxe-gujarati-thali', names: ['Deluxe Gujarati Executive Thali', 'Special Gujarati Thali'], legacy: ['gujarati/thali.jpg'] },
  { file: 'khaman', names: ['Surti Nylon Khaman (250g)', 'Surti Nylon Khaman', 'Khaman'], legacy: ['gujarati/khaman.jpg'] },
  { file: 'khandvi', names: ['Khandvi with Mustard Tempering', 'Khandvi'], legacy: ['gujarati/khandvi.jpg'] },
  { file: 'methi-gota', names: ['Methi Na Gota (Pakoda)'], legacy: ['north-indian/paneer-butter-masala.jpg'] },
  { file: 'patra', names: ['Patra Steamed Rolls', 'Patra'], legacy: ['fast-food/wrap.jpg'] },
  { file: 'undhiyu', names: ['Surti Undhiyu Special'], legacy: ['gujarati/undhiyu.jpg'] },
  { file: 'sev-tameta', names: ['Sev Tameta Nu Shaak', 'Sev Tameta'], legacy: ['gujarati/sev-tameta.jpg'] },
  { file: 'ringna-bateta', names: ['Ringna Bateta Nu Shaak', 'Ringna Bateta'], legacy: ['kathiyawadi/ringna-olo.jpg'] },
  { file: 'bhindi-shaak', names: ['Bhindanu Shaak (Okra)'], legacy: ['north-indian/paneer-butter-masala.jpg'] },
  { file: 'gujarati-dal', names: ['Sweet Gujarati Toor Dal', 'Gujarati Dal'], legacy: ['gujarati/khichdi.jpg'] },
  { file: 'gujarati-kadhi', names: ['Traditional Gujarati Kadhi', 'Gujarati Kadhi'], legacy: ['gujarati/khichdi.jpg'] },
  { file: 'phulka', names: ['Phulka Rotli (Ghee, 4 Pcs)', 'Phulka'], legacy: ['gujarati/rotla.jpg'] },
  { file: 'bajra-rotla', names: ['Kathiyawadi Bajra Rotla (Ghee)', 'Bajra Rotla'], legacy: ['gujarati/rotla.jpg'] },
  { file: 'methi-thepla', names: ['Methi Thepla (4 Pcs)', 'Methi Thepla', 'Thepla'], legacy: ['gujarati/rotla.jpg'] },
  { file: 'biscuit-bhakri', names: ['Biscuit Bhakri (2 Pcs)', 'Wheat Bhakri'], legacy: ['gujarati/rotla.jpg'] },
  { file: 'khichdi-kadhi', names: ['Vaghareli Khichdi with Kadhi'], legacy: ['gujarati/khichdi.jpg'] },
  { file: 'steamed-rice', names: ['Steamed Surti Basmati Rice', 'Steamed Rice', 'Jain Steamed Rice'], legacy: ['north-indian/paneer-butter-masala.jpg'] },
  { file: 'shrikhand', names: ['Kesar Pista Shrikhand (150g)', 'Shrikhand'], legacy: ['gujarati/shrikhand.jpg'] },
  { file: 'basundi', names: ['Rich Basundi Bowl', 'Basundi'], legacy: ['gujarati/shrikhand.jpg'] },
  { file: 'masala-chaas', names: ['Kathiyawadi Masala Chaas', 'Masala Chaas', 'Masala Chaas (Spiced Buttermilk)'], legacy: ['north-indian/chaas.jpg'] },
  { file: 'paneer-rice-meal', names: ['Indian Multi-Cuisine Diner Meal Deal'], legacy: [] }
] as const;

const key = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
const byName = new Map(STARTER_DISH_PHOTOS.flatMap(photo => photo.names.map(name => [key(name), photo] as const)));
const templateByName = new Map(TEMPLATE_DISH_PHOTOS.map(photo => [key(photo.name), photo]));
export const isMenuPlaceholder = (source?: string) => !source || /\/common\/(?:menu-placeholder-v2|placeholder|fallback-dish)\.svg(?:\?.*)?$/.test(source);
export function starterDishPhoto(name: string): string | undefined {
  const template = templateByName.get(key(name));
  if (template) return `/assets/menu/template-photos-v1/${template.file}`;
  const photo = byName.get(key(name));
  if (photo) return `/assets/menu/description-matched-v1/${photo.file}.webp`;
  return undefined;
}
/** Template identity keeps similarly named categories in different niches distinct. */
export function starterCategoryPhoto(templateId: string, slug: string, name: string): string | undefined {
  const photo = TEMPLATE_CATEGORY_PHOTOS.find(photo => photo.templateId === templateId && photo.slug === slug && photo.categoryName === name);
  return photo ? `/assets/menu/template-photos-v1/${photo.file}` : undefined;
}
/** For saved categories, only replace absent/neutral covers; owner pictures always win. */
export function menuCategoryImage(source: string | undefined, name: string, description?: string, templateKey?: string): string | undefined {
  const relative = source?.replace(/^\/(?:restaurant-admin|kiosk-admin|pos-admin|pos|captain|kds|kiosk|q)(?=\/assets\/menu\/)/, '');
  const oldDefault = relative?.startsWith('/assets/menu/description-matched-v1/') || /^\/assets\/menu\/template-photos-v1\/(?:dish-|combo-)/.test(relative || '');
  if (!isMenuPlaceholder(source) && !oldDefault) return source;
  const identity = templateKey?.split('::');
  const matches = TEMPLATE_CATEGORY_PHOTOS.filter(photo => key(photo.categoryName || '') === key(name) && (!identity || photo.templateId === identity[0] && photo.slug === identity[1]));
  const photo = matches.find(photo => description && photo.description === description) || (matches.length === 1 ? matches[0] : undefined);
  return photo ? `/assets/menu/template-photos-v1/${photo.file}` : source;
}
/** Repairs only missing photos and explicitly identified old starter images, without editing tenant data. */
export function menuDishImage(source: string | undefined, name?: string): string | undefined {
  if (!name) return source;
  const photo = templateByName.get(key(name)) || byName.get(key(name));
  if (!photo) return source;
  const relative = source?.replace(/^\/(?:restaurant-admin|kiosk-admin|pos-admin|pos|captain|kds|kiosk|q)(?=\/assets\/menu\/)/, '').replace(/^\/assets\/menu\//, '');
  return isMenuPlaceholder(source) || (photo.legacy as readonly string[]).includes(relative ?? '')
    ? starterDishPhoto(name) : source;
}

import { createHash } from 'node:crypto';

/**
 * The published menu: what a restaurant froze when it pressed "Publish changes". Pure functions, no database, so the
 * same code builds the snapshot on publish, previews the draft for Restaurant Admin, and turns a snapshot into a
 * branch's view for a customer. Money is in paise everywhere inside the snapshot.
 */
type Payload = Record<string, unknown>;
const isObj = (v: unknown): v is Payload => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export interface SnapOption { id: string; name: string; description?: string; imageUrl?: string; priceDelta: number; isDefault: boolean; displayOrder: number }
export interface SnapGroup { id: string; name: string; description?: string; isRequired: boolean; minSelections: number; maxSelections: number; displayOrder: number; options: SnapOption[] }
export interface SnapCategory { id: string; name: string; description?: string; imageUrl?: string; sortOrder: number; qrVisible: boolean }
export interface SnapItem {
  id: string; name: string; description?: string; categoryId: string; pricePaise: number; imageUrl?: string; dietaryType?: string; sortOrder: number;
  available: boolean; salesChannels: string[] | null; qrEnabled: boolean; branchIds: string[]; taxGroupId?: string; modifierGroupIds: string[];
  kitchenStation?: string; minQuantity: number; maxQuantity: number; allowInstructions: boolean;
}
export interface SnapOverride { branchId: string; itemId?: string; categoryId?: string; pricePaise?: number; available?: boolean; visible?: boolean }
export interface SnapshotContent {
  schema: 2;
  taxGroups: Record<string, { rateBp: number; inclusive: boolean }>;
  categories: SnapCategory[];
  groups: SnapGroup[];
  items: SnapItem[];
  overrides: SnapOverride[];
}

export interface BuildResult { content: SnapshotContent; checksum: string; errors: string[]; warnings: string[] }

const live = (rows: Array<{ entityType: string; payload: unknown }>, type: string): Payload[] =>
  rows.filter((r) => r.entityType === type && isObj(r.payload) && r.payload.deleted !== true).map((r) => r.payload as Payload);

/** Builds the effective menu from the restaurant's draft entities, reporting what cannot be published and what will be hidden. */
export function buildContent(rows: Array<{ entityType: string; payload: unknown }>): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const taxGroups: SnapshotContent['taxGroups'] = {};
  for (const t of live(rows, 'TAX_GROUP')) {
    const id = str(t.id);
    if (!id || t.isActive === false) continue;
    const percent = num(t.igstPercent) > 0 ? num(t.igstPercent) : num(t.cgstPercent) + num(t.sgstPercent);
    taxGroups[id] = { rateBp: Math.round(percent * 100), inclusive: t.isInclusive === true };
  }

  const categories: SnapCategory[] = live(rows, 'MENU_CATEGORY')
    .filter((c) => str(c.id) && c.isActive !== false)
    .map((c) => ({ id: String(c.id), name: String(c.name ?? ''), description: str(c.description), imageUrl: str(c.imageUrl), sortOrder: num(c.sortOrder), qrVisible: c.qrVisible !== false }));
  const categoryIds = new Set(categories.map((c) => c.id));

  const groups: SnapGroup[] = [];
  for (const g of live(rows, 'MODIFIER_GROUP')) {
    const id = str(g.id);
    if (!id || g.isActive === false) continue;
    const options: SnapOption[] = (Array.isArray(g.options) ? g.options : [])
      .filter((o): o is Payload => isObj(o) && !!str(o.id) && o.isAvailable !== false && o.isActive !== false && o.deleted !== true)
      .map((o, i) => ({
        id: String(o.id), name: String(o.name ?? ''), description: str(o.description), imageUrl: str(o.imageUrl),
        priceDelta: Math.round(num(o.priceDelta) * 100), isDefault: o.isDefault === true, displayOrder: num(o.displayOrder ?? o.sortOrder, i)
      }));
    const min = Math.max(0, Math.floor(num(g.minSelections)));
    const max = Math.max(0, Math.floor(num(g.maxSelections)));
    const name = String(g.name ?? '');
    if (max > 0 && min > max) errors.push(`Modifier group "${name}": minimum (${min}) is more than maximum (${max}).`);
    if ((g.isRequired === true || min > 0) && options.length === 0) warnings.push(`Modifier group "${name}" is required but has no available options; dishes using it cannot be ordered.`);
    if (options.some((o) => o.priceDelta < 0)) errors.push(`Modifier group "${name}" has a negative option price.`);
    groups.push({ id, name, description: str(g.description), isRequired: g.isRequired === true, minSelections: min, maxSelections: max, displayOrder: num(g.displayOrder ?? g.sortOrder), options });
  }

  const items: SnapItem[] = [];
  for (const p of live(rows, 'MENU_ITEM')) {
    const id = str(p.id);
    if (!id) continue;
    const name = String(p.name ?? '');
    const price = num(p.price, NaN);
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Dish "${name}" has an invalid price.`);
      continue;
    }
    const categoryId = String(p.categoryId ?? '');
    if (!categoryIds.has(categoryId)) warnings.push(`Dish "${name}" is in a category that is inactive or missing; it is hidden.`);
    const taxGroupId = str(p.taxGroupId);
    if (taxGroupId && !taxGroups[taxGroupId]) warnings.push(`Dish "${name}" names a tax group that is not published; guests cannot order it.`);
    const minQ = Math.max(1, Math.floor(num(p.minQuantity, 1)));
    const maxQ = Math.min(50, Math.max(minQ, Math.floor(num(p.maxQuantity, 50))));
    items.push({
      id, name, description: str(p.description), categoryId, pricePaise: Math.round(price * 100), imageUrl: str(p.imageUrl), dietaryType: str(p.dietaryType),
      sortOrder: num(p.sortOrder), available: p.isAvailable !== false, salesChannels: Array.isArray(p.salesChannels) ? (p.salesChannels as unknown[]).filter((c): c is string => typeof c === 'string') : null,
      qrEnabled: p.isQrOrderingEnabled !== false, branchIds: Array.isArray(p.branchIds) ? (p.branchIds as unknown[]).filter((b): b is string => typeof b === 'string') : [],
      taxGroupId, modifierGroupIds: Array.isArray(p.modifierGroupIds) ? (p.modifierGroupIds as unknown[]).filter((g): g is string => typeof g === 'string') : [],
      kitchenStation: str(p.kitchenStation), minQuantity: minQ, maxQuantity: maxQ, allowInstructions: p.allowInstructions !== false
    });
  }

  const overrides: SnapOverride[] = live(rows, 'BRANCH_MENU_OVERRIDE')
    .filter((o) => str(o.branchId) && (str(o.itemId) || str(o.categoryId)))
    .map((o) => ({
      branchId: String(o.branchId), itemId: str(o.itemId), categoryId: str(o.categoryId),
      pricePaise: typeof o.price === 'number' && o.price >= 0 ? Math.round(o.price * 100) : undefined,
      available: typeof o.isAvailable === 'boolean' ? o.isAvailable : undefined, visible: typeof o.visible === 'boolean' ? o.visible : undefined
    }));

  const content: SnapshotContent = { schema: 2, taxGroups, categories, groups, items, overrides };
  // A stable serialisation (sorted ids) so identical drafts always have the identical checksum.
  const stable = JSON.stringify({
    ...content,
    categories: [...categories].sort((a, b) => a.id.localeCompare(b.id)),
    groups: [...groups].sort((a, b) => a.id.localeCompare(b.id)),
    items: [...items].sort((a, b) => a.id.localeCompare(b.id)),
    overrides: [...overrides].sort((a, b) => `${a.branchId}${a.itemId}${a.categoryId}`.localeCompare(`${b.branchId}${b.itemId}${b.categoryId}`))
  });
  return { content, checksum: createHash('sha1').update(stable).digest('hex'), errors, warnings };
}

export interface BranchView {
  categories: SnapCategory[];
  items: Array<SnapItem & { effectivePricePaise: number }>;
  groups: SnapGroup[];
  taxGroups: SnapshotContent['taxGroups'];
}

const byOrder = <T extends { sortOrder?: number; displayOrder?: number; name: string; id: string }>(a: T, b: T) =>
  (a.sortOrder ?? a.displayOrder ?? 0) - (b.sortOrder ?? b.displayOrder ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * What one branch's QR customer may order from this snapshot. The order is total (configured order, then name, then id), so
 * it never depends on the order a database happens to return rows.
 */
export function viewForBranch(content: SnapshotContent, branchId: string | null): BranchView {
  const catOverride = (id: string) => content.overrides.find((o) => o.branchId === branchId && o.categoryId === id);
  const itemOverride = (id: string) => content.overrides.find((o) => o.branchId === branchId && o.itemId === id);

  const categories = content.categories.filter((c) => c.qrVisible && catOverride(c.id)?.visible !== false).sort(byOrder);
  const categoryIds = new Set(categories.map((c) => c.id));

  const items = content.items
    .filter((i) => {
      const o = itemOverride(i.id);
      if (!i.available || o?.available === false || o?.visible === false) return false;
      if (i.salesChannels ? !i.salesChannels.includes('QR') : !i.qrEnabled) return false;
      if (i.branchIds.length > 0 && (!branchId || !i.branchIds.includes(branchId))) return false;
      if (!categoryIds.has(i.categoryId)) return false;
      return !!i.taxGroupId ? !!content.taxGroups[i.taxGroupId] : true;
    })
    .map((i) => ({ ...i, effectivePricePaise: itemOverride(i.id)?.pricePaise ?? i.pricePaise }))
    .sort(byOrder);

  const used = new Set(items.flatMap((i) => i.modifierGroupIds));
  const groups = content.groups.filter((g) => used.has(g.id)).sort(byOrder).map((g) => ({ ...g, options: [...g.options].sort(byOrder) }));
  return { categories: categories.filter((c) => items.some((i) => i.categoryId === c.id)), items, groups, taxGroups: content.taxGroups };
}

// ------------------------------------------------------------------------------------------ pictures

export const MAX_MENU_IMAGE_BYTES = 1_000_000;
export const IMAGE_REF = /^img:[a-f0-9]{64}$/;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;

function sniff(bytes: Buffer): string | null {
  if (bytes.length > 12 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length > 6 && bytes.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
}

export interface ExtractedImage { hash: string; contentType: string; data: Buffer }

/** Checks one inline picture (real PNG/JPEG/WebP/GIF, at most 1 MB) and returns its bytes and address, or the reason it is refused. */
export function parseInlineImage(url: string): { image: ExtractedImage } | { error: string } {
  const m = DATA_URL.exec(url);
  if (!m) return { error: 'the picture is not a PNG, JPEG, WebP or GIF' };
  const data = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (data.length > MAX_MENU_IMAGE_BYTES) return { error: 'the picture is larger than 1 MB' };
  const type = sniff(data);
  if (!type || type !== m[1]) return { error: 'the picture file is damaged or not what it claims to be' };
  return { image: { hash: createHash('sha256').update(data).digest('hex'), contentType: type, data } };
}

/**
 * Pictures typed into the menu as inline data (base64) are moved out of the snapshot into their own store, and the snapshot
 * keeps only `img:<sha256>`. Only real PNG/JPEG/WebP/GIF bytes under 1 MB are accepted (never SVG, which can carry script);
 * anything else is dropped with a warning and the dish is shown without a picture. Web addresses are left as they are.
 */
export function extractImages(content: SnapshotContent): { content: SnapshotContent; images: ExtractedImage[]; warnings: string[] } {
  const images = new Map<string, ExtractedImage>();
  const warnings: string[] = [];
  const convert = (url: string | undefined, label: string): string | undefined => {
    if (!url || !url.startsWith('data:')) return url;
    const m = DATA_URL.exec(url);
    if (!m) { warnings.push(`${label}: the picture is not a PNG, JPEG, WebP or GIF, so it is not shown to guests.`); return undefined; }
    const data = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (data.length > MAX_MENU_IMAGE_BYTES) { warnings.push(`${label}: the picture is larger than 1 MB, so it is not shown to guests. Use a smaller photo.`); return undefined; }
    const type = sniff(data);
    if (!type || type !== m[1]) { warnings.push(`${label}: the picture file is damaged or not what it claims to be, so it is not shown to guests.`); return undefined; }
    const hash = createHash('sha256').update(data).digest('hex');
    images.set(hash, { hash, contentType: type, data });
    return `img:${hash}`;
  };
  const out: SnapshotContent = {
    ...content,
    categories: content.categories.map((c) => ({ ...c, imageUrl: convert(c.imageUrl, `Category "${c.name}"`) })),
    items: content.items.map((i) => ({ ...i, imageUrl: convert(i.imageUrl, `Dish "${i.name}"`) })),
    groups: content.groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, imageUrl: convert(o.imageUrl, `Option "${o.name}"`) })) }))
  };
  return { content: out, images: [...images.values()], warnings };
}

/** The address a guest's browser uses for a stored picture (relative to the API); web addresses pass through. */
export function publicImageUrl(url: string | undefined): string | undefined {
  return url && IMAGE_REF.test(url) ? `/api/v1/public/qr/images/${url.slice(4)}` : url;
}

/** Why each dish a guest cannot see is hidden, in words the restaurant can act on. Uses the same rules as `viewForBranch`. */
export function explainHidden(content: SnapshotContent, branchId: string | null): Array<{ itemId: string; name: string; reason: string }> {
  const view = viewForBranch(content, branchId);
  const shown = new Set(view.items.map((i) => i.id));
  const catOverride = (id: string) => content.overrides.find((o) => o.branchId === branchId && o.categoryId === id);
  const itemOverride = (id: string) => content.overrides.find((o) => o.branchId === branchId && o.itemId === id);
  const out: Array<{ itemId: string; name: string; reason: string }> = [];
  for (const i of content.items) {
    if (shown.has(i.id)) continue;
    const o = itemOverride(i.id);
    const cat = content.categories.find((c) => c.id === i.categoryId);
    let reason = 'Hidden';
    if (!i.available) reason = 'Marked unavailable';
    else if (o?.available === false || o?.visible === false) reason = 'Switched off for this branch';
    else if (i.salesChannels ? !i.salesChannels.includes('QR') : !i.qrEnabled) reason = 'Not sold through QR ordering';
    else if (i.branchIds.length > 0 && (!branchId || !i.branchIds.includes(branchId))) reason = 'Not sold in this branch';
    else if (!cat) reason = 'Its category is inactive or missing';
    else if (!cat.qrVisible || catOverride(cat.id)?.visible === false) reason = 'Its category is hidden from QR ordering';
    else if (i.taxGroupId && !content.taxGroups[i.taxGroupId]) reason = 'Its tax group is missing or not in use';
    out.push({ itemId: i.id, name: i.name, reason });
  }
  return out;
}

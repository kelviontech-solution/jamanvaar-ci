import type { MenuItem } from '@jamanvaar/types';
import { db, KeyValueStore, normalizeMenuText, safeMenuImage, menuTransaction, newAuthoringId } from '@jamanvaar/database';
export interface CsvIssue { row: number; message: string }
export interface MenuCsvRow { row: number; sku: string; name: string; description: string; category: string; subcategory?: string; price: number; dietaryType: MenuItem['dietaryType']; spiceLevel: MenuItem['spiceLevel']; imageUrl?: string; taxRate?: number; isAvailable: boolean; sortOrder?: number; tags: string[]; variantName?: string; variantPrice?: number; addonName?: string; addonPrice?: number; existingItemId?: string }
export interface MenuCsvPreview { tenantId: string | null; rowsDetected: number; rows: MenuCsvRow[]; errors: CsvIssue[]; warnings: CsvIssue[] }
export const MENU_CSV_SAMPLE = '\uFEFFsku,name,description,category,subcategory,price,food_type,image_url,tax_rate,is_available,display_order,tags,variant_name,variant_price,addon_name,addon_price\r\nPIZ001,Margherita Pizza,"Classic tomato, basil and mozzarella",Pizzas,Veg Pizza,149,VEG,,5,true,1,bestseller,Regular,149,Extra Cheese,40\r\nGUJ001,ખમણ,"નરમ ખમણ, ચટણી સાથે",Farsan,,80,VEG,,5,true,2,Gujarati,,,,\r\n';
const alias: Record<string, string> = { itemname: 'name', dietarytype: 'foodtype', imageurl: 'imageurl', spicylevel: 'spicelevel' };
const headerKey = (s: string) => { const n = s.toLowerCase().replace(/[\s_-]/g, ''); return alias[n] || n; };
function parseCsv(text: string): Array<{ row: number; fields: string[] }> {
  const records: Array<{ row: number; fields: string[] }> = []; let fields: string[] = []; let value = ''; let quoted = false; let closed = false; let line = 1; let row = 1;
  text = text.replace(/^\uFEFF/, '');
  const field = () => { fields.push(value); value = ''; closed = false; };
  const record = () => { field(); if (fields.some(f => f.trim())) records.push({ row, fields }); fields = []; row = line + 1; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } }
      else { value += c; if (c === '\n') line++; }
    } else if (c === ',' ) field();
    else if (c === '\n' || c === '\r') { record(); if (c === '\r' && text[i + 1] === '\n') i++; line++; }
    else if (c === '"') { if (value.trim() || closed) throw Error(`Row ${line}: unexpected quote.`); quoted = true; value = ''; }
    else { if (closed && c.trim()) throw Error(`Row ${line}: unexpected text after a closing quote.`); if (!closed) value += c; }
  }
  if (quoted) throw Error(`Row ${row}: quoted field was not closed.`);
  if (value || fields.length) record();
  return records;
}
const money = (s: string, field: string, optional = false) => {
  if (!s.trim()) { if (optional) return undefined; throw Error(`${field} is required.`); }
  if (!/^\d+(?:\.\d{1,2})?$/.test(s.trim())) throw Error(`${field} must be a non-negative decimal with at most 2 decimal places.`);
  const n = Number(s); if (!Number.isFinite(n) || n > 1_000_000) throw Error(`${field} exceeds the allowed value.`); return n;
};
export function previewMenuCsv(text: string): MenuCsvPreview {
  const preview: MenuCsvPreview = { tenantId: KeyValueStore.get('jamanvaar_tenant_id'), rowsDetected: 0, rows: [], errors: [], warnings: [] };
  if (text.includes('\uFFFD')) { preview.errors.push({ row: 1, message: 'The file contains invalid UTF-8 text. Save it as UTF-8 CSV.' }); return preview; }
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) { preview.errors.push({ row: 1, message: 'CSV must be under 2MB.' }); return preview; }
  let records: ReturnType<typeof parseCsv>;
  try { records = parseCsv(text); } catch (error) { preview.errors.push({ row: 1, message: (error as Error).message }); return preview; }
  if (!records.length) { preview.errors.push({ row: 1, message: 'The file is empty.' }); return preview; }
  const headers = records.shift()!.fields.map(headerKey);
  if (new Set(headers).size !== headers.length || !['name', 'category', 'price'].every(key => headers.includes(key))) { preview.errors.push({ row: 1, message: 'Invalid column headers. Required: name (or Item Name), category, price. Download the CSV template.' }); return preview; }
  preview.rowsDetected = records.length;
  if (records.length > 5000) { preview.errors.push({ row: 1, message: 'Import at most 5,000 rows per file.' }); return preview; }
  const seen = new Map<string, MenuCsvRow>();
  const optionRows = new Set<string>();
  for (const record of records) {
    try {
      if (record.fields.length !== headers.length) throw Error(`Expected ${headers.length} columns; found ${record.fields.length}. Quote descriptions containing commas.`);
      const cells = Object.fromEntries(headers.map((key, i) => [key, record.fields[i].trim()]));
      if (!cells.name || cells.name.length > 200 || /[<>]/.test(cells.name)) throw Error('Name is required, at most 200 characters, without < or >.');
      if (!cells.category || cells.category.length > 120) throw Error('Category is required and must be at most 120 characters.');
      if (cells.description?.length > 2000 || cells.sku?.length > 128 || cells.subcategory?.length > 120) throw Error('Description, SKU or subcategory is too long.');
      const food = (cells.foodtype || 'VEG').toUpperCase().replace(/[- ]/g, '_') as MenuItem['dietaryType'];
      if (!['VEG', 'NON_VEG', 'EGG', 'JAIN', 'VEGAN'].includes(food)) throw Error('Food type must be VEG, NON_VEG, EGG, JAIN or VEGAN.');
      const spice = (cells.spicelevel || 'NONE').toUpperCase() as MenuItem['spiceLevel'];
      if (!['NONE', 'MILD', 'MEDIUM', 'SPICY', 'EXTRA_SPICY'].includes(spice)) throw Error('Invalid spice level.');
      if (cells.imageurl && (!safeMenuImage(cells.imageurl) || cells.imageurl.length > 100000)) throw Error('Image URL must be HTTP(S), a local asset or a small raster image.');
      const bool = (cells.isavailable || 'true').toLowerCase(); if (!['true', 'false', '1', '0', 'yes', 'no'].includes(bool)) throw Error('is_available must be true/false, yes/no or 1/0.');
      const order = cells.displayorder ? Number(cells.displayorder) : undefined; if (order !== undefined && (!Number.isInteger(order) || order < 0 || order > 100000)) throw Error('display_order must be a non-negative integer.');
      const tax = money(cells.taxrate || '', 'Tax rate', true); if (tax !== undefined && tax > 100) throw Error('Tax rate must be between 0 and 100%.');
      if ((cells.variantname || '').length > 120 || (cells.addonname || '').length > 120) throw Error('Variant and add-on names must be at most 120 characters.');
      const row: MenuCsvRow = { row: record.row, name: cells.name, category: cells.category, subcategory: cells.subcategory || undefined, sku: cells.sku || '', description: cells.description || '', price: money(cells.price, 'Price')!, dietaryType: food, spiceLevel: spice, imageUrl: cells.imageurl || undefined, taxRate: tax, isAvailable: ['true', '1', 'yes'].includes(bool), sortOrder: order, tags: (cells.tags || '').split(/[;|]/).map(s => s.trim()).filter(Boolean), variantName: cells.variantname || undefined, variantPrice: money(cells.variantprice || '', 'Variant price', true), addonName: cells.addonname || undefined, addonPrice: money(cells.addonprice || '', 'Add-on price', true) };
      if (row.tags.length > 100 || row.tags.some(tag => tag.length > 120)) throw Error('Use at most 100 tags, each up to 120 characters.');
      if (row.variantName && (row.variantPrice === undefined || row.variantPrice < row.price) || !row.variantName && row.variantPrice !== undefined) throw Error('Variant name and price must both be supplied; variant price cannot be below the base price.');
      if (!!row.addonName !== (row.addonPrice !== undefined)) throw Error('Add-on name and price must both be supplied.');
      const identity = row.sku ? `sku:${normalizeMenuText(row.sku)}` : `name:${normalizeMenuText(row.category)}:${normalizeMenuText(row.name)}`;
      const previous = seen.get(identity);
      if (previous) {
        const newOption = (row.variantName && row.variantName !== previous.variantName) || (row.addonName && row.addonName !== previous.addonName);
        if (!newOption || row.name !== previous.name || row.category !== previous.category || row.price !== previous.price || row.dietaryType !== previous.dietaryType) throw Error(`Duplicate SKU/item conflicts with row ${previous.row}. Use different variant/add-on names only for the same item.`);
      } else seen.set(identity, row);
      const optionRow = `${identity}:${normalizeMenuText(row.variantName || '')}:${normalizeMenuText(row.addonName || '')}`;
      if (optionRows.has(optionRow)) throw Error('This variant/add-on row is repeated.');
      optionRows.add(optionRow);
      const cat = db.categories.find(c => normalizeMenuText(c.name) === normalizeMenuText(row.category));
      const existing = db.menuItems.find(i => (row.sku && normalizeMenuText(i.sku) === normalizeMenuText(row.sku) || cat && i.categoryId === cat.id && normalizeMenuText(i.name) === normalizeMenuText(row.name)));
      row.existingItemId = existing?.id;
      if (existing) preview.warnings.push({ row: record.row, message: `Already exists: ${existing.name}. Default: skip.` });
      if (!cat) preview.warnings.push({ row: record.row, message: `A category named ${row.category} will be created.` });
      if (!row.imageUrl) preview.warnings.push({ row: record.row, message: 'No photo supplied; a neutral placeholder is used.' });
      preview.rows.push(row);
    } catch (error) { preview.errors.push({ row: record.row, message: (error as Error).message }); }
  }
  return preview;
}
export function applyMenuCsv(preview: MenuCsvPreview, strategy = 'SKIP_DUPLICATE') {
  if (preview.tenantId !== KeyValueStore.get('jamanvaar_tenant_id')) throw Error('Restaurant changed. Preview this CSV again.');
  const result = { itemsImported: 0, itemsSkipped: 0, categoriesCreated: 0, errors: preview.errors };
  return menuTransaction(() => {
    const applied = new Map<string, { item: MenuItem; skip: boolean }>(); const now = new Date().toISOString();
    for (const row of preview.rows) {
      const rowKey = row.sku ? normalizeMenuText(row.sku) : `${normalizeMenuText(row.category)}:${normalizeMenuText(row.name)}`;
      let current = applied.get(rowKey);
      if (!current) {
        let cat = db.categories.find(c => normalizeMenuText(c.name) === normalizeMenuText(row.category));
        const existing = db.menuItems.find(i => (row.sku && normalizeMenuText(i.sku) === normalizeMenuText(row.sku) || cat && i.categoryId === cat.id && normalizeMenuText(i.name) === normalizeMenuText(row.name)));
        if (existing && ['KEEP_EXISTING', 'SKIP_DUPLICATE'].includes(strategy)) { applied.set(rowKey, { item: existing, skip: true }); result.itemsSkipped++; continue; }
        if (!cat) { cat = { id: newAuthoringId('cat'), name: row.category, slug: normalizeMenuText(row.category), sortOrder: Math.max(0, ...db.categories.map(c => Number.isFinite(c.sortOrder) ? c.sortOrder : 0)) + 1, isActive: true, updatedAt: now }; db.categories.push(cat); result.categoriesCreated++; }
        let taxGroupId = existing?.taxGroupId;
        if (row.taxRate !== undefined) {
          let tax = db.taxGroups.find(t => t.isActive && t.cgstPercent + t.sgstPercent === row.taxRate);
          if (!tax) { tax = { id: newAuthoringId('tax'), name: `CSV GST ${row.taxRate}%`, cgstPercent: row.taxRate / 2, sgstPercent: row.taxRate / 2, igstPercent: row.taxRate, isInclusive: false, isActive: true }; db.taxGroups.push(tax); }
          taxGroupId = tax.id;
        }
        const copy = existing && strategy === 'IMPORT_AS_NEW';
        const item: MenuItem = { ...(existing && !copy ? existing : {}), id: existing && !copy ? existing.id : newAuthoringId('item'), categoryId: cat.id, subcategory: row.subcategory, sku: copy ? `${row.sku.slice(0, 90)}-${newAuthoringId('copy')}` : row.sku || newAuthoringId('sku'), name: copy ? `${row.name} (New)` : row.name, description: row.description, price: row.price, imageUrl: row.imageUrl, dietaryType: row.dietaryType, spiceLevel: row.spiceLevel, isAvailable: row.isAvailable, isPopular: existing?.isPopular ?? false, isNew: true, isFeatured: existing?.isFeatured ?? false, prepTimeMinutes: existing?.prepTimeMinutes ?? 10, allergens: existing?.allergens || [], modifierGroupIds: existing && !copy ? [...existing.modifierGroupIds] : [], sortOrder: row.sortOrder ?? db.menuItems.length + 1, tags: row.tags, taxGroupId, updatedAt: now };
        if (!Number.isFinite(item.price) || item.price < 0) throw Error(`Row ${row.row}: price changed after preview; preview again.`);
        if (existing && !copy) Object.assign(existing, item); else db.menuItems.push(item);
        current = { item, skip: false }; applied.set(rowKey, current); result.itemsImported++;
      }
      if (current.skip) continue;
      for (const [type, name, price] of [['variant', row.variantName, row.variantPrice], ['addon', row.addonName, row.addonPrice]] as const) {
        if (!name || price === undefined) continue;
        const groupId = `csv-${current.item.id}-${type}`;
        let group = db.modifierGroups.find(g => g.id === groupId);
        if (!group) { group = { id: groupId, name: `${current.item.name} — ${type === 'variant' ? 'Size' : 'Add-ons'}`, isRequired: type === 'variant', minSelections: type === 'variant' ? 1 : 0, maxSelections: type === 'variant' ? 1 : 20, options: [], sortOrder: db.modifierGroups.length + 1 }; db.modifierGroups.push(group); }
        const existingOption = group.options.find(o => normalizeMenuText(o.name) === normalizeMenuText(name));
        const option = { id: existingOption?.id || newAuthoringId('opt'), groupId, name, priceDelta: type === 'variant' ? Math.round((price - row.price) * 100) / 100 : price, isAvailable: true, isDefault: type === 'variant' && !group.options.length, sortOrder: group.options.length };
        const at = group.options.findIndex(o => normalizeMenuText(o.name) === normalizeMenuText(name)); if (at >= 0) group.options[at] = option; else group.options.push(option);
        if (group.options.length > 100) throw Error(`Row ${row.row}: at most 100 options are allowed per group.`);
        if (!current.item.modifierGroupIds.includes(groupId)) current.item.modifierGroupIds.push(groupId);
      }
    }
    db.notify(); return result;
  });
}

/**
 * BUG-014/015: Super Admin's CSV parser for its restaurant Menu tab. Deliberately NOT a
 * reuse of packages/business's MenuBuilderService — that module imports the local `db`
 * singleton from @jamanvaar/database, which this app avoids everywhere (see the comment on
 * the @jamanvaar/ui import above) because it polls a LAN-only local device bridge that has
 * no reason to run inside a pure cloud console. Same column format and validation rules as
 * the Restaurant Admin importer, targeting the cloud API's SyncedEntity-shaped payload
 * instead of a local db write.
 */

export interface MenuCsvEntity {
  externalId: string;
  payload: Record<string, unknown>;
}

export interface MenuCsvParseResult {
  categories: MenuCsvEntity[];
  items: MenuCsvEntity[];
  errors: Array<{ row: number; message: string }>;
}

const CSV_HEADERS = ['Category', 'Item Name', 'SKU', 'Price', 'Dietary Type', 'Spice Level', 'Description', 'Image URL'];
const VALID_DIETARY = new Set(['VEG', 'NON_VEG', 'JAIN', 'VEGAN', 'EGG']);
const VALID_SPICE = new Set(['NONE', 'MILD', 'MEDIUM', 'SPICY', 'EXTRA_SPICY']);

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'category';
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function parseMenuCsv(csvText: string): MenuCsvParseResult {
  const result: MenuCsvParseResult = { categories: [], items: [], errors: [] };
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    result.errors.push({ row: 1, message: 'The file is empty' });
    return result;
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const isCanonical = CSV_HEADERS.every((h, i) => header[i] === h.toLowerCase());
  if (!isCanonical) {
    result.errors.push({ row: 1, message: `Unrecognised column header. Expected: ${CSV_HEADERS.join(', ')}` });
    return result;
  }

  const seenCategories = new Map<string, string>(); // name (lowercase) -> externalId

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const [catName, name, sku, priceStr, dietaryRaw, spiceRaw, description, imageUrl] = parseCsvLine(lines[i]);

    if (!name || !name.trim()) {
      result.errors.push({ row: rowNum, message: 'Item Name is required' });
      continue;
    }
    if (!catName || !catName.trim()) {
      result.errors.push({ row: rowNum, message: 'Category is required' });
      continue;
    }
    const price = Number(priceStr);
    if (!priceStr || Number.isNaN(price) || price < 0) {
      result.errors.push({ row: rowNum, message: `Price "${priceStr ?? ''}" is not a valid non-negative number` });
      continue;
    }
    const dietaryType = (dietaryRaw || 'VEG').trim().toUpperCase();
    if (!VALID_DIETARY.has(dietaryType)) {
      result.errors.push({ row: rowNum, message: `Dietary Type "${dietaryRaw ?? ''}" must be one of ${[...VALID_DIETARY].join(', ')}` });
      continue;
    }
    const spiceCandidate = (spiceRaw || 'NONE').trim().toUpperCase();
    const spiceLevel = VALID_SPICE.has(spiceCandidate) ? spiceCandidate : 'NONE';

    const catKey = catName.trim().toLowerCase();
    let categoryExternalId = seenCategories.get(catKey);
    if (!categoryExternalId) {
      categoryExternalId = slugify(catName);
      seenCategories.set(catKey, categoryExternalId);
      result.categories.push({
        externalId: categoryExternalId,
        payload: { id: categoryExternalId, name: catName.trim(), slug: categoryExternalId, sortOrder: result.categories.length, isActive: true }
      });
    }

    const itemExternalId = sku?.trim() || `${categoryExternalId}-${slugify(name)}`;
    result.items.push({
      externalId: itemExternalId,
      payload: {
        id: itemExternalId,
        categoryId: categoryExternalId,
        sku: sku?.trim() || itemExternalId,
        name: name.trim(),
        description: description?.trim() || '',
        price,
        dietaryType,
        spiceLevel,
        isAvailable: true,
        imageUrl: imageUrl?.trim() || undefined
      }
    });
  }

  return result;
}

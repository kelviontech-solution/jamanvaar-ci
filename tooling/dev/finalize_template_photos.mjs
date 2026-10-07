import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Regenerate the compact browser catalogue and the provenance manifest from packaged photos.
// --complete also checks the frozen generation plan; normal builds never need generation access.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'packages/assets/menu/template-photos-v1');
const generationPlan = JSON.parse(fs.readFileSync(path.join(directory, 'generation-plan.json'), 'utf8'));
const records = fs.readdirSync(path.join(directory, 'metadata')).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(directory, 'metadata', name), 'utf8'))).sort((a, b) => a.id.localeCompare(b.id));
if (process.argv.includes('--complete')) {
  const plan = path.join(directory, 'generation-plan.json');
  const jobs = JSON.parse(fs.readFileSync(fs.existsSync(plan) ? plan : path.join(root, 'logs/template-photo-jobs.json'), 'utf8'));
  const missing = jobs.filter(job => !records.some(record => record.id === job.id));
  if (missing.length) throw Error(`${missing.length} photos still need generation: ${missing.slice(0, 8).map(job => job.name).join(', ')}`);
  if (records.length !== jobs.length) throw Error('Packaged photo count does not match the frozen generation plan.');
  if (new Set(records.map(record => record.sha256)).size !== records.length) throw Error('Different photo subjects must not share an identical image.');
}
for (const record of records) {
  const bytes = fs.readFileSync(path.join(directory, record.file));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw Error(`Photo checksum mismatch: ${record.file}`);
}
const vite = await createServer({ root, configFile: path.join(root, 'vitest.config.ts'), server: { middlewareMode: true }, appType: 'custom' });
let raw;
let priorPhotos;
try {
  raw = (await vite.ssrLoadModule('/packages/database/src/menu_templates_data.ts')).PREBUILT_MENU_TEMPLATES_ALL;
  priorPhotos = (await vite.ssrLoadModule('/packages/utils/src/dish_photos.ts')).STARTER_DISH_PHOTOS;
}
finally { await vite.close(); }
const key = name => name.normalize('NFKC').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
const legacy = new Map();
for (const template of raw) for (const category of template.categories) for (const item of category.items) {
  if (!item.imageUrl?.startsWith('/assets/menu/')) continue;
  const paths = legacy.get(key(item.name)) || new Set();
  paths.add(item.imageUrl.replace('/assets/menu/', ''));
  legacy.set(key(item.name), paths);
}
const catalogue = records.map(record => {
  const job = generationPlan.find(job => job.id === record.id);
  const old = priorPhotos.find(photo => photo.names.some(name => key(name) === key(record.name)));
  const paths = new Set([...(legacy.get(key(record.name)) || []), ...(job?.priorImages || []).filter(source => source.startsWith('/assets/menu/')).map(source => source.replace('/assets/menu/', '')), ...(old?.legacy || []), ...(old ? [`description-matched-v1/${old.file}.webp`] : [])]);
  // Earlier starter pickers used SVG siblings of the same bundled JPEGs.
  // Register only actual bundled files; arbitrary restaurant SVG uploads remain untouched.
  if (record.kind !== 'category') for (const prior of [...paths]) {
    const svg = prior.replace(/\.jpg$/, '.svg');
    if (svg !== prior && fs.existsSync(path.join(root, 'packages/assets/menu', svg))) paths.add(svg);
  }
  return { id: record.id, kind: record.kind, name: record.name, file: record.file, cuisine: record.cuisine, category: record.category, legacy: [...paths].sort(), ...(record.kind === 'category' ? { templateId: record.templateId, slug: record.slug, categoryName: record.categoryName, description: record.description } : {}) };
});
fs.writeFileSync(path.join(root, 'packages/utils/src/template_photo_catalog.json'), JSON.stringify(catalogue, null, 2) + '\n');
fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, generatedAt: '2026-10-07', source: 'OpenAI built-in image generation', notice: 'AI generated starter illustrations of the named dishes; restaurant owners can replace them with their actual dish photography.', photos: records }, null, 2) + '\n');
console.log(JSON.stringify({ photos: records.length, bytes: records.reduce((sum, photo) => sum + photo.bytes, 0), dishes: records.filter(record => record.kind === 'dish').length, combos: records.filter(record => record.kind === 'combo').length, categories: records.filter(record => record.kind === 'category').length }));

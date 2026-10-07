import fs from 'node:fs';
import crypto from 'node:crypto';
import { createServer } from 'vite';
const inventory = JSON.parse(fs.readFileSync('logs/template-image-inventory.json', 'utf8'));
const original = JSON.parse(fs.readFileSync('logs/template-photo-jobs.json', 'utf8'));
const key = name => name.normalize('NFKC').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 14);
const diet = items => items.some(item => item.dietaryType === 'NON_VEG') ? 'NON_VEG' : items.some(item => item.dietaryType === 'EGG') ? 'EGG' : items.every(item => item.dietaryType === 'JAIN') ? 'JAIN' : items.every(item => item.dietaryType === 'VEGAN') ? 'VEGAN' : 'VEG';
const extra = [];
for (const item of inventory.unique) {
  if (original.some(job => job.kind === 'dish' && key(job.name) === key(item.name))) continue;
  extra.push({ id: `dish-${hash(key(item.name))}`, kind: 'dish', name: item.name, description: item.description, diet: item.dietaryType || item.diet || 'VEG', cuisine: item.cuisine, category: item.category, occurrences: item.occurrences });
}
for (const combo of inventory.combos) {
  if (original.some(job => job.kind === 'combo' && job.name === combo.name)) continue;
  extra.push({ id: `combo-${combo.templateId.replace('tpl-', '')}`, kind: 'combo', name: combo.name, description: combo.description, diet: diet(combo.components), cuisine: combo.cuisine || 'Indian', category: 'Combos', components: combo.components.map(item => ({ name: item.name, description: item.description, dietaryType: item.dietaryType })) });
}
const vite = await createServer({ configFile: 'vitest.config.ts', server: { middlewareMode: true }, appType: 'custom' });
let templates;
try { templates = (await vite.ssrLoadModule('/packages/database/src/menu_templates.ts')).PREBUILT_MENU_TEMPLATES; }
finally { await vite.close(); }
for (const template of templates) for (const category of template.categories) {
  const items = category.items.length ? category.items.slice(0, 3) : template.combos.flatMap(combo => combo.itemSkus.map(sku => template.categories.flatMap(cat => cat.items).find(item => item.sku === sku))).filter(Boolean).slice(0, 3);
  extra.push({ id: `category-${hash(`${template.id}::${category.slug}::${category.name}`)}`, kind: 'category', name: `${category.name} — ${template.name}`, categoryName: category.name, templateId: template.id, slug: category.slug, description: category.description, diet: diet(items), cuisine: template.cuisine, category: category.name, components: items.map(item => ({ name: item.name, description: item.description, dietaryType: item.dietaryType })) });
}
const all = [...original, ...extra].map(job => ({ ...job, priorImages: inventory.unique.filter(item => key(item.name) === key(job.name)).map(item => item.imageUrl).filter(Boolean) }));
fs.writeFileSync('packages/assets/menu/template-photos-v1/generation-plan.json', JSON.stringify(all, null, 2) + '\n');
fs.writeFileSync('logs/template-extra-photo-jobs.json', JSON.stringify(extra, null, 2) + '\n');
console.log(JSON.stringify({ original: original.length, extra: extra.length, total: all.length, categories: extra.filter(job => job.kind === 'category').length, distinctDishNames: inventory.unique.length }));

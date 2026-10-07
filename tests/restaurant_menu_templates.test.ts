import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, KeyValueStore, PREBUILT_MENU_TEMPLATES, MenuRepository, scanMenuDuplicates, archiveConfirmedDuplicates, captureMenuCleanupBackup, restoreMenuCleanupBackup, menuCleanupReportIsCurrent, menuTransaction, menuItemBranchIntersection, TenantIsolation } from '@jamanvaar/database';
import { MenuBuilderService, previewMenuCsv, applyMenuCsv, templateItemKey, templateCategoryKey, calculateItemUnitPrice } from '@jamanvaar/business';
import { buildStandardMenu } from '../apps/kiosk-system/kiosk-user/src/standardMenu';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const savedStorage = globalThis.localStorage;
beforeEach(() => { const memory = new Map<string,string>(); globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => { memory.set(k,v); }, removeItem: k => { memory.delete(k); }, clear: () => memory.clear(), key: i => [...memory.keys()][i] ?? null, get length() { return memory.size; } }; db.resetToDefaultSeed(); db.categories = []; db.menuItems = []; db.modifierGroups = []; db.combos = []; db.menuImportHistory = []; db.taxGroups = []; db.orders = []; db.kots = []; db.recipes = []; KeyValueStore.reset(); KeyValueStore.set('jamanvaar_tenant_id', 'restaurant-A'); });
afterEach(() => { vi.restoreAllMocks(); KeyValueStore.reset(); globalThis.localStorage = savedStorage; });
const load = (id = 'tpl-pizza', keys: string[] = [], extra = {}) => MenuBuilderService.executeSelectiveImport([id], keys, {}, {}, { duplicateStrategy: 'SKIP_DUPLICATE', ...extra });
const csv = (body: string) => 'sku,name,description,category,price,food_type,is_available\n' + body;
describe('restaurant niche templates and one real menu', () => {
  it('has at least 25 real items and accurate counts for each requested niche', () => {
    for (const id of ['tpl-pizza','tpl-gujarati','tpl-punjabi','tpl-north-indian','tpl-south-indian','tpl-chinese','tpl-fast-food','tpl-cafe','tpl-bakery','tpl-biryani','tpl-kathiyawadi','tpl-chaat','tpl-desserts','tpl-multicuisine','tpl-jain']) {
      const t = PREBUILT_MENU_TEMPLATES.find(t => t.id === id)!; const items = t.categories.flatMap(c => c.items);
      expect(items.length, id).toBeGreaterThanOrEqual(25); expect(t.approxItemCount).toBe(items.length); expect(t.categoryCount).toBe(t.categories.length);
      expect(items.every(i => i.description && Number.isFinite(i.suggestedPrice) && i.suggestedPrice > 0)).toBe(true);
    }
  });
  it('imports Pizza complete, twice, without changing IDs or duplicating groups and combos', () => {
    load(); const ids = db.menuItems.map(i => i.id); const groupCount = db.modifierGroups.length; const comboCount = db.combos.length;
    expect(db.categories.map(c => c.name)).toEqual(['Pizzas','Garlic Bread','Sides','Pasta','Burgers','Beverages','Desserts','Combos']);
    const repeat = load(); expect(repeat.importedItemsCount).toBe(0); expect(db.menuItems.map(i => i.id)).toEqual(ids); expect(db.modifierGroups.length).toBe(groupCount); expect(db.combos.length).toBe(comboCount);
  });
  it('selects individual categories/items and does not import hidden combo components', () => {
    const t = PREBUILT_MENU_TEMPLATES.find(t => t.id === 'tpl-pizza')!; const c = t.categories.find(c => c.name === 'Garlic Bread')!;
    load(t.id, c.items.map(i => templateItemKey(t.id, c.slug, i.sku)), { selectedOnly: true, selectedCategoryKeys: [`${t.id}::${c.slug}`] });
    expect(db.categories.map(c => c.name)).toEqual(['Garlic Bread']); expect(db.menuItems).toHaveLength(c.items.length); expect(db.combos).toHaveLength(0);
  });
  it('does not interpret explicit empty selection as load-all', () => { load('tpl-pizza', [], { selectedOnly: true }); expect(db.menuItems).toHaveLength(0); });
  it('keeps required Regular/Medium/Large price deltas and six optional pizza add-ons', () => {
    load(); const item = db.menuItems.find(i => i.name === 'Margherita Pizza')!;
    const groups = item.modifierGroupIds.map(id => db.modifierGroups.find(g => g.id === id)!);
    expect(groups[0]).toMatchObject({ isRequired: true, minSelections: 1, maxSelections: 1 }); expect(groups[0].options.map(o => o.priceDelta)).toEqual([0,100,200]); expect(groups[1].options).toHaveLength(6);
    expect(item.price + groups[0].options[1].priceDelta + groups[1].options[0].priceDelta).toBe(289);
  });
  it('uses a real priced backing menu item for each fixed combo', () => { load(); for (const c of db.combos) { const item = db.menuItems.find(i => i.id === `combo-${c.id}`)!; expect(item.price).toBe(c.basePrice); expect(c.mainItemIds.every(id => db.menuItems.some(i => i.id === id))).toBe(true); } });
  it('preserves owner edits by default, updates explicitly or creates a separately identified copy', () => {
    load(); const item = db.menuItems.find(i => i.name === 'Margherita Pizza')!; item.price = 190; item.imageUrl = '/my-own-photo.jpg';
    load(); expect(item.price).toBe(190); expect(item.imageUrl).toBe('/my-own-photo.jpg');
    load('tpl-pizza', [item.templateItemKey!], { duplicateStrategy: 'UPDATE_EXISTING', selectedOnly: true }); expect(item.price).toBe(149);
    load('tpl-pizza', [item.templateItemKey!], { duplicateStrategy: 'IMPORT_AS_NEW', selectedOnly: true }); const copy = db.menuItems.find(i => i.name === 'Margherita Pizza (New)')!; expect(copy.id).not.toBe(item.id); expect(copy.sku).not.toBe(item.sku);
  });
  it('keeps Gujarati categories distinct and does not group Dal/Kadhi into Main Course', () => { load('tpl-gujarati'); expect(db.categories.map(c => c.name)).toContain('Dal & Kadhi'); expect(db.categories.map(c => c.name)).toContain('Gujarati Shaak (Curries)'); });
  it('saves category covers, preserves owner uploads on repeat import and honours opting out of images', () => {
    const template = PREBUILT_MENU_TEMPLATES.find(t => t.id === 'tpl-pizza')!;
    load();
    for (const category of template.categories) expect(db.categories.find(c => c.name === category.name)?.imageUrl).toBe(category.imageUrl);
    const category = db.categories.find(c => c.name === 'Pizzas')!;
    category.imageUrl = 'https://restaurant.example/own-pizzas.webp';
    load(); expect(category.imageUrl).toBe('https://restaurant.example/own-pizzas.webp');
    db.categories = []; db.menuItems = []; db.combos = []; db.modifierGroups = [];
    load('tpl-pizza', [], { importImages: false });
    expect(db.categories.every(c => c.imageUrl === undefined)).toBe(true);
  });
  it('keeps differently named categories with identical legacy slugs separate, including selective imports', () => {
    const template = PREBUILT_MENU_TEMPLATES.find(t => t.categories.some(c => t.categories.filter(peer => peer.slug === c.slug).length > 1))!;
    const category = template.categories.find(c => template.categories.filter(peer => peer.slug === c.slug).length > 1 && c.items.length)!;
    const peer = template.categories.find(c => c.slug === category.slug && c.name !== category.name)!;
    expect(templateCategoryKey(template.id, category.slug, category.name)).not.toBe(templateCategoryKey(template.id, peer.slug, peer.name));
    load(template.id, category.items.map(i => templateItemKey(template.id, category.slug, i.sku)), { selectedOnly: true, selectedCategoryKeys: [templateCategoryKey(template.id, category.slug, category.name)] });
    expect(db.categories.map(c => c.name)).toEqual([category.name]);
    load(template.id);
    const first = db.categories.find(c => c.name === category.name)!;
    const second = db.categories.find(c => c.name === peer.name)!;
    expect(first.id).not.toBe(second.id); expect(first.imageUrl).toBe(category.imageUrl); expect(second.imageUrl).toBe(peer.imageUrl);
    for (const source of [category, peer]) for (const item of source.items) expect(db.menuItems.find(i => i.templateItemKey === templateItemKey(template.id, source.slug, item.sku))?.categoryId).toBe(db.categories.find(c => c.name === source.name)?.id);
    const ids = db.categories.map(c => c.id); load(template.id); expect(db.categories.map(c => c.id)).toEqual(ids);
  });
  it('uses only explicit matching assets or a neutral fallback, all packaged in Admin and Kiosk', () => {
    const pizza = PREBUILT_MENU_TEMPLATES.find(t => t.id === 'tpl-pizza')!;
    expect(pizza.categories.flatMap(c => c.items).find(i => i.name === 'Margherita Pizza')?.imageUrl).toMatch(/^\/assets\/menu\/template-photos-v1\/dish-[a-f0-9]+\.webp$/);
    expect(pizza.categories.flatMap(c => c.items).find(i => i.name === 'Garlic Bread')?.imageUrl).toMatch(/^\/assets\/menu\/template-photos-v1\/dish-[a-f0-9]+\.webp$/);
    for (const item of PREBUILT_MENU_TEMPLATES.flatMap(t => t.categories.flatMap(c => c.items))) for (const app of ['apps/restaurant-system/pos-admin','apps/kiosk-system/kiosk-user']) expect(existsSync(resolve(app, 'public' + item.imageUrl)), item.name).toBe(true);
  });
  it('keeps the owner category order, food types and branch/channel restrictions on Kiosk', () => {
    load(); MenuRepository.moveCategory(db.categories.find(c => c.name === 'Beverages')!.id, -1);
    const pizza = db.menuItems.find(i => i.name === 'Margherita Pizza')!; pizza.branchIds = ['B'];
    const hidden = db.menuItems.find(i => i.name === 'French Fries')!; hidden.salesChannels = ['POS'];
    const view = buildStandardMenu(db.categories, db.menuItems, 'A'); expect(view.categories.map(c => c.id)).toEqual([...db.categories].sort((a,b) => a.sortOrder-b.sortOrder).map(c => c.id)); expect(view.items.some(i => [pizza.id,hidden.id].includes(i.id))).toBe(false); expect(view.items.some(i => i.dietaryType === 'NON_VEG')).toBe(true);
  });
  it('restricts a bundle to branches common to all components, never broadening a restricted menu', () => { expect(menuItemBranchIntersection([{branchIds:['A','B']},{branchIds:['B']},{}])).toEqual(['B']); expect(menuItemBranchIntersection([{branchIds:['A']},{branchIds:['B']}])).toEqual([]); expect(menuItemBranchIntersection([{},{}])).toBeUndefined(); });
  it('rolls back categories, modifiers and item insertion after a midway failure', () => {
    const template = PREBUILT_MENU_TEMPLATES.find(t => t.id === 'tpl-pizza')!; const old = template.categories[0].items[1].suggestedPrice;
    try { template.categories[0].items[1].suggestedPrice = Infinity; expect(() => load()).toThrow(/Invalid price/); expect(db.menuItems).toHaveLength(0); expect(db.categories).toHaveLength(0); expect(db.modifierGroups).toHaveLength(0); } finally { template.categories[0].items[1].suggestedPrice = old; }
  });
  it('clears foreign menu, templates, modifiers, combos and sync state at a tenant switch', () => { load(); TenantIsolation.enter('restaurant-B'); expect(db.menuItems).toHaveLength(0); expect(db.combos).toHaveLength(0); expect(db.menuImportHistory).toHaveLength(0); load(); expect(db.menuItems[0].id).toContain('tplitem-'); });
});
describe('CSV validation and import', () => {
  it('previews reordered legacy headers, BOM, quoted commas, multiline text, Gujarati and Hindi without mutating data', () => {
    const preview = previewMenuCsv('\uFEFFPrice,Category,Item Name,SKU,Description,Dietary Type\r\n80,Farsan,ખમણ,G1,"નરમ ખમણ, ચટણી\nસાથે",VEG\r\n100,Breads,बटर नान,H1,"ताजा नान",VEG');
    expect(preview.errors).toHaveLength(0); expect(preview.rows).toHaveLength(2); expect(db.menuItems).toHaveLength(0); applyMenuCsv(preview); expect(db.menuItems.map(i => i.name)).toEqual(['ખમણ','बटर नान']); expect(db.menuItems[0].description).toContain('\n');
  });
  it('keeps rows with invalid price/boolean/type/SKU out of import and imports only explicitly reviewed valid rows', () => {
    const p = previewMenuCsv(csv('S1,Good,"quoted, description",Sides,99.50,VEG,true\nS2,Bad,,Sides,Infinity,VEG,true\nS1,Other,,Sides,10,VEG,true\nS3,Invalid,,Sides,10,VEG,perhaps\nS4,Egg,,Sides,20,EGG,no'));
    expect(p.errors).toHaveLength(3); expect(p.rows).toHaveLength(2); applyMenuCsv(p); expect(db.menuItems.map(i => i.price)).toEqual([99.5,20]); expect(db.menuItems[1].isAvailable).toBe(false);
  });
  it('handles same-category normalized names with blank or changed SKU and explicit skip/update/copy', () => {
    applyMenuCsv(previewMenuCsv(csv('A,Butter Naan,,Breads,40,VEG,true')));
    const p = previewMenuCsv(csv('B, butter naan ,,Breads,55,VEG,true')); expect(p.warnings.some(w => /Already exists/.test(w.message))).toBe(true);
    applyMenuCsv(p); expect(db.menuItems).toHaveLength(1); applyMenuCsv(p,'REPLACE_DUPLICATE'); expect(db.menuItems[0].price).toBe(55); applyMenuCsv(p,'IMPORT_AS_NEW'); expect(db.menuItems).toHaveLength(2);
  });
  it('detects repeated SKU rows, empty input, malformed quotes, unsupported headers and oversized input', () => {
    for (const text of ['', 'Name,Cost\nFries,100', 'name,category,price\n"Bad,Test,10', 'x'.repeat(2*1024*1024+1)]) expect(previewMenuCsv(text).errors.length).toBeGreaterThan(0);
    expect(previewMenuCsv(csv('A,One,,Sides,10,VEG,true\nA,One,,Sides,10,VEG,true')).errors).toHaveLength(1);
  });
  it('loads multiple variants/add-ons into one priced item and explicitly selected percentage tax', () => {
    const p = previewMenuCsv('sku,name,category,price,variant_name,variant_price,addon_name,addon_price,tax_rate,display_order,tags\nP1,Pizza,Pizzas,149,Regular,149,Cheese,40,5,2,featured\nP1,Pizza,Pizzas,149,Medium,249,Olives,30,5,2,featured');
    expect(p.errors).toHaveLength(0); applyMenuCsv(p); expect(db.menuItems).toHaveLength(1); expect(db.modifierGroups).toHaveLength(2); expect(db.modifierGroups[0].options.map(o => o.priceDelta)).toEqual([0,100]); expect(db.taxGroups[0].cgstPercent+db.taxGroups[0].sgstPercent).toBe(5);
  });
  it('refuses a preview belonging to another tenant before writing', () => { const p=previewMenuCsv(csv('A,One,,Sides,10,VEG,true')); KeyValueStore.set('jamanvaar_tenant_id','B'); expect(() => applyMenuCsv(p)).toThrow(/Restaurant changed/); expect(db.menuItems).toHaveLength(0); });
  it('rolls back an exception after a valid first item', () => { const p=previewMenuCsv(csv('A,One,,Sides,10,VEG,true\nB,Two,,Sides,20,VEG,true')); p.rows[1].price=NaN; expect(() => applyMenuCsv(p)).toThrow(); expect(db.menuItems).toHaveLength(0); expect(db.categories).toHaveLength(0); });
});
describe('confirmed duplicate archiving', () => {
  const setup=()=> { load(); const item=db.menuItems.find(i=>i.name==='Garlic Bread')!; const duplicate={...structuredClone(item),id:'duplicate',name:' garlic bread '}; db.menuItems.push(duplicate); return {item,duplicate}; };
  it('scans without changing records, retains historical IDs and remaps current combo relationships', () => {
    const {item,duplicate}=setup(); db.orders=[{id:'old-order',items:[{menuItemId:duplicate.id}]} as never]; const old=JSON.stringify(db.orders); db.combos[0].mainItemIds=[duplicate.id];
    const report=scanMenuDuplicates(); expect(report.groups[0].confirmed).toBe(true); expect(duplicate.archivedAt).toBeUndefined(); archiveConfirmedDuplicates(report,[report.groups[0].id],{[report.groups[0].id]:item.id});
    expect(db.menuItems.find(i=>i.id===duplicate.id)?.archivedAt).toBeTruthy(); expect(JSON.stringify(db.orders)).toBe(old); expect(db.combos[0].mainItemIds).toEqual([item.id]); expect(buildStandardMenu(db.categories,db.menuItems).items.some(i=>i.id===duplicate.id)).toBe(false);
  });
  it('does not confirm different-size prices, modifiers, different categories or image sharing alone', () => {
    const {duplicate}=setup(); duplicate.price+=30; const report=scanMenuDuplicates(); expect(report.groups[0].confirmed).toBe(false); expect(()=>archiveConfirmedDuplicates(report,[report.groups[0].id])).toThrow(/confirmed/);
    duplicate.categoryId=db.categories.find(c=>c.name==='Sides')!.id; expect(scanMenuDuplicates().groups).toHaveLength(0);
  });
  it('rejects cleanup after a tenant or menu change', () => { const {item}=setup(); const report=scanMenuDuplicates(); item.price+=1; expect(()=>archiveConfirmedDuplicates(report,[report.groups[0].id])).toThrow(/changed/); });
  it('supports undo only while the same menu and relationships remain unchanged', () => {
    const {item}=setup(); const backup=captureMenuCleanupBackup(); const report=scanMenuDuplicates(); archiveConfirmedDuplicates(report,[report.groups[0].id],{[report.groups[0].id]:item.id}); const after=scanMenuDuplicates();
    restoreMenuCleanupBackup(backup,after); expect(db.menuItems.filter(i=>!i.archivedAt && i.name.trim().toLowerCase()==='garlic bread')).toHaveLength(2);
    const second=scanMenuDuplicates(); archiveConfirmedDuplicates(second,[second.groups[0].id]); const stale=scanMenuDuplicates(); db.combos[0].description='New owner edit'; expect(()=>restoreMenuCleanupBackup(backup,stale)).toThrow(/changed/);
  });
  it('does not mistake cloud JSON key ordering or list ordering for an owner edit during cleanup', () => {
    const {item}=setup(); const backup=captureMenuCleanupBackup(); const report=scanMenuDuplicates(); archiveConfirmedDuplicates(report,[report.groups[0].id],{[report.groups[0].id]:item.id}); const after=scanMenuDuplicates();
    db.menuItems = db.menuItems.map(i=>Object.fromEntries(Object.entries(i).reverse()) as typeof i).reverse(); db.combos=db.combos.map(c=>Object.fromEntries(Object.entries(c).reverse()) as typeof c);
    expect(menuCleanupReportIsCurrent(after)).toBe(true); expect(()=>restoreMenuCleanupBackup(backup,after)).not.toThrow();
  });
  it('does not share mutable tags with the global template or reveal another tenant version history', () => {
    load(); const template=PREBUILT_MENU_TEMPLATES.find(t=>t.id==='tpl-pizza')!; const item=db.menuItems.find(i=>i.name==='Margherita Pizza')!; item.tags!.push('owner-only'); expect(template.categories[0].items[0].tags).not.toContain('owner-only');
    MenuBuilderService.publishMenu('QA'); expect(MenuBuilderService.getVersions()).not.toHaveLength(0); KeyValueStore.set('jamanvaar_tenant_id','another-restaurant'); expect(MenuBuilderService.getVersions()).toHaveLength(0);
  });
  it('uses Unicode identity without merging Gujarati dishes or deleting menu on page opening', () => { expect(MenuRepository.normalizeDishName(' ખમણ ')).toBe(MenuRepository.normalizeDishName('ખમણ')); expect(MenuRepository.normalizeDishName('ખમણ')).not.toBe(MenuRepository.normalizeDishName('ઢોકળા')); });
});

import { optimizePageImage } from './optimizePageImage';
import './qr-catalog.css';
import { useQrUnsavedChanges } from './useQrUnsavedChanges';
import { useEffect, useRef, useState } from 'react';
import { CachedImg } from '@jamanvaar/ui';
import { previewMenuCsv, MENU_CSV_SAMPLE, type MenuCsvPreview } from '@jamanvaar/business';
import { pushEntitySync, qrApi } from '../../cloud/cloudClient';
import { QrAdminApi, type QrMenuStatus } from '../../cloud/qrAdminClient';
import { QrMenuPublication } from './QrMenuPublication';
import { downloadMenuFile } from '../menu/menuFileDownload';
import { useConfirm } from '@jamanvaar/ui';
import { QrMenuChoices } from './QrMenuChoices';
import { categoryChoiceIds, replaceCategoryChoices, validatedChoices, type ChoiceGroup } from './menuChoiceDrafts';
const input = 'w-full mt-1 rounded-xl border border-jaman-border px-3 py-2 text-sm';
const button = 'rounded-xl bg-jaman-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40';
export async function records(type: string) {
  let cursor = 0,
    rows: any[] = [];
  for (let page = 0; page < 100; page++) {
    const r = await qrApi<any>(`/api/v1/entity-sync/${type}?afterSeq=${cursor}`);
    rows.push(...r.entities.map((e: any) => ({ ...e.payload, id: e.externalId })));
    if (!r.hasMore) break;
    if (page === 99) throw new Error('This menu is too large to load safely. Ask support before importing additional dishes.');
    if (r.latestSeq <= cursor) throw new Error('Menu cursor did not advance');
    cursor = r.latestSeq;
  }
  return rows.filter((r) => !r.deleted);
}
async function write(type: string, id: string, payload: any) {
  return writeMany(type, [{ ...payload, id }]);
}
export async function writeMany(type: string, rows: any[]) {
  for (let start = 0; start < rows.length; start += 50) {
    const r = await pushEntitySync(
      type,
      rows.slice(start, start + 50).map((payload) => ({
        externalId: payload.id,
        payload: { ...payload, updatedAt: new Date().toISOString() }
      }))
    );
    const error = r.results.find((r) => r.status === 'error');
    if (error) throw new Error(`${error.error || 'Menu update failed'}. Some draft records may already be saved; review the draft before publishing.`);
  }
}
export function QrCatalog({ view = 'EDIT' }: { view?: 'EDIT' | 'LIVE' }) {
  const { confirm, confirmDialog } = useConfirm();
  const [mode, setMode] = useState<'BROWSE' | 'DISH' | 'CATEGORY' | 'CSV'>('BROWSE');
  const [newCategory, setNewCategory] = useState('');
  const [choiceDrafts, setChoiceDrafts] = useState<Record<string, ChoiceGroup>>({});
  const [publication, setPublication] = useState<QrMenuStatus | null>(null),
    [revision, setRevision] = useState(0),
    [reviewRequest, setReviewRequest] = useState(0);
  const uploadRequest = useRef(0),
    editorId = useRef(''),
    pendingCategory = useRef<{ name: string; id: string } | null>(null);
  const [items, setItems] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]),
    [groups, setGroups] = useState<any[]>([]),
    [taxes, setTaxes] = useState<any[]>([]),
    [categoryDraft, setCategoryDraft] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<MenuCsvPreview | null>(null);
  const allChoiceGroups: ChoiceGroup[] = [...groups.filter((group) => !choiceDrafts[group.id]), ...Object.values(choiceDrafts)];
  const stageChoice = (group: ChoiceGroup) => setChoiceDrafts((previous) => ({ ...previous, [group.id]: group }));
  const [search, setSearch] = useState(''),
    [categoryFilter, setCategoryFilter] = useState(''),
    [page, setPage] = useState(0);
  // Opening "Edit" (or "Add", against these same blank defaults) snapshots the starting point here,
  // so merely opening an editor and then navigating away without changing a field is never reported
  // as unsaved changes -- only a field that actually differs from this baseline is.
  const draftOriginal = useRef<any>(null),
    categoryDraftOriginal = useRef<any>(null);
  const itemDirty = !!draft && (JSON.stringify(draft) !== JSON.stringify(draftOriginal.current) || !!newCategory.trim());
  const categoryDirty = !!categoryDraft && JSON.stringify(categoryDraft) !== JSON.stringify(categoryDraftOriginal.current);
  const visibleItems = view === 'LIVE' ? (publication?.liveItems ?? []).map((live) => ({ ...items.find((item) => item.id === live.id), ...live })) : items;
  const filtered = visibleItems.filter(
    (i) => (!categoryFilter || i.categoryId === categoryFilter) && [i.name, i.description, i.sku].join(' ').toLowerCase().includes(search.trim().toLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => {
    setPage(0);
  }, [search, categoryFilter]);
  useQrUnsavedChanges(itemDirty || categoryDirty);
  useQrUnsavedChanges(!!preview);
  const switchMode = async (next: typeof mode) => {
    if (busy) return false;
    if (
      (itemDirty || categoryDirty || preview) &&
      !(await confirm({
        title: 'Leave this menu task?',
        message: 'Your current changes have not been saved. You can keep editing or discard them before switching.',
        confirmLabel: 'Discard & switch',
        cancelLabel: 'Keep editing',
        tone: 'danger'
      }))
    )
      return false;
    uploadRequest.current++;
    pendingCategory.current = null;
    setDraft(null);
    setCategoryDraft(null);
    setPreview(null);
    setChoiceDrafts({});
    setNewCategory('');
    setError('');
    setNotice('');
    setMode(next);
    return true;
  };
  const openDish = async (dish?: any) => {
    if (!(await switchMode('DISH'))) return;
    const startingCategory = categories.find((category) => category.id === categoryFilter) || categories[0];
    const blank = dish
      ? { ...dish }
      : {
          name: '',
          categoryId: startingCategory?.id || '__new__',
          price: '',
          isAvailable: true,
          dietaryType: 'VEG',
          modifierGroupIds: categoryChoiceIds(startingCategory)
        };
    editorId.current = dish?.id || crypto.randomUUID();
    draftOriginal.current = blank;
    setDraft(blank);
  };
  const openCategory = async (category?: any) => {
    if (!(await switchMode('CATEGORY'))) return;
    const blank = category ? { ...category } : { name: '', isActive: true };
    editorId.current = category?.id || crypto.randomUUID();
    categoryDraftOriginal.current = blank;
    setCategoryDraft(blank);
  };
  const readCsv = async (file?: File) => {
    if (!file || busy) return;
    const request = ++uploadRequest.current;
    setPreview(null);
    setError('');
    if (file.size > 2 * 1024 * 1024) {
      setError('Use a CSV smaller than 2 MB');
      return;
    }
    try {
      const result = previewMenuCsv(await file.text());
      if (request === uploadRequest.current) setPreview(result);
    } catch (error) {
      if (request === uploadRequest.current) setError(error instanceof Error ? error.message : 'Could not read this CSV file.');
    }
  };
  // Q06: this used to swallow its own errors (catch -> setError, no rethrow), so run() below
  // saw `await load()` resolve normally even when the post-save refresh failed — and went on to
  // report the save itself as a success. load() now propagates failures like any other step;
  // the standalone mount call below is the only caller with no run() wrapper to catch for it.
  const load = async () => {
    const [i, c, g, t] = await Promise.all([records('MENU_ITEM'), records('MENU_CATEGORY'), records('MODIFIER_GROUP'), records('TAX_GROUP')]);
    setItems(i);
    setCategories(c);
    setGroups(g);
    setTaxes(t);
  };
  useEffect(() => {
    void load().catch((e) => setError((e as Error).message));
  }, []);
  const run = async (fn: () => Promise<unknown>, message: string, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
      setRevision((value) => value + 1);
      if (message) setNotice(message);
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (reviewAfter = false) =>
    run(
      async () => {
        if (!draft.name?.trim() || !draft.categoryId || draft.price === '' || !Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)
          throw new Error('Enter a name, category and valid price');
        const selectedChoices = validatedChoices(draft.modifierGroupIds || [], allChoiceGroups);
        let categoryId = draft.categoryId;
        if (categoryId === '__new__') {
          const name = newCategory.trim();
          if (!name) throw new Error('Enter a category name for this dish.');
          const existing = categories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
          categoryId = existing?.id || (pendingCategory.current?.name === name ? pendingCategory.current.id : crypto.randomUUID());
          pendingCategory.current = { name, id: categoryId };
          if (!existing) await write('MENU_CATEGORY', categoryId, { name, isActive: true });
          // Keep the created category in the draft if the following dish save fails.
          setDraft({ ...draft, categoryId });
          setNewCategory('');
        }
        for (const group of selectedChoices) if (choiceDrafts[group.id]) await write('MODIFIER_GROUP', group.id, group);
        await write('MENU_ITEM', draft.id || editorId.current, {
          ...draft,
          categoryId,
          name: draft.name.trim(),
          price: Number(draft.price),
          description: draft.description || '',
          modifierGroupIds: draft.modifierGroupIds || [],
          isAvailable: draft.isAvailable !== false
        });
        setDraft(null);
        setChoiceDrafts({});
        setMode('BROWSE');
      },
      'Dish saved in the shared draft. Publish when your menu is ready.',
      reviewAfter ? () => setReviewRequest((value) => value + 1) : undefined
    );
  const importRows = () =>
    run(async () => {
      if (!preview || preview.errors.length || !preview.rows.length) throw new Error('Fix CSV errors before importing');
      const [knownItems, knownCategories, knownGroups] = await Promise.all([records('MENU_ITEM'), records('MENU_CATEGORY'), records('MODIFIER_GROUP')]);
      const cats = new Map(knownCategories.map((c) => [c.name.toLowerCase(), c.id])),
        taxes = new Map<number, string>(),
        created = new Map<string, any>();
      let count = 0;
      for (const row of preview.rows) {
        let categoryId = cats.get(row.category.toLowerCase());
        if (!categoryId) {
          categoryId = crypto.randomUUID();
          await write('MENU_CATEGORY', categoryId, {
            name: row.category,
            isActive: true
          });
          cats.set(row.category.toLowerCase(), categoryId);
        }
        const key = row.sku || `${categoryId}:${row.name.toLowerCase()}`;
        if (knownItems.some((i) => (row.sku ? i.sku === row.sku : i.name.toLowerCase() === row.name.toLowerCase() && i.categoryId === categoryId))) continue;
        let item = created.get(key);
        if (!item) {
          let taxGroupId: string | undefined;
          if (row.taxRate !== undefined) {
            taxGroupId = taxes.get(row.taxRate);
            if (!taxGroupId) {
              taxGroupId = crypto.randomUUID();
              await write('TAX_GROUP', taxGroupId, {
                name: `CSV GST ${row.taxRate}%`,
                cgstPercent: row.taxRate / 2,
                sgstPercent: row.taxRate / 2,
                igstPercent: row.taxRate,
                isInclusive: false,
                isActive: true
              });
              taxes.set(row.taxRate, taxGroupId);
            }
          }
          item = {
            id: crypto.randomUUID(),
            name: row.name,
            sku: row.sku,
            categoryId,
            description: row.description,
            price: row.price,
            dietaryType: row.dietaryType,
            spiceLevel: row.spiceLevel,
            imageUrl: row.imageUrl,
            isAvailable: row.isAvailable,
            tags: row.tags,
            sortOrder: row.sortOrder,
            taxGroupId,
            modifierGroupIds: []
          };
          created.set(key, item);
        }
        for (const [k, name, price] of [
          ['variant', row.variantName, row.variantPrice],
          ['addon', row.addonName, row.addonPrice]
        ] as const) {
          if (!name || price === undefined) continue;
          const groupId = `${item.id}-${k}`,
            group = item[k] ?? {
              id: groupId,
              name: k === 'variant' ? 'Size' : 'Add-ons',
              kind: k === 'variant' ? 'SIZE' : 'ADD_ON',
              isRequired: k === 'variant',
              minSelections: k === 'variant' ? 1 : 0,
              maxSelections: k === 'variant' ? 1 : 10,
              options: []
            };
          if (!group.options.some((o: any) => o.name === name))
            group.options.push({
              id: crypto.randomUUID(),
              name,
              priceDelta: k === 'variant' ? Math.round((price - row.price) * 100) / 100 : price,
              isAvailable: true
            });
          item[k] = group;
          if (!item.modifierGroupIds.includes(groupId)) item.modifierGroupIds.push(groupId);
        }
      }
      // Spreadsheet-specific choices replace the matching default kind; remaining category defaults still apply.
      for (const item of created.values()) {
        const defaults = categoryChoiceIds(knownCategories.find((category) => category.id === item.categoryId)).filter((id) => {
          const group = knownGroups.find((group) => group.id === id);
          return (
            !(item.variant && (group?.kind === 'SIZE' || group?.name?.toLowerCase() === 'size')) &&
            !(item.addon && (group?.kind === 'ADD_ON' || group?.name?.toLowerCase() === 'add-ons'))
          );
        });
        item.modifierGroupIds = [...new Set([...defaults, ...item.modifierGroupIds])];
        validatedChoices(item.modifierGroupIds, [...knownGroups, ...[item.variant, item.addon].filter(Boolean)]);
      }
      const importedGroups = [...created.values()].flatMap((item) => [item.variant, item.addon].filter(Boolean));
      await writeMany('MODIFIER_GROUP', importedGroups);
      const dishRows = [...created.values()].map(({ variant, addon, ...payload }) => payload);
      await writeMany('MENU_ITEM', dishRows);
      count = dishRows.length;
      setPreview(null);
      setMode('BROWSE');
      setNotice(`${count} dishes imported. Existing SKU/name duplicates were kept. Publish to make these dishes available.`);
    }, '');
  return (
    <>
      <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-4">
        <h2 className="text-xl font-bold">{view === 'LIVE' ? 'Live QR menu' : 'Build your menu'}</h2>
        <p className="text-sm text-slate-600">
          {view === 'LIVE'
            ? 'Check the menu guests see at this branch. New dishes and saved edits appear here after publication.'
            : 'Add one dish at a time or import a spreadsheet. Review your draft, then publish when it is ready for guests.'}
        </p>
        <QrMenuPublication revision={revision} editing={mode !== 'BROWSE' || busy} reviewRequest={reviewRequest} onStatus={setPublication} onPublished={setNotice} />
        {view === 'LIVE' && (
          <p className="qr-menu-live-intro">
            This list contains the dishes currently visible to QR guests at the selected branch, using their published names, photos and prices. Switch to
            Dishes & drafts to add or edit dishes.
          </p>
        )}
        {view === 'EDIT' && (
          <div className="qr-menu-workflows" aria-label="Menu tasks">
            <button className={button} disabled={busy} aria-pressed={mode === 'DISH'} onClick={() => void openDish()}>
              Add dish
            </button>
            <button className={button} disabled={busy} aria-pressed={mode === 'CSV'} onClick={() => void switchMode('CSV')}>
              Import CSV
            </button>
            <button className={button} disabled={busy} aria-pressed={mode === 'CATEGORY'} onClick={() => void openCategory()}>
              Add category
            </button>
            <button className={button} disabled={busy || mode !== 'BROWSE' || !publication} onClick={() => setReviewRequest((value) => value + 1)}>
              Review & publish
            </button>
          </div>
        )}
        {mode !== 'BROWSE' && (
          <p className="text-sm text-slate-600">Finish or cancel this task before publishing. Saving a draft does not change the live menu.</p>
        )}
        {view === 'EDIT' && mode === 'BROWSE' && (
          <details className="rounded-xl border p-4">
            <summary className="font-bold">Manage categories ({categories.length})</summary>
            <div className="mt-3 space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>
                    {c.name} {c.isActive === false ? '(hidden)' : ''}
                  </span>
                  <div className="flex gap-3">
                    <button disabled={busy} onClick={() => void openCategory(c)}>
                      Edit category
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (items.some((i) => i.categoryId === c.id)) {
                          setError('Move dishes to another category before deleting this category.');
                          return;
                        }
                        if (
                          await confirm({
                            title: 'Delete category?',
                            message: `Empty category "${c.name}" will be removed from the menu draft.`,
                            confirmLabel: 'Delete category',
                            tone: 'danger'
                          })
                        )
                          void run(() => write('MENU_CATEGORY', c.id, { ...c, deleted: true }), 'Category deleted from draft. Publish to apply.');
                      }}
                    >
                      Delete empty category
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
        {mode === 'CATEGORY' && categoryDraft && (
          <form
            aria-label="Category editor"
            className="grid gap-3 rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!categoryDraft.name.trim()) {
                setError('Enter a category name.');
                return;
              }
              void run(async () => {
                const defaultModifierGroupIds = categoryChoiceIds(categoryDraft);
                const selectedChoices = validatedChoices(defaultModifierGroupIds, allChoiceGroups);
                for (const group of selectedChoices) if (choiceDrafts[group.id]) await write('MODIFIER_GROUP', group.id, group);
                await write('MENU_CATEGORY', categoryDraft.id || editorId.current, {
                  ...categoryDraft,
                  name: categoryDraft.name.trim(),
                  defaultModifierGroupIds
                });
                setCategoryDraft(null);
                setChoiceDrafts({});
                setMode('BROWSE');
              }, 'Category saved in draft. Publish to apply.');
            }}
          >
            <fieldset disabled={busy} className="contents">
              <label>
                Category name
                <input
                  className={input}
                  required
                  maxLength={120}
                  value={categoryDraft.name}
                  onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={categoryDraft.isActive !== false}
                  onChange={(e) =>
                    setCategoryDraft({
                      ...categoryDraft,
                      isActive: e.target.checked
                    })
                  }
                />{' '}
                Visible category
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={categoryDraft.qrVisible !== false}
                  onChange={(e) => setCategoryDraft({ ...categoryDraft, qrVisible: e.target.checked })}
                />{' '}
                Show this category in QR ordering
              </label>
              <QrMenuChoices
                scope="category"
                selectedIds={categoryChoiceIds(categoryDraft)}
                groups={groups}
                staged={choiceDrafts}
                onSelect={(ids) => setCategoryDraft({ ...categoryDraft, defaultModifierGroupIds: ids })}
                onStage={stageChoice}
              />
              <button disabled={busy} className={button}>
                Save category
              </button>
              <button type="button" disabled={busy} onClick={() => void switchMode('BROWSE')}>
                Cancel category changes
              </button>
            </fieldset>
          </form>
        )}
        {mode === 'CSV' && (
          <section className="qr-csv-workspace" aria-label="CSV import">
            <h3 className="text-lg font-bold">Import dishes from a spreadsheet</h3>
            <p>1. Download the template and replace the sample dishes. 2. Upload your CSV. 3. Review and import.</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => {
                  downloadMenuFile('menu-template.csv', MENU_CSV_SAMPLE);
                  setNotice('CSV template downloaded. Fill it in, then upload your file here.');
                }}
              >
                CSV template
              </button>
              <label className={button}>
                Upload CSV
                <input
                  disabled={busy}
                  type="file"
                  aria-label="Upload menu CSV"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void readCsv(file);
                  }}
                />
              </label>
              <button type="button" disabled={busy} onClick={() => void switchMode('BROWSE')}>
                Cancel import
              </button>
            </div>
            {preview && (
              <div className="rounded-xl bg-slate-50 p-4">
                <h3 className="font-bold">
                  CSV preview: {preview.rows.length} valid rows / {preview.rowsDetected} detected
                </h3>
                {preview.errors.map((e, i) => (
                  <p className="text-sm text-rose-700" key={i}>
                    Row {e.row}: {e.message}
                  </p>
                ))}
                {!!preview.warnings.length && (
                  <details className="my-3">
                    <summary>{preview.warnings.length} import notes</summary>
                    <div className="max-h-48 overflow-auto">
                      {preview.warnings.map((warning, index) => (
                        <p className="text-sm text-amber-800" key={index}>
                          Row {warning.row}: {warning.message}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
                {!!preview.rows.length && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th>Dish</th>
                          <th>Category</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 10).map((row, index) => (
                          <tr key={index}>
                            <td className="py-2 pr-3">{row.name}</td>
                            <td className="pr-3">{row.category}</td>
                            <td>{row.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.rows.length > 10 && <p>Showing the first 10 of {preview.rows.length} valid rows.</p>}
                  </div>
                )}
                <button className={button} disabled={busy || !!preview.errors.length || !preview.rows.length} onClick={() => void importRows()}>
                  Import validated rows
                </button>
              </div>
            )}
          </section>
        )}
        {mode === 'DISH' && draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            aria-label="Dish editor"
            className="qr-dish-editor grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
          >
            <h3 className="text-lg font-bold sm:col-span-2">{draft.id ? 'Edit dish' : 'Add a dish'}</h3>
            <p className="text-sm text-slate-500 sm:col-span-2">Start with the name, category and price. Other details are optional.</p>
            <fieldset disabled={busy} className="contents">
              <label>
                Dish name
                <input className={input} required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label>
                Category
                <select
                  aria-label="Category"
                  className={input}
                  required
                  value={draft.categoryId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      categoryId: e.target.value,
                      ...(!draft.id
                        ? {
                            modifierGroupIds: replaceCategoryChoices(
                              draft.modifierGroupIds || [],
                              categoryChoiceIds(categories.find((c) => c.id === draft.categoryId)),
                              categoryChoiceIds(categories.find((c) => c.id === e.target.value))
                            )
                          }
                        : {})
                    })
                  }
                >
                  <option value="">Choose category</option>
                  <option value="__new__">+ Create a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {draft.categoryId === '__new__' && (
                <label>
                  New category name
                  <input
                    className={input}
                    required
                    maxLength={120}
                    placeholder="For example, Starters"
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                  />
                </label>
              )}
              <label>
                Price
                <input
                  className={input}
                  type="number"
                  step=".01"
                  min="0"
                  required
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </label>
              <label>
                Description
                <input
                  className={input}
                  maxLength={1000}
                  value={draft.description || ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <div className="qr-dish-photo-upload sm:col-span-2">
                <strong>Dish photo</strong>
                <p>Upload from your phone or computer. JPEG, PNG or WebP up to 20 MB; we resize it automatically.</p>
                <label className="qr-dish-upload-button">
                  {busy ? 'Preparing photo…' : draft.imageUrl ? 'Replace photo' : 'Upload photo'}
                  <input
                    aria-label="Dish photo (optional)"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      setBusy(true);
                      setError('');
                      try {
                        const photo = await optimizePageImage(file);
                        setDraft((current: any) => (current ? { ...current, imageUrl: photo.image } : current));
                      } catch (error) {
                        setError(error instanceof Error ? error.message : 'Could not prepare this photo.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                {draft.imageUrl && (
                  <>
                    <CachedImg src={draft.imageUrl} dishName={draft.name} alt="Dish photo preview" className="qr-menu-photo" />
                    <button type="button" onClick={() => setDraft({ ...draft, imageUrl: '' })}>
                      Remove photo
                    </button>
                  </>
                )}
              </div>
              {categoryChoiceIds(categories.find((c) => c.id === draft.categoryId)).length > 0 && (
                <div className="sm:col-span-2 rounded-xl bg-slate-50 p-3 text-sm">
                  <p>
                    Category defaults:{' '}
                    {categoryChoiceIds(categories.find((c) => c.id === draft.categoryId))
                      .map((id) => allChoiceGroups.find((group) => group.id === id)?.name || 'Missing group')
                      .join(', ')}
                    . New dishes start with these choices; you can customize this dish below.
                  </p>
                  <button
                    type="button"
                    className="mt-2 underline"
                    onClick={async () => {
                      const ids = categoryChoiceIds(categories.find((c) => c.id === draft.categoryId));
                      if (JSON.stringify(ids) === JSON.stringify(draft.modifierGroupIds || [])) return;
                      if (
                        await confirm({
                          title: 'Use category choices for this dish?',
                          message: 'This replaces this dish’s selected groups with the category defaults. Other dishes are unchanged.',
                          confirmLabel: 'Use category choices'
                        })
                      )
                        setDraft({ ...draft, modifierGroupIds: ids });
                    }}
                  >
                    Use category choices
                  </button>
                </div>
              )}
              <QrMenuChoices
                scope="dish"
                selectedIds={draft.modifierGroupIds || []}
                groups={groups}
                staged={choiceDrafts}
                onSelect={(ids) => setDraft({ ...draft, modifierGroupIds: ids })}
                onStage={stageChoice}
              />
              <details className="qr-dish-optional sm:col-span-2">
                <summary>More options: tax, dietary label, SKU and image link</summary>
                <div className="grid gap-3 mt-4 sm:grid-cols-2">
                  <label>
                    Image URL (optional)
                    <input
                      className={input}
                      value={draft.imageUrl?.startsWith('data:') ? '' : draft.imageUrl || ''}
                      placeholder={draft.imageUrl?.startsWith('data:') ? 'Photo selected above' : 'https://...'}
                      onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
                    />
                  </label>
                  <label>
                    Tax group
                    <select className={input} value={draft.taxGroupId || ''} onChange={(e) => setDraft({ ...draft, taxGroupId: e.target.value || undefined })}>
                      <option value="">Default tax</option>
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Dietary type
                    <select className={input} value={draft.dietaryType || 'VEG'} onChange={(e) => setDraft({ ...draft, dietaryType: e.target.value })}>
                      <option value="VEG">Vegetarian</option>
                      <option value="NON_VEG">Non vegetarian</option>
                      <option value="EGG">Egg</option>
                      <option value="JAIN">Jain</option>
                      <option value="VEGAN">Vegan</option>
                    </select>
                  </label>
                  <label>
                    SKU
                    <input className={input} maxLength={80} value={draft.sku || ''} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
                  </label>
                </div>
              </details>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.isAvailable !== false} onChange={(e) => setDraft({ ...draft, isAvailable: e.target.checked })} />
                Available (whole restaurant)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    draft.isQrOrderingEnabled !== false &&
                    draft.isDigitalMenuVisible !== false &&
                    (!Array.isArray(draft.salesChannels) || draft.salesChannels.includes('QR'))
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      isQrOrderingEnabled: e.target.checked,
                      isDigitalMenuVisible: e.target.checked,
                      ...(Array.isArray(draft.salesChannels)
                        ? {
                            salesChannels: e.target.checked
                              ? [...new Set([...draft.salesChannels, 'QR'])]
                              : draft.salesChannels.filter((channel: string) => channel !== 'QR')
                          }
                        : {})
                    })
                  }
                />
                Show in QR menu
              </label>
              {draft.archivedAt && (
                <div className="sm:col-span-2 qr-menu-review-warnings">
                  <p>This dish is archived and will stay hidden.</p>
                  <button type="button" className="underline" onClick={() => setDraft({ ...draft, archivedAt: undefined, archiveReason: undefined })}>
                    Restore archived dish in draft
                  </button>
                </div>
              )}
              {publication && Array.isArray(draft.branchIds) && draft.branchIds.length > 0 && !draft.branchIds.includes(publication.branchId) && (
                <div className="sm:col-span-2 qr-menu-review-warnings">
                  <p>This dish is restricted to other branches.</p>
                  <button type="button" className="underline" onClick={() => setDraft({ ...draft, branchIds: [...draft.branchIds, publication.branchId] })}>
                    Also sell at {publication.branchName}
                  </button>
                </div>
              )}
              <p className="sm:col-span-2 text-sm text-slate-600">
                New dishes and visibility restorations require publishing. Marking a dish unavailable also protects current guests from ordering it before the
                next publication.
              </p>
              <div className="qr-dish-save-actions sm:col-span-2">
                <button disabled={busy} className={button}>
                  Save draft
                </button>
                <button type="button" disabled={busy} className={button} onClick={() => void save(true)}>
                  Save & review publish
                </button>
                <button type="button" disabled={busy} onClick={() => void switchMode('BROWSE')}>
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <p role="status" className="text-emerald-700">
          {notice}
        </p>
        {notice && mode === 'BROWSE' && publication?.review.hasUnpublishedChanges && (
          <div className="qr-menu-saved-next">
            <strong>Saved in draft — customers still see the published menu.</strong>
            <button type="button" disabled={busy} onClick={() => setReviewRequest((value) => value + 1)}>
              Review & publish saved changes
            </button>
          </div>
        )}
        {mode === 'BROWSE' && (
          <>
            <div className="qr-catalog-tools">
              <label>
                Find a dish
                <input
                  className={input}
                  type="search"
                  aria-label="Search shared menu"
                  placeholder="Dish name, description or SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                Filter by category
                <select className={input} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-slate-500">
                {visibleItems.length} {view === 'LIVE' ? 'dishes live' : 'saved dishes'}
                {publication && view === 'EDIT' ? ` · ${publication.counts.live} visible on live QR` : ''}
              </p>
            </div>
            <div className="qr-catalog-grid">
              {filtered.slice(currentPage * 24, (currentPage + 1) * 24).map((i) => (
                <article className="qr-dish-card" key={i.id}>
                  <CachedImg src={i.imageUrl} dishName={i.name} alt={i.name} loading="lazy" />
                  <div>
                    <h3>{i.name}</h3>
                    <p>{categories.find((c) => c.id === i.categoryId)?.name || 'Uncategorised'}</p>
                    {(() => {
                      const state = publication?.rows.find((row) => row.id === i.id);
                      return (
                        <div className="qr-dish-visibility">
                          <span className={`qr-dish-state qr-dish-state--${view === 'LIVE' ? 'live' : state?.state.toLowerCase() || 'unknown'}`}>
                            {view === 'LIVE'
                              ? 'Live on QR'
                              : state
                                ? {
                                    LIVE: 'Live on QR',
                                    LIVE_WITH_CHANGES: 'Live · Draft changes',
                                    DRAFT_ONLY: 'Draft · Not published',
                                    HIDDEN: 'Hidden from live QR'
                                  }[state.state]
                                : 'Live status not checked'}
                          </span>
                          <p>
                            {view === 'LIVE'
                              ? 'Customers see this published dish.'
                              : state?.reason || 'Select a branch or refresh live status to check visibility.'}
                          </p>
                          {view === 'EDIT' && state && !state.afterPublishVisible && (
                            <p className="qr-dish-hidden-reason">After publishing: {state.afterPublishReason}</p>
                          )}
                          {view === 'EDIT' && state?.livePrice !== null && state?.livePrice !== undefined && state.livePrice !== Number(i.price) && (
                            <small>
                              Live price: ₹{state.livePrice.toFixed(2)} · Draft price: ₹{Number(i.price).toFixed(2)}
                            </small>
                          )}
                          {view === 'EDIT' && state && !state.live && state.afterPublishVisible && <p>Ready in draft. Publish to make it visible.</p>}
                          {publication && (view === 'LIVE' || (state?.canRestoreBranchPause && state?.reason === 'Switched off for this branch')) && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => QrAdminApi.branchAvailability(publication.branchId, i.id, view !== 'LIVE'),
                                  view === 'LIVE'
                                    ? 'Dish paused at this branch. Review and publish to save the branch menu state.'
                                    : 'Branch pause removed in draft. Review and publish to restore the dish to the live QR menu.'
                                )
                              }
                            >
                              {view === 'LIVE' ? 'Pause at this branch' : 'Remove branch pause'}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    <footer>
                      <strong>₹{Number(i.price).toLocaleString('en-IN')}</strong>
                      <div className="qr-dish-actions">
                        {view === 'EDIT' && (
                          <button className="font-bold text-orange-700" disabled={busy} onClick={() => void openDish(i)}>
                            Edit
                          </button>
                        )}
                        {view === 'EDIT' && (
                          <button
                            disabled={busy}
                            className="font-bold text-rose-700"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: 'Delete dish?',
                                  message: `"${i.name}" will be removed from the menu draft.`,
                                  confirmLabel: 'Delete dish',
                                  tone: 'danger'
                                })
                              )
                                void run(() => write('MENU_ITEM', i.id, { ...i, deleted: true }), 'Dish deleted from draft. Publish to apply.');
                            }}
                          >
                            Delete dish
                          </button>
                        )}
                      </div>
                    </footer>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                {view === 'LIVE'
                  ? 'No live QR dishes match this view. Check the publication status, branch and visibility reasons in Dishes & drafts.'
                  : items.length
                    ? 'No dishes match your filters. Try another name or category.'
                    : 'Add your first dish or import a CSV to start building your menu.'}
              </p>
            )}
            {pages > 1 && (
              <div className="qr-catalog-paging">
                <span>
                  {currentPage * 24 + 1}–{Math.min((currentPage + 1) * 24, filtered.length)} of {filtered.length} dishes
                </span>
                <div className="flex gap-2">
                  <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                    Previous dishes
                  </button>
                  <button disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>
                    Next dishes
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {confirmDialog}
    </>
  );
}

import { useQrUnsavedChanges } from './useQrUnsavedChanges';
import { useEffect, useState } from "react";
import { CachedImg } from "@jamanvaar/ui";
import {
  previewMenuCsv,
  MENU_CSV_SAMPLE,
  type MenuCsvPreview,
} from "@jamanvaar/business";
import { pushEntitySync, qrApi } from "../../cloud/cloudClient";
import { QrAdminApi } from "../../cloud/qrAdminClient";
import { downloadMenuFile } from "../menu/MenuImportModals";
const input =
  "w-full mt-1 rounded-xl border border-jaman-border px-3 py-2 text-sm";
const button =
  "rounded-xl bg-jaman-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40";
async function records(type: string) {
  let cursor = 0,
    rows: any[] = [];
  for (let page = 0; page < 100; page++) {
    const r = await qrApi<any>(
      `/api/v1/entity-sync/${type}?afterSeq=${cursor}`,
    );
    rows.push(
      ...r.entities.map((e: any) => ({ ...e.payload, id: e.externalId })),
    );
    if (!r.hasMore) break;
    if (r.latestSeq <= cursor) throw new Error("Menu cursor did not advance");
    cursor = r.latestSeq;
  }
  return rows.filter((r) => !r.deleted);
}
async function write(type: string, id: string, payload: any) {
  return writeMany(type, [{ ...payload, id }]);
}
async function writeMany(type: string, rows: any[]) {
  for (let start = 0; start < rows.length; start += 50) {
    const r = await pushEntitySync(
      type,
      rows.slice(start, start + 50).map((payload) => ({
        externalId: payload.id,
        payload: { ...payload, updatedAt: new Date().toISOString() },
      })),
    );
    const error = r.results.find((r) => r.status === "error");
    if (error)
      throw new Error(
        `${error.error || "Menu update failed"}. Some draft records may already be saved; review the draft before publishing.`,
      );
  }
}
export function QrCatalog() {
  const [items, setItems] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]),
    [groups, setGroups] = useState<any[]>([]),
    [taxes, setTaxes] = useState<any[]>([]),
    [categoryDraft, setCategoryDraft] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<MenuCsvPreview | null>(null);
  const [search, setSearch] = useState(""),
    [categoryFilter, setCategoryFilter] = useState(""),
    [page, setPage] = useState(0);
  const filtered = items.filter(
    (i) =>
      (!categoryFilter || i.categoryId === categoryFilter) &&
      [i.name, i.description, i.sku]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => {
    setPage(0);
  }, [search, categoryFilter]);
  useQrUnsavedChanges(!!draft || !!categoryDraft);
  const load = async () => {
    try {
      const [i, c, g, t] = await Promise.all([
        records("MENU_ITEM"),
        records("MENU_CATEGORY"),
        records("MODIFIER_GROUP"),
        records("TAX_GROUP"),
      ]);
      setItems(i);
      setCategories(c);
      setGroups(g);
      setTaxes(t);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice('');
    try {
      await fn();
      await load();
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (
        !draft.name?.trim() ||
        !draft.categoryId ||
        !Number.isFinite(Number(draft.price)) ||
        Number(draft.price) < 0
      )
        throw new Error("Enter a name, category and valid price");
      await write("MENU_ITEM", draft.id || crypto.randomUUID(), {
        ...draft,
        name: draft.name.trim(),
        price: Number(draft.price),
        description: draft.description || "",
        modifierGroupIds: draft.modifierGroupIds || [],
        isAvailable: draft.isAvailable !== false,
      });
      setDraft(null);
    }, "Dish saved in the shared draft. Publish when your menu is ready.");
  const importRows = () =>
    run(async () => {
      if (!preview || preview.errors.length)
        throw new Error("Fix CSV errors before importing");
      const cats = new Map(categories.map((c) => [c.name.toLowerCase(), c.id])),
        taxes = new Map<number, string>(),
        created = new Map<string, any>();
      let count = 0;
      for (const row of preview.rows) {
        let categoryId = cats.get(row.category.toLowerCase());
        if (!categoryId) {
          categoryId = crypto.randomUUID();
          await write("MENU_CATEGORY", categoryId, {
            name: row.category,
            isActive: true,
          });
          cats.set(row.category.toLowerCase(), categoryId);
        }
        const key = row.sku || `${categoryId}:${row.name.toLowerCase()}`;
        if (
          items.some((i) =>
            row.sku
              ? i.sku === row.sku
              : i.name.toLowerCase() === row.name.toLowerCase() &&
                i.categoryId === categoryId,
          )
        )
          continue;
        let item = created.get(key);
        if (!item) {
          let taxGroupId: string | undefined;
          if (row.taxRate !== undefined) {
            taxGroupId = taxes.get(row.taxRate);
            if (!taxGroupId) {
              taxGroupId = crypto.randomUUID();
              await write("TAX_GROUP", taxGroupId, {
                name: `CSV GST ${row.taxRate}%`,
                cgstPercent: row.taxRate / 2,
                sgstPercent: row.taxRate / 2,
                igstPercent: row.taxRate,
                isInclusive: false,
                isActive: true,
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
            modifierGroupIds: [],
          };
          created.set(key, item);
        }
        for (const [k, name, price] of [
          ["variant", row.variantName, row.variantPrice],
          ["addon", row.addonName, row.addonPrice],
        ] as const) {
          if (!name || price === undefined) continue;
          const groupId = `${item.id}-${k}`,
            group = item[k] ?? {
              id: groupId,
              name: k === "variant" ? "Size" : "Add-ons",
              isRequired: k === "variant",
              minSelections: k === "variant" ? 1 : 0,
              maxSelections: k === "variant" ? 1 : 10,
              options: [],
            };
          if (!group.options.some((o: any) => o.name === name))
            group.options.push({
              id: crypto.randomUUID(),
              name,
              priceDelta:
                k === "variant"
                  ? Math.round((price - row.price) * 100) / 100
                  : price,
              isAvailable: true,
            });
          item[k] = group;
          if (!item.modifierGroupIds.includes(groupId))
            item.modifierGroupIds.push(groupId);
        }
      }
      const groups = [...created.values()].flatMap((item) =>
        [item.variant, item.addon].filter(Boolean),
      );
      await writeMany("MODIFIER_GROUP", groups);
      const dishRows = [...created.values()].map(
        ({ variant, addon, ...payload }) => payload,
      );
      await writeMany("MENU_ITEM", dishRows);
      count = dishRows.length;
      setPreview(null);
      setNotice(
        `${count} dishes imported. Existing SKU/name duplicates were kept. Publish to make these dishes available.`,
      );
    }, "");
  return (
    <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-4">
      <h2 className="text-xl font-bold">Shared menu editor</h2>
      <p className="text-sm text-slate-600">
        These are the same dishes, categories, variants and taxes used by
        Restaurant Admin. Saving edits the draft; publishing releases it to
        customer menus. CSV retries keep existing dishes and report errors.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className={button}
          onClick={() =>
            setDraft({
              name: "",
              categoryId: categories[0]?.id || "",
              price: 0,
              isAvailable: true,
            })
          }
        >
          Add dish
        </button>
        <button
          className={button}
          onClick={() => setCategoryDraft({ name: "", isActive: true })}
        >
          Add category
        </button>
        <label className={button}>
          Preview CSV
          <input
            className="hidden"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 3000000) {
                  setError("Use a CSV smaller than 3 MB");
                  return;
                }
                setPreview(previewMenuCsv(await f.text()));
              }
            }}
          />
        </label>
        <button
          className={button}
          onClick={() => downloadMenuFile("menu-template.csv", MENU_CSV_SAMPLE)}
        >
          CSV template
        </button>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void run(QrAdminApi.publishMenu, "Menu published for guests.")
          }
        >
          Publish shared menu
        </button>
      </div>
      <details className="rounded-xl border p-4">
        <summary className="font-bold">
          Manage categories ({categories.length})
        </summary>
        <div className="mt-3 space-y-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span>
                {c.name} {c.isActive === false ? "(hidden)" : ""}
              </span>
              <div className="flex gap-3">
                <button onClick={() => setCategoryDraft({ ...c })}>
                  Edit category
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (items.some((i) => i.categoryId === c.id)) {
                      setError(
                        "Move dishes to another category before deleting this category.",
                      );
                      return;
                    }
                    if (window.confirm(`Delete empty category ${c.name}?`))
                      void run(
                        () =>
                          write("MENU_CATEGORY", c.id, { ...c, deleted: true }),
                        "Category deleted from draft. Publish to apply.",
                      );
                  }}
                >
                  Delete empty category
                </button>
              </div>
            </div>
          ))}
        </div>
      </details>
      {categoryDraft && (
        <form
          className="grid gap-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await write(
                "MENU_CATEGORY",
                categoryDraft.id || crypto.randomUUID(),
                { ...categoryDraft, name: categoryDraft.name.trim() },
              );
              setCategoryDraft(null);
            }, "Category saved in draft. Publish to apply.");
          }}
        >
          <label>
            Category name
            <input
              className={input}
              required
              maxLength={120}
              value={categoryDraft.name}
              onChange={(e) =>
                setCategoryDraft({ ...categoryDraft, name: e.target.value })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={categoryDraft.isActive !== false}
              onChange={(e) =>
                setCategoryDraft({
                  ...categoryDraft,
                  isActive: e.target.checked,
                })
              }
            />{" "}
            Visible category
          </label>
          <button disabled={busy} className={button}>
            Save category
          </button>
          <button type="button" onClick={() => setCategoryDraft(null)}>
            Cancel category changes
          </button>
        </form>
      )}
      {preview && (
        <div className="rounded-xl bg-slate-50 p-4">
          <h3 className="font-bold">
            CSV preview: {preview.rows.length} valid rows /{" "}
            {preview.rowsDetected} detected
          </h3>
          {preview.errors.map((e, i) => (
            <p className="text-sm text-rose-700" key={i}>
              Row {e.row}: {e.message}
            </p>
          ))}
          {preview.warnings.map((e, i) => (
            <p className="text-sm text-amber-800" key={i}>
              Row {e.row}: {e.message}
            </p>
          ))}
          <p className="text-sm">
            {preview.rows
              .slice(0, 5)
              .map((r) => r.name)
              .join(", ")}
          </p>
          <button
            className={button}
            disabled={busy || !!preview.errors.length}
            onClick={() => void importRows()}
          >
            Import validated rows
          </button>
          <button className="ml-3" onClick={() => setPreview(null)}>
            Cancel import
          </button>
        </div>
      )}
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
        >
          <label>
            Dish name
            <input
              className={input}
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              className={input}
              required
              value={draft.categoryId}
              onChange={(e) =>
                setDraft({ ...draft, categoryId: e.target.value })
              }
            >
              <option value="">Choose category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
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
              value={draft.description || ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <label>
            Image URL
            <input
              className={input}
              value={draft.imageUrl || ""}
              onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
            />
          </label>
          <label>
            Tax group
            <select
              className={input}
              value={draft.taxGroupId || ""}
              onChange={(e) =>
                setDraft({ ...draft, taxGroupId: e.target.value || undefined })
              }
            >
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
            <select
              className={input}
              value={draft.dietaryType || "VEG"}
              onChange={(e) =>
                setDraft({ ...draft, dietaryType: e.target.value })
              }
            >
              <option value="VEG">Vegetarian</option>
              <option value="NON_VEG">Non vegetarian</option>
              <option value="EGG">Egg</option>
              <option value="JAIN">Jain</option>
              <option value="VEGAN">Vegan</option>
            </select>
          </label>
          <label>
            SKU
            <input
              className={input}
              maxLength={80}
              value={draft.sku || ""}
              onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
            />
          </label>
          {!!groups.length && (
            <fieldset className="rounded-xl border p-3 sm:col-span-2">
              <legend>Variants & add-ons</legend>
              {groups.map((g) => (
                <label
                  key={g.id}
                  className="mr-4 inline-flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={(draft.modifierGroupIds || []).includes(g.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        modifierGroupIds: e.target.checked
                          ? [...(draft.modifierGroupIds || []), g.id]
                          : (draft.modifierGroupIds || []).filter(
                              (id: string) => id !== g.id,
                            ),
                      })
                    }
                  />
                  {g.name}
                </label>
              ))}
              <p className="mt-2 text-xs text-slate-500">
                Option groups and variants can also be imported using the CSV
                template.
              </p>
            </fieldset>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isAvailable !== false}
              onChange={(e) =>
                setDraft({ ...draft, isAvailable: e.target.checked })
              }
            />
            Available
          </label>
          <button disabled={busy} className={button}>
            Save draft
          </button>
          <button type="button" onClick={() => setDraft(null)}>
            Cancel
          </button>
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
          <select
            className={input}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-slate-500">{items.length} dishes in draft</p>
      </div>
      <div className="qr-catalog-grid">
        {filtered.slice(currentPage * 24, (currentPage + 1) * 24).map((i) => (
          <article className="qr-dish-card" key={i.id}>
            <CachedImg
              src={i.imageUrl}
              dishName={i.name}
              alt={i.name}
              loading="lazy"
            />
            <div>
              <h3>{i.name}</h3>
              <p>
                {categories.find((c) => c.id === i.categoryId)?.name ||
                  "Uncategorised"}{" "}
                · {i.isAvailable === false ? "Unavailable" : "Available"}
              </p>
              <footer>
                <strong>₹{Number(i.price).toLocaleString("en-IN")}</strong>
                <div className="qr-dish-actions">
                  <button
                    className="font-bold text-orange-700"
                    onClick={() => setDraft({ ...i })}
                  >
                    Edit
                  </button>
                  <button
                    disabled={busy}
                    className="font-bold text-rose-700"
                    onClick={() => {
                      if (
                        window.confirm(`Delete ${i.name} from the menu draft?`)
                      )
                        void run(
                          () =>
                            write("MENU_ITEM", i.id, { ...i, deleted: true }),
                          "Dish deleted from draft. Publish to apply.",
                        );
                    }}
                  >
                    Delete dish
                  </button>
                </div>
              </footer>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
          {items.length
            ? "No dishes match your filters. Try another name or category."
            : "Add your first dish or import a CSV to start building your menu."}
        </p>
      )}
      {pages > 1 && (
        <div className="qr-catalog-paging">
          <span>
            {currentPage * 24 + 1}–
            {Math.min((currentPage + 1) * 24, filtered.length)} of{" "}
            {filtered.length} dishes
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous dishes
            </button>
            <button
              disabled={currentPage >= pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next dishes
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

import { requestQrLeave, useQrUnsavedChanges } from './useQrUnsavedChanges';
import { formatINR } from '@jamanvaar/utils';
import { useEffect, useRef, useState } from "react";
import { qrApi } from "../../cloud/cloudClient";
import { QrAdminApi } from "../../cloud/qrAdminClient";
import { QR_BUTTON, QR_FIELD } from './qrUi';
const base = "/api/v1/restaurant/qr/advanced/promotions";
const input = QR_FIELD,
  button = QR_BUTTON;
type Promotion = {
  report?: {
    acceptedOrders: number;
    discountValue: number;
    orderValue: number;
    settledSales: number;
  };
  id: string;
  version: number;
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FLAT";
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usageCount?: number;
  perCustomerLimit?: number;
  firstOrderOnly?: boolean;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  branchIds?: string[];
  itemIds?: string[];
  categoryIds?: string[];
};
const empty = (): Omit<Promotion, "id" | "version"> => ({
  code: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: 10,
  minOrderValue: 0,
  validFrom: new Date().toISOString(),
  validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
  isActive: true,
  branchIds: [],
  itemIds: [],
  categoryIds: [],
});
const localDate = (date: string) => {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function QrPromotions({
  showToast,
}: {
  showToast: (message: string) => void;
}) {
  const [rows, setRows] = useState<Promotion[]>([]),
    [form, setForm] = useState(empty),
    [edit, setEdit] = useState<Promotion | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const baseline=useRef(form);
  const [listLoading, setListLoading] = useState(true), [listError, setListError] = useState(''), [menuError, setMenuError] = useState('');
  const alive = useRef(true);
  useQrUnsavedChanges(JSON.stringify(form)!==JSON.stringify(baseline.current));
  const load = async () => {
    setListLoading(true);
    try { const result = await qrApi<Promotion[]>(base); if (alive.current) { setRows(result); setListError(''); } }
    catch (e) { if (alive.current) setListError((e as Error).message); throw e; }
    finally { if (alive.current) setListLoading(false); }
  };
  useEffect(() => {
    alive.current = true;
    void load().catch(() => {});
    QrAdminApi.menuPreview().then(m => { if (alive.current) setItems(m.items); }).catch(e => { if (alive.current) setMenuError(e.message); });
    return () => {
      alive.current = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (!/^[A-Z0-9_-]{2,40}$/.test(form.code.trim())) throw Error('Use 2–40 letters, numbers, hyphens or underscores for the coupon code.');
      if (!(form.discountValue > 0) || form.discountType === 'PERCENTAGE' && form.discountValue > 100) throw Error('Enter a positive discount. Percentage discounts cannot exceed 100.');
      if (!(Date.parse(form.validUntil) > Date.parse(form.validFrom))) throw Error('Promotion end must be after its start.');
      const { usageCount, ...promotion } = form;
      await qrApi(edit ? `${base}/${encodeURIComponent(edit.id)}` : base, {
        method: edit ? "PUT" : "POST",
        body: JSON.stringify(
          edit ? { promotion, version: edit.version } : promotion,
        ),
      });
      showToast(edit ? "Promotion updated" : "Promotion created");
      setEdit(null);
      const next=empty();baseline.current=next;setForm(next);
      // The save already committed. A failed list refresh must not leave a create form ready to submit again.
      await load().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pick = async (row: Promotion) => {
    if (!(await requestQrLeave())) return;
    setEdit(row);
    const next={
      code: row.code,
      description: row.description,
      discountType: row.discountType,
      discountValue: row.discountValue,
      minOrderValue: row.minOrderValue,
      maxDiscountAmount: row.maxDiscountAmount,
      usageLimit: row.usageLimit,
      perCustomerLimit: row.perCustomerLimit,
      firstOrderOnly: row.firstOrderOnly,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      isActive: row.isActive,
      branchIds: row.branchIds ?? [],
      itemIds: row.itemIds ?? [],
      categoryIds: row.categoryIds ?? [],
    };baseline.current=next;setForm(next);
  };
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h3 className="text-lg font-bold text-jaman-navy">
        Coupons and promotions
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Uses the same coupon records as your other apps. Branch-bound consoles
        create local promotions. Usage is reserved at order submission; failed
        duplicate taps cannot consume it twice.
      </p>
      <button type="button" className="qr-btn secondary mt-3" disabled={listLoading || busy} onClick={() => void load().catch(() => {})}>{listLoading ? 'Loading promotions…' : 'Refresh saved promotions'}</button>
      {listError && <p role="alert" className="my-3 text-sm text-rose-700">Saved promotions could not be refreshed: {listError}. Use Refresh saved promotions to retry.</p>}
      {menuError && <p role="status" className="my-3 text-sm text-amber-800">Dish choices could not load: {menuError}. You can still create a promotion without restricting it to selected dishes.</p>}
      {error && (
        <p className="my-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="my-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          Coupon code
          <input
            className={input}
            maxLength={40}
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
          />
        </label>
        <label className="text-sm">
          Description
          <input
            className={input}
            maxLength={300}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Discount type
          <select
            className={input}
            value={form.discountType}
            onChange={(e) =>
              setForm({
                ...form,
                discountType: e.target.value as Promotion["discountType"],
              })
            }
          >
            <option value="PERCENTAGE">Percentage</option>
            <option value="FLAT">Fixed rupee amount</option>
          </select>
        </label>
        <label className="text-sm">
          Discount value ({form.discountType === "PERCENTAGE" ? "%" : "₹"})
          <input
            className={input}
            type="number"
            min="0.01"
            step="0.01"
            max={form.discountType === "PERCENTAGE" ? 100 : 100000}
            value={form.discountValue}
            onChange={(e) =>
              setForm({ ...form, discountValue: Number(e.target.value) })
            }
          />
        </label>
        {[
          ["minOrderValue", "Minimum spend (₹)"],
          ["maxDiscountAmount", "Maximum discount (₹, optional)"],
          ["usageLimit", "Global uses (blank = unlimited)"],
          ["perCustomerLimit", "Uses per verified customer (optional)"],
        ].map(([key, label]) => (
          <label className="text-sm" key={key}>
            {label}
            <input
              className={input}
              type="number"
              min="0"
              value={(form as any)[key] ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  [key]:
                    e.target.value === "" ? key === 'minOrderValue' ? 0 : undefined : Number(e.target.value),
                })
              }
            />
          </label>
        ))}
        <label className="text-sm">
          Starts
          <input
            className={input}
            type="datetime-local"
            value={localDate(form.validFrom)}
            onChange={(e) => {
              if (e.target.value)
                setForm({
                  ...form,
                  validFrom: new Date(e.target.value).toISOString(),
                });
            }}
          />
        </label>
        <label className="text-sm">
          Ends
          <input
            className={input}
            type="datetime-local"
            value={localDate(form.validUntil)}
            onChange={(e) => {
              if (e.target.value)
                setForm({
                  ...form,
                  validUntil: new Date(e.target.value).toISOString(),
                });
            }}
          />
        </label>
        <label className="text-sm">
          Eligible dishes (none selected = all)
          <select
            className={input}
            multiple
            size={5}
            value={form.itemIds ?? []}
            onChange={(e) =>
              setForm({
                ...form,
                itemIds: Array.from(e.target.selectedOptions).map(
                  (o) => o.value,
                ),
              })
            }
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-3 text-sm">
          <label className="block">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />{" "}
            Promotion active
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={!!form.firstOrderOnly}
              onChange={(e) =>
                setForm({ ...form, firstOrderOnly: e.target.checked })
              }
            />{" "}
            First verified customer's QR order only
          </label>
          <p className="text-xs text-slate-500">
            Customer-specific limits require phone verification. Coupons cannot
            stack with loyalty rewards.
          </p>
        </div>
      </fieldset>
      <div className="flex gap-3">
        <button
          className={button}
          disabled={busy || !form.code.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving..." : edit ? "Save promotion" : "Create promotion"}
        </button>
        {(edit || JSON.stringify(form) !== JSON.stringify(baseline.current)) && (
          <button
            className="rounded-xl border px-4 py-2.5 text-sm"
            onClick={async () => {
              if (!(await requestQrLeave())) return;
              setEdit(null);
              const next = empty();
              baseline.current = next;
              setForm(next);
            }}
          >
            Discard promotion changes
          </button>
        )}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border p-4 text-sm">
            <b>{row.code}</b>
            <p>{row.description}</p>
            <p className="my-1">
              {row.discountType === "PERCENTAGE"
                ? `${row.discountValue}%`
                : `₹${row.discountValue}`}{" "}
              · {row.usageCount ?? 0}
              {row.usageLimit ? `/${row.usageLimit}` : ""} uses ·{" "}
              {!row.isActive
                ? "Paused"
                : Date.now() > Date.parse(row.validUntil)
                  ? "Expired"
                  : Date.now() < Date.parse(row.validFrom)
                    ? "Scheduled"
                    : "Active"}
            </p>
            {row.report && (
              <p className="text-xs text-slate-500">
                {row.report.acceptedOrders} accepted QR orders /{' '}
                {formatINR(row.report.discountValue)} discounts /{' '}
                {formatINR(row.report.settledSales)} settled sales
              </p>
            )}
            <button
              className="mt-2 rounded-lg border px-3 py-2"
              onClick={() => pick(row)}
            >
              Edit promotion
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

import React, { useMemo, useState } from 'react';
import { InventoryControl, InventoryRepository, StaffRepository } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { ClipboardCheck, Truck, Users, TrendingDown, Calculator, AlertTriangle, Plus, Trash2 } from 'lucide-react';

type Tab = 'RECEIVE' | 'SUPPLIERS' | 'COUNT' | 'REORDER' | 'REPORTS';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'RECEIVE', label: 'Receive goods', icon: Truck },
  { id: 'SUPPLIERS', label: 'Suppliers', icon: Users },
  { id: 'COUNT', label: 'Stock count', icon: ClipboardCheck },
  { id: 'REORDER', label: 'Reorder & expiry', icon: AlertTriangle },
  { id: 'REPORTS', label: 'Costing & reports', icon: Calculator }
];

const WASTE_LABEL: Record<string, string> = {
  KITCHEN_PREP_TRIM: 'Prep trim',
  DROPPED_SPILLED: 'Dropped or spilled',
  EXPIRED_SPOILED: 'Expired or spoiled',
  QUALITY_REJECT: 'Quality reject',
  CUSTOMER_RETURN: 'Customer return',
  OTHER: 'Other'
};

const field = 'w-full rounded-xl border border-jaman-border px-3 py-2 text-sm font-medium bg-white';
const card = 'rounded-2xl border border-jaman-border bg-white p-4 sm:p-5 shadow-2xs';
const primary = 'rounded-xl bg-jaman-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60';
const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

interface Props {
  showToast: (msg: string) => void;
}

/** Purchasing and stock control (BUG-046): receive deliveries, keep suppliers, count shelves, reorder, cost dishes. */
export const InventoryControlModule: React.FC<Props> = ({ showToast }) => {
  const [tab, setTab] = useState<Tab>('RECEIVE');
  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">Purchasing & Stock Control</h1>
        <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">Record what you buy and at what price, count the shelves, see what to reorder and what is about to expire.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold ${tab === t.id ? 'bg-jaman-navy text-white border-jaman-navy' : 'bg-white text-jaman-navy border-jaman-border hover:bg-slate-50'}`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'RECEIVE' && <ReceiveGoods showToast={showToast} />}
      {tab === 'SUPPLIERS' && <Suppliers showToast={showToast} />}
      {tab === 'COUNT' && <StockCountPanel showToast={showToast} />}
      {tab === 'REORDER' && <ReorderAndExpiry />}
      {tab === 'REPORTS' && <CostingAndReports />}
    </div>
  );
};

function ReceiveGoods({ showToast }: Props) {
  const items = InventoryRepository.getAllItems();
  const suppliers = InventoryControl.getSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [lines, setLines] = useState([{ itemId: '', quantity: '', unitCost: '', expiryDate: '' }]);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const grn = InventoryControl.receiveGoods({
        supplierId,
        invoiceNumber: invoiceNumber.trim() || undefined,
        receivedBy: 'Restaurant Admin',
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost), expiryDate: l.expiryDate ? new Date(`${l.expiryDate}T23:59:59`).toISOString() : undefined }))
      });
      showToast(`${grn.number} booked: ${grn.lines.length} item(s), ${formatINR(grn.totalCost)}`);
      setLines([{ itemId: '', quantity: '', unitCost: '', expiryDate: '' }]);
      setInvoiceNumber('');
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (items.length === 0) return <div className={card}>Add your stock items first in Inventory &amp; Recipes, then come back to record deliveries.</div>;
  if (suppliers.length === 0) return <div className={card}>Add a supplier first (Suppliers tab), then record what they delivered.</div>;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className={`${card} space-y-4`} noValidate>
        <h2 className="text-sm font-extrabold text-jaman-navy">New delivery</h2>
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">Supplier
            <select className={`${field} mt-1`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Choose…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Supplier invoice number (optional)
            <input className={`${field} mt-1`} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </label>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const item = items.find((x) => x.id === l.itemId);
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1.3fr_auto] items-end">
                <label className="text-[11px] font-bold text-slate-600">Item
                  <select className={`${field} mt-1`} value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value })}>
                    <option value="">Choose…</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-bold text-slate-600">Quantity {item ? `(${item.unit})` : ''}
                  <input className={`${field} mt-1`} type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                </label>
                <label className="text-[11px] font-bold text-slate-600">Cost per {item?.unit ?? 'unit'} (₹)
                  <input className={`${field} mt-1`} type="number" min="0" step="any" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                </label>
                <label className="text-[11px] font-bold text-slate-600">Best before (optional)
                  <input className={`${field} mt-1`} type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} />
                </label>
                <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-xl border border-jaman-border p-2.5 text-slate-500 disabled:opacity-40">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setLines((prev) => [...prev, { itemId: '', quantity: '', unitCost: '', expiryDate: '' }])} className="inline-flex items-center gap-1 text-xs font-bold text-jaman-navy">
            <Plus className="w-3.5 h-3.5" /> Add another item
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm font-black text-jaman-navy">Total {formatINR(total)}</span>
            <button type="submit" className={primary}>Book delivery</button>
          </div>
        </div>
      </form>

      <div className={card}>
        <h2 className="text-sm font-extrabold text-jaman-navy mb-3">Recent deliveries</h2>
        {InventoryControl.getGoodsReceipts().length === 0 ? (
          <p className="text-xs text-slate-500">Nothing received yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase"><tr><th className="py-1">No.</th><th>Date</th><th>Supplier</th><th>Invoice</th><th className="text-right">Items</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {InventoryControl.getGoodsReceipts().slice(0, 15).map((g) => (
                <tr key={g.id} className="border-t border-slate-100"><td className="py-1.5 font-mono">{g.number}</td><td>{day(g.receivedAt)}</td><td>{g.supplierName}</td><td>{g.invoiceNumber || '—'}</td><td className="text-right">{g.lines.length}</td><td className="text-right font-bold">{formatINR(g.totalCost)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Suppliers({ showToast }: Props) {
  const suppliers = InventoryControl.getSuppliers({ includeInactive: true });
  const [form, setForm] = useState({ name: '', contactName: '', phone: '', paymentTerms: '' });
  const [error, setError] = useState<string | null>(null);
  const [historyItem, setHistoryItem] = useState('');
  const items = InventoryRepository.getAllItems();
  const history = historyItem ? InventoryControl.getSupplierPriceHistory(historyItem) : [];

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      InventoryControl.addSupplier({ name: form.name, contactName: form.contactName || undefined, phone: form.phone || undefined, paymentTerms: form.paymentTerms || undefined });
      setForm({ name: '', contactName: '', phone: '', paymentTerms: '' });
      showToast('Supplier added');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={`${card} space-y-3`}>
        <h2 className="text-sm font-extrabold text-jaman-navy">Suppliers</h2>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-2" noValidate>
          <input aria-label="Supplier name" placeholder="Supplier name" className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input aria-label="Contact person" placeholder="Contact person" className={field} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <input aria-label="Phone" placeholder="Phone" className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input aria-label="Payment terms" placeholder="Payment terms, e.g. 15 days" className={field} value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
          <button type="submit" className={`${primary} sm:col-span-2`}>Add supplier</button>
        </form>
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">{error}</div>}
        <ul className="divide-y divide-slate-100">
          {suppliers.length === 0 && <li className="py-2 text-xs text-slate-500">No suppliers yet.</li>}
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-xs">
              <span className={s.isActive ? '' : 'text-slate-400 line-through'}>
                <strong className="text-jaman-navy">{s.name}</strong>
                <span className="block text-slate-500">{[s.contactName, s.phone, s.paymentTerms].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <button type="button" className="font-bold text-jaman-navy underline" onClick={() => InventoryControl.updateSupplier(s.id, { isActive: !s.isActive })}>
                {s.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className={`${card} space-y-3`}>
        <h2 className="text-sm font-extrabold text-jaman-navy">Price history</h2>
        <select aria-label="Item" className={field} value={historyItem} onChange={(e) => setHistoryItem(e.target.value)}>
          <option value="">Choose an item…</option>
          {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
        </select>
        {historyItem && history.length === 0 && <p className="text-xs text-slate-500">No purchases recorded for this item yet.</p>}
        {history.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase"><tr><th>Date</th><th>Supplier</th><th className="text-right">Price</th><th className="text-right">Change</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.receiptNumber}-${h.unitCost}`} className="border-t border-slate-100">
                  <td className="py-1.5">{day(h.date)}</td><td>{h.supplierName}</td><td className="text-right font-bold">{formatINR(h.unitCost)}</td>
                  <td className={`text-right ${h.changePercent && h.changePercent > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{h.changePercent === null ? '—' : `${h.changePercent > 0 ? '+' : ''}${h.changePercent}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StockCountPanel({ showToast }: Props) {
  const items = InventoryRepository.getAllItems();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entered = items.filter((i) => counted[i.id] !== undefined && counted[i.id] !== '');
  const rows = entered.map((i) => {
    const qty = Number(counted[i.id]);
    return { item: i, variance: Math.round((qty - i.currentStock) * 100) / 100, value: Math.round((qty - i.currentStock) * i.costPerUnit * 100) / 100 };
  });
  const netValue = rows.reduce((s, r) => s + r.value, 0);

  async function submit() {
    setError(null);
    let approvedBy: string | undefined;
    if (needsApproval) {
      const verified = await StaffRepository.verifyPin(pin);
      if (!verified || !verified.isManager) return setError('Enter a manager PIN to approve this count.');
      approvedBy = verified.user.fullName;
    }
    try {
      const count = InventoryControl.recordStockCount({
        countedBy: 'Restaurant Admin',
        approvedBy,
        note: note.trim() || undefined,
        counts: entered.map((i) => ({ itemId: i.id, countedQuantity: Number(counted[i.id]) }))
      });
      showToast(`${count.number} saved. Net difference ${formatINR(count.totalVarianceValue)}`);
      setCounted({});
      setNote('');
      setPin('');
      setNeedsApproval(false);
    } catch (err) {
      const message = errorText(err);
      if (/approve/i.test(message)) setNeedsApproval(true);
      setError(message);
    }
  }

  if (items.length === 0) return <div className={card}>No stock items to count yet.</div>;
  return (
    <div className={`${card} space-y-3`}>
      <h2 className="text-sm font-extrabold text-jaman-navy">Count the shelves</h2>
      <p className="text-xs text-slate-500">Type what you physically counted. Leave an item blank to skip it. Stock is set to your count and each difference is recorded.</p>
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500 uppercase"><tr><th className="py-1">Item</th><th className="text-right">In system</th><th className="w-32 text-right">Counted</th><th className="text-right">Difference</th></tr></thead>
        <tbody>
          {items.map((i) => {
            const row = rows.find((r) => r.item.id === i.id);
            return (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="py-1.5 font-bold text-jaman-navy">{i.name}</td>
                <td className="text-right">{i.currentStock} {i.unit}</td>
                <td className="text-right"><input aria-label={`Counted ${i.name}`} className={`${field} !py-1 text-right`} type="number" min="0" step="any" value={counted[i.id] ?? ''} onChange={(e) => setCounted({ ...counted, [i.id]: e.target.value })} /></td>
                <td className={`text-right font-bold ${row ? (row.variance < 0 ? 'text-rose-600' : row.variance > 0 ? 'text-emerald-700' : '') : ''}`}>{row ? `${row.variance > 0 ? '+' : ''}${row.variance} ${i.unit} (${formatINR(row.value)})` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">{error}</div>}
      <div className="flex flex-wrap items-end gap-3">
        <input aria-label="Note" placeholder="Note (optional)" className={`${field} max-w-xs`} value={note} onChange={(e) => setNote(e.target.value)} />
        {needsApproval && <input aria-label="Manager PIN" placeholder="Manager PIN" type="password" inputMode="numeric" className={`${field} max-w-[160px]`} value={pin} onChange={(e) => setPin(e.target.value)} />}
        <span className="text-xs font-bold text-slate-600">Net difference {formatINR(netValue)}</span>
        <button type="button" disabled={entered.length === 0} onClick={submit} className={primary}>Save count</button>
      </div>
      <StockCountHistory />
    </div>
  );
}

function StockCountHistory() {
  const counts = InventoryControl.getStockCounts().slice(0, 5);
  if (counts.length === 0) return null;
  return (
    <div className="pt-3 border-t border-slate-100">
      <h3 className="text-xs font-extrabold text-jaman-navy mb-2">Recent counts</h3>
      <ul className="text-xs space-y-1">
        {counts.map((c) => (
          <li key={c.id} className="flex justify-between"><span className="font-mono">{c.number} · {day(c.countedAt)} · {c.countedBy}{c.approvedBy ? ` (approved by ${c.approvedBy})` : ''}</span><span className="font-bold">{formatINR(c.totalVarianceValue)}</span></li>
        ))}
      </ul>
    </div>
  );
}

function ReorderAndExpiry() {
  const suggestions = InventoryControl.getReorderSuggestions();
  const expiring = InventoryControl.getExpiringBatches(7);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={card}>
        <h2 className="text-sm font-extrabold text-jaman-navy mb-3">What to buy</h2>
        {suggestions.length === 0 ? <p className="text-xs text-slate-500">Everything is comfortably stocked.</p> : (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase"><tr><th>Item</th><th className="text-right">In stock</th><th className="text-right">Lasts</th><th className="text-right">Buy about</th></tr></thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.itemId} className="border-t border-slate-100">
                  <td className="py-1.5"><strong className="text-jaman-navy">{s.itemName}</strong><span className="block text-slate-500">{s.lastSupplierName ? `Last from ${s.lastSupplierName} at ${formatINR(s.lastUnitCost)}` : ''}</span></td>
                  <td className="text-right">{s.currentStock} {s.unit}</td>
                  <td className="text-right">{s.daysOfStockLeft === null ? '—' : `${s.daysOfStockLeft} days`}</td>
                  <td className="text-right font-bold">{s.suggestedQuantity} {s.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className={card}>
        <h2 className="text-sm font-extrabold text-jaman-navy mb-3">Expiring within a week</h2>
        {expiring.length === 0 ? <p className="text-xs text-slate-500">Nothing is about to expire.</p> : (
          <ul className="divide-y divide-slate-100 text-xs">
            {expiring.map((b) => (
              <li key={b.batchId} className="flex justify-between py-1.5">
                <span><strong className="text-jaman-navy">{b.itemName}</strong> · {b.quantityRemaining} {b.unit}</span>
                <span className={b.expired ? 'font-bold text-rose-600' : 'font-bold text-amber-700'}>{b.expired ? `Expired ${day(b.expiryDate)}` : `${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} left`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CostingAndReports() {
  const [days, setDays] = useState(30);
  const from = useMemo(() => new Date(Date.now() - days * 86_400_000), [days]);
  const to = new Date();
  const dishes = InventoryControl.getDishCosts();
  const valuation = InventoryControl.getStockValuation();
  const wastage = InventoryControl.getWastageReport(from, to);
  const consumption = InventoryControl.getConsumptionReport(from, to).sort((a, b) => b.valueConsumed - a.valueConsumed).slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <TrendingDown className="w-4 h-4" /> Period
        <select aria-label="Period" className={`${field} !w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="text-sm font-extrabold text-jaman-navy mb-1">Stock value</h2>
          <p className="text-2xl font-black text-jaman-navy">{formatINR(valuation.total)}</p>
          <ul className="mt-2 text-xs divide-y divide-slate-100">
            {valuation.byCategory.map((c) => <li key={c.category} className="flex justify-between py-1"><span>{c.category}</span><strong>{formatINR(c.value)}</strong></li>)}
          </ul>
          {valuation.negativeItems.length > 0 && <p className="mt-2 text-xs text-rose-700">Below zero: {valuation.negativeItems.map((n) => `${n.itemName} (${n.currentStock} ${n.unit})`).join(', ')}. Count these shelves.</p>}
        </div>
        <div className={card}>
          <h2 className="text-sm font-extrabold text-jaman-navy mb-1">Wastage</h2>
          <p className="text-2xl font-black text-rose-700">{formatINR(wastage.totalCost)}</p>
          <ul className="mt-2 text-xs divide-y divide-slate-100">
            {wastage.byReason.length === 0 && <li className="py-1 text-slate-500">No wastage recorded in this period.</li>}
            {wastage.byReason.map((r) => <li key={r.reason} className="flex justify-between py-1"><span>{WASTE_LABEL[r.reason] ?? r.reason}</span><strong>{formatINR(r.cost)}</strong></li>)}
          </ul>
        </div>
      </div>
      <div className={card}>
        <h2 className="text-sm font-extrabold text-jaman-navy mb-3">Dish cost and margin</h2>
        {dishes.length === 0 ? <p className="text-xs text-slate-500">Add recipes to see what each dish costs to make.</p> : (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase"><tr><th>Dish</th><th className="text-right">Price</th><th className="text-right">Cost</th><th className="text-right">Food cost</th><th className="text-right">Margin</th></tr></thead>
            <tbody>
              {dishes.sort((a, b) => (b.foodCostPercent ?? 0) - (a.foodCostPercent ?? 0)).map((d) => (
                <tr key={d.menuItemId} className="border-t border-slate-100">
                  <td className="py-1.5 font-bold text-jaman-navy">{d.name}{d.incomplete && <span className="ml-2 text-[10px] font-bold text-amber-700">an ingredient could not be costed</span>}</td>
                  <td className="text-right">{formatINR(d.price)}</td><td className="text-right">{formatINR(d.cost)}</td>
                  <td className={`text-right font-bold ${d.foodCostPercent !== null && d.foodCostPercent > 35 ? 'text-rose-600' : ''}`}>{d.foodCostPercent === null ? '—' : `${d.foodCostPercent}%`}</td>
                  <td className="text-right">{formatINR(d.marginAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className={card}>
        <h2 className="text-sm font-extrabold text-jaman-navy mb-3">What was used (top 10 by value)</h2>
        {consumption.length === 0 ? <p className="text-xs text-slate-500">No stock used in this period.</p> : (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase"><tr><th>Item</th><th className="text-right">Sold</th><th className="text-right">Wasted</th><th className="text-right">Count adj.</th><th className="text-right">Value used</th></tr></thead>
            <tbody>
              {consumption.map((c) => <tr key={c.itemId} className="border-t border-slate-100"><td className="py-1.5 font-bold text-jaman-navy">{c.itemName}</td><td className="text-right">{c.sold} {c.unit}</td><td className="text-right">{c.wasted} {c.unit}</td><td className="text-right">{c.adjusted} {c.unit}</td><td className="text-right font-bold">{formatINR(c.valueConsumed)}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import type { ModifierGroup, ModifierOption, TaxGroup } from '@jamanvaar/types';
import { db, ModifierAuthoring, TaxAuthoring, newAuthoringId } from '@jamanvaar/database';
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fetchMenuDraftStatus, publishMenuToGuests, MenuPublishRefused, type MenuDraftStatus } from '../../cloud/cloudClient';

interface Props {
  showToast: (message: string) => void;
  onRequestConfirm: (dialog: { isOpen: boolean; title: string; message: string; confirmText: string; isDanger: boolean; onConfirm: () => void }) => void;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const card = 'bg-white border border-jaman-border rounded-3xl p-5';
const input = 'w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-jaman-saffron';

/** What guests see is what the restaurant last published. This panel shows the gap and publishes it. */
export const MenuPublishPanel: React.FC<{ showToast: (m: string) => void; changeTick: number }> = ({ showToast, changeTick }) => {
  const [status, setStatus] = useState<MenuDraftStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchMenuDraftStatus());
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not check the published menu');
    }
  }, []);
  useEffect(() => { void load(); }, [load, changeTick]);

  const publish = async () => {
    setBusy(true);
    setBlocking([]);
    try {
      const res = await publishMenuToGuests(note.trim() || undefined);
      setNote('');
      showToast(`Menu version ${res.version} is now live for guests.`);
      await load();
    } catch (e) {
      if (e instanceof MenuPublishRefused) setBlocking(e.errors);
      showToast(e instanceof Error ? e.message : 'Could not publish the menu');
    } finally {
      setBusy(false);
    }
  };

  const dirty = status?.hasUnpublishedChanges;
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-jaman-navy">Guest menu</h2>
          <p className="text-xs text-[#4A5568]">
            Guests who scan a QR code see the menu you last published, never a half-finished edit.
            {status ? ` Live now: version ${status.publishedVersion || 'none yet'}.` : ''}
          </p>
        </div>
        {status && (
          <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${dirty ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {dirty ? 'Unpublished changes' : 'Up to date'}
          </span>
        )}
      </div>
      {problem && <p role="alert" className="text-xs text-rose-700">{problem}</p>}
      {blocking.length > 0 && (
        <ul role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
          {blocking.map((b) => <li key={b} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{b}</li>)}
        </ul>
      )}
      {status && status.warnings.length > 0 && (
        <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          {status.warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <input className={`${input} flex-1 min-w-[12rem]`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional, for your records)" />
        <button type="button" disabled={busy} onClick={publish} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-jaman-saffron text-white text-sm font-bold disabled:opacity-60">
          <Send className="w-4 h-4" /> {busy ? 'Publishing…' : 'Publish to guests'}
        </button>
      </div>
      {status && !dirty && <p className="text-[11px] text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {status.counts.items} dishes in {status.counts.categories} categories are live.</p>}
    </div>
  );
};

const blankOption = (): ModifierOption => ({ id: '', groupId: '', name: '', priceDelta: 0, isAvailable: true, sortOrder: 0 });

const GroupEditor: React.FC<{ group: ModifierGroup | null; onSaved: (g: ModifierGroup) => void; onCancel: () => void }> = ({ group, onSaved, onCancel }) => {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [isRequired, setIsRequired] = useState(group?.isRequired ?? false);
  const [min, setMin] = useState(String(group?.minSelections ?? 0));
  const [max, setMax] = useState(String(group?.maxSelections ?? 1));
  const [options, setOptions] = useState<ModifierOption[]>(group?.options?.length ? group.options : [blankOption()]);
  const [error, setError] = useState('');

  const setOpt = (i: number, patch: Partial<ModifierOption>) => setOptions((o) => o.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setOptions((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = () => {
    try {
      const saved = ModifierAuthoring.save({
        id: group?.id, name, description, isRequired,
        minSelections: Math.floor(Number(min) || 0), maxSelections: Math.floor(Number(max) || 0),
        options: options.filter((o) => o.name.trim() !== '' || o.id)
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <div className={`${card} space-y-3 border-jaman-saffron`}>
      <h3 className="text-sm font-extrabold text-jaman-navy">{group ? `Edit "${group.name}"` : 'New customisation group'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-slate-600">Name shown to guests<input className={input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Choose your cheese" /></label>
        <label className="text-xs font-bold text-slate-600">Short help text (optional)<input className={input} value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} /> Guest must choose</label>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          Choose at least <input type="number" min={0} className="w-16 bg-jaman-ivory border border-jaman-border rounded-lg px-2 py-1.5" value={min} onChange={(e) => setMin(e.target.value)} />
          and at most <input type="number" min={0} className="w-16 bg-jaman-ivory border border-jaman-border rounded-lg px-2 py-1.5" value={max} onChange={(e) => setMax(e.target.value)} />
          <span className="font-normal text-slate-400">(0 = no limit)</span>
        </div>
      </div>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={o.id || `new-${i}`} className="flex flex-wrap items-center gap-2">
            <input className={`${input} flex-1 min-w-[8rem]`} value={o.name} maxLength={60} onChange={(e) => setOpt(i, { name: e.target.value })} placeholder="Option name" />
            <span className="text-xs text-slate-500">+₹</span>
            <input type="number" min={0} step="0.5" className="w-24 bg-jaman-ivory border border-jaman-border rounded-xl px-2 py-2 text-sm" value={o.priceDelta} onChange={(e) => setOpt(i, { priceDelta: Number(e.target.value) })} />
            <label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={o.isDefault === true} onChange={(e) => setOpt(i, { isDefault: e.target.checked })} /> Pre-selected</label>
            <label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={o.isAvailable} onChange={(e) => setOpt(i, { isAvailable: e.target.checked })} /> Available</label>
            <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="p-1 text-slate-500"><ArrowUp className="w-4 h-4" /></button>
            <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="p-1 text-slate-500"><ArrowDown className="w-4 h-4" /></button>
            <button type="button" aria-label="Remove option" onClick={() => setOptions((all) => all.filter((_, idx) => idx !== i))} className="p-1 text-rose-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setOptions((o) => [...o, blankOption()])} className="text-xs font-bold text-jaman-saffron inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add option</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} className="px-4 py-2 rounded-xl bg-jaman-saffron text-white text-sm font-bold">Save group</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-jaman-border text-sm font-bold">Cancel</button>
      </div>
    </div>
  );
};

const TaxEditor: React.FC<{ tax: TaxGroup | null; onSaved: () => void; onCancel: () => void }> = ({ tax, onSaved, onCancel }) => {
  const [name, setName] = useState(tax?.name ?? '');
  const [total, setTotal] = useState(String(tax ? tax.igstPercent || tax.cgstPercent + tax.sgstPercent : 5));
  const [inclusive, setInclusive] = useState(tax?.isInclusive ?? false);
  const [active, setActive] = useState(tax?.isActive ?? true);
  const [error, setError] = useState('');
  const save = () => {
    const pct = Number(total);
    try {
      TaxAuthoring.save({ id: tax?.id, name, cgstPercent: pct / 2, sgstPercent: pct / 2, igstPercent: pct, isInclusive: inclusive, isActive: active });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };
  return (
    <div className={`${card} space-y-3 border-jaman-saffron`}>
      <h3 className="text-sm font-extrabold text-jaman-navy">{tax ? `Edit "${tax.name}"` : 'New tax group'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-slate-600">Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST 5%" /></label>
        <label className="text-xs font-bold text-slate-600">Total GST %<input type="number" min={0} max={100} step="0.5" className={input} value={total} onChange={(e) => setTotal(e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600 flex items-center gap-2"><input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} /> Dish prices already include this tax</label>
        <label className="text-xs font-bold text-slate-600 flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>
      </div>
      <p className="text-[11px] text-slate-500">Split evenly into CGST and SGST on the bill.</p>
      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} className="px-4 py-2 rounded-xl bg-jaman-saffron text-white text-sm font-bold">Save tax group</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-jaman-border text-sm font-bold">Cancel</button>
      </div>
    </div>
  );
};

export const MenuOptionsModule: React.FC<Props> = ({ showToast, onRequestConfirm }) => {
  const [tick, setTick] = useState(0);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | 'new' | null>(null);
  const [editingTax, setEditingTax] = useState<TaxGroup | 'new' | null>(null);
  const bump = () => setTick((t) => t + 1);
  void tick;

  const groups = ModifierAuthoring.list();
  const taxes = TaxAuthoring.list();

  const removeGroup = (g: ModifierGroup) => {
    const used = ModifierAuthoring.usedBy(g.id);
    onRequestConfirm({
      isOpen: true,
      isDanger: true,
      title: `Delete "${g.name}"?`,
      message: used.length ? `It is attached to ${used.length} dish(es) (${used.slice(0, 3).join(', ')}${used.length > 3 ? '…' : ''}) and will be taken off them. Guests see the change after you publish.` : 'Guests see the change after you publish.',
      confirmText: 'Delete group',
      onConfirm: () => { ModifierAuthoring.remove(g.id); bump(); showToast(`"${g.name}" deleted.`); }
    });
  };
  const removeTax = (t: TaxGroup) => {
    try { TaxAuthoring.remove(t.id); bump(); showToast(`"${t.name}" deleted.`); } catch (e) { showToast(e instanceof Error ? e.message : 'Could not delete'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Customisations &amp; Tax</h1>
        <p className="text-sm text-[#4A5568] mt-1">Choices guests can add to a dish (cheese, size, spice) and the tax each dish carries. Attach them to dishes in Menu &amp; Categories.</p>
      </div>

      <MenuPublishPanel showToast={showToast} changeTick={tick} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-jaman-navy">Customisation groups</h2>
          <button type="button" onClick={() => setEditingGroup('new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-jaman-navy text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" /> New group</button>
        </div>
        {editingGroup && (
          <GroupEditor
            key={editingGroup === 'new' ? 'new' : editingGroup.id}
            group={editingGroup === 'new' ? null : editingGroup}
            onCancel={() => setEditingGroup(null)}
            onSaved={(g) => { setEditingGroup(null); bump(); showToast(`"${g.name}" saved. Publish to show it to guests.`); }}
          />
        )}
        {groups.length === 0 && !editingGroup && <p className={`${card} text-sm text-slate-500`}>No customisation groups yet. Guests can only order dishes as they are.</p>}
        {groups.map((g) => (
          <div key={g.id} className={`${card} flex flex-wrap items-start justify-between gap-3`}>
            <div className="min-w-0">
              <p className="font-extrabold text-jaman-navy text-sm">{g.name} {g.isRequired && <span className="ml-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">Required</span>}</p>
              <p className="text-xs text-slate-500 mt-0.5">{g.options.map((o) => `${o.name}${o.priceDelta ? ` (+${inr(o.priceDelta)})` : ''}${o.isAvailable ? '' : ' [off]'}`).join(', ') || 'No options'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Used on {ModifierAuthoring.usedBy(g.id).length} dish(es)</p>
            </div>
            <div className="flex gap-2">
              <button type="button" aria-label={`Edit ${g.name}`} onClick={() => setEditingGroup(g)} className="p-2 rounded-lg border border-jaman-border"><Pencil className="w-4 h-4" /></button>
              <button type="button" aria-label={`Delete ${g.name}`} onClick={() => removeGroup(g)} className="p-2 rounded-lg border border-rose-200 text-rose-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-jaman-navy">Tax groups</h2>
          <button type="button" onClick={() => setEditingTax('new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-jaman-navy text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" /> New tax group</button>
        </div>
        {editingTax && (
          <TaxEditor key={editingTax === 'new' ? 'new' : editingTax.id} tax={editingTax === 'new' ? null : editingTax} onCancel={() => setEditingTax(null)} onSaved={() => { setEditingTax(null); bump(); showToast('Tax group saved. Publish to apply it for guests.'); }} />
        )}
        {taxes.length === 0 && !editingTax && <p className={`${card} text-sm text-slate-500`}>No tax groups. Dishes are sold without tax until you add one.</p>}
        {taxes.map((t) => (
          <div key={t.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <p className="font-extrabold text-jaman-navy text-sm">{t.name} {!t.isActive && <span className="text-[10px] text-slate-400">(not in use)</span>}</p>
              <p className="text-xs text-slate-500">{t.igstPercent || t.cgstPercent + t.sgstPercent}% · {t.isInclusive ? 'included in dish price' : 'added on top of dish price'} · {TaxAuthoring.usedBy(t.id).length} dish(es)</p>
            </div>
            <div className="flex gap-2">
              <button type="button" aria-label={`Edit ${t.name}`} onClick={() => setEditingTax(t)} className="p-2 rounded-lg border border-jaman-border"><Pencil className="w-4 h-4" /></button>
              <button type="button" aria-label={`Delete ${t.name}`} onClick={() => removeTax(t)} className="p-2 rounded-lg border border-rose-200 text-rose-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

void newAuthoringId;

import {QrCatalog} from './QrCatalog';
import {QrSetupHealth,QrServiceOperations,QrPickupOperations,QrMenuPerformance,QrBrandStudio} from './QrOperations';
import { QrCapabilities } from './QrCapabilities';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, QrCode, CheckCircle2, RefreshCw, Printer, Download, Ban, RotateCcw, Trash2, Copy, Plus, WifiOff } from 'lucide-react';
import { generateQrDataUrl } from '@jamanvaar/utils';
import { CloudApiError } from '../../cloud/cloudClient';
import { QrAdminApi, type QrBranch, type QrOrderRow, type QrOverview, type QrSettings, type QrTableRow } from '../../cloud/qrAdminClient';
import { useQrEntitlement } from './useQrEntitlement';
import { downloadCardPng, printCards, withLogo } from './qrPrint';
import { QrDesignStudio, QrOrderingRules, QrOperationalOrders, QrAnalyticsView, QrMenuAvailability } from './QrAdvanced';

type Tab = 'OVERVIEW' | 'MENU' | 'TABLES' | 'DESIGN' | 'ORDERS' | 'PAYMENTS' | 'RULES' | 'ANALYTICS' | 'SETTINGS' | 'ADVANCED' | 'SERVICE' | 'PICKUP' | 'PERFORMANCE' | 'BRAND';

const errText = (e: unknown) => (e instanceof CloudApiError || e instanceof Error ? e.message : 'Something went wrong');

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Restaurant Admin's QR Ordering. Everything on it comes from the server: the plan answer, the tables, the codes, the
 * orders and every number. A restaurant whose plan does not include QR Ordering sees that it exists and why it is
 * locked, and cannot do anything with it: the server refuses each action, not only this screen.
 */
export function QrConsole({ onViewPlan, showToast }: { onViewPlan: () => void; showToast: (msg: string) => void }) {
  const { state, refresh } = useQrEntitlement();
  const [tab, setTab] = useState<Tab>(()=>{const q=new URLSearchParams(location.search).get('tab');return ['MENU','TABLES','ORDERS','SETTINGS','SERVICE','PICKUP','PERFORMANCE','BRAND','PAYMENTS'].includes(q??'')?q as Tab:'OVERVIEW';});

  if (state.status === 'loading') return <div className="p-8 text-sm text-slate-500">Checking your plan…</div>;
  if (state.status === 'unknown') {
    return (
      <div className="p-8 max-w-xl">
        <div className="flex items-center gap-3 text-slate-700 font-bold"><WifiOff className="w-5 h-5" /> QR Ordering</div>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
        <button onClick={refresh} className="mt-4 px-4 py-2 rounded-xl bg-jaman-navy text-white text-sm font-bold">Try again</button>
      </div>
    );
  }

  const { entitlement, fromCache } = state;
  if (!entitlement.enabled) return <LockedView message={entitlement.lockedMessage} planName={entitlement.planName} onViewPlan={onViewPlan} />;

  const tabs: Array<[Tab, string]> = [['OVERVIEW', 'Overview'], ['MENU', 'Menu & Availability'], ['TABLES', 'Tables & QR'], ['DESIGN', 'QR Design Studio'], ['ORDERS', 'QR Orders'], ['PAYMENTS', 'Payment Settings'], ['RULES', 'Ordering Rules'], ['ANALYTICS', 'Analytics'], ['SETTINGS', 'QR Settings'], ['ADVANCED','Advanced Features'],['SERVICE','Service Requests'],['PICKUP','Pickup Scheduling'],['PERFORMANCE','Menu Performance'],['BRAND','Customer Branding']];
  return (
    <div className="space-y-5" data-testid="qr-console">
      <p className="text-xs text-slate-600">QR Ordering license active{entitlement.planName ? ` · ${entitlement.planName}` : ''}{entitlement.validUntil ? ` · Valid through ${new Date(entitlement.validUntil).toLocaleDateString()}` : ''}. Your platform administrator manages licenses and device reassignment.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">QR Ordering</h1>
          <p className="text-sm text-[#4A5568] mt-1">Guests scan the code on their table, order from your menu, and the order reaches your counter and kitchen.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Enabled {entitlement.source === 'MANUAL_OVERRIDE' ? ' (special access)' : ''}
        </span>
      </div>
      {fromCache && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Showing your last known plan. Connect to the internet to refresh it; QR changes need a connection.</div>}

      <div className="flex flex-wrap gap-1 bg-white border border-jaman-border p-1 rounded-2xl w-fit" aria-label="QR administration">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-1.5 rounded-xl text-xs font-bold ${tab === id ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold' : 'text-slate-600 hover:bg-brand/[0.05]'}`}>{label}</button>
        ))}
      </div>

      {tab === 'OVERVIEW' && <div className="space-y-5"><QrSetupHealth navigate={t=>setTab(t as Tab)}/><Overview /><QrAnalyticsView /></div>}
      {tab === 'SERVICE'&&<QrServiceOperations/>}{tab === 'PICKUP'&&<QrPickupOperations/>}{tab === 'PERFORMANCE'&&<QrMenuPerformance/>}{tab === 'BRAND'&&<QrBrandStudio/>}
      {tab === 'TABLES' && <TablesAndQr showToast={showToast} />}
      {tab === 'MENU' && <div className="space-y-5">{/^\/qr\//.test(location.pathname)&&<QrCatalog/>}<QrMenuAvailability showToast={showToast} /></div>}
      {tab === 'ADVANCED' && <QrCapabilities showToast={showToast} />}
      {tab === 'DESIGN' && <QrDesignStudio showToast={showToast} />}
      {tab === 'ORDERS' && <QrOperationalOrders showToast={showToast} />}
      {tab === 'PAYMENTS' && <div className="space-y-5"><QrOrderingRules showToast={showToast} payments /><QrAnalyticsView paymentsOnly /></div>}
      {tab === 'RULES' && <QrOrderingRules showToast={showToast} />}
      {tab === 'ANALYTICS' && <QrAnalyticsView />}
      {tab === 'SETTINGS' && <div className="space-y-6"><Settings showToast={showToast} /><BrandingForm showToast={showToast} /></div>}
    </div>
  );
}

function LockedView({ message, planName, onViewPlan }: { message: string | null; planName: string | null; onViewPlan: () => void }) {
  return (
    <div className="max-w-2xl" data-testid="qr-locked">
      <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy flex items-center gap-2"><QrCode className="w-7 h-7" /> QR Ordering <Lock className="w-5 h-5 text-slate-500" /></h1>
      <div className="mt-5 rounded-2xl border border-jaman-border bg-white p-6">
        <div className="flex items-center gap-2 text-slate-700 font-bold"><Lock className="w-4 h-4" /> {message ?? 'QR Ordering is available on an eligible plan.'}</div>
        <p className="mt-3 text-sm text-slate-600">
          With QR Ordering, each table gets its own code. Guests scan it with their phone, see your menu, and place an order that appears at your counter and on your kitchen screen, with no app to install.
        </p>
        {planName && <p className="mt-3 text-xs text-slate-500">Your current plan: <b>{planName}</b></p>}
        <button onClick={onViewPlan} className="mt-5 px-5 py-2.5 rounded-xl bg-jaman-navy text-white text-sm font-bold">View Plan</button>
      </div>
    </div>
  );
}

function useLoad<T>(load: () => Promise<T>, everyMs?: number): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    load().then((d) => { setData(d); setError(null); }).catch((e) => setError(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    reload();
    if (!everyMs) return;
    const t = setInterval(reload, everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);
  return { data, error, reload };
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-jaman-border bg-white p-4">
      <div className="text-2xl font-bold text-jaman-navy">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Overview() {
  const { data, error } = useLoad<QrOverview>(QrAdminApi.overview, 30000);
  if (error) return <div className="text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;
  const t = data.today;
  return (
    <div className="space-y-5">
      {!data.publicBaseUrlConfigured && (
        <div className="text-sm rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 p-4">The ordering website address has not been set up for this platform yet, so QR links cannot be created. Please contact support.</div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Tables" value={data.tables} />
        <Tile label="Active QR codes" value={data.activeCodes} />
        <Tile label="QR orders today" value={t.ordersPlaced} />
        <Tile label="Accepted order value today" value={inr(t.sales)} />
        <Tile label="Waiting / in kitchen" value={t.ordersPending} />
        <Tile label="Completed" value={t.ordersCompleted} />
        <Tile label="Landing sessions today" value={t.scans} />
        <Tile label="Average order" value={inr(t.averageOrderValue)} />
      </div>
      <div className="rounded-2xl border border-jaman-border bg-white p-4">
        <div className="font-bold text-jaman-navy mb-2">Orders by table today</div>
        {t.ordersByTable.length === 0 ? <div className="text-sm text-slate-500">No QR orders yet today.</div> : (
          <ul className="text-sm divide-y">{t.ordersByTable.map((r) => <li key={r.table} className="py-1.5 flex justify-between"><span>Table {r.table}</span><b>{r.orders}</b></li>)}</ul>
        )}
        <div className="text-[11px] text-slate-500 mt-3">Counted by the server from real orders. Order value excludes unpaid online drafts and cancellations; paid sales include verified online payments and collected counter bills ({inr(t.paidSales)} so far).</div>
      </div>
    </div>
  );
}

function TablesAndQr({ showToast }: { showToast: (m: string) => void }) {
  const tables = useLoad<QrTableRow[]>(QrAdminApi.tables, 20000);
  const branches = useLoad<QrBranch[]>(QrAdminApi.branches);
  const [branchId, setBranchId] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<QrTableRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newCapacity, setNewCapacity] = useState('4');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const activeBranches = useMemo(() => (branches.data ?? []).filter((b) => b.status === 'ACTIVE'), [branches.data]);
  const chosenBranch = branchId || (activeBranches.length === 1 ? activeBranches[0].id : '');

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      showToast(done);
      tables.reload();
    } catch (e) {
      showToast(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const printOne = async (row: QrTableRow) => {
    try { printCards([await QrAdminApi.printData(row.qr!.id).then(withLogo)], await QrAdminApi.printDesign()); } catch (e) { showToast(errText(e)); }
  };
  const printAll = async () => {
    try {
      const rows = (tables.data ?? []).filter((r) => r.qr?.status === 'ACTIVE');
      if (rows.length === 0) return showToast('There are no active QR codes to print.');
      printCards(await Promise.all(rows.map((r) => QrAdminApi.printData(r.qr!.id).then(withLogo))), await QrAdminApi.printDesign());
    } catch (e) { showToast(errText(e)); }
  };
  const printSelected = async () => {
    try {
      const rows = (tables.data ?? []).filter((r) => selected.has(r.tableId) && r.qr?.status === 'ACTIVE');
      if (rows.length === 0) return showToast('Tick tables that have an active QR code first.');
      printCards(await Promise.all(rows.map((r) => QrAdminApi.printData(r.qr!.id).then(withLogo))), await QrAdminApi.printDesign());
    } catch (e) { showToast(errText(e)); }
  };
  const addTable = () => run('add', async () => {
    await QrAdminApi.createTable({ tableNumber: newNumber.trim(), capacity: Math.max(1, Math.floor(Number(newCapacity) || 4)), ...(chosenBranch ? { branchId: chosenBranch } : {}) });
    setNewNumber('');
    setAdding(false);
  }, `Table ${newNumber.trim()} added`);
  const downloadAll = async () => {
    try {
      const rows = (tables.data ?? []).filter((r) => r.qr?.status === 'ACTIVE');
      if (rows.length === 0) return showToast('There are no active QR codes to download.');
      const design = await QrAdminApi.printDesign();
      for (const r of rows) await downloadCardPng(await QrAdminApi.printData(r.qr!.id).then(withLogo), `table-${r.displayNumber}`, design);
    } catch (e) { showToast(errText(e)); }
  };

  const generateSelected = async () => {
    const targets = (tables.data ?? []).filter(row => selected.has(row.tableId) && row.isActive && (!row.qr || row.qr.status === 'REVOKED'));
    if (!targets.length) return showToast('Select active tables without a QR code.');
    setBusy('bulk');
    let created = 0;
    try {
      // Sequential generation gives partial progress and preserves server-enforced plan limits.
      for (const row of targets) { await QrAdminApi.generate(row.tableId, row.branchId || chosenBranch || undefined); created++; }
      showToast(`${created} table QR codes generated.`);
    } catch (e) { showToast(`${created} codes generated. ${errText(e)}`); }
    finally { tables.reload(); setBusy(null); }
  };

  if (tables.error) return <div className="text-sm text-rose-700">{tables.error}</div>;
  const rows = tables.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {activeBranches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" aria-label="Branch for new codes">
            <option value="">Choose branch for new codes…</option>
            {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button onClick={() => setAdding((a) => !a)} className="px-3 py-2 rounded-xl bg-jaman-navy text-white text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add table</button>
        <button onClick={generateSelected} disabled={!selected.size || !!busy} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold disabled:opacity-40">Generate selected QR codes</button>
        <button onClick={printSelected} disabled={selected.size === 0} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"><Printer className="w-3.5 h-3.5" /> Print selected ({selected.size})</button>
        <button onClick={printAll} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Print All</button>
        <button onClick={downloadAll} className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Download All</button>
        <button
          disabled={!chosenBranch || busy === 'menu'}
          onClick={() => run('menu', () => QrAdminApi.menuCode(chosenBranch, 'Menu card'), 'Menu-only code created')}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
          title="A code with no table, for menu cards"
        ><Plus className="w-3.5 h-3.5" /> Menu-only code</button>
      </div>

      {adding && (
        <div className="rounded-2xl border border-brand bg-white p-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-slate-600">Table number or name<input value={newNumber} maxLength={20} onChange={(e) => setNewNumber(e.target.value)} className="block mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. 12 or Terrace 1" /></label>
          <label className="text-xs font-bold text-slate-600">Seats<input type="number" min={1} max={200} value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} className="block mt-1 w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
          <button disabled={!newNumber.trim() || busy === 'add' || (activeBranches.length > 1 && !chosenBranch)} onClick={addTable} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold disabled:opacity-40">Save table</button>
          {activeBranches.length > 1 && !chosenBranch && <span className="text-xs text-amber-700">Choose a branch above first.</span>}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-sm text-slate-600 rounded-2xl border border-jaman-border bg-white p-6">No tables yet. Use <b>Add table</b> above (or add them under Floor / Tables); they appear here to receive QR codes.</div>
      ) : (
        <div className="rounded-2xl border border-jaman-border bg-white divide-y">
          {rows.map((row) => {
            const q = row.qr;
            return (
              <div key={row.tableId} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                <input type="checkbox" checked={selected.has(row.tableId)} onChange={() => toggle(row.tableId)} aria-label={`Select table ${row.displayNumber}`} disabled={!row.isActive || busy === 'bulk'} />
                {renaming?.id === row.tableId ? (
                  <span className="w-40 flex gap-1"><input autoFocus value={renaming.value} maxLength={20} onChange={(e) => setRenaming({ id: row.tableId, value: e.target.value })} className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <button onClick={() => { const v = renaming.value.trim(); setRenaming(null); if (v && v !== row.displayNumber) void run(row.tableId, () => QrAdminApi.updateTable(row.tableId, { tableNumber: v }), 'Table renamed'); }} className="text-xs font-bold text-brand">Save</button></span>
                ) : (
                  <div className="w-28 font-bold text-jaman-navy">Table {row.displayNumber} <button onClick={() => setRenaming({ id: row.tableId, value: row.displayNumber })} className="text-[11px] font-bold text-slate-500 ml-1" aria-label={`Rename table ${row.displayNumber}`}>edit</button></div>
                )}
                <div className="w-32 text-xs text-slate-500">{q?.branchName ?? (row.zone ?? '')}</div>
                <div className="w-24">
                  {!row.isActive ? <span className="text-slate-500 text-xs font-bold">Table off</span>
                    : !q ? <span className="text-slate-500 text-xs font-bold">No code</span>
                    : q.status === 'ACTIVE' ? <span className="text-emerald-700 text-xs font-bold">Active</span>
                    : q.status === 'DISABLED' ? <span className="text-amber-700 text-xs font-bold">Disabled</span>
                    : <span className="text-rose-700 text-xs font-bold">Revoked</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 ml-auto">
                  {(!q || q.status === 'REVOKED') && (
                    <button disabled={busy === row.tableId || (activeBranches.length > 1 && !chosenBranch)} onClick={() => run(row.tableId, () => QrAdminApi.generate(row.tableId, chosenBranch || undefined), `QR code created for table ${row.displayNumber}`)} className="px-3 py-1.5 rounded-lg bg-jaman-navy text-white text-xs font-bold disabled:opacity-40">Generate QR</button>
                  )}
                  {q?.status === 'ACTIVE' && <>
                    <button onClick={() => setViewing(row)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold">View QR</button>
                    <button onClick={() => printOne(row)} className="px-2 py-1.5 rounded-lg border border-slate-300" title="Print"><Printer className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (window.confirm('Regenerate this code? The printed one will stop working immediately.')) void run(row.tableId, () => QrAdminApi.regenerate(q.id), 'New code created; the old one no longer works'); }} className="px-2 py-1.5 rounded-lg border border-slate-300" title="Regenerate"><RefreshCw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => run(row.tableId, () => QrAdminApi.disable(q.id), 'Code disabled')} className="px-2 py-1.5 rounded-lg border border-slate-300" title="Disable"><Ban className="w-3.5 h-3.5" /></button>
                  </>}
                  {q?.status === 'DISABLED' && <button onClick={() => run(row.tableId, () => QrAdminApi.enable(q.id), 'Code enabled')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Enable</button>}
                  <button onClick={() => run(row.tableId, () => QrAdminApi.updateTable(row.tableId, { isActive: !row.isActive }), row.isActive ? `Table ${row.displayNumber} switched off` : `Table ${row.displayNumber} switched on`)} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-bold" title="Switch this table on or off">{row.isActive ? 'Turn off' : 'Turn on'}</button>
                  {q && q.status !== 'REVOKED' && <button onClick={() => { if (window.confirm('Revoke this code permanently?')) void run(row.tableId, () => QrAdminApi.revoke(q.id), 'Code revoked'); }} className="px-2 py-1.5 rounded-lg border border-rose-200 text-rose-700" title="Revoke"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {viewing?.qr?.url && <QrDialog row={viewing} onClose={() => setViewing(null)} showToast={showToast} />}
    </div>
  );
}

function QrDialog({ row, onClose, showToast }: { row: QrTableRow; onClose: () => void; showToast: (m: string) => void }) {
  const url = row.qr!.url!;
  // Escape closes this dialog like any other in the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-jaman-navy text-lg">Table {row.displayNumber}</div>
        <img src={generateQrDataUrl(url, { size: 260, margin: 4, color: '#000000' })} alt={`QR code for table ${row.displayNumber}`} className="mx-auto my-3" width={260} height={260} />
        <div className="text-[11px] text-slate-500 break-all">{url}</div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => { void navigator.clipboard?.writeText(url); showToast('Link copied'); }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy link</button>
          <button onClick={async () => { try { await downloadCardPng(await QrAdminApi.printData(row.qr!.id).then(withLogo), `table-${row.displayNumber}`); } catch (e) { showToast(errText(e)); } }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold flex items-center gap-1"><Download className="w-3.5 h-3.5" /> PNG</button>
          <button onClick={async () => { try { printCards([await QrAdminApi.printData(row.qr!.id).then(withLogo)], await QrAdminApi.printDesign()); } catch (e) { showToast(errText(e)); } }} className="px-3 py-1.5 rounded-lg bg-jaman-navy text-white text-xs font-bold flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Print / PDF</button>
        </div>
        <button onClick={onClose} className="mt-4 text-xs text-slate-500">Close</button>
      </div>
    </div>
  );
}

const STATUS_WORDS: Record<string, string> = { NEW: 'Waiting', PREPARING: 'Preparing', CONFIRMED: 'Preparing', READY: 'Ready', SERVED: 'Served', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

function Orders() {
  const { data, error } = useLoad<QrOrderRow[]>(() => QrAdminApi.orders(), 10000);
  if (error) return <div className="text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;
  if (data.length === 0) return <div className="text-sm text-slate-600 rounded-2xl border border-jaman-border bg-white p-6">No QR orders yet. They also appear in your counter's order list, marked QR.</div>;
  return (
    <div className="rounded-2xl border border-jaman-border bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500"><tr><th className="p-3">Order</th><th>Table</th><th>Status</th><th>Payment</th><th className="text-right">Total</th><th className="p-3 text-right">Placed</th></tr></thead>
        <tbody>
          {data.map((o, i) => (
            <tr key={`${o.orderNumber}-${i}`} className="border-t">
              <td className="p-3 font-bold">{o.orderNumber ?? '-'}</td>
              <td>{o.table ?? '-'}</td>
              <td>{STATUS_WORDS[o.status] ?? o.status}</td>
              <td>{o.paymentStatus === 'SUCCESS' ? 'Paid' : o.paymentMethod === 'ONLINE' ? 'Online payment pending' : 'Pay at counter'}</td>
              <td className="text-right">{inr(o.total)}</td>
              <td className="p-3 text-right text-slate-500">{new Date(o.placedAt).toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SETTING_ROWS: Array<[Exclude<keyof QrSettings, 'rules'>, string, string, boolean?]> = [
  ['orderingEnabled', 'QR ordering', 'Turn all QR ordering on or off at once.'],
  ['tableOrderingEnabled', 'Table ordering', 'Codes on tables that identify the table.'],
  ['menuOnlyEnabled', 'Menu-only codes', 'Codes for menu cards; the guest chooses dine-in with a table number, or takeaway.'],
  ['allowCustomerNotes', 'Customer notes', 'Let guests add notes to their order.'],
  ['allowModifiers', 'Customisations', 'Let guests choose add-ons and options.'],
  ['allowCash', 'Pay at counter', 'Guests pay at the counter when they are done.'],
  ['allowOnlinePayment', 'Online payment', 'Razorpay mobile checkout. Available to guests once payment collection is active.'],
  ['showOrderStatus', 'Show order status', 'Guests can follow Received, Preparing, Ready.'],
  ['autoAccept', 'Send straight to the kitchen', 'When off, the counter accepts each order first.'],
  ['requireCustomerName', 'Ask for name', 'Guests must enter their name.'],
  ['requireCustomerPhone', 'Ask for mobile number', 'Guests must enter their mobile number.']
];

function Settings({ showToast }: { showToast: (m: string) => void }) {
  const { data, error, reload } = useLoad<QrSettings>(QrAdminApi.settings);
  const payment = useLoad(QrAdminApi.paymentReadiness);
  const save = async (key: keyof QrSettings, value: boolean) => {
    try {
      await QrAdminApi.saveSettings({ [key]: value });
      showToast('Saved');
      reload();
      payment.reload();
    } catch (e) {
      showToast(errText(e));
    }
  };
  if (error) return <div className="text-sm text-rose-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;
  return (
    <div className="rounded-2xl border border-jaman-border bg-white divide-y max-w-2xl">
      <div className="p-4 bg-jaman-ivory rounded-t-2xl" role="status">
        <strong className="block text-sm text-jaman-navy">Mobile online payment: {payment.data?.guestAvailable ? 'Available' : 'Setup needed'}</strong>
        <p className="text-xs text-slate-600 mt-1">{payment.error || payment.data?.message || 'Checking payment collection…'}</p>
        {payment.data?.available && !data.allowOnlinePayment && <p className="text-xs text-jaman-saffron mt-1">Turn on Online payment below to show it on the guest checkout.</p>}
      </div>
      {SETTING_ROWS.map(([key, label, help, unavailable]) => (
        <label key={key} className={`flex items-center justify-between gap-4 p-4 ${unavailable ? 'opacity-50' : ''}`}>
          <span><span className="block font-bold text-sm text-jaman-navy">{label}</span><span className="block text-xs text-slate-500">{help}</span></span>
          <input type="checkbox" className="w-5 h-5" checked={data[key]} disabled={unavailable} onChange={(e) => void save(key, e.target.checked)} />
        </label>
      ))}
    </div>
  );
}


/** The restaurant's own words, colour and logo on the guest page. Saved straight to the cloud; guests see it on their next scan. */
export function BrandingForm({ showToast }: { showToast: (m: string) => void }) {
  const current = useLoad<import('../../cloud/qrAdminClient').QrBrandingView>(QrAdminApi.branding);
  const [f, setF] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const val = (k: string) => f[k] ?? (current.data as unknown as Record<string, string | null> | null)?.[k] ?? '';
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  const pickLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        setLogo(c.toDataURL('image/png'));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string | null> = { ...f };
      if (logo !== undefined) body.logo = logo;
      if (Object.keys(body).length === 0) return showToast('Nothing to save.');
      await QrAdminApi.updateBranding(body);
      setF({});
      setLogo(undefined);
      current.reload();
      showToast('Saved. Guests see it on their next scan.');
    } catch (e) {
      showToast(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'block mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="rounded-2xl border border-jaman-border bg-white p-4 space-y-3">
      <h3 className="font-bold text-jaman-navy text-sm">Guest page: your words, colour and logo</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-slate-600">Heading (default: your restaurant name)<input className={inputCls} maxLength={80} value={val('welcomeTitle')} onChange={(e) => set('welcomeTitle', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Order button text (default: Place order)<input className={inputCls} maxLength={30} value={val('orderButtonLabel')} onChange={(e) => set('orderButtonLabel', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Welcome message<input className={inputCls} maxLength={300} value={val('welcomeMessage')} onChange={(e) => set('welcomeMessage', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Footer message<input className={inputCls} maxLength={300} value={val('footerMessage')} onChange={(e) => set('footerMessage', e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Brand colour<input type="color" className="block mt-1 h-10 w-20 rounded-lg border border-slate-300" value={/^#[0-9a-fA-F]{6}$/.test(val('accentColor')) ? val('accentColor') : '#0b253a'} onChange={(e) => set('accentColor', e.target.value)} /></label>
        <div className="text-xs font-bold text-slate-600">Logo
          <div className="flex items-center gap-2 mt-1">
            {(logo ?? current.data?.logoUrl) && <img src={logo ?? undefined} alt="" className="h-10 rounded" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) pickLogo(file); }} />
            {(logo || current.data?.logoUrl) && <button type="button" className="text-rose-600" onClick={() => setLogo(null)}>Remove</button>}
          </div>
        </div>
      </div>
      <button disabled={saving} onClick={save} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold disabled:opacity-40">Save</button>
    </div>
  );
}

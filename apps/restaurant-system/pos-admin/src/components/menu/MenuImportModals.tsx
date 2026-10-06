import React, { useEffect, useState } from 'react';
import { Modal, Button } from '@jamanvaar/ui';
import { db, AuditRepository, scanMenuDuplicates, archiveConfirmedDuplicates, captureMenuCleanupBackup, restoreMenuCleanupBackup, menuCleanupReportIsCurrent, type MenuCleanupReport } from '@jamanvaar/database';
import { applyMenuCsv, type MenuCsvPreview } from '@jamanvaar/business';
import { publishCatalogNow } from '@jamanvaar/sync';
import { toCsvRow } from '@jamanvaar/utils';
export function downloadMenuFile(name: string, body: string, type = 'text/csv;charset=utf-8') { const url = URL.createObjectURL(new Blob([body], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function MenuCsvPreviewModal({ preview, onClose }: { preview: MenuCsvPreview | null; onClose: () => void }) {
  const [strategy, setStrategy] = useState('SKIP_DUPLICATE'); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  return <Modal isOpen={!!preview} onClose={busy ? () => {} : onClose} title="CSV Import Preview" maxWidth="3xl">{preview && <div className="space-y-4">
    <p>{preview.rowsDetected} rows detected · {preview.rows.length} valid · {preview.warnings.length} warnings · {preview.errors.length} errors</p>
    <p className="text-sm text-slate-600">Import only the valid rows after review. New category names are created exactly as supplied. tax_rate is a percentage; verify your restaurant's tax policy before importing.</p>
    <label>Existing items<select aria-label="CSV duplicate strategy" className="block border rounded-xl p-2" disabled={busy} value={strategy} onChange={e => setStrategy(e.target.value)}><option value="SKIP_DUPLICATE">Skip Existing</option><option value="REPLACE_DUPLICATE">Update Existing</option><option value="IMPORT_AS_NEW">Create New Copy</option></select></label>
    <div className="max-h-40 overflow-auto space-y-1">{preview.errors.map((issue, i) => <p className="text-rose-700 text-sm" key={`e${i}`}>Row {issue.row}: {issue.message}</p>)}{preview.warnings.map((issue, i) => <p className="text-amber-800 text-sm" key={`w${i}`}>Row {issue.row}: {issue.message}</p>)}</div>
    <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr>{['Row', 'Name', 'Category', 'Price', 'Food type', 'Available'].map(h => <th key={h} className="text-left p-2">{h}</th>)}</tr></thead><tbody>{preview.rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{row.name}</td><td>{row.category}{row.subcategory && ` / ${row.subcategory}`}</td><td>₹{row.price}</td><td>{row.dietaryType}</td><td>{row.isAvailable ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
    {message && <p role="status">{message}</p>}
    <div className="flex gap-3 justify-end"><Button variant="outline" onClick={() => downloadMenuFile('menu-csv-errors.csv', '\uFEFF' + [toCsvRow(['row', 'severity', 'message']), ...preview.errors.map(i => toCsvRow([i.row, 'ERROR', i.message])), ...preview.warnings.map(i => toCsvRow([i.row, 'WARNING', i.message]))].join('\r\n'))}>Download Error Report</Button><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !preview.rows.length || !!message} onClick={async () => {
      setBusy(true); try {
        const result = applyMenuCsv(preview, strategy); AuditRepository.log({ action: 'MENU_CSV_IMPORTED', category: 'MENU', details: `${result.itemsImported} imported, ${result.itemsSkipped} existing skipped, ${preview.errors.length} invalid rows omitted.`, username: 'Manager' });
        let publication = 'Saved locally; publication pending.';
        try { const synced = await publishCatalogNow(); publication = synced.delivered ? 'Published to connected terminals.' : `${synced.pending} changes await synchronization.`; } catch {}
        setMessage(`${result.itemsImported} items imported, ${result.itemsSkipped} skipped, ${result.categoriesCreated} categories created. ${publication}`);
      } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }}>{busy ? 'Importing…' : `Import ${preview.rows.length} Valid Rows`}</Button></div>
  </div>}</Modal>;
}
export function MenuDuplicateModal({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<MenuCleanupReport>(() => scanMenuDuplicates()); const [selected, setSelected] = useState<string[]>([]); const [canonical, setCanonical] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<{ backup: ReturnType<typeof captureMenuCleanupBackup>; after: MenuCleanupReport } | null>(null);
  const [stale, setStale] = useState(false);
  const [backedUp, setBackedUp] = useState(false); const [confirmed, setConfirmed] = useState(false); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => db.subscribe(() => setStale(!menuCleanupReportIsCurrent(report))), [report]);
  const refreshScan = async () => {
    setBusy(true); setSelected([]); setCanonical({}); setBackedUp(false); setConfirmed(false);
    setMessage('Synchronizing the menu before scanning…');
    try { const result = await publishCatalogNow(); setMessage(result.delivered ? 'Menu synchronized. Review the scan below.' : `Scanning the local menu; ${result.pending} changes await publication.`); }
    catch { setMessage('Cloud unavailable. This scan covers the local menu only.'); }
    finally { setReport(scanMenuDuplicates()); setStale(false); setBusy(false); }
  };
  useEffect(() => { void refreshScan(); }, []);
  return <Modal isOpen onClose={busy ? () => {} : onClose} title="Clean Duplicate Items" maxWidth="3xl"><div className="space-y-4">
    <p>{report.totalItems} active records · {report.groups.length} duplicate groups · {report.missingCategories.length} missing categories · {report.missingImages.length} missing photos · {report.invalidPrices.length} invalid prices · {report.invalidFoodTypes.length} invalid food types</p>
    <p className="text-sm text-slate-600">Shared photos alone do not prove a duplicate. Only groups with matching configuration and additional SKU, template or content evidence may be archived. Historical orders, KOTs and invoices retain their original item IDs.</p>
    {stale && <p role="alert">The menu changed after this scan. Scan again before archiving.</p>}
    <Button variant="outline" disabled={busy} onClick={() => void refreshScan()}>Scan Again</Button>
    <div className="max-h-80 overflow-auto space-y-3">{report.groups.map(group => <fieldset className="rounded-xl border p-3" key={group.id}><legend><label><input type="checkbox" disabled={!group.confirmed || busy} checked={selected.includes(group.id)} onChange={e => setSelected(s => e.target.checked ? [...s, group.id] : s.filter(id => id !== group.id))} /> {db.menuItems.find(i => i.id === group.canonicalId)?.name} — {group.confirmed ? 'Confirmed duplicate' : 'Needs manual verification'}</label></legend><p className="text-xs text-slate-600">{group.reasons.join(' · ')}</p><label>Keep canonical item<select aria-label={`Canonical item ${group.id}`} disabled={busy} value={canonical[group.id] || group.canonicalId} onChange={e => setCanonical(c => ({ ...c, [group.id]: e.target.value }))} className="block border p-2 rounded-lg w-full">{group.itemIds.map(id => { const item = db.menuItems.find(i => i.id === id)!; return <option key={id} value={id}>{item.name} — {item.sku} — ₹{item.price} — {id}</option>; })}</select></label></fieldset>)}</div>
    <div className="flex gap-3"><Button variant="outline" onClick={() => downloadMenuFile('menu-cleanup-report.json', JSON.stringify(report, null, 2), 'application/json')}>Download Cleanup Report</Button><Button variant="outline" onClick={() => { downloadMenuFile('menu-before-cleanup.json', JSON.stringify({ tenantId: report.tenantId, createdAt: new Date().toISOString(), categories: db.categories, menuItems: db.menuItems, modifierGroups: db.modifierGroups, taxGroups: db.taxGroups, combos: db.combos, recipes: db.recipes }, null, 2), 'application/json'); setBackedUp(true); }}>Download Backup</Button></div>
    <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I reviewed the selected groups and confirm archiving the duplicate records.</label>
    {message && <p role="status">{message}</p>}
    {undo && <Button variant="outline" disabled={busy} onClick={async () => { try { restoreMenuCleanupBackup(undo.backup, undo.after); setUndo(null); setReport(scanMenuDuplicates()); setMessage('Archiving undone; synchronization pending.'); await publishCatalogNow(); } catch (error) { setMessage((error as Error).message); } }}>Undo This Cleanup</Button>}
    <div className="flex gap-3 justify-end"><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button><Button disabled={busy || stale || !selected.length || !backedUp || !confirmed} onClick={async () => { setBusy(true); try { const backup = captureMenuCleanupBackup(); const result = archiveConfirmedDuplicates(report, selected, canonical); setUndo({ backup, after: scanMenuDuplicates() }); AuditRepository.log({ action: 'MENU_DUPLICATES_ARCHIVED', category: 'MENU', details: `${result.archived} confirmed duplicates archived; ${result.remapped} current relationships remapped.`, username: 'Manager' }); let status = 'Saved locally; publication pending.'; try { const sync = await publishCatalogNow(); status = sync.delivered ? 'Published.' : `${sync.pending} changes pending.`; } catch {} setMessage(`${result.archived} duplicates archived. ${status}`); setReport(scanMenuDuplicates()); setSelected([]); setConfirmed(false); setBackedUp(false); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>Archive Confirmed Duplicates</Button></div>
  </div></Modal>;
}

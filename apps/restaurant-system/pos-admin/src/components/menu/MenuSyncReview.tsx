import React, { useEffect, useState } from 'react';
import { db } from '@jamanvaar/database';
import { catalogSyncConflicts, syncMenuCatalog } from '@jamanvaar/sync';

const labels: Record<string, string> = { price: 'Price', name: 'Name', isAvailable: 'Available to order', isActive: 'Active', deleted: 'Removed', categoryId: 'Category', modifierGroupIds: 'Customization groups', taxGroupId: 'Tax group', cgstPercent: 'CGST (%)', sgstPercent: 'SGST (%)', minQuantity: 'Minimum quantity', maxQuantity: 'Maximum quantity' };
function describe(key: string, value: unknown): string {
  if (value === undefined || value === null) return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'price' && typeof value === 'number') return `₹${value.toFixed(2)}`;
  if (key === 'categoryId') return db.categories.find(item => item.id === value)?.name ?? 'Category no longer available';
  if (key === 'taxGroupId') return db.taxGroups.find(item => item.id === value)?.name ?? 'Tax group no longer available';
  if (key === 'modifierGroupIds' && Array.isArray(value)) return value.map(id => db.modifierGroups.find(group => group.id === id)?.name ?? 'Group no longer available').join(', ') || 'None';
  if (Array.isArray(value)) return value.map(item => typeof item === 'object' && item ? `${item.name ?? item.optionName ?? 'Option'}${typeof item.priceDelta === 'number' ? ` (+₹${item.priceDelta})` : ''}` : String(item)).join(', ') || 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Both owner-console modes use this same review; server authorization still controls each write. */
export function MenuSyncReview() {
  const [, redraw] = useState(0), [problem, setProblem] = useState('');
  useEffect(() => db.subscribe(() => redraw(tick => tick + 1)), []);
  const conflicts = catalogSyncConflicts();
  if (!conflicts.length) return problem ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-jaman-navy">{problem}</p> : null;
  const resolve = (entry: typeof conflicts[number], choice: 'SERVER' | 'LOCAL') => {
    try { entry.resolve(choice); setProblem(''); redraw(tick => tick + 1); void syncMenuCatalog({ push: true }).catch(() => setProblem('Your choice is saved on this device. Check your connection and retry menu sync.')); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Review the latest versions and try again.'); }
  };
  return <section aria-label="Menu changes needing review" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
    <h2 className="font-bold text-jaman-navy">{conflicts.length} menu change{conflicts.length === 1 ? ' needs' : 's need'} review</h2>
    <p className="text-sm text-slate-700">Another administrator changed the published record. Your edit is preserved here. Compare both versions before publishing.</p>
    {problem && <p role="alert" className="text-sm text-rose-800">{problem}</p>}
    {conflicts.map(entry => {
      const { conflict } = entry;
      const keys = [...new Set([...Object.keys(conflict.local), ...Object.keys(conflict.remote)])].filter(key => !['id', 'updatedAt'].includes(key) && JSON.stringify(conflict.local[key]) !== JSON.stringify(conflict.remote[key]));
      return <details key={`${entry.entityType}:${conflict.externalId}`} className="rounded-xl border border-amber-200 bg-white p-3">
        <summary className="cursor-pointer font-semibold text-jaman-navy break-words">{String(conflict.local.name ?? conflict.remote.name ?? 'Menu record')} — compare changes</summary>
        <div className="mt-3 space-y-2">{keys.map(key => <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 rounded-lg bg-slate-50 p-2 text-sm break-words">
          <strong>{labels[key] ?? key.replace(/([A-Z])/g, ' $1')}</strong><span><span className="font-semibold">Your edit: </span>{describe(key, conflict.local[key])}</span><span><span className="font-semibold">Published: </span>{describe(key, conflict.remote[key])}</span>
        </div>)}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => resolve(entry, 'SERVER')} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Use published version</button>
          <button type="button" disabled={conflict.remote.deleted === true} onClick={() => resolve(entry, 'LOCAL')} className="min-h-11 rounded-xl bg-jaman-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Keep my edit and sync</button>
        </div>
        {conflict.remote.deleted === true && <p className="mt-2 text-sm text-slate-600">This record was removed. Use the published version; add a new record if it is needed again.</p>}
      </details>;
    })}
  </section>;
}

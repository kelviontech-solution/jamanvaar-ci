import { useState } from 'react';
import { db, KitchenStationRepository, KioskConfigurationRepository } from '@jamanvaar/database';
import { syncKioskConfiguration } from '@jamanvaar/sync';

export function KitchenStationsPanel() {
  const [rows, setRows] = useState(KitchenStationRepository.list);
  const [name, setName] = useState(''); const [feedback, setFeedback] = useState('');
  const save = async (action: () => void) => {
    try { action(); setRows(KitchenStationRepository.list()); KioskConfigurationRepository.markChanged(); await syncKioskConfiguration({push: true}); setFeedback('Station configuration published. Verify the receiving KDS before service.'); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not save stations.'); }
  };
  return <details className="rounded-2xl border border-jaman-border bg-white p-4"><summary className="font-bold cursor-pointer text-jaman-navy">Kitchen stations & previous names</summary>
    <p className="mt-3 text-sm text-slate-600">Renaming keeps the station identity. Previous names route to the same station; similar names never route automatically.</p>
    <button type="button" className="min-h-11 px-3 rounded-xl border my-3" onClick={() => void save(() => { for (const value of new Set([...db.menuItems.map(item => item.kitchenStation), ...db.kots.map(ticket => ticket.station)].filter(Boolean))) KitchenStationRepository.ensure(value!); })}>Register existing kitchen names</button>
    <div className="flex gap-2 mb-3"><input aria-label="New kitchen station" className="min-w-0 flex-1 rounded-xl border px-3" value={name} onChange={event => setName(event.target.value)} maxLength={100}/><button type="button" disabled={!name.trim()} onClick={() => void save(() => { KitchenStationRepository.ensure(name); setName(''); })} className="min-h-11 bg-jaman-navy text-white rounded-xl px-3">Add station</button></div>
    {rows.map(row => <StationRow key={`${row.id}:${row.name}`} row={row} onSave={(name, aliases) => void save(() => KitchenStationRepository.rename(row.id, name, aliases))}/>)}
    {feedback && <p role="status" className="text-sm mt-3">{feedback}</p>}
  </details>;
}
function StationRow({row, onSave}: {row: ReturnType<typeof KitchenStationRepository.list>[number]; onSave: (name: string, aliases: string[]) => void}) {
  const [name, setName] = useState(row.name); const [aliases, setAliases] = useState(row.aliases.join(', '));
  return <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2 border-t py-3"><label className="text-xs">Station name<input aria-label={`Station name ${row.name}`} className="w-full min-h-11 rounded-xl border px-3" value={name} onChange={event => setName(event.target.value)}/></label><label className="text-xs">Previous names (comma separated)<input aria-label={`Previous names ${row.name}`} className="w-full min-h-11 rounded-xl border px-3" value={aliases} onChange={event => setAliases(event.target.value)}/></label><button type="button" onClick={() => onSave(name, aliases.split(','))} className="min-h-11 rounded-xl border px-3 self-end">Save</button></div>;
}

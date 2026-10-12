import React, { useEffect, useState } from 'react';
import { db, RestaurantIdentityRepository, resolveOperatingProfile } from '@jamanvaar/database';
import { qrApi, fetchDeviceFleet, type FleetDevice } from '../../cloud/cloudClient';
import { activeAdminBranch } from '../../adminBranchScope';

export function OperatingProfilesPanel() {
  const current = resolveOperatingProfile(db.restaurant, db.outlet);
  const [timezone, setTimezone] = useState(current.timezone);
  const [cutoffHour, setCutoffHour] = useState(current.cutoffHour);
  const [inherit, setInherit] = useState(!db.outlet.operatingProfile || !!db.outlet.operatingProfile.inherit);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [fleet, setFleet] = useState<FleetDevice[]>([]);
  const [viewProfile,setViewProfile] = useState<Parameters<typeof RestaurantIdentityRepository.syncProfile>[0] | null>(null);
  const selectedBranch = activeAdminBranch ?? db.outlet.id;
  const viewedOperating = viewProfile ? resolveOperatingProfile({...db.restaurant,operatingProfile:viewProfile.operatingProfile},{operatingProfile:viewProfile.branchOperatingProfile ?? undefined}) : current;
  const refresh = async () => { try { const branchId = activeAdminBranch ?? db.outlet.id; if (branchId && branchId !== 'all') { const profile = await qrApi<Parameters<typeof RestaurantIdentityRepository.syncProfile>[0]>(`/api/v1/devices/me/restaurant?branchId=${encodeURIComponent(branchId)}`); setViewProfile(profile); RestaurantIdentityRepository.syncProfile(profile); } setFleet(await fetchDeviceFleet()); } catch { setMessage('Could not refresh profile or device acknowledgements. Check the connection and retry.'); } };
  useEffect(() => {setViewProfile(null); void refresh();}, [selectedBranch]);
  useEffect(() => {if (viewProfile) {setTimezone(viewedOperating.timezone);setCutoffHour(viewedOperating.cutoffHour);setInherit(!viewProfile.branchOperatingProfile || !!viewProfile.branchOperatingProfile.inherit);}},[viewProfile]);
  const save = async () => {
    const branchId = activeAdminBranch ?? db.outlet.id;
    if (!branchId || branchId === 'all') { setMessage('Choose a branch first.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await qrApi<Parameters<typeof RestaurantIdentityRepository.syncProfile>[0]>(`/api/v1/devices/me/branch-operating-profile?branchId=${encodeURIComponent(branchId)}`, { method: 'PATCH', body: JSON.stringify(inherit ? { inherit: true } : { timezone, cutoffHour }) });
      RestaurantIdentityRepository.syncProfile(response);
      setMessage(`Saved. This branch changes on ${response.branchOperatingProfile?.effectiveFrom ?? 'its scheduled date'}; existing dates and till counts stay intact.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the branch profile.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-3">
    <h3 className="font-bold text-jaman-navy">Branch operating profile</h3>
    <p className="text-xs text-slate-600">Selected branch: current rollover {String(viewedOperating.cutoffHour).padStart(2,'0')}:00 in {viewedOperating.timezone}. Changes start tomorrow in the current restaurant timezone.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inherit} onChange={e => setInherit(e.target.checked)} />Follow restaurant defaults</label>
    {!inherit && <div className="flex flex-wrap gap-3"><label className="text-xs font-bold">Timezone<input className="block rounded-xl border p-2" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Asia/Kolkata" /></label><label className="text-xs font-bold">Rollover hour<select className="block rounded-xl border p-2" value={cutoffHour} onChange={e => setCutoffHour(Number(e.target.value))}>{Array.from({length:24},(_,hour) => <option key={hour} value={hour}>{String(hour).padStart(2,'0')}:00</option>)}</select></label></div>}
    <p className="rounded-xl bg-jaman-cream p-3 text-xs">Preview: {inherit ? 'Use the restaurant timezone and rollover rule, including future default changes.' : `Orders before ${String(cutoffHour).padStart(2,'0')}:00 (${timezone}) belong to the previous business date.`}</p>
    <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-jaman-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Apply branch profile'}</button><button type="button" onClick={() => void refresh()} className="text-xs underline">Refresh device acknowledgement</button></div>
    {message && <p role="status" className="text-xs text-slate-700">{message}</p>}
    <ul className="space-y-1 text-xs">{fleet.filter(device => device.branch?.id === selectedBranch).map(device => <li key={device.id}>{device.name || device.type}: {device.profileRevision && device.profileRevision === viewProfile?.profileRevision ? 'Profile acknowledged' : 'Waiting for profile acknowledgement'} · {device.health}</li>)}</ul>
  </section>;
}

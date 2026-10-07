import { useEffect, useState } from 'react';
import { ImagePlus, Save } from 'lucide-react';
import { optimizeWelcomeUpload, resolveMenuImage } from '@jamanvaar/utils';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { RestaurantListItem } from '../../api/types';
import { Button, Card, Input } from '../../components/ui';

type Design = { id: string; name: string; category: string; imageUrl: string; landscapeImageUrl: string; thumbnailUrl: string };
type Access = { maxDesigns: number; allowedIds: string[] | null };
type Policy = { maxDesigns: number; enabledIds: string[] | null; restaurantAccess: Record<string, Access> };
const endpoint = '/api/v1/platform/settings/kiosk-welcome/designs';
const border = { border: '1px solid #e5ddd2', borderRadius: 12, padding: 12 };

export function KioskWelcomeDesignsCard() {
  const { can } = useAuth(); const writable = can('catalog', 'write');
  const [designs, setDesigns] = useState<Design[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [scope, setScope] = useState('global');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [dirty, setDirty] = useState(false);
  const [name, setName] = useState(''), [category, setCategory] = useState('Custom collection');
  const [portrait, setPortrait] = useState<File | null>(null), [landscape, setLandscape] = useState<File | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([api.get<{ designs: Design[]; policy: Policy }>(endpoint), api.get<RestaurantListItem[]>('/api/v1/restaurants')]).then(([catalog, owners]) => {
      if (active) { setDesigns(catalog.designs); setPolicy(catalog.policy); setRestaurants(owners); }
    }).catch(error => { if (active) setMessage(error.message || 'Could not load welcome designs.'); });
    return () => { active = false; };
  }, []);
  const local = scope !== 'global' ? policy?.restaurantAccess[scope] : undefined;
  const selected = scope === 'global' ? policy?.enabledIds : local?.allowedIds;
  const limit = local?.maxDesigns ?? policy?.maxDesigns ?? 100;
  const count = designs.filter(d => (!policy?.enabledIds || policy.enabledIds.includes(d.id)) && (scope === 'global' || !local?.allowedIds || local.allowedIds.includes(d.id))).slice(0, limit).length;
  function setAccess(ids: string[] | null, maxDesigns = limit) {
    if (!policy) return;
    setPolicy(scope === 'global' ? { ...policy, enabledIds: ids, maxDesigns } : { ...policy, restaurantAccess: { ...policy.restaurantAccess, [scope]: { allowedIds: ids, maxDesigns } } }); setDirty(true); setMessage('');
  }
  async function save() {
    setBusy(true); setMessage('');
    try { await api.patch('/api/v1/platform/settings/platform.kioskWelcome', { value: policy }); setDirty(false); setMessage('Design access saved. Kiosk Admin refreshes when opened or focused. Existing kiosk selections keep working.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save design access.'); }
    finally { setBusy(false); }
  }
  async function add() {
    if (!portrait || !name.trim()) { setMessage('Enter a design name and choose a portrait image.'); return; }
    setBusy(true); setMessage('');
    try {
      const p = await optimizeWelcomeUpload(portrait), l = landscape ? await optimizeWelcomeUpload(landscape) : undefined;
      const added = await api.post<{ id: string }>(endpoint, { name, category, portrait: p.imageUrl, landscape: l?.imageUrl });
      const catalog = await api.get<{ designs: Design[] }>(endpoint); setDesigns(catalog.designs);
      // Preserve unsaved access edits. Explicit selections require an intentional opt-in for the new design.
      setName(''); setPortrait(null); setLandscape(null);
      setMessage(`Design added (${added.id.slice(0, 17)}). Enable it below if using a selected collection; increase the selection limit if needed, then save access.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add design.'); }
    finally { setBusy(false); }
  }
  return <Card className="settings-card" style={{ gridColumn: '1 / -1' }}>
    <div className="settings-card-header"><div className="settings-icon-box"><ImagePlus size={20} /></div><div><h3 className="settings-card-title">Kiosk Welcome Designs</h3><p className="settings-card-desc">Manage the collection, restaurant allowances, and new backgrounds.</p></div></div>
    {message && <p role="status" style={{ ...border, background: '#fff5e7', color: '#70421b', marginBottom: 16 }}>{message}</p>}
    {!policy ? <p>Loading welcome collection…</p> : <fieldset disabled={busy || !writable} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <div className="form-row"><label className="form-field">Design access scope<select aria-label="Design access scope" value={scope} onChange={e => setScope(e.target.value)}><option value="global">Platform default / all restaurants</option>{restaurants.map(r => <option key={r.id} value={r.id}>{r.name} · {r.restaurantCode || r.id.slice(0,8)}</option>)}</select></label><label className="form-field">{scope === 'global' ? 'Default maximum designs' : 'Restaurant maximum designs'}<Input aria-label="Maximum available welcome designs" type="number" min={1} max={100} value={limit} onChange={e => { const n = Number(e.target.value); if (n >= 1 && n <= 100) setAccess(selected || null, n); }} /></label></div>
      <p className="muted" style={{ margin: '12px 0' }}>{count} designs available in this scope. The limit counts from collection order. Platform-disabled designs stay unavailable to every restaurant. Your existing ten designs are preserved.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Button type="button" variant="ghost" onClick={() => setAccess(null)}>Allow all designs</Button>
        <Button type="button" variant="ghost" onClick={() => setAccess([])}>Clear design selection</Button>
        {scope !== 'global' && <Button type="button" variant="ghost" onClick={() => { const next = { ...policy.restaurantAccess }; delete next[scope]; setPolicy({ ...policy, restaurantAccess: next }); setDirty(true); }}>Use platform defaults</Button>}
        <Button type="button" variant="accent" onClick={() => void save()} disabled={!dirty}><Save size={16} />Save design access</Button>
      </div>
      {scope !== 'global' && !local && <p className="muted">This restaurant currently inherits platform defaults. Change its count or selection to create an override.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,180px),1fr))', gap: 12 }}>
        {designs.map(d => { const enabled = selected == null || selected.includes(d.id); const platformDisabled = scope !== 'global' && policy.enabledIds !== null && !policy.enabledIds.includes(d.id);
          return <label key={d.id} style={{ ...border, padding: 0, overflow: 'hidden', opacity: platformDisabled ? .55 : 1 }}><img src={resolveMenuImage(d.thumbnailUrl)} alt={d.name} loading="lazy" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} /><div style={{ padding: 10 }}><input aria-label={`Allow ${d.name}`} type="checkbox" checked={enabled} disabled={platformDisabled} onChange={e => { const ids = selected || designs.map(v => v.id); setAccess(e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id)); }} /> <strong>{d.name}</strong><p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{d.category}{platformDisabled ? ' · Disabled on platform' : ''}</p></div></label>;
        })}
      </div>
      <section style={{ ...border, marginTop: 24 }}><h4>Add a platform design</h4><p className="muted">PNG, JPG or WebP. Portrait master recommended: 1080 × 1920. Optional wide companion: 1920 × 1080. Keep the centre clear and leave names, messages, and buttons out of the artwork. Images are optimized and stored durably on the server.</p>
        <div className="form-row"><label className="form-field">Design name<Input aria-label="Platform welcome design name" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label><label className="form-field">Category / style<Input aria-label="Platform welcome design category" value={category} maxLength={80} onChange={e => setCategory(e.target.value)} /></label></div>
        <div className="form-row"><label className="form-field">Portrait image<input aria-label="Platform welcome portrait image" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setPortrait(e.target.files?.[0] || null)} /></label><label className="form-field">Landscape image (optional)<input aria-label="Platform welcome landscape image" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setLandscape(e.target.files?.[0] || null)} /></label></div>
        <Button type="button" variant="accent" onClick={() => void add()}><ImagePlus size={16} />Add welcome design</Button>
      </section>
    </fieldset>}
    {!writable && <p className="muted">Your role can view this collection. Design changes require catalog write access.</p>}
  </Card>;
}

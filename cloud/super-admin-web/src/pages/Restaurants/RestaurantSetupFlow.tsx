import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { APP_CODE_LABELS, type AppCode } from '../../api/types';
import { Button } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { productAction, checkAction, type SetupAction } from './setupActions';
export type LaunchStatus = {
  branch: { name: string };
  products: { appCode: AppCode; purchased: boolean; enabled: boolean; configured: boolean; ready: boolean; reason: string; nextAction?: string }[];
  checks: { id: string; label: string; done: boolean; page?: string }[];
  delivery: { id: string; name: string; online: boolean; menuReceived: boolean; configurationReceived: boolean }[];
  handovers: { acceptedAt?: string }[];
  publishedMenuVersion: number;
  deliveryRestricted?: boolean;
};
export function RestaurantSetupFlow({
  restaurantId,
  branchId,
  onOpen,
  onStatus,
  refreshKey = 0,
  activeTab
}: {
  restaurantId: string;
  branchId: string;
  onStatus: (status: LaunchStatus | undefined) => void;
  refreshKey?: number;
  activeTab?: string;
  onOpen: (tab: 'overview' | 'applications' | 'subscription' | 'branches' | 'devices' | 'owner' | 'menu' | 'branch-access' | 'handover', ownerTask?: string) => void;
}) {
  const { can } = useAuth();
  const compact=!!activeTab&&activeTab!=='overview';
  const [status, setStatus] = useState<LaunchStatus>(),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false),
    [showAll,setShowAll]=useState(false),
    [reload, setReload] = useState(0);
  useEffect(()=>{setOpen(false);},[activeTab]);
  useEffect(() => {
    let active = true;
    setStatus(undefined); onStatus(undefined);
    setError('');
    if (branchId)
      api
        .get<LaunchStatus>(`/api/v1/restaurants/${restaurantId}/launch?branchId=${encodeURIComponent(branchId)}`)
        .then((v) => {
          if (active) { setStatus(v); onStatus(v); }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [restaurantId, branchId, reload, refreshKey, onStatus]);
    const blocked = status?.products.find(p => p.enabled && !p.configured) ?? status?.products.find(p=>p.enabled&&!p.ready) ?? status?.products.find(p=>p.purchased&&!p.enabled);
  const pending = status?.checks.find(c => !c.done);
  const next: SetupAction = blocked ? productAction(blocked) : !status?.products.some(p=>p.enabled)
    ? {tab:'subscription',label:'Choose products and plan',area:'subscriptions'} : pending ? checkAction(pending)
    : {tab:'handover',label:'Complete owner handover',area:'restaurants'};
  return (
    <section
      className="detail-card"
      style={{ padding: 20, marginBottom: 20, background: 'var(--jv-surface)', border: '1px solid var(--jv-border)', borderRadius: 16 }}
      aria-label="Restaurant setup and handover"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Continue restaurant setup</h2>
          <p className="muted">{status ? `${status.branch.name}: ${status.checks.filter(c=>c.done).length}/${status.checks.length} checks complete` : 'Choose an active branch to review setup.'}</p>
        </div>
      </div>
      {!compact&&<Button variant="primary" disabled={!status || !can(next.area,'read')} onClick={()=>onOpen(next.tab,next.ownerTask)}>Continue setup: {next.label}</Button>}
      <nav aria-label="Setup steps" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        {!compact&&(
          [
            ['Select restaurant', 'overview'],
            ['Products & access', 'applications'],
            ['Branches', 'branches'],
            ['Connect devices', 'devices']
          ] as const
        ).map(([name, tab], i) => (
          <Button
            variant="ghost"
            key={tab}
            disabled={tab === 'devices' ? !can('devices', 'read') : tab === 'applications' ? !can('ops', 'read') : false}
            onClick={() => onOpen(tab)}
          >
            {i + 1}. {name}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          5. Readiness checks
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            onOpen('handover');
          }}
        >
          6. Owner handover
        </Button>
      </nav>
      {open && (
        <div>
          {error && <p role="alert">Checks unavailable: {error}</p>}
          {!status && !error && <p role="status">Checking branch setup…</p>}
          {status && (
            <>
              <p>
                <strong>{status.branch.name}</strong> · Published menu v{status.publishedMenuVersion}
              </p>
              <Button variant="ghost" onClick={()=>setShowAll(value=>!value)}>{showAll?'Show purchased products':'Show all products'}</Button>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {['Product', 'Purchased', 'Enabled for branch', 'Configured', 'Ready', 'Why / next action'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {status.products.filter(p=>showAll||p.purchased||p.enabled).map((p) => (
                      <tr key={p.appCode}>
                        <td>{APP_CODE_LABELS[p.appCode]}</td>
                        {[p.purchased, p.enabled, p.configured, p.ready].map((v, i) => (
                          <td key={i}>{v ? 'Yes' : i < 2 ? 'No' : 'Not yet'}</td>
                        ))}
                        <td>
                          <button
                            className="btn btn-ghost"
                            disabled={!can(productAction(p).area,'read')} onClick={() => {const action=productAction(p);onOpen(action.tab,action.ownerTask);}}
                          >
                            {productAction(p).label}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul>
                {status.checks.map((c) => (
                  <li key={c.id}>
                    {c.done ? '✓' : '○'} {c.label} {!c.done && <Button variant="ghost" disabled={!can(checkAction(c).area,'read')} onClick={()=>{const action=checkAction(c);onOpen(action.tab,action.ownerTask);}}>{checkAction(c).label}</Button>}
                  </li>
                ))}
              </ul>
              <h3>Device delivery</h3>
              {status.deliveryRestricted ? (
                <p>Device details require device-viewing permission.</p>
              ) : status.delivery.length ? (
                status.delivery.map((d) => (
                  <p key={d.id}>
                    {d.name}: {d.online ? 'Online' : 'Offline'} · Menu {d.menuReceived ? 'received' : 'waiting'} · Design{' '}
                    {d.configurationReceived ? 'received' : 'waiting'}
                  </p>
                ))
              ) : (
                <p>No kiosks connected to this branch.</p>
              )}
              <h3>Owner handover summary</h3>
              <p>
                Review branch access and send the owner to their console. Complete real channel acceptance tests and a receiving-user handover there.{' '}
                {status.handovers.filter((h) => h.acceptedAt).length} handover(s) acknowledged.
              </p>
              <button className="btn btn-secondary" onClick={() => onOpen('owner')}>
                Open owner access & invitation
              </button>
            </>
          )}
          <button className="btn btn-ghost" onClick={() => setReload((n) => n + 1)}>
            Refresh checks
          </button>
        </div>
      )}
    </section>
  );
}

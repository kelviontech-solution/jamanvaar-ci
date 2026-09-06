import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Branch } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  FilterTabs,
  SearchBar,
  SkeletonTable,
  statusTone
} from '../../components/ui';
import { Building2, Plus, Store } from 'lucide-react';
import '../../components/shared.css';
import { CreateBranchModal } from './CreateBranchModal';

type BranchStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function BranchesListPage() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BranchStatusFilter>('ALL');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('ALL');

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<{
    branch: Branch;
    action: 'activate' | 'deactivate';
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<Branch[]>('/api/v1/branches')
      .then((data) => {
        setBranches(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load branches'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Unique restaurants list for filter dropdown
  const uniqueRestaurants = useMemo(() => {
    if (!branches) return [];
    const map = new Map<string, string>();
    branches.forEach((b) => {
      if (b.restaurant) {
        map.set(b.restaurant.id, b.restaurant.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [branches]);

  const filteredBranches = useMemo(() => {
    if (!branches) return [];
    return branches.filter((b) => {
      if (statusFilter !== 'ALL') {
        const isAct = b.status === 'ACTIVE';
        if (statusFilter === 'ACTIVE' && !isAct) return false;
        if (statusFilter === 'INACTIVE' && isAct) return false;
      }
      if (selectedRestaurantId !== 'ALL' && b.restaurant?.id !== selectedRestaurantId) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = b.name.toLowerCase().includes(q);
        const matchCode = b.code.toLowerCase().includes(q);
        const matchRest = (b.restaurant?.name || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchRest) return false;
      }
      return true;
    });
  }, [branches, statusFilter, selectedRestaurantId, search]);

  async function handleExecuteConfirm() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/branches/${confirmTarget.branch.id}/${confirmTarget.action}`);
      showToast(`Branch "${confirmTarget.branch.name}" ${confirmTarget.action === 'activate' ? 'activated' : 'deactivated'}`);
      setConfirmTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  const activeCount = useMemo(() => branches?.filter((b) => b.status === 'ACTIVE').length || 0, [branches]);
  const inactiveCount = useMemo(() => branches?.filter((b) => b.status !== 'ACTIVE').length || 0, [branches]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="page-subtitle">Every operational branch across all restaurant tenants — managed independently with localized hardware limits.</p>
        </div>
        <Button variant="accent" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          <span>Add Branch</span>
        </Button>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by branch name, code, or restaurant…"
          width="320px"
        />

        <FilterTabs<BranchStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Branches', count: branches?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'INACTIVE', label: 'Inactive', count: inactiveCount }
          ]}
        />

        <select
          value={selectedRestaurantId}
          onChange={(e) => setSelectedRestaurantId(e.target.value)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
        >
          <option value="ALL">All Restaurants ({uniqueRestaurants.length})</option>
          {uniqueRestaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        {(search || statusFilter !== 'ALL' || selectedRestaurantId !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setSelectedRestaurantId('ALL');
            }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {filteredBranches.length} of {branches?.length ?? 0} branches
        </span>
      </div>

      {loading && !branches && <SkeletonTable rows={5} cols={6} />}

      {branches && (
        <Card>
          {filteredBranches.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-6 h-6 text-slate-400" />}
              title={branches.length === 0 ? 'No branches yet' : 'No matching branches found'}
              description={
                branches.length === 0
                  ? 'Every restaurant gets a primary branch on creation, and additional branches can be added here.'
                  : 'Try clearing your search query or restaurant filter to view other outlets.'
              }
              action={
                branches.length > 0 ? (
                  <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); setSelectedRestaurantId('ALL'); }}>
                    Reset Filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Restaurant</th>
                    <th>Terminals</th>
                    <th>Staff Users</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBranches.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                        <span className="muted mono" style={{ fontSize: 11 }}>Code: {b.code}</span>
                      </td>
                      <td>
                        {b.restaurant ? (
                          <Link to={`/restaurants/${b.restaurant.id}`} className="table-link" style={{ fontWeight: 600 }}>
                            {b.restaurant.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{b._count?.devices ?? 0}</td>
                      <td style={{ fontWeight: 600 }}>{b._count?.users ?? 0}</td>
                      <td>
                        <Badge tone={statusTone(b.status)} pulse={b.status === 'ACTIVE'}>{b.status}</Badge>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant={b.status === 'ACTIVE' ? 'danger' : 'primary'}
                          onClick={() => setConfirmTarget({
                            branch: b,
                            action: b.status === 'ACTIVE' ? 'deactivate' : 'activate'
                          })}
                        >
                          {b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {showCreate && (
        <CreateBranchModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {/* Confirm Dialog */}
      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title={confirmTarget.action === 'activate' ? 'Activate Branch?' : 'Deactivate Branch?'}
          message={
            confirmTarget.action === 'activate'
              ? `Restore active operational status for branch "${confirmTarget.branch.name}"?`
              : `Deactivating branch "${confirmTarget.branch.name}" will pause order routing for its terminals.`
          }
          tone={confirmTarget.action === 'activate' ? 'primary' : 'danger'}
          isPending={actionPending}
          onConfirm={handleExecuteConfirm}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

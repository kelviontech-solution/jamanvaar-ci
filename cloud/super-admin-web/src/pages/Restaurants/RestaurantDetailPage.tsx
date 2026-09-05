import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { AuditLogPage, RestaurantDetail } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';
import './restaurants.css';
import { EditRestaurantModal } from './EditRestaurantModal';
import { CreateBranchModal } from '../Branches/CreateBranchModal';
import { GenerateActivationKeyModal } from '../ActivationKeys/GenerateActivationKeyModal';
import { AssignSubscriptionModal } from '../Subscriptions/AssignSubscriptionModal';

type Tab = 'overview' | 'owner' | 'branches' | 'subscription' | 'activation' | 'devices' | 'activity';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'owner', label: 'Owner & Users' },
  { key: 'branches', label: 'Branches' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'activation', label: 'Activation Keys' },
  { key: 'devices', label: 'Devices' },
  { key: 'activity', label: 'Activity' }
];

export function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<'edit' | 'branch' | 'activation' | 'subscription' | null>(null);
  const [activity, setActivity] = useState<AuditLogPage | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<RestaurantDetail>(`/api/v1/restaurants/${id}`)
      .then(setRestaurant)
      .catch((err) =>
        setError(err instanceof ApiError && err.status === 404 ? 'Restaurant not found' : 'Failed to load restaurant')
      );
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (tab === 'activity' && id) {
      api
        .get<AuditLogPage>(`/api/v1/audit-logs?restaurantId=${id}&limit=50`)
        .then(setActivity)
        .catch(() => setActivity(null));
    }
  }, [tab, id]);

  async function toggleStatus() {
    if (!restaurant) return;
    setActionPending(true);
    try {
      const action = restaurant.status === 'ACTIVE' ? 'suspend' : 'reactivate';
      await api.patch(`/api/v1/restaurants/${restaurant.id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  async function toggleBranchStatus(branchId: string, current: string) {
    const action = current === 'ACTIVE' ? 'deactivate' : 'activate';
    await api.patch(`/api/v1/branches/${branchId}/${action}`).catch(() => {});
    load();
  }

  async function revokeActivationKey(keyId: string) {
    if (!window.confirm('Revoke this activation key?')) return;
    await api.patch(`/api/v1/activation-keys/${keyId}/revoke`).catch(() => {});
    load();
  }

  async function revokeDevice(deviceId: string) {
    if (!window.confirm('Revoke this device?')) return;
    await api.patch(`/api/v1/devices/${deviceId}/revoke`).catch(() => {});
    load();
  }

  if (error) return <div className="page-error">{error}</div>;
  if (!restaurant) return <div className="layout-loading">Loading…</div>;

  const owner = restaurant.users.find((u) => u.role === 'OWNER');
  const activeSub = restaurant.subscriptions[0];

  return (
    <div>
      <Link to="/restaurants" className="back-link">
        ← Back to restaurants
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{restaurant.name}</h1>
          <p className="page-subtitle">
            {[restaurant.city, restaurant.state, restaurant.country].filter(Boolean).join(', ')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Badge tone={statusTone(restaurant.status)}>{restaurant.status}</Badge>
          <Button variant="ghost" onClick={() => setModal('edit')}>
            Edit
          </Button>
          <Button
            variant={restaurant.status === 'ACTIVE' ? 'danger' : 'primary'}
            onClick={toggleStatus}
            disabled={actionPending}
          >
            {restaurant.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
          </Button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="detail-grid">
          <Card className="detail-card">
            <div className="detail-card-title">Profile</div>
            <dl className="detail-list">
              <dt>Legal name</dt>
              <dd>{restaurant.legalName ?? '—'}</dd>
              <dt>GSTIN</dt>
              <dd>{restaurant.gstin ?? '—'}</dd>
              <dt>Address</dt>
              <dd>{restaurant.address ?? '—'}</dd>
              <dt>Timezone</dt>
              <dd>{restaurant.timezone}</dd>
              <dt>Currency</dt>
              <dd>{restaurant.currency}</dd>
              <dt>Created</dt>
              <dd>{new Date(restaurant.createdAt).toLocaleDateString()}</dd>
            </dl>
          </Card>
          <Card className="detail-card">
            <div className="detail-card-title">At a glance</div>
            <dl className="detail-list">
              <dt>Branches</dt>
              <dd>{restaurant.branches.length}</dd>
              <dt>Devices</dt>
              <dd>{restaurant.devices.length}</dd>
              <dt>Plan</dt>
              <dd>{activeSub?.plan.name ?? 'No subscription'}</dd>
              <dt>Owner</dt>
              <dd>{owner ? owner.fullName : '—'}</dd>
            </dl>
          </Card>
        </div>
      )}

      {tab === 'owner' && (
        <Card className="detail-card">
          <div className="detail-card-title">Owner</div>
          {owner ? (
            <dl className="detail-list">
              <dt>Name</dt>
              <dd>{owner.fullName}</dd>
              <dt>Email</dt>
              <dd>{owner.email}</dd>
              <dt>Phone</dt>
              <dd>{owner.phone ?? '—'}</dd>
              <dt>Status</dt>
              <dd>
                <Badge tone={statusTone(owner.status)}>{owner.status}</Badge>
              </dd>
            </dl>
          ) : (
            <p className="muted">No owner on record.</p>
          )}
          <p className="muted" style={{ marginTop: 14 }}>
            Manage owner status and details from <Link to="/owners">Restaurant Owners</Link>.
          </p>
        </Card>
      )}

      {tab === 'branches' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            Branches ({restaurant.branches.length})
            <Button variant="accent" onClick={() => setModal('branch')}>
              + Add branch
            </Button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {restaurant.branches.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className="mono">{b.code}</td>
                  <td>
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </td>
                  <td>
                    <Button variant={b.status === 'ACTIVE' ? 'danger' : 'primary'} onClick={() => toggleBranchStatus(b.id, b.status)}>
                      {b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'subscription' && (
        <Card className="detail-card">
          <div className="detail-card-title">
            Subscription
            {!activeSub && (
              <Button variant="accent" onClick={() => setModal('subscription')}>
                Assign plan
              </Button>
            )}
          </div>
          {activeSub ? (
            <dl className="detail-list">
              <dt>Plan</dt>
              <dd>{activeSub.plan.name}</dd>
              <dt>Status</dt>
              <dd>
                <Badge tone={statusTone(activeSub.status)}>{activeSub.status}</Badge>
              </dd>
              <dt>Start</dt>
              <dd>{new Date(activeSub.startDate).toLocaleDateString()}</dd>
              <dt>Expires</dt>
              <dd>{new Date(activeSub.expiresAt).toLocaleDateString()}</dd>
            </dl>
          ) : (
            <EmptyState title="No subscription assigned" description="Assign a plan to unlock branch and device limits." />
          )}
          <p className="muted" style={{ marginTop: 14 }}>
            Renew, change plan, or suspend from <Link to="/subscriptions">Subscriptions</Link>.
          </p>
        </Card>
      )}

      {tab === 'activation' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            Activation keys ({restaurant.activationKeys.length})
            <Button variant="accent" onClick={() => setModal('activation')}>
              + Generate key
            </Button>
          </div>
          {restaurant.activationKeys.length === 0 ? (
            <EmptyState title="No activation keys yet" description="Generate one to hand off for device setup." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Device type</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {restaurant.activationKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="mono">{k.code}</td>
                    <td>{k.allowedDeviceType}</td>
                    <td>
                      <Badge tone={statusTone(k.status)}>{k.status}</Badge>
                    </td>
                    <td>{new Date(k.expiresAt).toLocaleDateString()}</td>
                    <td>
                      {k.status === 'ACTIVE' && (
                        <Button variant="danger" onClick={() => revokeActivationKey(k.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'devices' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            Devices ({restaurant.devices.length})
          </div>
          {restaurant.devices.length === 0 ? (
            <EmptyState title="No devices registered" description="Devices appear once a real activation happens — a later phase." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {restaurant.devices.map((d) => (
                  <tr key={d.id}>
                    <td>{d.type}</td>
                    <td>{d.branch?.name ?? '—'}</td>
                    <td>
                      <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                    </td>
                    <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}</td>
                    <td>
                      {d.status !== 'REVOKED' && (
                        <Button variant="danger" onClick={() => revokeDevice(d.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            Activity
          </div>
          {!activity ? (
            <p className="muted" style={{ padding: '0 22px 18px' }}>
              Loading…
            </p>
          ) : activity.rows.length === 0 ? (
            <EmptyState title="No activity yet" description="Actions taken on this restaurant will appear here." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Category</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {activity.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.action}</td>
                    <td>{row.category}</td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {modal === 'edit' && (
        <EditRestaurantModal
          restaurant={restaurant}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === 'branch' && (
        <CreateBranchModal
          restaurantId={restaurant.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === 'activation' && (
        <GenerateActivationKeyModal
          restaurantId={restaurant.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === 'subscription' && (
        <AssignSubscriptionModal
          restaurantId={restaurant.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

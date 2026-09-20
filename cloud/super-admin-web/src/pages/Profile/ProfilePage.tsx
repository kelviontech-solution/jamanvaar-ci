import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Session } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Card, ConfirmModal, EmptyState } from '../../components/ui';
import '../../components/shared.css';

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Session | 'others' | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  function loadSessions() {
    setSessionsError(null);
    api
      .get<Session[]>('/api/v1/platform/sessions')
      .then(setSessions)
      .catch((err) => {
        setSessions([]);
        setSessionsError(err instanceof ApiError ? err.message : 'Could not load your sessions');
      });
  }

  useEffect(loadSessions, []);

  function flash(tone: 'success' | 'error', text: string) {
    setNotice({ tone, text });
    setTimeout(() => setNotice(null), 5000);
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    setSubmitting(true);
    try {
      await api.patch('/api/v1/platform/me/password', { currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      loadSessions();
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRevoke() {
    if (!confirmTarget) return;
    setPending(true);
    try {
      if (confirmTarget === 'others') {
        const res = await api.post<{ revoked: number }>('/api/v1/platform/sessions/revoke-others');
        flash('success', res.revoked === 0 ? 'There were no other sessions to sign out.' : `Signed out ${res.revoked} other session${res.revoked === 1 ? '' : 's'}.`);
      } else {
        const res = await api.delete<{ current: boolean }>(`/api/v1/platform/sessions/${confirmTarget.id}`);
        if (res.current) {
          // You revoked the browser you are using: end it here too, at once.
          await logout();
          return;
        }
        flash('success', `Signed out ${confirmTarget.device}.`);
      }
      setConfirmTarget(null);
      loadSessions();
    } catch (err) {
      setConfirmTarget(null);
      flash('error', err instanceof ApiError ? err.message : 'Could not sign that session out. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const otherCount = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Your Super Admin account — separate from every restaurant's own staff accounts.</p>
        </div>
      </div>

      <div className="detail-grid">
        <Card className="detail-card">
          <div className="detail-card-title">Account</div>
          <dl className="detail-list">
            <dt>Name</dt>
            <dd>{user?.fullName}</dd>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            <dt>Status</dt>
            <dd>{user?.status}</dd>
          </dl>
        </Card>

        <Card className="detail-card">
          <div className="detail-card-title">Change password</div>
          <form onSubmit={handleChangePassword} className="kv-form">
            <div className="field">
              <label>Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {passwordError && <div className="form-error">{passwordError}</div>}
            {passwordSuccess && (
              <div className="muted">Password changed. Every other session has been signed out.</div>
            )}
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </Card>

        <Card className="detail-card detail-card-full">
          <div className="detail-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>Active sessions</span>
            {otherCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmTarget('others')}>
                Sign out all other sessions
              </Button>
            )}
          </div>
          {notice && (
            <div className={notice.tone === 'error' ? 'form-error' : 'muted'} role="status" style={{ marginBottom: 12, fontWeight: 600 }}>
              {notice.text}
            </div>
          )}
          {sessionsError && <div className="form-error">{sessionsError}</div>}
          {sessions === null ? (
            <p className="muted">Loading…</p>
          ) : sessions.length === 0 ? (
            <EmptyState title="No active sessions" description="Log in again to start a new one." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>IP address</th>
                  <th>Location</th>
                  <th>Signed in</th>
                  <th>Last active</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.device} {s.current && <Badge tone="success">This device</Badge>}
                    </td>
                    <td>{s.ip ?? '—'}</td>
                    <td>{s.location ?? '—'}</td>
                    <td>{new Date(s.startedAt).toLocaleString()}</td>
                    <td>{new Date(s.lastActiveAt).toLocaleString()}</td>
                    <td>{new Date(s.expiresAt).toLocaleString()}</td>
                    <td>
                      <Button variant="danger" onClick={() => setConfirmTarget(s)}>
                        {s.current ? 'Sign out' : 'Revoke'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <ConfirmModal
        isOpen={confirmTarget !== null}
        isPending={pending}
        title={confirmTarget === 'others' ? 'Sign out all other sessions?' : confirmTarget?.current ? 'Sign out of this device?' : 'Revoke this session?'}
        message={
          confirmTarget === 'others'
            ? 'Every browser and device except this one will be signed out immediately.'
            : confirmTarget?.current
              ? 'This is the browser you are using. You will be signed out right away and taken to the login page.'
              : `${confirmTarget?.device ?? 'That device'} will be signed out immediately.`
        }
        confirmLabel={confirmTarget === 'others' ? 'Sign out others' : confirmTarget?.current ? 'Sign out' : 'Revoke session'}
        onConfirm={confirmRevoke}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}

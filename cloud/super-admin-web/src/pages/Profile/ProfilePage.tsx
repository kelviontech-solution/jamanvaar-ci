import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Session } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, Card, EmptyState } from '../../components/ui';
import '../../components/shared.css';

export function ProfilePage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function loadSessions() {
    api
      .get<Session[]>('/api/v1/platform/sessions')
      .then(setSessions)
      .catch(() => setSessions([]));
  }

  useEffect(loadSessions, []);

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

  async function revokeSession(id: string) {
    await api.delete(`/api/v1/platform/sessions/${id}`);
    loadSessions();
  }

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
          <div className="detail-card-title">Active sessions</div>
          {sessions === null ? (
            <p className="muted">Loading…</p>
          ) : sessions.length === 0 ? (
            <EmptyState title="No active sessions" description="Log in again to start a new one." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                    <td>{new Date(s.expiresAt).toLocaleString()}</td>
                    <td>
                      <Button variant="danger" onClick={() => revokeSession(s.id)}>
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

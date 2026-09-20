import { copyText } from '@jamanvaar/utils';
import React, { useEffect, useState } from 'react';
import {
  isCloudConnected,
  isCloudLoggedIn,
  fetchCloudLogins,
  createCloudLogin,
  setCloudLoginStatus,
  CloudApiError,
  type CloudTenantUser
} from '../../cloud/cloudClient';
import { KeyRound, Plus, Copy, CheckCircle2, UserRound, Ban } from 'lucide-react';

function randomPassword(): string {
  return 'Jaman@' + Math.floor(1000 + Math.random() * 9000);
}

/**
 * Owner-only self-service login issuance for other apps/devices (Captain, a
 * 2nd POS terminal, etc.) — a plain id + password the owner hands over
 * directly, not an activation code. Every login created here also shows up
 * in Super Admin's Owner & Users tab (same cloud/api User table).
 */
export const CloudDeviceLoginsPanel: React.FC = () => {
  const [connected] = useState(isCloudConnected());
  const [loggedIn, setLoggedIn] = useState(isCloudLoggedIn());
  const [users, setUsers] = useState<CloudTenantUser[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'STAFF'>('STAFF');
  const [password, setPassword] = useState(randomPassword());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await fetchCloudLogins();
      setUsers(list);
      setLoadError('');
      setLoggedIn(true);
    } catch (err) {
      if (err instanceof CloudApiError && err.status === 401) {
        setLoggedIn(false);
      } else {
        setLoadError(err instanceof CloudApiError ? err.message : 'Could not load logins');
      }
    }
  }

  useEffect(() => {
    if (connected && loggedIn) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, loggedIn]);

  if (!connected) return null;

  if (!loggedIn) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-jaman-border shadow-2xs">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-jaman-saffron" />
          <h3 className="text-sm font-bold text-jaman-navy">Device &amp; Staff Logins</h3>
        </div>
        <p className="text-[11px] text-slate-500">Sign in to JAMANVAAR Cloud above to manage logins for Captain and other apps.</p>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await createCloudLogin({ email: email.trim(), fullName: fullName.trim(), role, password });
      setJustCreated({ email: email.trim(), password });
      setFullName('');
      setEmail('');
      setRole('STAFF');
      setPassword(randomPassword());
      setFormOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof CloudApiError ? err.message : 'Could not create login');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus(user: CloudTenantUser) {
    const next = user.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    try {
      await setCloudLoginStatus(user.id, next);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof CloudApiError ? err.message : 'Could not update login');
    }
  }

  async function copy(text: string, field: string) {
    if (!(await copyText(text))) return;
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  return (
    <div className="bg-white rounded-3xl p-5 border border-jaman-border shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-jaman-saffron" />
          <h3 className="text-sm font-bold text-jaman-navy">Device &amp; Staff Logins</h3>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="px-3.5 py-2 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Generate Login</span>
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Create an id + password for the Captain app or another POS terminal — no activation code needed, just this
        login. Visible to Super Admin under this restaurant's Owner &amp; Users tab too.
      </p>

      {justCreated && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-emerald-800 font-black text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Login created — copy these now, the password isn't shown again</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500">Email:</span>
            <span className="font-bold text-jaman-navy">{justCreated.email}</span>
            <button type="button" onClick={() => copy(justCreated.email, 'email')} className="text-slate-400 hover:text-jaman-navy cursor-pointer">
              {copiedField === 'email' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500">Password:</span>
            <span className="font-bold text-jaman-navy">{justCreated.password}</span>
            <button type="button" onClick={() => copy(justCreated.password, 'password')} className="text-slate-400 hover:text-jaman-navy cursor-pointer">
              {copiedField === 'password' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button type="button" onClick={() => setJustCreated(null)} className="text-[10px] font-bold text-emerald-700 underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleCreate} className="p-3.5 bg-jaman-cream border border-jaman-border rounded-2xl space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Full Name / Device Label *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Captain Tablet 1"
                required
                className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Login Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="captain1@yourrestaurant.com"
                required
                className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'MANAGER' | 'STAFF')}
                className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-semibold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              >
                <option value="STAFF">Staff (Captain, waiter, cashier)</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Password</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-mono font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
                <button
                  type="button"
                  onClick={() => setPassword(randomPassword())}
                  className="text-[10px] font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer shrink-0"
                >
                  Regenerate
                </button>
              </div>
            </div>
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-jaman-navy cursor-pointer">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] disabled:opacity-40 text-white font-bold text-xs cursor-pointer"
            >
              {busy ? 'Creating…' : 'Create Login'}
            </button>
          </div>
        </form>
      )}

      {loadError && <div className="form-error">{loadError}</div>}

      {users && (
        <div className="divide-y divide-slate-100 border border-jaman-border rounded-2xl overflow-hidden">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-3.5 py-2.5 bg-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center shrink-0">
                  <UserRound className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-jaman-navy truncate">{u.fullName}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">{u.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{u.role}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {u.status}
                </span>
                {u.role !== 'OWNER' && (
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(u)}
                    title={u.status === 'DISABLED' ? 'Re-enable this login' : 'Disable this login'}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

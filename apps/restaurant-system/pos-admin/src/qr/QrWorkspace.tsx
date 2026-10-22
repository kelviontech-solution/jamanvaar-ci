import { requestQrLeave } from '../components/qrconsole/useQrUnsavedChanges';
import { configureRestaurantTimezone } from '@jamanvaar/utils';
import { useEffect, useState } from 'react';
import { QrConsole } from '../components/qrconsole/QrConsole';
import { QrAdminApi, type QrBranch } from '../cloud/qrAdminClient';
import { cloudQrAccount, qrApi, cloudLoginOwner, cloudLogin, cloudActivateDevice, cloudLogout, type CloudAuthResult } from '../cloud/cloudClient';
import { saveAdminBranch, storedAdminBranch } from '../adminBranchScope';

import { OwnerPasswordRecovery } from '../components/auth/OwnerPasswordRecovery';
import { safeQrDestination, qrWorkspaceBranch } from './qrRoutes';
const logo = '/qr/assets/branding/jamanvaar-logo.png';
export default function QrWorkspace({ page, toast }: { page: string; toast: (s: string) => void }) {
  if (page === 'RECOVER')
    return (
      <main className="qr-auth">
        <aside>
          <span className="qr-eyebrow">ACCOUNT RECOVERY</span>
          <h1>A fresh start.</h1>
          <p>Verify your email code first, then choose a new password for your restaurant account.</p>
          <div className="qr-auth-photo">
            <img src="/qr/assets/qr-experience/dining.webp" alt="A restaurant dining table" width="1200" height="800" />
          </div>
        </aside>
        <div className="qr-auth-card">
          <img className="qr-auth-logo" src={logo} alt="Jamanvaar" />
          <OwnerPasswordRecovery onDone={() => location.assign('/qr/login/')} onActivate={() => location.assign('/qr/activate/')} />
          <div className="qr-auth-links">
            <a href="/qr/login/">Back to login</a>
            <a href="/qr/">Return to product website</a>
          </div>
        </div>
      </main>
    );
  return page === 'ADMIN' ? <Dashboard toast={toast} /> : <AuthPage activate={page === 'ACTIVATE'} toast={toast} />;
}
function AuthPage({ activate, toast }: { activate: boolean; toast: (s: string) => void }) {
  const [id, setId] = useState(''),
    [password, setPassword] = useState(''),
    [show, setShow] = useState(false),
    [key, setKey] = useState(''),
    [session, setSession] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const finish = async (r: Extract<CloudAuthResult, { requiresActivation: false }> | Awaited<ReturnType<typeof cloudActivateDevice>>) => {
    setPassword('');
    setKey('');
    setSession('');
    sessionStorage.setItem('qr_admin_welcome', 'Signed in to QR Admin. Check your setup before accepting guests.');
    toast('Signed in to QR Admin');
    location.assign(safeQrDestination(new URLSearchParams(location.search).get('next')));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (session) {
        await finish(await cloudActivateDevice(session, key.trim()));
        return;
      }
      const r = id.includes('@') ? await cloudLogin(id.trim(), password) : await cloudLoginOwner(id.trim(), password);
      setPassword('');
      if (r.requiresActivation) {
        setSession(r.activationSessionToken);
        if (key.trim()) await finish(await cloudActivateDevice(r.activationSessionToken, key.trim()));
      } else await finish(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="qr-auth">
      <aside>
        <span className="qr-eyebrow">YOUR RESTAURANT, IN YOUR HANDS</span>
        <h1>Good service starts here.</h1>
        <p>Manage the menu, QR codes, guest orders and payments from your restaurant's own workspace.</p>
        <a href="/qr/#demo">Explore the interactive demo →</a>
        <div className="qr-auth-photo">
          <img src="/qr/assets/qr-experience/dining.webp" alt="A warm restaurant table with a Gujarati meal" width="1200" height="800" />
          <span>Your hospitality. A simpler way to order.</span>
        </div>
      </aside>
      <form onSubmit={submit}>
        <img className="qr-auth-logo" src={logo} alt="Jamanvaar" />
        <h2>{session ? 'Connect QR Admin' : activate ? 'Activate QR Ordering' : 'Welcome to QR Admin'}</h2>
        <p>
          {session
            ? 'Use the management activation key supplied by your platform administrator.'
            : 'Sign in with your existing Restaurant ID and owner password, or your manager email and password.'}
        </p>
        {!session && (
          <label>
            Restaurant ID or manager email
            <input required autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} maxLength={254} />
          </label>
        )}
        {!session && (
          <label>
            Password
            <div className="qr-password">
              <input
                aria-label="Password"
                required
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
        )}
        {(activate || session) && (
          <label>
            Management activation key
            <input
              required={!!session}
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              maxLength={80}
              placeholder="JMV-XXXX-XXXX-XXXX"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="qr-error">
            {error}
          </p>
        )}
        <button className="qr-btn" disabled={busy}>
          {busy ? 'Please wait…' : session ? 'Connect & continue' : activate ? 'Sign in & activate' : 'Sign in'}
        </button>
        {session && (
          <button
            className="qr-text-btn"
            type="button"
            onClick={() => {
              setSession('');
              setKey('');
            }}
          >
            Use a different account
          </button>
        )}
        <div className="qr-auth-links">
          {/* Each auth page used to link to itself alongside the other two -- "Forgot
              password?" showing up on the Forgot Password page reads as broken, not helpful. */}
          {!activate ? null : <a href="/qr/login/">Login</a>}
          {activate ? null : <a href="/qr/activate/">Activate QR Ordering</a>}
          {<a href="/qr/recover/">Forgot password?</a>}
          <a href="/qr/">Return to product website</a>
        </div>
        <p className="qr-fine">
          Activation connects this console to an existing licensed restaurant. Your platform administrator handles license assignment and device reassignment.
          Signing in does not buy or enable a product.
        </p>
      </form>
    </main>
  );
}
function Dashboard({ toast }: { toast: (s: string) => void }) {
  const [branches, setBranches] = useState<QrBranch[]>([]),
    [accountName, setAccountName] = useState(""),
    [allBranches, setAllBranches] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const welcome = sessionStorage.getItem("qr_admin_welcome");
    if (welcome) {
      toast(welcome);
      sessionStorage.removeItem("qr_admin_welcome");
    }
    let active = true;
    cloudQrAccount()
      .then(async (account) => {
        if (active) setAccountName(account.fullName);
        if (active) setAllBranches(account.role === "OWNER");
        if (!["OWNER", "MANAGER"].includes(account.role))
          throw new Error("Owner or manager access is required");
        const r = await qrApi<QrBranch[]>("/api/v1/restaurant/qr/branches", {headers:{'x-admin-branch':account.role === 'OWNER' ? 'all' : account.branchId ?? ''}});
        if (!active) return null;
        setBranches(r.filter(branch => branch.status === 'ACTIVE' && (account.role === 'OWNER' || branch.id === account.branchId)));
        const current = storedAdminBranch();
        const requested = new URLSearchParams(location.search).get('branchId');
        const needed = qrWorkspaceBranch(account.role, account.branchId, current, r, requested);
        if (requested) {
          const clean = new URL(location.href); clean.searchParams.delete('branchId'); history.replaceState(null, '', clean);
        }
        if (current !== needed) {
          saveAdminBranch(needed);
          location.reload();
          return null;
        }
        return r.filter(branch => branch.status === 'ACTIVE' && (account.role === 'OWNER' || branch.id === account.branchId));
      })
      .then((r) => {
        if (active && r) {
          setBranches(r);
          const timezone = r.find(b => b.id === storedAdminBranch())?.timezone || r[0]?.restaurantTimezone;
          if (timezone) configureRestaurantTimezone(() => timezone);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!active) return;
        // Raw server strings like "Missing bearer token" / "Invalid or expired token" leaked
        // straight through here -- a restaurant owner reading "Missing bearer token" has no way
        // to know that just means "you're not signed in", and the page's own "Sign in again"
        // link right below it made the technical phrase read like a second, separate problem.
        const message = String(e?.message ?? '');
        if (/bearer token|invalid or expired token|session.*(expired|revoked)/i.test(message)) {
          setError("You're not signed in. Sign in to continue.");
        } else {
          setError(message);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <header className="qr-admin-header">
        <a className="qr-identity" href="/qr/">
          <img src={logo} alt="Jamanvaar" />
          <span>QR ADMIN</span>
        </a>
        <div className="qr-header-context">
          <strong>Your restaurant workspace</strong>
          <small>{accountName || "QR Ordering management"}</small>
        </div>
        <label>
          Branch
          <select
            aria-label="QR Admin branch"
            value={storedAdminBranch() ?? branches[0]?.id ?? ""}
            onChange={async (e) => {
              const branch=e.target.value;if(!(await requestQrLeave()))return;
              const clean=new URL(location.href);clean.searchParams.delete('branchId');clean.searchParams.delete('setupBranch');clean.searchParams.delete('order');history.replaceState(null,'',clean);
              saveAdminBranch(branch);
              location.reload();
            }}
          >
            {allBranches && <option value="all">All restaurant</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="qr-btn secondary"
          onClick={() =>
            void cloudLogout().finally(() => location.assign("/qr/login/"))
          }
        >
          Sign out
        </button>
      </header>
      <main className="qr-admin-content">
        {error ? (
          <div className="qr-admin-empty-state" role="alert">
            <div>
              <h1>Sign in to manage QR Ordering</h1>
              <p>{error}</p>
              {new URLSearchParams(location.search).has('branchId') && <button className="qr-btn secondary" onClick={() => {
                const clean=new URL(location.href);clean.searchParams.delete('branchId');location.assign(clean.toString());
              }}>Open my current workspace</button>}
              <a className="qr-btn" href={'/qr/login/?next=' + encodeURIComponent(safeQrDestination(location.pathname + location.search))}>
                Sign in
              </a>
              <p className="qr-admin-empty-note">
                Access and reassignment are controlled by your platform
                administrator.
              </p>
            </div>
          </div>
        ) : ready ? (
          <QrConsole
            layout="workspace"
            onViewPlan={() =>
              toast(
                "Your platform administrator manages QR licenses and optional features.",
              )
            }
            showToast={toast}
          />
        ) : (
          <p>Checking your current access…</p>
        )}
      </main>
    </>
  );
}

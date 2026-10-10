import { useEffect, useState } from "react";
import { QrConsole } from "../components/qrconsole/QrConsole";
import { QrAdminApi, type QrBranch } from "../cloud/qrAdminClient";
import {
  cloudQrAccount,
  qrApi,
  cloudLoginOwner,
  cloudLogin,
  cloudActivateDevice,
  cloudLogout,
  cloudRequestPasswordResetOwner,
  cloudResetPasswordOwner,
  type CloudAuthResult,
} from "../cloud/cloudClient";
import { saveAdminBranch, storedAdminBranch } from "../adminBranchScope";

import { safeQrDestination } from "./qrRoutes";
const logo = "/qr/assets/branding/jamanvaar-logo.png";
export default function QrWorkspace({
  page,
  toast,
}: {
  page: string;
  toast: (s: string) => void;
}) {
  return page === "ADMIN" ? (
    <Dashboard toast={toast} />
  ) : (
    <AuthPage
      activate={page === "ACTIVATE"}
      recover={page === "RECOVER"}
      toast={toast}
    />
  );
}
function AuthPage({
  activate,
  recover,
  toast,
}: {
  activate: boolean;
  recover: boolean;
  toast: (s: string) => void;
}) {
  const [id, setId] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [key, setKey] = useState(""),
    [session, setSession] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false);
  const finish = async (
    r:
      | Extract<CloudAuthResult, { requiresActivation: false }>
      | Awaited<ReturnType<typeof cloudActivateDevice>>,
  ) => {
    setPassword("");
    setKey("");
    setSession("");
    sessionStorage.setItem(
      "qr_admin_welcome",
      "Signed in to QR Admin. Check your setup before accepting guests.",
    );
    toast("Signed in to QR Admin");
    location.assign(
      safeQrDestination(new URLSearchParams(location.search).get("next")),
    );
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (recover) {
        if (!sent) {
          await cloudRequestPasswordResetOwner(id.trim());
          setSent(true);
          toast("Check your registered email for the recovery code.");
        } else {
          await cloudResetPasswordOwner(id.trim(), otp, password);
          setPassword("");
          toast("Password changed. You can sign in now.");
          location.assign("/qr/login/");
        }
        return;
      }
      if (session) {
        await finish(await cloudActivateDevice(session, key.trim()));
        return;
      }
      const r = id.includes("@")
        ? await cloudLogin(id.trim(), password)
        : await cloudLoginOwner(id.trim(), password);
      setPassword("");
      if (r.requiresActivation) {
        setSession(r.activationSessionToken);
        if (key.trim())
          await finish(
            await cloudActivateDevice(r.activationSessionToken, key.trim()),
          );
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
        <h1>{recover ? "A fresh start." : "Good service starts here."}</h1>
        <p>
          Manage the menu, QR codes, guest orders and payments from your
          restaurant's own workspace.
        </p>
        <a href="/qr/#demo">Explore the interactive demo →</a>
      </aside>
      <form onSubmit={submit}>
        <img className="qr-auth-logo" src={logo} alt="Jamanvaar" />
        <h2>
          {recover
            ? "Recover your account"
            : session
              ? "Connect QR Admin"
              : activate
                ? "Activate QR Ordering"
                : "Welcome to QR Admin"}
        </h2>
        <p>
          {recover
            ? "Use your Restaurant ID and the recovery code sent to your registered email."
            : session
              ? "Use the management activation key supplied by your platform administrator."
              : "Sign in with your existing Restaurant ID and owner password, or your manager email and password."}
        </p>
        {!session && (
          <label>
            {recover ? "Restaurant ID" : "Restaurant ID or manager email"}
            <input
              required
              autoComplete="username"
              value={id}
              onChange={(e) => setId(e.target.value)}
              maxLength={254}
            />
          </label>
        )}
        {(!recover || sent) && !session && (
          <label>
            {recover ? "New password" : "Password"}
            <div className="qr-password">
              <input
                aria-label={recover ? "New password" : "Password"}
                required
                type={show ? "text" : "password"}
                autoComplete={recover ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>
        )}
        {recover && sent && (
          <label>
            6-digit recovery code
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        )}
        {!recover && (activate || session) && (
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
          {busy
            ? "Please wait…"
            : recover
              ? sent
                ? "Reset password"
                : "Send recovery code"
              : session
                ? "Connect & continue"
                : activate
                  ? "Sign in & activate"
                  : "Sign in"}
        </button>
        {session && (
          <button
            className="qr-text-btn"
            type="button"
            onClick={() => {
              setSession("");
              setKey("");
            }}
          >
            Use a different account
          </button>
        )}
        <div className="qr-auth-links">
          <a href="/qr/login/">Login</a>
          <a href="/qr/activate/">Activate QR Ordering</a>
          <a href="/qr/recover/">Forgot password?</a>
          <a href="/qr/">Return to product website</a>
        </div>
        <p className="qr-fine">
          Activation connects this console to an existing licensed restaurant.
          Your platform administrator handles license assignment and device
          reassignment. Signing in does not buy or enable a product.
        </p>
      </form>
    </main>
  );
}
function Dashboard({ toast }: { toast: (s: string) => void }) {
  const [branches, setBranches] = useState<QrBranch[]>([]),
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
        if (active) setAllBranches(account.role === "OWNER");
        if (!["OWNER", "MANAGER"].includes(account.role))
          throw new Error("Owner or manager access is required");
        const current = storedAdminBranch(),
          needed =
            account.role === "OWNER" ? (current ?? "all") : account.branchId;
        if (!needed) throw new Error("A manager must be assigned a branch");
        if (current !== needed) {
          saveAdminBranch(needed);
          location.reload();
          return [];
        }
        return account.role === "OWNER"
          ? qrApi<QrBranch[]>("/api/v1/restaurant/qr/branches", {
              headers: { "x-admin-branch": "all" },
            })
          : QrAdminApi.branches();
      })
      .then((r) => {
        if (active) {
          setBranches(r);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
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
        <label>
          Branch
          <select
            aria-label="QR Admin branch"
            value={storedAdminBranch() ?? branches[0]?.id ?? ""}
            onChange={(e) => {
              saveAdminBranch(e.target.value);
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
          <div className="qr-error" role="alert">
            <h1>Sign in to manage QR Ordering</h1>
            <p>{error}</p>
            <a href="/qr/login/">Sign in again</a>
            <p>
              Access and reassignment are controlled by your platform
              administrator.
            </p>
          </div>
        ) : ready ? (
          <QrConsole
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

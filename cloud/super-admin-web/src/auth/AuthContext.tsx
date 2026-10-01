import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken, onSessionEnded } from '../api/client';
import { hasAccess, type AccessLevel, type Area, type Permissions } from './access';

export type PlatformRole =
  | 'PLATFORM_OWNER'
  | 'SUPER_ADMIN'
  | 'PLATFORM_OPS'
  | 'SUPPORT_ADMIN'
  | 'FINANCE_ADMIN'
  | 'READ_ONLY';

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string;
  role?: PlatformRole;
  status: 'ACTIVE' | 'DISABLED';
  /** area -> read | write, sent by the API for this user's role */
  permissions?: Permissions;
}

export interface OtpChallenge {
  otpToken: string;
  maskedEmail: string;
  expiresInSeconds: number;
}

interface AuthContextValue {
  user: PlatformUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  hasPermission: (requiredRole: PlatformRole) => boolean;
  /** Can the signed-in user open (read) or change (write) this area? */
  can: (area: Area | null, level?: AccessLevel) => boolean;
  /** Step 1: email + password. Does not sign in — emails a 6-digit code and returns the challenge to hand to verifyOtp/resendOtp. */
  requestLogin: (email: string, password: string) => Promise<OtpChallenge>;
  /** Step 2: the code from that email. Only this call actually starts a session. */
  verifyOtp: (otpToken: string, otp: string) => Promise<void>;
  resendOtp: (otpToken: string) => Promise<{ maskedEmail: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');

  // On load, there's no access token in memory yet — try the refresh cookie
  // (set httpOnly by the API) to silently resume a session across a page reload.
  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<PlatformUser>('/api/v1/platform/me');
        setUser(me);
        setStatus('authenticated');
      } catch {
        setStatus('unauthenticated');
      }
    })();
  }, []);

  const requestLogin = useCallback(async (email: string, password: string) => {
    return api.post<OtpChallenge>('/api/v1/platform-auth/login', { email, password });
  }, []);

  const verifyOtp = useCallback(async (otpToken: string, otp: string) => {
    const result = await api.post<{ accessToken: string; user: PlatformUser }>(
      '/api/v1/platform-auth/verify-otp',
      { otpToken, otp }
    );
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const resendOtp = useCallback(async (otpToken: string) => {
    return api.post<{ maskedEmail: string }>('/api/v1/platform-auth/resend-otp', { otpToken });
  }, []);

  // A revoked or expired session must land on the login screen, not leave a page full of errors.
  useEffect(() => {
    onSessionEnded(() => {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    });
    return () => onSessionEnded(null);
  }, []);

  // B2-052 item 4: a role change made by the owner didn't reach an already-open session —
  // the menu and permissions only updated on a manual reload, so a just-demoted user kept a
  // full menu of things the server had already started refusing. Re-fetch the signed-in
  // user's own record (role + permissions) periodically and whenever the tab regains focus,
  // so a role change (or a disable, which the existing onSessionEnded 401 handling above
  // already covers) reaches this session within a minute instead of never.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    const revalidate = () => {
      api
        .get<PlatformUser>('/api/v1/platform/me')
        .then((me) => {
          if (!cancelled) setUser(me);
        })
        .catch(() => {
          // A failure here (network blip, mid-flight 401) is handled by onSessionEnded or
          // the next successful poll — never clobber a good user with a transient error.
        });
    };
    const intervalId = setInterval(revalidate, 45_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') revalidate();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', revalidate);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', revalidate);
    };
  }, [status]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/platform-auth/logout');
    } catch {
      // The session may already be gone (revoked); signing out locally is what matters.
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const hasPermission = useCallback((requiredRole: PlatformRole) => {
    if (!user) return false;
    const current = user.role ?? 'SUPER_ADMIN';
    if (current === 'PLATFORM_OWNER' || current === 'SUPER_ADMIN') return true;
    return current === requiredRole;
  }, [user]);

  const can = useCallback(
    (area: Area | null, level: AccessLevel = 'read') => hasAccess(user?.permissions, area, level),
    [user]
  );

  return <AuthContext.Provider value={{ user, status, hasPermission, can, requestLogin, verifyOtp, resendOtp, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

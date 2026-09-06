import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '../api/client';

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
}

interface AuthContextValue {
  user: PlatformUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  hasPermission: (requiredRole: PlatformRole) => boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ accessToken: string; user: PlatformUser }>(
      '/api/v1/platform-auth/login',
      { email, password }
    );
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/platform-auth/logout');
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

  return <AuthContext.Provider value={{ user, status, hasPermission, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, tokens } from './api';
import type { SessionUser } from '@acoyaradas/shared';

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
  }) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

const USER_KEY = 'aco.user';

function readStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readStoredUser);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((next: SessionUser | null) => {
    setUser(next);
    if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const refresh = useCallback(async () => {
    if (!tokens.access) {
      persist(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ user: SessionUser | null }>('/auth/me');
      persist(res.user ?? null);
    } catch {
      persist(null);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{
        access_token: string;
        refresh_token: string;
        user: SessionUser;
      }>('/auth/login', { email, password }, { auth: false });
      tokens.setAccess(res.access_token);
      tokens.setRefresh(res.refresh_token);
      persist(res.user);
      // Fusiona el carrito de invitado con la cuenta recién iniciada.
      try {
        await api.post('/cart/merge', { guest_token: tokens.guest });
      } catch {
        /* la fusión del carrito es opcional */
      }
      return res.user;
    },
    [persist],
  );

  const register = useCallback(
    async (input: { email: string; password: string; full_name: string; phone?: string }) => {
      const res = await api.post<{
        access_token: string;
        refresh_token: string;
        user: SessionUser;
      }>('/auth/register', input, { auth: false });
      tokens.setAccess(res.access_token);
      tokens.setRefresh(res.refresh_token);
      persist(res.user);
      try {
        await api.post('/cart/merge', { guest_token: tokens.guest });
      } catch {
        /* opcional */
      }
      return res.user;
    },
    [persist],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh;
    tokens.clear();
    persist(null);
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refresh_token: refreshToken }, { auth: false });
      } catch {
        /* el token puede haber expirado: no es un error para el usuario */
      }
    }
  }, [persist]);

  const value = useMemo<SessionState>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>');
  return ctx;
}

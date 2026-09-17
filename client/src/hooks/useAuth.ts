import { useState, useEffect } from 'react';

export interface ConnectedAccount {
  id: number;
  provider: string;
  externalUserId: string;
  nickname?: string;
}

interface User {
  userId: number;
  nickname: string;
  email?: string;
  emailVerified?: boolean;
  blocked?: boolean;
  accounts?: ConnectedAccount[];
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  /** Start an OAuth flow for a provider (login or connect when logged in). */
  const startOAuth = async (provider: string, returnTo?: string) => {
    const qs = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
    const res = await fetch(`/api/auth/oauth/${provider}/start${qs}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (data.authUrl) {
      window.location.href = data.authUrl;
    } else {
      // Surface the real server error (e.g. rate limit) instead of a generic alert.
      throw new Error(data.message || data.error || 'Erro ao iniciar autenticação');
    }
  };

  /** Login with Mercado Livre — kept for the main CTA. */
  const login = async () => {
    try {
      await startOAuth('mercadolivre');
    } catch (err) {
      alert(err instanceof Error && err.message
        ? err.message
        : 'Erro ao conectar com o servidor. Verifique se o backend está rodando.');
    }
  };

  const loginWithEmail = async (email: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return data.message || 'E-mail ou senha incorretos';
    }
    setUser(data.user);
    return null;
  };

  const register = async (email: string, password: string, nickname?: string): Promise<string | null> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, nickname })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return data.message || 'Erro ao criar conta';
    }
    setUser(data.user);
    return null;
  };

  /** Connect an additional marketplace account (requires session). */
  const connectAccount = async (provider: string, returnTo?: string) => {
    await startOAuth(provider, returnTo);
  };

  const disconnectAccount = async (accountId: number): Promise<boolean> => {
    const res = await fetch(`/api/auth/accounts/${accountId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (res.ok) {
      await checkAuth();
      return true;
    }
    return false;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    setUser(null);
    window.location.href = '/login';
  };

  return { user, loading, login, loginWithEmail, register, connectAccount, disconnectAccount, logout, checkAuth };
}

import { useState, useEffect } from 'react';

interface User {
  userId: number;
  nickname: string;
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

  const login = async () => {
    try {
      const res = await fetch('/api/auth/login', { credentials: 'include' });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.error) {
        alert('Erro: ' + data.error + '\n\nVerifique se o arquivo .env está configurado.');
      }
    } catch (err) {
      alert('Erro ao conectar com o servidor. Verifique se o backend está rodando.');
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    setUser(null);
    window.location.href = '/login';
  };

  return { user, loading, login, logout, checkAuth };
}

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

interface User {
  username: string;
  role: 'ADMIN' | 'OPERATIONS_MANAGER' | 'WAREHOUSE_MANAGER' | 'PROCUREMENT' | 'SUPERVISOR';
  full_name?: string | null;
  email?: string | null;
}

interface AuthContext {
  user: User | null;
  loading: boolean;
  logout: () => void;
}

const Ctx = createContext<AuthContext>({ user: null, loading: true, logout: () => {} });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(r => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('mintstudio_token');
    document.cookie = 'mint_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'mint_refresh=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/mintauth/auth/login';
  };

  return <Ctx.Provider value={{ user, loading, logout }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);

// Хелперы ролей
export const canAdmin = (role: User['role']) => role === 'ADMIN';
export const canWarehouse = (role: User['role']) =>
  ['ADMIN', 'OPERATIONS_MANAGER', 'WAREHOUSE_MANAGER'].includes(role);
export const canProcurement = (role: User['role']) =>
  ['ADMIN', 'OPERATIONS_MANAGER', 'PROCUREMENT'].includes(role);
export const isSupervisor = (role: User['role']) => role === 'SUPERVISOR';

// Алиасы для совместимости
export const canManageWarehouse = canWarehouse;
export const canManageProcurement = canProcurement;

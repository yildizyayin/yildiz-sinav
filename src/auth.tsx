import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post } from './api';

export type Role = 'SUPER_ADMIN' | 'INSTITUTION_MANAGER' | 'TEACHER' | 'GUIDANCE_TEACHER' | 'STUDENT' | 'PARENT';
export interface CurrentUser {
  id: string;
  institution_id: string | null;
  student_id: string | null;
  role: Role;
  display_name: string;
  email: string | null;
  username: string | null;
}

interface AuthState {
  user: CurrentUser | null;
  institution: { status: string; name: string } | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [institution, setInstitution] = useState<AuthState['institution']>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      const result = await api<any>('/api/auth/me');
      setUser(result.user);
      setInstitution(result.institution ?? null);
    } catch {
      setUser(null);
      setInstitution(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);
  const logout = async () => {
    await post('/api/auth/logout', {});
    setUser(null);
    setInstitution(null);
  };
  const value = useMemo(() => ({ user, institution, loading, refresh, logout }), [user, institution, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}

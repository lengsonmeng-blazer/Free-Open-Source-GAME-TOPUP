import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type CustomerUser } from '../lib/api';

interface AuthContextType {
  user: CustomerUser | null;
  loading: boolean;
  isAuthOpen: boolean;
  authMode: 'login' | 'register';
  authNotice: string | null;
  openAuth: (mode?: 'login' | 'register', notice?: string | null) => void;
  closeAuth: () => void;
  login: (login: string, pass: string) => Promise<CustomerUser>;
  register: (email: string, username: string, pass: string) => Promise<CustomerUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  async function refreshUser() {
    try {
      const res = await api.auth.me();
      setUser(res.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshUser();
  }, []);

  function openAuth(mode: 'login' | 'register' = 'login', notice: string | null = null) {
    setAuthMode(mode);
    setAuthNotice(notice);
    setIsAuthOpen(true);
  }

  function closeAuth() {
    setIsAuthOpen(false);
    setAuthNotice(null);
  }

  async function login(loginStr: string, pass: string) {
    const res = await api.auth.login({ login: loginStr, password: pass });
    setUser(res.user);
    closeAuth();
    return res.user;
  }

  async function register(email: string, username: string, pass: string) {
    const res = await api.auth.register({ email, username, password: pass });
    setUser(res.user);
    closeAuth();
    return res.user;
  }

  async function logout() {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthOpen,
        authMode,
        authNotice,
        openAuth,
        closeAuth,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

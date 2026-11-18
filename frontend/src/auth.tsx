import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, getToken, setToken } from "./api";
import type { User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** `otp` is the authenticator (or recovery) code, for accounts with two-factor on. */
  login: (email: string, password: string, otp?: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** After a settings change: store the user the server sent back, and a new token if any. */
  updateAccount: (user: User | null, token?: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => getToken() !== null);

  // On first load, check whether a saved token is still valid.
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, otp?: string) => {
    const { access_token } = await api.login(email, password, otp);
    setToken(access_token);
    setUser(await api.me());
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await api.register(email, password);
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const updateAccount = useCallback((next: User | null, token?: string) => {
    if (token) setToken(token);
    if (next) setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateAccount }),
    [user, loading, login, register, logout, updateAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

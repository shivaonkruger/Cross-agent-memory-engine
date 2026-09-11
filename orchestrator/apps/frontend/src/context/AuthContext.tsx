import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  clearToken,
  getCurrentUser,
  getToken,
  setToken as persistToken,
  signIn as apiSignIn,
  signUp as apiSignUp,
} from "../api/client";
import type { AuthCredentials, User } from "../types/shared";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signUp: (credentials: AuthCredentials) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (credentials: AuthCredentials) => {
    const result = await apiSignIn(credentials);
    persistToken(result.token);
    setUser(result.user);
  }, []);

  const signUp = useCallback(async (credentials: AuthCredentials) => {
    const result = await apiSignUp(credentials);
    persistToken(result.token);
    setUser(result.user);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

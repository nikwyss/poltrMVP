'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { OAuthSession } from '@atproto/oauth-client-browser';

interface User {
  did: string;
  handle: string;
  displayName: string;
}

interface AuthContextType {
  user: User | null;
  session: OAuthSession | null;
  isAuthenticated: boolean;
  login: (user: User, session: OAuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<OAuthSession | null>(null);

  const login = useCallback((user: User, session: OAuthSession) => {
    setUser(user);
    setSession(session);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

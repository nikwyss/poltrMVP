"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
  did: string;
  handle: string;
  displayName: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Restore user from localStorage for instant hydration
    const cachedUser = localStorage.getItem('poltr_user');

    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch (err) {
        console.error('Failed to parse cached user:', err);
        localStorage.removeItem('poltr_user');
      }
    }

    // Verify session cookie is still valid
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          setUser(null);
          localStorage.removeItem('poltr_user');
        }
      })
      .catch(() => {
        // If session check fails, keep cached user (offline/network error)
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = (user: User) => {
    setUser(user);
    localStorage.setItem('poltr_user', JSON.stringify(user));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('poltr_user');
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, loading }}>
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

export function isAuthenticated(): boolean {
  const storedUser = localStorage.getItem('poltr_user');
  return !!storedUser;
}

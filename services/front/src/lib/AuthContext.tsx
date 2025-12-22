import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getOAuthClient } from './oauthClient';

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
  loading: boolean; // true while attempting session restoration
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Attempt to restore lightweight cached user info first (non-sensitive)
    const cached = localStorage.getItem('poltr_user');
    if (cached) {
      try {
        setUser(JSON.parse(cached));
      } catch {}
    }

    // Attempt token/session restoration via OAuth client
    (async () => {
      try {
        const client = await getOAuthClient();
        // Let the library find any existing session for this origin.
        // Passing origin ensures separation across domains.
        const session = await client.restore(window.location.origin).catch(() => null);
        if (session) {
          // Derive a display handle if not available (library may not expose handle directly)
          const sessAny = session as any;
          let handle = sessAny.handle || session.did;
          let displayName = handle;
          // Store minimal, non-sensitive info (tokens remain managed by the library in IndexedDB)
          const userInfo: User = {
            did: session.did,
            handle,
            displayName,
          };
          setUser(userInfo);
          localStorage.setItem('poltr_user', JSON.stringify(userInfo));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = (user: User) => {
    setUser(user);
    localStorage.setItem('poltr_user', JSON.stringify(user));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('poltr_user');
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

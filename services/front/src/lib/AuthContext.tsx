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
    // Restore user from localStorage on mount
    const cachedUser = localStorage.getItem('poltr_user');
    const sessionToken = localStorage.getItem('session_token');
    
    if (cachedUser && sessionToken) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch (err) {
        console.error('Failed to parse cached user:', err);
        localStorage.removeItem('poltr_user');
        localStorage.removeItem('session_token');
      }
    }
    
    setLoading(false);
  }, []);

  const login = (user: User) => {
    setUser(user);
    localStorage.setItem('poltr_user', JSON.stringify(user));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('poltr_user');
    localStorage.removeItem('session_token');
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
  const sessionToken = localStorage.getItem('session_token');
  return !!(storedUser && sessionToken);
}

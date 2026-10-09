'use client';

import { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { User } from '@/types';
import { useRouter } from 'next/navigation';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (usernameOrToken: string, password?: string, redirectTo?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  const fetchUser = useCallback(async () => {
    setIsLoading(true);
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    setToken(storedToken);

    if (!storedToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userData = await apiFetch<User>('/api/users/me');
      setUser(userData);
    } catch (error) {
      console.warn('Failed to fetch user (token may be expired):', error);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
      }
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (usernameOrToken: string, password?: string, redirectTo: string = '/') => {
    setIsLoading(true);

    try {
      let accessToken = usernameOrToken;

      // If password was supplied, this is a credentials login
      if (password !== undefined) {
        const body = new URLSearchParams();
        body.append('username', usernameOrToken.trim());
        body.append('password', password);

        const response = await fetch('/api/users/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || 'Incorrect email or password.');
        }

        accessToken = data.access_token;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', accessToken);
      }
      setToken(accessToken);

      // Fetch the full authenticated user profile
      const userData = await apiFetch<User>('/api/users/me');
      setUser(userData);
      if (redirectTo) {
        router.push(redirectTo);
      }
    } catch (err) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
    }
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authApi from '../api/auth.js';
import { getToken, setToken, setUnauthorizedHandler } from '../api/client.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [user, setUser] = useState(null);
  // 'loading' while a stored token is being checked, then 'authenticated' or 'anonymous'.
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'anonymous'));

  const signIn = useCallback(({ token, user: signedInUser }) => {
    setToken(token);
    setUser(signedInUser);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear(); // never show one user's cached data to the next
  }, [queryClient]);

  // Restore the session from a stored token.
  useEffect(() => {
    if (!getToken()) return;
    authApi
      .fetchMe()
      .then((me) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => logout());
  }, [logout]);

  // Any 401 on an authenticated request means the token is no longer valid.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      toast.info('Your session has expired. Please log in again.');
    });
  }, [logout, toast]);

  const value = useMemo(
    () => ({
      user,
      status,
      login: async (credentials) => signIn(await authApi.login(credentials)),
      register: async (details) => signIn(await authApi.register(details)),
      logout,
    }),
    [user, status, signIn, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

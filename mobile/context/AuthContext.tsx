import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { api, setApiToken } from '../lib/api';
import { clearStoredToken, getStoredToken, setBiometricPreference, setStoredToken } from '../lib/storage';
import { syncPushTokenToBackend } from '../lib/notifications';
import { User } from '../lib/types';

interface RegisterPayload {
  name: string;
  email: string;
  mobileNumber: string;
  mpin: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  loginWithMpin: (mobileNumber: string, mpin: string, useBiometric?: boolean) => Promise<void>;
  registerWithMpin: (payload: RegisterPayload) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  authenticateBiometric: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  loginWithMpin: async () => {},
  registerWithMpin: async () => {},
  refreshUser: async () => {},
  logout: async () => {},
  authenticateBiometric: async () => false,
});

async function storeSession(nextToken: string) {
  setApiToken(nextToken);
  await setStoredToken(nextToken);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const { data } = await api.get('/api/auth/me');
    if (!data?.success) throw new Error('Unable to refresh user');
    setUser(data.user);
  };

  useEffect(() => {
    getStoredToken().then(async (stored) => {
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        setToken(stored);
        setApiToken(stored);
        await refreshUser();
      } catch {
        await clearStoredToken();
        setApiToken(null);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  const hydrateSession = async (nextToken: string, nextUser?: User) => {
    setToken(nextToken);
    await storeSession(nextToken);
    if (nextUser) setUser(nextUser);
    else await refreshUser();
    try {
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      await syncPushTokenToBackend(platform);
    } catch {}
  };

  const registerWithMpin = async (payload: RegisterPayload) => {
    const { data } = await api.post('/api/auth/register', payload);
    if (!data?.success) throw new Error(data?.message || 'Registration failed');
    await hydrateSession(data.token, data.user);
  };

  const loginWithMpin = async (mobileNumber: string, mpin: string, useBiometric = false) => {
    if (useBiometric) {
      const authenticated = await authenticateBiometric();
      if (!authenticated) throw new Error('Biometric verification was cancelled.');
    }
    const { data } = await api.post('/api/auth/login', { mobileNumber, mpin });
    if (!data?.success) throw new Error(data?.message || 'Login failed');
    await hydrateSession(data.token, data.user);
    await setBiometricPreference(useBiometric);
  };

  const authenticateBiometric = async () => {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hardware || !enrolled) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock StockSage AI',
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use MPIN',
    });
    return result.success;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {}
    await clearStoredToken();
    setApiToken(null);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    token,
    loading,
    loginWithMpin,
    registerWithMpin,
    refreshUser,
    logout,
    authenticateBiometric,
  }), [user, token, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

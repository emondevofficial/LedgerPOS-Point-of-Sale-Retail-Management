import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser, StoreSettingsDTO } from '../../shared/types';
import { apiRequest, setSessionToken } from '../lib/api';

interface AuthContextValue {
  loading: boolean;
  initialized: boolean;
  requiresBootstrapCode: boolean;
  authError: string | null;
  user: AuthUser | null;
  settings: StoreSettingsDTO;
  dbMode: 'mongodb' | 'local';
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (mode: 'light' | 'dark') => void;
  can: (permission: string) => boolean;
  completeSession: (userData: AuthUser, token?: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  logout: () => Promise<void>;
}

const DEFAULT_SETTINGS: StoreSettingsDTO = {
  businessName: 'LedgerPOS Retail',
  logo: '/src/assets/images/store_brand_emblem_1795299495758.jpg',
  address: '',
  phone: '',
  email: '',
  website: '',
  currency: 'USD',
  currencySymbol: '$',
  country: 'United States',
  timezone: 'UTC',
  invoicePrefix: 'INV',
  invoiceFooter: 'Thank you for your business!',
  defaultPaymentMethod: 'Cash',
  enableTax: true,
  defaultTaxRate: 5,
  enableDiscounts: true,
  enableBarcodeScanning: true,
  enableReceiptPrinting: true,
  defaultReceiptSize: '80mm',
  lowStockThreshold: 10,
  themeMode: 'light',
  autoBackupEnabled: true,
  notifyLowStock: true,
  notifyNewSale: true,
  notifyExpiringDays: 30,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(true);
  const [requiresBootstrapCode, setRequiresBootstrapCode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<StoreSettingsDTO>(DEFAULT_SETTINGS);
  const [dbMode, setDbMode] = useState<'mongodb' | 'local'>('local');
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('ledgerpos_theme') : null;
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem('ledgerpos_theme', theme);
  }, [theme]);

  const setTheme = useCallback((mode: 'light' | 'dark') => {
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await apiRequest<StoreSettingsDTO>('/api/settings');
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    } catch {
      // Unauthenticated or minimal fallback
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    try {
      const status = await apiRequest<{
        initialized: boolean;
        requiresBootstrapCode: boolean;
        authenticated: boolean;
        user: AuthUser | null;
        businessName: string;
        dbMode: 'mongodb' | 'local';
      }>('/api/auth/status');

      setAuthError(null);
      setInitialized(status.initialized);
      setRequiresBootstrapCode(status.requiresBootstrapCode);
      setUser(status.user);
      setDbMode(status.dbMode);

      if (status.authenticated) {
        await refreshSettings();
      } else {
        try {
          const pub = await apiRequest<Partial<StoreSettingsDTO>>('/api/settings/public');
          setSettings((prev) => ({ ...prev, ...pub }));
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to connect to the backend authentication service.');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [refreshSettings]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.roleSlug === 'super_admin') return true;
      return user.permissions.includes(permission);
    },
    [user]
  );

  const completeSession = useCallback(
    async (userData: AuthUser, token?: string) => {
      if (token) setSessionToken(token);
      setAuthError(null);
      setInitialized(true);
      setUser(userData);
      setLoading(false);
      await refreshSettings();
    },
    [refreshSettings]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setSessionToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        initialized,
        requiresBootstrapCode,
        authError,
        user,
        settings,
        dbMode,
        theme,
        toggleTheme,
        setTheme,
        can,
        completeSession,
        refreshAuth,
        refreshSettings,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

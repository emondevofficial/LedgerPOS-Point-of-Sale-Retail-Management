import { AlertCircle, Eye, EyeOff, Lock, Moon, RefreshCw, Sun } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button, Input, Select } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

type AuthMode = 'login' | 'forgot' | 'reset';

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'BDT', symbol: '৳', label: 'BDT (৳)' },
  { code: 'INR', symbol: '₹', label: 'INR (₹)' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
];

export function AuthView() {
  const { initialized, requiresBootstrapCode, authError, settings, theme, toggleTheme, completeSession, refreshAuth } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Setup state
  const [setupName, setSetupName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [businessName, setBusinessName] = useState('LedgerPOS Store');
  const [currency, setCurrency] = useState('USD');
  const [bootstrapCode, setBootstrapCode] = useState('');
  const [loadSampleData, setLoadSampleData] = useState(true);

  // Login / Reset state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const currObj = CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0];
      const res = await apiRequest<{ user: any; token?: string }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          name: setupName,
          email: setupEmail,
          password: setupPassword,
          businessName,
          currency: currObj.code,
          currencySymbol: currObj.symbol,
          bootstrapCode: requiresBootstrapCode ? bootstrapCode : undefined,
          loadSampleData,
        }),
      });
      toast.success('Store initialized and Super Admin account created');
      await completeSession(res.user, res.token);
    } catch (err: any) {
      const msg = err.message || 'Setup failed';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: any; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      toast.success('Signed in successfully');
      await completeSession(res.user, res.token);
    } catch (err: any) {
      const msg = err.message || 'Sign in failed';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      toast.success('Reset request processed. Enter your reset token below.');
      setMode('reset');
    } catch (err: any) {
      const msg = err.message || 'Request failed';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      toast.success('Password reset complete. Sign in with your new password.');
      setMode('login');
      setPassword('');
    } catch (err: any) {
      const msg = err.message || 'Reset failed';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <img
            src={settings.logo || '/src/assets/images/store_brand_emblem_1795299495758.jpg'}
            alt="Store emblem"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
          />
          <span className="font-display font-bold text-base tracking-tight whitespace-nowrap">
            {initialized ? settings.businessName : 'LedgerPOS'}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm">
          {authError && (
            <div className="mb-4 rounded-lg border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Connection Error</p>
                  <p className="mt-0.5 text-rose-600 dark:text-rose-300/90">{authError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshAuth()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-200 font-medium hover:bg-rose-50 cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {formError && (
            <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {!initialized ? (
            <form onSubmit={handleSetup} className="space-y-4">
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  First-Run Store Provisioning
                </p>
                <h1 className="text-xl font-bold mt-1 text-slate-900 dark:text-slate-100">
                  Claim Super Admin Account
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Configure your store identity and create the primary administrator credentials. This setup locks automatically once completed.
                </p>
              </div>

              <Input
                label="Business / Store Name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                placeholder="e.g. Summit Retail Co."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Admin Full Name"
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  required
                  placeholder="Alex Mercer"
                />
                <Select
                  label="Base Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>

              <Input
                label="Admin Email Address"
                type="email"
                value={setupEmail}
                onChange={(e) => setSetupEmail(e.target.value)}
                required
                placeholder="admin@yourstore.com"
              />

              <div className="relative">
                <Input
                  label="Admin Password (min 8 chars)"
                  type={showPass ? 'text' : 'password'}
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-2.5 top-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {requiresBootstrapCode && (
                <Input
                  label="Server Bootstrap Code"
                  type="password"
                  value={bootstrapCode}
                  onChange={(e) => setBootstrapCode(e.target.value)}
                  required
                  placeholder="Enter ADMIN_BOOTSTRAP_CODE"
                />
              )}

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={loadSampleData}
                  onChange={(e) => setLoadSampleData(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 block">
                    Load starter catalog & sample transactions
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Seeds 6 products, categories, suppliers, customers, sales, and expenses into your database.
                  </span>
                </span>
              </label>

              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                <Lock className="w-4 h-4" />
                {submitting ? 'Initializing Store...' : 'Initialize Store & Sign In'}
              </Button>
            </form>
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Sign in to {settings.businessName}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter your staff credentials to access POS billing and store operations.
                </p>
              </div>

              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="staff@store.com"
                autoComplete="email"
              />

              <div className="relative">
                <Input
                  label="Password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-2.5 top-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => setMode('reset')}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Have a reset token?
                </button>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reset Password</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Request a password reset token for your staff account.
                </p>
              </div>

              <Input
                label="Account Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="staff@store.com"
              />

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Generating Token...' : 'Request Reset Token'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('login')}>
                Back to Sign In
              </Button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Set New Password</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter the reset token provided by your administrator or server console.
                </p>
              </div>

              <Input
                label="Reset Token"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                required
                placeholder="Paste reset token"
              />
              <Input
                label="New Password (min 8 chars)"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Enter new password"
              />

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Updating Password...' : 'Update Password'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('login')}>
                Back to Sign In
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

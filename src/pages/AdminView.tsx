import {
  CheckCheck,
  Database,
  Download,
  Edit2,
  KeyRound,
  Plus,
  Shield,
  Trash2,
  UserCheck,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PAYMENT_METHODS, PERMISSION_DEFINITIONS } from '../../shared/types';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusText,
  TableSkeleton,
  Textarea,
} from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, cn, formatDateTime } from '../lib/api';

type AdminTab = 'profile' | 'users' | 'roles' | 'settings' | 'notifications' | 'logs';

export function AdminView({ initialTab = 'profile' }: { initialTab?: AdminTab }) {
  const { user, settings, can, refreshAuth, refreshSettings, setTheme } = useAuth();
  const [tab, setTab] = useState<AdminTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Users & Roles
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // User Modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [uForm, setUForm] = useState({ name: '', email: '', password: '', roleId: '', phone: '', isActive: true });
  const [resetPassTarget, setResetPassTarget] = useState<any | null>(null);
  const [resetPassVal, setResetPassVal] = useState('');
  const [deleteUserTarget, setDeleteUserTarget] = useState<any | null>(null);

  // Role Modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [rForm, setRForm] = useState<{ name: string; description: string; permissions: string[] }>({
    name: '',
    description: '',
    permissions: [],
  });

  // Profile & Password
  const [profForm, setProfForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '' });

  // Settings
  const [sForm, setSForm] = useState({ ...settings });
  const [logSearch, setLogSearch] = useState('');

  useEffect(() => {
    setSForm({ ...settings });
  }, [settings]);

  useEffect(() => {
    if (user) setProfForm({ name: user.name, phone: user.phone || '' });
  }, [user]);

  const loadTabData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'users' && can('users:manage')) {
        const [u, r] = await Promise.all([apiRequest<any[]>('/api/users'), apiRequest<any[]>('/api/roles')]);
        setUsers(u);
        setRoles(r);
      } else if (tab === 'roles' && can('users:manage')) {
        const r = await apiRequest<any[]>('/api/roles');
        setRoles(r);
      } else if (tab === 'notifications' && can('notifications:view')) {
        const res = await apiRequest<{ items: any[] }>('/api/notifications');
        setNotifications(res.items || []);
      } else if (tab === 'logs' && can('logs:view')) {
        const res = await apiRequest<{ rows: any[] }>(`/api/activity-logs?search=${encodeURIComponent(logSearch)}&limit=100`);
        setLogs(res.rows || []);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tab, can, logSearch]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const availableTabs: Array<{ id: AdminTab; label: string; show: boolean }> = [
    { id: 'profile', label: 'My Profile', show: true },
    { id: 'notifications', label: 'Notifications', show: can('notifications:view') },
    { id: 'users', label: 'Users', show: can('users:manage') },
    { id: 'roles', label: 'Roles & Permissions', show: can('users:manage') },
    { id: 'settings', label: 'Store & POS Settings', show: can('settings:manage') },
    { id: 'logs', label: 'Activity Logs', show: can('logs:view') },
  ];

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await apiRequest(`/api/users/${editingUser._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: uForm.name,
            email: uForm.email,
            roleId: uForm.roleId,
            phone: uForm.phone,
            isActive: uForm.isActive,
          }),
        });
        toast.success('User updated');
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(uForm),
        });
        toast.success('User created');
      }
      setUserModalOpen(false);
      await loadTabData();
    } catch (err: any) {
      toast.error(err.message || 'Could not save user');
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await apiRequest(`/api/roles/${editingRole._id}`, {
          method: 'PUT',
          body: JSON.stringify(rForm),
        });
        toast.success('Role permissions updated');
      } else {
        await apiRequest('/api/roles', {
          method: 'POST',
          body: JSON.stringify(rForm),
        });
        toast.success('Role created');
      }
      setRoleModalOpen(false);
      await loadTabData();
    } catch (err: any) {
      toast.error(err.message || 'Could not save role');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(sForm),
      });
      setTheme(sForm.themeMode || 'light');
      await refreshSettings();
      toast.success('Store settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    }
  };

  return (
    <div className="space-y-5">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
        {availableTabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                tab === t.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* PROFILE TAB */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiRequest('/api/auth/profile', { method: 'PUT', body: JSON.stringify(profForm) });
                await refreshAuth();
                toast.success('Profile updated');
              } catch (err: any) {
                toast.error(err.message);
              }
            }}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold">Profile Details</h3>
              <p className="text-xs text-slate-500">Role: {user?.roleName} · Email: {user?.email}</p>
            </div>
            <Input label="Full Name" value={profForm.name} onChange={(e) => setProfForm({ ...profForm, name: e.target.value })} required />
            <Input label="Phone Number" value={profForm.phone} onChange={(e) => setProfForm({ ...profForm, phone: e.target.value })} />
            <Button type="submit" size="sm">Update Profile</Button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiRequest('/api/auth/change-password', { method: 'PUT', body: JSON.stringify(passForm) });
                setPassForm({ currentPassword: '', newPassword: '' });
                toast.success('Password changed successfully');
              } catch (err: any) {
                toast.error(err.message);
              }
            }}
            className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold">Change Password</h3>
              <p className="text-xs text-slate-500">Minimum 8 characters required</p>
            </div>
            <Input label="Current Password" type="password" value={passForm.currentPassword} onChange={(e) => setPassForm({ ...passForm, currentPassword: e.target.value })} required />
            <Input label="New Password" type="password" minLength={8} value={passForm.newPassword} onChange={(e) => setPassForm({ ...passForm, newPassword: e.target.value })} required />
            <Button type="submit" size="sm">Update Password</Button>
          </form>
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && can('users:manage') && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Staff Accounts ({users.length})</h3>
            <Button
              size="sm"
              onClick={() => {
                setEditingUser(null);
                setUForm({ name: '', email: '', password: '', roleId: roles[0]?._id || '', phone: '', isActive: true });
                setUserModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Staff User
            </Button>
          </div>
          {loading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 px-4 font-medium">Email</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Last Login</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-semibold">{u.name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{u.email}</td>
                      <td className="py-2.5 px-4">{u.roleName}</td>
                      <td className="py-2.5 px-4"><StatusText status={u.isActive ? 'Active' : 'Inactive'} /></td>
                      <td className="py-2.5 px-4 text-slate-500">{formatDateTime(u.lastLoginAt)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setUForm({
                                name: u.name,
                                email: u.email,
                                password: '',
                                roleId: String(u.roleId),
                                phone: u.phone || '',
                                isActive: u.isActive,
                              });
                              setUserModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                            title="Edit user"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetPassTarget(u);
                              setResetPassVal('');
                            }}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {u._id !== user?._id && u.roleSlug !== 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => setDeleteUserTarget(u)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                              title="Delete user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ROLES TAB */}
      {tab === 'roles' && can('users:manage') && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Roles & Granular Permissions</h3>
            <Button
              size="sm"
              onClick={() => {
                setEditingRole(null);
                setRForm({ name: '', description: '', permissions: ['dashboard:view', 'pos:access'] });
                setRoleModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> New Custom Role
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((r) => (
              <div key={r._id} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-600" /> {r.name}
                    </h4>
                    <span className="text-xs font-mono text-slate-500">{r.permissions?.length || 0} perms</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{r.description}</p>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingRole(r);
                      setRForm({ name: r.name, description: r.description || '', permissions: r.permissions || [] });
                      setRoleModalOpen(true);
                    }}
                  >
                    Configure Permissions
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === 'settings' && can('settings:manage') && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold">Business Profile & Branding</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label="Business Name" value={sForm.businessName} onChange={(e) => setSForm({ ...sForm, businessName: e.target.value })} required />
              <Input label="Phone" value={sForm.phone} onChange={(e) => setSForm({ ...sForm, phone: e.target.value })} />
              <Input label="Email" value={sForm.email} onChange={(e) => setSForm({ ...sForm, email: e.target.value })} />
              <Input label="Website" value={sForm.website} onChange={(e) => setSForm({ ...sForm, website: e.target.value })} />
              <Input label="Currency Code" value={sForm.currency} onChange={(e) => setSForm({ ...sForm, currency: e.target.value })} required />
              <Input label="Currency Symbol" value={sForm.currencySymbol} onChange={(e) => setSForm({ ...sForm, currencySymbol: e.target.value })} required />
              <Input label="Country" value={sForm.country} onChange={(e) => setSForm({ ...sForm, country: e.target.value })} />
              <Input label="Invoice Prefix" value={sForm.invoicePrefix} onChange={(e) => setSForm({ ...sForm, invoicePrefix: e.target.value })} required />
              <Input label="Store Address" value={sForm.address} onChange={(e) => setSForm({ ...sForm, address: e.target.value })} />
            </div>
            <Input label="Invoice Footer Message" value={sForm.invoiceFooter} onChange={(e) => setSForm({ ...sForm, invoiceFooter: e.target.value })} />
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold">POS, Tax & Notification Preferences</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Select label="Default Payment Method" value={sForm.defaultPaymentMethod} onChange={(e) => setSForm({ ...sForm, defaultPaymentMethod: e.target.value as any })}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
              <Select label="Default Receipt Size" value={sForm.defaultReceiptSize} onChange={(e) => setSForm({ ...sForm, defaultReceiptSize: e.target.value as any })}>
                <option value="80mm">80mm Thermal</option>
                <option value="58mm">58mm Thermal</option>
                <option value="a4">A4 Full Invoice</option>
              </Select>
              <Input label="Default Tax Rate (%)" type="number" min={0} max={100} step="0.1" value={sForm.defaultTaxRate} onChange={(e) => setSForm({ ...sForm, defaultTaxRate: Number(e.target.value) })} />
              <Input label="Low-Stock Threshold" type="number" min={0} value={sForm.lowStockThreshold} onChange={(e) => setSForm({ ...sForm, lowStockThreshold: Number(e.target.value) })} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 text-xs">
              {[
                { key: 'enableTax', label: 'Enable Tax / VAT Calculation' },
                { key: 'enableDiscounts', label: 'Enable POS Discounts' },
                { key: 'enableBarcodeScanning', label: 'Enable Barcode Scanner Input' },
                { key: 'enableReceiptPrinting', label: 'Enable Receipt Printing' },
                { key: 'notifyLowStock', label: 'Generate Low-Stock Notifications' },
                { key: 'notifyNewSale', label: 'Generate New Sale Notifications' },
              ].map((opt) => (
                <label key={opt.key} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean((sForm as any)[opt.key])}
                    onChange={(e) => setSForm({ ...sForm, [opt.key]: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const backup = await apiRequest('/api/settings/backup');
                      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ledgerpos-backup-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Full database backup exported');
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> Export JSON Backup
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await apiRequest<{ productsCreated: number; salesCreated?: number }>('/api/settings/seed-sample', { method: 'POST' });
                      toast.success(
                        `Loaded ${res.productsCreated} products${res.salesCreated ? `, ${res.salesCreated} sales` : ''}, categories, brands, suppliers, customers, and expenses`
                      );
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                >
                  <Database className="w-3.5 h-3.5" /> Seed Optional Sample Catalog
                </Button>
              </div>
              <Button type="submit">Save Configuration</Button>
            </div>
          </div>
        </form>
      )}

      {/* NOTIFICATIONS TAB */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Store Notifications ({notifications.length})</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await apiRequest('/api/notifications/read-all', { method: 'PUT' });
                  loadTabData();
                }}
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark All Read
              </Button>
              {can('notifications:manage') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await apiRequest('/api/notifications', { method: 'DELETE' });
                    loadTabData();
                  }}
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
          {notifications.length === 0 ? (
            <EmptyState title="No notifications" description="Alerts for low stock, out-of-stock SKUs, sales, and received POs appear here." />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.map((n) => (
                <div key={n._id} className={cn('p-4 flex items-start justify-between gap-4 text-xs', !n.isRead && 'bg-emerald-50/40 dark:bg-emerald-950/10')}>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</p>
                    <p className="text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await apiRequest(`/api/notifications/${n._id}/read`, { method: 'PUT' });
                        loadTabData();
                      }}
                    >
                      Mark Read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LOGS TAB */}
      {tab === 'logs' && can('logs:view') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Security & Operational Audit Trail</h3>
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filter logs by user or action..."
              className="h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-64"
            />
          </div>
          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : logs.length === 0 ? (
            <EmptyState title="No activity logs" description="Operational and authentication audit events appear here." />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                    <th className="py-3 px-4 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">User</th>
                    <th className="py-3 px-4 font-medium">Module</th>
                    <th className="py-3 px-4 font-medium">Action</th>
                    <th className="py-3 px-4 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {logs.map((l) => (
                    <tr key={l._id}>
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
                      <td className="py-2.5 px-4 font-medium">{l.userName} <span className="text-slate-400">({l.userRole})</span></td>
                      <td className="py-2.5 px-4 capitalize">{l.module}</td>
                      <td className="py-2.5 px-4 font-mono">{l.action}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{l.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* User Create/Edit Modal */}
      <Modal open={userModalOpen} onClose={() => setUserModalOpen(false)} title={editingUser ? 'Edit Staff User' : 'Create Staff User'} maxWidth="max-w-md">
        <form onSubmit={handleSaveUser} className="space-y-4">
          <Input label="Full Name" value={uForm.name} onChange={(e) => setUForm({ ...uForm, name: e.target.value })} required />
          <Input label="Email" type="email" value={uForm.email} onChange={(e) => setUForm({ ...uForm, email: e.target.value })} required />
          {!editingUser && (
            <Input label="Password (min 8 chars)" type="password" minLength={8} value={uForm.password} onChange={(e) => setUForm({ ...uForm, password: e.target.value })} required />
          )}
          <Select label="Role" value={uForm.roleId} onChange={(e) => setUForm({ ...uForm, roleId: e.target.value })} required>
            {roles.map((r) => (
              <option key={r._id} value={r._id}>{r.name}</option>
            ))}
          </Select>
          <Input label="Phone" value={uForm.phone} onChange={(e) => setUForm({ ...uForm, phone: e.target.value })} />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={uForm.isActive} onChange={(e) => setUForm({ ...uForm, isActive: e.target.checked })} />
            <span>Account Active</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setUserModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save User</Button>
          </div>
        </form>
      </Modal>

      {/* Role Modal */}
      <Modal open={roleModalOpen} onClose={() => setRoleModalOpen(false)} title={editingRole ? `Edit Role: ${editingRole.name}` : 'Create Role'} maxWidth="max-w-2xl">
        <form onSubmit={handleSaveRole} className="space-y-4">
          <Input label="Role Name" value={rForm.name} onChange={(e) => setRForm({ ...rForm, name: e.target.value })} disabled={editingRole?.isSystem} required />
          <Textarea label="Description" rows={2} value={rForm.description} onChange={(e) => setRForm({ ...rForm, description: e.target.value })} />
          <div>
            <p className="text-xs font-semibold mb-2">Assigned Permissions ({rForm.permissions.length})</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border border-slate-200 dark:border-slate-800 rounded-lg">
              {PERMISSION_DEFINITIONS.map((p) => {
                const checked = rForm.permissions.includes(p.key);
                return (
                  <label key={p.key} className="flex items-start gap-2 text-xs p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setRForm((prev) => ({
                          ...prev,
                          permissions: e.target.checked
                            ? [...prev.permissions, p.key]
                            : prev.permissions.filter((k) => k !== p.key),
                        }));
                      }}
                    />
                    <span>
                      <span className="font-medium block">{p.label}</span>
                      <span className="text-[11px] text-slate-400">{p.module}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRoleModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Role</Button>
          </div>
        </form>
      </Modal>

      {/* Reset User Password Modal */}
      <Modal open={Boolean(resetPassTarget)} onClose={() => setResetPassTarget(null)} title={`Reset Password — ${resetPassTarget?.name}`} maxWidth="max-w-sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiRequest(`/api/users/${resetPassTarget._id}/reset-password`, {
                method: 'POST',
                body: JSON.stringify({ password: resetPassVal }),
              });
              toast.success('User password updated');
              setResetPassTarget(null);
            } catch (err: any) {
              toast.error(err.message);
            }
          }}
          className="space-y-4"
        >
          <Input label="New Password (min 8 chars)" type="password" minLength={8} value={resetPassVal} onChange={(e) => setResetPassVal(e.target.value)} required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResetPassTarget(null)}>Cancel</Button>
            <Button type="submit"><UserCheck className="w-3.5 h-3.5" /> Reset Password</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteUserTarget)}
        onClose={() => setDeleteUserTarget(null)}
        onConfirm={async () => {
          await apiRequest(`/api/users/${deleteUserTarget._id}`, { method: 'DELETE' });
          toast.success('User deleted');
          setDeleteUserTarget(null);
          await loadTabData();
        }}
        title="Delete Staff User"
        message={`Deactivate and remove "${deleteUserTarget?.name}" (${deleteUserTarget?.email})?`}
        confirmLabel="Delete User"
      />
    </div>
  );
}

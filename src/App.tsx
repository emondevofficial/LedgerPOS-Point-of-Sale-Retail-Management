import {
  BarChart3,
  Bell,
  Boxes,
  Calculator,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiRequest, cn } from './lib/api';
import { AdminView } from './pages/AdminView';
import { AuthView } from './pages/AuthView';
import { CustomersView } from './pages/CustomersView';
import { DashboardView } from './pages/DashboardView';
import { ExpensesView } from './pages/ExpensesView';
import { FinancialView } from './pages/FinancialView';
import { InventoryView } from './pages/InventoryView';
import { PosTerminalView } from './pages/PosTerminalView';
import { ProductsView } from './pages/ProductsView';
import { PurchasesView } from './pages/PurchasesView';
import { ReportsView } from './pages/ReportsView';
import { ReturnsView } from './pages/ReturnsView';
import { SalesView } from './pages/SalesView';
import { SuppliersView } from './pages/SuppliersView';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

function PosShell() {
  const { loading, user, settings, theme, toggleTheme, can, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminSubTab, setAdminSubTab] = useState<'profile' | 'users' | 'roles' | 'settings' | 'notifications' | 'logs'>('profile');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const navItems: NavItem[] = useMemo(
    () => [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
      { id: 'pos', label: 'POS Terminal', icon: ShoppingCart, permission: 'pos:access' },
      { id: 'sales', label: 'Sales & Invoices', icon: Receipt, permission: 'sales:view' },
      { id: 'products', label: 'Products & Catalog', icon: Package, permission: 'products:view' },
      { id: 'inventory', label: 'Inventory & Stock', icon: Boxes, permission: 'inventory:view' },
      { id: 'purchases', label: 'Purchases', icon: ShoppingBag, permission: 'purchases:view' },
      { id: 'returns', label: 'Returns & Refunds', icon: RotateCcw, permission: 'returns:manage' },
      { id: 'customers', label: 'Customers (CRM)', icon: Users, permission: 'customers:view' },
      { id: 'suppliers', label: 'Suppliers', icon: Truck, permission: 'suppliers:view' },
      { id: 'expenses', label: 'Expenses', icon: Calculator, permission: 'expenses:view' },
      { id: 'financial', label: 'Financial Overview', icon: BarChart3, permission: 'financial:view' },
      { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet, permission: 'reports:view' },
      { id: 'admin', label: 'Admin & Settings', icon: Settings },
    ],
    []
  );

  const visibleNav = useMemo(
    () => navItems.filter((n) => !n.permission || can(n.permission)),
    [navItems, can]
  );

  useEffect(() => {
    if (visibleNav.length > 0 && !visibleNav.some((n) => n.id === activeTab)) {
      setActiveTab(visibleNav[0].id);
    }
  }, [visibleNav, activeTab]);

  useEffect(() => {
    if (!user || !can('notifications:view')) return;
    apiRequest<{ unreadCount: number }>('/api/notifications')
      .then((res) => setUnreadNotifications(res.unreadCount || 0))
      .catch(() => {});
  }, [user, can, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading LedgerPOS workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const currentNav = visibleNav.find((n) => n.id === activeTab) || visibleNav[0];

  const navigateTo = (tab: string) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 shrink-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={settings.logo || '/src/assets/images/store_brand_emblem_1795299495758.jpg'}
              alt={settings.businessName}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <span className="font-display font-bold text-sm truncate">{settings.businessName}</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'admin') setAdminSubTab('profile');
                  navigateTo(item.id);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                  active
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{user.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.roleName}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">Workspace</span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentNav?.label || 'Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {can('notifications:view') && (
              <button
                type="button"
                onClick={() => {
                  setAdminSubTab('notifications');
                  setActiveTab('admin');
                }}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-mono flex items-center justify-center">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Toggle Light/Dark theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {can('pos:access') && activeTab !== 'pos' && (
              <button
                type="button"
                onClick={() => navigateTo('pos')}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                New Sale
              </button>
            )}
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {activeTab === 'dashboard' && <DashboardView onNavigate={navigateTo} />}
          {activeTab === 'pos' && <PosTerminalView />}
          {activeTab === 'sales' && <SalesView />}
          {activeTab === 'products' && <ProductsView />}
          {activeTab === 'inventory' && <InventoryView />}
          {activeTab === 'purchases' && <PurchasesView />}
          {activeTab === 'returns' && <ReturnsView />}
          {activeTab === 'customers' && <CustomersView />}
          {activeTab === 'suppliers' && <SuppliersView />}
          {activeTab === 'expenses' && <ExpensesView />}
          {activeTab === 'financial' && <FinancialView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'admin' && <AdminView initialTab={adminSubTab} />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PosShell />
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  );
}

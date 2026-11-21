import { ArrowRight, Database, Plus, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button, EmptyState, StatCard, StatusText, TableSkeleton } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, cn, formatDateTime, formatMoney } from '../lib/api';

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'prev_month', label: 'Previous Month' },
  { key: 'custom', label: 'Custom' },
];

const CHART_COLORS = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#e11d48', '#475569'];

export function DashboardView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { settings, theme, can } = useAuth();
  const sym = settings.currencySymbol || '$';

  const [preset, setPreset] = useState('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [data, setData] = useState<any>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ preset });
      if (preset === 'custom' && startDate) qs.set('start', startDate);
      if (preset === 'custom' && endDate) qs.set('end', endDate);
      const res = await apiRequest(`/api/dashboard?${qs.toString()}`);
      setData(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  }, [preset, startDate, endDate]);

  useEffect(() => {
    if (preset !== 'custom' || (startDate && endDate)) {
      loadDashboard();
    }
  }, [preset, startDate, endDate, loadDashboard]);

  const handleLoadSampleStore = async () => {
    setSeeding(true);
    try {
      const res = await apiRequest<{ productsCreated: number; salesCreated?: number }>('/api/settings/seed-sample', {
        method: 'POST',
      });
      toast.success(
        `Loaded ${res.productsCreated} products${res.salesCreated ? `, ${res.salesCreated} sales` : ''} and starter store records`
      );
      await loadDashboard();
    } catch (err: any) {
      toast.error(err.message || 'Could not load sample store data');
    } finally {
      setSeeding(false);
    }
  };

  const gridStroke = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  const tickColor = theme === 'dark' ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
    borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
    borderRadius: '8px',
    fontSize: '12px',
    color: theme === 'dark' ? '#f8fafc' : '#0f172a',
  };

  return (
    <div className="space-y-6">
      {/* Header & Date Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Business Overview</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live metrics calculated directly from database transactions, inventory movements, and ledgers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                  preset === p.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          )}

          <Button variant="outline" size="sm" onClick={loadDashboard} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          {can('pos:access') && (
            <Button size="sm" onClick={() => onNavigate('pos')}>
              Open POS Terminal <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 11 }).map((_, idx) => (
              <div key={idx} className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
          <TableSkeleton rows={5} cols={5} />
        </div>
      ) : (
        <>
          {data.kpis.totalProducts === 0 && data.kpis.totalOrders === 0 && (
            <div className="p-5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Your store database is ready — no products or transactions yet
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Add your own inventory in Products & Catalog, or load the starter dataset (6 products, categories, suppliers, customers, purchase orders, sales, and expenses) to explore live dashboards and POS billing immediately.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {can('settings:manage') && (
                  <Button size="sm" onClick={handleLoadSampleStore} disabled={seeding}>
                    <Database className="w-3.5 h-3.5" />
                    {seeding ? 'Loading Sample Data...' : 'Load Sample Store Data'}
                  </Button>
                )}
                {can('products:manage') && (
                  <Button variant="outline" size="sm" onClick={() => onNavigate('products')}>
                    <Plus className="w-3.5 h-3.5" /> Add First Product
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <StatCard label="Today's Sales" value={formatMoney(data.kpis.todaySales, sym)} tone="positive" />
            <StatCard label="Total Revenue" value={formatMoney(data.kpis.totalRevenue, sym)} />
            <StatCard
              label="Net Profit"
              value={formatMoney(data.kpis.totalProfit, sym)}
              meta={`Gross: ${formatMoney(data.kpis.grossProfit, sym)}`}
              tone={data.kpis.totalProfit >= 0 ? 'positive' : 'critical'}
            />
            <StatCard label="Total Orders" value={data.kpis.totalOrders} />
            <StatCard
              label="Products"
              value={data.kpis.totalProducts}
              meta={`${data.kpis.lowStockCount} low · ${data.kpis.outOfStockCount} out`}
              tone={data.kpis.outOfStockCount > 0 ? 'warning' : 'neutral'}
            />
            <StatCard
              label="Low-Stock Items"
              value={data.kpis.lowStockCount}
              meta={`${data.kpis.outOfStockCount} out of stock`}
              tone={data.kpis.lowStockCount > 0 ? 'warning' : 'neutral'}
            />
            <StatCard label="Out-of-Stock" value={data.kpis.outOfStockCount} tone={data.kpis.outOfStockCount > 0 ? 'critical' : 'neutral'} />
            <StatCard label="Customers" value={data.kpis.totalCustomers} />
            <StatCard label="Suppliers" value={data.kpis.totalSuppliers} />
            <StatCard label="Today's Expenses" value={formatMoney(data.kpis.todayExpenses, sym)} />
            <StatCard
              label="Pending Dues"
              value={formatMoney(data.kpis.pendingPayments, sym)}
              tone={data.kpis.pendingPayments > 0 ? 'warning' : 'neutral'}
            />
            <StatCard label="Period Expenses" value={formatMoney(data.kpis.totalExpenses, sym)} />
          </div>

          {/* Primary Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sales & Profit Overview</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Daily revenue vs gross profit trajectory</p>
                </div>
              </div>
              {data.charts.salesOverview.length === 0 ? (
                <EmptyState
                  title="No sales recorded in this period"
                  description="Complete a checkout in POS Terminal to populate live sales and profit curves."
                  actionLabel={can('pos:access') ? 'Go to POS Terminal' : undefined}
                  onAction={can('pos:access') ? () => onNavigate('pos') : undefined}
                />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.charts.salesOverview}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: tickColor, fontSize: 11 }} />
                      <YAxis tick={{ fill: tickColor, fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="sales" name="Sales" stroke="#059669" fill="#059669" fillOpacity={0.14} strokeWidth={2} />
                      <Area type="monotone" dataKey="profit" name="Gross Profit" stroke="#0284c7" fill="#0284c7" fillOpacity={0.08} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sales by Category</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Revenue share across product categories</p>
              {data.charts.salesByCategory.length === 0 ? (
                <EmptyState title="No category sales yet" description="Category breakdown appears once items are sold." />
              ) : (
                <div className="space-y-4">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.charts.salesByCategory}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                        >
                          {data.charts.salesByCategory.map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5">
                    {data.charts.salesByCategory.slice(0, 5).map((cat: any, i: number) => (
                      <div key={cat.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          {cat.name}
                        </span>
                        <span className="font-mono tabular-nums font-medium">{formatMoney(cat.value, sym)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Weekly & Monthly Charts + Payment Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Weekly Sales (Last 7 Days)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Daily order volume & sales</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.weeklySales}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 10 }} />
                    <YAxis tick={{ fill: tickColor, fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="sales" name="Sales" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Monthly Revenue vs Expenses</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">6-month trailing comparison</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 11 }} />
                    <YAxis tick={{ fill: tickColor, fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="revenue" name="Revenue" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payment Method Breakdown</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Collections by tender channel</p>
              {data.charts.paymentBreakdown.length === 0 ? (
                <EmptyState title="No payments yet" description="Tender breakdown updates with each sale." />
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.charts.paymentBreakdown.map((pm: any) => (
                    <div key={pm.method} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{pm.method}</p>
                        <p className="text-slate-500 dark:text-slate-400">{pm.count} transaction(s)</p>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(pm.amount, sym)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Tables: Top Selling, Recent Transactions, Recent Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Top-Selling Products</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('products')}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  View Catalog
                </button>
              </div>
              {data.topSellingProducts.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No product sales recorded in this period.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.topSellingProducts.map((item: any) => (
                    <div key={item.productId} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{item.name}</p>
                        <p className="text-slate-500 font-mono">{item.sku} · {item.quantity} sold</p>
                      </div>
                      <span className="font-mono tabular-nums font-semibold shrink-0">
                        {formatMoney(item.revenue, sym)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Recent Transactions</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('sales')}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  All Sales
                </button>
              </div>
              {data.recentTransactions.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No transactions in selected date range.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentTransactions.map((s: any) => (
                    <div key={s._id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-mono font-medium text-slate-900 dark:text-slate-100">{s.invoiceNumber}</p>
                        <p className="text-slate-500 truncate">{s.customerName} · {s.paymentMethod}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono tabular-nums font-semibold">{formatMoney(s.grandTotal, sym)}</p>
                        <StatusText status={s.paymentStatus} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Recent Activity</h2>
                {can('logs:view') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('admin')}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Audit Logs
                  </button>
                )}
              </div>
              {data.recentActivity.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No activity logged yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentActivity.slice(0, 6).map((act: any) => (
                    <div key={act._id} className="py-2.5 text-xs">
                      <p className="text-slate-800 dark:text-slate-200 line-clamp-2">{act.description}</p>
                      <p className="text-slate-400 mt-0.5">
                        {act.userName} · {formatDateTime(act.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

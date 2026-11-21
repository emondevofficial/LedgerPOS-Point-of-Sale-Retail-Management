import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { EmptyState, StatCard, TableSkeleton } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, cn, formatMoney } from '../lib/api';

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'prev_month', label: 'Prev Month' },
  { key: 'all', label: 'All Time' },
];

export function FinancialView() {
  const { settings, theme } = useAuth();
  const sym = settings.currencySymbol || '$';
  const [preset, setPreset] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/financial?preset=${preset}`);
      setData(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load financial overview');
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    return <TableSkeleton rows={6} cols={4} />;
  }

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Financial Statements & Cash Flow</h2>
          <p className="text-xs text-slate-500">Real-time Profit & Loss, tender inflows, tax liabilities, and open receivables/payables</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={cn(
                'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                preset === p.key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary P&L Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Net Sales" value={formatMoney(s.totalSales, sym)} />
        <StatCard label="Gross Profit" value={formatMoney(s.grossProfit, sym)} meta={`COGS: ${formatMoney(s.totalCogs, sym)}`} tone="positive" />
        <StatCard label="Net Profit" value={formatMoney(s.netProfit, sym)} tone={s.netProfit >= 0 ? 'positive' : 'critical'} />
        <StatCard label="Total Purchases" value={formatMoney(s.totalPurchases, sym)} />
        <StatCard label="Total Expenses" value={formatMoney(s.totalExpenses, sym)} tone="warning" />
        <StatCard label="Tax / VAT Collected" value={formatMoney(s.taxCollected, sym)} />
      </div>

      {/* Channel Inflows & Dues */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Cash Received" value={formatMoney(s.cashReceived, sym)} />
        <StatCard label="Card Payments" value={formatMoney(s.cardPayments, sym)} />
        <StatCard label="Mobile Banking" value={formatMoney(s.mobileBankingPayments, sym)} />
        <StatCard label="Customer Dues" value={formatMoney(s.totalCustomerDue, sym)} tone={s.totalCustomerDue > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Supplier Dues" value={formatMoney(s.totalSupplierDue, sym)} tone={s.totalSupplierDue > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Sales Refunds" value={formatMoney(s.refunds, sym)} tone={s.refunds > 0 ? 'critical' : 'neutral'} />
      </div>

      {/* Cash Flow Chart */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold mb-1">Daily Cash Flow (Inflow vs Outflow)</h3>
        <p className="text-xs text-slate-500 mb-4">Includes customer payments, supplier payouts, refunds, and operational expenses</p>
        {data.cashFlow.length === 0 ? (
          <EmptyState title="No cash flow activity" description="Sales payments, purchase payouts, and expenses appear here." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="inflow" name="Cash Inflow" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="Cash Outflow" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Receivables & Payables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold mb-3">Outstanding Customer Dues ({data.customerDues.length})</h3>
          {data.customerDues.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No pending customer receivables.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {data.customerDues.map((c: any) => (
                <div key={c._id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-slate-500">{c.phone || 'No phone'}</p>
                  </div>
                  <span className="font-mono font-semibold text-red-600">{formatMoney(c.currentDue, sym)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold mb-3">Outstanding Supplier Payables ({data.supplierDues.length})</h3>
          {data.supplierDues.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No pending supplier payables.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {data.supplierDues.map((sup: any) => (
                <div key={sup._id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{sup.name}</p>
                    <p className="text-slate-500">{sup.companyName || sup.phone || '—'}</p>
                  </div>
                  <span className="font-mono font-semibold text-amber-600">{formatMoney(sup.currentDue, sym)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

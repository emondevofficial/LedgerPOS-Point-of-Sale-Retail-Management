import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { SINGLE_PAYMENT_METHODS } from '../../shared/types';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  StatCard,
  TableSkeleton,
  Textarea,
} from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatDate, formatMoney } from '../lib/api';

export function ExpensesView() {
  const { settings, theme, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canManage = can('expenses:manage');

  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    title: '',
    categoryId: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    reference: '',
    description: '',
  });

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({ search, categoryId: categoryFilter });
      const [expRes, catRes] = await Promise.all([
        apiRequest<any[]>(`/api/expenses?${qs.toString()}`),
        apiRequest<any[]>('/api/expense-categories'),
      ]);
      setExpenses(expRes);
      setCategories(catRes);
    } catch (err: any) {
      const msg = err.message || 'Failed to load expenses';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const totals = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    let today = 0;
    let month = 0;
    let all = 0;
    const byCat = new Map<string, number>();

    for (const e of expenses) {
      const amt = Number(e.amount || 0);
      const d = new Date(e.date).toISOString().slice(0, 10);
      all += amt;
      if (d === todayStr) today += amt;
      if (d.startsWith(monthStr)) month += amt;
      byCat.set(e.categoryName, (byCat.get(e.categoryName) || 0) + amt);
    }

    return {
      today,
      month,
      all,
      chart: Array.from(byCat.entries()).map(([category, amount]) => ({ category, amount })),
    };
  }, [expenses]);

  const openModal = (exp: any | null = null) => {
    setEditing(exp);
    setForm(
      exp
        ? {
            title: exp.title,
            categoryId: String(exp.categoryId),
            amount: String(exp.amount),
            date: new Date(exp.date).toISOString().slice(0, 10),
            paymentMethod: exp.paymentMethod,
            reference: exp.reference || '',
            description: exp.description || '',
          }
        : {
            title: '',
            categoryId: categories[0]?._id || '',
            amount: '',
            date: new Date().toISOString().slice(0, 10),
            paymentMethod: 'Cash',
            reference: '',
            description: '',
          }
    );
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiRequest(`/api/expenses/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, amount: Number(form.amount) }),
        });
        toast.success('Expense updated');
      } else {
        await apiRequest('/api/expenses', {
          method: 'POST',
          body: JSON.stringify({ ...form, amount: Number(form.amount) }),
        });
        toast.success('Expense recorded');
      }
      setModalOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Today's Expenses" value={formatMoney(totals.today, sym)} />
        <StatCard label="This Month's Expenses" value={formatMoney(totals.month, sym)} />
        <StatCard label="Filtered Total" value={formatMoney(totals.all, sym)} />
      </div>

      {totals.chart.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">Expenses by Category</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={totals.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="category" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="amount" name="Amount" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expense title or ref..."
              className="h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-48">
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </Select>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCatModalOpen(true)}>
              + Category
            </Button>
            <Button size="sm" onClick={() => openModal(null)}>
              <Plus className="w-3.5 h-3.5" /> Record Expense
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : loadError ? (
        <ErrorState title="Failed to load expenses" message={loadError} onRetry={loadAll} />
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No expenses recorded"
          description="Track rent, payroll, utilities, and operating costs for accurate net profit reporting."
          actionLabel={canManage ? 'Record Expense' : undefined}
          onAction={() => openModal(null)}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Title</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Method</th>
                <th className="py-3 px-4 font-medium">Recorded By</th>
                <th className="py-3 px-4 font-medium text-right">Amount</th>
                {canManage && <th className="py-3 px-4 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {expenses.map((e) => (
                <tr key={e._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-2.5 px-4 font-semibold">{e.title}</td>
                  <td className="py-2.5 px-4">{e.categoryName}</td>
                  <td className="py-2.5 px-4">{e.paymentMethod}</td>
                  <td className="py-2.5 px-4 text-slate-500">{e.createdByName}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-amber-600">
                    {formatMoney(e.amount, sym)}
                  </td>
                  {canManage && (
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => openModal(e)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(e)} className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expense Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Expense' : 'Record Expense'} maxWidth="max-w-md">
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Expense Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </Select>
            <Input label="Amount" type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Select label="Payment Method" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {SINGLE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
          <Input label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Expense</Button>
          </div>
        </form>
      </Modal>

      {/* New Expense Category Modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Add Expense Category" maxWidth="max-w-sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiRequest('/api/expense-categories', {
                method: 'POST',
                body: JSON.stringify({ name: newCatName }),
              });
              toast.success('Expense category created');
              setNewCatName('');
              setCatModalOpen(false);
              await loadAll();
            } catch (err: any) {
              toast.error(err.message || 'Failed');
            }
          }}
          className="space-y-4"
        >
          <Input label="Category Name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCatModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          try {
            await apiRequest(`/api/expenses/${deleteTarget._id}`, { method: 'DELETE' });
            toast.success('Expense deleted');
            setDeleteTarget(null);
            await loadAll();
          } catch (err: any) {
            toast.error(err.message || 'Delete failed');
          }
        }}
        title="Delete Expense"
        message={`Delete expense "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
      />
    </div>
  );
}

import { CreditCard, Edit2, FileText, Plus, Search, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SINGLE_PAYMENT_METHODS } from '../../shared/types';
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
import { apiRequest, formatDateTime, formatMoney } from '../lib/api';

export function CustomersView() {
  const { settings, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canManage = can('customers:manage');

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    customerType: 'retail',
    company: '',
    openingBalance: '0',
    notes: '',
  });

  const [ledgerData, setLedgerData] = useState<any | null>(null);
  const [payCustomer, setPayCustomer] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Cash', notes: '' });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, type: typeFilter });
      const res = await apiRequest<any[]>(`/api/customers?${qs.toString()}`);
      setCustomers(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const openModal = (cust: any | null = null) => {
    setEditing(cust);
    setForm(
      cust
        ? {
            name: cust.name,
            phone: cust.phone || '',
            email: cust.email || '',
            address: cust.address || '',
            customerType: cust.customerType || 'retail',
            company: cust.company || '',
            openingBalance: String(cust.openingBalance || 0),
            notes: cust.notes || '',
          }
        : {
            name: '',
            phone: '',
            email: '',
            address: '',
            customerType: 'retail',
            company: '',
            openingBalance: '0',
            notes: '',
          }
    );
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiRequest(`/api/customers/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        toast.success('Customer updated');
      } else {
        await apiRequest('/api/customers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        toast.success('Customer created');
      }
      setModalOpen(false);
      await loadCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Could not save customer');
    }
  };

  const openLedger = async (cust: any) => {
    try {
      const res = await apiRequest(`/api/customers/${cust._id}/ledger`);
      setLedgerData(res);
    } catch (err: any) {
      toast.error(err.message || 'Could not load customer ledger');
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payCustomer) return;
    try {
      await apiRequest(`/api/customers/${payCustomer._id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payForm.amount),
          method: payForm.method,
          notes: payForm.notes,
        }),
      });
      toast.success('Due payment collected');
      setPayCustomer(null);
      await loadCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Payment collection failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, company..."
              className="h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-36">
            <option value="all">All Types</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="vip">VIP</option>
          </Select>
        </div>

        {canManage && (
          <Button size="sm" onClick={() => openModal(null)}>
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Add registered customers to track purchase histories, credit sales, and due payments."
          actionLabel={canManage ? 'Add Customer' : undefined}
          onAction={() => openModal(null)}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Contact</th>
                <th className="py-3 px-4 font-medium">Tier</th>
                <th className="py-3 px-4 font-medium text-right">Total Purchases</th>
                <th className="py-3 px-4 font-medium text-right">Total Paid</th>
                <th className="py-3 px-4 font-medium text-right">Due Balance</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {customers.map((c) => (
                <tr key={c._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {c.name} {c.isWalkIn && <span className="text-[11px] font-normal text-emerald-600">(Counter Default)</span>}
                    </p>
                    {c.company && <p className="text-[11px] text-slate-400">{c.company}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                    <p>{c.phone || '—'}</p>
                    {c.email && <p className="text-[11px] text-slate-400">{c.email}</p>}
                  </td>
                  <td className="py-2.5 px-4 capitalize">{c.customerType}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatMoney(c.totalPurchases, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-600">{formatMoney(c.totalPaid, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                    <span className={Number(c.currentDue) > 0 ? 'text-red-600' : 'text-slate-500'}>
                      {formatMoney(c.currentDue, sym)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openLedger(c)}>
                        <FileText className="w-3.5 h-3.5" /> Ledger
                      </Button>
                      {canManage && Number(c.currentDue) > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPayCustomer(c);
                            setPayForm({ amount: String(c.currentDue), method: 'Cash', notes: '' });
                          }}
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Collect
                        </Button>
                      )}
                      {canManage && !c.isWalkIn && (
                        <>
                          <button
                            type="button"
                            onClick={() => openModal(c)}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Customer' : 'Add Customer'} maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Select label="Customer Type" value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="vip">VIP</option>
            </Select>
            <Input label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            {!editing && (
              <Input label="Opening Balance Due" type="number" min={0} step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
            )}
          </div>
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save Changes' : 'Create Customer'}</Button>
          </div>
        </form>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal open={Boolean(payCustomer)} onClose={() => setPayCustomer(null)} title={`Collect Payment — ${payCustomer?.name}`} maxWidth="max-w-sm">
        <form onSubmit={handleCollectPayment} className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs flex justify-between">
            <span className="text-slate-500">Outstanding Due</span>
            <span className="font-mono font-bold text-red-600">{formatMoney(payCustomer?.currentDue, sym)}</span>
          </div>
          <Input
            label="Amount Received"
            type="number"
            min={0.01}
            max={payCustomer?.currentDue}
            step="0.01"
            value={payForm.amount}
            onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
            required
          />
          <Select label="Payment Method" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
            {SINGLE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Input label="Notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Receipt or reference note" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPayCustomer(null)}>Cancel</Button>
            <Button type="submit">Record Payment</Button>
          </div>
        </form>
      </Modal>

      {/* Customer Ledger Modal */}
      <Modal
        open={Boolean(ledgerData)}
        onClose={() => setLedgerData(null)}
        title={`Customer Ledger — ${ledgerData?.customer?.name}`}
        maxWidth="max-w-3xl"
      >
        {ledgerData && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div><span className="text-slate-500">Total Purchases</span><p className="font-mono font-semibold text-sm">{formatMoney(ledgerData.customer.totalPurchases, sym)}</p></div>
              <div><span className="text-slate-500">Total Paid</span><p className="font-mono font-semibold text-sm text-emerald-600">{formatMoney(ledgerData.customer.totalPaid, sym)}</p></div>
              <div><span className="text-slate-500">Current Due</span><p className="font-mono font-semibold text-sm text-red-600">{formatMoney(ledgerData.customer.currentDue, sym)}</p></div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Invoices ({ledgerData.sales.length})</h4>
              {ledgerData.sales.length === 0 ? (
                <p className="text-slate-500">No invoices yet.</p>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                  {ledgerData.sales.map((s: any) => (
                    <div key={s._id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold">{s.invoiceNumber}</span>
                        <span className="text-slate-500 ml-2">{formatDateTime(s.saleDate)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <StatusText status={s.paymentStatus} />
                        <span className="font-mono font-semibold">{formatMoney(s.grandTotal, sym)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-semibold mb-2">Payments History ({ledgerData.payments.length})</h4>
              {ledgerData.payments.length === 0 ? (
                <p className="text-slate-500">No payments recorded.</p>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                  {ledgerData.payments.map((p: any) => (
                    <div key={p._id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono">{p.referenceNumber}</span>
                        <span className="text-slate-500 ml-2">{p.method} · {formatDateTime(p.paymentDate)}</span>
                      </div>
                      <span className="font-mono font-semibold text-emerald-600">{formatMoney(p.amount, sym)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          try {
            await apiRequest(`/api/customers/${deleteTarget._id}`, { method: 'DELETE' });
            toast.success('Customer deleted');
            setDeleteTarget(null);
            await loadCustomers();
          } catch (err: any) {
            toast.error(err.message || 'Delete failed');
          }
        }}
        title="Delete Customer"
        message={`Remove "${deleteTarget?.name}" from active customers?`}
        confirmLabel="Delete"
      />
    </div>
  );
}

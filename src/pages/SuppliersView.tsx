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

export function SuppliersView() {
  const { settings, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canManage = can('suppliers:manage');

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    contactPerson: '',
    openingBalance: '0',
    notes: '',
  });

  const [ledgerData, setLedgerData] = useState<any | null>(null);
  const [paySupplier, setPaySupplier] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Bank Transfer', notes: '' });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<any[]>(`/api/suppliers?search=${encodeURIComponent(search)}`);
      setSuppliers(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const openModal = (sup: any | null = null) => {
    setEditing(sup);
    setForm(
      sup
        ? {
            name: sup.name,
            companyName: sup.companyName || '',
            phone: sup.phone || '',
            email: sup.email || '',
            address: sup.address || '',
            contactPerson: sup.contactPerson || '',
            openingBalance: String(sup.openingBalance || 0),
            notes: sup.notes || '',
          }
        : {
            name: '',
            companyName: '',
            phone: '',
            email: '',
            address: '',
            contactPerson: '',
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
        await apiRequest(`/api/suppliers/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        toast.success('Supplier updated');
      } else {
        await apiRequest('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        toast.success('Supplier created');
      }
      setModalOpen(false);
      await loadSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    }
  };

  const handlePaySupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySupplier) return;
    try {
      await apiRequest(`/api/suppliers/${paySupplier._id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payForm.amount),
          method: payForm.method,
          notes: payForm.notes,
        }),
      });
      toast.success('Supplier payment recorded');
      setPaySupplier(null);
      await loadSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Payment failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier, company, phone..."
            className="h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-72 max-w-full"
          />
        </div>
        {canManage && (
          <Button size="sm" onClick={() => openModal(null)}>
            <Plus className="w-3.5 h-3.5" /> Add Supplier
          </Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers registered"
          description="Add wholesale vendors and distributors to manage purchase orders and supplier payables."
          actionLabel={canManage ? 'Add Supplier' : undefined}
          onAction={() => openModal(null)}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-3 px-4 font-medium">Supplier</th>
                <th className="py-3 px-4 font-medium">Contact</th>
                <th className="py-3 px-4 font-medium text-right">Total Purchases</th>
                <th className="py-3 px-4 font-medium text-right">Paid</th>
                <th className="py-3 px-4 font-medium text-right">Outstanding</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {suppliers.map((s) => (
                <tr key={s._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</p>
                    {s.companyName && <p className="text-[11px] text-slate-400">{s.companyName}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                    <p>{s.contactPerson || s.phone || '—'}</p>
                    {s.email && <p className="text-[11px] text-slate-400">{s.email}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatMoney(s.totalPurchases, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-600">{formatMoney(s.totalPaid, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                    <span className={Number(s.currentDue) > 0 ? 'text-amber-600' : 'text-slate-500'}>
                      {formatMoney(s.currentDue, sym)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const data = await apiRequest(`/api/suppliers/${s._id}/ledger`);
                          setLedgerData(data);
                        }}
                      >
                        <FileText className="w-3.5 h-3.5" /> Ledger
                      </Button>
                      {canManage && Number(s.currentDue) > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPaySupplier(s);
                            setPayForm({ amount: String(s.currentDue), method: 'Bank Transfer', notes: '' });
                          }}
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Pay
                        </Button>
                      )}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => openModal(s)}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(s)}
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

      {/* Supplier Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Supplier' : 'Add Supplier'} maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Supplier Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Company Name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            <Input label="Contact Person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {!editing && (
              <Input label="Opening Balance Due" type="number" min={0} step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
            )}
          </div>
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save Changes' : 'Create Supplier'}</Button>
          </div>
        </form>
      </Modal>

      {/* Supplier Payment Modal */}
      <Modal open={Boolean(paySupplier)} onClose={() => setPaySupplier(null)} title={`Pay Supplier — ${paySupplier?.name}`} maxWidth="max-w-sm">
        <form onSubmit={handlePaySupplier} className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs flex justify-between">
            <span className="text-slate-500">Outstanding Payable</span>
            <span className="font-mono font-bold text-amber-600">{formatMoney(paySupplier?.currentDue, sym)}</span>
          </div>
          <Input
            label="Payment Amount"
            type="number"
            min={0.01}
            max={paySupplier?.currentDue}
            step="0.01"
            value={payForm.amount}
            onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
            required
          />
          <Select label="Method" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
            {SINGLE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Input label="Notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPaySupplier(null)}>Cancel</Button>
            <Button type="submit">Confirm Payment</Button>
          </div>
        </form>
      </Modal>

      {/* Supplier Ledger Modal */}
      <Modal open={Boolean(ledgerData)} onClose={() => setLedgerData(null)} title={`Supplier Ledger — ${ledgerData?.supplier?.name}`} maxWidth="max-w-3xl">
        {ledgerData && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div><span className="text-slate-500">Total Purchases</span><p className="font-mono font-semibold text-sm">{formatMoney(ledgerData.supplier.totalPurchases, sym)}</p></div>
              <div><span className="text-slate-500">Paid</span><p className="font-mono font-semibold text-sm text-emerald-600">{formatMoney(ledgerData.supplier.totalPaid, sym)}</p></div>
              <div><span className="text-slate-500">Balance Due</span><p className="font-mono font-semibold text-sm text-amber-600">{formatMoney(ledgerData.supplier.currentDue, sym)}</p></div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Purchase Orders ({ledgerData.purchases.length})</h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                {ledgerData.purchases.length === 0 ? (
                  <p className="p-3 text-slate-500">No purchase orders.</p>
                ) : (
                  ledgerData.purchases.map((p: any) => (
                    <div key={p._id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold">{p.purchaseNumber}</span>
                        <span className="text-slate-500 ml-2">{formatDateTime(p.purchaseDate)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <StatusText status={p.status} />
                        <span className="font-mono font-semibold">{formatMoney(p.totalAmount, sym)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await apiRequest(`/api/suppliers/${deleteTarget._id}`, { method: 'DELETE' });
          toast.success('Supplier deleted');
          setDeleteTarget(null);
          await loadSuppliers();
        }}
        title="Delete Supplier"
        message={`Remove "${deleteTarget?.name}" from active suppliers?`}
        confirmLabel="Delete"
      />
    </div>
  );
}

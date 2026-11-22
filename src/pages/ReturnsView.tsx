import { Plus, RotateCcw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SINGLE_PAYMENT_METHODS } from '../../shared/types';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  StatusText,
  TableSkeleton,
} from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatDateTime, formatMoney } from '../lib/api';

export function ReturnsView() {
  const { settings, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canManage = can('returns:manage');

  const [returns, setReturns] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [retType, setRetType] = useState<'sale_return' | 'purchase_return'>('sale_return');
  const [selectedTxId, setSelectedTxId] = useState('');
  const [txItems, setTxItems] = useState<any[]>([]);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [condition, setCondition] = useState<'restock' | 'damaged'>('restock');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [reason, setReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [retRes, salesRes, poRes] = await Promise.all([
        apiRequest<any[]>(`/api/returns?type=${typeFilter}`),
        apiRequest<{ rows: any[] }>('/api/sales?limit=150'),
        apiRequest<any[]>('/api/purchases'),
      ]);
      setReturns(retRes);
      setSales((salesRes.rows || []).filter((s) => s.status !== 'canceled' && s.status !== 'refunded'));
      setPurchases(poRes.filter((p) => p.status === 'received' || p.status === 'partial_received'));
    } catch (err: any) {
      const msg = err.message || 'Failed to load returns';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadTransactionItems = async (type: 'sale_return' | 'purchase_return', txId: string) => {
    if (!txId) {
      setTxItems([]);
      return;
    }
    try {
      const res =
        type === 'sale_return'
          ? await apiRequest<{ items: any[] }>(`/api/sales/${txId}`)
          : await apiRequest<{ items: any[] }>(`/api/purchases/${txId}`);
      setTxItems(res.items || []);
      const init: Record<string, number> = {};
      for (const it of res.items || []) {
        init[it._id] = 0;
      }
      setReturnQtys(init);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load transaction items');
    }
  };

  const openCreateModal = () => {
    const initialType: 'sale_return' | 'purchase_return' = sales.length > 0 ? 'sale_return' : 'purchase_return';
    const firstId = initialType === 'sale_return' ? sales[0]?._id || '' : purchases[0]?._id || '';
    setRetType(initialType);
    setSelectedTxId(firstId);
    setCondition('restock');
    setRefundMethod('Cash');
    setReason('');
    if (firstId) loadTransactionItems(initialType, firstId);
    setModalOpen(true);
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = Object.entries(returnQtys)
      .filter(([, q]) => Number(q) > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) }));
    if (chosen.length === 0) {
      toast.error('Enter return quantity for at least one item');
      return;
    }
    try {
      await apiRequest('/api/returns', {
        method: 'POST',
        body: JSON.stringify({
          type: retType,
          originalTransactionId: selectedTxId,
          items: chosen,
          refundMethod,
          reason,
          condition,
        }),
      });
      toast.success('Return processed and stock/balances updated');
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Return failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-48">
          <option value="all">All Returns</option>
          <option value="sale_return">Sales Returns</option>
          <option value="purchase_return">Purchase Returns</option>
        </Select>

        {canManage && (
          <Button size="sm" onClick={openCreateModal} disabled={sales.length === 0 && purchases.length === 0}>
            <Plus className="w-3.5 h-3.5" /> Process Return
          </Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : loadError ? (
        <ErrorState title="Failed to load returns" message={loadError} onRetry={loadData} />
      ) : returns.length === 0 ? (
        <EmptyState
          title="No returns recorded"
          description="Process sales or purchase returns linked directly to original invoices and purchase orders."
          actionLabel={canManage && (sales.length > 0 || purchases.length > 0) ? 'Process Return' : undefined}
          onAction={openCreateModal}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-3 px-4 font-medium">Return #</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium">Original Ref</th>
                <th className="py-3 px-4 font-medium">Customer / Supplier</th>
                <th className="py-3 px-4 font-medium">Condition</th>
                <th className="py-3 px-4 font-medium text-right">Refund Amount</th>
                <th className="py-3 px-4 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {returns.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-mono font-semibold">{r.returnNumber}</td>
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{formatDateTime(r.returnDate)}</td>
                  <td className="py-2.5 px-4">{r.type === 'sale_return' ? 'Sale Return' : 'Purchase Return'}</td>
                  <td className="py-2.5 px-4 font-mono">{r.originalReference}</td>
                  <td className="py-2.5 px-4 font-medium">{r.entityName}</td>
                  <td className="py-2.5 px-4"><StatusText status={r.condition} /></td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                    {formatMoney(r.totalRefundAmount, sym)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Process Return Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Process Return / Refund" maxWidth="max-w-2xl">
        <form onSubmit={handleSubmitReturn} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Return Type"
              value={retType}
              onChange={(e) => {
                const nextType = e.target.value as 'sale_return' | 'purchase_return';
                setRetType(nextType);
                const first = nextType === 'sale_return' ? sales[0]?._id || '' : purchases[0]?._id || '';
                setSelectedTxId(first);
                loadTransactionItems(nextType, first);
              }}
            >
              <option value="sale_return">Sales Return (Customer Refund)</option>
              <option value="purchase_return">Purchase Return (To Supplier)</option>
            </Select>

            <Select
              label={retType === 'sale_return' ? 'Original Sale Invoice' : 'Original Purchase Order'}
              value={selectedTxId}
              onChange={(e) => {
                setSelectedTxId(e.target.value);
                loadTransactionItems(retType, e.target.value);
              }}
              required
            >
              <option value="">Select transaction</option>
              {(retType === 'sale_return' ? sales : purchases).map((tx) => (
                <option key={tx._id} value={tx._id}>
                  {retType === 'sale_return'
                    ? `${tx.invoiceNumber} — ${tx.customerName} (${formatMoney(tx.grandTotal, sym)})`
                    : `${tx.purchaseNumber} — ${tx.supplierName} (${formatMoney(tx.totalAmount, sym)})`}
                </option>
              ))}
            </Select>
          </div>

          {txItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Select Return Quantities</span>
                <button
                  type="button"
                  onClick={() => {
                    const all: Record<string, number> = {};
                    for (const it of txItems) {
                      const maxRet =
                        retType === 'sale_return'
                          ? Number(it.quantity) - Number(it.returnedQuantity || 0)
                          : Number(it.receivedQuantity || 0) - Number(it.returnedQuantity || 0);
                      all[it._id] = Math.max(0, maxRet);
                    }
                    setReturnQtys(all);
                  }}
                  className="text-xs text-emerald-600 hover:underline cursor-pointer"
                >
                  Return Full Invoice
                </button>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                {txItems.map((it) => {
                  const maxRet =
                    retType === 'sale_return'
                      ? Number(it.quantity) - Number(it.returnedQuantity || 0)
                      : Number(it.receivedQuantity || 0) - Number(it.returnedQuantity || 0);
                  return (
                    <div key={it._id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-semibold">{it.productName}</p>
                        <p className="font-mono text-slate-500">
                          Available to return: {maxRet} · Already returned: {it.returnedQuantity || 0}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={maxRet}
                        disabled={maxRet <= 0}
                        value={returnQtys[it._id] ?? 0}
                        onChange={(e) =>
                          setReturnQtys((prev) => ({
                            ...prev,
                            [it._id]: Math.min(maxRet, Math.max(0, parseInt(e.target.value, 10) || 0)),
                          }))
                        }
                        className="w-20 h-8 px-2 text-right font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Stock Condition" value={condition} onChange={(e) => setCondition(e.target.value as any)}>
              <option value="restock">Good — Restock to Sellable Inventory</option>
              <option value="damaged">Damaged — Do Not Restock</option>
            </Select>
            <Select label="Refund Method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
              {SINGLE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>

          <Input label="Return Reason" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Defective item, wrong size" />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">
              <RotateCcw className="w-3.5 h-3.5" /> Complete Return
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { Eye, PackageCheck, Plus, Search, Trash2, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
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
  StatusText,
  TableSkeleton,
  Textarea,
} from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatDateTime, formatMoney } from '../lib/api';

export function PurchasesView() {
  const { settings, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canManage = can('purchases:manage');

  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [poForm, setPoForm] = useState({
    supplierId: '',
    status: 'ordered' as 'draft' | 'ordered' | 'received',
    discountAmount: '0',
    shippingCost: '0',
    paidAmount: '0',
    paymentMethod: 'Bank Transfer',
    notes: '',
  });
  const [poItems, setPoItems] = useState<
    Array<{ productId: string; orderedQuantity: number; purchasePrice: number; taxRate: number }>
  >([]);

  const [detailData, setDetailData] = useState<{ purchase: any; items: any[] } | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<{ purchase: any; items: any[] } | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({ search, status: statusFilter });
      const [poRes, supRes, prodRes] = await Promise.all([
        apiRequest<any[]>(`/api/purchases?${qs.toString()}`),
        apiRequest<any[]>('/api/suppliers'),
        apiRequest<{ rows: any[] }>('/api/products?limit=400'),
      ]);
      setPurchases(poRes);
      setSuppliers(supRes);
      setProducts(prodRes.rows || []);
    } catch (err: any) {
      const msg = err.message || 'Failed to load purchases';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    const firstProd = products[0];
    setPoForm({
      supplierId: suppliers[0]?._id || '',
      status: 'ordered',
      discountAmount: '0',
      shippingCost: '0',
      paidAmount: '0',
      paymentMethod: 'Bank Transfer',
      notes: '',
    });
    setPoItems(
      firstProd
        ? [
            {
              productId: firstProd._id,
              orderedQuantity: 10,
              purchasePrice: Number(firstProd.purchasePrice || 0),
              taxRate: Number(firstProd.taxRate || 0),
            },
          ]
        : []
    );
    setCreateOpen(true);
  };

  const poSubtotal = poItems.reduce((acc, it) => acc + it.orderedQuantity * it.purchasePrice, 0);
  const poTax = poItems.reduce(
    (acc, it) => acc + (it.orderedQuantity * it.purchasePrice * it.taxRate) / 100,
    0
  );
  const poGrandTotal = Math.max(
    0,
    poSubtotal - Number(poForm.discountAmount || 0) + poTax + Number(poForm.shippingCost || 0)
  );

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          ...poForm,
          discountAmount: Number(poForm.discountAmount || 0),
          shippingCost: Number(poForm.shippingCost || 0),
          paidAmount: Number(poForm.paidAmount || 0),
          items: poItems,
        }),
      });
      toast.success('Purchase order created');
      setCreateOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not create purchase order');
    }
  };

  const openReceiveModal = async (po: any) => {
    try {
      const detail = await apiRequest<{ purchase: any; items: any[] }>(`/api/purchases/${po._id}`);
      const initial: Record<string, number> = {};
      for (const it of detail.items) {
        initial[it._id] = Math.max(0, Number(it.orderedQuantity) - Number(it.receivedQuantity || 0));
      }
      setReceiveQtys(initial);
      setReceiveTarget(detail);
    } catch (err: any) {
      toast.error(err.message || 'Could not load PO items');
    }
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTarget) return;
    try {
      await apiRequest(`/api/purchases/${receiveTarget.purchase._id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          items: Object.entries(receiveQtys).map(([purchaseItemId, receiveQuantity]) => ({
            purchaseItemId,
            receiveQuantity: Number(receiveQuantity || 0),
          })),
        }),
      });
      toast.success('Inventory received and stock movements recorded');
      setReceiveTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Receiving failed');
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
              placeholder="Search PO # or supplier..."
              className="h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="ordered">Ordered</option>
            <option value="partial_received">Partial Received</option>
            <option value="received">Received</option>
            <option value="canceled">Canceled</option>
          </Select>
        </div>

        {canManage && (
          <Button size="sm" onClick={openCreateModal} disabled={suppliers.length === 0 || products.length === 0}>
            <Plus className="w-3.5 h-3.5" /> New Purchase Order
          </Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : loadError ? (
        <ErrorState title="Failed to load purchase orders" message={loadError} onRetry={loadData} />
      ) : purchases.length === 0 ? (
        <EmptyState
          title="No purchase orders"
          description="Create a supplier purchase order to replenish stock and track payables."
          actionLabel={canManage && suppliers.length > 0 && products.length > 0 ? 'Create Purchase Order' : undefined}
          onAction={openCreateModal}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-3 px-4 font-medium">PO Number</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Supplier</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Total</th>
                <th className="py-3 px-4 font-medium text-right">Paid</th>
                <th className="py-3 px-4 font-medium text-right">Due</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {purchases.map((po) => (
                <tr key={po._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-mono font-semibold">{po.purchaseNumber}</td>
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{formatDateTime(po.purchaseDate)}</td>
                  <td className="py-2.5 px-4 font-medium">{po.supplierName}</td>
                  <td className="py-2.5 px-4"><StatusText status={po.status} /></td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{formatMoney(po.totalAmount, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-600">{formatMoney(po.paidAmount, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-600">{formatMoney(po.dueAmount, sym)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            const d = await apiRequest<{ purchase: any; items: any[] }>(`/api/purchases/${po._id}`);
                            setDetailData(d);
                          } catch (err: any) {
                            toast.error(err.message || 'Could not load purchase order details');
                          }
                        }}
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                      {canManage && ['draft', 'ordered', 'partial_received'].includes(po.status) && (
                        <Button variant="outline" size="sm" onClick={() => openReceiveModal(po)}>
                          <PackageCheck className="w-3.5 h-3.5" /> Receive
                        </Button>
                      )}
                      {canManage && ['draft', 'ordered'].includes(po.status) && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(po)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                          title="Cancel PO"
                        >
                          <XCircle className="w-3.5 h-3.5" />
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

      {/* Create PO Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Purchase Order" maxWidth="max-w-3xl">
        <form onSubmit={handleCreatePurchase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Supplier" value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })} required>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </Select>
            <Select label="Initial Status" value={poForm.status} onChange={(e) => setPoForm({ ...poForm, status: e.target.value as any })}>
              <option value="ordered">Ordered (Pending Delivery)</option>
              <option value="received">Received Immediately (+Stock)</option>
              <option value="draft">Draft (No Stock/Balance Change)</option>
            </Select>
            <Select label="Payment Method" value={poForm.paymentMethod} onChange={(e) => setPoForm({ ...poForm, paymentMethod: e.target.value })}>
              {SINGLE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Order Items</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const p = products[0];
                  if (!p) return;
                  setPoItems((prev) => [
                    ...prev,
                    { productId: p._id, orderedQuantity: 5, purchasePrice: Number(p.purchasePrice || 0), taxRate: Number(p.taxRate || 0) },
                  ]);
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </Button>
            </div>
            <div className="space-y-2">
              {poItems.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="col-span-5">
                    <Select
                      label={idx === 0 ? 'Product' : undefined}
                      value={row.productId}
                      onChange={(e) => {
                        const prod = products.find((p) => p._id === e.target.value);
                        setPoItems((prev) =>
                          prev.map((it, i) =>
                            i === idx
                              ? {
                                  ...it,
                                  productId: e.target.value,
                                  purchasePrice: Number(prod?.purchasePrice || 0),
                                  taxRate: Number(prod?.taxRate || 0),
                                }
                              : it
                          )
                        );
                      }}
                    >
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'Qty' : undefined}
                      type="number"
                      min={1}
                      value={row.orderedQuantity}
                      onChange={(e) =>
                        setPoItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, orderedQuantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : it))
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'Unit Cost' : undefined}
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.purchasePrice}
                      onChange={(e) =>
                        setPoItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, purchasePrice: parseFloat(e.target.value) || 0 } : it))
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'Tax %' : undefined}
                      type="number"
                      min={0}
                      step="0.1"
                      value={row.taxRate}
                      onChange={(e) =>
                        setPoItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, taxRate: parseFloat(e.target.value) || 0 } : it))
                        )
                      }
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      disabled={poItems.length <= 1}
                      onClick={() => setPoItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-red-600 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Discount" type="number" min={0} step="0.01" value={poForm.discountAmount} onChange={(e) => setPoForm({ ...poForm, discountAmount: e.target.value })} />
            <Input label="Shipping Cost" type="number" min={0} step="0.01" value={poForm.shippingCost} onChange={(e) => setPoForm({ ...poForm, shippingCost: e.target.value })} />
            <Input label="Paid Now" type="number" min={0} step="0.01" value={poForm.paidAmount} onChange={(e) => setPoForm({ ...poForm, paidAmount: e.target.value })} />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center text-sm">
            <span className="text-slate-600 dark:text-slate-300">Estimated PO Total</span>
            <span className="font-mono font-bold text-lg">{formatMoney(poGrandTotal, sym)}</span>
          </div>

          <Textarea label="Notes" rows={2} value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit">Save Purchase Order</Button>
          </div>
        </form>
      </Modal>

      {/* Partial/Full Receiving Modal */}
      <Modal
        open={Boolean(receiveTarget)}
        onClose={() => setReceiveTarget(null)}
        title={`Receive Inventory — ${receiveTarget?.purchase?.purchaseNumber}`}
        maxWidth="max-w-xl"
      >
        {receiveTarget && (
          <form onSubmit={handleReceiveSubmit} className="space-y-4">
            <p className="text-xs text-slate-500">
              Specify quantities received now. Partial receiving updates stock immediately and leaves remaining units open.
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {receiveTarget.items.map((it) => {
                const remaining = Math.max(0, Number(it.orderedQuantity) - Number(it.receivedQuantity || 0));
                return (
                  <div key={it._id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold">{it.productName}</p>
                      <p className="text-slate-500 font-mono">
                        Ordered: {it.orderedQuantity} · Already Received: {it.receivedQuantity || 0} · Remaining: {remaining}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      disabled={remaining === 0}
                      value={receiveQtys[it._id] ?? 0}
                      onChange={(e) =>
                        setReceiveQtys((prev) => ({ ...prev, [it._id]: Math.min(remaining, Math.max(0, parseInt(e.target.value, 10) || 0)) }))
                      }
                      className="w-20 h-8 px-2 text-right font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReceiveTarget(null)}>Cancel</Button>
              <Button type="submit">Confirm Stock Receipt</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* PO Detail Modal */}
      <Modal
        open={Boolean(detailData)}
        onClose={() => setDetailData(null)}
        title={`Purchase Invoice — ${detailData?.purchase?.purchaseNumber}`}
        maxWidth="max-w-2xl"
      >
        {detailData && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div><span className="text-slate-500">Supplier</span><p className="font-semibold">{detailData.purchase.supplierName}</p></div>
              <div><span className="text-slate-500">Status</span><p><StatusText status={detailData.purchase.status} /></p></div>
              <div><span className="text-slate-500">Total</span><p className="font-mono font-semibold">{formatMoney(detailData.purchase.totalAmount, sym)}</p></div>
              <div><span className="text-slate-500">Due</span><p className="font-mono font-semibold text-amber-600">{formatMoney(detailData.purchase.dueAmount, sym)}</p></div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Ordered</th>
                  <th className="py-2 text-right">Received</th>
                  <th className="py-2 text-right">Unit Cost</th>
                  <th className="py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {detailData.items.map((it) => (
                  <tr key={it._id}>
                    <td className="py-2 font-medium">{it.productName} <span className="font-mono text-slate-400">({it.sku})</span></td>
                    <td className="py-2 text-right font-mono">{it.orderedQuantity}</td>
                    <td className="py-2 text-right font-mono">{it.receivedQuantity || 0}</td>
                    <td className="py-2 text-right font-mono">{formatMoney(it.purchasePrice, sym)}</td>
                    <td className="py-2 text-right font-mono font-semibold">{formatMoney(it.lineTotal, sym)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          try {
            await apiRequest(`/api/purchases/${cancelTarget._id}/cancel`, { method: 'POST' });
            toast.success('Purchase order canceled');
            setCancelTarget(null);
            await loadData();
          } catch (err: any) {
            toast.error(err.message || 'Cancel failed');
          }
        }}
        title="Cancel Purchase Order"
        message={`Cancel purchase order ${cancelTarget?.purchaseNumber}?`}
        confirmLabel="Cancel Order"
      />
    </div>
  );
}

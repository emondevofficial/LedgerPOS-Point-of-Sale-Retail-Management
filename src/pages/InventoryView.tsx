import { ArrowUpDown, Plus, Search } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  StatCard,
  StatusText,
  TableSkeleton,
  Textarea,
} from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, cn, formatDateTime, formatMoney } from '../lib/api';

export function InventoryView() {
  const { settings, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canAdjust = can('inventory:adjust');

  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState('all');

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({
    productId: '',
    movementType: 'adjustment_in',
    quantity: '1',
    reason: '',
    reference: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [prodRes, movRes] = await Promise.all([
        apiRequest<{ rows: any[] }>(`/api/products?search=${encodeURIComponent(search)}&limit=400`),
        apiRequest<{ rows: any[] }>(
          `/api/inventory/movements?movementType=${movementType}&search=${encodeURIComponent(search)}&limit=150`
        ),
      ]);
      setProducts(prodRes.rows || []);
      setMovements(movRes.rows || []);
    } catch (err: any) {
      const msg = err.message || 'Failed to load inventory';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, movementType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdjustModal = (productId = '') => {
    setAdjForm({
      productId: productId || products[0]?._id || '',
      movementType: 'adjustment_in',
      quantity: '1',
      reason: '',
      reference: '',
    });
    setAdjustOpen(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          ...adjForm,
          quantity: Number(adjForm.quantity),
        }),
      });
      toast.success('Stock adjustment recorded');
      setAdjustOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Adjustment failed');
    }
  };

  const totalUnits = products.reduce((a, p) => a + Number(p.stockQuantity || 0), 0);
  const totalValuation = products.reduce(
    (a, p) => a + Number(p.stockQuantity || 0) * Number(p.purchasePrice || 0),
    0
  );
  const lowCount = products.filter(
    (p) => Number(p.stockQuantity) > 0 && Number(p.stockQuantity) <= Number(p.minStockAlert ?? 10)
  ).length;
  const outCount = products.filter((p) => Number(p.stockQuantity) <= 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Units in Stock" value={totalUnits} />
        <StatCard label="Cost Inventory Valuation" value={formatMoney(totalValuation, sym)} />
        <StatCard label="Low-Stock Alerts" value={lowCount} tone={lowCount > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Out-of-Stock SKUs" value={outCount} tone={outCount > 0 ? 'critical' : 'neutral'} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setTab('stock')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
              tab === 'stock'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            )}
          >
            Current Stock Levels
          </button>
          <button
            type="button"
            onClick={() => setTab('movements')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
              tab === 'movements'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            )}
          >
            Stock Movement Audit ({movements.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or product..."
              className="h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          {tab === 'movements' && (
            <Select value={movementType} onChange={(e) => setMovementType(e.target.value)} className="w-44">
              <option value="all">All Movement Types</option>
              <option value="opening">Opening Stock</option>
              <option value="purchase">Purchase Stock</option>
              <option value="sale">Sale Deduction</option>
              <option value="return_in">Return Restock</option>
              <option value="return_out">Purchase Return</option>
              <option value="adjustment_in">Adjustment In</option>
              <option value="adjustment_out">Adjustment Out</option>
              <option value="damaged">Damaged</option>
              <option value="expired">Expired</option>
              <option value="transfer">Transfer Out</option>
            </Select>
          )}
          {canAdjust && (
            <Button size="sm" onClick={() => openAdjustModal()}>
              <Plus className="w-3.5 h-3.5" /> Stock Adjustment
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : loadError ? (
        <ErrorState title="Failed to load inventory" message={loadError} onRetry={loadData} />
      ) : tab === 'stock' ? (
        products.length === 0 ? (
          <EmptyState title="No inventory items" description="Add products in Catalog to start tracking stock." />
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-3 px-4 font-medium">SKU</th>
                  <th className="py-3 px-4 font-medium">Product</th>
                  <th className="py-3 px-4 font-medium text-right">Current Stock</th>
                  <th className="py-3 px-4 font-medium text-right">Alert Threshold</th>
                  <th className="py-3 px-4 font-medium text-right">Cost Value</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {canAdjust && <th className="py-3 px-4 font-medium text-right">Adjust</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {products.map((p) => {
                  const qty = Number(p.stockQuantity || 0);
                  const min = Number(p.minStockAlert ?? 10);
                  const status = qty <= 0 ? 'Out of Stock' : qty <= min ? 'Low Stock' : 'In Stock';
                  return (
                    <tr key={p._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono text-slate-500">{p.sku}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">
                        {qty} {p.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">{min}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatMoney(qty * Number(p.purchasePrice || 0), sym)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText status={status} />
                      </td>
                      {canAdjust && (
                        <td className="py-2.5 px-4 text-right">
                          <Button variant="outline" size="sm" onClick={() => openAdjustModal(p._id)}>
                            <ArrowUpDown className="w-3 h-3" /> Adjust
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : movements.length === 0 ? (
        <EmptyState title="No stock movements recorded" description="Every purchase, sale, return, and manual stock adjustment is logged here." />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-3 px-4 font-medium">Date & Time</th>
                <th className="py-3 px-4 font-medium">Product</th>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium text-right">Prev</th>
                <th className="py-3 px-4 font-medium text-right">Change</th>
                <th className="py-3 px-4 font-medium text-right">New</th>
                <th className="py-3 px-4 font-medium">Reason & Reference</th>
                <th className="py-3 px-4 font-medium">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {movements.map((m) => (
                <tr key={m._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                  <td className="py-2.5 px-4">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{m.productName}</p>
                    <p className="font-mono text-[11px] text-slate-400">{m.sku}</p>
                  </td>
                  <td className="py-2.5 px-4 capitalize">{m.movementType.replace('_', ' ')}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">{m.previousQuantity}</td>
                  <td
                    className={cn(
                      'py-2.5 px-4 text-right font-mono tabular-nums font-semibold',
                      m.changedQuantity > 0 ? 'text-emerald-600' : m.changedQuantity < 0 ? 'text-red-600' : 'text-slate-500'
                    )}
                  >
                    {m.changedQuantity > 0 ? `+${m.changedQuantity}` : m.changedQuantity}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{m.newQuantity}</td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                    <p>{m.reason}</p>
                    {m.reference && <p className="font-mono text-[11px] text-slate-400">Ref: {m.reference}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{m.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Record Stock Movement" maxWidth="max-w-md">
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          <Select label="Product" value={adjForm.productId} onChange={(e) => setAdjForm({ ...adjForm, productId: e.target.value })} required>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.sku}) — Current: {p.stockQuantity}
              </option>
            ))}
          </Select>

          <Select label="Movement Type" value={adjForm.movementType} onChange={(e) => setAdjForm({ ...adjForm, movementType: e.target.value })}>
            <option value="adjustment_in">Stock In / Adjustment (+)</option>
            <option value="opening">Opening Stock (+)</option>
            <option value="adjustment_out">Stock Out / Deduction (-)</option>
            <option value="damaged">Damaged Stock (-)</option>
            <option value="expired">Expired Stock (-)</option>
            <option value="transfer">Branch Transfer Out (-)</option>
          </Select>

          <Input label="Quantity" type="number" min={1} value={adjForm.quantity} onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })} required />
          <Input label="Reference Code (Optional)" value={adjForm.reference} onChange={(e) => setAdjForm({ ...adjForm, reference: e.target.value })} placeholder="e.g. AUDIT-NOV" />
          <Textarea label="Reason (Required for Audit)" rows={2} value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} required placeholder="Describe why inventory is being adjusted..." />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button type="submit">Commit Movement</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

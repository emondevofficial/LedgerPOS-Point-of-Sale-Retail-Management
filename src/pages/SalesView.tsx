import { Download, Eye, Search, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PAYMENT_METHODS } from '../../shared/types';
import { InvoiceModal } from '../components/InvoiceModal';
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
import { apiRequest, downloadCsv, formatDateTime, formatMoney } from '../lib/api';
import { PrintableInvoiceData } from '../lib/pdf';

export function SalesView() {
  const { settings, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canCancel = can('sales:cancel');

  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [status, setStatus] = useState('all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const [invoiceData, setInvoiceData] = useState<PrintableInvoiceData | null>(null);
  const [cancelSaleTarget, setCancelSaleTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadSales = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({
        search,
        paymentMethod,
        status,
        limit: '200',
      });
      if (start) qs.set('start', start);
      if (end) qs.set('end', end);
      const res = await apiRequest<{ rows: any[] }>(`/api/sales?${qs.toString()}`);
      setSales(res.rows || []);
    } catch (err: any) {
      const msg = err.message || 'Failed to load sales';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, paymentMethod, status, start, end]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const openInvoice = async (saleId: string) => {
    try {
      const detail = await apiRequest<PrintableInvoiceData>(`/api/sales/${saleId}`);
      setInvoiceData(detail);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load invoice');
    }
  };

  const handleCancelSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelSaleTarget) return;
    try {
      await apiRequest(`/api/sales/${cancelSaleTarget._id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });
      toast.success(`Invoice ${cancelSaleTarget.invoiceNumber} canceled and stock restored`);
      setCancelSaleTarget(null);
      setCancelReason('');
      await loadSales();
    } catch (err: any) {
      toast.error(err.message || 'Cancellation failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, customer, cashier..."
              className="h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-64"
            />
          </div>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-40">
            <option value="all">All Methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="partial_return">Partial Return</option>
            <option value="refunded">Refunded</option>
            <option value="canceled">Canceled</option>
          </Select>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={sales.length === 0}
          onClick={() =>
            downloadCsv(
              'sales-history.csv',
              sales.map((s) => ({
                InvoiceNumber: s.invoiceNumber,
                Date: formatDateTime(s.saleDate),
                Customer: s.customerName,
                Cashier: s.cashierName,
                PaymentMethod: s.paymentMethod,
                GrandTotal: s.grandTotal,
                PaidAmount: s.paidAmount,
                DueAmount: s.dueAmount,
                PaymentStatus: s.paymentStatus,
                Status: s.status,
              }))
            )
          }
        >
          <Download className="w-3.5 h-3.5" /> Export Sales CSV
        </Button>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : loadError ? (
        <ErrorState title="Failed to load sales history" message={loadError} onRetry={loadSales} />
      ) : sales.length === 0 ? (
        <EmptyState title="No sales found" description="Completed POS checkouts will appear here with printable invoices." />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                <th className="py-3 px-4 font-medium">Invoice #</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Cashier</th>
                <th className="py-3 px-4 font-medium">Method</th>
                <th className="py-3 px-4 font-medium text-right">Total</th>
                <th className="py-3 px-4 font-medium text-right">Paid</th>
                <th className="py-3 px-4 font-medium text-right">Due</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sales.map((s) => (
                <tr key={s._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-mono font-semibold">{s.invoiceNumber}</td>
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{formatDateTime(s.saleDate)}</td>
                  <td className="py-2.5 px-4 font-medium">{s.customerName}</td>
                  <td className="py-2.5 px-4 text-slate-500">{s.cashierName}</td>
                  <td className="py-2.5 px-4">{s.paymentMethod}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{formatMoney(s.grandTotal, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-600">{formatMoney(s.paidAmount, sym)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-600">{formatMoney(s.dueAmount, sym)}</td>
                  <td className="py-2.5 px-4"><StatusText status={s.status === 'completed' ? s.paymentStatus : s.status} /></td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => openInvoice(s._id)}>
                        <Eye className="w-3.5 h-3.5" /> Invoice
                      </Button>
                      {canCancel && s.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelSaleTarget(s);
                            setCancelReason('');
                          }}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                          title="Cancel Sale"
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

      <InvoiceModal open={Boolean(invoiceData)} onClose={() => setInvoiceData(null)} data={invoiceData} />

      <Modal
        open={Boolean(cancelSaleTarget)}
        onClose={() => setCancelSaleTarget(null)}
        title={`Cancel Invoice ${cancelSaleTarget?.invoiceNumber}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCancelSale} className="space-y-4">
          <p className="text-xs text-slate-500">
            Canceling this sale will restock all sold items, reverse customer balances, and record an audit movement.
          </p>
          <Input
            label="Cancellation Reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            required
            placeholder="e.g. Customer canceled before dispatch"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelSaleTarget(null)}>Back</Button>
            <Button type="submit" variant="danger">Confirm Cancellation</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

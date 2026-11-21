import { Copy, Download, Printer } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { cn, formatDateTime, formatMoney } from '../lib/api';
import { generateInvoicePdf, PrintableInvoiceData } from '../lib/pdf';
import { BarcodeSvg } from './ui/BarcodeDisplay';
import { Button, Modal } from './ui/Primitives';

export function InvoiceModal({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: PrintableInvoiceData | null;
}) {
  const { settings } = useAuth();
  const [size, setSize] = useState<'a4' | '80mm' | '58mm'>(settings.defaultReceiptSize || '80mm');

  if (!data || !data.sale) return null;
  const { sale, items, customer } = data;
  const sym = settings.currencySymbol || '$';

  const handleCopySummary = async () => {
    const lines = [
      `${settings.businessName} — Invoice ${sale.invoiceNumber}`,
      `Date: ${formatDateTime(sale.saleDate)}`,
      `Customer: ${sale.customerName}`,
      ...items.map((it) => `- ${it.productName} x${it.quantity}: ${formatMoney(it.lineTotal, sym)}`),
      `Grand Total: ${formatMoney(sale.grandTotal, sym)}`,
      `Paid (${sale.paymentMethod}): ${formatMoney(sale.paidAmount, sym)}`,
      Number(sale.dueAmount) > 0 ? `Due: ${formatMoney(sale.dueAmount, sym)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      toast.success('Invoice summary copied to clipboard for sharing');
    } catch {
      toast.error('Unable to copy summary');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invoice ${sale.invoiceNumber}`}
      subtitle={`${formatDateTime(sale.saleDate)} · Cashier: ${sale.cashierName}`}
      maxWidth="max-w-3xl"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['a4', '80mm', '58mm'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSize(mode)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                  size === mode
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopySummary}>
              <Copy className="w-3.5 h-3.5" /> Share Text
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                generateInvoicePdf(data, settings, size);
                toast.success(`Downloaded ${size.toUpperCase()} PDF`);
              }}
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex justify-center bg-slate-100 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto">
        <div
          id="pos-print-area"
          className={cn(
            'bg-white text-slate-900 border border-slate-200 shadow-sm',
            size === 'a4' && 'w-full max-w-[680px] p-8 text-sm',
            size === '80mm' && 'w-[302px] p-4 text-xs font-mono',
            size === '58mm' && 'w-[220px] p-3 text-[11px] font-mono'
          )}
        >
          {/* Header */}
          <div className={cn(size === 'a4' ? 'flex justify-between items-start pb-6 border-b border-slate-200' : 'text-center pb-3 border-b border-dashed border-slate-300')}>
            <div className={cn(size === 'a4' ? 'flex items-start gap-3' : 'flex flex-col items-center')}>
              {settings.logo && (
                <img
                  src={settings.logo}
                  alt={settings.businessName}
                  referrerPolicy="no-referrer"
                  className={cn('object-contain rounded', size === 'a4' ? 'w-12 h-12' : 'w-10 h-10 mb-1.5')}
                />
              )}
              <div>
                <h2 className={cn('font-bold text-slate-900', size === 'a4' ? 'text-lg' : 'text-sm')}>
                  {settings.businessName}
                </h2>
                {settings.address && <p className="text-slate-600 text-[11px]">{settings.address}</p>}
                {(settings.phone || settings.email) && (
                  <p className="text-slate-500 text-[11px]">
                    {[settings.phone, settings.email].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <div className={cn(size === 'a4' ? 'text-right' : 'mt-2 text-left text-[11px]')}>
              {size === 'a4' && <p className="text-base font-bold tracking-tight">INVOICE</p>}
              <p className="font-mono font-semibold">{sale.invoiceNumber}</p>
              <p className="text-slate-500 text-[11px]">{formatDateTime(sale.saleDate)}</p>
              <p className="text-slate-600 text-[11px]">Cashier: {sale.cashierName}</p>
            </div>
          </div>

          {/* Customer */}
          <div className={cn(size === 'a4' ? 'py-4 flex justify-between text-xs' : 'py-2 border-b border-dashed border-slate-300 text-[11px]')}>
            <div>
              <span className="text-slate-500">Customer: </span>
              <span className="font-semibold text-slate-900">{sale.customerName}</span>
              {customer?.phone && <span className="text-slate-500"> · {customer.phone}</span>}
            </div>
            {sale.status !== 'completed' && (
              <span className="font-semibold text-red-600 uppercase">{sale.status.replace('_', ' ')}</span>
            )}
          </div>

          {/* Items */}
          {size === 'a4' ? (
            <table className="w-full text-xs border-collapse mt-2">
              <thead>
                <tr className="border-y border-slate-200 text-slate-500 text-left">
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium text-right">Qty</th>
                  <th className="py-2 font-medium text-right">Unit Price</th>
                  <th className="py-2 font-medium text-right">Discount</th>
                  <th className="py-2 font-medium text-right">Tax</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it._id}>
                    <td className="py-2.5">
                      <p className="font-medium text-slate-900">{it.productName}</p>
                      <p className="text-[11px] font-mono text-slate-500">{it.sku}</p>
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{it.quantity}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(it.unitPrice, sym)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(it.discountAmount, sym)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatMoney(it.taxAmount, sym)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums">
                      {formatMoney(it.lineTotal, sym)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-2 space-y-2 border-b border-dashed border-slate-300">
              {items.map((it) => (
                <div key={it._id}>
                  <p className="font-semibold text-slate-900 leading-tight">{it.productName}</p>
                  <div className="flex justify-between text-slate-600">
                    <span>
                      {it.quantity} x {formatMoney(it.unitPrice, sym)}
                    </span>
                    <span className="font-semibold text-slate-900">{formatMoney(it.lineTotal, sym)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className={cn('mt-4 space-y-1', size === 'a4' ? 'w-64 ml-auto text-xs' : 'text-[11px]')}>
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.subtotal, sym)}</span>
            </div>
            {(Number(sale.itemDiscountTotal) > 0 || Number(sale.invoiceDiscountAmount) > 0) && (
              <div className="flex justify-between">
                <span className="text-slate-500">Discount</span>
                <span className="font-mono tabular-nums">
                  -{formatMoney(Number(sale.itemDiscountTotal || 0) + Number(sale.invoiceDiscountAmount || 0), sym)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Tax / VAT</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.taxAmount, sym)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-slate-200">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.grandTotal, sym)}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-500">Paid ({sale.paymentMethod})</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.paidAmount, sym)}</span>
            </div>
            {Array.isArray(sale.paymentSplit) && sale.paymentSplit.length > 1 && (
              <div className="pl-2 text-[10px] text-slate-500 space-y-0.5">
                {sale.paymentSplit.map((sp: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span>{sp.method}</span>
                    <span>{formatMoney(sp.amount, sym)}</span>
                  </div>
                ))}
              </div>
            )}
            {Number(sale.dueAmount) > 0 && (
              <div className="flex justify-between font-semibold text-red-600">
                <span>Due Balance</span>
                <span className="font-mono tabular-nums">{formatMoney(sale.dueAmount, sym)}</span>
              </div>
            )}
            {Number(sale.changeAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Change Returned</span>
                <span className="font-mono tabular-nums">{formatMoney(sale.changeAmount, sym)}</span>
              </div>
            )}
          </div>

          {sale.notes && (
            <p className="mt-4 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              Note: {sale.notes}
            </p>
          )}

          <div className="mt-5 pt-3 border-t border-dashed border-slate-300 flex flex-col items-center text-center gap-2">
            <BarcodeSvg value={sale.invoiceNumber} height={26} width={1.2} displayValue={false} />
            <p className="text-[11px] text-slate-500">{settings.invoiceFooter}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

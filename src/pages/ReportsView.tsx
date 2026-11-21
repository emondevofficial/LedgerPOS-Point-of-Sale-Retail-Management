import { Download, FileSpreadsheet, Printer, Search } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, EmptyState, Select, TableSkeleton } from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, downloadCsv } from '../lib/api';
import { generateReportPdf } from '../lib/pdf';

const REPORT_CATALOG = [
  { key: 'daily_sales', label: 'Daily Sales Report' },
  { key: 'weekly_sales', label: 'Weekly Sales Report' },
  { key: 'monthly_sales', label: 'Monthly Sales Report' },
  { key: 'yearly_sales', label: 'Yearly Sales Report' },
  { key: 'sales_by_product', label: 'Sales by Product' },
  { key: 'sales_by_category', label: 'Sales by Category' },
  { key: 'sales_by_customer', label: 'Sales by Customer' },
  { key: 'sales_by_cashier', label: 'Sales by Cashier' },
  { key: 'sales_by_payment_method', label: 'Sales by Payment Method' },
  { key: 'purchase_report', label: 'Purchase Report' },
  { key: 'stock_report', label: 'Stock Levels Report' },
  { key: 'inventory_valuation', label: 'Inventory Valuation Report' },
  { key: 'low_stock_report', label: 'Low-Stock & Out-of-Stock Report' },
  { key: 'expired_products', label: 'Expired & Expiring Products Report' },
  { key: 'profit_report', label: 'Profit & Loss Summary Report' },
  { key: 'expense_report', label: 'Expense Report' },
  { key: 'tax_report', label: 'Tax / VAT Report' },
  { key: 'return_report', label: 'Returns & Refunds Report' },
  { key: 'customer_due_report', label: 'Customer Due Report' },
  { key: 'supplier_due_report', label: 'Supplier Due Report' },
];

export function ReportsView() {
  const { settings } = useAuth();
  const [reportType, setReportType] = useState('daily_sales');
  const [preset, setPreset] = useState('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ preset });
      if (preset === 'custom' && startDate) qs.set('start', startDate);
      if (preset === 'custom' && endDate) qs.set('end', endDate);
      const data = await apiRequest<Record<string, any>[]>(`/api/reports/${reportType}?${qs.toString()}`);
      setRows(data || []);
      setPage(1);
      setSortCol('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [reportType, preset, startDate, endDate]);

  useEffect(() => {
    if (preset !== 'custom' || (startDate && endDate)) {
      loadReport();
    }
  }, [loadReport, preset, startDate, endDate]);

  const filteredAndSorted = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
    }
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = a[sortCol] ?? '';
        const bv = b[sortCol] ?? '';
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, search, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const pagedRows = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize);
  const columns = pagedRows.length > 0 ? Object.keys(pagedRows[0]) : rows.length > 0 ? Object.keys(rows[0]) : [];
  const reportTitle = REPORT_CATALOG.find((r) => r.key === reportType)?.label || 'Report';

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select label="Report Type" value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {REPORT_CATALOG.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </Select>

          <Select label="Date Range" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="prev_month">Previous Month</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </Select>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Filter Results</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search rows..."
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={filteredAndSorted.length === 0}
              onClick={() => downloadCsv(`${reportType}.csv`, filteredAndSorted)}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={filteredAndSorted.length === 0}
              onClick={() =>
                generateReportPdf(
                  reportTitle,
                  `Range: ${preset} · Generated ${new Date().toLocaleString()}`,
                  filteredAndSorted,
                  settings
                )
              }
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 pt-1">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
          </div>
        )}
      </div>

      {/* Report Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : filteredAndSorted.length === 0 ? (
        <EmptyState title="No report records" description="No database records match the selected report and date filter." />
      ) : (
        <div id="pos-print-area" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{reportTitle}</h3>
            <span className="text-xs text-slate-500 font-mono">{filteredAndSorted.length} record(s)</span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                {columns.map((col) => {
                  const isNumeric = typeof pagedRows[0]?.[col] === 'number';
                  return (
                    <th key={col} className={`py-3 px-4 font-medium ${isNumeric ? 'text-right' : ''}`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortCol(col);
                            setSortDir('desc');
                          }
                        }}
                        className="hover:text-slate-900 dark:hover:text-slate-100 capitalize cursor-pointer"
                      >
                        {col.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}
                        {sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagedRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  {columns.map((col) => {
                    const val = row[col];
                    const isNum = typeof val === 'number';
                    return (
                      <td key={col} className={`py-2.5 px-4 ${isNum ? 'text-right font-mono tabular-nums font-medium' : ''}`}>
                        {isNum ? val.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(val) ? 0 : 2, maximumFractionDigits: 2 }) : String(val ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

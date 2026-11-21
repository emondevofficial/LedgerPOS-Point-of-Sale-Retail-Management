import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StoreSettingsDTO } from '../../shared/types';
import { formatDateTime, formatMoney } from './api';

export interface PrintableInvoiceData {
  sale: Record<string, any>;
  items: Record<string, any>[];
  customer?: Record<string, any> | null;
}

export function generateInvoicePdf(
  data: PrintableInvoiceData,
  settings: StoreSettingsDTO,
  format: 'a4' | '80mm' | '58mm'
) {
  const sym = settings.currencySymbol || '$';
  const { sale, items } = data;

  if (format === 'a4') {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(18);
    doc.text(settings.businessName || 'LedgerPOS', 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100);
    if (settings.address) doc.text(settings.address, 14, 24);
    doc.text(
      [settings.phone, settings.email, settings.website].filter(Boolean).join('  |  '),
      14,
      29
    );

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('INVOICE', 196, 18, { align: 'right' });
    doc.setFontSize(9);
    doc.text(`Invoice #: ${sale.invoiceNumber}`, 196, 24, { align: 'right' });
    doc.text(`Date: ${formatDateTime(sale.saleDate)}`, 196, 29, { align: 'right' });
    doc.text(`Cashier: ${sale.cashierName}`, 196, 34, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 38, 196, 38);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('BILL TO:', 14, 45);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(sale.customerName || 'Walk-in Customer', 14, 50);
    if (data.customer?.phone) doc.text(`Phone: ${data.customer.phone}`, 14, 55);
    if (data.customer?.address) doc.text(data.customer.address, 14, 60);

    autoTable(doc, {
      startY: 66,
      head: [['Item', 'SKU', 'Qty', 'Price', 'Discount', 'Tax', 'Total']],
      body: items.map((it) => [
        it.productName,
        it.sku,
        String(it.quantity),
        formatMoney(it.unitPrice, sym),
        formatMoney(it.discountAmount, sym),
        formatMoney(it.taxAmount, sym),
        formatMoney(it.lineTotal, sym),
      ]),
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    let y = finalY + 8;
    const summaryRows: Array<[string, string]> = [
      ['Subtotal', formatMoney(sale.subtotal, sym)],
      [
        'Total Discount',
        `-${formatMoney(Number(sale.itemDiscountTotal || 0) + Number(sale.invoiceDiscountAmount || 0), sym)}`,
      ],
      ['Tax / VAT', formatMoney(sale.taxAmount, sym)],
      ['Grand Total', formatMoney(sale.grandTotal, sym)],
      ['Paid (' + sale.paymentMethod + ')', formatMoney(sale.paidAmount, sym)],
      ['Due Amount', formatMoney(sale.dueAmount, sym)],
    ];
    if (Number(sale.changeAmount) > 0) {
      summaryRows.push(['Change Returned', formatMoney(sale.changeAmount, sym)]);
    }

    doc.setFontSize(9);
    for (const [label, val] of summaryRows) {
      doc.setFont('helvetica', label === 'Grand Total' ? 'bold' : 'normal');
      doc.text(label, 140, y);
      doc.text(val, 196, y, { align: 'right' });
      y += 5.5;
    }

    if (settings.invoiceFooter) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100);
      doc.text(settings.invoiceFooter, 105, 282, { align: 'center' });
    }

    doc.save(`${sale.invoiceNumber}-A4.pdf`);
    return;
  }

  // Thermal Receipt PDF (80mm or 58mm)
  const widthMm = format === '58mm' ? 58 : 80;
  const estHeight = Math.max(130, 85 + items.length * 10);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [widthMm, estHeight] });
  const center = widthMm / 2;
  const margin = 4;
  let y = 8;

  doc.setFontSize(format === '58mm' ? 10 : 12);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.businessName || 'LedgerPOS', center, y, { align: 'center' });
  y += 4.5;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  if (settings.address) {
    doc.text(settings.address, center, y, { align: 'center', maxWidth: widthMm - 8 });
    y += 4;
  }
  if (settings.phone) {
    doc.text(`Tel: ${settings.phone}`, center, y, { align: 'center' });
    y += 4;
  }

  doc.text('------------------------------------------', center, y, { align: 'center' });
  y += 4;
  doc.text(`Inv: ${sale.invoiceNumber}`, margin, y);
  y += 3.8;
  doc.text(`Date: ${formatDateTime(sale.saleDate)}`, margin, y);
  y += 3.8;
  doc.text(`Cashier: ${sale.cashierName}`, margin, y);
  y += 3.8;
  doc.text(`Customer: ${sale.customerName}`, margin, y);
  y += 4;
  doc.text('------------------------------------------', center, y, { align: 'center' });
  y += 4;

  for (const it of items) {
    doc.setFont('helvetica', 'bold');
    doc.text(it.productName, margin, y, { maxWidth: widthMm - 8 });
    y += 3.8;
    doc.setFont('helvetica', 'normal');
    doc.text(`${it.quantity} x ${formatMoney(it.unitPrice, sym)}`, margin, y);
    doc.text(formatMoney(it.lineTotal, sym), widthMm - margin, y, { align: 'right' });
    y += 4.2;
  }

  doc.text('------------------------------------------', center, y, { align: 'center' });
  y += 4;

  const lines: Array<[string, string, boolean?]> = [
    ['Subtotal', formatMoney(sale.subtotal, sym)],
    ['Tax', formatMoney(sale.taxAmount, sym)],
    ['Discount', formatMoney(Number(sale.itemDiscountTotal || 0) + Number(sale.invoiceDiscountAmount || 0), sym)],
    ['TOTAL', formatMoney(sale.grandTotal, sym), true],
    [`Paid (${sale.paymentMethod})`, formatMoney(sale.paidAmount, sym)],
    ['Due', formatMoney(sale.dueAmount, sym)],
  ];
  if (Number(sale.changeAmount) > 0) lines.push(['Change', formatMoney(sale.changeAmount, sym)]);

  for (const [k, v, bold] of lines) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(k, margin, y);
    doc.text(v, widthMm - margin, y, { align: 'right' });
    y += bold ? 4.8 : 3.8;
  }

  y += 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (settings.invoiceFooter) {
    doc.text(settings.invoiceFooter, center, y, { align: 'center', maxWidth: widthMm - 8 });
  }

  doc.save(`${sale.invoiceNumber}-${format}.pdf`);
}

export function generateReportPdf(
  title: string,
  subtitle: string,
  rows: Record<string, any>[],
  settings: StoreSettingsDTO
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text(`${settings.businessName || 'LedgerPOS'} — ${title}`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(subtitle, 14, 21);

  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    autoTable(doc, {
      startY: 26,
      head: [cols.map((c) => c.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim())],
      body: rows.map((r) =>
        cols.map((c) => {
          const val = r[c];
          return typeof val === 'number' ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(val ?? '');
        })
      ),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    });
  } else {
    doc.text('No records found for the selected criteria.', 14, 34);
  }

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`${slug}-report.pdf`);
}

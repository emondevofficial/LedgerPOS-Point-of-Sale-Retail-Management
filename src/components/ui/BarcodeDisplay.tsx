import JsBarcode from 'jsbarcode';
import { Printer } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { formatMoney } from '../../lib/api';
import { Button, Modal } from './Primitives';

export function BarcodeSvg({
  value,
  height = 36,
  width = 1.5,
  displayValue = true,
}: {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue,
        fontSize: 11,
        margin: 4,
        background: 'transparent',
        lineColor: '#0f172a',
      });
    } catch {
      // Fallback for invalid characters
    }
  }, [value, height, width, displayValue]);

  return <svg ref={svgRef} className="max-w-full bg-white rounded px-1" />;
}

export function BarcodeLabelModal({
  open,
  onClose,
  product,
  currencySymbol,
  businessName,
}: {
  open: boolean;
  onClose: () => void;
  product: Record<string, any> | null;
  currencySymbol: string;
  businessName: string;
}) {
  const [copies, setCopies] = React.useState(6);

  if (!product) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Print Barcode Labels"
      subtitle={`${product.name} · SKU ${product.sku}`}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print Labels
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Number of labels on sheet
          </label>
          <input
            type="number"
            min={1}
            max={40}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
            className="w-24 h-8 px-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 font-mono"
          />
        </div>

        <div
          id="pos-print-area"
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-white text-slate-900 border border-slate-200 rounded-lg"
        >
          {Array.from({ length: copies }).map((_, idx) => (
            <div
              key={idx}
              className="border border-dashed border-slate-300 rounded p-2.5 flex flex-col items-center text-center"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 truncate max-w-full">
                {businessName}
              </span>
              <span className="text-xs font-semibold text-slate-900 truncate max-w-full mt-0.5">
                {product.name}
              </span>
              <div className="my-1">
                <BarcodeSvg value={product.barcode || product.sku} height={32} width={1.3} />
              </div>
              <span className="text-xs font-mono font-bold text-slate-900">
                {formatMoney(product.sellingPrice, currencySymbol)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

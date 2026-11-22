import { AlertTriangle, Package, RefreshCw, X } from 'lucide-react';
import React, { useEffect } from 'react';
import { cn } from '../../lib/api';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 border border-transparent',
    secondary:
      'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white border border-transparent',
    outline:
      'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 border border-transparent',
    danger:
      'bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 border border-transparent',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-sm gap-2',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <div className="w-full space-y-1">
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 transition-colors',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function Select({
  className,
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="w-full space-y-1">
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          {label}
        </label>
      )}
      <select
        className={cn(
          'w-full h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 transition-colors',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Textarea({
  className,
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <div className="w-full space-y-1">
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 transition-colors',
          className
        )}
        {...props}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-xl',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]">
      <div
        className={cn(
          'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl flex flex-col max-h-[90vh]',
          maxWidth
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0 bg-slate-50/70 dark:bg-slate-900/70 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing...' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}

export function StatCard({
  label,
  value,
  meta,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  meta?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
}) {
  const toneClass = {
    neutral: 'text-slate-900 dark:text-slate-100',
    positive: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    critical: 'text-red-600 dark:text-red-400',
  }[tone];

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
      <p className={cn('text-xl font-semibold mt-1.5 font-mono tabular-nums tracking-tight', toneClass)}>
        {value}
      </p>
      {meta && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{meta}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/50 dark:bg-slate-900/30">
      <Package className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-3" />
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-rose-200 dark:border-rose-900/60 rounded-xl bg-rose-50/60 dark:bg-rose-950/20">
      <div className="p-2.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mb-3">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mt-1">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3 animate-pulse">
            {Array.from({ length: cols }).map((__, c) => (
              <div
                key={c}
                className="h-3.5 rounded bg-slate-200 dark:bg-slate-800 flex-1"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductImage({
  src,
  alt,
  className = 'w-10 h-10',
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          'rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0',
          className
        )}
        aria-label={alt}
      >
        <Package className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(
        'rounded-lg object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0',
        className
      )}
    />
  );
}

export function StatusText({
  status,
}: {
  status: string;
}) {
  const norm = status.toLowerCase();
  let color = 'text-slate-600 dark:text-slate-400';
  if (['paid', 'completed', 'active', 'received', 'in stock', 'nominal'].includes(norm)) {
    color = 'text-emerald-600 dark:text-emerald-400';
  } else if (['partial', 'partial_received', 'ordered', 'low stock', 'expiring soon', 'draft'].includes(norm)) {
    color = 'text-amber-600 dark:text-amber-400';
  } else if (['unpaid', 'canceled', 'refunded', 'out of stock', 'expired', 'inactive', 'damaged'].includes(norm)) {
    color = 'text-red-600 dark:text-red-400';
  }

  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={cn('text-xs font-medium whitespace-nowrap', color)}>{label}</span>;
}

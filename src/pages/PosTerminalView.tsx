import {
  Barcode,
  Bookmark,
  CheckCircle2,
  FolderClock,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PAYMENT_METHODS, SINGLE_PAYMENT_METHODS } from '../../shared/types';
import { InvoiceModal } from '../components/InvoiceModal';
import {
  Button,
  EmptyState,
  Input,
  Modal,
  ProductImage,
  Select,
  Textarea,
} from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, cn, formatDateTime, formatMoney } from '../lib/api';
import { PrintableInvoiceData } from '../lib/pdf';

interface CartItem {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  unitPrice: number;
  maxStock: number;
  quantity: number;
  discountType: 'fixed' | 'percent';
  discountValue: number;
  taxRate: number;
}

export function PosTerminalView() {
  const { settings, user, can } = useAuth();
  const sym = settings.currencySymbol || '$';

  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [heldCarts, setHeldCarts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState(0);
  const [notes, setNotes] = useState('');
  const [activeHeldCartId, setActiveHeldCartId] = useState<string | undefined>(undefined);

  // Checkout Modal State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>(settings.defaultPaymentMethod || 'Cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentSplit, setPaymentSplit] = useState<Array<{ method: string; amount: number }>>([
    { method: 'Cash', amount: 0 },
    { method: 'Card', amount: 0 },
  ]);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);

  // Modals
  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [holdPromptOpen, setHoldPromptOpen] = useState(false);
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  // Invoice Print Modal
  const [completedInvoice, setCompletedInvoice] = useState<PrintableInvoiceData | null>(null);

  const loadPosData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, custRes, heldRes] = await Promise.all([
        apiRequest<{ rows: any[] }>('/api/products?status=active&limit=500'),
        apiRequest<any[]>('/api/categories'),
        apiRequest<any[]>('/api/customers'),
        apiRequest<any[]>('/api/pos/held-carts'),
      ]);
      setProducts(prodRes.rows || []);
      setCategories(catRes.filter((c) => c.status === 'active'));
      setCustomers(custRes);
      setHeldCarts(heldRes);
      if (!selectedCustomerId && custRes.length > 0) {
        const walkIn = custRes.find((c) => c.isWalkIn) || custRes[0];
        setSelectedCustomerId(walkIn._id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load POS catalog');
    } finally {
      setLoading(false);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    loadPosData();
  }, [loadPosData]);

  // Keyboard shortcuts for fast cashier workflow
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        barcodeRef.current?.focus();
      } else if (e.key === 'F8' && cart.length > 0) {
        e.preventDefault();
        setHoldPromptOpen(true);
      } else if (e.key === 'F9' && cart.length > 0) {
        e.preventDefault();
        openCheckoutModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCategory !== 'all') {
      list = list.filter((p) => String(p.categoryId) === activeCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          String(p.barcode || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, activeCategory, search]);

  const addToCart = useCallback((product: any) => {
    if (Number(product.stockQuantity) <= 0) {
      toast.error(`"${product.name}" is out of stock`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product._id);
      if (existing) {
        if (existing.quantity + 1 > Number(product.stockQuantity)) {
          toast.error(`Stock limit reached for "${product.name}" (${product.stockQuantity} available)`);
          return prev;
        }
        return prev.map((i) =>
          i.productId === product._id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode || '',
          unitPrice: Number(product.sellingPrice),
          maxStock: Number(product.stockQuantity),
          quantity: 1,
          discountType: 'fixed',
          discountValue: 0,
          taxRate: settings.enableTax ? Number(product.taxRate ?? settings.defaultTaxRate ?? 0) : 0,
        },
      ];
    });
  }, [settings]);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim().toLowerCase();
    if (!code) return;
    const match = products.find(
      (p) => String(p.barcode || '').toLowerCase() === code || p.sku.toLowerCase() === code
    );
    if (match) {
      addToCart(match);
      setBarcodeInput('');
    } else {
      toast.error(`No product found matching barcode/SKU "${barcodeInput}"`);
    }
  };

  const updateCartQty = (productId: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        if (nextQty > i.maxStock) {
          toast.error(`Only ${i.maxStock} units available in stock`);
          return { ...i, quantity: i.maxStock };
        }
        return { ...i, quantity: nextQty };
      })
    );
  };

  const updateItemDiscount = (productId: string, val: number) => {
    setCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, discountValue: Math.max(0, val) } : i))
    );
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let itemDiscountTotal = 0;
    const lineNets: { net: number; taxRate: number }[] = [];

    for (const item of cart) {
      const gross = item.unitPrice * item.quantity;
      const disc = settings.enableDiscounts
        ? item.discountType === 'percent'
          ? (gross * Math.min(100, item.discountValue)) / 100
          : Math.min(gross, item.discountValue)
        : 0;
      const net = Math.max(0, gross - disc);
      subtotal += gross;
      itemDiscountTotal += disc;
      lineNets.push({ net, taxRate: item.taxRate });
    }

    const afterItemDisc = Math.max(0, subtotal - itemDiscountTotal);
    const invoiceDisc = settings.enableDiscounts
      ? invoiceDiscountType === 'percent'
        ? (afterItemDisc * Math.min(100, invoiceDiscountValue)) / 100
        : Math.min(afterItemDisc, invoiceDiscountValue)
      : 0;

    let taxAmount = 0;
    for (const ln of lineNets) {
      const share = afterItemDisc > 0 ? ln.net / afterItemDisc : 0;
      const taxable = Math.max(0, ln.net - invoiceDisc * share);
      taxAmount += (taxable * ln.taxRate) / 100;
    }

    const grandTotal = Math.max(0, afterItemDisc - invoiceDisc + taxAmount);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      itemDiscountTotal: Math.round(itemDiscountTotal * 100) / 100,
      invoiceDisc: Math.round(invoiceDisc * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  }, [cart, invoiceDiscountType, invoiceDiscountValue, settings]);

  const openCheckoutModal = () => {
    if (cart.length === 0) return;
    setPaidAmount(totals.grandTotal.toFixed(2));
    setPaymentSplit([
      { method: 'Cash', amount: totals.grandTotal },
      { method: 'Card', amount: 0 },
    ]);
    setCheckoutOpen(true);
  };

  const selectedCustomer = customers.find((c) => c._id === selectedCustomerId);
  const numericPaid =
    paymentMethod === 'Mixed Payment'
      ? paymentSplit.reduce((acc, s) => acc + Number(s.amount || 0), 0)
      : Number(paidAmount || 0);
  const dueAmount = Math.max(0, Math.round((totals.grandTotal - Math.min(totals.grandTotal, numericPaid)) * 100) / 100);
  const changeAmount = Math.max(0, Math.round((numericPaid - totals.grandTotal) * 100) / 100);

  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      toast.error('Select a customer first');
      return;
    }
    setSubmittingCheckout(true);
    try {
      const clientRequestId = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const result = await apiRequest<{ sale: any; items: any[] }>('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId,
          customerId: selectedCustomerId,
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            discountType: i.discountType,
            discountValue: i.discountValue,
          })),
          invoiceDiscountType,
          invoiceDiscountValue,
          paidAmount: numericPaid,
          paymentMethod,
          paymentSplit: paymentMethod === 'Mixed Payment' ? paymentSplit : [],
          notes,
          heldCartId: activeHeldCartId,
        }),
      });

      toast.success(`Invoice ${result.sale.invoiceNumber} completed`);
      setCheckoutOpen(false);
      setCart([]);
      setInvoiceDiscountValue(0);
      setNotes('');
      setActiveHeldCartId(undefined);
      setCompletedInvoice({
        sale: result.sale,
        items: result.items,
        customer: selectedCustomer || null,
      });
      await loadPosData();
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleHoldCart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/pos/held-carts', {
        method: 'POST',
        body: JSON.stringify({
          label: holdLabel || `Hold ${new Date().toLocaleTimeString()}`,
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.name || 'Walk-in Customer',
          items: cart.map((c) => ({
            productId: c.productId,
            name: c.name,
            sku: c.sku,
            barcode: c.barcode,
            unitPrice: c.unitPrice,
            quantity: c.quantity,
            discountAmount: c.discountValue,
            taxRate: c.taxRate,
          })),
          invoiceDiscountType,
          invoiceDiscountValue,
          notes,
        }),
      });
      toast.success('Cart placed on hold');
      setCart([]);
      setHoldLabel('');
      setHoldPromptOpen(false);
      setNotes('');
      setInvoiceDiscountValue(0);
      await loadPosData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to hold cart');
    }
  };

  const restoreHeldCart = (held: any) => {
    const restored: CartItem[] = held.items.map((it: any) => {
      const liveProd = products.find((p) => p._id === it.productId);
      return {
        productId: it.productId,
        name: it.name,
        sku: it.sku,
        barcode: it.barcode || '',
        unitPrice: Number(liveProd?.sellingPrice ?? it.unitPrice),
        maxStock: Number(liveProd?.stockQuantity ?? it.quantity),
        quantity: Math.min(Number(it.quantity), Number(liveProd?.stockQuantity ?? it.quantity)),
        discountType: 'fixed',
        discountValue: Number(it.discountAmount || 0),
        taxRate: Number(it.taxRate || 0),
      };
    });
    setCart(restored);
    if (held.customerId) setSelectedCustomerId(held.customerId);
    setInvoiceDiscountType(held.invoiceDiscountType || 'fixed');
    setInvoiceDiscountValue(Number(held.invoiceDiscountValue || 0));
    setNotes(held.notes || '');
    setActiveHeldCartId(held._id);
    setHeldModalOpen(false);
    toast.success(`Restored cart "${held.label}"`);
  };

  const handleQuickCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiRequest('/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name: newCustName, phone: newCustPhone, customerType: 'retail' }),
      });
      toast.success(`Customer "${created.name}" added`);
      setCustomers((prev) => [...prev, created]);
      setSelectedCustomerId(created._id);
      setQuickCustOpen(false);
      setNewCustName('');
      setNewCustPhone('');
    } catch (err: any) {
      toast.error(err.message || 'Could not add customer');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left: Catalog & Scanner (7 cols) */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-4">
        {/* Search & Barcode Bar */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product name or SKU (F2)"
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            {settings.enableBarcodeScanning && (
              <form onSubmit={handleBarcodeSubmit} className="relative">
                <Barcode className="w-4 h-4 text-emerald-600 absolute left-3 top-2.5" />
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan barcode + Enter (F4)"
                  className="w-full h-9 pl-9 pr-3 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </form>
            )}
          </div>

          {/* Categories Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer',
                activeCategory === 'all'
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat._id}
                type="button"
                onClick={() => setActiveCategory(cat._id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer',
                  activeCategory === cat._id
                    ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            title={products.length === 0 ? 'No products in catalog yet' : 'No matching products'}
            description={
              products.length === 0
                ? 'Load the starter catalog or add products in Products & Catalog to begin billing.'
                : 'Adjust your search filter or add products in Product Management.'
            }
            actionLabel={products.length === 0 && can('settings:manage') ? 'Load Sample Store Data' : undefined}
            onAction={
              products.length === 0 && can('settings:manage')
                ? async () => {
                    try {
                      const res = await apiRequest<{ productsCreated: number }>('/api/settings/seed-sample', { method: 'POST' });
                      toast.success(`Loaded ${res.productsCreated} sample products and starter store records`);
                      await loadPosData();
                    } catch (err: any) {
                      toast.error(err.message || 'Could not load sample data');
                    }
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((product) => {
              const out = Number(product.stockQuantity) <= 0;
              const low = !out && Number(product.stockQuantity) <= Number(product.minStockAlert ?? 10);
              return (
                <button
                  key={product._id}
                  type="button"
                  disabled={out}
                  onClick={() => addToCart(product)}
                  className={cn(
                    'text-left p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 transition-colors flex flex-col justify-between cursor-pointer',
                    out && 'opacity-50 cursor-not-allowed hover:border-slate-200 dark:hover:border-slate-800'
                  )}
                >
                  <div>
                    <ProductImage src={product.image} alt={product.name} className="w-full h-24 mb-2.5" />
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                      {product.name}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{product.sku}</p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatMoney(product.sellingPrice, sym)}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-mono tabular-nums',
                        out ? 'text-red-600' : low ? 'text-amber-600' : 'text-slate-500'
                      )}
                    >
                      {out ? 'Out' : `${product.stockQuantity} ${product.unit || 'pcs'}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Active Cart & Billing Summary (5 cols) */}
      <div className="lg:col-span-5 xl:col-span-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:sticky lg:top-20 max-h-[calc(100vh-6rem)]">
        {/* Cart Top Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold">Current Sale</h2>
              <span className="text-xs text-slate-500 font-mono">({cart.reduce((a, b) => a + b.quantity, 0)} items)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setHeldModalOpen(true)}>
                <FolderClock className="w-3.5 h-3.5" /> Held ({heldCarts.length})
              </Button>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => { setCart([]); setActiveHeldCartId(undefined); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Select
              label="Customer"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''} {Number(c.currentDue) > 0 ? `· Due ${formatMoney(c.currentDue, sym)}` : ''}
                </option>
              ))}
            </Select>
            {can('customers:manage') && (
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setQuickCustOpen(true)} title="Quick add customer">
                <UserPlus className="w-4 h-4" />
              </Button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">Cashier: {user?.name}</p>
        </div>

        {/* Cart Line Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-4 min-h-[180px]">
          {cart.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Tap a product or scan a barcode to start billing.
              <p className="mt-2 text-[11px] text-slate-400">Shortcuts: F2 Search · F4 Barcode · F8 Hold · F9 Pay</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="py-3 first:pt-0 last:pb-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{item.name}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {formatMoney(item.unitPrice, sym)} each · Max {item.maxStock}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.productId, 0)}
                    className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={item.maxStock}
                      value={item.quantity}
                      onChange={(e) => updateCartQty(item.productId, parseInt(e.target.value, 10) || 1)}
                      className="w-11 h-7 text-center text-xs font-mono bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {settings.enableDiscounts && can('pos:discount') && (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-400">Disc:</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.discountValue || ''}
                        placeholder="0"
                        onChange={(e) => updateItemDiscount(item.productId, parseFloat(e.target.value) || 0)}
                        className="w-14 h-7 px-1.5 text-right text-xs font-mono border border-slate-200 dark:border-slate-700 rounded bg-transparent"
                      />
                    </div>
                  )}

                  <span className="text-xs font-mono font-semibold tabular-nums">
                    {formatMoney(Math.max(0, item.unitPrice * item.quantity - item.discountValue), sym)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/70 dark:bg-slate-900/70 rounded-b-xl shrink-0">
          {settings.enableDiscounts && can('pos:discount') && (
            <div className="flex items-center gap-2">
              <select
                value={invoiceDiscountType}
                onChange={(e) => setInvoiceDiscountType(e.target.value as 'fixed' | 'percent')}
                className="h-8 px-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="fixed">Discount ({sym})</option>
                <option value="percent">Discount (%)</option>
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={invoiceDiscountValue || ''}
                placeholder="0.00"
                onChange={(e) => setInvoiceDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                className="flex-1 h-8 px-2.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
          )}

          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatMoney(totals.subtotal, sym)}</span>
            </div>
            {(totals.itemDiscountTotal > 0 || totals.invoiceDisc > 0) && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span>Discounts</span>
                <span className="font-mono tabular-nums">-{formatMoney(totals.itemDiscountTotal + totals.invoiceDisc, sym)}</span>
              </div>
            )}
            {settings.enableTax && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tax / VAT</span>
                <span className="font-mono tabular-nums">{formatMoney(totals.taxAmount, sym)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums">{formatMoney(totals.grandTotal, sym)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={cart.length === 0}
              onClick={() => setHoldPromptOpen(true)}
            >
              <Bookmark className="w-4 h-4" /> Hold (F8)
            </Button>
            <Button
              type="button"
              disabled={cart.length === 0}
              onClick={openCheckoutModal}
            >
              <CheckCircle2 className="w-4 h-4" /> Checkout (F9)
            </Button>
          </div>
        </div>
      </div>

      {/* Checkout Payment Modal */}
      <Modal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="Complete Payment"
        subtitle={`Customer: ${selectedCustomer?.name || 'Walk-in Customer'}`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCompleteSale} className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Payable Grand Total</span>
            <span className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatMoney(totals.grandTotal, sym)}
            </span>
          </div>

          <Select
            label="Payment Method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>

          {paymentMethod === 'Mixed Payment' ? (
            <div className="space-y-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Split Payment Breakdown</span>
                <button
                  type="button"
                  onClick={() => setPaymentSplit((p) => [...p, { method: 'bKash', amount: 0 }])}
                  className="text-xs text-emerald-600 hover:underline cursor-pointer"
                >
                  + Add Tender
                </button>
              </div>
              {paymentSplit.map((row, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2">
                  <Select
                    value={row.method}
                    onChange={(e) =>
                      setPaymentSplit((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, method: e.target.value } : r))
                      )
                    }
                  >
                    {SINGLE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.amount}
                    onChange={(e) =>
                      setPaymentSplit((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                label="Amount Tendered / Paid"
                type="number"
                min={0}
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                required
              />
              <div className="flex flex-wrap gap-1.5">
                {[totals.grandTotal, Math.ceil(totals.grandTotal / 10) * 10, Math.ceil(totals.grandTotal / 50) * 50, 0].map(
                  (presetAmt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPaidAmount(presetAmt.toFixed(2))}
                      className="px-2.5 py-1 text-xs font-mono rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      {presetAmt === 0 ? 'Unpaid (Credit)' : formatMoney(presetAmt, sym)}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs">
            <div>
              <span className="text-slate-500">Due Balance</span>
              <p className={cn('font-mono font-semibold text-sm tabular-nums', dueAmount > 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100')}>
                {formatMoney(dueAmount, sym)}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Change to Return</span>
              <p className="font-mono font-semibold text-sm text-emerald-600 tabular-nums">
                {formatMoney(changeAmount, sym)}
              </p>
            </div>
          </div>

          <Textarea
            label="Invoice Notes (Optional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery instructions or cashier remarks..."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submittingCheckout}>
              {submittingCheckout ? 'Processing Sale...' : 'Confirm & Issue Invoice'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Hold Cart Prompt */}
      <Modal open={holdPromptOpen} onClose={() => setHoldPromptOpen(false)} title="Hold Active Cart" maxWidth="max-w-sm">
        <form onSubmit={handleHoldCart} className="space-y-4">
          <Input
            label="Reference Label"
            value={holdLabel}
            onChange={(e) => setHoldLabel(e.target.value)}
            placeholder="e.g. Counter 2 - Blue Jacket"
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setHoldPromptOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Hold</Button>
          </div>
        </form>
      </Modal>

      {/* Restore Held Carts Modal */}
      <Modal open={heldModalOpen} onClose={() => setHeldModalOpen(false)} title="Held Carts" maxWidth="max-w-lg">
        {heldCarts.length === 0 ? (
          <EmptyState title="No held carts" description="Put an active sale on hold (F8) to resume it later." />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {heldCarts.map((h) => (
              <div key={h._id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{h.label}</p>
                  <p className="text-xs text-slate-500">
                    {h.customerName} · {h.items.length} item(s) · Held by {h.heldByName} · {formatDateTime(h.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => restoreHeldCart(h)}>
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await apiRequest(`/api/pos/held-carts/${h._id}`, { method: 'DELETE' });
                      loadPosData();
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Quick Customer Modal */}
      <Modal open={quickCustOpen} onClose={() => setQuickCustOpen(false)} title="Quick Add Customer" maxWidth="max-w-sm">
        <form onSubmit={handleQuickCustomer} className="space-y-4">
          <Input label="Customer Name" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} required />
          <Input label="Phone Number" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setQuickCustOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Customer</Button>
          </div>
        </form>
      </Modal>

      {/* Completed Invoice Modal */}
      <InvoiceModal
        open={Boolean(completedInvoice)}
        onClose={() => setCompletedInvoice(null)}
        data={completedInvoice}
      />
    </div>
  );
}

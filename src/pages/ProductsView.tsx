import {
  Barcode,
  Download,
  Edit2,
  Eye,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BarcodeLabelModal, BarcodeSvg } from '../components/ui/BarcodeDisplay';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  ProductImage,
  Select,
  StatusText,
  TableSkeleton,
  Textarea,
} from '../components/ui/Primitives';
import { useAuth } from '../context/AuthContext';
import { apiRequest, cn, formatDate, formatMoney } from '../lib/api';

type SubTab = 'products' | 'categories' | 'brands';

export function ProductsView() {
  const { settings, can } = useAuth();
  const sym = settings.currencySymbol || '$';
  const canManage = can('products:manage');

  const [tab, setTab] = useState<SubTab>('products');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [brandId, setBrandId] = useState('all');
  const [stockStatus, setStockStatus] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Product Form Modal
  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<any | null>(null);
  const [pForm, setPForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    brandId: '',
    supplierId: '',
    purchasePrice: '0',
    sellingPrice: '0',
    wholesalePrice: '0',
    stockQuantity: '0',
    minStockAlert: '10',
    unit: 'pcs',
    taxRate: '0',
    description: '',
    status: 'active',
    expiryDate: '',
    image: '',
  });

  // View / Barcode / Import / Delete Modals
  const [detailProd, setDetailProd] = useState<any | null>(null);
  const [barcodeProd, setBarcodeProd] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: SubTab; item: any } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');

  // Category / Brand Modals
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any | null>(null);
  const [catForm, setCatForm] = useState({ name: '', description: '', status: 'active' });

  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any | null>(null);
  const [brandForm, setBrandForm] = useState({ name: '', description: '', status: 'active', logo: '' });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({
        search,
        categoryId,
        brandId,
        stockStatus,
        sortBy,
        sortDir,
        limit: '300',
      });
      const [prodRes, catRes, brandRes, supRes] = await Promise.all([
        apiRequest<{ rows: any[] }>(`/api/products?${qs.toString()}`),
        apiRequest<any[]>('/api/categories'),
        apiRequest<any[]>('/api/brands'),
        apiRequest<any[]>('/api/suppliers'),
      ]);
      setProducts(prodRes.rows || []);
      setCategories(catRes);
      setBrands(brandRes);
      setSuppliers(supRes);
    } catch (err: any) {
      const msg = err.message || 'Failed to load catalog';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, brandId, stockStatus, sortBy, sortDir]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openNewProduct = () => {
    setEditingProd(null);
    const randCode = `890${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    setPForm({
      name: '',
      sku: `SKU-${Date.now().toString().slice(-5)}`,
      barcode: randCode,
      categoryId: categories[0]?._id || '',
      brandId: '',
      supplierId: '',
      purchasePrice: '0',
      sellingPrice: '0',
      wholesalePrice: '0',
      stockQuantity: '0',
      minStockAlert: String(settings.lowStockThreshold || 10),
      unit: 'pcs',
      taxRate: String(settings.defaultTaxRate || 0),
      description: '',
      status: 'active',
      expiryDate: '',
      image: '',
    });
    setProdModalOpen(true);
  };

  const openEditProduct = (p: any) => {
    setEditingProd(p);
    setPForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      categoryId: String(p.categoryId || ''),
      brandId: p.brandId ? String(p.brandId) : '',
      supplierId: p.supplierId ? String(p.supplierId) : '',
      purchasePrice: String(p.purchasePrice ?? 0),
      sellingPrice: String(p.sellingPrice ?? 0),
      wholesalePrice: String(p.wholesalePrice ?? 0),
      stockQuantity: String(p.stockQuantity ?? 0),
      minStockAlert: String(p.minStockAlert ?? 10),
      unit: p.unit || 'pcs',
      taxRate: String(p.taxRate ?? 0),
      description: p.description || '',
      status: p.status || 'active',
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().slice(0, 10) : '',
      image: p.image || '',
    });
    setProdModalOpen(true);
  };

  const handleImageUpload = (file: File | undefined, onDone: (dataUrl: string) => void) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Only PNG, JPEG, or WebP images are supported');
      return;
    }
    if (file.size > 1_500_000) {
      toast.error('Image must be smaller than 1.5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onDone(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...pForm,
        brandId: pForm.brandId || null,
        supplierId: pForm.supplierId || null,
        expiryDate: pForm.expiryDate || null,
      };
      if (editingProd) {
        await apiRequest(`/api/products/${editingProd._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('Product updated');
      } else {
        await apiRequest('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Product added');
      }
      setProdModalOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    }
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const lines = csvText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        toast.error('Provide a header row and at least one product row');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const get = (key: string) => {
          const idx = headers.indexOf(key);
          return idx >= 0 ? cols[idx] : '';
        };
        return {
          name: get('name'),
          sku: get('sku'),
          barcode: get('barcode') || undefined,
          categoryName: get('category') || get('categoryname') || 'General',
          brandName: get('brand') || get('brandname') || undefined,
          purchasePrice: Number(get('purchaseprice') || 0),
          sellingPrice: Number(get('sellingprice') || 0),
          wholesalePrice: Number(get('wholesaleprice') || 0),
          stockQuantity: Number(get('stockquantity') || 0),
          minStockAlert: Number(get('minstockalert') || 10),
          unit: get('unit') || 'pcs',
          taxRate: Number(get('taxrate') || 0),
        };
      });

      const res = await apiRequest<{ imported: number; skipped: number }>('/api/products/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      toast.success(`Imported ${res.imported} product(s) (${res.skipped} skipped)`);
      setImportOpen(false);
      setCsvText('');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'CSV import failed');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCat) {
        await apiRequest(`/api/categories/${editingCat._id}`, {
          method: 'PUT',
          body: JSON.stringify(catForm),
        });
        toast.success('Category updated');
      } else {
        await apiRequest('/api/categories', {
          method: 'POST',
          body: JSON.stringify(catForm),
        });
        toast.success('Category created');
      }
      setCatModalOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Category save failed');
    }
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBrand) {
        await apiRequest(`/api/brands/${editingBrand._id}`, {
          method: 'PUT',
          body: JSON.stringify(brandForm),
        });
        toast.success('Brand updated');
      } else {
        await apiRequest('/api/brands', {
          method: 'POST',
          body: JSON.stringify(brandForm),
        });
        toast.success('Brand created');
      }
      setBrandModalOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Brand save failed');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const endpoint =
        deleteTarget.type === 'products'
          ? `/api/products/${deleteTarget.item._id}`
          : deleteTarget.type === 'categories'
          ? `/api/categories/${deleteTarget.item._id}`
          : `/api/brands/${deleteTarget.item._id}`;
      await apiRequest(endpoint, { method: 'DELETE' });
      toast.success('Deleted successfully');
      setDeleteTarget(null);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
          {([
            { id: 'products', label: `Products (${products.length})` },
            { id: 'categories', label: `Categories (${categories.length})` },
            { id: 'brands', label: `Brands (${brands.length})` },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap',
                tab === t.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === 'products' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const csv = await apiRequest<string>('/api/products/export/csv');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'products-catalog.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err: any) {
                    toast.error(err.message || 'CSV export failed');
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
              {canManage && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <Upload className="w-3.5 h-3.5" /> Import CSV
                  </Button>
                  <Button size="sm" onClick={openNewProduct}>
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </Button>
                </>
              )}
            </>
          )}
          {tab === 'categories' && canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingCat(null);
                setCatForm({ name: '', description: '', status: 'active' });
                setCatModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Category
            </Button>
          )}
          {tab === 'brands' && canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingBrand(null);
                setBrandForm({ name: '', description: '', status: 'active', logo: '' });
                setBrandModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Brand
            </Button>
          )}
        </div>
      </div>

      {tab === 'products' && (
        <>
          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, or barcode..."
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="all">All Brands</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
              <option value="all">All Stock Levels</option>
              <option value="in">Healthy Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </Select>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : loadError ? (
            <ErrorState title="Failed to load catalog" message={loadError} onRetry={loadAll} />
          ) : products.length === 0 ? (
            <EmptyState
              title="No products found"
              description="Add your first product or load the sample catalog & starter store dataset."
              actionLabel={
                can('settings:manage') && !search && categoryId === 'all' && brandId === 'all' && stockStatus === 'all'
                  ? 'Load Sample Store Data'
                  : canManage
                  ? 'Add First Product'
                  : undefined
              }
              onAction={
                can('settings:manage') && !search && categoryId === 'all' && brandId === 'all' && stockStatus === 'all'
                  ? async () => {
                      try {
                        const res = await apiRequest<{ productsCreated: number }>('/api/settings/seed-sample', { method: 'POST' });
                        toast.success(`Loaded ${res.productsCreated} sample products and starter store records`);
                        await loadAll();
                      } catch (err: any) {
                        toast.error(err.message || 'Could not load sample data');
                      }
                    }
                  : canManage
                  ? openNewProduct
                  : undefined
              }
            />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-900/60">
                    <th className="py-3 px-4 font-medium">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy('name');
                          setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        }}
                        className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        Product {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="py-3 px-3 font-medium">Category / Brand</th>
                    <th className="py-3 px-3 font-medium text-right">Cost</th>
                    <th className="py-3 px-3 font-medium text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy('sellingPrice');
                          setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        }}
                        className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        Price {sortBy === 'sellingPrice' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="py-3 px-3 font-medium text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy('stockQuantity');
                          setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        }}
                        className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        Stock {sortBy === 'stockQuantity' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="py-3 px-3 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {products.map((p) => {
                    const out = Number(p.stockQuantity) <= 0;
                    const low = !out && Number(p.stockQuantity) <= Number(p.minStockAlert ?? 10);
                    return (
                      <tr key={p._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <ProductImage src={p.image} alt={p.name} className="w-10 h-10" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px]">
                                {p.name}
                              </p>
                              <p className="font-mono text-[11px] text-slate-500">
                                {p.sku} · {p.barcode}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                          <p>{p.categoryName}</p>
                          {p.brandName && <p className="text-[11px] text-slate-400">{p.brandName}</p>}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {formatMoney(p.purchasePrice, sym)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {formatMoney(p.sellingPrice, sym)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <span className={cn('font-semibold', out ? 'text-red-600' : low ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100')}>
                            {p.stockQuantity} {p.unit}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusText status={out ? 'Out of Stock' : low ? 'Low Stock' : p.status} />
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailProd(p)}
                              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setBarcodeProd(p)}
                              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                              title="Print barcode labels"
                            >
                              <Barcode className="w-3.5 h-3.5" />
                            </button>
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditProduct(p)}
                                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ type: 'products', item: p })}
                                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'categories' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : loadError ? (
            <ErrorState title="Failed to load categories" message={loadError} onRetry={loadAll} />
          ) : categories.length === 0 ? (
            <EmptyState
              title="No categories created"
              description="Organize your catalog by adding product categories."
              actionLabel={canManage ? 'Add Category' : undefined}
              onAction={() => setCatModalOpen(true)}
            />
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-3 px-4 font-medium">Category Name</th>
                  <th className="py-3 px-4 font-medium">Description</th>
                  <th className="py-3 px-4 font-medium text-right">Products</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {canManage && <th className="py-3 px-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {categories.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{c.name}</td>
                    <td className="py-3 px-4 text-slate-500">{c.description || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.productCount || 0}</td>
                    <td className="py-3 px-4"><StatusText status={c.status} /></td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCat(c);
                              setCatForm({ name: c.name, description: c.description || '', status: c.status });
                              setCatModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'categories', item: c })}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'brands' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : loadError ? (
            <ErrorState title="Failed to load brands" message={loadError} onRetry={loadAll} />
          ) : brands.length === 0 ? (
            <EmptyState
              title="No brands created"
              description="Add manufacturer or house brands to track product lines."
              actionLabel={canManage ? 'Add Brand' : undefined}
              onAction={() => setBrandModalOpen(true)}
            />
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/60 dark:bg-slate-900/60">
                  <th className="py-3 px-4 font-medium">Brand</th>
                  <th className="py-3 px-4 font-medium">Description</th>
                  <th className="py-3 px-4 font-medium text-right">Products</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {canManage && <th className="py-3 px-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {brands.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {b.logo && <ProductImage src={b.logo} alt={b.name} className="w-7 h-7" />}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{b.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{b.description || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{b.productCount || 0}</td>
                    <td className="py-3 px-4"><StatusText status={b.status} /></td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBrand(b);
                              setBrandForm({ name: b.name, description: b.description || '', status: b.status, logo: b.logo || '' });
                              setBrandModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'brands', item: b })}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add/Edit Product Modal */}
      <Modal
        open={prodModalOpen}
        onClose={() => setProdModalOpen(false)}
        title={editingProd ? `Edit ${editingProd.name}` : 'Add New Product'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="flex items-center gap-4">
            <ProductImage src={pForm.image} alt={pForm.name || 'Product'} className="w-16 h-16" />
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Product Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleImageUpload(e.target.files?.[0], (url) => setPForm({ ...pForm, image: url }))}
                className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Product Name" value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} required />
            <Input label="SKU" value={pForm.sku} onChange={(e) => setPForm({ ...pForm, sku: e.target.value })} required />
            <div className="flex items-end gap-2">
              <Input label="Barcode" value={pForm.barcode} onChange={(e) => setPForm({ ...pForm, barcode: e.target.value })} required />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() =>
                  setPForm({
                    ...pForm,
                    barcode: `890${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`,
                  })
                }
              >
                Generate
              </Button>
            </div>
            <Select label="Category" value={pForm.categoryId} onChange={(e) => setPForm({ ...pForm, categoryId: e.target.value })} required>
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="Brand (Optional)" value={pForm.brandId} onChange={(e) => setPForm({ ...pForm, brandId: e.target.value })}>
              <option value="">No Brand</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select label="Preferred Supplier (Optional)" value={pForm.supplierId} onChange={(e) => setPForm({ ...pForm, supplierId: e.target.value })}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input label="Purchase Price (Cost)" type="number" min={0} step="0.01" value={pForm.purchasePrice} onChange={(e) => setPForm({ ...pForm, purchasePrice: e.target.value })} required />
            <Input label="Selling Price (Retail)" type="number" min={0} step="0.01" value={pForm.sellingPrice} onChange={(e) => setPForm({ ...pForm, sellingPrice: e.target.value })} required />
            <Input label="Wholesale Price" type="number" min={0} step="0.01" value={pForm.wholesalePrice} onChange={(e) => setPForm({ ...pForm, wholesalePrice: e.target.value })} />
            <Input label="Stock Quantity" type="number" min={0} value={pForm.stockQuantity} onChange={(e) => setPForm({ ...pForm, stockQuantity: e.target.value })} required />
            <Input label="Minimum Stock Alert" type="number" min={0} value={pForm.minStockAlert} onChange={(e) => setPForm({ ...pForm, minStockAlert: e.target.value })} />
            <Input label="Unit (pcs, kg, bag, box)" value={pForm.unit} onChange={(e) => setPForm({ ...pForm, unit: e.target.value })} />
            <Input label="Tax / VAT Rate (%)" type="number" min={0} max={100} step="0.1" value={pForm.taxRate} onChange={(e) => setPForm({ ...pForm, taxRate: e.target.value })} />
            <Input label="Expiry Date (Optional)" type="date" value={pForm.expiryDate} onChange={(e) => setPForm({ ...pForm, expiryDate: e.target.value })} />
            <Select label="Status" value={pForm.status} onChange={(e) => setPForm({ ...pForm, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>

          <Textarea label="Description" rows={2} value={pForm.description} onChange={(e) => setPForm({ ...pForm, description: e.target.value })} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setProdModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingProd ? 'Save Changes' : 'Create Product'}</Button>
          </div>
        </form>
      </Modal>

      {/* Product Detail Modal */}
      <Modal open={Boolean(detailProd)} onClose={() => setDetailProd(null)} title={detailProd?.name || 'Product Details'} maxWidth="max-w-lg">
        {detailProd && (
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-4">
              <ProductImage src={detailProd.image} alt={detailProd.name} className="w-20 h-20" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">{detailProd.name}</p>
                <p className="text-slate-500">{detailProd.categoryName} {detailProd.brandName ? `· ${detailProd.brandName}` : ''}</p>
                <p className="font-mono text-slate-600 dark:text-slate-400">SKU: {detailProd.sku} · Barcode: {detailProd.barcode}</p>
                {detailProd.expiryDate && <p className="text-amber-600">Expires: {formatDate(detailProd.expiryDate)}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40">
              <div><span className="text-slate-500">Purchase Price</span><p className="font-mono font-semibold">{formatMoney(detailProd.purchasePrice, sym)}</p></div>
              <div><span className="text-slate-500">Selling Price</span><p className="font-mono font-semibold">{formatMoney(detailProd.sellingPrice, sym)}</p></div>
              <div><span className="text-slate-500">Stock On Hand</span><p className="font-mono font-semibold">{detailProd.stockQuantity} {detailProd.unit}</p></div>
              <div><span className="text-slate-500">Tax Rate</span><p className="font-mono font-semibold">{detailProd.taxRate}%</p></div>
            </div>
            {detailProd.description && <p className="text-slate-600 dark:text-slate-300">{detailProd.description}</p>}
            <div className="flex justify-center pt-2">
              <BarcodeSvg value={detailProd.barcode || detailProd.sku} />
            </div>
          </div>
        )}
      </Modal>

      {/* Barcode Label Modal */}
      <BarcodeLabelModal
        open={Boolean(barcodeProd)}
        onClose={() => setBarcodeProd(null)}
        product={barcodeProd}
        currencySymbol={sym}
        businessName={settings.businessName}
      />

      {/* CSV Import Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Bulk Import Products (CSV)" maxWidth="max-w-xl">
        <form onSubmit={handleCsvImport} className="space-y-4">
          <p className="text-xs text-slate-500">
            Paste CSV data or upload a .csv file with headers: <code className="font-mono">Name,SKU,Barcode,Category,Brand,PurchasePrice,SellingPrice,StockQuantity,Unit,TaxRate</code>
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => setCsvText(String(r.result || ''));
              r.readAsText(f);
            }}
            className="text-xs"
          />
          <Textarea
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Name,SKU,Barcode,Category,Brand,PurchasePrice,SellingPrice,StockQuantity,Unit,TaxRate&#10;Espresso Beans 500g,COF-500,890123456789,Coffee,Elevate,12,24,30,bag,5"
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button type="submit">Import Products</Button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title={editingCat ? 'Edit Category' : 'Add Category'} maxWidth="max-w-md">
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <Input label="Category Name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
          <Textarea label="Description" rows={2} value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
          <Select label="Status" value={catForm.status} onChange={(e) => setCatForm({ ...catForm, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCatModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Category</Button>
          </div>
        </form>
      </Modal>

      {/* Brand Modal */}
      <Modal open={brandModalOpen} onClose={() => setBrandModalOpen(false)} title={editingBrand ? 'Edit Brand' : 'Add Brand'} maxWidth="max-w-md">
        <form onSubmit={handleSaveBrand} className="space-y-4">
          <Input label="Brand Name" value={brandForm.name} onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })} required />
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Brand Logo (Optional)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleImageUpload(e.target.files?.[0], (url) => setBrandForm({ ...brandForm, logo: url }))}
              className="text-xs"
            />
          </div>
          <Textarea label="Description" rows={2} value={brandForm.description} onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })} />
          <Select label="Status" value={brandForm.status} onChange={(e) => setBrandForm({ ...brandForm, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBrandModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Brand</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Confirm Deletion"
        message={`Are you sure you want to delete "${deleteTarget?.item?.name}"?`}
        confirmLabel="Delete"
      />
    </div>
  );
}

import { Router } from 'express';
import { z } from 'zod';
import { db, withTransaction } from '../db/store';
import { AuthenticatedRequest, requireAuth, requirePermission } from '../middleware/auth';
import { evaluateProductStockNotification, logActivity } from '../utils/audit';
import { BrandSchema, CategorySchema, ProductSchema, StockAdjustmentSchema } from '../validation/schemas';

const router = Router();

// Categories
router.get('/categories', requireAuth, async (_req, res, next) => {
  try {
    const [categories, products] = await Promise.all([
      db.categories.find({ deletedAt: null }, { sort: { name: 1 } }),
      db.products.find({ deletedAt: null }),
    ]);
    const counts = new Map<string, number>();
    for (const p of products) {
      const k = String(p.categoryId);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const enriched = categories.map((c) => ({
      ...c,
      productCount: counts.get(c._id) || 0,
    }));
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = CategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid category' });
    }
    const created = await db.categories.create(parsed.data);
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'create',
      module: 'categories',
      targetId: created._id,
      description: `Created category "${created.name}"`,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.put('/categories/:id', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = CategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid category' });
    }
    const updated = await db.categories.updateById(req.params.id, { $set: parsed.data });
    if (!updated) return res.status(404).json({ success: false, error: 'Category not found' });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'update',
      module: 'categories',
      targetId: updated._id,
      description: `Updated category "${updated.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:id', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const cat = await db.categories.findById(req.params.id);
    if (!cat || cat.deletedAt) return res.status(404).json({ success: false, error: 'Category not found' });
    const linkedCount = await db.products.count({ categoryId: cat._id, deletedAt: null });
    if (linkedCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete "${cat.name}" because ${linkedCount} product(s) are still linked to it. Reassign those products first.`,
      });
    }
    await db.categories.updateById(cat._id, { $set: { deletedAt: new Date().toISOString() } });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'delete',
      module: 'categories',
      targetId: cat._id,
      description: `Deleted category "${cat.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
});

// Brands
router.get('/brands', requireAuth, async (_req, res, next) => {
  try {
    const [brands, products] = await Promise.all([
      db.brands.find({ deletedAt: null }, { sort: { name: 1 } }),
      db.products.find({ deletedAt: null }),
    ]);
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.brandId) {
        const k = String(p.brandId);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const enriched = brands.map((b) => ({
      ...b,
      productCount: counts.get(b._id) || 0,
    }));
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/brands', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = BrandSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid brand' });
    }
    const created = await db.brands.create(parsed.data);
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'create',
      module: 'brands',
      targetId: created._id,
      description: `Created brand "${created.name}"`,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.put('/brands/:id', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = BrandSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid brand' });
    }
    const updated = await db.brands.updateById(req.params.id, { $set: parsed.data });
    if (!updated) return res.status(404).json({ success: false, error: 'Brand not found' });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'update',
      module: 'brands',
      targetId: updated._id,
      description: `Updated brand "${updated.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/brands/:id', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const brand = await db.brands.findById(req.params.id);
    if (!brand || brand.deletedAt) return res.status(404).json({ success: false, error: 'Brand not found' });
    const linkedCount = await db.products.count({ brandId: brand._id, deletedAt: null });
    if (linkedCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete "${brand.name}" because ${linkedCount} product(s) are still linked to it.`,
      });
    }
    await db.brands.updateById(brand._id, { $set: { deletedAt: new Date().toISOString() } });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'delete',
      module: 'brands',
      targetId: brand._id,
      description: `Deleted brand "${brand.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Brand deleted' });
  } catch (err) {
    next(err);
  }
});

// Products
router.get('/products', requireAuth, async (req, res, next) => {
  try {
    const {
      search = '',
      categoryId = 'all',
      brandId = 'all',
      stockStatus = 'all',
      status = 'all',
      sortBy = 'createdAt',
      sortDir = 'desc',
      page = '1',
      limit = '100',
    } = req.query as Record<string, string>;

    const [products, categories, brands, suppliers] = await Promise.all([
      db.products.find({ deletedAt: null }),
      db.categories.find({ deletedAt: null }),
      db.brands.find({ deletedAt: null }),
      db.suppliers.find({ deletedAt: null }),
    ]);

    const catMap = new Map(categories.map((c) => [c._id, c.name]));
    const brandMap = new Map(brands.map((b) => [b._id, b.name]));
    const supMap = new Map(suppliers.map((s) => [s._id, s.name]));

    let rows: Record<string, any>[] = products.map((p) => ({
      ...p,
      categoryName: catMap.get(String(p.categoryId)) || 'Uncategorized',
      brandName: p.brandId ? brandMap.get(String(p.brandId)) || '' : '',
      supplierName: p.supplierId ? supMap.get(String(p.supplierId)) || '' : '',
    }));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      );
    }
    if (categoryId !== 'all') rows = rows.filter((p) => String(p.categoryId) === categoryId);
    if (brandId !== 'all') rows = rows.filter((p) => String(p.brandId) === brandId);
    if (status !== 'all') rows = rows.filter((p) => p.status === status);
    if (stockStatus === 'low') {
      rows = rows.filter((p) => Number(p.stockQuantity) > 0 && Number(p.stockQuantity) <= Number(p.minStockAlert ?? 10));
    } else if (stockStatus === 'out') {
      rows = rows.filter((p) => Number(p.stockQuantity) <= 0);
    } else if (stockStatus === 'in') {
      rows = rows.filter((p) => Number(p.stockQuantity) > Number(p.minStockAlert ?? 10));
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a: any, b: any) => {
      const av = a[sortBy] ?? '';
      const bv = b[sortBy] ?? '';
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });

    const pNum = Math.max(1, parseInt(page, 10) || 1);
    const lNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const total = rows.length;
    const paged = rows.slice((pNum - 1) * lNum, pNum * lNum);

    res.json({ success: true, data: { rows: paged, total, page: pNum, limit: lNum } });
  } catch (err) {
    next(err);
  }
});

router.get('/products/export/csv', requireAuth, requirePermission('products:view'), async (_req, res, next) => {
  try {
    const [products, categories, brands] = await Promise.all([
      db.products.find({ deletedAt: null }, { sort: { name: 1 } }),
      db.categories.find({ deletedAt: null }),
      db.brands.find({ deletedAt: null }),
    ]);
    const catMap = new Map(categories.map((c) => [c._id, c.name]));
    const brandMap = new Map(brands.map((b) => [b._id, b.name]));

    const escapeCsv = (val: any) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = [
      'Name',
      'SKU',
      'Barcode',
      'Category',
      'Brand',
      'PurchasePrice',
      'SellingPrice',
      'WholesalePrice',
      'StockQuantity',
      'MinStockAlert',
      'Unit',
      'TaxRate',
      'Status',
      'ExpiryDate',
    ];
    const lines = [headers.join(',')];
    for (const p of products) {
      lines.push(
        [
          p.name,
          p.sku,
          p.barcode,
          catMap.get(String(p.categoryId)) || '',
          p.brandId ? brandMap.get(String(p.brandId)) || '' : '',
          p.purchasePrice,
          p.sellingPrice,
          p.wholesalePrice || 0,
          p.stockQuantity,
          p.minStockAlert,
          p.unit,
          p.taxRate || 0,
          p.status,
          p.expiryDate ? new Date(p.expiryDate).toISOString().slice(0, 10) : '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products-catalog.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

router.post('/products/import', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const bodySchema = z.object({
      rows: z
        .array(
          z.object({
            name: z.string().trim().min(1),
            sku: z.string().trim().min(1),
            barcode: z.string().trim().optional(),
            categoryName: z.string().trim().optional(),
            brandName: z.string().trim().optional(),
            purchasePrice: z.coerce.number().min(0),
            sellingPrice: z.coerce.number().min(0),
            wholesalePrice: z.coerce.number().min(0).optional().default(0),
            stockQuantity: z.coerce.number().int().min(0).optional().default(0),
            minStockAlert: z.coerce.number().int().min(0).optional().default(10),
            unit: z.string().trim().optional().default('pcs'),
            taxRate: z.coerce.number().min(0).max(100).optional().default(0),
          })
        )
        .min(1),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid import rows' });
    }

    const result = await withTransaction(async (ctx) => {
      let imported = 0;
      const errors: string[] = [];

      for (const row of parsed.data.rows) {
        const existingSku = await db.products.findOne({ sku: row.sku }, ctx);
        if (existingSku) {
          errors.push(`Skipped SKU "${row.sku}" (already exists)`);
          continue;
        }

        const catName = row.categoryName || 'General';
        let cat = await db.categories.findOne({ name: catName, deletedAt: null }, ctx);
        if (!cat) {
          cat = await db.categories.create({ name: catName, icon: 'Package', status: 'active' }, ctx);
        }

        let brandId: string | null = null;
        if (row.brandName) {
          let br = await db.brands.findOne({ name: row.brandName, deletedAt: null }, ctx);
          if (!br) {
            br = await db.brands.create({ name: row.brandName, status: 'active' }, ctx);
          }
          brandId = br._id;
        }

        const barcode = row.barcode || `890${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
        const created = await db.products.create(
          {
            name: row.name,
            sku: row.sku,
            barcode,
            categoryId: cat._id,
            brandId,
            purchasePrice: row.purchasePrice,
            sellingPrice: row.sellingPrice,
            wholesalePrice: row.wholesalePrice,
            stockQuantity: row.stockQuantity,
            minStockAlert: row.minStockAlert,
            unit: row.unit,
            taxRate: row.taxRate,
            status: 'active',
          },
          ctx
        );

        if (row.stockQuantity > 0) {
          await db.stockMovements.create(
            {
              productId: created._id,
              productName: created.name,
              sku: created.sku,
              movementType: 'opening',
              previousQuantity: 0,
              changedQuantity: row.stockQuantity,
              newQuantity: row.stockQuantity,
              reason: 'CSV Bulk Import Opening Stock',
              reference: 'CSV-IMPORT',
              userId: req.user!._id,
              userName: req.user!.name,
            },
            ctx
          );
        }
        imported++;
      }

      await logActivity(
        {
          userId: req.user!._id,
          userName: req.user!.name,
          userRole: req.user!.roleName,
          action: 'import',
          module: 'products',
          description: `Bulk imported ${imported} products (${errors.length} skipped)`,
          ipAddress: req.ip,
        },
        ctx
      );

      return { imported, skipped: errors.length, errors };
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/products', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid product data' });
    }
    const data = parsed.data;
    const category = await db.categories.findById(data.categoryId);
    if (!category || category.deletedAt) {
      return res.status(400).json({ success: false, error: 'Selected category does not exist' });
    }

    const created = await withTransaction(async (ctx) => {
      const product = await db.products.create(
        {
          ...data,
          brandId: data.brandId || null,
          supplierId: data.supplierId || null,
          expiryDate: data.expiryDate || null,
        },
        ctx
      );

      if (product.stockQuantity > 0) {
        await db.stockMovements.create(
          {
            productId: product._id,
            productName: product.name,
            sku: product.sku,
            movementType: 'opening',
            previousQuantity: 0,
            changedQuantity: product.stockQuantity,
            newQuantity: product.stockQuantity,
            reason: 'Initial opening stock on product creation',
            reference: product.sku,
            userId: req.user!._id,
            userName: req.user!.name,
          },
          ctx
        );
      }

      await evaluateProductStockNotification(
        {
          _id: String(product._id),
          name: String(product.name),
          sku: String(product.sku),
          stockQuantity: Number(product.stockQuantity),
          minStockAlert: Number(product.minStockAlert ?? 10),
        },
        ctx
      );

      await logActivity(
        {
          userId: req.user!._id,
          userName: req.user!.name,
          userRole: req.user!.roleName,
          action: 'create',
          module: 'products',
          targetId: product._id,
          description: `Created product "${product.name}" (SKU: ${product.sku})`,
          ipAddress: req.ip,
        },
        ctx
      );

      return product;
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'SKU or Barcode already exists on another product' });
    }
    next(err);
  }
});

router.put('/products/:id', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await db.products.findById(req.params.id);
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid product update' });
    }
    const data = parsed.data;

    // Never allow silent stock mutation via product edit; if stock changed, record StockMovement
    const updated = await withTransaction(async (ctx) => {
      const prevQty = Number(existing.stockQuantity);
      const nextQty = Number(data.stockQuantity);

      const saved = await db.products.updateById(
        existing._id,
        {
          $set: {
            ...data,
            brandId: data.brandId || null,
            supplierId: data.supplierId || null,
            expiryDate: data.expiryDate || null,
          },
        },
        ctx
      );

      if (prevQty !== nextQty) {
        const diff = nextQty - prevQty;
        await db.stockMovements.create(
          {
            productId: existing._id,
            productName: data.name,
            sku: data.sku,
            movementType: diff > 0 ? 'adjustment_in' : 'adjustment_out',
            previousQuantity: prevQty,
            changedQuantity: diff,
            newQuantity: nextQty,
            reason: 'Stock updated during product edit',
            reference: data.sku,
            userId: req.user!._id,
            userName: req.user!.name,
          },
          ctx
        );
        if (saved) {
          await evaluateProductStockNotification(
            {
              _id: String(saved._id),
              name: String(saved.name),
              sku: String(saved.sku),
              stockQuantity: Number(saved.stockQuantity),
              minStockAlert: Number(saved.minStockAlert ?? 10),
            },
            ctx
          );
        }
      }

      await logActivity(
        {
          userId: req.user!._id,
          userName: req.user!.name,
          userRole: req.user!.roleName,
          action: 'update',
          module: 'products',
          targetId: existing._id,
          description: `Updated product "${data.name}" (SKU: ${data.sku})`,
          ipAddress: req.ip,
        },
        ctx
      );

      return saved;
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'SKU or Barcode already exists' });
    }
    next(err);
  }
});

router.delete('/products/:id', requireAuth, requirePermission('products:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await db.products.findById(req.params.id);
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    await db.products.updateById(existing._id, {
      $set: { deletedAt: new Date().toISOString(), status: 'inactive' },
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'delete',
      module: 'products',
      targetId: existing._id,
      description: `Deleted product "${existing.name}" (SKU: ${existing.sku})`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
});

// Inventory Movements & Adjustments
router.get('/inventory/movements', requireAuth, requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const { productId, movementType = 'all', search = '', page = '1', limit = '50' } = req.query as Record<string, string>;
    let movements = await db.stockMovements.find({}, { sort: { createdAt: -1 } });
    if (productId) movements = movements.filter((m) => String(m.productId) === productId);
    if (movementType !== 'all') movements = movements.filter((m) => m.movementType === movementType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      movements = movements.filter(
        (m) =>
          m.productName.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q) ||
          String(m.reference || '').toLowerCase().includes(q) ||
          String(m.reason || '').toLowerCase().includes(q)
      );
    }
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const total = movements.length;
    res.json({ success: true, data: { rows: movements.slice((p - 1) * l, p * l), total, page: p, limit: l } });
  } catch (err) {
    next(err);
  }
});

router.post('/inventory/adjust', requireAuth, requirePermission('inventory:adjust'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = StockAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid stock adjustment' });
    }
    const data = parsed.data;

    const result = await withTransaction(async (ctx) => {
      const product = await db.products.findById(data.productId, ctx);
      if (!product || product.deletedAt) throw new Error('Product not found');

      const prevQty = Number(product.stockQuantity);
      const isIncrease = data.movementType === 'opening' || data.movementType === 'adjustment_in';
      const delta = isIncrease ? data.quantity : -data.quantity;
      const nextQty = prevQty + delta;

      if (nextQty < 0) {
        throw new Error(`Cannot deduct ${data.quantity} units. Current stock is ${prevQty}.`);
      }

      const updated = await db.products.updateById(product._id, { $set: { stockQuantity: nextQty } }, ctx);

      const movement = await db.stockMovements.create(
        {
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          movementType: data.movementType,
          previousQuantity: prevQty,
          changedQuantity: delta,
          newQuantity: nextQty,
          reason: data.reason,
          reference: data.reference || `ADJ-${Date.now().toString().slice(-6)}`,
          userId: req.user!._id,
          userName: req.user!.name,
        },
        ctx
      );

      if (updated) {
        await evaluateProductStockNotification(
          {
            _id: String(updated._id),
            name: String(updated.name),
            sku: String(updated.sku),
            stockQuantity: Number(updated.stockQuantity),
            minStockAlert: Number(updated.minStockAlert ?? 10),
          },
          ctx
        );
      }

      await logActivity(
        {
          userId: req.user!._id,
          userName: req.user!.name,
          userRole: req.user!.roleName,
          action: 'stock_adjustment',
          module: 'inventory',
          targetId: product._id,
          description: `Adjusted stock for "${product.name}" (${data.movementType}: ${delta >= 0 ? '+' : ''}${delta}, new qty: ${nextQty})`,
          ipAddress: req.ip,
        },
        ctx
      );

      return { product: updated, movement };
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Stock adjustment failed' });
  }
});

export default router;

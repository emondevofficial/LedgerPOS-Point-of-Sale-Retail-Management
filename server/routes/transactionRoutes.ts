import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/store';
import { AuthenticatedRequest, rateLimit, requireAuth, requirePermission } from '../middleware/auth';
import { cancelSale, executeCheckout } from '../services/posService';
import { cancelPurchase, createPurchase, receivePurchaseItems } from '../services/purchaseService';
import { generateReport, getDashboardData, getFinancialOverview } from '../services/reportService';
import { processReturn } from '../services/returnService';
import { logActivity } from '../utils/audit';
import {
  CheckoutSchema,
  ExpenseCategorySchema,
  ExpenseSchema,
  HeldCartSchema,
  PurchaseCreateSchema,
  PurchaseReceiveSchema,
  ReturnCreateSchema,
} from '../validation/schemas';

const router = Router();

// Dashboard
router.get('/dashboard', requireAuth, requirePermission('dashboard:view'), async (req, res, next) => {
  try {
    const { preset = '30d', start, end } = req.query as Record<string, string>;
    const data = await getDashboardData(preset, start, end);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POS Held Carts & Checkout
router.get('/pos/held-carts', requireAuth, requirePermission('pos:access'), async (_req, res, next) => {
  try {
    const carts = await db.heldCarts.find({}, { sort: { createdAt: -1 } });
    res.json({ success: true, data: carts });
  } catch (err) {
    next(err);
  }
});

router.post('/pos/held-carts', requireAuth, requirePermission('pos:access'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = HeldCartSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid held cart' });
    }
    const created = await db.heldCarts.create({
      ...parsed.data,
      heldById: req.user!._id,
      heldByName: req.user!.name,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.delete('/pos/held-carts/:id', requireAuth, requirePermission('pos:access'), async (req, res, next) => {
  try {
    await db.heldCarts.deleteById(req.params.id);
    res.json({ success: true, message: 'Held cart removed' });
  } catch (err) {
    next(err);
  }
});

router.post('/pos/checkout', requireAuth, requirePermission('pos:access'), rateLimit('pos-checkout', 60, 60_000), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = CheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid checkout payload' });
    }
    const result = await executeCheckout(parsed.data, req.user!, req.ip);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Checkout failed' });
  }
});

// Sales
router.get('/sales', requireAuth, requirePermission('sales:view'), async (req, res, next) => {
  try {
    const {
      search = '',
      cashierId = 'all',
      paymentMethod = 'all',
      status = 'all',
      start,
      end,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    let sales = await db.sales.find({}, { sort: { saleDate: -1 } });
    if (cashierId !== 'all') sales = sales.filter((s) => String(s.cashierId) === cashierId);
    if (paymentMethod !== 'all') sales = sales.filter((s) => s.paymentMethod === paymentMethod);
    if (status !== 'all') sales = sales.filter((s) => s.status === status);
    if (start) {
      const sTime = new Date(`${start}T00:00:00.000`).getTime();
      if (!isNaN(sTime)) sales = sales.filter((s) => new Date(s.saleDate).getTime() >= sTime);
    }
    if (end) {
      const eTime = new Date(`${end}T23:59:59.999`).getTime();
      if (!isNaN(eTime)) sales = sales.filter((s) => new Date(s.saleDate).getTime() <= eTime);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      sales = sales.filter(
        (s) =>
          s.invoiceNumber.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.cashierName.toLowerCase().includes(q)
      );
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    res.json({ success: true, data: { rows: sales.slice((p - 1) * l, p * l), total: sales.length, page: p, limit: l } });
  } catch (err) {
    next(err);
  }
});

router.get('/sales/:id', requireAuth, requirePermission('sales:view'), async (req, res, next) => {
  try {
    const sale = await db.sales.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    const [items, customer, returns] = await Promise.all([
      db.saleItems.find({ saleId: sale._id }),
      db.customers.findById(String(sale.customerId)),
      db.returns.find({ type: 'sale_return', originalTransactionId: sale._id }),
    ]);
    res.json({ success: true, data: { sale, items, customer, returns } });
  } catch (err) {
    next(err);
  }
});

router.post('/sales/:id/cancel', requireAuth, requirePermission('sales:cancel'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = z.object({ reason: z.string().trim().min(2).max(250) }).safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, error: 'Cancellation reason is required' });
    }
    const updated = await cancelSale(req.params.id, body.data.reason, req.user!, req.ip);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to cancel sale' });
  }
});

// Purchases
router.get('/purchases', requireAuth, requirePermission('purchases:view'), async (req, res, next) => {
  try {
    const { search = '', status = 'all' } = req.query as Record<string, string>;
    let rows = await db.purchases.find({}, { sort: { purchaseDate: -1 } });
    if (status !== 'all') rows = rows.filter((p) => p.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          p.purchaseNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q)
      );
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/purchases/:id', requireAuth, requirePermission('purchases:view'), async (req, res, next) => {
  try {
    const purchase = await db.purchases.findById(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const [items, supplier] = await Promise.all([
      db.purchaseItems.find({ purchaseId: purchase._id }),
      db.suppliers.findById(String(purchase.supplierId)),
    ]);
    res.json({ success: true, data: { purchase, items, supplier } });
  } catch (err) {
    next(err);
  }
});

router.post('/purchases', requireAuth, requirePermission('purchases:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = PurchaseCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid purchase order' });
    }
    const result = await createPurchase(parsed.data, req.user!, req.ip);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Purchase creation failed' });
  }
});

router.post('/purchases/:id/receive', requireAuth, requirePermission('purchases:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = PurchaseReceiveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid receive payload' });
    }
    const updated = await receivePurchaseItems(req.params.id, parsed.data.items, req.user!, req.ip);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Purchase receive failed' });
  }
});

router.post('/purchases/:id/cancel', requireAuth, requirePermission('purchases:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const updated = await cancelPurchase(req.params.id, req.user!, req.ip);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Cannot cancel purchase' });
  }
});

// Returns
router.get('/returns', requireAuth, requirePermission('returns:manage', 'sales:view', 'purchases:view'), async (req, res, next) => {
  try {
    const { type = 'all' } = req.query as Record<string, string>;
    let rows = await db.returns.find({}, { sort: { returnDate: -1 } });
    if (type !== 'all') rows = rows.filter((r) => r.type === type);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/returns', requireAuth, requirePermission('returns:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = ReturnCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid return data' });
    }
    const ret = await processReturn(parsed.data, req.user!, req.ip);
    res.status(201).json({ success: true, data: ret });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Return processing failed' });
  }
});

// Expenses & Categories
router.get('/expense-categories', requireAuth, requirePermission('expenses:view'), async (_req, res, next) => {
  try {
    const cats = await db.expenseCategories.find({ deletedAt: null }, { sort: { name: 1 } });
    res.json({ success: true, data: cats });
  } catch (err) {
    next(err);
  }
});

router.post('/expense-categories', requireAuth, requirePermission('expenses:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = ExpenseCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid expense category' });
    }
    const created = await db.expenseCategories.create(parsed.data);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.delete('/expense-categories/:id', requireAuth, requirePermission('expenses:manage'), async (req, res, next) => {
  try {
    const linked = await db.expenses.count({ categoryId: req.params.id, deletedAt: null });
    if (linked > 0) {
      return res.status(400).json({ success: false, error: 'Category has linked expenses and cannot be deleted' });
    }
    await db.expenseCategories.updateById(req.params.id, { $set: { deletedAt: new Date().toISOString() } });
    res.json({ success: true, message: 'Expense category deleted' });
  } catch (err) {
    next(err);
  }
});

router.get('/expenses', requireAuth, requirePermission('expenses:view'), async (req, res, next) => {
  try {
    const { categoryId = 'all', start, end, search = '' } = req.query as Record<string, string>;
    let rows = await db.expenses.find({ deletedAt: null }, { sort: { date: -1 } });
    if (categoryId !== 'all') rows = rows.filter((e) => String(e.categoryId) === categoryId);
    if (start) {
      const sTime = new Date(`${start}T00:00:00.000`).getTime();
      if (!isNaN(sTime)) rows = rows.filter((e) => new Date(e.date).getTime() >= sTime);
    }
    if (end) {
      const eTime = new Date(`${end}T23:59:59.999`).getTime();
      if (!isNaN(eTime)) rows = rows.filter((e) => new Date(e.date).getTime() <= eTime);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.categoryName.toLowerCase().includes(q) ||
          String(e.reference || '').toLowerCase().includes(q)
      );
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/expenses', requireAuth, requirePermission('expenses:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = ExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid expense' });
    }
    const cat = await db.expenseCategories.findById(parsed.data.categoryId);
    if (!cat || cat.deletedAt) return res.status(400).json({ success: false, error: 'Expense category not found' });

    const created = await db.expenses.create({
      ...parsed.data,
      categoryName: cat.name,
      date: parsed.data.date ? new Date(parsed.data.date).toISOString() : new Date().toISOString(),
      createdById: req.user!._id,
      createdByName: req.user!.name,
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'create',
      module: 'expenses',
      targetId: created._id,
      description: `Recorded expense "${created.title}" (${created.amount.toFixed(2)})`,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.put('/expenses/:id', requireAuth, requirePermission('expenses:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = ExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid expense' });
    }
    const cat = await db.expenseCategories.findById(parsed.data.categoryId);
    if (!cat || cat.deletedAt) return res.status(400).json({ success: false, error: 'Expense category not found' });

    const updated = await db.expenses.updateById(req.params.id, {
      $set: {
        ...parsed.data,
        categoryName: cat.name,
        date: parsed.data.date ? new Date(parsed.data.date).toISOString() : new Date().toISOString(),
      },
    });
    if (!updated) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/expenses/:id', requireAuth, requirePermission('expenses:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await db.expenses.findById(req.params.id);
    if (!existing || existing.deletedAt) return res.status(404).json({ success: false, error: 'Expense not found' });
    await db.expenses.updateById(existing._id, { $set: { deletedAt: new Date().toISOString() } });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'delete',
      module: 'expenses',
      targetId: existing._id,
      description: `Deleted expense "${existing.title}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    next(err);
  }
});

// Financial & Reports
router.get('/financial', requireAuth, requirePermission('financial:view'), async (req, res, next) => {
  try {
    const { preset = '30d', start, end } = req.query as Record<string, string>;
    const data = await getFinancialOverview(preset, start, end);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/reports/:type', requireAuth, requirePermission('reports:view'), async (req, res, next) => {
  try {
    const { preset = '30d', start, end } = req.query as Record<string, string>;
    const rows = await generateReport(req.params.type, preset, start, end);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Report generation failed' });
  }
});

export default router;

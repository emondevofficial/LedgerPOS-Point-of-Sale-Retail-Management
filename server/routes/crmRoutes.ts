import { Router } from 'express';
import { db, withTransaction } from '../db/store';
import { AuthenticatedRequest, requireAuth, requirePermission } from '../middleware/auth';
import { roundMoney } from '../services/posService';
import { logActivity } from '../utils/audit';
import { generateDocumentNumber } from '../utils/sequence';
import { CustomerSchema, PaymentCollectSchema, SupplierSchema } from '../validation/schemas';

const router = Router();

// Customers
router.get('/customers', requireAuth, async (req, res, next) => {
  try {
    const { search = '', type = 'all' } = req.query as Record<string, string>;
    let customers = await db.customers.find({ deletedAt: null }, { sort: { isWalkIn: -1, name: 1 } });
    if (type !== 'all') customers = customers.filter((c) => c.customerType === type);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      customers = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          String(c.phone || '').toLowerCase().includes(q) ||
          String(c.email || '').toLowerCase().includes(q) ||
          String(c.company || '').toLowerCase().includes(q)
      );
    }
    res.json({ success: true, data: customers });
  } catch (err) {
    next(err);
  }
});

router.get('/customers/:id/ledger', requireAuth, requirePermission('customers:view'), async (req, res, next) => {
  try {
    const customer = await db.customers.findById(req.params.id);
    if (!customer || customer.deletedAt) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const [sales, payments, returns] = await Promise.all([
      db.sales.find({ customerId: customer._id }, { sort: { saleDate: -1 } }),
      db.payments.find({ entityType: 'customer', entityId: customer._id }, { sort: { paymentDate: -1 } }),
      db.returns.find({ type: 'sale_return', entityId: customer._id }, { sort: { returnDate: -1 } }),
    ]);
    res.json({ success: true, data: { customer, sales, payments, returns } });
  } catch (err) {
    next(err);
  }
});

router.post('/customers', requireAuth, requirePermission('customers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = CustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid customer data' });
    }
    const created = await db.customers.create({
      ...parsed.data,
      currentDue: Number(parsed.data.openingBalance || 0),
      totalPurchases: 0,
      totalPaid: 0,
      isWalkIn: false,
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'create',
      module: 'customers',
      targetId: created._id,
      description: `Created customer "${created.name}"`,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.put('/customers/:id', requireAuth, requirePermission('customers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await db.customers.findById(req.params.id);
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    if (existing.isWalkIn) {
      return res.status(400).json({ success: false, error: 'Walk-in Customer is a system account and cannot be modified' });
    }
    const parsed = CustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid customer data' });
    }
    const updated = await db.customers.updateById(existing._id, { $set: parsed.data });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'update',
      module: 'customers',
      targetId: existing._id,
      description: `Updated customer "${parsed.data.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/customers/:id', requireAuth, requirePermission('customers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await db.customers.findById(req.params.id);
    if (!existing || existing.deletedAt) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (existing.isWalkIn) return res.status(400).json({ success: false, error: 'Cannot delete Walk-in Customer' });
    await db.customers.updateById(existing._id, {
      $set: { isActive: false, deletedAt: new Date().toISOString() },
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'delete',
      module: 'customers',
      targetId: existing._id,
      description: `Deleted customer "${existing.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    next(err);
  }
});

router.post('/customers/:id/payments', requireAuth, requirePermission('customers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = PaymentCollectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid payment' });
    }
    const result = await withTransaction(async (ctx) => {
      const customer = await db.customers.findById(req.params.id, ctx);
      if (!customer || customer.deletedAt) throw new Error('Customer not found');
      const currentDue = Number(customer.currentDue || 0);
      if (parsed.data.amount > currentDue + 0.01) {
        throw new Error(`Payment (${parsed.data.amount}) exceeds customer due balance (${currentDue.toFixed(2)})`);
      }

      const ref = await generateDocumentNumber('PAY', 'payments', 'referenceNumber', ctx);
      const payment = await db.payments.create(
        {
          referenceNumber: ref,
          entityType: 'customer',
          entityId: customer._id,
          entityName: customer.name,
          saleId: parsed.data.saleId || null,
          direction: 'inflow',
          amount: roundMoney(parsed.data.amount),
          method: parsed.data.method,
          notes: parsed.data.notes || 'Customer due collection',
          paymentDate: new Date().toISOString(),
          recordedById: req.user!._id,
          recordedByName: req.user!.name,
        },
        ctx
      );

      // Settle open due invoices FIFO or specific invoice
      let remainingToAllocate = roundMoney(parsed.data.amount);
      const openSales = (
        await db.sales.find({ customerId: customer._id }, { sort: { saleDate: 1 } }, ctx)
      ).filter((s) => s.status !== 'canceled' && Number(s.dueAmount || 0) > 0);

      if (parsed.data.saleId) {
        openSales.sort((a, b) => (a._id === parsed.data.saleId ? -1 : b._id === parsed.data.saleId ? 1 : 0));
      }

      for (const sale of openSales) {
        if (remainingToAllocate <= 0) break;
        const saleDue = Number(sale.dueAmount || 0);
        const apply = roundMoney(Math.min(saleDue, remainingToAllocate));
        const nextDue = roundMoney(saleDue - apply);
        const nextPaid = roundMoney(Number(sale.paidAmount || 0) + apply);
        await db.sales.updateById(
          sale._id,
          {
            $set: {
              paidAmount: nextPaid,
              dueAmount: nextDue,
              paymentStatus: nextDue <= 0 ? 'paid' : 'partial',
            },
          },
          ctx
        );
        remainingToAllocate = roundMoney(remainingToAllocate - apply);
      }

      const updatedCustomer = await db.customers.updateById(
        customer._id,
        {
          $set: {
            currentDue: roundMoney(Math.max(0, currentDue - parsed.data.amount)),
            totalPaid: roundMoney(Number(customer.totalPaid || 0) + parsed.data.amount),
          },
        },
        ctx
      );

      await logActivity(
        {
          userId: req.user!._id,
          userName: req.user!.name,
          userRole: req.user!.roleName,
          action: 'payment',
          module: 'customers',
          targetId: customer._id,
          description: `Collected ${parsed.data.amount.toFixed(2)} (${parsed.data.method}) from "${customer.name}"`,
          ipAddress: req.ip,
        },
        ctx
      );

      return { payment, customer: updatedCustomer };
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Payment collection failed' });
  }
});

// Suppliers
router.get('/suppliers', requireAuth, async (req, res, next) => {
  try {
    const { search = '' } = req.query as Record<string, string>;
    let suppliers = await db.suppliers.find({ deletedAt: null }, { sort: { name: 1 } });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      suppliers = suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          String(s.companyName || '').toLowerCase().includes(q) ||
          String(s.phone || '').toLowerCase().includes(q) ||
          String(s.email || '').toLowerCase().includes(q)
      );
    }
    res.json({ success: true, data: suppliers });
  } catch (err) {
    next(err);
  }
});

router.get('/suppliers/:id/ledger', requireAuth, requirePermission('suppliers:view'), async (req, res, next) => {
  try {
    const supplier = await db.suppliers.findById(req.params.id);
    if (!supplier || supplier.deletedAt) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const [purchases, payments, returns] = await Promise.all([
      db.purchases.find({ supplierId: supplier._id }, { sort: { purchaseDate: -1 } }),
      db.payments.find({ entityType: 'supplier', entityId: supplier._id }, { sort: { paymentDate: -1 } }),
      db.returns.find({ type: 'purchase_return', entityId: supplier._id }, { sort: { returnDate: -1 } }),
    ]);
    res.json({ success: true, data: { supplier, purchases, payments, returns } });
  } catch (err) {
    next(err);
  }
});

router.post('/suppliers', requireAuth, requirePermission('suppliers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = SupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid supplier data' });
    }
    const created = await db.suppliers.create({
      ...parsed.data,
      currentDue: Number(parsed.data.openingBalance || 0),
      totalPurchases: 0,
      totalPaid: 0,
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'create',
      module: 'suppliers',
      targetId: created._id,
      description: `Created supplier "${created.name}"`,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.put('/suppliers/:id', requireAuth, requirePermission('suppliers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await db.suppliers.findById(req.params.id);
    if (!existing || existing.deletedAt) return res.status(404).json({ success: false, error: 'Supplier not found' });
    const parsed = SupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid supplier data' });
    }
    const updated = await db.suppliers.updateById(existing._id, { $set: parsed.data });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'update',
      module: 'suppliers',
      targetId: existing._id,
      description: `Updated supplier "${parsed.data.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/suppliers/:id', requireAuth, requirePermission('suppliers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await db.suppliers.findById(req.params.id);
    if (!existing || existing.deletedAt) return res.status(404).json({ success: false, error: 'Supplier not found' });
    await db.suppliers.updateById(existing._id, {
      $set: { isActive: false, deletedAt: new Date().toISOString() },
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'delete',
      module: 'suppliers',
      targetId: existing._id,
      description: `Deleted supplier "${existing.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Supplier deleted' });
  } catch (err) {
    next(err);
  }
});

router.post('/suppliers/:id/payments', requireAuth, requirePermission('suppliers:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = PaymentCollectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid payment' });
    }
    const result = await withTransaction(async (ctx) => {
      const supplier = await db.suppliers.findById(req.params.id, ctx);
      if (!supplier || supplier.deletedAt) throw new Error('Supplier not found');
      const currentDue = Number(supplier.currentDue || 0);
      if (parsed.data.amount > currentDue + 0.01) {
        throw new Error(`Payment (${parsed.data.amount}) exceeds supplier outstanding balance (${currentDue.toFixed(2)})`);
      }

      const ref = await generateDocumentNumber('PAY', 'payments', 'referenceNumber', ctx);
      const payment = await db.payments.create(
        {
          referenceNumber: ref,
          entityType: 'supplier',
          entityId: supplier._id,
          entityName: supplier.name,
          purchaseId: parsed.data.purchaseId || null,
          direction: 'outflow',
          amount: roundMoney(parsed.data.amount),
          method: parsed.data.method,
          notes: parsed.data.notes || 'Supplier due payment',
          paymentDate: new Date().toISOString(),
          recordedById: req.user!._id,
          recordedByName: req.user!.name,
        },
        ctx
      );

      let remaining = roundMoney(parsed.data.amount);
      const openPOs = (
        await db.purchases.find({ supplierId: supplier._id }, { sort: { purchaseDate: 1 } }, ctx)
      ).filter((p) => p.status !== 'draft' && p.status !== 'canceled' && Number(p.dueAmount || 0) > 0);

      for (const po of openPOs) {
        if (remaining <= 0) break;
        const poDue = Number(po.dueAmount || 0);
        const apply = roundMoney(Math.min(poDue, remaining));
        const nextDue = roundMoney(poDue - apply);
        const nextPaid = roundMoney(Number(po.paidAmount || 0) + apply);
        await db.purchases.updateById(
          po._id,
          {
            $set: {
              paidAmount: nextPaid,
              dueAmount: nextDue,
              paymentStatus: nextDue <= 0 ? 'paid' : 'partial',
            },
          },
          ctx
        );
        remaining = roundMoney(remaining - apply);
      }

      const updatedSupplier = await db.suppliers.updateById(
        supplier._id,
        {
          $set: {
            currentDue: roundMoney(Math.max(0, currentDue - parsed.data.amount)),
            totalPaid: roundMoney(Number(supplier.totalPaid || 0) + parsed.data.amount),
          },
        },
        ctx
      );

      await logActivity(
        {
          userId: req.user!._id,
          userName: req.user!.name,
          userRole: req.user!.roleName,
          action: 'payment',
          module: 'suppliers',
          targetId: supplier._id,
          description: `Paid ${parsed.data.amount.toFixed(2)} (${parsed.data.method}) to supplier "${supplier.name}"`,
          ipAddress: req.ip,
        },
        ctx
      );

      return { payment, supplier: updatedSupplier };
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Supplier payment failed' });
  }
});

export default router;

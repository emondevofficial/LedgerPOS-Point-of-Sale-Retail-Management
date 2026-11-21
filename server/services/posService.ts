import { AuthUser } from '../../shared/types';
import { db, withTransaction } from '../db/store';
import { createNotification, evaluateProductStockNotification, logActivity } from '../utils/audit';
import { generateDocumentNumber } from '../utils/sequence';

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
  discountType?: 'fixed' | 'percent';
  discountValue?: number;
}

export interface CalculatedLineItem {
  product: Record<string, any>;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  grossLine: number;
  discountAmount: number;
  netBeforeTax: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateCheckoutTotals(params: {
  resolvedItems: Array<{
    product: Record<string, any>;
    quantity: number;
    discountType?: 'fixed' | 'percent';
    discountValue?: number;
  }>;
  invoiceDiscountType?: 'fixed' | 'percent';
  invoiceDiscountValue?: number;
  enableTax: boolean;
  defaultTaxRate: number;
  enableDiscounts: boolean;
  paidAmount: number;
  isWalkIn: boolean;
}) {
  let subtotal = 0;
  let itemDiscountTotal = 0;
  let costTotal = 0;

  const lines: CalculatedLineItem[] = params.resolvedItems.map((entry) => {
    const unitPrice = Number(entry.product.sellingPrice || 0);
    const costPrice = Number(entry.product.purchasePrice || 0);
    const qty = Number(entry.quantity);
    const grossLine = roundMoney(unitPrice * qty);

    let itemDiscount = 0;
    if (params.enableDiscounts && entry.discountValue && entry.discountValue > 0) {
      if (entry.discountType === 'percent') {
        const pct = Math.min(100, Math.max(0, entry.discountValue));
        itemDiscount = roundMoney((grossLine * pct) / 100);
      } else {
        itemDiscount = roundMoney(Math.min(grossLine, entry.discountValue));
      }
    }

    const netBeforeTax = roundMoney(Math.max(0, grossLine - itemDiscount));
    const taxRate = params.enableTax
      ? Number(entry.product.taxRate ?? params.defaultTaxRate ?? 0)
      : 0;

    subtotal = roundMoney(subtotal + grossLine);
    itemDiscountTotal = roundMoney(itemDiscountTotal + itemDiscount);
    costTotal = roundMoney(costTotal + costPrice * qty);

    return {
      product: entry.product,
      quantity: qty,
      unitPrice,
      costPrice,
      grossLine,
      discountAmount: itemDiscount,
      netBeforeTax,
      taxRate,
      taxAmount: 0,
      lineTotal: netBeforeTax,
    };
  });

  const netAfterItemDiscounts = roundMoney(Math.max(0, subtotal - itemDiscountTotal));

  let invoiceDiscountAmount = 0;
  if (params.enableDiscounts && params.invoiceDiscountValue && params.invoiceDiscountValue > 0) {
    if (params.invoiceDiscountType === 'percent') {
      const pct = Math.min(100, Math.max(0, params.invoiceDiscountValue));
      invoiceDiscountAmount = roundMoney((netAfterItemDiscounts * pct) / 100);
    } else {
      invoiceDiscountAmount = roundMoney(Math.min(netAfterItemDiscounts, params.invoiceDiscountValue));
    }
  }

  let taxAmount = 0;
  for (const line of lines) {
    const share = netAfterItemDiscounts > 0 ? line.netBeforeTax / netAfterItemDiscounts : 0;
    const allocatedInvoiceDiscount = roundMoney(invoiceDiscountAmount * share);
    const taxableBase = roundMoney(Math.max(0, line.netBeforeTax - allocatedInvoiceDiscount));
    line.taxAmount = roundMoney((taxableBase * line.taxRate) / 100);
    line.lineTotal = roundMoney(taxableBase + line.taxAmount);
    taxAmount = roundMoney(taxAmount + line.taxAmount);
  }

  const grandTotal = roundMoney(Math.max(0, netAfterItemDiscounts - invoiceDiscountAmount + taxAmount));
  const paid = roundMoney(Math.max(0, params.paidAmount));

  if (params.isWalkIn && paid + 0.001 < grandTotal) {
    throw new Error('Walk-in customers must pay the full invoice amount. Select a registered customer for partial/due payments.');
  }

  const appliedPaid = roundMoney(Math.min(grandTotal, paid));
  const dueAmount = roundMoney(Math.max(0, grandTotal - appliedPaid));
  const changeAmount = roundMoney(Math.max(0, paid - grandTotal));

  let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'paid';
  if (dueAmount >= grandTotal && grandTotal > 0) {
    paymentStatus = 'unpaid';
  } else if (dueAmount > 0) {
    paymentStatus = 'partial';
  }

  return {
    lines,
    subtotal,
    itemDiscountTotal,
    invoiceDiscountAmount,
    taxAmount,
    grandTotal,
    costTotal,
    appliedPaid,
    dueAmount,
    changeAmount,
    paymentStatus,
  };
}

export async function executeCheckout(
  input: {
    clientRequestId?: string;
    customerId: string;
    items: CheckoutItemInput[];
    invoiceDiscountType?: 'fixed' | 'percent';
    invoiceDiscountValue?: number;
    paidAmount: number;
    paymentMethod: string;
    paymentSplit?: Array<{ method: string; amount: number }>;
    notes?: string;
    heldCartId?: string;
  },
  user: AuthUser,
  ipAddress = ''
) {
  if (input.clientRequestId) {
    const existing = await db.sales.findOne({ clientRequestId: input.clientRequestId });
    if (existing) {
      const items = await db.saleItems.find({ saleId: existing._id });
      return { sale: existing, items, deduplicated: true };
    }
  }

  return withTransaction(async (ctx) => {
    const settings = await db.settings.findOne({}, ctx);
    const customer = await db.customers.findById(input.customerId, ctx);
    if (!customer || customer.deletedAt) {
      throw new Error('Selected customer not found');
    }

    const aggregatedMap = new Map<string, CheckoutItemInput>();
    for (const item of input.items) {
      const existing = aggregatedMap.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        aggregatedMap.set(item.productId, { ...item });
      }
    }

    const resolvedItems: Array<{
      product: Record<string, any>;
      quantity: number;
      discountType?: 'fixed' | 'percent';
      discountValue?: number;
    }> = [];

    for (const entry of aggregatedMap.values()) {
      const product = await db.products.findById(entry.productId, ctx);
      if (!product || product.deletedAt) {
        throw new Error('One or more selected products no longer exist');
      }
      if (product.status !== 'active') {
        throw new Error(`Product "${product.name}" is currently inactive`);
      }
      if (Number(product.stockQuantity) < entry.quantity) {
        throw new Error(
          `Insufficient stock for "${product.name}" (available: ${product.stockQuantity}, requested: ${entry.quantity})`
        );
      }
      resolvedItems.push({
        product,
        quantity: entry.quantity,
        discountType: entry.discountType,
        discountValue: entry.discountValue,
      });
    }

    const hasDiscountRequest =
      (input.invoiceDiscountValue || 0) > 0 ||
      resolvedItems.some((i) => (i.discountValue || 0) > 0);
    if (hasDiscountRequest && user.roleSlug !== 'super_admin' && !user.permissions.includes('pos:discount')) {
      throw new Error('You do not have permission to apply discounts');
    }

    const summary = calculateCheckoutTotals({
      resolvedItems,
      invoiceDiscountType: input.invoiceDiscountType,
      invoiceDiscountValue: input.invoiceDiscountValue,
      enableTax: settings ? Boolean(settings.enableTax) : true,
      defaultTaxRate: Number(settings?.defaultTaxRate || 0),
      enableDiscounts: settings ? Boolean(settings.enableDiscounts) : true,
      paidAmount: input.paidAmount,
      isWalkIn: Boolean(customer.isWalkIn),
    });

    if (input.paymentMethod === 'Mixed Payment') {
      const splitSum = roundMoney(
        (input.paymentSplit || []).reduce((acc, s) => acc + Number(s.amount || 0), 0)
      );
      if (Math.abs(splitSum - roundMoney(input.paidAmount)) > 0.05) {
        throw new Error('Mixed payment split amounts must sum to the paid amount');
      }
    }

    const invoicePrefix = settings?.invoicePrefix || 'INV';
    const invoiceNumber = await generateDocumentNumber(invoicePrefix, 'sales', 'invoiceNumber', ctx);

    const sale = await db.sales.create(
      {
        invoiceNumber,
        clientRequestId: input.clientRequestId || undefined,
        customerId: customer._id,
        customerName: customer.name,
        cashierId: user._id,
        cashierName: user.name,
        subtotal: summary.subtotal,
        itemDiscountTotal: summary.itemDiscountTotal,
        invoiceDiscountType: input.invoiceDiscountType || 'fixed',
        invoiceDiscountValue: Number(input.invoiceDiscountValue || 0),
        invoiceDiscountAmount: summary.invoiceDiscountAmount,
        taxAmount: summary.taxAmount,
        grandTotal: summary.grandTotal,
        costTotal: summary.costTotal,
        paidAmount: summary.appliedPaid,
        dueAmount: summary.dueAmount,
        changeAmount: summary.changeAmount,
        paymentMethod: input.paymentMethod,
        paymentSplit:
          input.paymentMethod === 'Mixed Payment'
            ? (input.paymentSplit || []).filter((s) => s.amount > 0)
            : [{ method: input.paymentMethod, amount: summary.appliedPaid }],
        paymentStatus: summary.paymentStatus,
        status: 'completed',
        notes: input.notes || '',
        saleDate: new Date().toISOString(),
      },
      ctx
    );

    const createdItems = [];
    for (const line of summary.lines) {
      const prevQty = Number(line.product.stockQuantity);
      const newQty = prevQty - line.quantity;

      await db.products.updateById(
        line.product._id,
        { $set: { stockQuantity: newQty } },
        ctx
      );

      await db.stockMovements.create(
        {
          productId: line.product._id,
          productName: line.product.name,
          sku: line.product.sku,
          movementType: 'sale',
          previousQuantity: prevQty,
          changedQuantity: -line.quantity,
          newQuantity: newQty,
          reason: `POS Sale ${invoiceNumber}`,
          reference: invoiceNumber,
          userId: user._id,
          userName: user.name,
        },
        ctx
      );

      const saleItem = await db.saleItems.create(
        {
          saleId: sale._id,
          productId: line.product._id,
          productName: line.product.name,
          sku: line.product.sku,
          barcode: line.product.barcode || '',
          categoryId: line.product.categoryId,
          quantity: line.quantity,
          returnedQuantity: 0,
          unitPrice: line.unitPrice,
          costPrice: line.costPrice,
          discountAmount: line.discountAmount,
          taxRate: line.taxRate,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
        },
        ctx
      );
      createdItems.push(saleItem);

      await evaluateProductStockNotification(
        {
          _id: line.product._id,
          name: line.product.name,
          sku: line.product.sku,
          stockQuantity: newQty,
          minStockAlert: Number(line.product.minStockAlert ?? 10),
        },
        ctx
      );
    }

    if (summary.appliedPaid > 0) {
      const payRef = await generateDocumentNumber('PAY', 'payments', 'referenceNumber', ctx);
      await db.payments.create(
        {
          referenceNumber: payRef,
          entityType: 'customer',
          entityId: customer._id,
          entityName: customer.name,
          saleId: sale._id,
          direction: 'inflow',
          amount: summary.appliedPaid,
          method: input.paymentMethod,
          notes: `Payment for ${invoiceNumber}`,
          paymentDate: new Date().toISOString(),
          recordedById: user._id,
          recordedByName: user.name,
        },
        ctx
      );
    }

    await db.customers.updateById(
      customer._id,
      {
        $inc: {
          totalPurchases: summary.grandTotal,
          totalPaid: summary.appliedPaid,
          currentDue: summary.dueAmount,
        },
      },
      ctx
    );

    if (input.heldCartId) {
      await db.heldCarts.deleteById(input.heldCartId, ctx);
    }

    if (!settings || settings.notifyNewSale !== false) {
      await createNotification(
        {
          type: 'new_sale',
          title: `New Sale ${invoiceNumber}`,
          message: `${customer.name} · ${settings?.currencySymbol || '$'}${summary.grandTotal.toFixed(2)} (${input.paymentMethod})`,
          severity: 'info',
          linkView: 'sales',
          entityId: sale._id,
        },
        ctx
      );
    }

    await logActivity(
      {
        userId: user._id,
        userName: user.name,
        userRole: user.roleName,
        action: 'create',
        module: 'sales',
        targetId: sale._id,
        description: `Completed POS sale ${invoiceNumber} for ${customer.name} totaling ${summary.grandTotal.toFixed(2)}`,
        ipAddress,
      },
      ctx
    );

    return { sale, items: createdItems, deduplicated: false };
  });
}

export async function cancelSale(saleId: string, reason: string, user: AuthUser, ipAddress = '') {
  return withTransaction(async (ctx) => {
    const sale = await db.sales.findById(saleId, ctx);
    if (!sale) throw new Error('Sale not found');
    if (sale.status === 'canceled') throw new Error('Sale is already canceled');
    if (sale.status === 'refunded' || sale.status === 'partial_return') {
      throw new Error('Cannot cancel a sale that already has processed returns');
    }

    const items = await db.saleItems.find({ saleId: sale._id }, {}, ctx);

    for (const item of items) {
      const product = await db.products.findById(String(item.productId), ctx);
      if (product) {
        const prevQty = Number(product.stockQuantity);
        const restoreQty = Number(item.quantity) - Number(item.returnedQuantity || 0);
        if (restoreQty > 0) {
          const newQty = prevQty + restoreQty;
          await db.products.updateById(product._id, { $set: { stockQuantity: newQty } }, ctx);
          await db.stockMovements.create(
            {
              productId: product._id,
              productName: product.name,
              sku: product.sku,
              movementType: 'return_in',
              previousQuantity: prevQty,
              changedQuantity: restoreQty,
              newQuantity: newQty,
              reason: `Sale Canceled: ${reason}`,
              reference: sale.invoiceNumber,
              userId: user._id,
              userName: user.name,
            },
            ctx
          );
        }
      }
    }

    if (Number(sale.paidAmount) > 0) {
      const payRef = await generateDocumentNumber('REF', 'payments', 'referenceNumber', ctx);
      await db.payments.create(
        {
          referenceNumber: payRef,
          entityType: 'customer',
          entityId: sale.customerId,
          entityName: sale.customerName,
          saleId: sale._id,
          direction: 'outflow',
          amount: Number(sale.paidAmount),
          method: sale.paymentMethod === 'Mixed Payment' ? 'Cash' : sale.paymentMethod,
          notes: `Reversal for canceled invoice ${sale.invoiceNumber}: ${reason}`,
          paymentDate: new Date().toISOString(),
          recordedById: user._id,
          recordedByName: user.name,
        },
        ctx
      );
    }

    const customer = await db.customers.findById(String(sale.customerId), ctx);
    if (customer) {
      await db.customers.updateById(
        customer._id,
        {
          $set: {
            totalPurchases: roundMoney(Math.max(0, Number(customer.totalPurchases) - Number(sale.grandTotal))),
            totalPaid: roundMoney(Math.max(0, Number(customer.totalPaid) - Number(sale.paidAmount))),
            currentDue: roundMoney(Math.max(0, Number(customer.currentDue) - Number(sale.dueAmount))),
          },
        },
        ctx
      );
    }

    const updated = await db.sales.updateById(
      sale._id,
      {
        $set: {
          status: 'canceled',
          paymentStatus: 'refunded',
          canceledAt: new Date().toISOString(),
          cancelReason: reason,
        },
      },
      ctx
    );

    await logActivity(
      {
        userId: user._id,
        userName: user.name,
        userRole: user.roleName,
        action: 'cancel',
        module: 'sales',
        targetId: sale._id,
        description: `Canceled sale ${sale.invoiceNumber}: ${reason}`,
        ipAddress,
      },
      ctx
    );

    return updated;
  });
}

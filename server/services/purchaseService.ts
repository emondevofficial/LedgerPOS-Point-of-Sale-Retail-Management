import { AuthUser } from '../../shared/types';
import { db, withTransaction } from '../db/store';
import { createNotification, logActivity } from '../utils/audit';
import { generateDocumentNumber } from '../utils/sequence';
import { roundMoney } from './posService';

export async function createPurchase(
  input: {
    supplierId: string;
    items: Array<{
      productId: string;
      orderedQuantity: number;
      purchasePrice: number;
      taxRate?: number;
    }>;
    discountAmount?: number;
    shippingCost?: number;
    paidAmount?: number;
    paymentMethod?: string;
    status?: 'draft' | 'ordered' | 'received';
    notes?: string;
  },
  user: AuthUser,
  ipAddress = ''
) {
  return withTransaction(async (ctx) => {
    const supplier = await db.suppliers.findById(input.supplierId, ctx);
    if (!supplier || supplier.deletedAt) {
      throw new Error('Selected supplier not found');
    }

    let subtotal = 0;
    let taxAmount = 0;
    const preparedItems: Array<{
      product: Record<string, any>;
      orderedQuantity: number;
      purchasePrice: number;
      taxRate: number;
      lineTotal: number;
    }> = [];

    for (const item of input.items) {
      const product = await db.products.findById(item.productId, ctx);
      if (!product || product.deletedAt) {
        throw new Error('One or more selected products not found');
      }
      const lineSub = roundMoney(item.purchasePrice * item.orderedQuantity);
      const lineTax = roundMoney((lineSub * Number(item.taxRate || 0)) / 100);
      subtotal = roundMoney(subtotal + lineSub);
      taxAmount = roundMoney(taxAmount + lineTax);
      preparedItems.push({
        product,
        orderedQuantity: item.orderedQuantity,
        purchasePrice: item.purchasePrice,
        taxRate: Number(item.taxRate || 0),
        lineTotal: roundMoney(lineSub + lineTax),
      });
    }

    const discountAmount = roundMoney(Math.min(subtotal, Number(input.discountAmount || 0)));
    const shippingCost = roundMoney(Number(input.shippingCost || 0));
    const totalAmount = roundMoney(Math.max(0, subtotal - discountAmount + taxAmount + shippingCost));
    const status = input.status || 'ordered';
    const isDraft = status === 'draft';
    const isReceived = status === 'received';

    const paidAmount = isDraft ? 0 : roundMoney(Math.min(totalAmount, Number(input.paidAmount || 0)));
    const dueAmount = isDraft ? 0 : roundMoney(Math.max(0, totalAmount - paidAmount));
    const paymentStatus =
      paidAmount >= totalAmount && totalAmount > 0
        ? 'paid'
        : paidAmount > 0
        ? 'partial'
        : 'unpaid';

    const purchaseNumber = await generateDocumentNumber('PO', 'purchases', 'purchaseNumber', ctx);

    const purchase = await db.purchases.create(
      {
        purchaseNumber,
        supplierId: supplier._id,
        supplierName: supplier.name,
        subtotal,
        discountAmount,
        taxAmount,
        shippingCost,
        totalAmount,
        paidAmount,
        dueAmount,
        paymentMethod: input.paymentMethod || 'Bank Transfer',
        paymentStatus,
        status,
        notes: input.notes || '',
        purchaseDate: new Date().toISOString(),
        receivedAt: isReceived ? new Date().toISOString() : null,
        createdById: user._id,
        createdByName: user.name,
      },
      ctx
    );

    const createdItems = [];
    for (const line of preparedItems) {
      const receivedQty = isReceived ? line.orderedQuantity : 0;
      const pItem = await db.purchaseItems.create(
        {
          purchaseId: purchase._id,
          productId: line.product._id,
          productName: line.product.name,
          sku: line.product.sku,
          orderedQuantity: line.orderedQuantity,
          receivedQuantity: receivedQty,
          returnedQuantity: 0,
          purchasePrice: line.purchasePrice,
          taxRate: line.taxRate,
          lineTotal: line.lineTotal,
        },
        ctx
      );
      createdItems.push(pItem);

      if (isReceived && receivedQty > 0) {
        const prevQty = Number(line.product.stockQuantity);
        const newQty = prevQty + receivedQty;
        await db.products.updateById(
          line.product._id,
          {
            $set: {
              stockQuantity: newQty,
              purchasePrice: line.purchasePrice,
            },
          },
          ctx
        );
        await db.stockMovements.create(
          {
            productId: line.product._id,
            productName: line.product.name,
            sku: line.product.sku,
            movementType: 'purchase',
            previousQuantity: prevQty,
            changedQuantity: receivedQty,
            newQuantity: newQty,
            reason: `Purchase Received (${purchaseNumber})`,
            reference: purchaseNumber,
            userId: user._id,
            userName: user.name,
          },
          ctx
        );
      }
    }

    if (!isDraft) {
      await db.suppliers.updateById(
        supplier._id,
        {
          $inc: {
            totalPurchases: totalAmount,
            totalPaid: paidAmount,
            currentDue: dueAmount,
          },
        },
        ctx
      );

      if (paidAmount > 0) {
        const payRef = await generateDocumentNumber('PAY', 'payments', 'referenceNumber', ctx);
        await db.payments.create(
          {
            referenceNumber: payRef,
            entityType: 'supplier',
            entityId: supplier._id,
            entityName: supplier.name,
            purchaseId: purchase._id,
            direction: 'outflow',
            amount: paidAmount,
            method: input.paymentMethod || 'Bank Transfer',
            notes: `Payment for ${purchaseNumber}`,
            paymentDate: new Date().toISOString(),
            recordedById: user._id,
            recordedByName: user.name,
          },
          ctx
        );
      }
    }

    if (isReceived) {
      await createNotification(
        {
          type: 'purchase_received',
          title: `Purchase Received: ${purchaseNumber}`,
          message: `Inventory updated from ${supplier.name} (${preparedItems.length} line items).`,
          severity: 'info',
          linkView: 'purchases',
          entityId: purchase._id,
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
        module: 'purchases',
        targetId: purchase._id,
        description: `Created purchase order ${purchaseNumber} (${status}) for ${supplier.name} totaling ${totalAmount.toFixed(2)}`,
        ipAddress,
      },
      ctx
    );

    return { purchase, items: createdItems };
  });
}

export async function receivePurchaseItems(
  purchaseId: string,
  receiveList: Array<{ purchaseItemId: string; receiveQuantity: number }>,
  user: AuthUser,
  ipAddress = ''
) {
  return withTransaction(async (ctx) => {
    const purchase = await db.purchases.findById(purchaseId, ctx);
    if (!purchase) throw new Error('Purchase order not found');
    if (purchase.status === 'canceled') throw new Error('Cannot receive a canceled purchase order');
    if (purchase.status === 'received') throw new Error('Purchase order is already fully received');

    const wasDraft = purchase.status === 'draft';
    const items = await db.purchaseItems.find({ purchaseId: purchase._id }, {}, ctx);
    const itemMap = new Map(items.map((i) => [i._id, i]));

    let receivedAny = false;

    for (const entry of receiveList) {
      if (entry.receiveQuantity <= 0) continue;
      const pItem = itemMap.get(entry.purchaseItemId);
      if (!pItem) throw new Error('Purchase item not found');
      const remaining = Number(pItem.orderedQuantity) - Number(pItem.receivedQuantity || 0);
      if (entry.receiveQuantity > remaining) {
        throw new Error(
          `Cannot receive ${entry.receiveQuantity} units of "${pItem.productName}". Only ${remaining} remaining.`
        );
      }

      const product = await db.products.findById(String(pItem.productId), ctx);
      if (!product) throw new Error(`Product "${pItem.productName}" not found`);

      const prevQty = Number(product.stockQuantity);
      const newQty = prevQty + entry.receiveQuantity;

      await db.products.updateById(
        product._id,
        {
          $set: {
            stockQuantity: newQty,
            purchasePrice: Number(pItem.purchasePrice),
          },
        },
        ctx
      );

      await db.stockMovements.create(
        {
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          movementType: 'purchase',
          previousQuantity: prevQty,
          changedQuantity: entry.receiveQuantity,
          newQuantity: newQty,
          reason: `PO Receiving (${purchase.purchaseNumber})`,
          reference: purchase.purchaseNumber,
          userId: user._id,
          userName: user.name,
        },
        ctx
      );

      const nextReceived = Number(pItem.receivedQuantity || 0) + entry.receiveQuantity;
      await db.purchaseItems.updateById(pItem._id, { $set: { receivedQuantity: nextReceived } }, ctx);
      pItem.receivedQuantity = nextReceived;
      receivedAny = true;
    }

    if (!receivedAny) {
      throw new Error('Specify at least one item quantity greater than zero to receive');
    }

    const allReceived = items.every(
      (i) => Number(i.receivedQuantity || 0) >= Number(i.orderedQuantity)
    );
    const nextStatus = allReceived ? 'received' : 'partial_received';

    const updateSet: Record<string, any> = {
      status: nextStatus,
      receivedAt: allReceived ? new Date().toISOString() : purchase.receivedAt,
    };

    if (wasDraft) {
      updateSet.dueAmount = Number(purchase.totalAmount);
      await db.suppliers.updateById(
        String(purchase.supplierId),
        {
          $inc: {
            totalPurchases: Number(purchase.totalAmount),
            currentDue: Number(purchase.totalAmount),
          },
        },
        ctx
      );
    }

    const updated = await db.purchases.updateById(purchase._id, { $set: updateSet }, ctx);

    await createNotification(
      {
        type: 'purchase_received',
        title: `Stock Received: ${purchase.purchaseNumber}`,
        message: `Purchase order ${purchase.purchaseNumber} marked as ${nextStatus.replace('_', ' ')}.`,
        severity: 'info',
        linkView: 'purchases',
        entityId: purchase._id,
      },
      ctx
    );

    await logActivity(
      {
        userId: user._id,
        userName: user.name,
        userRole: user.roleName,
        action: 'receive',
        module: 'purchases',
        targetId: purchase._id,
        description: `Received inventory for ${purchase.purchaseNumber} (status: ${nextStatus})`,
        ipAddress,
      },
      ctx
    );

    return updated;
  });
}

export async function cancelPurchase(purchaseId: string, user: AuthUser, ipAddress = '') {
  return withTransaction(async (ctx) => {
    const purchase = await db.purchases.findById(purchaseId, ctx);
    if (!purchase) throw new Error('Purchase order not found');
    if (purchase.status === 'received' || purchase.status === 'partial_received') {
      throw new Error('Cannot cancel a purchase order that has already received inventory');
    }
    if (purchase.status === 'canceled') {
      throw new Error('Purchase order is already canceled');
    }

    if (purchase.status === 'ordered') {
      const supplier = await db.suppliers.findById(String(purchase.supplierId), ctx);
      if (supplier) {
        await db.suppliers.updateById(
          supplier._id,
          {
            $set: {
              totalPurchases: roundMoney(Math.max(0, Number(supplier.totalPurchases) - Number(purchase.totalAmount))),
              currentDue: roundMoney(Math.max(0, Number(supplier.currentDue) - Number(purchase.dueAmount))),
            },
          },
          ctx
        );
      }
    }

    const updated = await db.purchases.updateById(
      purchase._id,
      { $set: { status: 'canceled' } },
      ctx
    );

    await logActivity(
      {
        userId: user._id,
        userName: user.name,
        userRole: user.roleName,
        action: 'cancel',
        module: 'purchases',
        targetId: purchase._id,
        description: `Canceled purchase order ${purchase.purchaseNumber}`,
        ipAddress,
      },
      ctx
    );

    return updated;
  });
}

import { AuthUser } from '../../shared/types';
import { db, withTransaction } from '../db/store';
import { logActivity } from '../utils/audit';
import { generateDocumentNumber } from '../utils/sequence';
import { roundMoney } from './posService';

export async function processReturn(
  input: {
    type: 'sale_return' | 'purchase_return';
    originalTransactionId: string;
    items: Array<{ itemId: string; quantity: number }>;
    refundMethod: string;
    reason: string;
    condition: 'restock' | 'damaged';
  },
  user: AuthUser,
  ipAddress = ''
) {
  return withTransaction(async (ctx) => {
    const returnNumber = await generateDocumentNumber('RET', 'returns', 'returnNumber', ctx);

    if (input.type === 'sale_return') {
      const sale = await db.sales.findById(input.originalTransactionId, ctx);
      if (!sale) throw new Error('Original sale invoice not found');
      if (sale.status === 'canceled') throw new Error('Cannot return items from a canceled sale');

      const saleItems = await db.saleItems.find({ saleId: sale._id }, {}, ctx);
      const itemMap = new Map(saleItems.map((i) => [i._id, i]));

      let totalRefundAmount = 0;
      let costRecovered = 0;
      const returnItemsPayload = [];

      for (const reqItem of input.items) {
        const saleItem = itemMap.get(reqItem.itemId);
        if (!saleItem) throw new Error('Sale line item not found');
        const returnable = Number(saleItem.quantity) - Number(saleItem.returnedQuantity || 0);
        if (reqItem.quantity > returnable) {
          throw new Error(
            `Cannot return ${reqItem.quantity} units of "${saleItem.productName}". Only ${returnable} returnable.`
          );
        }

        const effectiveUnit = roundMoney(Number(saleItem.lineTotal) / Number(saleItem.quantity));
        const lineRefund = roundMoney(effectiveUnit * reqItem.quantity);
        const unitCost = Number(saleItem.costPrice || 0);
        totalRefundAmount = roundMoney(totalRefundAmount + lineRefund);

        const product = await db.products.findById(String(saleItem.productId), ctx);
        if (product) {
          const prevQty = Number(product.stockQuantity);
          if (input.condition === 'restock') {
            const newQty = prevQty + reqItem.quantity;
            await db.products.updateById(product._id, { $set: { stockQuantity: newQty } }, ctx);
            await db.stockMovements.create(
              {
                productId: product._id,
                productName: product.name,
                sku: product.sku,
                movementType: 'return_in',
                previousQuantity: prevQty,
                changedQuantity: reqItem.quantity,
                newQuantity: newQty,
                reason: `Sale Return (${returnNumber}): ${input.reason}`,
                reference: returnNumber,
                userId: user._id,
                userName: user.name,
              },
              ctx
            );
            costRecovered = roundMoney(costRecovered + unitCost * reqItem.quantity);
          } else {
            await db.stockMovements.create(
              {
                productId: product._id,
                productName: product.name,
                sku: product.sku,
                movementType: 'damaged',
                previousQuantity: prevQty,
                changedQuantity: 0,
                newQuantity: prevQty,
                reason: `Damaged Return (${returnNumber}): ${input.reason}`,
                reference: returnNumber,
                userId: user._id,
                userName: user.name,
              },
              ctx
            );
          }
        }

        const nextReturnedQty = Number(saleItem.returnedQuantity || 0) + reqItem.quantity;
        await db.saleItems.updateById(
          saleItem._id,
          { $set: { returnedQuantity: nextReturnedQty } },
          ctx
        );
        saleItem.returnedQuantity = nextReturnedQty;

        returnItemsPayload.push({
          itemId: saleItem._id,
          productId: saleItem.productId,
          productName: saleItem.productName,
          sku: saleItem.sku,
          quantity: reqItem.quantity,
          unitAmount: effectiveUnit,
          costPrice: unitCost,
          lineTotal: lineRefund,
        });
      }

      const allReturned = saleItems.every(
        (i) => Number(i.returnedQuantity || 0) >= Number(i.quantity)
      );

      // Adjust customer due first, then cash/method refund for remaining paid portion
      const dueReduction = roundMoney(Math.min(Number(sale.dueAmount || 0), totalRefundAmount));
      const cashRefund = roundMoney(Math.max(0, totalRefundAmount - dueReduction));

      await db.sales.updateById(
        sale._id,
        {
          $set: {
            status: allReturned ? 'refunded' : 'partial_return',
            dueAmount: roundMoney(Math.max(0, Number(sale.dueAmount || 0) - dueReduction)),
            paymentStatus: allReturned ? 'refunded' : sale.paymentStatus,
          },
        },
        ctx
      );

      const customer = await db.customers.findById(String(sale.customerId), ctx);
      if (customer) {
        await db.customers.updateById(
          customer._id,
          {
            $set: {
              currentDue: roundMoney(Math.max(0, Number(customer.currentDue || 0) - dueReduction)),
              totalPaid: roundMoney(Math.max(0, Number(customer.totalPaid || 0) - cashRefund)),
            },
          },
          ctx
        );
      }

      if (cashRefund > 0) {
        const payRef = await generateDocumentNumber('REF', 'payments', 'referenceNumber', ctx);
        await db.payments.create(
          {
            referenceNumber: payRef,
            entityType: 'customer',
            entityId: sale.customerId,
            entityName: sale.customerName,
            saleId: sale._id,
            direction: 'outflow',
            amount: cashRefund,
            method: input.refundMethod,
            notes: `Refund for ${returnNumber} (Invoice ${sale.invoiceNumber})`,
            paymentDate: new Date().toISOString(),
            recordedById: user._id,
            recordedByName: user.name,
          },
          ctx
        );
      }

      const retDoc = await db.returns.create(
        {
          returnNumber,
          type: 'sale_return',
          originalTransactionId: sale._id,
          originalReference: sale.invoiceNumber,
          entityId: sale.customerId,
          entityName: sale.customerName,
          items: returnItemsPayload,
          totalRefundAmount,
          costRecovered,
          refundMethod: input.refundMethod,
          reason: input.reason,
          condition: input.condition,
          processedById: user._id,
          processedByName: user.name,
          returnDate: new Date().toISOString(),
        },
        ctx
      );

      await logActivity(
        {
          userId: user._id,
          userName: user.name,
          userRole: user.roleName,
          action: 'return',
          module: 'returns',
          targetId: retDoc._id,
          description: `Processed sale return ${returnNumber} for ${sale.invoiceNumber} (${totalRefundAmount.toFixed(2)})`,
          ipAddress,
        },
        ctx
      );

      return retDoc;
    }

    // Purchase Return
    const purchase = await db.purchases.findById(input.originalTransactionId, ctx);
    if (!purchase) throw new Error('Original purchase order not found');
    if (purchase.status === 'draft' || purchase.status === 'canceled') {
      throw new Error('Cannot return items from a draft or canceled purchase order');
    }

    const purchaseItems = await db.purchaseItems.find({ purchaseId: purchase._id }, {}, ctx);
    const pItemMap = new Map(purchaseItems.map((i) => [i._id, i]));

    let totalRefundAmount = 0;
    const returnItemsPayload = [];

    for (const reqItem of input.items) {
      const pItem = pItemMap.get(reqItem.itemId);
      if (!pItem) throw new Error('Purchase item not found');
      const returnable = Number(pItem.receivedQuantity || 0) - Number(pItem.returnedQuantity || 0);
      if (reqItem.quantity > returnable) {
        throw new Error(
          `Cannot return ${reqItem.quantity} units of "${pItem.productName}". Only ${returnable} received & unreturned.`
        );
      }

      const product = await db.products.findById(String(pItem.productId), ctx);
      if (!product) throw new Error(`Product "${pItem.productName}" not found`);
      if (Number(product.stockQuantity) < reqItem.quantity) {
        throw new Error(
          `Insufficient stock on hand to return ${reqItem.quantity} units of "${product.name}" (on hand: ${product.stockQuantity})`
        );
      }

      const prevQty = Number(product.stockQuantity);
      const newQty = prevQty - reqItem.quantity;
      await db.products.updateById(product._id, { $set: { stockQuantity: newQty } }, ctx);

      await db.stockMovements.create(
        {
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          movementType: 'return_out',
          previousQuantity: prevQty,
          changedQuantity: -reqItem.quantity,
          newQuantity: newQty,
          reason: `Purchase Return (${returnNumber}): ${input.reason}`,
          reference: returnNumber,
          userId: user._id,
          userName: user.name,
        },
        ctx
      );

      const unitAmount = Number(pItem.purchasePrice);
      const lineTotal = roundMoney(unitAmount * reqItem.quantity);
      totalRefundAmount = roundMoney(totalRefundAmount + lineTotal);

      await db.purchaseItems.updateById(
        pItem._id,
        { $set: { returnedQuantity: Number(pItem.returnedQuantity || 0) + reqItem.quantity } },
        ctx
      );

      returnItemsPayload.push({
        itemId: pItem._id,
        productId: pItem.productId,
        productName: pItem.productName,
        sku: pItem.sku,
        quantity: reqItem.quantity,
        unitAmount,
        costPrice: unitAmount,
        lineTotal,
      });
    }

    const dueReduction = roundMoney(Math.min(Number(purchase.dueAmount || 0), totalRefundAmount));
    const supplierCashRefund = roundMoney(Math.max(0, totalRefundAmount - dueReduction));

    await db.purchases.updateById(
      purchase._id,
      {
        $set: {
          dueAmount: roundMoney(Math.max(0, Number(purchase.dueAmount || 0) - dueReduction)),
        },
      },
      ctx
    );

    const supplier = await db.suppliers.findById(String(purchase.supplierId), ctx);
    if (supplier) {
      await db.suppliers.updateById(
        supplier._id,
        {
          $set: {
            currentDue: roundMoney(Math.max(0, Number(supplier.currentDue || 0) - dueReduction)),
          },
        },
        ctx
      );
    }

    if (supplierCashRefund > 0) {
      const payRef = await generateDocumentNumber('PAY', 'payments', 'referenceNumber', ctx);
      await db.payments.create(
        {
          referenceNumber: payRef,
          entityType: 'supplier',
          entityId: purchase.supplierId,
          entityName: purchase.supplierName,
          purchaseId: purchase._id,
          direction: 'inflow',
          amount: supplierCashRefund,
          method: input.refundMethod,
          notes: `Supplier refund for ${returnNumber} (${purchase.purchaseNumber})`,
          paymentDate: new Date().toISOString(),
          recordedById: user._id,
          recordedByName: user.name,
        },
        ctx
      );
    }

    const retDoc = await db.returns.create(
      {
        returnNumber,
        type: 'purchase_return',
        originalTransactionId: purchase._id,
        originalReference: purchase.purchaseNumber,
        entityId: purchase.supplierId,
        entityName: purchase.supplierName,
        items: returnItemsPayload,
        totalRefundAmount,
        costRecovered: totalRefundAmount,
        refundMethod: input.refundMethod,
        reason: input.reason,
        condition: input.condition,
        processedById: user._id,
        processedByName: user.name,
        returnDate: new Date().toISOString(),
      },
      ctx
    );

    await logActivity(
      {
        userId: user._id,
        userName: user.name,
        userRole: user.roleName,
        action: 'return',
        module: 'returns',
        targetId: retDoc._id,
        description: `Processed purchase return ${returnNumber} for ${purchase.purchaseNumber} (${totalRefundAmount.toFixed(2)})`,
        ipAddress,
      },
      ctx
    );

    return retDoc;
  });
}

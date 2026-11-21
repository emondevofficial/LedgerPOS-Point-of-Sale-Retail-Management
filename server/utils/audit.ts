import { DbContext, db } from '../db/store';

export async function logActivity(
  params: {
    userId?: string;
    userName: string;
    userRole?: string;
    action: string;
    module: string;
    targetId?: string;
    description: string;
    ipAddress?: string;
  },
  ctx?: DbContext
) {
  await db.activityLogs.create(
    {
      userId: params.userId || undefined,
      userName: params.userName,
      userRole: params.userRole || '',
      action: params.action,
      module: params.module,
      targetId: params.targetId || '',
      description: params.description,
      ipAddress: params.ipAddress || '',
    },
    ctx
  );
}

export async function createNotification(
  params: {
    type:
      | 'low_stock'
      | 'out_of_stock'
      | 'new_sale'
      | 'purchase_received'
      | 'customer_due'
      | 'supplier_due'
      | 'expiring_product'
      | 'system';
    title: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
    linkView?: string;
    entityId?: string;
  },
  ctx?: DbContext
) {
  await db.notifications.create(
    {
      type: params.type,
      title: params.title,
      message: params.message,
      severity: params.severity || 'info',
      linkView: params.linkView || '',
      entityId: params.entityId || '',
      isRead: false,
    },
    ctx
  );
}

export async function evaluateProductStockNotification(
  product: { _id: string; name: string; sku: string; stockQuantity: number; minStockAlert: number },
  ctx?: DbContext
) {
  const settings = await db.settings.findOne({}, ctx);
  if (settings && settings.notifyLowStock === false) return;

  const threshold = Number(product.minStockAlert ?? settings?.lowStockThreshold ?? 10);

  if (product.stockQuantity <= 0) {
    await createNotification(
      {
        type: 'out_of_stock',
        title: `Out of Stock: ${product.name}`,
        message: `${product.name} (${product.sku}) has reached 0 units in inventory.`,
        severity: 'critical',
        linkView: 'inventory',
        entityId: product._id,
      },
      ctx
    );
  } else if (product.stockQuantity <= threshold) {
    await createNotification(
      {
        type: 'low_stock',
        title: `Low Stock Alert: ${product.name}`,
        message: `${product.name} (${product.sku}) has ${product.stockQuantity} units remaining (alert threshold: ${threshold}).`,
        severity: 'warning',
        linkView: 'inventory',
        entityId: product._id,
      },
      ctx
    );
  }
}

import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    roleName: { type: String, required: true },
    roleSlug: { type: String, required: true, index: true },
    phone: { type: String, default: '' },
    avatar: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const RoleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, default: '' },
    permissions: [{ type: String }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const PermissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true },
    module: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    icon: { type: String, default: 'Package' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const BrandSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    logo: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    image: { type: String, default: '' },
    sku: { type: String, required: true, unique: true, trim: true, index: true },
    barcode: { type: String, required: true, unique: true, trim: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, default: 0, min: 0 },
    stockQuantity: { type: Number, required: true, default: 0, min: 0, index: true },
    minStockAlert: { type: Number, default: 10, min: 0 },
    unit: { type: String, default: 'pcs' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    description: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    expiryDate: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const CustomerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, default: '', index: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    address: { type: String, default: '' },
    customerType: { type: String, enum: ['retail', 'wholesale', 'vip'], default: 'retail' },
    company: { type: String, default: '' },
    notes: { type: String, default: '' },
    openingBalance: { type: Number, default: 0 },
    currentDue: { type: Number, default: 0, index: true },
    totalPurchases: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    isWalkIn: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const SupplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    companyName: { type: String, default: '' },
    phone: { type: String, default: '', index: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    address: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    openingBalance: { type: Number, default: 0 },
    currentDue: { type: Number, default: 0, index: true },
    totalPurchases: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const SaleSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    clientRequestId: { type: String, unique: true, sparse: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerName: { type: String, required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cashierName: { type: String, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    itemDiscountTotal: { type: Number, default: 0, min: 0 },
    invoiceDiscountType: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
    invoiceDiscountValue: { type: Number, default: 0, min: 0 },
    invoiceDiscountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    costTotal: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    dueAmount: { type: Number, default: 0, min: 0 },
    changeAmount: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, required: true, index: true },
    paymentSplit: [
      {
        method: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid', 'refunded'], default: 'paid', index: true },
    status: {
      type: String,
      enum: ['completed', 'canceled', 'refunded', 'partial_return'],
      default: 'completed',
      index: true,
    },
    notes: { type: String, default: '' },
    saleDate: { type: Date, default: Date.now, index: true },
    canceledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
  },
  { timestamps: true }
);

const SaleItemSchema = new Schema(
  {
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    barcode: { type: String, default: '' },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    quantity: { type: Number, required: true, min: 1 },
    returnedQuantity: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

const PurchaseSchema = new Schema(
  {
    purchaseNumber: { type: String, required: true, unique: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierName: { type: String, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    shippingCost: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueAmount: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, default: 'Bank Transfer' },
    paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'unpaid', index: true },
    status: {
      type: String,
      enum: ['draft', 'ordered', 'partial_received', 'received', 'canceled'],
      default: 'ordered',
      index: true,
    },
    notes: { type: String, default: '' },
    purchaseDate: { type: Date, default: Date.now, index: true },
    receivedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },
  },
  { timestamps: true }
);

const PurchaseItemSchema = new Schema(
  {
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    orderedQuantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    returnedQuantity: { type: Number, default: 0, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

const PaymentSchema = new Schema(
  {
    referenceNumber: { type: String, required: true, unique: true, index: true },
    entityType: { type: String, enum: ['customer', 'supplier'], required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    entityName: { type: String, required: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', default: null, index: true },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase', default: null, index: true },
    direction: { type: String, enum: ['inflow', 'outflow'], required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, required: true },
    notes: { type: String, default: '' },
    paymentDate: { type: Date, default: Date.now, index: true },
    recordedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedByName: { type: String, required: true },
  },
  { timestamps: true }
);

const ReturnSchema = new Schema(
  {
    returnNumber: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['sale_return', 'purchase_return'], required: true, index: true },
    originalTransactionId: { type: Schema.Types.ObjectId, required: true, index: true },
    originalReference: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    entityName: { type: String, required: true },
    items: [
      {
        itemId: { type: Schema.Types.ObjectId, required: true },
        productId: { type: Schema.Types.ObjectId, required: true },
        productName: { type: String, required: true },
        sku: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitAmount: { type: Number, required: true, min: 0 },
        costPrice: { type: Number, default: 0, min: 0 },
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],
    totalRefundAmount: { type: Number, required: true, min: 0 },
    costRecovered: { type: Number, default: 0, min: 0 },
    refundMethod: { type: String, required: true },
    reason: { type: String, required: true },
    condition: { type: String, enum: ['restock', 'damaged'], default: 'restock' },
    processedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    processedByName: { type: String, required: true },
    returnDate: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

const ExpenseCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const ExpenseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true, index: true },
    categoryName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now, index: true },
    paymentMethod: { type: String, required: true },
    reference: { type: String, default: '' },
    description: { type: String, default: '' },
    attachment: { type: String, default: '' },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const StockMovementSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    movementType: {
      type: String,
      enum: [
        'opening',
        'purchase',
        'sale',
        'return_in',
        'return_out',
        'adjustment_in',
        'adjustment_out',
        'damaged',
        'expired',
        'transfer',
      ],
      required: true,
      index: true,
    },
    previousQuantity: { type: Number, required: true },
    changedQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true },
    reason: { type: String, default: '' },
    reference: { type: String, default: '' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
  },
  { timestamps: true }
);

const NotificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'low_stock',
        'out_of_stock',
        'new_sale',
        'purchase_received',
        'customer_due',
        'supplier_due',
        'expiring_product',
        'system',
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    linkView: { type: String, default: '' },
    entityId: { type: String, default: '' },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const ActivityLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userName: { type: String, required: true },
    userRole: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    targetId: { type: String, default: '' },
    description: { type: String, required: true },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

const StoreSettingsSchema = new Schema(
  {
    businessName: { type: String, default: 'LedgerPOS Retail' },
    logo: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    currency: { type: String, default: 'USD' },
    currencySymbol: { type: String, default: '$' },
    country: { type: String, default: 'United States' },
    timezone: { type: String, default: 'UTC' },
    invoicePrefix: { type: String, default: 'INV' },
    invoiceFooter: { type: String, default: 'Thank you for your business!' },
    defaultCustomerId: { type: String, default: '' },
    defaultPaymentMethod: { type: String, default: 'Cash' },
    enableTax: { type: Boolean, default: true },
    defaultTaxRate: { type: Number, default: 0 },
    enableDiscounts: { type: Boolean, default: true },
    enableBarcodeScanning: { type: Boolean, default: true },
    enableReceiptPrinting: { type: Boolean, default: true },
    defaultReceiptSize: { type: String, enum: ['a4', '80mm', '58mm'], default: '80mm' },
    lowStockThreshold: { type: Number, default: 10 },
    themeMode: { type: String, enum: ['light', 'dark'], default: 'light' },
    autoBackupEnabled: { type: Boolean, default: true },
    notifyLowStock: { type: Boolean, default: true },
    notifyNewSale: { type: Boolean, default: true },
    notifyExpiringDays: { type: Number, default: 30 },
  },
  { timestamps: true }
);

const HeldCartSchema = new Schema(
  {
    label: { type: String, required: true },
    customerId: { type: String, default: '' },
    customerName: { type: String, default: 'Walk-in Customer' },
    items: [
      {
        productId: { type: String, required: true },
        name: { type: String, required: true },
        sku: { type: String, required: true },
        barcode: { type: String, default: '' },
        unitPrice: { type: Number, required: true },
        quantity: { type: Number, required: true },
        discountAmount: { type: Number, default: 0 },
        taxRate: { type: Number, default: 0 },
      },
    ],
    invoiceDiscountType: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
    invoiceDiscountValue: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    heldById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    heldByName: { type: String, required: true },
  },
  { timestamps: true }
);

export const Models = {
  User: mongoose.models.User || mongoose.model('User', UserSchema),
  Role: mongoose.models.Role || mongoose.model('Role', RoleSchema),
  Permission: mongoose.models.Permission || mongoose.model('Permission', PermissionSchema),
  Category: mongoose.models.Category || mongoose.model('Category', CategorySchema),
  Brand: mongoose.models.Brand || mongoose.model('Brand', BrandSchema),
  Product: mongoose.models.Product || mongoose.model('Product', ProductSchema),
  Customer: mongoose.models.Customer || mongoose.model('Customer', CustomerSchema),
  Supplier: mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema),
  Sale: mongoose.models.Sale || mongoose.model('Sale', SaleSchema),
  SaleItem: mongoose.models.SaleItem || mongoose.model('SaleItem', SaleItemSchema),
  Purchase: mongoose.models.Purchase || mongoose.model('Purchase', PurchaseSchema),
  PurchaseItem: mongoose.models.PurchaseItem || mongoose.model('PurchaseItem', PurchaseItemSchema),
  Payment: mongoose.models.Payment || mongoose.model('Payment', PaymentSchema),
  Return: mongoose.models.Return || mongoose.model('Return', ReturnSchema),
  ExpenseCategory: mongoose.models.ExpenseCategory || mongoose.model('ExpenseCategory', ExpenseCategorySchema),
  Expense: mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema),
  StockMovement: mongoose.models.StockMovement || mongoose.model('StockMovement', StockMovementSchema),
  Notification: mongoose.models.Notification || mongoose.model('Notification', NotificationSchema),
  ActivityLog: mongoose.models.ActivityLog || mongoose.model('ActivityLog', ActivityLogSchema),
  StoreSettings: mongoose.models.StoreSettings || mongoose.model('StoreSettings', StoreSettingsSchema),
  HeldCart: mongoose.models.HeldCart || mongoose.model('HeldCart', HeldCartSchema),
};

export type CollectionName = keyof typeof Models;

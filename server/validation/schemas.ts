import { z } from 'zod';
import { PAYMENT_METHODS, SINGLE_PAYMENT_METHODS } from '../../shared/types';

export const SetupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(128),
  businessName: z.string().trim().min(2).max(120),
  currency: z.string().trim().min(2).max(10).default('USD'),
  currencySymbol: z.string().trim().min(1).max(6).default('$'),
  bootstrapCode: z.string().optional(),
  loadSampleData: z.boolean().optional().default(false),
});

export const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().trim().min(10),
  password: z.string().min(8).max(128),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const ProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).optional().default(''),
  avatar: z.string().max(1_500_000).optional().default(''),
});

export const UserCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(128),
  roleId: z.string().trim().min(1),
  phone: z.string().trim().max(40).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

export const UserUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(120).optional(),
  roleId: z.string().trim().min(1).optional(),
  phone: z.string().trim().max(40).optional(),
  isActive: z.boolean().optional(),
});

export const RoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(250).optional().default(''),
  permissions: z.array(z.string().trim()).min(1),
});

export const CategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(40).optional().default('Package'),
  description: z.string().trim().max(300).optional().default(''),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const BrandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  logo: z.string().max(1_500_000).optional().default(''),
  description: z.string().trim().max(300).optional().default(''),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const ProductSchema = z.object({
  name: z.string().trim().min(1).max(140),
  image: z.string().max(2_500_000).optional().default(''),
  sku: z.string().trim().min(1).max(60),
  barcode: z.string().trim().min(1).max(80),
  categoryId: z.string().trim().min(1),
  brandId: z.string().trim().nullable().optional().default(null),
  purchasePrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  wholesalePrice: z.coerce.number().min(0).optional().default(0),
  stockQuantity: z.coerce.number().int().min(0).optional().default(0),
  minStockAlert: z.coerce.number().int().min(0).optional().default(10),
  unit: z.string().trim().min(1).max(30).optional().default('pcs'),
  supplierId: z.string().trim().nullable().optional().default(null),
  taxRate: z.coerce.number().min(0).max(100).optional().default(0),
  description: z.string().trim().max(1000).optional().default(''),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  expiryDate: z.string().nullable().optional().default(null),
});

export const StockAdjustmentSchema = z.object({
  productId: z.string().trim().min(1),
  movementType: z.enum([
    'opening',
    'adjustment_in',
    'adjustment_out',
    'damaged',
    'expired',
    'transfer',
  ]),
  quantity: z.coerce.number().int().min(1),
  reason: z.string().trim().min(2).max(250),
  reference: z.string().trim().max(80).optional().default(''),
});

export const CustomerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
  address: z.string().trim().max(250).optional().default(''),
  customerType: z.enum(['retail', 'wholesale', 'vip']).optional().default('retail'),
  company: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
  openingBalance: z.coerce.number().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const SupplierSchema = z.object({
  name: z.string().trim().min(1).max(100),
  companyName: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
  address: z.string().trim().max(250).optional().default(''),
  contactPerson: z.string().trim().max(100).optional().default(''),
  openingBalance: z.coerce.number().min(0).optional().default(0),
  notes: z.string().trim().max(500).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

export const PaymentCollectSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(SINGLE_PAYMENT_METHODS as [string, ...string[]]),
  notes: z.string().trim().max(250).optional().default(''),
  saleId: z.string().optional(),
  purchaseId: z.string().optional(),
});

export const CheckoutSchema = z.object({
  clientRequestId: z.string().trim().max(80).optional(),
  customerId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(1),
        discountType: z.enum(['fixed', 'percent']).optional().default('fixed'),
        discountValue: z.coerce.number().min(0).optional().default(0),
      })
    )
    .min(1),
  invoiceDiscountType: z.enum(['fixed', 'percent']).optional().default('fixed'),
  invoiceDiscountValue: z.coerce.number().min(0).optional().default(0),
  paidAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(PAYMENT_METHODS as [string, ...string[]]),
  paymentSplit: z
    .array(
      z.object({
        method: z.enum(SINGLE_PAYMENT_METHODS as [string, ...string[]]),
        amount: z.coerce.number().min(0),
      })
    )
    .optional()
    .default([]),
  notes: z.string().trim().max(500).optional().default(''),
  heldCartId: z.string().optional(),
});

export const HeldCartSchema = z.object({
  label: z.string().trim().min(1).max(80),
  customerId: z.string().optional().default(''),
  customerName: z.string().optional().default('Walk-in Customer'),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        name: z.string().min(1),
        sku: z.string().min(1),
        barcode: z.string().optional().default(''),
        unitPrice: z.coerce.number().min(0),
        quantity: z.coerce.number().int().min(1),
        discountAmount: z.coerce.number().min(0).optional().default(0),
        taxRate: z.coerce.number().min(0).optional().default(0),
      })
    )
    .min(1),
  invoiceDiscountType: z.enum(['fixed', 'percent']).optional().default('fixed'),
  invoiceDiscountValue: z.coerce.number().min(0).optional().default(0),
  notes: z.string().optional().default(''),
});

export const PurchaseCreateSchema = z.object({
  supplierId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        orderedQuantity: z.coerce.number().int().min(1),
        purchasePrice: z.coerce.number().min(0),
        taxRate: z.coerce.number().min(0).max(100).optional().default(0),
      })
    )
    .min(1),
  discountAmount: z.coerce.number().min(0).optional().default(0),
  shippingCost: z.coerce.number().min(0).optional().default(0),
  paidAmount: z.coerce.number().min(0).optional().default(0),
  paymentMethod: z.enum(SINGLE_PAYMENT_METHODS as [string, ...string[]]).optional().default('Bank Transfer'),
  status: z.enum(['draft', 'ordered', 'received']).optional().default('ordered'),
  notes: z.string().trim().max(500).optional().default(''),
});

export const PurchaseReceiveSchema = z.object({
  items: z
    .array(
      z.object({
        purchaseItemId: z.string().trim().min(1),
        receiveQuantity: z.coerce.number().int().min(0),
      })
    )
    .min(1),
});

export const ReturnCreateSchema = z.object({
  type: z.enum(['sale_return', 'purchase_return']),
  originalTransactionId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(1),
      })
    )
    .min(1),
  refundMethod: z.enum(SINGLE_PAYMENT_METHODS as [string, ...string[]]),
  reason: z.string().trim().min(2).max(300),
  condition: z.enum(['restock', 'damaged']).optional().default('restock'),
});

export const ExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(250).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

export const ExpenseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  categoryId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  date: z.string().optional(),
  paymentMethod: z.enum(SINGLE_PAYMENT_METHODS as [string, ...string[]]),
  reference: z.string().trim().max(80).optional().default(''),
  description: z.string().trim().max(500).optional().default(''),
  attachment: z.string().max(1_500_000).optional().default(''),
});

export const SettingsUpdateSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  logo: z.string().max(2_000_000).optional().default(''),
  address: z.string().trim().max(250).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
  website: z.string().trim().max(150).optional().default(''),
  currency: z.string().trim().min(1).max(10).default('USD'),
  currencySymbol: z.string().trim().min(1).max(6).default('$'),
  country: z.string().trim().max(80).optional().default('United States'),
  timezone: z.string().trim().max(80).optional().default('UTC'),
  invoicePrefix: z.string().trim().min(1).max(12).default('INV'),
  invoiceFooter: z.string().trim().max(300).optional().default('Thank you for your business!'),
  defaultCustomerId: z.string().optional().default(''),
  defaultPaymentMethod: z.enum(PAYMENT_METHODS as [string, ...string[]]).optional().default('Cash'),
  enableTax: z.boolean().default(true),
  defaultTaxRate: z.coerce.number().min(0).max(100).default(0),
  enableDiscounts: z.boolean().default(true),
  enableBarcodeScanning: z.boolean().default(true),
  enableReceiptPrinting: z.boolean().default(true),
  defaultReceiptSize: z.enum(['a4', '80mm', '58mm']).default('80mm'),
  lowStockThreshold: z.coerce.number().int().min(0).default(10),
  themeMode: z.enum(['light', 'dark']).default('light'),
  autoBackupEnabled: z.boolean().default(true),
  notifyLowStock: z.boolean().default(true),
  notifyNewSale: z.boolean().default(true),
  notifyExpiringDays: z.coerce.number().int().min(1).max(365).default(30),
});

export const PERMISSION_DEFINITIONS = [
  { key: 'dashboard:view', label: 'View Dashboard', module: 'Dashboard', description: 'Access business KPIs and analytics charts' },
  { key: 'pos:access', label: 'Access POS Terminal', module: 'POS', description: 'Create sales, scan barcodes, hold/restore carts' },
  { key: 'pos:discount', label: 'Apply Discounts', module: 'POS', description: 'Apply item and invoice level discounts' },
  { key: 'products:view', label: 'View Products', module: 'Catalog', description: 'Browse products, categories, and brands' },
  { key: 'products:manage', label: 'Manage Products', module: 'Catalog', description: 'Create, edit, delete, import/export products, categories, and brands' },
  { key: 'inventory:view', label: 'View Inventory', module: 'Inventory', description: 'View stock levels and movement history' },
  { key: 'inventory:adjust', label: 'Adjust Stock', module: 'Inventory', description: 'Record stock in/out, damaged, expired, and transfers' },
  { key: 'customers:view', label: 'View Customers', module: 'CRM', description: 'View customer profiles and ledgers' },
  { key: 'customers:manage', label: 'Manage Customers', module: 'CRM', description: 'Add/edit customers and collect due payments' },
  { key: 'suppliers:view', label: 'View Suppliers', module: 'Suppliers', description: 'View supplier directory and balances' },
  { key: 'suppliers:manage', label: 'Manage Suppliers', module: 'Suppliers', description: 'Add/edit suppliers and record supplier payments' },
  { key: 'purchases:view', label: 'View Purchases', module: 'Purchases', description: 'View purchase orders and invoices' },
  { key: 'purchases:manage', label: 'Manage Purchases', module: 'Purchases', description: 'Create POs, receive stock, and cancel orders' },
  { key: 'sales:view', label: 'View Sales', module: 'Sales', description: 'View sales invoices and reprint receipts' },
  { key: 'sales:cancel', label: 'Cancel & Refund Sales', module: 'Sales', description: 'Cancel invoices and process refunds' },
  { key: 'returns:manage', label: 'Manage Returns', module: 'Returns', description: 'Process sales and purchase returns' },
  { key: 'expenses:view', label: 'View Expenses', module: 'Expenses', description: 'View operational expenses' },
  { key: 'expenses:manage', label: 'Manage Expenses', module: 'Expenses', description: 'Add, edit, and delete expenses and categories' },
  { key: 'financial:view', label: 'View Financials', module: 'Financial', description: 'Access profit & loss, cash flow, and ledgers' },
  { key: 'reports:view', label: 'View Reports', module: 'Reports', description: 'Generate and export business reports' },
  { key: 'notifications:view', label: 'View Notifications', module: 'Notifications', description: 'Read store alerts and mark read' },
  { key: 'notifications:manage', label: 'Clear Notifications', module: 'Notifications', description: 'Clear system notifications' },
  { key: 'users:manage', label: 'Manage Users & Roles', module: 'Admin', description: 'Create/edit users, assign roles, reset passwords' },
  { key: 'settings:manage', label: 'Manage Store Settings', module: 'Admin', description: 'Edit business info, POS preferences, and backups' },
  { key: 'logs:view', label: 'View Activity Logs', module: 'Admin', description: 'Inspect security and operational audit trails' },
] as const;

export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]['key'];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_DEFINITIONS.map((p) => p.key);

export type PaymentMethod =
  | 'Cash'
  | 'Card'
  | 'Mobile Banking'
  | 'bKash'
  | 'Nagad'
  | 'Rocket'
  | 'Bank Transfer'
  | 'Mixed Payment';

export const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Card',
  'Mobile Banking',
  'bKash',
  'Nagad',
  'Rocket',
  'Bank Transfer',
  'Mixed Payment',
];

export const SINGLE_PAYMENT_METHODS: Exclude<PaymentMethod, 'Mixed Payment'>[] = [
  'Cash',
  'Card',
  'Mobile Banking',
  'bKash',
  'Nagad',
  'Rocket',
  'Bank Transfer',
];

export type RoleSlug = 'super_admin' | 'admin' | 'manager' | 'cashier' | 'inventory_manager';

export const DEFAULT_ROLE_DEFINITIONS: Array<{
  name: string;
  slug: RoleSlug;
  description: string;
  permissions: PermissionKey[];
  isSystem: boolean;
}> = [
  {
    name: 'Super Admin',
    slug: 'super_admin',
    description: 'Full unrestricted access across all stores, users, roles, and financial controls.',
    permissions: [...ALL_PERMISSIONS],
    isSystem: true,
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Store administrator with full operational, user management, and settings access.',
    permissions: [...ALL_PERMISSIONS],
    isSystem: true,
  },
  {
    name: 'Manager',
    slug: 'manager',
    description: 'Oversees POS billing, inventory, purchases, returns, expenses, and analytics.',
    permissions: [
      'dashboard:view',
      'pos:access',
      'pos:discount',
      'products:view',
      'products:manage',
      'inventory:view',
      'inventory:adjust',
      'customers:view',
      'customers:manage',
      'suppliers:view',
      'suppliers:manage',
      'purchases:view',
      'purchases:manage',
      'sales:view',
      'sales:cancel',
      'returns:manage',
      'expenses:view',
      'expenses:manage',
      'financial:view',
      'reports:view',
      'notifications:view',
      'notifications:manage',
    ],
    isSystem: true,
  },
  {
    name: 'Cashier',
    slug: 'cashier',
    description: 'Front-counter POS billing, customer lookup, due collection, and invoice printing.',
    permissions: [
      'dashboard:view',
      'pos:access',
      'pos:discount',
      'products:view',
      'customers:view',
      'customers:manage',
      'sales:view',
      'notifications:view',
    ],
    isSystem: true,
  },
  {
    name: 'Inventory Manager',
    slug: 'inventory_manager',
    description: 'Manages product catalog, stock adjustments, suppliers, and purchase order receiving.',
    permissions: [
      'dashboard:view',
      'products:view',
      'products:manage',
      'inventory:view',
      'inventory:adjust',
      'suppliers:view',
      'suppliers:manage',
      'purchases:view',
      'purchases:manage',
      'returns:manage',
      'reports:view',
      'notifications:view',
    ],
    isSystem: true,
  },
];

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: string;
}

export interface StoreSettingsDTO {
  _id?: string;
  businessName: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  currency: string;
  currencySymbol: string;
  country: string;
  timezone: string;
  invoicePrefix: string;
  invoiceFooter: string;
  defaultCustomerId?: string;
  defaultPaymentMethod: PaymentMethod;
  enableTax: boolean;
  defaultTaxRate: number;
  enableDiscounts: boolean;
  enableBarcodeScanning: boolean;
  enableReceiptPrinting: boolean;
  defaultReceiptSize: 'a4' | '80mm' | '58mm';
  lowStockThreshold: number;
  themeMode: 'light' | 'dark';
  autoBackupEnabled: boolean;
  notifyLowStock: boolean;
  notifyNewSale: boolean;
  notifyExpiringDays: number;
}

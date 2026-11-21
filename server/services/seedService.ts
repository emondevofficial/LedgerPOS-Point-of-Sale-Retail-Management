import { DEFAULT_ROLE_DEFINITIONS, PERMISSION_DEFINITIONS } from '../../shared/types';
import { DbContext, db } from '../db/store';
import { logActivity } from '../utils/audit';
import { roundMoney } from './posService';

export async function ensureSystemRolesAndPermissions(ctx?: DbContext) {
  for (const perm of PERMISSION_DEFINITIONS) {
    const existing = await db.permissions.findOne({ key: perm.key }, ctx);
    if (!existing) {
      await db.permissions.create(perm, ctx);
    }
  }

  const rolesMap: Record<string, any> = {};
  for (const roleDef of DEFAULT_ROLE_DEFINITIONS) {
    let role = await db.roles.findOne({ slug: roleDef.slug }, ctx);
    if (!role) {
      role = await db.roles.create(roleDef, ctx);
    }
    rolesMap[roleDef.slug] = role;
  }

  return rolesMap;
}

export async function ensureDefaultStoreEntities(
  options: { businessName: string; currency: string; currencySymbol: string; email?: string },
  ctx?: DbContext
) {
  let walkIn = await db.customers.findOne({ isWalkIn: true }, ctx);
  if (!walkIn) {
    walkIn = await db.customers.create(
      {
        name: 'Walk-in Customer',
        phone: '',
        email: '',
        address: '',
        customerType: 'retail',
        company: '',
        notes: 'Default counter customer for quick POS billing',
        openingBalance: 0,
        currentDue: 0,
        totalPurchases: 0,
        totalPaid: 0,
        isWalkIn: true,
        isActive: true,
      },
      ctx
    );
  }

  let settings = await db.settings.findOne({}, ctx);
  if (!settings) {
    settings = await db.settings.create(
      {
        businessName: options.businessName,
        logo: '/src/assets/images/store_brand_emblem_1795299495758.jpg',
        address: '',
        phone: '',
        email: options.email || '',
        website: '',
        currency: options.currency,
        currencySymbol: options.currencySymbol,
        country: 'United States',
        timezone: 'UTC',
        invoicePrefix: 'INV',
        invoiceFooter: 'Thank you for shopping with us!',
        defaultCustomerId: walkIn._id,
        defaultPaymentMethod: 'Cash',
        enableTax: true,
        defaultTaxRate: 5,
        enableDiscounts: true,
        enableBarcodeScanning: true,
        enableReceiptPrinting: true,
        defaultReceiptSize: '80mm',
        lowStockThreshold: 10,
        themeMode: 'light',
        autoBackupEnabled: true,
        notifyLowStock: true,
        notifyNewSale: true,
        notifyExpiringDays: 30,
      },
      ctx
    );
  }

  const defaultExpenseCategories = ['Rent & Utilities', 'Staff Payroll', 'Logistics & Shipping', 'Marketing', 'Store Supplies'];
  for (const name of defaultExpenseCategories) {
    const existing = await db.expenseCategories.findOne({ name, deletedAt: null }, ctx);
    if (!existing) {
      await db.expenseCategories.create({ name, description: `${name} operational expenses`, isActive: true }, ctx);
    }
  }

  return { walkIn, settings };
}

/**
 * Optional demo/test catalog & transaction seeder — strictly separated from automatic startup.
 * Only executes when explicitly requested via onboarding CTA, Settings, Setup opt-in, or CLI `npm run seed`.
 */
export async function seedOptionalDemoData(actor: { _id: string; name: string; roleName: string }) {
  const existingProducts = await db.products.count({ deletedAt: null });
  if (existingProducts > 0) {
    throw new Error('Catalog already contains products. Sample data can only be seeded into an empty catalog.');
  }

  const daysAgoIso = (days: number, hour = 11) => {
    const d = new Date(Date.now() - days * 86_400_000);
    d.setUTCHours(hour, 15, 0, 0);
    return d.toISOString();
  };

  const categoriesData = [
    { name: 'Specialty Coffee', icon: 'Coffee', description: 'Single-origin beans and craft roasts' },
    { name: 'Audio & Tech', icon: 'Headphones', description: 'Wireless headphones and consumer accessories' },
    { name: 'Drinkware', icon: 'CupSoda', description: 'Insulated bottles and tumblers' },
    { name: 'Stationery', icon: 'BookOpen', description: 'Stitched notebooks and writing tools' },
    { name: 'Accessories', icon: 'Sparkles', description: 'Everyday carry sleeves, stands, and filters' },
  ];

  const categories: Record<string, any> = {};
  for (const c of categoriesData) {
    categories[c.name] = await db.categories.create({ ...c, status: 'active' });
  }

  const brandsData = [
    { name: 'Elevate Roasters', description: 'Artisanal small-batch roastery' },
    { name: 'AcousticLab', description: 'Studio wireless audio gear' },
    { name: 'Hydrate Co.', description: 'Precision stainless drinkware' },
    { name: 'Studio No. 3', description: 'Archival stationery and pens' },
    { name: 'Nordic Desk', description: 'Minimalist workspace accessories' },
  ];

  const brands: Record<string, any> = {};
  for (const b of brandsData) {
    brands[b.name] = await db.brands.create({ ...b, status: 'active' });
  }

  const supplierPrimary = await db.suppliers.create({
    name: 'Northstar Wholesale Distributors',
    companyName: 'Northstar Supply LLC',
    phone: '+1 (555) 234-8910',
    email: 'orders@northstarsupply.example',
    address: '420 Commerce Pkwy, Suite 200',
    contactPerson: 'Elena Rostova',
    openingBalance: 0,
    currentDue: 0,
    totalPurchases: 0,
    totalPaid: 0,
    notes: 'Primary wholesale merchandise supplier',
    isActive: true,
  });

  const supplierSecondary = await db.suppliers.create({
    name: 'Pacific Roasters Supply',
    companyName: 'Pacific Import Co.',
    phone: '+1 (555) 318-4420',
    email: 'accounts@pacificroasters.example',
    address: '95 Harbor Way, Dock 4',
    contactPerson: 'Daniel Kim',
    openingBalance: 0,
    currentDue: 0,
    totalPurchases: 0,
    totalPaid: 0,
    notes: 'Direct specialty coffee & brewing equipment importer',
    isActive: true,
  });

  const walkIn = await db.customers.findOne({ isWalkIn: true });

  const custVip = await db.customers.create({
    name: 'Marcus Vance',
    phone: '+1 (555) 741-9920',
    email: 'marcus.vance@example.com',
    address: '88 Market Street',
    customerType: 'vip',
    company: 'Vance Design Studio',
    notes: 'Corporate hospitality account',
    openingBalance: 0,
    currentDue: 0,
    totalPurchases: 0,
    totalPaid: 0,
    isWalkIn: false,
    isActive: true,
  });

  const custWholesale = await db.customers.create({
    name: 'Harbor Cafe Group',
    phone: '+1 (555) 892-3301',
    email: 'purchasing@harborcafe.example',
    address: '210 Pier Plaza',
    customerType: 'wholesale',
    company: 'Harbor Hospitality Inc.',
    notes: 'Monthly net-15 wholesale partner',
    openingBalance: 0,
    currentDue: 0,
    totalPurchases: 0,
    totalPaid: 0,
    isWalkIn: false,
    isActive: true,
  });

  const custRetail = await db.customers.create({
    name: 'Clara Chen',
    phone: '+1 (555) 604-1182',
    email: 'clara.chen@example.com',
    address: '14 Cedar Ave',
    customerType: 'retail',
    company: '',
    notes: 'Regular weekend shopper',
    openingBalance: 0,
    currentDue: 0,
    totalPurchases: 0,
    totalPaid: 0,
    isWalkIn: false,
    isActive: true,
  });

  const sampleProductsSpec = [
    {
      name: 'Rwanda Kivu Single Origin Coffee (240g)',
      image: '/src/assets/images/product_artisan_coffee_1795299495485.jpg',
      sku: 'COF-RW-240',
      barcode: '890100100001',
      categoryId: categories['Specialty Coffee']._id,
      brandId: brands['Elevate Roasters']._id,
      supplierId: supplierSecondary._id,
      purchasePrice: 11.5,
      sellingPrice: 22.0,
      wholesalePrice: 16.5,
      stockQuantity: 48,
      minStockAlert: 12,
      unit: 'bag',
      taxRate: 5,
      description: 'Notes of blueberry, citrus, and dark chocolate.',
      status: 'active',
    },
    {
      name: 'Studio ANC Wireless Headphones',
      image: '/src/assets/images/product_wireless_audio_1795299496636.jpg',
      sku: 'AUD-ANC-01',
      barcode: '890100100002',
      categoryId: categories['Audio & Tech']._id,
      brandId: brands['AcousticLab']._id,
      supplierId: supplierPrimary._id,
      purchasePrice: 145.0,
      sellingPrice: 249.0,
      wholesalePrice: 195.0,
      stockQuantity: 14,
      minStockAlert: 5,
      unit: 'pcs',
      taxRate: 8,
      description: 'Matte graphite over-ear active noise-canceling headphones.',
      status: 'active',
    },
    {
      name: 'Brushed Steel Insulated Bottle (750ml)',
      image: '/src/assets/images/product_steel_tumbler_1795299495877.jpg',
      sku: 'DRK-STL-750',
      barcode: '890100100003',
      categoryId: categories['Drinkware']._id,
      brandId: brands['Hydrate Co.']._id,
      supplierId: supplierPrimary._id,
      purchasePrice: 14.0,
      sellingPrice: 32.0,
      wholesalePrice: 22.0,
      stockQuantity: 7,
      minStockAlert: 10,
      unit: 'pcs',
      taxRate: 5,
      description: 'Double-wall vacuum insulated stainless steel flask.',
      status: 'active',
    },
    {
      name: 'Stitched Linen Journal & Rollerball Set',
      image: '/src/assets/images/product_leather_notebook_1795299495611.jpg',
      sku: 'STN-JRN-120',
      barcode: '890100100004',
      categoryId: categories['Stationery']._id,
      brandId: brands['Studio No. 3']._id,
      supplierId: supplierPrimary._id,
      purchasePrice: 9.0,
      sellingPrice: 24.0,
      wholesalePrice: 16.0,
      stockQuantity: 35,
      minStockAlert: 8,
      unit: 'set',
      taxRate: 5,
      description: '120-page lay-flat slate blue journal with matte metal pen.',
      status: 'active',
    },
    {
      name: 'Pour-Over Glass Carafe & Filter Pack',
      image: '/src/assets/images/product_artisan_coffee_1795299495485.jpg',
      sku: 'COF-CAR-600',
      barcode: '890100100005',
      categoryId: categories['Specialty Coffee']._id,
      brandId: brands['Elevate Roasters']._id,
      supplierId: supplierSecondary._id,
      purchasePrice: 18.0,
      sellingPrice: 38.0,
      wholesalePrice: 28.0,
      stockQuantity: 19,
      minStockAlert: 6,
      unit: 'set',
      taxRate: 5,
      description: 'Borosilicate 600ml carafe with 50 unbleached paper filters.',
      status: 'active',
    },
    {
      name: 'Aluminum Laptop & Tablet Riser Stand',
      image: '/src/assets/images/product_wireless_audio_1795299496636.jpg',
      sku: 'ACC-STD-210',
      barcode: '890100100006',
      categoryId: categories['Accessories']._id,
      brandId: brands['Nordic Desk']._id,
      supplierId: supplierPrimary._id,
      purchasePrice: 22.0,
      sellingPrice: 49.0,
      wholesalePrice: 36.0,
      stockQuantity: 24,
      minStockAlert: 8,
      unit: 'pcs',
      taxRate: 8,
      description: 'Anodized ergonomic desk stand with silicone grip pads.',
      status: 'active',
    },
  ];

  const products: Record<string, any> = {};
  for (const prod of sampleProductsSpec) {
    const created = await db.products.create(prod);
    products[created.sku] = created;
    await db.stockMovements.create({
      productId: created._id,
      productName: created.name,
      sku: created.sku,
      movementType: 'opening',
      previousQuantity: 0,
      changedQuantity: created.stockQuantity,
      newQuantity: created.stockQuantity,
      reason: 'Sample store opening inventory',
      reference: 'SEED-OPENING',
      userId: actor._id,
      userName: actor.name,
      createdAt: daysAgoIso(14, 9),
    });
  }

  // Seed 2 realistic Purchase Orders (1 received/paid, 1 received/partial payment with supplier due)
  const po1Date = daysAgoIso(6, 10);
  const po1Sub = roundMoney(20 * 145 + 15 * 14);
  const po1Shipping = 35;
  const po1Total = roundMoney(po1Sub + po1Shipping);
  const po1 = await db.purchases.create({
    purchaseNumber: 'PO-2026-0001',
    supplierId: supplierPrimary._id,
    supplierName: supplierPrimary.name,
    subtotal: po1Sub,
    discountAmount: 0,
    taxAmount: 0,
    shippingCost: po1Shipping,
    totalAmount: po1Total,
    paidAmount: po1Total,
    dueAmount: 0,
    paymentStatus: 'paid',
    paymentMethod: 'Bank Transfer',
    status: 'received',
    notes: 'Initial hardware & drinkware restock',
    createdById: actor._id,
    createdByName: actor.name,
    purchaseDate: po1Date,
  });
  await db.purchaseItems.create({
    purchaseId: po1._id,
    productId: products['AUD-ANC-01']._id,
    productName: products['AUD-ANC-01'].name,
    sku: 'AUD-ANC-01',
    orderedQuantity: 20,
    receivedQuantity: 20,
    purchasePrice: 145,
    taxRate: 0,
    lineTotal: 2900,
  });
  await db.purchaseItems.create({
    purchaseId: po1._id,
    productId: products['DRK-STL-750']._id,
    productName: products['DRK-STL-750'].name,
    sku: 'DRK-STL-750',
    orderedQuantity: 15,
    receivedQuantity: 15,
    purchasePrice: 14,
    taxRate: 0,
    lineTotal: 210,
  });
  await db.payments.create({
    referenceNumber: 'PAY-2026-0001',
    entityType: 'supplier',
    entityId: supplierPrimary._id,
    entityName: supplierPrimary.name,
    purchaseId: po1._id,
    direction: 'outflow',
    amount: po1Total,
    method: 'Bank Transfer',
    notes: 'Settlement for PO-2026-0001',
    paymentDate: po1Date,
    recordedById: actor._id,
    recordedByName: actor.name,
  });
  await db.suppliers.updateById(supplierPrimary._id, {
    $set: { totalPurchases: po1Total, totalPaid: po1Total, currentDue: 0 },
  });

  const po2Date = daysAgoIso(3, 14);
  const po2Sub = roundMoney(30 * 11.5 + 12 * 18);
  const po2Total = po2Sub;
  const po2Paid = 300;
  const po2Due = roundMoney(po2Total - po2Paid);
  const po2 = await db.purchases.create({
    purchaseNumber: 'PO-2026-0002',
    supplierId: supplierSecondary._id,
    supplierName: supplierSecondary.name,
    subtotal: po2Sub,
    discountAmount: 0,
    taxAmount: 0,
    shippingCost: 0,
    totalAmount: po2Total,
    paidAmount: po2Paid,
    dueAmount: po2Due,
    paymentStatus: 'partial',
    paymentMethod: 'Bank Transfer',
    status: 'received',
    notes: 'Roasted coffee & carafe replenishment (balance net 15)',
    createdById: actor._id,
    createdByName: actor.name,
    purchaseDate: po2Date,
  });
  await db.purchaseItems.create({
    purchaseId: po2._id,
    productId: products['COF-RW-240']._id,
    productName: products['COF-RW-240'].name,
    sku: 'COF-RW-240',
    orderedQuantity: 30,
    receivedQuantity: 30,
    purchasePrice: 11.5,
    taxRate: 0,
    lineTotal: 345,
  });
  await db.purchaseItems.create({
    purchaseId: po2._id,
    productId: products['COF-CAR-600']._id,
    productName: products['COF-CAR-600'].name,
    sku: 'COF-CAR-600',
    orderedQuantity: 12,
    receivedQuantity: 12,
    purchasePrice: 18,
    taxRate: 0,
    lineTotal: 216,
  });
  await db.payments.create({
    referenceNumber: 'PAY-2026-0002',
    entityType: 'supplier',
    entityId: supplierSecondary._id,
    entityName: supplierSecondary.name,
    purchaseId: po2._id,
    direction: 'outflow',
    amount: po2Paid,
    method: 'Bank Transfer',
    notes: 'Deposit for PO-2026-0002',
    paymentDate: po2Date,
    recordedById: actor._id,
    recordedByName: actor.name,
  });
  await db.suppliers.updateById(supplierSecondary._id, {
    $set: { totalPurchases: po2Total, totalPaid: po2Paid, currentDue: po2Due },
  });

  // Seed 6 real Sales across the past 6 days + today
  const salesBlueprint = [
    {
      inv: 'INV-2026-0001',
      payRef: 'PAY-2026-0003',
      date: daysAgoIso(5, 11),
      customer: custVip,
      method: 'Card',
      split: [],
      lines: [
        { prod: products['AUD-ANC-01'], qty: 1 },
        { prod: products['ACC-STD-210'], qty: 1 },
      ],
      paidRatio: 1,
      notes: 'Studio workspace upgrade order',
    },
    {
      inv: 'INV-2026-0002',
      payRef: 'PAY-2026-0004',
      date: daysAgoIso(4, 15),
      customer: walkIn || custRetail,
      method: 'Cash',
      split: [],
      lines: [
        { prod: products['COF-RW-240'], qty: 3 },
        { prod: products['DRK-STL-750'], qty: 2 },
      ],
      paidRatio: 1,
      notes: 'Counter cash sale',
    },
    {
      inv: 'INV-2026-0003',
      payRef: 'PAY-2026-0005',
      date: daysAgoIso(3, 13),
      customer: custWholesale,
      method: 'Bank Transfer',
      split: [],
      lines: [
        { prod: products['COF-RW-240'], qty: 8 },
        { prod: products['COF-CAR-600'], qty: 3 },
      ],
      paidRatio: 0.65,
      notes: 'Harbor Cafe wholesale restock (partial payment)',
    },
    {
      inv: 'INV-2026-0004',
      payRef: 'PAY-2026-0006',
      date: daysAgoIso(2, 16),
      customer: custRetail,
      method: 'bKash',
      split: [],
      lines: [
        { prod: products['STN-JRN-120'], qty: 2 },
        { prod: products['COF-RW-240'], qty: 2 },
      ],
      paidRatio: 1,
      notes: 'Mobile wallet checkout',
    },
    {
      inv: 'INV-2026-0005',
      payRef: 'PAY-2026-0007',
      date: daysAgoIso(1, 12),
      customer: custVip,
      method: 'Mixed Payment',
      split: [
        { method: 'Cash', amount: 100 },
        { method: 'Card', amount: 221.32 },
      ],
      lines: [
        { prod: products['AUD-ANC-01'], qty: 1 },
        { prod: products['STN-JRN-120'], qty: 2 },
      ],
      paidRatio: 1,
      notes: 'Split cash & card tender',
    },
    {
      inv: 'INV-2026-0006',
      payRef: 'PAY-2026-0008',
      date: daysAgoIso(0, 10),
      customer: custRetail,
      method: 'Card',
      split: [],
      lines: [
        { prod: products['COF-CAR-600'], qty: 2 },
        { prod: products['DRK-STL-750'], qty: 1 },
        { prod: products['COF-RW-240'], qty: 2 },
      ],
      paidRatio: 1,
      notes: 'Morning retail order',
    },
  ];

  const customerRollup = new Map<string, { purchases: number; paid: number; due: number }>();

  for (const sb of salesBlueprint) {
    let subtotal = 0;
    let taxAmount = 0;
    let costTotal = 0;

    const linePayloads = sb.lines.map(({ prod, qty }) => {
      const unitPrice = Number(prod.sellingPrice);
      const lineSub = roundMoney(unitPrice * qty);
      const lineTax = roundMoney((lineSub * Number(prod.taxRate || 0)) / 100);
      const lineTotal = roundMoney(lineSub + lineTax);
      subtotal = roundMoney(subtotal + lineSub);
      taxAmount = roundMoney(taxAmount + lineTax);
      costTotal = roundMoney(costTotal + Number(prod.purchasePrice) * qty);
      return { prod, qty, unitPrice, lineTax, lineTotal };
    });

    const grandTotal = roundMoney(subtotal + taxAmount);
    const paidAmount =
      sb.split.length > 0
        ? roundMoney(sb.split.reduce((a, s) => a + s.amount, 0))
        : sb.paidRatio >= 1
        ? grandTotal
        : roundMoney(grandTotal * sb.paidRatio);
    const dueAmount = roundMoney(Math.max(0, grandTotal - paidAmount));
    const paymentStatus = dueAmount <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'due';

    const sale = await db.sales.create({
      invoiceNumber: sb.inv,
      customerId: sb.customer._id,
      customerName: sb.customer.name,
      cashierId: actor._id,
      cashierName: actor.name,
      subtotal,
      itemDiscountTotal: 0,
      invoiceDiscountType: 'fixed',
      invoiceDiscountValue: 0,
      invoiceDiscountAmount: 0,
      taxAmount,
      grandTotal,
      paidAmount,
      dueAmount,
      changeAmount: 0,
      costTotal,
      paymentMethod: sb.method,
      paymentSplit:
        sb.split.length > 0
          ? sb.split.map((s, idx) =>
              idx === sb.split.length - 1
                ? { method: s.method, amount: roundMoney(grandTotal - sb.split.slice(0, -1).reduce((a, x) => a + x.amount, 0)) }
                : s
            )
          : [],
      paymentStatus,
      status: 'completed',
      notes: sb.notes,
      saleDate: sb.date,
    });

    const actualPaid = sb.split.length > 0 ? grandTotal : paidAmount;
    const actualDue = sb.split.length > 0 ? 0 : dueAmount;
    if (sb.split.length > 0) {
      await db.sales.updateById(sale._id, {
        $set: { paidAmount: actualPaid, dueAmount: 0, paymentStatus: 'paid' },
      });
    }

    for (const lp of linePayloads) {
      await db.saleItems.create({
        saleId: sale._id,
        productId: lp.prod._id,
        productName: lp.prod.name,
        sku: lp.prod.sku,
        categoryId: lp.prod.categoryId,
        quantity: lp.qty,
        returnedQuantity: 0,
        unitPrice: lp.unitPrice,
        costPrice: Number(lp.prod.purchasePrice),
        discountType: 'fixed',
        discountValue: 0,
        discountAmount: 0,
        taxRate: Number(lp.prod.taxRate || 0),
        taxAmount: lp.lineTax,
        lineTotal: lp.lineTotal,
      });
    }

    if (actualPaid > 0) {
      await db.payments.create({
        referenceNumber: sb.payRef,
        entityType: 'customer',
        entityId: sb.customer._id,
        entityName: sb.customer.name,
        saleId: sale._id,
        direction: 'inflow',
        amount: actualPaid,
        method: sb.method,
        notes: `POS Checkout (${sb.inv})`,
        paymentDate: sb.date,
        recordedById: actor._id,
        recordedByName: actor.name,
      });
    }

    const prevRoll = customerRollup.get(sb.customer._id) || { purchases: 0, paid: 0, due: 0 };
    customerRollup.set(sb.customer._id, {
      purchases: roundMoney(prevRoll.purchases + grandTotal),
      paid: roundMoney(prevRoll.paid + actualPaid),
      due: roundMoney(prevRoll.due + actualDue),
    });
  }

  for (const [custId, rollup] of customerRollup.entries()) {
    await db.customers.updateById(custId, {
      $set: {
        totalPurchases: rollup.purchases,
        totalPaid: rollup.paid,
        currentDue: rollup.due,
      },
    });
  }

  // Seed 4 operational expenses
  const expCats = await db.expenseCategories.find({ deletedAt: null });
  const findCat = (keyword: string) =>
    expCats.find((c) => c.name.toLowerCase().includes(keyword.toLowerCase())) || expCats[0];

  if (expCats.length > 0) {
    const rentCat = findCat('rent');
    const logCat = findCat('logistics');
    const mktCat = findCat('marketing');
    const supCat = findCat('supplies');

    const expensesData = [
      {
        title: 'Showroom Monthly Utilities & Internet',
        categoryId: rentCat._id,
        categoryName: rentCat.name,
        amount: 185,
        date: daysAgoIso(5, 9),
        paymentMethod: 'Bank Transfer',
        reference: 'UTIL-2026-11',
        description: 'Electricity and fiber POS link',
      },
      {
        title: 'Local Courier Delivery Dispatch',
        categoryId: logCat._id,
        categoryName: logCat.name,
        amount: 42,
        date: daysAgoIso(2, 14),
        paymentMethod: 'Cash',
        reference: 'SHIP-441',
        description: 'Same-day wholesale carton delivery',
      },
      {
        title: 'Social Catalog Promo Campaign',
        categoryId: mktCat._id,
        categoryName: mktCat.name,
        amount: 95,
        date: daysAgoIso(1, 17),
        paymentMethod: 'Card',
        reference: 'ADS-1190',
        description: 'Weekend specialty roast promotion',
      },
      {
        title: 'Thermal Receipt Rolls & Packaging Bags',
        categoryId: supCat._id,
        categoryName: supCat.name,
        amount: 28,
        date: daysAgoIso(0, 9),
        paymentMethod: 'Cash',
        reference: 'SUP-092',
        description: '80mm thermal paper & kraft carry bags',
      },
    ];

    for (const ex of expensesData) {
      await db.expenses.create({
        ...ex,
        createdById: actor._id,
        createdByName: actor.name,
      });
    }
  }

  // Low-stock notification for Brushed Steel Insulated Bottle (qty 7 <= threshold 10)
  const lowProd = products['DRK-STL-750'];
  if (lowProd) {
    await db.notifications.create({
      type: 'low_stock',
      title: `Low Stock: ${lowProd.name}`,
      message: `${lowProd.name} (SKU ${lowProd.sku}) has ${lowProd.stockQuantity} units remaining (alert threshold: ${lowProd.minStockAlert}).`,
      relatedId: lowProd._id,
      isRead: false,
    });
  }

  await logActivity({
    userId: actor._id,
    userName: actor.name,
    userRole: actor.roleName,
    action: 'seed',
    module: 'settings',
    description:
      'Loaded starter store dataset (6 products, 5 categories, 5 brands, 2 suppliers, 3 customers, 2 purchase orders, 6 sales invoices, 4 expenses)',
  });

  return {
    productsCreated: sampleProductsSpec.length,
    salesCreated: salesBlueprint.length,
    purchasesCreated: 2,
    expensesCreated: 4,
    customerId: custVip._id,
    supplierId: supplierPrimary._id,
  };
}

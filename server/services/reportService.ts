import { db } from '../db/store';
import { roundMoney } from './posService';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'prev_month'
  | 'all'
  | 'custom';

export function resolveDateRange(
  preset: string = '30d',
  startStr?: string,
  endStr?: string
): { start: Date | null; end: Date | null } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today':
      return { start: startOfToday, end: endOfToday };
    case 'yesterday': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 1);
      const e = new Date(endOfToday);
      e.setDate(e.getDate() - 1);
      return { start: s, end: e };
    }
    case '7d': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 6);
      return { start: s, end: endOfToday };
    }
    case '30d': {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 29);
      return { start: s, end: endOfToday };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start: s, end: endOfToday };
    }
    case 'prev_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'custom': {
      const s = startStr ? new Date(`${startStr}T00:00:00.000`) : null;
      const e = endStr ? new Date(`${endStr}T23:59:59.999`) : null;
      return {
        start: s && !isNaN(s.getTime()) ? s : null,
        end: e && !isNaN(e.getTime()) ? e : null,
      };
    }
    default:
      return { start: null, end: null };
  }
}

function inRange(dateVal: any, range: { start: Date | null; end: Date | null }): boolean {
  if (!range.start && !range.end) return true;
  const t = new Date(dateVal).getTime();
  if (isNaN(t)) return false;
  if (range.start && t < range.start.getTime()) return false;
  if (range.end && t > range.end.getTime()) return false;
  return true;
}

export async function getDashboardData(preset: string, startStr?: string, endStr?: string) {
  const range = resolveDateRange(preset, startStr, endStr);
  const todayRange = resolveDateRange('today');

  const [
    allSales,
    allSaleItems,
    allProducts,
    allCategories,
    allCustomers,
    allSuppliers,
    allExpenses,
    allReturns,
    allActivity,
    settings,
  ] = await Promise.all([
    db.sales.find({}, { sort: { saleDate: -1 } }),
    db.saleItems.find({}),
    db.products.find({ deletedAt: null }),
    db.categories.find({ deletedAt: null }),
    db.customers.find({ deletedAt: null }),
    db.suppliers.find({ deletedAt: null }),
    db.expenses.find({ deletedAt: null }),
    db.returns.find({}),
    db.activityLogs.find({}, { sort: { createdAt: -1 }, limit: 10 }),
    db.settings.findOne({}),
  ]);

  const activeSales = allSales.filter((s) => s.status !== 'canceled');
  const filteredSales = activeSales.filter((s) => inRange(s.saleDate, range));
  const todaySales = activeSales.filter((s) => inRange(s.saleDate, todayRange));

  const saleReturns = allReturns.filter(
    (r) => r.type === 'sale_return' && inRange(r.returnDate, range)
  );

  const todaySaleReturns = allReturns.filter(
    (r) => r.type === 'sale_return' && inRange(r.returnDate, todayRange)
  );

  const filteredExpenses = allExpenses.filter((e) => inRange(e.date, range));
  const todayExpenses = allExpenses.filter((e) => inRange(e.date, todayRange));

  const todaySalesTotal = roundMoney(
    todaySales.reduce((acc, s) => acc + Number(s.grandTotal || 0), 0) -
      todaySaleReturns.reduce((acc, r) => acc + Number(r.totalRefundAmount || 0), 0)
  );

  const grossRevenue = roundMoney(filteredSales.reduce((acc, s) => acc + Number(s.grandTotal || 0), 0));
  const returnsTotal = roundMoney(saleReturns.reduce((acc, r) => acc + Number(r.totalRefundAmount || 0), 0));
  const totalRevenue = roundMoney(Math.max(0, grossRevenue - returnsTotal));

  const grossCost = roundMoney(filteredSales.reduce((acc, s) => acc + Number(s.costTotal || 0), 0));
  const recoveredCost = roundMoney(saleReturns.reduce((acc, r) => acc + Number(r.costRecovered || 0), 0));
  const netCost = roundMoney(Math.max(0, grossCost - recoveredCost));

  const totalExpensesAmt = roundMoney(filteredExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0));
  const grossProfit = roundMoney(totalRevenue - netCost);
  const totalProfit = roundMoney(grossProfit - totalExpensesAmt);

  const todayExpensesTotal = roundMoney(todayExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0));

  const lowStockThresholdDefault = Number(settings?.lowStockThreshold ?? 10);
  const lowStockProducts = allProducts.filter((p) => {
    const t = Number(p.minStockAlert ?? lowStockThresholdDefault);
    return Number(p.stockQuantity) > 0 && Number(p.stockQuantity) <= t;
  });
  const outOfStockProducts = allProducts.filter((p) => Number(p.stockQuantity) <= 0);

  const pendingPayments = roundMoney(
    allCustomers.reduce((acc, c) => acc + Math.max(0, Number(c.currentDue || 0)), 0)
  );

  // Sales Overview by Date
  const dailyMap = new Map<string, { date: string; sales: number; profit: number; expenses: number; orders: number }>();
  for (const s of filteredSales) {
    const day = new Date(s.saleDate).toISOString().slice(0, 10);
    const cur = dailyMap.get(day) || { date: day, sales: 0, profit: 0, expenses: 0, orders: 0 };
    cur.sales = roundMoney(cur.sales + Number(s.grandTotal || 0));
    cur.profit = roundMoney(cur.profit + (Number(s.grandTotal || 0) - Number(s.costTotal || 0)));
    cur.orders += 1;
    dailyMap.set(day, cur);
  }
  for (const e of filteredExpenses) {
    const day = new Date(e.date).toISOString().slice(0, 10);
    const cur = dailyMap.get(day) || { date: day, sales: 0, profit: 0, expenses: 0, orders: 0 };
    cur.expenses = roundMoney(cur.expenses + Number(e.amount || 0));
    dailyMap.set(day, cur);
  }
  const salesOverviewChart = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Weekly Sales Chart (last 7 days)
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyMap = new Map<string, { label: string; sales: number; orders: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    weeklyMap.set(key, { label: `${weekdayNames[d.getUTCDay()]} ${d.getUTCDate()}`, sales: 0, orders: 0 });
  }
  for (const s of activeSales) {
    const key = new Date(s.saleDate).toISOString().slice(0, 10);
    const bucket = weeklyMap.get(key);
    if (bucket) {
      bucket.sales = roundMoney(bucket.sales + Number(s.grandTotal || 0));
      bucket.orders += 1;
    }
  }
  const weeklySalesChart = Array.from(weeklyMap.values());

  // Monthly Revenue Chart (last 12 months)
  const monthlyMap = new Map<string, { month: string; revenue: number; expenses: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    monthlyMap.set(key, { month: label, revenue: 0, expenses: 0 });
  }
  for (const s of activeSales) {
    const d = new Date(s.saleDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = monthlyMap.get(key);
    if (bucket) bucket.revenue = roundMoney(bucket.revenue + Number(s.grandTotal || 0));
  }
  for (const e of allExpenses) {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = monthlyMap.get(key);
    if (bucket) bucket.expenses = roundMoney(bucket.expenses + Number(e.amount || 0));
  }
  const monthlyRevenueChart = Array.from(monthlyMap.values());

  // Sales by Category & Top Selling Products
  const filteredSaleIds = new Set(filteredSales.map((s) => s._id));
  const categoryNameMap = new Map(allCategories.map((c) => [c._id, c.name]));
  const productMap = new Map(allProducts.map((p) => [p._id, p]));
  const categorySalesMap = new Map<string, { name: string; value: number; quantity: number }>();
  const productSalesMap = new Map<
    string,
    { productId: string; name: string; sku: string; quantity: number; revenue: number }
  >();

  for (const item of allSaleItems) {
    if (!filteredSaleIds.has(String(item.saleId))) continue;
    const netQty = Math.max(0, Number(item.quantity) - Number(item.returnedQuantity || 0));
    if (netQty <= 0) continue;
    const ratio = netQty / Number(item.quantity);
    const revenue = roundMoney(Number(item.lineTotal || 0) * ratio);

    const prod = productMap.get(String(item.productId));
    const catId = String(item.categoryId || prod?.categoryId || '');
    const catName = categoryNameMap.get(catId) || 'Uncategorized';

    const catEntry = categorySalesMap.get(catName) || { name: catName, value: 0, quantity: 0 };
    catEntry.value = roundMoney(catEntry.value + revenue);
    catEntry.quantity += netQty;
    categorySalesMap.set(catName, catEntry);

    const pKey = String(item.productId);
    const pEntry = productSalesMap.get(pKey) || {
      productId: pKey,
      name: item.productName,
      sku: item.sku,
      quantity: 0,
      revenue: 0,
    };
    pEntry.quantity += netQty;
    pEntry.revenue = roundMoney(pEntry.revenue + revenue);
    productSalesMap.set(pKey, pEntry);
  }

  const salesByCategory = Array.from(categorySalesMap.values()).sort((a, b) => b.value - a.value);
  const topSellingProducts = Array.from(productSalesMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // Payment Method Breakdown
  const paymentMap = new Map<string, { method: string; amount: number; count: number }>();
  for (const s of filteredSales) {
    if (Array.isArray(s.paymentSplit) && s.paymentSplit.length > 0) {
      for (const sp of s.paymentSplit) {
        const cur = paymentMap.get(sp.method) || { method: sp.method, amount: 0, count: 0 };
        cur.amount = roundMoney(cur.amount + Number(sp.amount || 0));
        cur.count += 1;
        paymentMap.set(sp.method, cur);
      }
    } else {
      const cur = paymentMap.get(s.paymentMethod) || { method: s.paymentMethod, amount: 0, count: 0 };
      cur.amount = roundMoney(cur.amount + Number(s.paidAmount || 0));
      cur.count += 1;
      paymentMap.set(s.paymentMethod, cur);
    }
  }
  const paymentBreakdown = Array.from(paymentMap.values()).sort((a, b) => b.amount - a.amount);

  return {
    kpis: {
      todaySales: todaySalesTotal,
      totalRevenue,
      grossProfit,
      totalProfit,
      totalOrders: filteredSales.length,
      totalProducts: allProducts.length,
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      totalCustomers: allCustomers.filter((c) => !c.isWalkIn).length,
      totalSuppliers: allSuppliers.length,
      todayExpenses: todayExpensesTotal,
      totalExpenses: totalExpensesAmt,
      pendingPayments,
    },
    charts: {
      salesOverview: salesOverviewChart,
      weeklySales: weeklySalesChart,
      monthlyRevenue: monthlyRevenueChart,
      salesByCategory,
      paymentBreakdown,
    },
    topSellingProducts,
    recentTransactions: filteredSales.slice(0, 8),
    recentActivity: allActivity,
    lowStockAlerts: lowStockProducts.slice(0, 6),
  };
}

export async function getFinancialOverview(preset: string, startStr?: string, endStr?: string) {
  const range = resolveDateRange(preset, startStr, endStr);
  const [sales, purchases, expenses, payments, returns, customers, suppliers] = await Promise.all([
    db.sales.find({}),
    db.purchases.find({}),
    db.expenses.find({ deletedAt: null }),
    db.payments.find({}),
    db.returns.find({}),
    db.customers.find({ deletedAt: null }),
    db.suppliers.find({ deletedAt: null }),
  ]);

  const activeSales = sales.filter((s) => s.status !== 'canceled' && inRange(s.saleDate, range));
  const activePurchases = purchases.filter(
    (p) => p.status !== 'draft' && p.status !== 'canceled' && inRange(p.purchaseDate, range)
  );
  const filteredExpenses = expenses.filter((e) => inRange(e.date, range));
  const filteredPayments = payments.filter((p) => inRange(p.paymentDate, range));
  const saleReturns = returns.filter((r) => r.type === 'sale_return' && inRange(r.returnDate, range));

  const grossSales = roundMoney(activeSales.reduce((a, s) => a + Number(s.grandTotal || 0), 0));
  const totalRefunds = roundMoney(saleReturns.reduce((a, r) => a + Number(r.totalRefundAmount || 0), 0));
  const netSales = roundMoney(Math.max(0, grossSales - totalRefunds));
  const taxCollected = roundMoney(activeSales.reduce((a, s) => a + Number(s.taxAmount || 0), 0));

  const totalCogs = roundMoney(
    Math.max(
      0,
      activeSales.reduce((a, s) => a + Number(s.costTotal || 0), 0) -
        saleReturns.reduce((a, r) => a + Number(r.costRecovered || 0), 0)
    )
  );
  const grossProfit = roundMoney(netSales - totalCogs);
  const totalExpenses = roundMoney(filteredExpenses.reduce((a, e) => a + Number(e.amount || 0), 0));
  const netProfit = roundMoney(grossProfit - totalExpenses);
  const totalPurchases = roundMoney(activePurchases.reduce((a, p) => a + Number(p.totalAmount || 0), 0));

  let cashReceived = 0;
  let cardPayments = 0;
  let mobileBankingPayments = 0;
  let bankTransfers = 0;

  for (const pay of filteredPayments) {
    if (pay.direction !== 'inflow') continue;
    const amt = Number(pay.amount || 0);
    if (pay.method === 'Cash') cashReceived = roundMoney(cashReceived + amt);
    else if (pay.method === 'Card') cardPayments = roundMoney(cardPayments + amt);
    else if (['Mobile Banking', 'bKash', 'Nagad', 'Rocket'].includes(pay.method)) {
      mobileBankingPayments = roundMoney(mobileBankingPayments + amt);
    } else if (pay.method === 'Bank Transfer') {
      bankTransfers = roundMoney(bankTransfers + amt);
    }
  }

  // Also include split payments from sales if paid via Mixed Payment
  for (const s of activeSales) {
    if (s.paymentMethod === 'Mixed Payment' && Array.isArray(s.paymentSplit)) {
      for (const sp of s.paymentSplit) {
        const amt = Number(sp.amount || 0);
        if (sp.method === 'Cash') cashReceived = roundMoney(cashReceived + amt);
        else if (sp.method === 'Card') cardPayments = roundMoney(cardPayments + amt);
        else if (['Mobile Banking', 'bKash', 'Nagad', 'Rocket'].includes(sp.method)) {
          mobileBankingPayments = roundMoney(mobileBankingPayments + amt);
        } else if (sp.method === 'Bank Transfer') {
          bankTransfers = roundMoney(bankTransfers + amt);
        }
      }
    }
  }

  const totalCustomerDue = roundMoney(
    customers.reduce((a, c) => a + Math.max(0, Number(c.currentDue || 0)), 0)
  );
  const totalSupplierDue = roundMoney(
    suppliers.reduce((a, s) => a + Math.max(0, Number(s.currentDue || 0)), 0)
  );

  // Cash flow timeline
  const flowMap = new Map<string, { date: string; inflow: number; outflow: number; net: number }>();
  for (const p of filteredPayments) {
    const day = new Date(p.paymentDate).toISOString().slice(0, 10);
    const cur = flowMap.get(day) || { date: day, inflow: 0, outflow: 0, net: 0 };
    if (p.direction === 'inflow') cur.inflow = roundMoney(cur.inflow + Number(p.amount || 0));
    else cur.outflow = roundMoney(cur.outflow + Number(p.amount || 0));
    cur.net = roundMoney(cur.inflow - cur.outflow);
    flowMap.set(day, cur);
  }
  for (const e of filteredExpenses) {
    const day = new Date(e.date).toISOString().slice(0, 10);
    const cur = flowMap.get(day) || { date: day, inflow: 0, outflow: 0, net: 0 };
    cur.outflow = roundMoney(cur.outflow + Number(e.amount || 0));
    cur.net = roundMoney(cur.inflow - cur.outflow);
    flowMap.set(day, cur);
  }

  return {
    summary: {
      totalSales: netSales,
      grossSales,
      grossProfit,
      netProfit,
      totalCogs,
      totalPurchases,
      totalExpenses,
      cashReceived,
      cardPayments,
      mobileBankingPayments,
      bankTransfers,
      totalCustomerDue,
      totalSupplierDue,
      refunds: totalRefunds,
      taxCollected,
    },
    cashFlow: Array.from(flowMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    customerDues: customers.filter((c) => Number(c.currentDue || 0) > 0),
    supplierDues: suppliers.filter((s) => Number(s.currentDue || 0) > 0),
    expensesByCategory: Object.values(
      filteredExpenses.reduce((acc: Record<string, { category: string; amount: number; count: number }>, e) => {
        const key = e.categoryName || 'General';
        if (!acc[key]) acc[key] = { category: key, amount: 0, count: 0 };
        acc[key].amount = roundMoney(acc[key].amount + Number(e.amount || 0));
        acc[key].count += 1;
        return acc;
      }, {})
    ),
  };
}

export async function generateReport(
  reportType: string,
  preset: string,
  startStr?: string,
  endStr?: string
) {
  const range = resolveDateRange(preset, startStr, endStr);

  switch (reportType) {
    case 'daily_sales':
    case 'weekly_sales':
    case 'monthly_sales':
    case 'yearly_sales': {
      const sales = (await db.sales.find({})).filter(
        (s) => s.status !== 'canceled' && inRange(s.saleDate, range)
      );
      const grouped = new Map<string, { period: string; orders: number; subtotal: number; discount: number; tax: number; total: number; paid: number; due: number; profit: number }>();

      for (const s of sales) {
        const d = new Date(s.saleDate);
        let key = d.toISOString().slice(0, 10);
        if (reportType === 'weekly_sales') {
          const first = d.getDate() - d.getDay();
          const weekStart = new Date(d.getFullYear(), d.getMonth(), first);
          key = `Week of ${weekStart.toISOString().slice(0, 10)}`;
        } else if (reportType === 'monthly_sales') {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else if (reportType === 'yearly_sales') {
          key = String(d.getFullYear());
        }
        const row = grouped.get(key) || { period: key, orders: 0, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, due: 0, profit: 0 };
        row.orders += 1;
        row.subtotal = roundMoney(row.subtotal + Number(s.subtotal || 0));
        row.discount = roundMoney(row.discount + Number(s.itemDiscountTotal || 0) + Number(s.invoiceDiscountAmount || 0));
        row.tax = roundMoney(row.tax + Number(s.taxAmount || 0));
        row.total = roundMoney(row.total + Number(s.grandTotal || 0));
        row.paid = roundMoney(row.paid + Number(s.paidAmount || 0));
        row.due = roundMoney(row.due + Number(s.dueAmount || 0));
        row.profit = roundMoney(row.profit + (Number(s.grandTotal || 0) - Number(s.costTotal || 0)));
        grouped.set(key, row);
      }
      return Array.from(grouped.values()).sort((a, b) => b.period.localeCompare(a.period));
    }

    case 'sales_by_product': {
      const [sales, items] = await Promise.all([db.sales.find({}), db.saleItems.find({})]);
      const validIds = new Set(sales.filter((s) => s.status !== 'canceled' && inRange(s.saleDate, range)).map((s) => s._id));
      const map = new Map<string, { sku: string; productName: string; quantitySold: number; revenue: number; cost: number; profit: number }>();
      for (const it of items) {
        if (!validIds.has(String(it.saleId))) continue;
        const netQty = Math.max(0, Number(it.quantity) - Number(it.returnedQuantity || 0));
        if (netQty <= 0) continue;
        const rev = roundMoney((Number(it.lineTotal) / Number(it.quantity)) * netQty);
        const cost = roundMoney(Number(it.costPrice) * netQty);
        const row = map.get(String(it.productId)) || { sku: it.sku, productName: it.productName, quantitySold: 0, revenue: 0, cost: 0, profit: 0 };
        row.quantitySold += netQty;
        row.revenue = roundMoney(row.revenue + rev);
        row.cost = roundMoney(row.cost + cost);
        row.profit = roundMoney(row.revenue - row.cost);
        map.set(String(it.productId), row);
      }
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    }

    case 'sales_by_category': {
      const [sales, items, categories, products] = await Promise.all([
        db.sales.find({}),
        db.saleItems.find({}),
        db.categories.find({}),
        db.products.find({}),
      ]);
      const validIds = new Set(sales.filter((s) => s.status !== 'canceled' && inRange(s.saleDate, range)).map((s) => s._id));
      const catNames = new Map(categories.map((c) => [c._id, c.name]));
      const prodCats = new Map(products.map((p) => [p._id, String(p.categoryId)]));
      const map = new Map<string, { category: string; itemsSold: number; revenue: number; profit: number }>();
      for (const it of items) {
        if (!validIds.has(String(it.saleId))) continue;
        const netQty = Math.max(0, Number(it.quantity) - Number(it.returnedQuantity || 0));
        if (netQty <= 0) continue;
        const cId = String(it.categoryId || prodCats.get(String(it.productId)) || '');
        const cName = catNames.get(cId) || 'Uncategorized';
        const rev = roundMoney((Number(it.lineTotal) / Number(it.quantity)) * netQty);
        const cost = roundMoney(Number(it.costPrice) * netQty);
        const row = map.get(cName) || { category: cName, itemsSold: 0, revenue: 0, profit: 0 };
        row.itemsSold += netQty;
        row.revenue = roundMoney(row.revenue + rev);
        row.profit = roundMoney(row.profit + (rev - cost));
        map.set(cName, row);
      }
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    }

    case 'sales_by_customer': {
      const sales = (await db.sales.find({})).filter((s) => s.status !== 'canceled' && inRange(s.saleDate, range));
      const map = new Map<string, { customerName: string; orders: number; totalSpent: number; paid: number; due: number }>();
      for (const s of sales) {
        const key = String(s.customerId);
        const row = map.get(key) || { customerName: s.customerName, orders: 0, totalSpent: 0, paid: 0, due: 0 };
        row.orders += 1;
        row.totalSpent = roundMoney(row.totalSpent + Number(s.grandTotal || 0));
        row.paid = roundMoney(row.paid + Number(s.paidAmount || 0));
        row.due = roundMoney(row.due + Number(s.dueAmount || 0));
        map.set(key, row);
      }
      return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
    }

    case 'sales_by_cashier': {
      const sales = (await db.sales.find({})).filter((s) => s.status !== 'canceled' && inRange(s.saleDate, range));
      const map = new Map<string, { cashierName: string; orders: number; totalSales: number; taxCollected: number }>();
      for (const s of sales) {
        const key = String(s.cashierId);
        const row = map.get(key) || { cashierName: s.cashierName, orders: 0, totalSales: 0, taxCollected: 0 };
        row.orders += 1;
        row.totalSales = roundMoney(row.totalSales + Number(s.grandTotal || 0));
        row.taxCollected = roundMoney(row.taxCollected + Number(s.taxAmount || 0));
        map.set(key, row);
      }
      return Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales);
    }

    case 'sales_by_payment_method': {
      const sales = (await db.sales.find({})).filter((s) => s.status !== 'canceled' && inRange(s.saleDate, range));
      const map = new Map<string, { method: string; transactions: number; amount: number }>();
      for (const s of sales) {
        if (Array.isArray(s.paymentSplit) && s.paymentSplit.length > 0) {
          for (const sp of s.paymentSplit) {
            const row = map.get(sp.method) || { method: sp.method, transactions: 0, amount: 0 };
            row.transactions += 1;
            row.amount = roundMoney(row.amount + Number(sp.amount || 0));
            map.set(sp.method, row);
          }
        } else {
          const row = map.get(s.paymentMethod) || { method: s.paymentMethod, transactions: 0, amount: 0 };
          row.transactions += 1;
          row.amount = roundMoney(row.amount + Number(s.paidAmount || 0));
          map.set(s.paymentMethod, row);
        }
      }
      return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    }

    case 'purchase_report': {
      const purchases = (await db.purchases.find({}, { sort: { purchaseDate: -1 } })).filter((p) =>
        inRange(p.purchaseDate, range)
      );
      return purchases.map((p) => ({
        purchaseNumber: p.purchaseNumber,
        date: new Date(p.purchaseDate).toISOString().slice(0, 10),
        supplier: p.supplierName,
        status: p.status,
        totalAmount: Number(p.totalAmount || 0),
        paidAmount: Number(p.paidAmount || 0),
        dueAmount: Number(p.dueAmount || 0),
      }));
    }

    case 'stock_report':
    case 'inventory_valuation': {
      const [products, categories] = await Promise.all([
        db.products.find({ deletedAt: null }, { sort: { name: 1 } }),
        db.categories.find({}),
      ]);
      const catNames = new Map(categories.map((c) => [c._id, c.name]));
      return products.map((p) => ({
        sku: p.sku,
        name: p.name,
        category: catNames.get(String(p.categoryId)) || 'Uncategorized',
        stockQuantity: Number(p.stockQuantity || 0),
        unit: p.unit || 'pcs',
        purchasePrice: Number(p.purchasePrice || 0),
        sellingPrice: Number(p.sellingPrice || 0),
        costValuation: roundMoney(Number(p.stockQuantity || 0) * Number(p.purchasePrice || 0)),
        retailValuation: roundMoney(Number(p.stockQuantity || 0) * Number(p.sellingPrice || 0)),
      }));
    }

    case 'low_stock_report': {
      const products = await db.products.find({ deletedAt: null });
      return products
        .filter((p) => Number(p.stockQuantity) <= Number(p.minStockAlert ?? 10))
        .map((p) => ({
          sku: p.sku,
          name: p.name,
          stockQuantity: Number(p.stockQuantity),
          minStockAlert: Number(p.minStockAlert ?? 10),
          status: Number(p.stockQuantity) <= 0 ? 'Out of Stock' : 'Low Stock',
        }));
    }

    case 'expired_products': {
      const products = await db.products.find({ deletedAt: null });
      const nowMs = Date.now();
      const soonMs = nowMs + 30 * 24 * 60 * 60 * 1000;
      return products
        .filter((p) => p.expiryDate && new Date(p.expiryDate).getTime() <= soonMs)
        .map((p) => ({
          sku: p.sku,
          name: p.name,
          stockQuantity: Number(p.stockQuantity),
          expiryDate: new Date(p.expiryDate).toISOString().slice(0, 10),
          status: new Date(p.expiryDate).getTime() < nowMs ? 'Expired' : 'Expiring Soon',
        }));
    }

    case 'profit_report': {
      const fin = await getFinancialOverview(preset, startStr, endStr);
      return [
        { metric: 'Gross Sales', amount: fin.summary.grossSales },
        { metric: 'Sales Refunds / Returns', amount: -fin.summary.refunds },
        { metric: 'Net Sales Revenue', amount: fin.summary.totalSales },
        { metric: 'Cost of Goods Sold (COGS)', amount: -fin.summary.totalCogs },
        { metric: 'Gross Profit', amount: fin.summary.grossProfit },
        { metric: 'Operating Expenses', amount: -fin.summary.totalExpenses },
        { metric: 'Net Profit', amount: fin.summary.netProfit },
        { metric: 'Tax / VAT Collected', amount: fin.summary.taxCollected },
      ];
    }

    case 'expense_report': {
      const expenses = (await db.expenses.find({ deletedAt: null }, { sort: { date: -1 } })).filter((e) =>
        inRange(e.date, range)
      );
      return expenses.map((e) => ({
        date: new Date(e.date).toISOString().slice(0, 10),
        title: e.title,
        category: e.categoryName,
        paymentMethod: e.paymentMethod,
        reference: e.reference || '-',
        amount: Number(e.amount || 0),
        recordedBy: e.createdByName,
      }));
    }

    case 'tax_report': {
      const sales = (await db.sales.find({}, { sort: { saleDate: -1 } })).filter(
        (s) => s.status !== 'canceled' && inRange(s.saleDate, range)
      );
      return sales.map((s) => ({
        invoiceNumber: s.invoiceNumber,
        date: new Date(s.saleDate).toISOString().slice(0, 10),
        customer: s.customerName,
        taxableSubtotal: roundMoney(Number(s.grandTotal || 0) - Number(s.taxAmount || 0)),
        taxAmount: Number(s.taxAmount || 0),
        grandTotal: Number(s.grandTotal || 0),
      }));
    }

    case 'return_report': {
      const returns = (await db.returns.find({}, { sort: { returnDate: -1 } })).filter((r) =>
        inRange(r.returnDate, range)
      );
      return returns.map((r) => ({
        returnNumber: r.returnNumber,
        date: new Date(r.returnDate).toISOString().slice(0, 10),
        type: r.type === 'sale_return' ? 'Sale Return' : 'Purchase Return',
        originalReference: r.originalReference,
        entityName: r.entityName,
        condition: r.condition,
        refundMethod: r.refundMethod,
        totalRefundAmount: Number(r.totalRefundAmount || 0),
        reason: r.reason,
      }));
    }

    case 'customer_due_report': {
      const customers = await db.customers.find({ deletedAt: null });
      return customers
        .filter((c) => Number(c.currentDue || 0) > 0)
        .map((c) => ({
          name: c.name,
          phone: c.phone || '-',
          customerType: c.customerType,
          totalPurchases: Number(c.totalPurchases || 0),
          totalPaid: Number(c.totalPaid || 0),
          currentDue: Number(c.currentDue || 0),
        }));
    }

    case 'supplier_due_report': {
      const suppliers = await db.suppliers.find({ deletedAt: null });
      return suppliers
        .filter((s) => Number(s.currentDue || 0) > 0)
        .map((s) => ({
          name: s.name,
          companyName: s.companyName || '-',
          phone: s.phone || '-',
          totalPurchases: Number(s.totalPurchases || 0),
          totalPaid: Number(s.totalPaid || 0),
          currentDue: Number(s.currentDue || 0),
        }));
    }

    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

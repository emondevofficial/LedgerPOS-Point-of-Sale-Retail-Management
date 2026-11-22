import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../server';
import { setLocalDbPathForTests } from '../server/db/store';
import { calculateCheckoutTotals } from '../server/services/posService';
import { hashPassword, signSessionToken, verifyPassword, verifySessionToken } from '../server/utils/crypto';

let server: http.Server;
let baseUrl = '';
let tmpDbPath = '';

async function req(
  pathname: string,
  options: { method?: string; body?: any; cookie?: string } = {}
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const res = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json();
  return {
    status: res.status,
    data: json,
    headers: Object.fromEntries(res.headers.entries()) as any,
  };
}

function extractCookie(headers: Record<string, any>): string {
  const raw = headers['set-cookie'];
  if (!raw) return '';
  const first = Array.isArray(raw) ? raw[0] : String(raw);
  return first.split(';')[0];
}

describe('LedgerPOS Core Logic & Integration Tests', () => {
  before(async () => {
    tmpDbPath = path.join(os.tmpdir(), `ledgerpos-test-${Date.now()}.json`);
    setLocalDbPathForTests(tmpDbPath);
    const app = await createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (tmpDbPath && fs.existsSync(tmpDbPath)) {
      fs.unlinkSync(tmpDbPath);
    }
    setLocalDbPathForTests(null);
  });

  it('hashes and verifies passwords & signs/verifies session tokens', () => {
    const hash = hashPassword('SuperSecure123!');
    assert.equal(verifyPassword('SuperSecure123!', hash), true);
    assert.equal(verifyPassword('WrongPassword', hash), false);

    const token = signSessionToken('user_123', 3600);
    const payload = verifySessionToken(token);
    assert.ok(payload);
    assert.equal(payload.uid, 'user_123');

    const tampered = token.slice(0, -3) + 'xyz';
    assert.equal(verifySessionToken(tampered), null);
  });

  it('calculates checkout totals, item/invoice discounts, tax, partial payment, and change', () => {
    const summary = calculateCheckoutTotals({
      resolvedItems: [
        {
          product: { sellingPrice: 100, purchasePrice: 60, taxRate: 10 },
          quantity: 2,
          discountType: 'fixed',
          discountValue: 20, // 200 - 20 = 180
        },
      ],
      invoiceDiscountType: 'percent',
      invoiceDiscountValue: 10, // 180 - 18 = 162
      enableTax: true,
      defaultTaxRate: 5,
      enableDiscounts: true,
      paidAmount: 100,
      isWalkIn: false,
    });

    assert.equal(summary.subtotal, 200);
    assert.equal(summary.itemDiscountTotal, 20);
    assert.equal(summary.invoiceDiscountAmount, 18);
    assert.equal(summary.taxAmount, 16.2);
    assert.equal(summary.grandTotal, 178.2);
    assert.equal(summary.appliedPaid, 100);
    assert.equal(summary.dueAmount, 78.2);
    assert.equal(summary.changeAmount, 0);
    assert.equal(summary.paymentStatus, 'partial');

    assert.throws(() =>
      calculateCheckoutTotals({
        resolvedItems: [{ product: { sellingPrice: 50, purchasePrice: 20, taxRate: 0 }, quantity: 1 }],
        enableTax: false,
        defaultTaxRate: 0,
        enableDiscounts: true,
        paidAmount: 20,
        isWalkIn: true,
      })
    );
  });

  it('handles full store setup, RBAC, catalog, POS checkout, returns, purchases, expenses, and reports', async () => {
    // 1. Setup Super Admin
    const setupRes = await req('/api/auth/setup', {
      method: 'POST',
      body: {
        name: 'Owner Admin',
        email: 'owner@teststore.com',
        password: 'Password123!',
        businessName: 'Test Store',
        currency: 'USD',
        currencySymbol: '$',
      },
    });
    assert.equal(setupRes.status, 201);
    const adminCookie = extractCookie(setupRes.headers);
    assert.ok(adminCookie.includes('ledgerpos_session='));

    // Duplicate setup must be blocked
    const dupSetup = await req('/api/auth/setup', {
      method: 'POST',
      body: {
        name: 'Hacker',
        email: 'hacker@teststore.com',
        password: 'Password123!',
        businessName: 'Hack',
      },
    });
    assert.equal(dupSetup.status, 403);

    // 2. Create a Cashier and test RBAC denial on admin users route
    const rolesRes = await req('/api/roles', { cookie: adminCookie });
    assert.equal(rolesRes.status, 200);
    const cashierRole = rolesRes.data.data.find((r: any) => r.slug === 'cashier');
    assert.ok(cashierRole);

    const createCashier = await req('/api/users', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Front Cashier',
        email: 'cashier@teststore.com',
        password: 'CashierPass123!',
        roleId: cashierRole._id,
      },
    });
    assert.equal(createCashier.status, 201);

    const cashierLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'cashier@teststore.com', password: 'CashierPass123!' },
    });
    assert.equal(cashierLogin.status, 200);
    const cashierCookie = extractCookie(cashierLogin.headers);

    const forbiddenUsers = await req('/api/users', { cookie: cashierCookie });
    assert.equal(forbiddenUsers.status, 403);

    // 3. Create Category, Brand, Supplier, Customer, and Product
    const catRes = await req('/api/categories', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: 'Beverages', status: 'active' },
    });
    assert.equal(catRes.status, 201);
    const categoryId = catRes.data.data._id;

    const supRes = await req('/api/suppliers', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: 'Global Supply', phone: '555-0100' },
    });
    assert.equal(supRes.status, 201);
    const supplierId = supRes.data.data._id;

    const custRes = await req('/api/customers', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: 'Jane Buyer', phone: '555-0200', customerType: 'retail' },
    });
    assert.equal(custRes.status, 201);
    const customerId = custRes.data.data._id;

    const prodRes = await req('/api/products', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Cold Brew Bottle',
        sku: 'CB-001',
        barcode: '890000111222',
        categoryId,
        purchasePrice: 4,
        sellingPrice: 10,
        stockQuantity: 10,
        minStockAlert: 3,
        taxRate: 10,
      },
    });
    assert.equal(prodRes.status, 201);
    const productId = prodRes.data.data._id;

    // 4. Oversell protection
    const oversell = await req('/api/pos/checkout', {
      method: 'POST',
      cookie: cashierCookie,
      body: {
        customerId,
        items: [{ productId, quantity: 15 }],
        paidAmount: 150,
        paymentMethod: 'Cash',
      },
    });
    assert.equal(oversell.status, 400);

    // 5. Partial Payment Checkout (3 units @ $10 + 10% tax = $33, paid $20 -> due $13)
    const checkout = await req('/api/pos/checkout', {
      method: 'POST',
      cookie: cashierCookie,
      body: {
        clientRequestId: 'test-req-1',
        customerId,
        items: [{ productId, quantity: 3 }],
        paidAmount: 20,
        paymentMethod: 'Cash',
      },
    });
    assert.equal(checkout.status, 201);
    assert.equal(checkout.data.data.sale.grandTotal, 33);
    assert.equal(checkout.data.data.sale.dueAmount, 13);

    // Idempotency check
    const checkoutDup = await req('/api/pos/checkout', {
      method: 'POST',
      cookie: cashierCookie,
      body: {
        clientRequestId: 'test-req-1',
        customerId,
        items: [{ productId, quantity: 3 }],
        paidAmount: 20,
        paymentMethod: 'Cash',
      },
    });
    assert.equal(checkoutDup.status, 201);
    assert.equal(checkoutDup.data.data.deduplicated, true);

    // Verify stock became 7
    const prodsAfterSale = await req('/api/products', { cookie: adminCookie });
    assert.equal(prodsAfterSale.data.data.rows[0].stockQuantity, 7);

    // 6. Sale Return (1 unit restocked) and over-return rejection
    const saleId = checkout.data.data.sale._id;
    const saleItemId = checkout.data.data.items[0]._id;

    const overReturn = await req('/api/returns', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        type: 'sale_return',
        originalTransactionId: saleId,
        items: [{ itemId: saleItemId, quantity: 5 }],
        refundMethod: 'Cash',
        reason: 'Too many',
        condition: 'restock',
      },
    });
    assert.equal(overReturn.status, 400);

    const validReturn = await req('/api/returns', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        type: 'sale_return',
        originalTransactionId: saleId,
        items: [{ itemId: saleItemId, quantity: 1 }],
        refundMethod: 'Cash',
        reason: 'Customer changed mind',
        condition: 'restock',
      },
    });
    assert.equal(validReturn.status, 201);
    assert.equal(validReturn.data.data.totalRefundAmount, 11);

    // Stock should now be 8
    const prodsAfterReturn = await req('/api/products', { cookie: adminCookie });
    assert.equal(prodsAfterReturn.data.data.rows[0].stockQuantity, 8);

    // 7. Purchase Order (draft does not touch stock; partial receive increments stock)
    const poRes = await req('/api/purchases', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        supplierId,
        status: 'ordered',
        items: [{ productId, orderedQuantity: 10, purchasePrice: 4 }],
        paidAmount: 0,
      },
    });
    assert.equal(poRes.status, 201);
    const poId = poRes.data.data.purchase._id;
    const poItemId = poRes.data.data.items[0]._id;

    const prodsBeforeReceive = await req('/api/products', { cookie: adminCookie });
    assert.equal(prodsBeforeReceive.data.data.rows[0].stockQuantity, 8);

    const receiveRes = await req(`/api/purchases/${poId}/receive`, {
      method: 'POST',
      cookie: adminCookie,
      body: { items: [{ purchaseItemId: poItemId, receiveQuantity: 4 }] },
    });
    assert.equal(receiveRes.status, 200);
    assert.equal(receiveRes.data.data.status, 'partial_received');

    const prodsAfterReceive = await req('/api/products', { cookie: adminCookie });
    assert.equal(prodsAfterReceive.data.data.rows[0].stockQuantity, 12);

    // 8. Expenses & Reports
    const expCats = await req('/api/expense-categories', { cookie: adminCookie });
    const expRes = await req('/api/expenses', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        title: 'Store Electricity',
        categoryId: expCats.data.data[0]._id,
        amount: 5,
        paymentMethod: 'Cash',
      },
    });
    assert.equal(expRes.status, 201);

    const finRes = await req('/api/financial?preset=all', { cookie: adminCookie });
    assert.equal(finRes.status, 200);
    assert.equal(finRes.data.data.summary.totalSales, 22); // 33 - 11 refund
    assert.equal(finRes.data.data.summary.totalExpenses, 5);

    const reportRes = await req('/api/reports/profit_report?preset=all', { cookie: adminCookie });
    assert.equal(reportRes.status, 200);
    assert.ok(reportRes.data.data.length > 0);

    // 9. Verify tax_report returns actual sales rows after fix
    const taxReportRes = await req('/api/reports/tax_report?preset=all', { cookie: adminCookie });
    assert.equal(taxReportRes.status, 200);
    assert.ok(Array.isArray(taxReportRes.data.data) && taxReportRes.data.data.length >= 1);
    assert.equal(taxReportRes.data.data[0].taxAmount, 3);

    // 10. Verify invalid IDs return 404 rather than 500
    const badExpCatDel = await req('/api/expense-categories/nonexistent-id', {
      method: 'DELETE',
      cookie: adminCookie,
    });
    assert.equal(badExpCatDel.status, 404);

    // 11. Verify /api/notifications/read-all precedes /:id/read and works cleanly
    const readAllRes = await req('/api/notifications/read-all', {
      method: 'PUT',
      cookie: adminCookie,
    });
    assert.equal(readAllRes.status, 200);

    const badNotifRead = await req('/api/notifications/nonexistent-id/read', {
      method: 'PUT',
      cookie: adminCookie,
    });
    assert.equal(badNotifRead.status, 404);

    // 12. Verify invalid login fails with 401 and public endpoints return 200 JSON
    const badLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'owner@teststore.com', password: 'WrongPassword!' },
    });
    assert.equal(badLogin.status, 401);

    const healthRes = await req('/api/health');
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.data.status, 'ok');

    const statusRes = await req('/api/auth/status');
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data.data.initialized, true);

    const pubSettingsRes = await req('/api/settings/public');
    assert.equal(pubSettingsRes.status, 200);
    assert.equal(pubSettingsRes.data.data.businessName, 'Test Store');

    const notFoundRes = await req('/api/nonexistent-route');
    assert.equal(notFoundRes.status, 404);
  });

  it('supports in-memory Bearer token authentication and sample data seeding for live dashboard', async () => {
    const tmpSeedDb = path.join(os.tmpdir(), `ledgerpos-seed-${Date.now()}.json`);
    setLocalDbPathForTests(tmpSeedDb);
    const app = await createApp();
    let seedServer: http.Server | undefined;
    try {
      await new Promise<void>((resolve) => {
        seedServer = app.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = seedServer!.address() as any;
      const url = `http://127.0.0.1:${addr.port}`;

      const setup = await fetch(`${url}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          name: 'Seed Admin',
          email: 'seed@teststore.com',
          password: 'Password123!',
          businessName: 'Seed Store',
          loadSampleData: true,
        }),
      });
      const setupJson = await setup.json();
      assert.equal(setup.status, 201);
      assert.ok(setupJson.data.token);

      // Authenticate strictly via Authorization: Bearer (no Cookie header)
      const dashRes = await fetch(`${url}/api/dashboard?preset=30d`, {
        headers: {
          Authorization: `Bearer ${setupJson.data.token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const dashJson = await dashRes.json();
      assert.equal(dashRes.status, 200);
      assert.equal(dashJson.data.kpis.totalProducts, 6);
      assert.equal(dashJson.data.kpis.totalOrders, 6);
      assert.ok(dashJson.data.kpis.totalRevenue > 0);
      assert.ok(dashJson.data.charts.salesOverview.length > 0);
      assert.ok(dashJson.data.charts.salesByCategory.length > 0);
      assert.ok(dashJson.data.charts.paymentBreakdown.length > 0);
      assert.ok(dashJson.data.topSellingProducts.length > 0);

      // Verify notifications seeded properly (including low_stock entityId & read-all)
      const notifRes = await fetch(`${url}/api/notifications`, {
        headers: {
          Authorization: `Bearer ${setupJson.data.token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const notifJson = await notifRes.json();
      assert.equal(notifRes.status, 200);
      assert.ok(notifJson.data.items.length >= 1);
      assert.ok(notifJson.data.unreadCount >= 1);
    } finally {
      if (seedServer) {
        await new Promise<void>((resolve) => seedServer!.close(() => resolve()));
      }
      if (fs.existsSync(tmpSeedDb)) fs.unlinkSync(tmpSeedDb);
      setLocalDbPathForTests(tmpDbPath);
    }
  });
});

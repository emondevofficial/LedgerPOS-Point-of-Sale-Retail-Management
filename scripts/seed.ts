import { connectDatabase, db } from '../server/db/store';
import {
  ensureDefaultStoreEntities,
  ensureSystemRolesAndPermissions,
  seedOptionalDemoData,
} from '../server/services/seedService';
import { hashPassword } from '../server/utils/crypto';

async function runSeed() {
  const { mode } = await connectDatabase();
  console.log(`[Seed] Connected in ${mode} mode.`);

  const roles = await ensureSystemRolesAndPermissions();
  await ensureDefaultStoreEntities({
    businessName: 'LedgerPOS Flagship Store',
    currency: 'USD',
    currencySymbol: '$',
    email: 'admin@ledgerpos.local',
  });

  let admin = await db.users.findOne({ deletedAt: null });
  if (!admin) {
    const demoPass = process.env.SEED_ADMIN_PASSWORD;
    if (!demoPass) {
      console.error('[Seed] Set SEED_ADMIN_PASSWORD in your environment before running CLI seed on a fresh database.');
      process.exit(1);
    }
    admin = await db.users.create({
      name: 'Store Administrator',
      email: 'admin@ledgerpos.local',
      passwordHash: hashPassword(demoPass),
      roleId: roles.super_admin._id,
      roleName: roles.super_admin.name,
      roleSlug: roles.super_admin.slug,
      isActive: true,
    });
    console.log(`[Seed] Created Super Admin: ${admin.email}`);
  }

  const productCount = await db.products.count({ deletedAt: null });
  if (productCount === 0) {
    const res = await seedOptionalDemoData({
      _id: admin._id,
      name: admin.name,
      roleName: admin.roleName,
    });
    console.log(`[Seed] Inserted ${res.productsCreated} sample products, categories, brands, customer, and supplier.`);
  } else {
    console.log(`[Seed] Catalog already contains ${productCount} products. Skipping catalog seed.`);
  }

  process.exit(0);
}

runSeed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});

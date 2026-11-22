import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION_DEFINITIONS } from '../../shared/types';
import { db, exportFullDatabaseBackup } from '../db/store';
import { AuthenticatedRequest, requireAuth, requirePermission } from '../middleware/auth';
import { seedOptionalDemoData } from '../services/seedService';
import { logActivity } from '../utils/audit';
import { hashPassword } from '../utils/crypto';
import { RoleSchema, SettingsUpdateSchema, UserCreateSchema, UserUpdateSchema } from '../validation/schemas';

const router = Router();

// Publicly readable minimal store branding (no secrets) for login/header
router.get('/settings/public', async (_req, res, next) => {
  try {
    const s = await db.settings.findOne({});
    res.json({
      success: true,
      data: {
        businessName: s?.businessName || 'LedgerPOS Retail',
        logo: s?.logo || '/src/assets/images/store_brand_emblem_1795299495758.jpg',
        currencySymbol: s?.currencySymbol || '$',
        currency: s?.currency || 'USD',
        themeMode: s?.themeMode || 'light',
      },
    });
  } catch (err) {
    next(err);
  }
});

// Full store settings (authenticated users need POS/invoice config)
router.get('/settings', requireAuth, async (_req, res, next) => {
  try {
    const s = await db.settings.findOne({});
    res.json({ success: true, data: s });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', requireAuth, requirePermission('settings:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = SettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid settings' });
    }
    const existing = await db.settings.findOne({});
    let updated;
    if (existing) {
      updated = await db.settings.updateById(existing._id, { $set: parsed.data });
    } else {
      updated = await db.settings.create(parsed.data);
    }

    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'update',
      module: 'settings',
      targetId: updated?._id,
      description: 'Updated store and POS configuration settings',
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/settings/backup', requireAuth, requirePermission('settings:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const backup = await exportFullDatabaseBackup();
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'export_backup',
      module: 'settings',
      description: 'Exported full database JSON backup',
      ipAddress: req.ip,
    });
    res.json({ success: true, data: backup });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/seed-sample', requireAuth, requirePermission('settings:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await seedOptionalDemoData(req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Could not seed sample catalog' });
  }
});

// Permissions & Roles
router.get('/permissions', requireAuth, requirePermission('users:manage'), async (_req, res) => {
  res.json({ success: true, data: PERMISSION_DEFINITIONS });
});

router.get('/roles', requireAuth, requirePermission('users:manage'), async (_req, res, next) => {
  try {
    const roles = await db.roles.find({}, { sort: { createdAt: 1 } });
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
});

router.post('/roles', requireAuth, requirePermission('users:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = RoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid role data' });
    }
    const slug = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const created = await db.roles.create({
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      permissions: parsed.data.permissions,
      isSystem: false,
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'create',
      module: 'roles',
      targetId: created._id,
      description: `Created role "${created.name}"`,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'A role with this name already exists' });
    }
    next(err);
  }
});

router.put('/roles/:id', requireAuth, requirePermission('users:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const role = await db.roles.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
    if (role.slug === 'super_admin' && req.user!.roleSlug !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only Super Admin can modify Super Admin role' });
    }
    const parsed = RoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid role update' });
    }
    const updated = await db.roles.updateById(role._id, {
      $set: {
        name: role.isSystem ? role.name : parsed.data.name,
        description: parsed.data.description,
        permissions: parsed.data.permissions,
      },
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'update',
      module: 'roles',
      targetId: role._id,
      description: `Updated permissions for role "${role.name}"`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// Users CRUD
router.get('/users', requireAuth, requirePermission('users:manage'), async (_req, res, next) => {
  try {
    const users = await db.users.find({ deletedAt: null }, { sort: { createdAt: -1 } });
    const safeUsers = users.map(({ passwordHash: _p, resetTokenHash: _r, ...rest }) => rest);
    res.json({ success: true, data: safeUsers });
  } catch (err) {
    next(err);
  }
});

router.post('/users', requireAuth, requirePermission('users:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = UserCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid user data' });
    }
    const role = await db.roles.findById(parsed.data.roleId);
    if (!role) return res.status(400).json({ success: false, error: 'Selected role not found' });
    if (role.slug === 'super_admin' && req.user!.roleSlug !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only Super Admin can create Super Admin accounts' });
    }

    const created = await db.users.create({
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: hashPassword(parsed.data.password),
      roleId: role._id,
      roleName: role.name,
      roleSlug: role.slug,
      phone: parsed.data.phone,
      isActive: parsed.data.isActive,
    });

    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'create',
      module: 'users',
      targetId: created._id,
      description: `Created user ${created.email} with role ${role.name}`,
      ipAddress: req.ip,
    });

    const { passwordHash: _p, resetTokenHash: _r, ...safe } = created;
    res.status(201).json({ success: true, data: safe });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists' });
    }
    next(err);
  }
});

router.put('/users/:id', requireAuth, requirePermission('users:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const target = await db.users.findById(req.params.id);
    if (!target || target.deletedAt) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.roleSlug === 'super_admin' && req.user!.roleSlug !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Cannot modify Super Admin user' });
    }

    const parsed = UserUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid user update' });
    }

    const updateSet: Record<string, any> = {};
    if (parsed.data.name !== undefined) updateSet.name = parsed.data.name;
    if (parsed.data.email !== undefined) updateSet.email = parsed.data.email.toLowerCase();
    if (parsed.data.phone !== undefined) updateSet.phone = parsed.data.phone;
    if (parsed.data.isActive !== undefined) {
      if (target._id === req.user!._id && !parsed.data.isActive) {
        return res.status(400).json({ success: false, error: 'You cannot deactivate your own active session' });
      }
      updateSet.isActive = parsed.data.isActive;
    }
    if (parsed.data.roleId !== undefined) {
      const role = await db.roles.findById(parsed.data.roleId);
      if (!role) return res.status(400).json({ success: false, error: 'Selected role not found' });
      if (role.slug === 'super_admin' && req.user!.roleSlug !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Only Super Admin can assign Super Admin role' });
      }
      updateSet.roleId = role._id;
      updateSet.roleName = role.name;
      updateSet.roleSlug = role.slug;
    }

    const updated = await db.users.updateById(target._id, { $set: updateSet });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'update',
      module: 'users',
      targetId: target._id,
      description: `Updated user account ${target.email}`,
      ipAddress: req.ip,
    });

    const { passwordHash: _p, resetTokenHash: _r, ...safe } = updated!;
    res.json({ success: true, data: safe });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Email already in use' });
    }
    next(err);
  }
});

router.post('/users/:id/reset-password', requireAuth, requirePermission('users:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = z.object({ password: z.string().min(8).max(128) }).safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }
    const target = await db.users.findById(req.params.id);
    if (!target || target.deletedAt) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.roleSlug === 'super_admin' && req.user!.roleSlug !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Cannot reset Super Admin password' });
    }

    await db.users.updateById(target._id, { $set: { passwordHash: hashPassword(body.data.password) } });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'admin_reset_password',
      module: 'users',
      targetId: target._id,
      description: `Administrator reset password for ${target.email}`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'User password reset successfully' });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', requireAuth, requirePermission('users:manage'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const target = await db.users.findById(req.params.id);
    if (!target || target.deletedAt) return res.status(404).json({ success: false, error: 'User not found' });
    if (target._id === req.user!._id) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
    }
    if (target.roleSlug === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Super Admin account cannot be deleted' });
    }

    await db.users.updateById(target._id, {
      $set: { isActive: false, deletedAt: new Date().toISOString() },
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'delete',
      module: 'users',
      targetId: target._id,
      description: `Deleted user account ${target.email}`,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

// Activity Logs
router.get('/activity-logs', requireAuth, requirePermission('logs:view'), async (req, res, next) => {
  try {
    const { module: mod, userId, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    let logs = await db.activityLogs.find({}, { sort: { createdAt: -1 } });
    if (mod && mod !== 'all') logs = logs.filter((l) => l.module === mod);
    if (userId) logs = logs.filter((l) => String(l.userId) === userId);
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(
        (l) =>
          String(l.description || '').toLowerCase().includes(q) ||
          String(l.userName || '').toLowerCase().includes(q) ||
          String(l.action || '').toLowerCase().includes(q)
      );
    }
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const total = logs.length;
    const rows = logs.slice((p - 1) * l, p * l);
    res.json({ success: true, data: { rows, total, page: p, limit: l } });
  } catch (err) {
    next(err);
  }
});

// Notifications
router.get('/notifications', requireAuth, requirePermission('notifications:view'), async (_req, res, next) => {
  try {
    const items = await db.notifications.find({}, { sort: { createdAt: -1 }, limit: 100 });
    const unreadCount = items.filter((n) => !n.isRead).length;
    res.json({ success: true, data: { items, unreadCount } });
  } catch (err) {
    next(err);
  }
});

router.put('/notifications/read-all', requireAuth, requirePermission('notifications:view'), async (_req, res, next) => {
  try {
    await db.notifications.updateMany({ isRead: false }, { $set: { isRead: true } });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

router.put('/notifications/:id/read', requireAuth, requirePermission('notifications:view'), async (req, res, next) => {
  try {
    const updated = await db.notifications.updateById(req.params.id, { $set: { isRead: true } });
    if (!updated) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/notifications', requireAuth, requirePermission('notifications:manage'), async (_req, res, next) => {
  try {
    await db.notifications.deleteMany({});
    res.json({ success: true, message: 'Notifications cleared' });
  } catch (err) {
    next(err);
  }
});

export default router;

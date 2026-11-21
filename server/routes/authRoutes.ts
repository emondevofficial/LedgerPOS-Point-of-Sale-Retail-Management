import { Router } from 'express';
import { env } from '../config/env';
import { db, getDatabaseMode, withTransaction } from '../db/store';
import {
  AuthenticatedRequest,
  clearSessionCookie,
  loadAuthUserFromRequest,
  rateLimit,
  requireAuth,
  setSessionCookie,
} from '../middleware/auth';
import { ensureDefaultStoreEntities, ensureSystemRolesAndPermissions, seedOptionalDemoData } from '../services/seedService';
import { logActivity } from '../utils/audit';
import {
  generateResetToken,
  hashPassword,
  hashToken,
  signSessionToken,
  verifyPassword,
} from '../utils/crypto';
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  ProfileUpdateSchema,
  ResetPasswordSchema,
  SetupSchema,
} from '../validation/schemas';

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    const userCount = await db.users.count({ deletedAt: null });
    const { user } = await loadAuthUserFromRequest(req);
    const settings = await db.settings.findOne({});
    res.json({
      success: true,
      data: {
        initialized: userCount > 0,
        requiresBootstrapCode: Boolean(env.ADMIN_BOOTSTRAP_CODE),
        authenticated: Boolean(user),
        user,
        businessName: settings?.businessName || 'LedgerPOS',
        dbMode: getDatabaseMode(),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/setup', rateLimit('auth-setup', 10, 60_000), async (req, res, next) => {
  try {
    const parsed = SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid setup input' });
    }
    const input = parsed.data;

    if (env.ADMIN_BOOTSTRAP_CODE && input.bootstrapCode !== env.ADMIN_BOOTSTRAP_CODE) {
      return res.status(403).json({ success: false, error: 'Invalid admin bootstrap passcode' });
    }

    const result = await withTransaction(async (ctx) => {
      const existingUsers = await db.users.count({ deletedAt: null }, ctx);
      if (existingUsers > 0) {
        const err: any = new Error('System is already initialized. Please sign in.');
        err.status = 403;
        throw err;
      }

      const rolesMap = await ensureSystemRolesAndPermissions(ctx);
      const superRole = rolesMap.super_admin;

      await ensureDefaultStoreEntities(
        {
          businessName: input.businessName,
          currency: input.currency,
          currencySymbol: input.currencySymbol,
          email: input.email,
        },
        ctx
      );

      const user = await db.users.create(
        {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: hashPassword(input.password),
          roleId: superRole._id,
          roleName: superRole.name,
          roleSlug: superRole.slug,
          isActive: true,
          lastLoginAt: new Date().toISOString(),
        },
        ctx
      );

      await logActivity(
        {
          userId: user._id,
          userName: user.name,
          userRole: superRole.name,
          action: 'setup',
          module: 'auth',
          targetId: user._id,
          description: `Initial store setup completed for "${input.businessName}"`,
          ipAddress: req.ip,
        },
        ctx
      );

      return { user, role: superRole };
    });

    const token = signSessionToken(result.user._id);
    setSessionCookie(req, res, token);

    if (input.loadSampleData) {
      await seedOptionalDemoData({
        _id: result.user._id,
        name: result.user.name,
        roleName: result.role.name,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          _id: result.user._id,
          name: result.user.name,
          email: result.user.email,
          roleId: result.role._id,
          roleName: result.role.name,
          roleSlug: result.role.slug,
          permissions: result.role.permissions,
          isActive: true,
        },
      },
    });
  } catch (err: any) {
    if (err?.status === 403) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

router.post('/login', rateLimit('auth-login', 15, 60_000), async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Valid email and password are required' });
    }
    const { email, password } = parsed.data;
    const userDoc = await db.users.findOne({ email: email.toLowerCase(), deletedAt: null });

    if (!userDoc || !verifyPassword(password, String(userDoc.passwordHash))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!userDoc.isActive) {
      return res.status(403).json({ success: false, error: 'Your account has been deactivated. Contact an administrator.' });
    }

    const roleDoc = await db.roles.findById(String(userDoc.roleId));
    if (!roleDoc) {
      return res.status(403).json({ success: false, error: 'Assigned user role not found' });
    }

    await db.users.updateById(userDoc._id, { $set: { lastLoginAt: new Date().toISOString() } });

    const token = signSessionToken(userDoc._id);
    setSessionCookie(req, res, token);

    await logActivity({
      userId: userDoc._id,
      userName: userDoc.name,
      userRole: roleDoc.name,
      action: 'login',
      module: 'auth',
      targetId: userDoc._id,
      description: `User signed in (${userDoc.email})`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          _id: userDoc._id,
          name: userDoc.name,
          email: userDoc.email,
          phone: userDoc.phone || '',
          avatar: userDoc.avatar || '',
          roleId: roleDoc._id,
          roleName: roleDoc.name,
          roleSlug: roleDoc.slug,
          permissions: roleDoc.permissions || [],
          isActive: Boolean(userDoc.isActive),
          lastLoginAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { user } = await loadAuthUserFromRequest(req);
    clearSessionCookie(req, res);
    if (user) {
      await logActivity({
        userId: user._id,
        userName: user.name,
        userRole: user.roleName,
        action: 'logout',
        module: 'auth',
        targetId: user._id,
        description: `User signed out (${user.email})`,
        ipAddress: req.ip,
      });
    }
    res.json({ success: true, message: 'Signed out successfully' });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', rateLimit('auth-forgot', 8, 60_000), async (req, res, next) => {
  try {
    const parsed = ForgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    const userDoc = await db.users.findOne({ email: parsed.data.email.toLowerCase(), deletedAt: null });
    if (userDoc && userDoc.isActive) {
      const { raw, hash } = generateResetToken();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await db.users.updateById(userDoc._id, {
        $set: { resetTokenHash: hash, resetTokenExpiresAt: expiresAt },
      });

      if (env.NODE_ENV !== 'production') {
        console.log(`[AUTH] Password reset token generated for ${userDoc.email}: ${raw}`);
      }

      await logActivity({
        userId: userDoc._id,
        userName: userDoc.name,
        userRole: userDoc.roleName,
        action: 'forgot_password',
        module: 'auth',
        targetId: userDoc._id,
        description: `Password reset requested for ${userDoc.email}`,
        ipAddress: req.ip,
      });
    }

    res.json({
      success: true,
      message:
        'If an active account matches that email, a password reset token has been generated. Contact your store administrator or check server logs in local development.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', rateLimit('auth-reset', 10, 60_000), async (req, res, next) => {
  try {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid reset input' });
    }
    const tokenHash = hashToken(parsed.data.token);
    const userDoc = await db.users.findOne({ resetTokenHash: tokenHash, deletedAt: null });

    if (!userDoc || !userDoc.resetTokenExpiresAt || new Date(userDoc.resetTokenExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    await db.users.updateById(userDoc._id, {
      $set: {
        passwordHash: hashPassword(parsed.data.password),
        resetTokenHash: '',
        resetTokenExpiresAt: null,
      },
    });

    await logActivity({
      userId: userDoc._id,
      userName: userDoc.name,
      userRole: userDoc.roleName,
      action: 'reset_password',
      module: 'auth',
      targetId: userDoc._id,
      description: `Password reset completed for ${userDoc.email}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Password updated successfully. You may now sign in.' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: req.user });
});

router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = ProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid profile data' });
    }
    const updated = await db.users.updateById(req.user!._id, {
      $set: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        avatar: parsed.data.avatar,
      },
    });
    await logActivity({
      userId: req.user!._id,
      userName: parsed.data.name,
      userRole: req.user!.roleName,
      action: 'update_profile',
      module: 'auth',
      targetId: req.user!._id,
      description: 'Updated user profile details',
      ipAddress: req.ip,
    });
    res.json({ success: true, data: { ...req.user, name: updated?.name, phone: updated?.phone, avatar: updated?.avatar } });
  } catch (err) {
    next(err);
  }
});

router.put('/change-password', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid password input' });
    }
    const userDoc = await db.users.findById(req.user!._id);
    if (!userDoc || !verifyPassword(parsed.data.currentPassword, String(userDoc.passwordHash))) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }
    await db.users.updateById(userDoc._id, {
      $set: { passwordHash: hashPassword(parsed.data.newPassword) },
    });
    await logActivity({
      userId: req.user!._id,
      userName: req.user!.name,
      userRole: req.user!.roleName,
      action: 'change_password',
      module: 'auth',
      targetId: req.user!._id,
      description: 'Changed own account password',
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;

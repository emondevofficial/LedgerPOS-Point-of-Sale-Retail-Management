import { NextFunction, Request, Response } from 'express';
import { AuthUser } from '../../shared/types';
import { db } from '../db/store';
import { verifySessionToken } from '../utils/crypto';

export const SESSION_COOKIE_NAME = 'ledgerpos_session';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

function isSecureContext(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return req.secure || proto === 'https';
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  const https = isSecureContext(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${60 * 60 * 24 * 7}`,
  ];
  if (https) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response) {
  const https = isSecureContext(req);
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (https) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function loadAuthUserFromRequest(req: Request): Promise<{ user: AuthUser | null; viaCookie: boolean }> {
  let token = '';
  let viaCookie = false;

  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    token = String(req.cookies[SESSION_COOKIE_NAME]);
    viaCookie = true;
  }

  if (!token) return { user: null, viaCookie: false };

  const payload = verifySessionToken(token);
  if (!payload) return { user: null, viaCookie };

  const userDoc = await db.users.findById(payload.uid);
  if (!userDoc || userDoc.deletedAt || !userDoc.isActive) {
    return { user: null, viaCookie };
  }

  const roleDoc = await db.roles.findById(String(userDoc.roleId));
  if (!roleDoc) return { user: null, viaCookie };

  return {
    viaCookie,
    user: {
      _id: userDoc._id,
      name: userDoc.name,
      email: userDoc.email,
      phone: userDoc.phone || '',
      avatar: userDoc.avatar || '',
      roleId: String(userDoc.roleId),
      roleName: roleDoc.name,
      roleSlug: roleDoc.slug,
      permissions: Array.isArray(roleDoc.permissions) ? roleDoc.permissions : [],
      isActive: Boolean(userDoc.isActive),
      lastLoginAt: userDoc.lastLoginAt,
    },
  };
}

function verifyMutationOrigin(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return true;
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { user, viaCookie } = await loadAuthUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (viaCookie && !verifyMutationOrigin(req)) {
      return res.status(403).json({ success: false, error: 'CSRF validation failed' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(...required: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (user.roleSlug === 'super_admin') {
      return next();
    }
    const hasAny = required.some((perm) => user.permissions.includes(perm));
    if (!hasAny) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Missing required permission: ${required.join(' or ')}`,
      });
    }
    next();
  };
}

const rateBuckets = new Map<string, number[]>();

export function rateLimit(scope: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
    const key = `${scope}:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (rateBuckets.get(key) || []).filter((ts) => ts > cutoff);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

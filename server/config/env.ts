import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const runtimeSessionSecret = crypto.randomBytes(32).toString('hex');
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const nodeEnv = process.env.NODE_ENV || (isVercel ? 'production' : 'development');
const explicitSessionSecret = (process.env.SESSION_SECRET || '').trim();

if ((isVercel || nodeEnv === 'production') && !explicitSessionSecret) {
  console.warn(
    '[Auth] WARNING: SESSION_SECRET environment variable is not set in production. Sessions will invalidate across server restarts or serverless instances.'
  );
}

export const env = {
  NODE_ENV: nodeEnv,
  IS_VERCEL: isVercel,
  PORT: Number(process.env.PORT || 3000),
  APP_URL: (process.env.APP_URL || '').trim() || 'http://localhost:3000',
  CORS_ORIGIN: (process.env.CORS_ORIGIN || '').trim(),
  MONGODB_URI: (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim(),
  SESSION_SECRET: explicitSessionSecret || runtimeSessionSecret,
  HAS_EXPLICIT_SESSION_SECRET: Boolean(explicitSessionSecret),
  ADMIN_BOOTSTRAP_CODE: (process.env.ADMIN_BOOTSTRAP_CODE || '').trim(),
};


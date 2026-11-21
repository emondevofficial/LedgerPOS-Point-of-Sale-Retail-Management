import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const runtimeSessionSecret = crypto.randomBytes(32).toString('hex');

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  MONGODB_URI: (process.env.MONGODB_URI || '').trim(),
  SESSION_SECRET: (process.env.SESSION_SECRET || '').trim() || runtimeSessionSecret,
  ADMIN_BOOTSTRAP_CODE: (process.env.ADMIN_BOOTSTRAP_CODE || '').trim(),
};

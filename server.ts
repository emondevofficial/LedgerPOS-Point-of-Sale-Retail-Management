import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { env } from './server/config/env';
import { connectDatabase } from './server/db/store';
import adminRoutes from './server/routes/adminRoutes';
import authRoutes from './server/routes/authRoutes';
import catalogRoutes from './server/routes/catalogRoutes';
import crmRoutes from './server/routes/crmRoutes';
import transactionRoutes from './server/routes/transactionRoutes';

export async function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', crmRoutes);
  app.use('/api', transactionRoutes);

  // API 404 fallback
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  });

  // Safe error handler (never leak stack traces or secrets in production)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err?.message || err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message =
      status < 500
        ? err?.message || 'Request error'
        : env.NODE_ENV === 'production'
        ? 'An internal server error occurred'
        : err?.message || 'Internal server error';
    res.status(status).json({ success: false, error: message });
  });

  return app;
}

async function startServer() {
  await connectDatabase();
  const app = await createApp();

  if (env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[Server] LedgerPOS listening on http://0.0.0.0:${env.PORT}`);
  });
}

// Start server only when executed directly (allows unit/integration tests to import createApp)
const isDirectRun =
  process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('[Fatal] Server startup failed:', err);
    process.exit(1);
  });
}

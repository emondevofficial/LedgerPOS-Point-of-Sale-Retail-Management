import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server';

let cachedAppPromise: Promise<any> | null = null;

async function getApp() {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp().catch((err) => {
      cachedAppPromise = null;
      throw err;
    });
  }
  return cachedAppPromise;
}

export default async function handler(req: IncomingMessage & { body?: any; readableEnded?: boolean; _body?: boolean }, res: ServerResponse) {
  try {
    // Vercel Node runtime may pre-parse JSON bodies before invoking the handler.
    // Marking _body prevents express.json() from re-reading an already-ended stream.
    if (req.readableEnded && req.body !== undefined && !req._body) {
      req._body = true;
    }

    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler Error]', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = typeof err?.status === 'number' ? err.status : 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          error: err?.status === 503 ? err.message : 'Server initialization failed',
        })
      );
    }
  }
}

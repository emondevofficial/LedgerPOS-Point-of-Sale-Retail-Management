import crypto from 'crypto';
import { DbContext, db } from '../db/store';

type SequenceTarget = 'sales' | 'purchases' | 'payments' | 'returns';

export async function generateDocumentNumber(
  prefix: string,
  target: SequenceTarget,
  field: string,
  ctx?: DbContext
): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const datePart = `${y}${m}${d}`;
  const cleanPrefix = (prefix || 'DOC').replace(/[^A-Z0-9-]/gi, '').toUpperCase() || 'DOC';
  const base = `${cleanPrefix}-${datePart}-`;

  const existing = await db[target].find(
    { [field]: { $regex: `^${base}` } },
    { sort: { [field]: -1 }, limit: 1 },
    ctx
  );

  let nextSeq = 1;
  if (existing.length > 0) {
    const lastVal = String(existing[0][field] || '');
    const tail = lastVal.slice(base.length).split('-')[0];
    const parsed = parseInt(tail, 10);
    if (!Number.isNaN(parsed) && parsed >= 1) {
      nextSeq = parsed + 1;
    }
  }

  const candidate = `${base}${String(nextSeq).padStart(4, '0')}`;
  const collision = await db[target].findOne({ [field]: candidate }, ctx);
  if (!collision) return candidate;

  return `${base}${String(nextSeq).padStart(4, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

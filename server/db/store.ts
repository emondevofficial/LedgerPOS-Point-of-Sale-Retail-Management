import crypto from 'crypto';
import fs from 'fs';
import mongoose, { ClientSession } from 'mongoose';
import path from 'path';
import { env } from '../config/env';
import { CollectionName, Models } from './models';

export interface QueryOptions {
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
}

export interface DbContext {
  session?: ClientSession | null;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'ledgerpos-db.json');

type LocalStoreData = Record<CollectionName, Record<string, any>[]>;

function emptyLocalStore(): LocalStoreData {
  return {
    User: [],
    Role: [],
    Permission: [],
    Category: [],
    Brand: [],
    Product: [],
    Customer: [],
    Supplier: [],
    Sale: [],
    SaleItem: [],
    Purchase: [],
    PurchaseItem: [],
    Payment: [],
    Return: [],
    ExpenseCategory: [],
    Expense: [],
    StockMovement: [],
    Notification: [],
    ActivityLog: [],
    StoreSettings: [],
    HeldCart: [],
  };
}

let useMongo = false;
let lastDbError: string | null = null;
let localStore: LocalStoreData = emptyLocalStore();
let localWriteLock: Promise<void> = Promise.resolve();
let activeLocalSnapshot: LocalStoreData | null = null;
let customDbFilePath: string | null = null;
let localInitializedForPath: string | null = null;

type GlobalMongoCache = {
  promise: Promise<'mongodb' | 'local'> | null;
};

const globalForMongo = globalThis as typeof globalThis & { __ledgerPosMongoCache?: GlobalMongoCache };
if (!globalForMongo.__ledgerPosMongoCache) {
  globalForMongo.__ledgerPosMongoCache = { promise: null };
}
const mongoCache = globalForMongo.__ledgerPosMongoCache;

export function setLocalDbPathForTests(filePath: string | null) {
  customDbFilePath = filePath;
  localInitializedForPath = null;
  localStore = emptyLocalStore();
  if (filePath && fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    localStore = { ...emptyLocalStore(), ...JSON.parse(raw) };
    localInitializedForPath = filePath;
  }
}

function getDbFilePath() {
  return customDbFilePath || LOCAL_DB_FILE;
}

function loadLocalStore() {
  const filePath = getDbFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      localStore = { ...emptyLocalStore(), ...parsed };
    } catch {
      localStore = emptyLocalStore();
    }
  } else {
    localStore = emptyLocalStore();
    persistLocalStoreSync();
  }
}

function persistLocalStoreSync() {
  const filePath = getDbFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(localStore, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

mongoose.set('bufferCommands', false);

export async function connectDatabase(): Promise<{ mode: 'mongodb' | 'local' }> {
  if (env.MONGODB_URI) {
    if (mongoose.connection.readyState === 1) {
      useMongo = true;
      lastDbError = null;
      return { mode: 'mongodb' };
    }

    if (!mongoCache.promise) {
      mongoCache.promise = mongoose
        .connect(env.MONGODB_URI, {
          serverSelectionTimeoutMS: 8000,
          maxPoolSize: env.IS_VERCEL ? 5 : 10,
        })
        .then(() => {
          useMongo = true;
          lastDbError = null;
          console.log('[DB] Connected to MongoDB via Mongoose');
          return 'mongodb' as const;
        })
        .catch((error: any) => {
          mongoCache.promise = null;
          const msg = error?.message || 'MongoDB connection failed';
          lastDbError = msg;
          throw error;
        });
    }

    try {
      const mode = await mongoCache.promise;
      return { mode };
    } catch (error: any) {
      if (env.IS_VERCEL) {
        console.error('[DB] MongoDB connection failed in Vercel environment:', error?.message || error);
        const dbErr: any = new Error(
          'Unable to connect to the production MongoDB database. Please verify MONGODB_URI and Atlas network access settings.'
        );
        dbErr.status = 503;
        throw dbErr;
      }
      console.warn('[DB] Failed to connect to MongoDB — falling back to local store:', error?.message || error);
    }
  } else if (env.IS_VERCEL) {
    lastDbError = 'MONGODB_URI environment variable is not configured';
    const dbErr: any = new Error(
      'Production database is not configured. Please set the MONGODB_URI environment variable in Vercel.'
    );
    dbErr.status = 503;
    throw dbErr;
  }

  useMongo = false;
  lastDbError = null;
  const targetPath = getDbFilePath();
  if (localInitializedForPath !== targetPath) {
    loadLocalStore();
    localInitializedForPath = targetPath;
    console.log(`[DB] Using persistent local store at ${targetPath}`);
  }
  return { mode: 'local' };
}

export function getDatabaseMode(): 'mongodb' | 'local' {
  return useMongo ? 'mongodb' : 'local';
}

export function getDatabaseStatus() {
  return {
    mode: getDatabaseMode(),
    connected: useMongo ? mongoose.connection.readyState === 1 : !env.IS_VERCEL,
    hasMongoUri: Boolean(env.MONGODB_URI),
    error: lastDbError,
  };
}

export function generateId(): string {
  return new mongoose.Types.ObjectId().toHexString();
}

function normalizeValue(v: any): any {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  return v;
}

function matchesFilter(doc: Record<string, any>, filter: Record<string, any>): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(condition)) {
      if (!condition.some((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    if (key === '$and' && Array.isArray(condition)) {
      if (!condition.every((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }

    const docVal = doc[key];

    if (condition === null) {
      if (docVal !== null && docVal !== undefined) return false;
      continue;
    }

    if (condition instanceof RegExp) {
      if (!condition.test(String(docVal ?? ''))) return false;
      continue;
    }

    if (typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
      const ops = condition as Record<string, any>;
      if ('$regex' in ops) {
        const flags = ops.$options || '';
        const rx = ops.$regex instanceof RegExp ? ops.$regex : new RegExp(ops.$regex, flags);
        if (!rx.test(String(docVal ?? ''))) return false;
      }
      if ('$in' in ops && Array.isArray(ops.$in)) {
        const normDoc = String(normalizeValue(docVal));
        if (!ops.$in.some((item: any) => String(normalizeValue(item)) === normDoc)) return false;
      }
      if ('$nin' in ops && Array.isArray(ops.$nin)) {
        const normDoc = String(normalizeValue(docVal));
        if (ops.$nin.some((item: any) => String(normalizeValue(item)) === normDoc)) return false;
      }
      if ('$ne' in ops) {
        if (ops.$ne === null) {
          if (docVal === null || docVal === undefined) return false;
        } else if (String(normalizeValue(docVal)) === String(normalizeValue(ops.$ne))) {
          return false;
        }
      }
      if ('$gt' in ops) {
        const a = normalizeValue(docVal);
        const b = normalizeValue(ops.$gt);
        if (a === undefined || a === null || !(a > b)) return false;
      }
      if ('$gte' in ops) {
        const a = docVal instanceof Date || (typeof docVal === 'string' && !isNaN(Date.parse(docVal)) && ops.$gte instanceof Date)
          ? new Date(docVal).getTime()
          : normalizeValue(docVal);
        const b = normalizeValue(ops.$gte);
        if (a === undefined || a === null || !(a >= b)) return false;
      }
      if ('$lt' in ops) {
        const a = normalizeValue(docVal);
        const b = normalizeValue(ops.$lt);
        if (a === undefined || a === null || !(a < b)) return false;
      }
      if ('$lte' in ops) {
        const a = docVal instanceof Date || (typeof docVal === 'string' && !isNaN(Date.parse(docVal)) && ops.$lte instanceof Date)
          ? new Date(docVal).getTime()
          : normalizeValue(docVal);
        const b = normalizeValue(ops.$lte);
        if (a === undefined || a === null || !(a <= b)) return false;
      }
      if ('$exists' in ops) {
        const exists = docVal !== undefined && docVal !== null;
        if (Boolean(ops.$exists) !== exists) return false;
      }
      continue;
    }

    if (String(normalizeValue(docVal)) !== String(normalizeValue(condition))) {
      return false;
    }
  }
  return true;
}

function serializeDoc(doc: any): any {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (obj._id) obj._id = String(obj._id);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && val._bsontype === 'ObjectId') {
      obj[key] = String(val);
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

function applyLocalUpdate(target: Record<string, any>, update: Record<string, any>) {
  const hasOperator = Object.keys(update).some((k) => k.startsWith('$'));
  if (!hasOperator) {
    Object.assign(target, JSON.parse(JSON.stringify(update)));
  } else {
    if (update.$set) {
      Object.assign(target, JSON.parse(JSON.stringify(update.$set)));
    }
    if (update.$inc) {
      for (const [field, amount] of Object.entries(update.$inc)) {
        target[field] = Number(target[field] || 0) + Number(amount);
      }
    }
    if (update.$unset) {
      for (const field of Object.keys(update.$unset)) {
        delete target[field];
      }
    }
  }
  target.updatedAt = new Date().toISOString();
}

const UNIQUE_CONSTRAINTS: Partial<Record<CollectionName, string[]>> = {
  User: ['email'],
  Role: ['name', 'slug'],
  Permission: ['key'],
  Product: ['sku', 'barcode'],
  Sale: ['invoiceNumber', 'clientRequestId'],
  Purchase: ['purchaseNumber'],
  Payment: ['referenceNumber'],
  Return: ['returnNumber'],
};

function checkUniqueLocal(col: CollectionName, doc: Record<string, any>, ignoreId?: string) {
  const fields = UNIQUE_CONSTRAINTS[col];
  if (!fields) return;
  for (const field of fields) {
    const val = doc[field];
    if (val === undefined || val === null || val === '') continue;
    const conflict = localStore[col].find(
      (existing) => existing._id !== ignoreId && String(existing[field]).toLowerCase() === String(val).toLowerCase()
    );
    if (conflict) {
      const err: any = new Error(`Duplicate value for unique field "${field}"`);
      err.code = 11000;
      throw err;
    }
  }
}

export class Repository<T extends Record<string, any> = Record<string, any>> {
  constructor(private readonly name: CollectionName) {}

  async find(filter: Record<string, any> = {}, options: QueryOptions = {}, ctx?: DbContext): Promise<T[]> {
    if (useMongo) {
      let query = Models[this.name].find(filter, null, ctx?.session ? { session: ctx.session } : undefined);
      if (options.sort) query = query.sort(options.sort);
      if (options.skip) query = query.skip(options.skip);
      if (options.limit) query = query.limit(options.limit);
      const docs = await query.lean().exec();
      return docs.map(serializeDoc);
    }

    let results = localStore[this.name].filter((doc) => matchesFilter(doc, filter));
    if (options.sort) {
      const sortEntries = Object.entries(options.sort);
      results = [...results].sort((a, b) => {
        for (const [field, dir] of sortEntries) {
          const av = a[field];
          const bv = b[field];
          if (av === bv) continue;
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          return av > bv ? dir : -dir;
        }
        return 0;
      });
    }
    if (options.skip) results = results.slice(options.skip);
    if (options.limit) results = results.slice(0, options.limit);
    return results.map((d) => JSON.parse(JSON.stringify(d)));
  }

  async findOne(filter: Record<string, any>, ctx?: DbContext): Promise<T | null> {
    if (useMongo) {
      const doc = await Models[this.name]
        .findOne(filter, null, ctx?.session ? { session: ctx.session } : undefined)
        .lean()
        .exec();
      return serializeDoc(doc);
    }
    const found = localStore[this.name].find((doc) => matchesFilter(doc, filter));
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async findById(id: string, ctx?: DbContext): Promise<T | null> {
    if (!id) return null;
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const doc = await Models[this.name]
        .findById(id, null, ctx?.session ? { session: ctx.session } : undefined)
        .lean()
        .exec();
      return serializeDoc(doc);
    }
    const found = localStore[this.name].find((doc) => doc._id === String(id));
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async count(filter: Record<string, any> = {}, ctx?: DbContext): Promise<number> {
    if (useMongo) {
      return Models[this.name]
        .countDocuments(filter, ctx?.session ? { session: ctx.session } : undefined)
        .exec();
    }
    return localStore[this.name].filter((doc) => matchesFilter(doc, filter)).length;
  }

  async create(data: Partial<T>, ctx?: DbContext): Promise<T> {
    if (useMongo) {
      const created = await Models[this.name].create([data], ctx?.session ? { session: ctx.session } : undefined);
      return serializeDoc(created[0]);
    }
    const now = new Date().toISOString();
    const doc: Record<string, any> = {
      ...JSON.parse(JSON.stringify(data)),
      _id: (data as any)._id ? String((data as any)._id) : generateId(),
      createdAt: (data as any).createdAt || now,
      updatedAt: now,
    };
    checkUniqueLocal(this.name, doc);
    localStore[this.name].push(doc);
    if (!activeLocalSnapshot) persistLocalStoreSync();
    return JSON.parse(JSON.stringify(doc));
  }

  async insertMany(items: Partial<T>[], ctx?: DbContext): Promise<T[]> {
    if (items.length === 0) return [];
    if (useMongo) {
      const created = ctx?.session
        ? await Models[this.name].insertMany(items, { session: ctx.session })
        : await Models[this.name].insertMany(items);
      return (Array.isArray(created) ? created : []).map(serializeDoc);
    }
    const out: T[] = [];
    for (const item of items) {
      out.push(await this.create(item, ctx));
    }
    return out;
  }

  async updateById(id: string, update: Record<string, any>, ctx?: DbContext): Promise<T | null> {
    if (!id) return null;
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const doc = await Models[this.name]
        .findByIdAndUpdate(id, update, { new: true, runValidators: true, session: ctx?.session || undefined })
        .lean()
        .exec();
      return serializeDoc(doc);
    }
    const idx = localStore[this.name].findIndex((d) => d._id === String(id));
    if (idx === -1) return null;
    const copy = JSON.parse(JSON.stringify(localStore[this.name][idx]));
    applyLocalUpdate(copy, update);
    checkUniqueLocal(this.name, copy, String(id));
    localStore[this.name][idx] = copy;
    if (!activeLocalSnapshot) persistLocalStoreSync();
    return JSON.parse(JSON.stringify(copy));
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>, ctx?: DbContext): Promise<number> {
    if (useMongo) {
      const res = await Models[this.name]
        .updateMany(filter, update, ctx?.session ? { session: ctx.session } : undefined)
        .exec();
      return res.modifiedCount || 0;
    }
    let count = 0;
    for (let i = 0; i < localStore[this.name].length; i++) {
      if (matchesFilter(localStore[this.name][i], filter)) {
        applyLocalUpdate(localStore[this.name][i], update);
        count++;
      }
    }
    if (count > 0 && !activeLocalSnapshot) persistLocalStoreSync();
    return count;
  }

  async deleteById(id: string, ctx?: DbContext): Promise<boolean> {
    if (!id) return false;
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(id)) return false;
      const res = await Models[this.name]
        .findByIdAndDelete(id, ctx?.session ? { session: ctx.session } : undefined)
        .exec();
      return Boolean(res);
    }
    const before = localStore[this.name].length;
    localStore[this.name] = localStore[this.name].filter((d) => d._id !== String(id));
    const deleted = localStore[this.name].length < before;
    if (deleted && !activeLocalSnapshot) persistLocalStoreSync();
    return deleted;
  }

  async deleteMany(filter: Record<string, any>, ctx?: DbContext): Promise<number> {
    if (useMongo) {
      const res = await Models[this.name]
        .deleteMany(filter, ctx?.session ? { session: ctx.session } : undefined)
        .exec();
      return res.deletedCount || 0;
    }
    const before = localStore[this.name].length;
    localStore[this.name] = localStore[this.name].filter((d) => !matchesFilter(d, filter));
    const count = before - localStore[this.name].length;
    if (count > 0 && !activeLocalSnapshot) persistLocalStoreSync();
    return count;
  }
}

export const db = {
  users: new Repository('User'),
  roles: new Repository('Role'),
  permissions: new Repository('Permission'),
  categories: new Repository('Category'),
  brands: new Repository('Brand'),
  products: new Repository('Product'),
  customers: new Repository('Customer'),
  suppliers: new Repository('Supplier'),
  sales: new Repository('Sale'),
  saleItems: new Repository('SaleItem'),
  purchases: new Repository('Purchase'),
  purchaseItems: new Repository('PurchaseItem'),
  payments: new Repository('Payment'),
  returns: new Repository('Return'),
  expenseCategories: new Repository('ExpenseCategory'),
  expenses: new Repository('Expense'),
  stockMovements: new Repository('StockMovement'),
  notifications: new Repository('Notification'),
  activityLogs: new Repository('ActivityLog'),
  settings: new Repository('StoreSettings'),
  heldCarts: new Repository('HeldCart'),
};

export async function withTransaction<R>(fn: (ctx: DbContext) => Promise<R>): Promise<R> {
  if (useMongo) {
    const session = await mongoose.startSession();
    try {
      let result!: R;
      try {
        await session.withTransaction(async () => {
          result = await fn({ session });
        });
        return result;
      } catch (err: any) {
        // Standalone MongoDB servers don't support multi-document transactions (code 20)
        if (err?.code === 20 || String(err?.message || '').includes('Transaction numbers are only allowed')) {
          return await fn({ session: null });
        }
        throw err;
      }
    } finally {
      await session.endSession();
    }
  }

  let release!: () => void;
  const prevLock = localWriteLock;
  localWriteLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prevLock;

  activeLocalSnapshot = JSON.parse(JSON.stringify(localStore));
  try {
    const result = await fn({ session: null });
    persistLocalStoreSync();
    activeLocalSnapshot = null;
    return result;
  } catch (err) {
    if (activeLocalSnapshot) {
      localStore = activeLocalSnapshot;
      activeLocalSnapshot = null;
    }
    throw err;
  } finally {
    release();
  }
}

export async function exportFullDatabaseBackup(): Promise<Record<string, any>> {
  const backup: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    mode: getDatabaseMode(),
    collections: {},
  };
  const keys = Object.keys(Models) as CollectionName[];
  for (const key of keys) {
    const repo = new Repository(key);
    const docs = await repo.find({});
    if (key === 'User') {
      backup.collections[key] = docs.map(({ passwordHash: _p, resetTokenHash: _r, ...safe }) => safe);
    } else {
      backup.collections[key] = docs;
    }
  }
  return backup;
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let inMemorySessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  inMemorySessionToken = token || null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const API_BASE = ((import.meta as any)?.env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || !API_BASE) return url;
  return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (inMemorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  let res: Response;
  try {
    res = await fetch(resolveApiUrl(url), {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your connection and try again.', 408);
    }
    throw new ApiError('Unable to reach the server. Please verify your network connection.', 0);
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      if (res.status === 404) {
        throw new ApiError('API endpoint not found (404). Please verify backend deployment configuration.', 404);
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new ApiError('Server or database is temporarily unavailable. Please try again in a moment.', res.status);
      }
      throw new ApiError(`Request failed (${res.status})`, res.status);
    }
    return (await res.text()) as unknown as T;
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Invalid JSON response from server (${res.status})`, res.status);
  }

  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.error || `Request failed (${res.status})`, res.status);
  }
  return json.data as T;
}

export function formatMoney(amount: number | string | undefined, symbol = '$'): string {
  const num = Number(amount || 0);
  const abs = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-${symbol}${abs}` : `${symbol}${abs}`;
}

export function formatDateTime(value: string | Date | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | Date | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (val: any) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

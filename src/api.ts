export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status: number;
  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = 'ApiError';
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { credentials: 'include', ...options, headers });
  const payload = await response.json().catch(() => ({ ok: false, error: { code: 'INVALID_RESPONSE', message: 'Sunucu yanıtı okunamadı.' } }));
  if (!response.ok || payload?.ok === false) throw new ApiError(response.status, payload?.error || { code: 'HTTP_ERROR', message: 'İşlem başarısız.' });
  return payload as T;
}

export function post<T = any>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== '') out.set(key, String(value));
  const s = out.toString();
  return s ? `?${s}` : '';
}

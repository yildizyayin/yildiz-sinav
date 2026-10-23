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

/** A readable Turkish error for any failed response, whatever shape the server sent. */
export function errorFromResponse(status: number, payload: any): ApiErrorShape {
  const e = payload?.error;
  if (e && typeof e === 'object' && typeof e.message === 'string' && e.message.trim()) return { code: String(e.code || 'HTTP_ERROR'), message: e.message, details: e.details };
  if (typeof e === 'string' && e.trim()) return { code: 'HTTP_ERROR', message: e };
  if (typeof payload?.message === 'string' && payload.message.trim()) return { code: String(payload.code || 'HTTP_ERROR'), message: payload.message };
  if (status === 401) return { code: 'UNAUTHENTICATED', message: 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.' };
  if (status === 403) return { code: 'FORBIDDEN', message: 'Bu işlem için yetkiniz yok.' };
  if (status === 404) return { code: 'NOT_FOUND', message: 'İstenen kayıt bulunamadı.' };
  if (status === 413) return { code: 'PAYLOAD_TOO_LARGE', message: 'Dosya çok büyük. Daha küçük bir dosya seçin.' };
  if (status === 429) return { code: 'RATE_LIMITED', message: 'Çok sık deneme yapıldı. Biraz bekleyip tekrar deneyin.' };
  if (status >= 500) return { code: 'SERVER_UNAVAILABLE', message: `Sunucu şu anda yanıt veremedi (${status}). İşlem tamamlanmadı; birkaç saniye sonra tekrar deneyin.` };
  return { code: 'HTTP_ERROR', message: `İşlem tamamlanamadı (${status}).` };
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const release = markBusy(options.method);
  try {
    let response: Response;
    try { response = await fetch(path, { credentials: 'include', ...options, headers }); }
    catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.' });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false || payload === null) {
      if (response.ok && payload === null) throw new ApiError(response.status, { code: 'INVALID_RESPONSE', message: 'Sunucu yanıtı okunamadı. Sayfayı yenileyip tekrar deneyin.' });
      throw new ApiError(response.status, errorFromResponse(response.status, payload));
    }
    return payload as T;
  } finally { release(); }
}

/**
 * Press feedback: while a change (POST/PUT/PATCH/DELETE) started from a button is in flight, that button shows a
 * busy state and ignores further clicks, so a slow request is visible and is never sent twice by a double click.
 */
let lastPress: { button: HTMLButtonElement; at: number } | null = null;
if (typeof document !== 'undefined') document.addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement | null)?.closest?.('button') as HTMLButtonElement | null;
  lastPress = b ? { button: b, at: Date.now() } : null;
}, true);

export function markBusy(method?: string): () => void {
  if (typeof document === 'undefined' || !method || method.toUpperCase() === 'GET') return () => {};
  // Safari does not focus a clicked button, so the last pressed button (within a moment) is used as well.
  const el = document.activeElement as HTMLElement | null;
  const focused = el && (el.tagName === 'BUTTON' ? el : el.closest?.('button')) as HTMLButtonElement | null;
  const button = focused || (lastPress && Date.now() - lastPress.at < 1500 ? lastPress.button : null);
  if (!button || button.dataset.busy === 'true') return () => {};
  button.dataset.busy = 'true'; button.setAttribute('aria-busy', 'true');
  return () => { delete button.dataset.busy; button.removeAttribute('aria-busy'); };
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

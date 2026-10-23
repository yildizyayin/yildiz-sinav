/**
 * One readable error for every unexpected failure: a JSON body the app can show, never a bare Cloudflare error
 * page. Known causes get a precise Turkish message; anything else gets a short reference id that is also logged,
 * so a reported problem can be found in the logs without exposing internals.
 */
import { json } from './db';

export function classifyServerError(error: unknown): { status: number; code: string; message: string } {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (/free tier daily row (read|write) limit|exceeded D1's .*limit/i.test(text)) return { status: 503, code: 'SERVICE_DAILY_LIMIT', message: 'Sistem günlük veri işlem sınırına ulaştı. İşleminiz kaydedilmedi; lütfen daha sonra tekrar deneyin.' };
  if (/SQLITE_BUSY|database is locked|D1_ERROR: .*(overloaded|timeout|reset)|Network connection lost|storage operation exceeded timeout/i.test(text)) return { status: 503, code: 'SERVICE_BUSY', message: 'Sistem şu anda yoğun. İşleminiz tamamlanmadı; birkaç saniye sonra tekrar deneyin.' };
  if (text === 'OFFICIAL_SCORING_RULE_REQUIRED') return { status: 400, code: text, message: 'Bu sınav için doğrulanmış resmî puanlama kuralı tanımlanmalıdır.' };
  if (text === 'UNRESOLVED_PARTICIPANT') return { status: 409, code: text, message: 'Bazı satırlar bir öğrenciyle eşleşmedi. Önce kontrol listesindeki satırları eşleştirin veya misafir olarak işaretleyin.' };
  const row = text.match(/^BOOKLET_REQUIRED_ROW_(\d+)$/);
  if (row) return { status: 400, code: 'BOOKLET_REQUIRED', message: `Satır ${row[1]} için kitapçık seçin.` };
  return { status: 500, code: 'SERVER_ERROR', message: 'Beklenmeyen bir sunucu hatası oluştu. İşlem tamamlanmadı; tekrar deneyin.' };
}

export function serverErrorResponse(error: unknown): Response {
  const c = classifyServerError(error);
  const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
  console.error(JSON.stringify({ event: 'request_failed', reference, code: c.code, error: error instanceof Error ? error.message : String(error) }));
  return json({ ok: false, error: { code: c.code, message: c.status === 500 ? `${c.message} (Hata kodu: ${reference})` : c.message, reference } }, c.status, { 'Cache-Control': 'no-store' });
}

/** Wraps a fetch handler so that API requests never end in an unhandled exception. */
export async function withErrorBoundary(request: Request, run: () => Promise<Response>): Promise<Response> {
  try { return await run(); }
  catch (error) {
    if (!new URL(request.url).pathname.startsWith('/api/')) throw error;
    return serverErrorResponse(error);
  }
}

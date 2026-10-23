import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorFromResponse } from '../src/api';
import { classifyServerError } from '../worker/lib/error-boundary';
import { evaluatedExam } from './helpers/exam-flow';

/** Readable errors end to end: the server never answers an API call with a bare error page, and the app turns any failure into a Turkish message. */
describe('readable errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('classifies server failures into clear messages', () => {
    expect(classifyServerError(new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit."))).toMatchObject({ status: 503, code: 'SERVICE_DAILY_LIMIT' });
    expect(classifyServerError(new Error('D1_ERROR: SQLITE_BUSY'))).toMatchObject({ status: 503, code: 'SERVICE_BUSY' });
    expect(classifyServerError(new Error('BOOKLET_REQUIRED_ROW_12'))).toMatchObject({ status: 400, message: 'Satır 12 için kitapçık seçin.' });
    expect(classifyServerError(new Error('UNRESOLVED_PARTICIPANT')).status).toBe(409);
    expect(classifyServerError(new Error('boom'))).toMatchObject({ status: 500, code: 'SERVER_ERROR' });
  });

  it('turns every response shape into a Turkish message', async () => {
    expect(errorFromResponse(400, { ok: false, error: { code: 'X', message: 'Açık mesaj' } })).toMatchObject({ code: 'X', message: 'Açık mesaj' });
    expect(errorFromResponse(400, { ok: false, error: 'Düz metin hata' }).message).toBe('Düz metin hata');
    expect(errorFromResponse(502, null).message).toContain('502');
    expect(errorFromResponse(401, null).code).toBe('UNAUTHENTICATED');
    expect(errorFromResponse(413, null).message).toContain('Dosya çok büyük');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(api('/api/x', { method: 'POST' })).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('İnternet') });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Error 1101</html>', { status: 500 })));
    const e = await api('/api/x').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError); expect(e.message).toContain('500');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(api('/api/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('answers with JSON when the database fails, in the outer routes and in the base app', async () => {
    const t = await evaluatedExam('direct');
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const cookie = (await import('../worker/lib/auth')).createSession;
    const c = (await cookie(t.env, 'teacher', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const real = t.env.DB.prepare;
    t.env.DB.prepare = () => { throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit."); };
    for (const path of ['/api/homework/x', '/api/auth/me', '/api/written-papers/x/report']) {
      const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { headers: { Cookie: c } }), t.env, { waitUntil() {} });
      expect(r.status, path).toBe(503);
      expect(await r.json()).toMatchObject({ ok: false, error: { code: 'SERVICE_DAILY_LIMIT' } });
    }
    t.env.DB.prepare = real;
  });
});

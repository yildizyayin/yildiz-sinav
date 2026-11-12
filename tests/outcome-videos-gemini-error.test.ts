import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { findOutcomeVideo } from '../worker/lib/outcome-videos';

/** Kazanım videosu: when Gemini refuses, the miss note says why (12 Nov 2026 — every answer read as "yanıt yok"). */
afterEach(() => vi.unstubAllGlobals());

describe('Gemini error note', () => {
  it('keeps the HTTP status and message of a failed Gemini call in the miss note', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    const o = t.db.prepare(`SELECT id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic', GEMINI_API_KEY: 'synthetic' });
    vi.stubGlobal('fetch', vi.fn(async (u: any) => {
      const url = String(u);
      if (url.includes('generativelanguage')) return new Response(JSON.stringify({ error: { code: 400, message: 'Invalid value at generation_config' } }), { status: 400 });
      if (url.includes('/search')) return new Response(JSON.stringify({ items: [{ id: { videoId: 'AAAAAAAAAAA' } }] }));
      return new Response(JSON.stringify({ items: [{ id: 'AAAAAAAAAAA', snippet: { title: 'Genel tekrar', description: '', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT12M' }, statistics: {}, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed' } }] }));
    }));
    const r = await findOutcomeVideo(t.env, o.id);
    expect(r).toMatchObject({ status: 'NOT_FOUND', reason: 'NO_SEGMENT' });
    expect(r.detail).toContain('AAAAAAAAAAA: HTTP 400');
    expect(r.detail).toContain('Invalid value at generation_config');
  });
});

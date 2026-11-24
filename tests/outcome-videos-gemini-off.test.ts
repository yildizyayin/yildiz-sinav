import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluatedExam } from './helpers/exam-flow';
import { findOutcomeVideo, geminiOn } from '../worker/lib/outcome-videos';

/** Owner 13 Nov 2026: "gemini işe yaramıyorsa kapat" — the outcome-video search runs without Gemini in every environment. */
afterEach(() => vi.unstubAllGlobals());

describe('outcome video search without Gemini', () => {
  it('is switched off in both deployed configurations', () => {
    for (const f of ['../wrangler.production.jsonc', '../wrangler.jsonc']) expect(readFileSync(new URL(f, import.meta.url), 'utf8')).toMatch(/"OUTCOME_VIDEO_GEMINI": "off"/);
    expect(geminiOn({ GEMINI_API_KEY: 'k', OUTCOME_VIDEO_GEMINI: 'off' } as any)).toBe(false);
  });

  it('never calls Gemini when off and still finds a chapter', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    const o = t.db.prepare(`SELECT id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    t.db.prepare(`UPDATE outcomes SET title='Üslü ifadelerle çarpma işlemi yapar',topic='Üslü İfadeler' WHERE id=?`).run(o.id);
    Object.assign(t.env, { YOUTUBE_API_KEY: 'k', GEMINI_API_KEY: 'k', OUTCOME_VIDEO_GEMINI: 'off' });
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: any) => {
      const url = String(u); urls.push(url);
      if (url.includes('/search')) return new Response(JSON.stringify({ items: [{ id: { videoId: 'AAAAAAAAAAA' } }] }));
      return new Response(JSON.stringify({ items: [{ id: 'AAAAAAAAAAA', snippet: { title: 'Üslü ifadeler', description: '00:00 Giriş\n02:10 Üslü ifadelerde çarpma\n05:40 Bölme', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT10M' }, statistics: {}, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed' } }] }));
    }));
    expect(await findOutcomeVideo(t.env, o.id)).toMatchObject({ status: 'FOUND', reason: 'CHAPTER' });
    expect(urls.some((u) => u.includes('generativelanguage'))).toBe(false);
  });
});

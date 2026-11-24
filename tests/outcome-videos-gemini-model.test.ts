import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { findOutcomeVideo, pickFlashModel, resetGeminiModel } from '../worker/lib/outcome-videos';

/** Kazanım videosu: Google retired gemini-2.5-flash for new keys (12 Nov 2026); the model comes from the key's list. */
afterEach(() => { vi.unstubAllGlobals(); resetGeminiModel(); });

describe('Gemini model choice', () => {
  it('takes the newest plain flash model that can generate', () => {
    const m = (name: string, gen = true) => ({ name: `models/${name}`, supportedGenerationMethods: gen ? ['generateContent'] : ['embedContent'] });
    expect(pickFlashModel([m('gemini-2.5-flash'), m('gemini-3.8-flash'), m('gemini-3.8-flash-lite'), m('gemini-4.0-pro'), m('gemini-9-flash', false)])).toBe('gemini-3.8-flash');
    expect(pickFlashModel([])).toBeNull();
  });

  it('switches to the model Google names when the old one is retired, and finds the segment', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    const o = t.db.prepare(`SELECT id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic', GEMINI_API_KEY: 'synthetic' });
    const used: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: any) => {
      const url = String(u);
      if (url.includes('/v1beta/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
      if (url.includes('generativelanguage')) {
        const model = url.match(/models\/([^:]+):/)![1]; used.push(model);
        if (model === 'gemini-flash-latest') return new Response(JSON.stringify({ error: { code: 404, message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash.' } }), { status: 404 });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ covers: true, suitable: true, confidence: 0.9, start: '1:00', end: '4:00' }) }] } }] }));
      }
      if (url.includes('/search')) return new Response(JSON.stringify({ items: [{ id: { videoId: 'AAAAAAAAAAA' } }] }));
      return new Response(JSON.stringify({ items: [{ id: 'AAAAAAAAAAA', snippet: { title: 'Genel tekrar', description: '', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT12M' }, statistics: {}, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed' } }] }));
    }));
    expect(await findOutcomeVideo(t.env, o.id)).toMatchObject({ status: 'FOUND', reason: 'GEMINI' });
    expect(used).toEqual(['gemini-flash-latest', 'gemini-3.8-flash']);
  });
});

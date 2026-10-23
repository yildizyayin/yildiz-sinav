import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { VOICE_DAILY_LIMIT } from '../worker/nibiru-voice-entry';

/** A066: paid voice stays off unless enabled, is capped per user and day, premium is not chosen by users, provider errors are visible. Synthetic data only. */
afterEach(() => vi.unstubAllGlobals());
const audio = () => new Response(new Uint8Array(400).fill(7), { headers: { 'content-type': 'audio/mpeg' } });

describe('A066 Nibiru voice', () => {
  it('refuses paid speech when not enabled, caps it per user per day and keeps premium for the Super Admin', async () => {
    const t = await evaluatedExam('direct');
    const off = await t.request('/api/nibiru/voice/speak', 'POST', { text: 'Merhaba' }, 'stuuser');
    expect(off.response.status).toBe(503); expect(off.data.error.code).toBe('VOICE_PAID_PROVIDERS_DISABLED');
    expect((t.db.prepare('SELECT count(*) c FROM nibiru_voice_daily_usage').get() as any).c).toBe(0);

    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => { calls.push(JSON.parse(init.body)); return audio(); }));
    Object.assign(t.env, { NIBIRU_PAID_VOICE_ENABLED: 'ON', OPENAI_TTS_API_KEY: 'synthetic' });
    const premiumAsked = await t.request('/api/nibiru/voice/speak', 'POST', { text: 'Merhaba', mode: 'PREMIUM' }, 'stuuser');
    expect(premiumAsked.response.status, premiumAsked.text).toBe(200);
    expect(calls[0].speed).toBe(0.96); // standard voice, not premium
    await t.request('/api/nibiru/voice/speak', 'POST', { text: 'Merhaba', mode: 'PREMIUM' });
    expect(calls[1].speed).toBe(0.93); // the Super Admin may use premium

    t.db.prepare(`UPDATE nibiru_voice_daily_usage SET count=? WHERE user_id='stuuser'`).run(VOICE_DAILY_LIMIT.SPEAK);
    const capped = await t.request('/api/nibiru/voice/speak', 'POST', { text: 'Merhaba' }, 'stuuser');
    expect(capped.response.status).toBe(429); expect(capped.data.error.code).toBe('VOICE_DAILY_LIMIT');
    expect(calls).toHaveLength(2); // no provider call after the cap
    t.db.prepare(`INSERT OR REPLACE INTO nibiru_voice_daily_usage(user_id,usage_date,kind,count) VALUES('admin',?, 'SPEAK',?)`).run(new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10), VOICE_DAILY_LIMIT.SPEAK);
    for (let k = 0; k < 3; k++) expect((await t.request('/api/nibiru/voice/speak', 'POST', { text: 'Merhaba' })).response.status).toBe(200); // Super Admin is not capped
  });

  it('shows a provider failure as a named error', async () => {
    const t = await evaluatedExam('direct');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"quota"}', { status: 429 })));
    Object.assign(t.env, { NIBIRU_PAID_VOICE_ENABLED: 'ON', OPENAI_TTS_API_KEY: 'synthetic' });
    const r = await t.request('/api/nibiru/voice/speak', 'POST', { text: 'Merhaba' }, 'stuuser');
    expect(r.response.status).toBe(502); expect(r.data.error.code).toBe('VOICE_PROVIDER_FAILED');
  });

  it('does not call a paid provider for the anonymous demo without an edge cache, and serves a cached copy', async () => {
    const t = await evaluatedExam('direct');
    const fetchSpy = vi.fn(async () => audio());
    vi.stubGlobal('fetch', fetchSpy);
    Object.assign(t.env, { NIBIRU_PAID_VOICE_ENABLED: 'ON', OPENAI_TTS_API_KEY: 'synthetic' });
    const entry = (await import('../worker/nibiru-voice-entry')).default as any;
    const demo = () => entry.fetch(new Request('https://app.anunex.com/api/public/nibiru/voice-demo?scenario=teacher'), t.env, { waitUntil() {} });
    vi.stubGlobal('caches', undefined);
    expect((await demo()).status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    const store = new Map<string, Response>();
    vi.stubGlobal('caches', { default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => { store.set(r.url, res); } } });
    expect((await demo()).status).toBe(200);
    expect((await demo()).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
